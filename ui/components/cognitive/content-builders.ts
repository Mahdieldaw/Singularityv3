import {
    MapperArtifact,
    ExploreAnalysis,
    ComparisonContent,
    ExplorationContent,
    DecisionTreeContent,
    DirectAnswerContent,
    GraphTopology,
    GraphEdge
} from "../../../shared/contract";

const MODEL_NAMES = ["gpt", "claude", "gemini", "qwen", "deepseek", "perplexity"];

const getModelNames = (indices: number[]): string[] =>
    indices.map((i) => MODEL_NAMES[i] || `model-${i}`);

export type ShowcaseItemType = "consensus" | "supplemental" | "frame_challenger";

export interface SelectableShowcaseItem {
    id: string;
    text: string;
    type: ShowcaseItemType;
    detail?: string;
    dimension?: string;
    applies_when?: string;
    source?: string;
    challenges?: string;
    graphNodeId?: string;
    graphSupportCount?: number;
    graphSupporters?: Array<number | string>;
    graphTheme?: string;
}

export interface ProcessedShowcase {
    frameChallengers: Array<SelectableShowcaseItem>;
    bifurcations: Array<{
        left: SelectableShowcaseItem;
        right: SelectableShowcaseItem;
        axis?: string;
        edge?: GraphEdge;
    }>;
    bundles: Array<{
        items: SelectableShowcaseItem[];
        edges: GraphEdge[];
    }>;
    independentAnchors: Array<SelectableShowcaseItem>;
    ghost: string | null;
}

const normalizeForMatch = (text: string): string =>
    String(text || "")
        .toLowerCase()
        .replace(/[`"'’“”]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const tokens = (text: string): string[] => {
    const t = normalizeForMatch(text);
    if (!t) return [];
    return t
        .split(" ")
        .map((x) => x.trim())
        .filter((x) => x.length >= 3);
};

const jaccard = (a: string[], b: string[]): number => {
    if (a.length === 0 && b.length === 0) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    const setA = new Set(a);
    const setB = new Set(b);
    let inter = 0;
    for (const t of setA) {
        if (setB.has(t)) inter += 1;
    }
    const union = setA.size + setB.size - inter;
    return union <= 0 ? 0 : inter / union;
};

const textSimilarity = (a: string, b: string): number => {
    const na = normalizeForMatch(a);
    const nb = normalizeForMatch(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.92;
    return jaccard(tokens(na), tokens(nb));
};

const normalizeEdgeType = (t: string): string => String(t || "").toLowerCase().trim();

const isConflictEdge = (e: GraphEdge): boolean => {
    const t = normalizeEdgeType(e.type);
    return t === "conflicts" || t === "bifurcation" || t.includes("conflict") || t.includes("bifurc");
};

const isPositiveEdge = (e: GraphEdge): boolean => {
    const t = normalizeEdgeType(e.type);
    return t === "complements" || t === "prerequisite" || t.includes("complement") || t.includes("prereq");
};

const sortByPrerequisites = (
    items: SelectableShowcaseItem[],
    edges: GraphEdge[]
): SelectableShowcaseItem[] => {
    const nodes = items.map((i) => i.graphNodeId).filter(Boolean) as string[];
    const nodeSet = new Set(nodes);
    const prereqEdges = edges.filter((e) => normalizeEdgeType(e.type) === "prerequisite");

    const indegree = new Map<string, number>();
    const outgoing = new Map<string, Set<string>>();
    for (const n of nodes) {
        indegree.set(n, 0);
        outgoing.set(n, new Set());
    }

    for (const e of prereqEdges) {
        if (!nodeSet.has(e.source) || !nodeSet.has(e.target)) continue;
        const out = outgoing.get(e.source);
        if (!out) continue;
        if (!out.has(e.target)) {
            out.add(e.target);
            indegree.set(e.target, (indegree.get(e.target) || 0) + 1);
        }
    }

    const queue: string[] = [];
    for (const [n, deg] of indegree.entries()) {
        if (deg === 0) queue.push(n);
    }

    const ordered: string[] = [];
    while (queue.length > 0) {
        const n = queue.shift()!;
        ordered.push(n);
        const outs = outgoing.get(n);
        if (!outs) continue;
        for (const m of outs) {
            indegree.set(m, (indegree.get(m) || 0) - 1);
            if ((indegree.get(m) || 0) === 0) queue.push(m);
        }
    }

    if (ordered.length !== nodes.length) {
        return items;
    }

    const index = new Map<string, number>();
    ordered.forEach((n, i) => index.set(n, i));
    return [...items].sort((a, b) => {
        const ia = a.graphNodeId ? index.get(a.graphNodeId) : undefined;
        const ib = b.graphNodeId ? index.get(b.graphNodeId) : undefined;
        if (ia == null && ib == null) return 0;
        if (ia == null) return 1;
        if (ib == null) return -1;
        return ia - ib;
    });
};

export function processArtifactForShowcase(
    artifact: MapperArtifact,
    graphTopology?: GraphTopology | null
): ProcessedShowcase {
    const nodes = Array.isArray(graphTopology?.nodes) ? graphTopology!.nodes : [];
    const edges = Array.isArray(graphTopology?.edges) ? graphTopology!.edges : [];

    const items: SelectableShowcaseItem[] = [];

    (artifact?.consensus?.claims || []).forEach((claim, i) => {
        items.push({
            id: `consensus-${i}`,
            text: claim.text,
            type: "consensus",
            dimension: claim.dimension,
            applies_when: claim.applies_when,
            graphSupportCount: claim.support_count,
            graphSupporters: claim.supporters,
        });
    });

    (artifact?.outliers || []).forEach((o, i) => {
        items.push({
            id: `outlier-${i}`,
            text: o.insight,
            type: o.type === "frame_challenger" ? "frame_challenger" : "supplemental",
            dimension: o.dimension,
            applies_when: o.applies_when,
            source: o.source,
            challenges: o.challenges,
        });
    });

    if (nodes.length > 0) {
        for (const item of items) {
            let best: (typeof nodes)[number] | undefined;
            let bestScore = 0;
            for (const n of nodes) {
                let score = textSimilarity(n.label, item.text);
                if (item.type === "consensus" && typeof item.graphSupportCount === "number") {
                    if (n.support_count === item.graphSupportCount) score += 0.08;
                }
                if (score > bestScore) {
                    bestScore = score;
                    best = n;
                }
            }
            if (best && bestScore >= 0.55) {
                item.graphNodeId = best.id;
                item.graphSupportCount = best.support_count ?? item.graphSupportCount;
                item.graphSupporters = best.supporters ?? item.graphSupporters;
                item.graphTheme = best.theme;
            }
        }
    }

    const frameChallengers = items.filter((i) => i.type === "frame_challenger");
    const remaining = items.filter((i) => i.type !== "frame_challenger");

    const byNode = new Map<string, SelectableShowcaseItem>();
    for (const it of remaining) {
        if (it.graphNodeId) byNode.set(it.graphNodeId, it);
    }

    const bifurcations: ProcessedShowcase["bifurcations"] = [];
    const usedInConflict = new Set<string>();
    const seenPairs = new Set<string>();

    for (const e of edges.filter(isConflictEdge)) {
        const left = byNode.get(e.source);
        const right = byNode.get(e.target);
        if (!left || !right) continue;
        const key = [left.id, right.id].sort().join("|");
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        bifurcations.push({ left, right, axis: e.reason || undefined, edge: e });
        usedInConflict.add(left.id);
        usedInConflict.add(right.id);
    }

    const positiveEdges = edges.filter(isPositiveEdge);
    const candidates = remaining.filter((i) => !usedInConflict.has(i.id));
    const candidatesByNode = new Map<string, SelectableShowcaseItem>();
    for (const it of candidates) {
        if (it.graphNodeId) candidatesByNode.set(it.graphNodeId, it);
    }

    const candidateNodeIds = new Set(candidatesByNode.keys());
    const adjacency = new Map<string, Set<string>>();
    for (const nodeId of candidateNodeIds) adjacency.set(nodeId, new Set());
    for (const e of positiveEdges) {
        if (!candidateNodeIds.has(e.source) || !candidateNodeIds.has(e.target)) continue;
        adjacency.get(e.source)!.add(e.target);
        adjacency.get(e.target)!.add(e.source);
    }

    const bundles: ProcessedShowcase["bundles"] = [];
    const visited = new Set<string>();

    for (const start of candidateNodeIds) {
        if (visited.has(start)) continue;
        const queue = [start];
        const componentNodeIds: string[] = [];
        while (queue.length > 0) {
            const cur = queue.shift()!;
            if (visited.has(cur)) continue;
            visited.add(cur);
            componentNodeIds.push(cur);
            const neigh = adjacency.get(cur);
            if (!neigh) continue;
            for (const n of neigh) {
                if (!visited.has(n)) queue.push(n);
            }
        }

        if (componentNodeIds.length <= 1) continue;

        const componentSet = new Set(componentNodeIds);
        const componentItems = componentNodeIds
            .map((nid) => candidatesByNode.get(nid))
            .filter(Boolean) as SelectableShowcaseItem[];

        const componentEdges = positiveEdges.filter(
            (e) => componentSet.has(e.source) && componentSet.has(e.target)
        );

        const sortedItems = sortByPrerequisites(componentItems, componentEdges);
        if (sortedItems.length > 1) {
            bundles.push({ items: sortedItems, edges: componentEdges });
        }
    }

    const inBundle = new Set<string>();
    for (const b of bundles) {
        for (const it of b.items) inBundle.add(it.id);
    }

    const independentAnchors = remaining.filter(
        (i) => !usedInConflict.has(i.id) && !inBundle.has(i.id)
    );

    return {
        frameChallengers,
        bifurcations,
        bundles,
        independentAnchors,
        ghost: artifact?.ghost ?? null,
    };
}

export function buildComparisonContent(
    artifact: MapperArtifact,
    _analysis: ExploreAnalysis
): ComparisonContent {
    const dimensions = (artifact.dimensions_found || []).map((dimName) => {
        const dimClaims = artifact.consensus.claims.filter((c) => c.dimension === dimName);
        const dimOutliers = artifact.outliers.filter((o) => o.dimension === dimName);

        const winner =
            dimClaims.length > 0
                ? dimClaims.reduce((best, c) => (c.support_count > best.support_count ? c : best))
                : null;

        const sources = winner
            ? getModelNames(winner.supporters)
            : dimOutliers.length > 0
                ? [dimOutliers[0].source]
                : [];

        const tension = artifact.tensions?.find(
            (t) =>
                t.axis.toLowerCase().includes(dimName.toLowerCase()) ||
                t.between.some((b) => b.toLowerCase().includes(dimName.toLowerCase()))
        );

        const tradeoff = tension ? `${tension.between[0]} vs ${tension.between[1]}` : winner?.applies_when || "";

        return {
            name: dimName.replace(/_/g, " "),
            winner: winner?.text || dimOutliers[0]?.insight || "No clear winner",
            sources,
            tradeoff
        };
    });

    const approaches = [...new Set(dimensions.map((d) => d.winner))].slice(0, 4);
    const dimNames = dimensions.map((d) => d.name);

    const scores = dimNames.map((dimName) => {
        const dim = dimensions.find((d) => d.name === dimName);
        return approaches.map((approach) => (approach === dim?.winner ? 8 : 5));
    });

    return {
        dimensions,
        matrix: {
            approaches,
            dimensions: dimNames,
            scores
        }
    };
}

export function buildExplorationContent(
    artifact: MapperArtifact,
    _analysis: ExploreAnalysis
): ExplorationContent {
    const paradigms = artifact.outliers
        .filter((o) => o.type === "frame_challenger")
        .map((o) => ({
            name: o.insight.slice(0, 50) + (o.insight.length > 50 ? "..." : ""),
            source: o.source,
            core_idea: o.insight,
            best_for: o.applies_when || "Consider when standard approach doesn't fit"
        }));

    if (paradigms.length < 2 && artifact.consensus.claims.length > 0) {
        const topClaim = artifact.consensus.claims[0];
        paradigms.unshift({
            name: "Consensus View",
            source: `${topClaim.support_count} models`,
            core_idea: topClaim.text,
            best_for: topClaim.applies_when || "General recommendation"
        });
    }

    const common_thread =
        artifact.consensus.claims
            .filter((c) => c.support_count >= 4)
            .map((c) => c.text)
            .slice(0, 2)
            .join("; ") || undefined;

    return {
        paradigms,
        common_thread,
        ghost: artifact.ghost || undefined
    };
}

export function buildDecisionTreeContent(
    artifact: MapperArtifact,
    _analysis: ExploreAnalysis
): DecisionTreeContent {
    const defaultClaim = artifact.consensus.claims[0];
    const default_path = defaultClaim?.text || "No clear default recommendation";

    const conditions = artifact.outliers
        .filter((o) => o.applies_when)
        .map((o) => ({
            condition: o.applies_when!,
            path: o.insight,
            reasoning: o.challenges || `Alternative to ${o.dimension || "default"} approach`,
            source: o.source
        }));

    artifact.consensus.claims
        .filter((c) => c.applies_when && c !== defaultClaim)
        .forEach((c) => {
            conditions.push({
                condition: c.applies_when!,
                path: c.text,
                reasoning: `Supported by ${c.support_count} models`,
                source: `${c.support_count} models`
            });
        });

    const challenger = artifact.outliers.find((o) => o.type === "frame_challenger");
    const frame_challenger = challenger
        ? {
            position: challenger.insight,
            source: challenger.source,
            consider_if:
                challenger.applies_when || challenger.challenges || "Standard approach doesn't fit your situation"
        }
        : undefined;

    return {
        default_path,
        conditions,
        frame_challenger
    };
}

export function buildDirectAnswerContent(
    artifact: MapperArtifact,
    _analysis: ExploreAnalysis
): DirectAnswerContent {
    const answer = artifact.consensus.claims[0]?.text || "No clear consensus reached";

    const additional_context = artifact.outliers
        .filter((o) => o.type === "supplemental")
        .map((o) => ({
            text: o.insight,
            source: o.source
        }));

    return {
        answer,
        additional_context
    };
}
