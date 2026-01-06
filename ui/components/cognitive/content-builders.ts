import {
    MapperArtifact,
    GraphTopology,
    GraphEdge
} from "../../../shared/contract";



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
    unifiedSource?: UnifiedOption["source"];
    matchConfidence?: UnifiedOption["matchConfidence"];
    inventoryIndex?: number;
    artifactOriginalId?: string;
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

export interface ParsedInventoryItem {
    index: number;
    label: string;
    summary: string;
    citations: number[];
    rawText: string;
}

export interface UnifiedOption {
    id: string;
    label: string;
    summary: string;
    citations: number[];
    source: "matched" | "inventory_only" | "artifact_only";
    inventoryIndex?: number;
    artifactData?: {
        type: "consensus" | "supplemental" | "frame_challenger";
        originalId: string;
        dimension?: string;
        applies_when?: string;
        support_count?: number;
        supporters?: number[];
        source?: string;
        challenges?: string;
    };
    matchConfidence: "exact" | "high" | "medium" | "low" | "none";
}

export interface ReconciliationResult {
    options: UnifiedOption[];
    stats: {
        totalOptions: number;
        matched: number;
        inventoryOnly: number;
        artifactOnly: number;
        matchQuality: "good" | "partial" | "poor";
    };
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

const parseCitationNumbers = (text: string): number[] => {
    const out: number[] = [];
    const t = String(text || "");

    const bracketMatches = t.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g);
    for (const m of bracketMatches) {
        const nums = String(m[1] || "")
            .split(/\s*,\s*/)
            .map((x) => Number.parseInt(x, 10))
            .filter((n) => Number.isFinite(n) && n > 0);
        out.push(...nums);
    }

    const modelParen = t.matchAll(/\(\s*Model(?:s)?\s*([\d\s,]+)\)/gi);
    for (const m of modelParen) {
        const nums = String(m[1] || "")
            .split(/\s*,\s*/)
            .map((x) => Number.parseInt(x, 10))
            .filter((n) => Number.isFinite(n) && n > 0);
        out.push(...nums);
    }

    const unique = Array.from(new Set(out));
    unique.sort((a, b) => a - b);
    return unique;
};

const stripCitationSyntax = (text: string): string => {
    return String(text || "")
        .replace(/\s*\[(?:\d+(?:\s*,\s*\d+)*)\]\s*/g, " ")
        .replace(/\s*\(\s*Model(?:s)?\s*[\d\s,]+\)\s*/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
};

const isThemeHeaderLine = (line: string): boolean => {
    const t = String(line || "").trim();
    if (!t) return false;
    if (/^Theme:\s*/i.test(t)) return true;
    if (/^#+\s+/.test(t)) return true;
    if (/^[\u{1F300}-\u{1FAD6}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(t)) return true;
    return false;
};

export function parseOptionsInventory(text: string | null | undefined): ParsedInventoryItem[] {
    if (!text || typeof text !== "string") return [];

    const lines = String(text).split("\n");
    const items: ParsedInventoryItem[] = [];
    let itemIndex = 0;

    let current: {
        label: string;
        summaryParts: string[];
        citations: number[];
        rawLines: string[];
    } | null = null;

    const flush = () => {
        if (!current) return;
        const label = String(current.label || "").trim();
        const summary = stripCitationSyntax(current.summaryParts.join(" "));
        const citations = Array.from(new Set(current.citations));
        citations.sort((a, b) => a - b);
        if (label) {
            items.push({
                index: itemIndex,
                label,
                summary,
                citations,
                rawText: current.rawLines.join("\n"),
            });
        }
        current = null;
    };

    const itemLineMatch = (line: string): { label: string; rest: string } | null => {
        const t = String(line || "").trim();
        if (!t) return null;
        if (isThemeHeaderLine(t)) return null;
        const m = t.match(/^\s*(?:[-*•]|\d+[.)])?\s*(?:\*\*([^*]+)\*\*|([^:]{3,}?))\s*:\s*(.+)$/);
        if (!m) return null;
        const label = String(m[1] || m[2] || "").trim().replace(/^\*\*|\*\*$/g, "");
        const rest = String(m[3] || "").trim();
        if (!label || !rest) return null;
        return { label, rest };
    };

    for (const rawLine of lines) {
        const line = String(rawLine || "");
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (isThemeHeaderLine(trimmed)) {
            flush();
            continue;
        }

        const m = itemLineMatch(line);
        if (m) {
            flush();
            itemIndex += 1;
            current = {
                label: m.label,
                summaryParts: [m.rest],
                citations: parseCitationNumbers(m.rest),
                rawLines: [line],
            };
            continue;
        }

        if (current) {
            current.summaryParts.push(trimmed.replace(/^\s*[-*•]\s+/, ""));
            current.citations.push(...parseCitationNumbers(trimmed));
            current.rawLines.push(line);
        }
    }

    flush();
    return items;
}

type InventoryMatch = {
    kind: "consensus" | "outlier";
    index: number;
    confidence: UnifiedOption["matchConfidence"];
    score: number;
};

const confidenceFromScore = (score: number): UnifiedOption["matchConfidence"] => {
    if (score >= 0.98) return "exact";
    if (score >= 0.85) return "high";
    if (score >= 0.72) return "medium";
    if (score >= 0.55) return "low";
    return "none";
};

export function matchInventoryToArtifact(
    inventory: ParsedInventoryItem[],
    artifact: MapperArtifact | null
): Map<number, InventoryMatch> {
    const matches = new Map<number, InventoryMatch>();
    if (!artifact) return matches;
    if (!Array.isArray(inventory) || inventory.length === 0) return matches;

    const candidates: Array<{ kind: "consensus" | "outlier"; index: number; title: string; full: string }> = [];
    (artifact.claims || []).forEach((c, i) => {
        const kind = (c.supporters?.length || 0) >= 2 ? "consensus" : "outlier";
        candidates.push({ kind, index: i, title: c.label, full: c.text });
    });

    const pairs: Array<{ invIndex: number; candKey: string; match: InventoryMatch }> = [];
    for (const inv of inventory) {
        const invText = `${inv.label} ${inv.summary}`.trim();
        for (const cand of candidates) {
            const score = Math.max(
                textSimilarity(inv.label, cand.title),
                textSimilarity(inv.label, cand.full),
                textSimilarity(invText, cand.full) * 0.95
            );
            if (score < 0.55) continue;
            const candKey = `${cand.kind}-${cand.index}`;
            pairs.push({
                invIndex: inv.index,
                candKey,
                match: {
                    kind: cand.kind,
                    index: cand.index,
                    confidence: confidenceFromScore(score),
                    score,
                },
            });
        }
    }

    pairs.sort((a, b) => b.match.score - a.match.score);

    const usedInv = new Set<number>();
    const usedCand = new Set<string>();

    for (const p of pairs) {
        if (usedInv.has(p.invIndex)) continue;
        if (usedCand.has(p.candKey)) continue;
        usedInv.add(p.invIndex);
        usedCand.add(p.candKey);
        matches.set(p.invIndex, p.match);
    }

    return matches;
}

export function reconcileOptions(
    optionsInventoryText: string | null | undefined,
    artifact: MapperArtifact | null
): ReconciliationResult {
    const parsedInventory = parseOptionsInventory(optionsInventoryText);
    const matches = matchInventoryToArtifact(parsedInventory, artifact);

    const options: UnifiedOption[] = [];
    const matchedArtifactIds = new Set<string>();

    for (const item of parsedInventory) {
        const match = matches.get(item.index);
        if (match && artifact && artifact.claims[match.index]) {
            const claim = artifact.claims[match.index];
            const artifactId = claim.id;
            matchedArtifactIds.add(artifactId);

            let artifactData: UnifiedOption["artifactData"];
            if (match.kind === "consensus") {
                artifactData = {
                    type: "consensus",
                    originalId: artifactId,
                    dimension: undefined,
                    applies_when: claim.type === 'conditional' ? "conditional" : undefined,
                    support_count: claim.supporters?.length,
                    supporters: claim.supporters,
                };
            } else {
                artifactData = {
                    type: claim.role === "challenger" ? "frame_challenger" : "supplemental",
                    originalId: artifactId,
                    dimension: undefined,
                    applies_when: claim.type === 'conditional' ? "conditional" : undefined,
                    source: undefined,
                    challenges: claim.challenges || undefined,
                };
            }

            const supportersFallback = artifactData?.supporters || [];
            const outlierIndexFallback: number[] = [];

            options.push({
                id: `unified-${item.index}`,
                label: item.label,
                summary: item.summary,
                citations: item.citations.length > 0 ? item.citations : (supportersFallback.length > 0 ? supportersFallback : outlierIndexFallback),
                source: "matched",
                inventoryIndex: item.index,
                artifactData,
                matchConfidence: match.confidence,
            });
        } else {
            options.push({
                id: `unified-${item.index}`,
                label: item.label,
                summary: item.summary,
                citations: item.citations,
                source: "inventory_only",
                inventoryIndex: item.index,
                matchConfidence: "none",
            });
        }
    }

    if (artifact) {
        (artifact.claims || []).forEach((claim) => {
            const id = claim.id;
            if (matchedArtifactIds.has(id)) return;

            const isConsensus = (claim.supporters?.length || 0) >= 2;
            const type = isConsensus ? "consensus" : (claim.role === "challenger" ? "frame_challenger" : "supplemental");

            options.push({
                id: `unified-artifact-${id}`,
                label: claim.label,
                summary: claim.text,
                citations: claim.supporters || [],
                source: "artifact_only",
                artifactData: {
                    type: type as any,
                    originalId: id,
                    dimension: undefined,
                    applies_when: claim.type === 'conditional' ? "conditional" : undefined,
                    support_count: claim.supporters?.length,
                    supporters: claim.supporters,
                    challenges: claim.challenges || undefined
                },
                matchConfidence: "none",
            });
        });
    }

    const matched = options.filter((o) => o.source === "matched").length;
    const inventoryOnly = options.filter((o) => o.source === "inventory_only").length;
    const artifactOnly = options.filter((o) => o.source === "artifact_only").length;
    const invDenom = Math.max(1, parsedInventory.length);
    const matchRatio = matched / invDenom;
    const matchQuality: ReconciliationResult["stats"]["matchQuality"] =
        matchRatio >= 0.8 ? "good" : matchRatio >= 0.4 ? "partial" : "poor";

    return {
        options,
        stats: {
            totalOptions: options.length,
            matched,
            inventoryOnly,
            artifactOnly,
            matchQuality,
        },
    };
}

export function unifiedOptionsToShowcaseItems(reconciliation: ReconciliationResult): SelectableShowcaseItem[] {
    return (reconciliation?.options || []).map((opt) => {
        let type: ShowcaseItemType = "supplemental";
        if (opt.artifactData?.type === "consensus") type = "consensus";
        else if (opt.artifactData?.type === "frame_challenger") type = "frame_challenger";
        else if (opt.artifactData?.type === "supplemental") type = "supplemental";
        else if (opt.source === "inventory_only") type = "supplemental";

        const item: SelectableShowcaseItem = {
            id: opt.id,
            text: opt.label,
            type,
            detail: opt.summary || undefined,
            dimension: opt.artifactData?.dimension,
            applies_when: opt.artifactData?.applies_when,
            source: opt.artifactData?.source,
            challenges: opt.artifactData?.challenges,
            unifiedSource: opt.source,
            matchConfidence: opt.matchConfidence,
            inventoryIndex: opt.inventoryIndex,
            artifactOriginalId: opt.artifactData?.originalId,
        };

        if (opt.artifactData?.type === "consensus") {
            item.graphSupportCount = opt.artifactData.support_count;
            item.graphSupporters = opt.artifactData.supporters;
        } else if (Array.isArray(opt.citations) && opt.citations.length > 0) {
            item.graphSupporters = opt.citations;
        }

        return item;
    });
}

const isConflictEdge = (e: GraphEdge): boolean => {
    const t = normalizeEdgeType(e.type || "");
    return t === "conflicts" || t === "bifurcation" || t.includes("conflict") || t.includes("bifurc");
};

const isPositiveEdge = (e: GraphEdge): boolean => {
    const t = normalizeEdgeType(e.type || "");
    return t === "complements" || t === "prerequisite" || t.includes("complement") || t.includes("prereq");
};

const sortByPrerequisites = (
    items: SelectableShowcaseItem[],
    edges: GraphEdge[]
): SelectableShowcaseItem[] => {
    const nodes = items.map((i) => i.graphNodeId).filter(Boolean) as string[];
    const nodeSet = new Set(nodes);
    const prereqEdges = edges.filter((e) => normalizeEdgeType(e.type || "") === "prerequisite");

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
    const items: SelectableShowcaseItem[] = [];

    (artifact?.claims || []).forEach((claim) => {
        const isConsensus = (claim.supporters?.length || 0) >= 2;
        items.push({
            id: claim.id,
            text: claim.label,
            detail: claim.text,
            type: isConsensus ? "consensus" : (claim.role === "challenger" ? "frame_challenger" : "supplemental"),
            dimension: undefined,
            applies_when: claim.type === 'conditional' ? "conditional" : undefined,
            graphSupportCount: claim.supporters?.length,
            graphSupporters: claim.supporters,
            challenges: claim.challenges || undefined,
        });
    });

    return processShowcaseItems(items, graphTopology, artifact?.ghosts?.[0] ?? null);
}

export function processShowcaseItems(
    items: SelectableShowcaseItem[],
    graphTopology?: GraphTopology | null,
    ghost: string | null = null
): ProcessedShowcase {
    const nodes = Array.isArray(graphTopology?.nodes) ? graphTopology!.nodes : [];
    const edges = Array.isArray(graphTopology?.edges) ? graphTopology!.edges : [];

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
        ghost,
    };
}

