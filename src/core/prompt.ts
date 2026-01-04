import { MapperArtifact, Claim, Edge, ProblemStructure } from "../../shared/contract";

const DEBUG_PROMPT_SERVICE = false;
const promptDbg = (...args: any[]) => {
    if (DEBUG_PROMPT_SERVICE) console.debug("[PromptService]", ...args);
};

const DEBUG_STRUCTURAL_ANALYSIS = false;
const structuralDbg = (...args: any[]) => {
    if (DEBUG_STRUCTURAL_ANALYSIS) console.debug("[PromptService:structural]", ...args);
};

// ═══════════════════════════════════════════════════════════════════════════
// V3.1 TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

type CoreRatios = {
    concentration: number;      // Max support / modelCount
    alignment: number;          // Reinforcing edges between top claims / total
    tension: number;            // Conflict + tradeoff edges / total edges
    fragmentation: number;      // (components - 1) / (claims - 1)
    depth: number;              // Longest chain / claim count
};

type GraphAnalysis = {
    componentCount: number;
    components: string[][];
    longestChain: string[];
    chainCount: number;
    hubClaim: string | null;
    hubDominance: number;
};

type StructuralAnalysis = {
    edges: Edge[];
    landscape: {
        dominantType: Claim["type"];
        typeDistribution: Record<string, number>;
        dominantRole: Claim["role"];
        roleDistribution: Record<string, number>;
        claimCount: number;
        modelCount: number;
        convergenceRatio: number;
    };
    claimsWithLeverage: ClaimWithLeverage[];
    patterns: {
        leverageInversions: LeverageInversion[];
        cascadeRisks: CascadeRisk[];
        conflicts: ConflictPair[];
        tradeoffs: TradeoffPair[];
        convergencePoints: ConvergencePoint[];
        isolatedClaims: string[];
    };
    ghostAnalysis: {
        count: number;
        mayExtendChallenger: boolean;
        challengerIds: string[];
    };
    // V3.1 additions
    graph: GraphAnalysis;
    ratios: CoreRatios;
};

type ClaimWithLeverage = {
    id: string;
    label: string;
    supporters: number[];
    type: string;
    role: string;
    // Core computed ratios (always computed)
    supportRatio: number;
    leverage: number;
    leverageFactors: {
        supportWeight: number;
        roleWeight: number;
        connectivityWeight: number;
        positionWeight: number;
    };
    keystoneScore: number;
    evidenceGapScore: number;
    supportSkew: number;
    // Percentile-based flags (computed from distribution)
    isHighSupport: boolean;
    isLeverageInversion: boolean;
    isKeystone: boolean;
    isEvidenceGap: boolean;
    isOutlier: boolean;
    // Structural flags (computed from edges)
    isContested: boolean;
    isConditional: boolean;
    isChallenger: boolean;
    isIsolated: boolean;
    // Chain position
    inDegree: number;
    outDegree: number;
    chainDepth: number;
    isChainRoot: boolean;
    isChainTerminal: boolean;
};

type LeverageInversion = {
    claimId: string;
    claimLabel: string;
    supporterCount: number;
    reason: "challenger_prerequisite_to_consensus" | "singular_foundation" | "high_connectivity_low_support";
    affectedClaims: string[];
};

type CascadeRisk = {
    sourceId: string;
    sourceLabel: string;
    dependentIds: string[];
    dependentLabels: string[];
    depth: number;
};

type ConflictPair = {
    claimA: { id: string; label: string; supporterCount: number };
    claimB: { id: string; label: string; supporterCount: number };
    isBothConsensus: boolean;
};

type TradeoffPair = {
    claimA: { id: string; label: string; supporterCount: number };
    claimB: { id: string; label: string; supporterCount: number };
    symmetry: "both_consensus" | "both_singular" | "asymmetric";
};

type ConvergencePoint = {
    targetId: string;
    targetLabel: string;
    sourceIds: string[];
    sourceLabels: string[];
    edgeType: "prerequisite" | "supports";
};

type ModeContext = {
    problemStructure: ProblemStructure;
    structuralFraming: string;
    typeFraming: string;
    structuralObservations: string[];
    leverageNotes: string | null;
    cascadeWarnings: string | null;
    conflictNotes: string | null;
    tradeoffNotes: string | null;
    ghostNotes: string | null;
};

// ═══════════════════════════════════════════════════════════════════════════
// V3.1 PERCENTILE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns the threshold value at a given percentile (0-1) for an array of numbers.
 * percentile 0.7 means "top 30%" threshold
 */
const getPercentileThreshold = (values: number[], percentile: number): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile);
    return sorted[Math.min(index, sorted.length - 1)];
};

/**
 * Returns count for "top N%" - minimum 1 claim
 */
const getTopNCount = (total: number, ratio: number): number => {
    return Math.max(1, Math.ceil(total * ratio));
};

/**
 * Check if value is in top N% of the distribution
 */
const isInTopPercentile = (value: number, allValues: number[], percentile: number): boolean => {
    const threshold = getPercentileThreshold(allValues, 1 - percentile);
    return value >= threshold;
};

/**
 * Check if value is in bottom N% of the distribution
 */
const isInBottomPercentile = (value: number, allValues: number[], percentile: number): boolean => {
    const threshold = getPercentileThreshold(allValues, percentile);
    return value <= threshold;
};

// ═══════════════════════════════════════════════════════════════════════════
// V3.1 GRAPH ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute connected components using DFS (treat edges as undirected for connectivity)
 */
const computeConnectedComponents = (claimIds: string[], edges: Edge[]): { count: number; components: string[][] } => {
    const adjacency = new Map<string, Set<string>>();
    claimIds.forEach(id => adjacency.set(id, new Set()));

    edges.forEach(e => {
        adjacency.get(e.from)?.add(e.to);
        adjacency.get(e.to)?.add(e.from);
    });

    const visited = new Set<string>();
    const components: string[][] = [];

    const dfs = (id: string, component: string[]) => {
        if (visited.has(id)) return;
        visited.add(id);
        component.push(id);
        adjacency.get(id)?.forEach(neighbor => dfs(neighbor, component));
    };

    claimIds.forEach(id => {
        if (!visited.has(id)) {
            const component: string[] = [];
            dfs(id, component);
            components.push(component);
        }
    });

    return { count: components.length, components };
};

/**
 * Find the longest prerequisite chain via DFS
 */
const computeLongestChain = (claimIds: string[], edges: Edge[]): string[] => {
    const prereqEdges = edges.filter(e => e.type === "prerequisite");
    const prereqChildren = new Map<string, string[]>();
    const hasIncomingPrereq = new Set<string>();

    claimIds.forEach(id => prereqChildren.set(id, []));
    prereqEdges.forEach(e => {
        prereqChildren.get(e.from)?.push(e.to);
        hasIncomingPrereq.add(e.to);
    });

    // Chain roots: no incoming prerequisites
    const roots = claimIds.filter(id => !hasIncomingPrereq.has(id));

    let longestChain: string[] = [];

    const findChain = (id: string, chain: string[]): string[] => {
        const newChain = [...chain, id];
        const children = prereqChildren.get(id) ?? [];

        if (children.length === 0) return newChain;

        let best = newChain;
        children.forEach(child => {
            if (!chain.includes(child)) { // Prevent cycles
                const candidate = findChain(child, newChain);
                if (candidate.length > best.length) best = candidate;
            }
        });
        return best;
    };

    // Start from roots
    roots.forEach(root => {
        const chain = findChain(root, []);
        if (chain.length > longestChain.length) longestChain = chain;
    });

    // If no roots (cycle), try all claims
    if (longestChain.length === 0) {
        claimIds.forEach(id => {
            const chain = findChain(id, []);
            if (chain.length > longestChain.length) longestChain = chain;
        });
    }

    return longestChain;
};

/**
 * Analyze graph topology
 */
const analyzeGraph = (claimIds: string[], edges: Edge[]): GraphAnalysis => {
    const { count: componentCount, components } = computeConnectedComponents(claimIds, edges);
    const longestChain = computeLongestChain(claimIds, edges);

    // Count chains (roots with at least one outgoing prerequisite)
    const prereqEdges = edges.filter(e => e.type === "prerequisite");
    const hasIncomingPrereq = new Set<string>();
    const hasOutgoingPrereq = new Set<string>();
    prereqEdges.forEach(e => {
        hasIncomingPrereq.add(e.to);
        hasOutgoingPrereq.add(e.from);
    });
    const chainCount = claimIds.filter(id =>
        !hasIncomingPrereq.has(id) && hasOutgoingPrereq.has(id)
    ).length;

    // Hub detection: claim with highest outDegree (supports + prerequisites)
    const outDegree = new Map<string, number>();
    claimIds.forEach(id => outDegree.set(id, 0));
    edges.forEach(e => {
        if (e.type === "supports" || e.type === "prerequisite") {
            outDegree.set(e.from, (outDegree.get(e.from) || 0) + 1);
        }
    });

    const sortedByOutDegree = [...outDegree.entries()].sort((a, b) => b[1] - a[1]);
    const [topId, topOut] = sortedByOutDegree[0] || [null, 0];
    const secondOut = sortedByOutDegree[1]?.[1] ?? 0;

    const hubDominance = secondOut > 0 ? topOut / secondOut : (topOut > 0 ? Infinity : 0);
    const hubClaim = hubDominance >= 1.5 && topOut >= 2 ? topId : null;

    return {
        componentCount,
        components,
        longestChain,
        chainCount,
        hubClaim,
        hubDominance: Number.isFinite(hubDominance) ? hubDominance : 10, // Cap infinity
    };
};

// ═══════════════════════════════════════════════════════════════════════════
// V3.1 CORE RATIO COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

const computeCoreRatios = (
    claims: ClaimWithLeverage[],
    edges: Edge[],
    graph: GraphAnalysis,
    modelCount: number
): CoreRatios => {
    const claimCount = claims.length;
    const edgeCount = edges.length;

    // Concentration: max support / modelCount
    const maxSupport = Math.max(...claims.map(c => c.supporters.length), 0);
    const concentration = modelCount > 0 ? maxSupport / modelCount : 0;

    // Alignment: reinforcing edges between top claims / total edges between top claims
    const topCount = getTopNCount(claimCount, 0.3);
    const sortedBySupport = [...claims].sort((a, b) => b.supporters.length - a.supporters.length);
    const topIds = new Set(sortedBySupport.slice(0, topCount).map(c => c.id));

    const topEdges = edges.filter(e => topIds.has(e.from) && topIds.has(e.to));
    const reinforcingEdges = topEdges.filter(e =>
        e.type === "supports" || e.type === "prerequisite"
    ).length;

    const alignment = topEdges.length > 0
        ? reinforcingEdges / topEdges.length
        : 0.5; // Neutral if no edges between top claims

    // Tension: conflict + tradeoff edges / total edges
    const tensionEdges = edges.filter(e =>
        e.type === "conflicts" || e.type === "tradeoff"
    ).length;
    const tension = edgeCount > 0 ? tensionEdges / edgeCount : 0;

    // Fragmentation: (components - 1) / (claims - 1)
    const fragmentation = claimCount > 1
        ? (graph.componentCount - 1) / (claimCount - 1)
        : 0;

    // Depth: longest chain / claim count
    const depth = claimCount > 0
        ? graph.longestChain.length / claimCount
        : 0;

    return { concentration, alignment, tension, fragmentation, depth };
};

// ═══════════════════════════════════════════════════════════════════════════
// LANDSCAPE METRICS
// ═══════════════════════════════════════════════════════════════════════════

const computeLandscapeMetrics = (artifact: MapperArtifact): StructuralAnalysis["landscape"] => {
    const claims = Array.isArray(artifact?.claims) ? artifact.claims : [];

    const typeDistribution: Record<string, number> = {};
    const roleDistribution: Record<string, number> = {};
    const supporterSet = new Set<number>();

    for (const c of claims) {
        if (!c) continue;
        typeDistribution[c.type] = (typeDistribution[c.type] || 0) + 1;
        roleDistribution[c.role] = (roleDistribution[c.role] || 0) + 1;
        if (Array.isArray(c.supporters)) {
            for (const s of c.supporters) {
                if (typeof s === "number") supporterSet.add(s);
            }
        }
    }

    const dominantType = (Object.entries(typeDistribution).sort((a, b) => b[1] - a[1])[0]?.[0] || "prescriptive") as Claim["type"];
    const dominantRole = (Object.entries(roleDistribution).sort((a, b) => b[1] - a[1])[0]?.[0] || "anchor") as Claim["role"];

    const modelCount = typeof artifact?.model_count === "number" && artifact.model_count > 0
        ? artifact.model_count
        : supporterSet.size > 0 ? supporterSet.size : 1;

    // Convergence ratio: use top 30% threshold instead of fixed >= 2
    const topThreshold = getTopNCount(claims.length, 0.3);
    const sortedBySupport = [...claims].sort((a, b) => (b.supporters?.length || 0) - (a.supporters?.length || 0));
    const topSupportLevel = sortedBySupport[topThreshold - 1]?.supporters?.length || 1;
    const convergentClaims = claims.filter((c) => (c.supporters?.length || 0) >= topSupportLevel);

    return {
        dominantType,
        typeDistribution,
        dominantRole,
        roleDistribution,
        claimCount: claims.length,
        modelCount,
        convergenceRatio: claims.length > 0 ? convergentClaims.length / claims.length : 0,
    };
};

// ═══════════════════════════════════════════════════════════════════════════
// V3.1 CLAIM ENRICHMENT (Ratios first, flags from percentiles)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Step 1: Compute raw ratios and scores for each claim
 */
const computeClaimRatios = (
    claim: Claim,
    edges: Edge[],
    modelCount: number
): Omit<ClaimWithLeverage,
    'isHighSupport' | 'isLeverageInversion' | 'isKeystone' | 'isEvidenceGap' | 'isOutlier' |
    'isContested' | 'isConditional' | 'isChallenger' | 'isIsolated' | 'chainDepth'
> => {
    const safeModelCount = Math.max(modelCount, 1);
    const supporters = Array.isArray(claim.supporters) ? claim.supporters : [];

    // Support ratio
    const supportRatio = supporters.length / safeModelCount;
    const supportWeight = supportRatio * 2;

    // Role weight (relative multipliers - these are fine to keep)
    const roleWeights: Record<string, number> = {
        challenger: 4,
        anchor: 2,
        branch: 1,
        supplement: 0.5,
    };
    const roleWeight = roleWeights[claim.role] ?? 1;

    // Edge analysis
    const outgoing = edges.filter((e) => e.from === claim.id);
    const incoming = edges.filter((e) => e.to === claim.id);
    const inDegree = incoming.length;
    const outDegree = outgoing.length;

    const prereqOut = outgoing.filter((e) => e.type === "prerequisite").length * 2;
    const prereqIn = incoming.filter((e) => e.type === "prerequisite").length;
    const conflictEdges = edges.filter(
        (e) => e.type === "conflicts" && (e.from === claim.id || e.to === claim.id)
    ).length * 1.5;

    const connectivityWeight = prereqOut + prereqIn + conflictEdges + (outgoing.length + incoming.length) * 0.25;

    const hasIncomingPrereq = incoming.some((e) => e.type === "prerequisite");
    const hasOutgoingPrereq = outgoing.some((e) => e.type === "prerequisite");
    const positionWeight = !hasIncomingPrereq && hasOutgoingPrereq ? 2 : 0;

    // Leverage score (composite)
    const leverage = supportWeight + roleWeight + connectivityWeight + positionWeight;

    // Keystone score
    const keystoneScore = outDegree * supporters.length;

    // Support skew
    const supporterCounts = supporters.reduce((acc, s) => {
        const key = String(s);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const maxFromSingleModel = Object.values(supporterCounts).length > 0
        ? Math.max(...Object.values(supporterCounts))
        : 0;
    const supportSkew = supporters.length > 0 ? maxFromSingleModel / supporters.length : 0;

    // Chain position flags
    const isChainRoot = !hasIncomingPrereq && hasOutgoingPrereq;
    const isChainTerminal = hasIncomingPrereq && !hasOutgoingPrereq;

    return {
        id: claim.id,
        label: claim.label,
        supporters,
        type: claim.type,
        role: claim.role,
        supportRatio,
        leverage,
        leverageFactors: {
            supportWeight,
            roleWeight,
            connectivityWeight,
            positionWeight,
        },
        keystoneScore,
        evidenceGapScore: 0, // Computed after cascade analysis
        supportSkew,
        inDegree,
        outDegree,
        isChainRoot,
        isChainTerminal,
    };
};

/**
 * Step 2: Assign percentile-based flags after all ratios computed
 */
const assignPercentileFlags = (
    claims: Array<ReturnType<typeof computeClaimRatios>>,
    edges: Edge[],
    cascadeRisks: CascadeRisk[],
    topClaimIds: Set<string>
): ClaimWithLeverage[] => {

    // Gather all values for percentile calculations
    const allSupportRatios = claims.map(c => c.supportRatio);
    const allLeverages = claims.map(c => c.leverage);
    const allKeystoneScores = claims.map(c => c.keystoneScore);
    const allSupportSkews = claims.map(c => c.supportSkew);

    // Build cascade lookup
    const cascadeBySource = new Map<string, CascadeRisk>();
    cascadeRisks.forEach(risk => cascadeBySource.set(risk.sourceId, risk));

    // Connected claim IDs for isolation check
    const connectedIds = new Set<string>();
    edges.forEach(e => {
        connectedIds.add(e.from);
        connectedIds.add(e.to);
    });

    return claims.map(claim => {
        // Evidence gap score (computed from cascade)
        const cascade = cascadeBySource.get(claim.id);
        const evidenceGapScore = cascade && claim.supporters.length > 0
            ? cascade.dependentIds.length / claim.supporters.length
            : 0;

        // All evidence gap scores for percentile calculation
        const allEvidenceGaps = claims.map(c => {
            const cCascade = cascadeBySource.get(c.id);
            return cCascade && c.supporters.length > 0
                ? cCascade.dependentIds.length / c.supporters.length
                : 0;
        });

        // Percentile-based flags
        const isHighSupport = isInTopPercentile(claim.supportRatio, allSupportRatios, 0.3);

        // Leverage inversion: bottom 30% support AND top 25% leverage
        const isLowSupport = isInBottomPercentile(claim.supportRatio, allSupportRatios, 0.3);
        const isHighLeverage = isInTopPercentile(claim.leverage, allLeverages, 0.25);
        const isLeverageInversion = isLowSupport && isHighLeverage;

        // Keystone: top 20% by keystone score AND outDegree >= 2
        const isKeystone = isInTopPercentile(claim.keystoneScore, allKeystoneScores, 0.2) && claim.outDegree >= 2;

        // Evidence gap: top 20% by gap score
        const isEvidenceGap = isInTopPercentile(evidenceGapScore, allEvidenceGaps, 0.2) && evidenceGapScore > 0;

        // Outlier: top 20% by support skew AND has multiple supporters
        const isOutlier = isInTopPercentile(claim.supportSkew, allSupportSkews, 0.2) && claim.supporters.length >= 2;

        // Structural flags from edges
        const hasConflict = edges.some(e =>
            e.type === "conflicts" && (e.from === claim.id || e.to === claim.id)
        );
        const hasIncomingPrereq = edges.some(e =>
            e.type === "prerequisite" && e.to === claim.id
        );

        // Challenger: low support + challenges high-support claim
        const challengesHighSupport = claim.role === "challenger" && edges.some(e =>
            e.from === claim.id &&
            topClaimIds.has(e.to) &&
            (e.type === "conflicts" || e.type === "prerequisite")
        );
        const isChallenger = isLowSupport && challengesHighSupport;

        const isIsolated = !connectedIds.has(claim.id);

        // Chain depth (simplified - use position in longest chain or 0)
        const chainDepth = claim.isChainRoot ? 0 : (claim.isChainTerminal ? 1 : 0);

        return {
            ...claim,
            evidenceGapScore,
            isHighSupport,
            isLeverageInversion,
            isKeystone,
            isEvidenceGap,
            isOutlier,
            isContested: hasConflict,
            isConditional: hasIncomingPrereq,
            isChallenger,
            isIsolated,
            chainDepth,
        };
    });
};

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN DETECTION
// ═══════════════════════════════════════════════════════════════════════════

const detectLeverageInversions = (
    claims: ClaimWithLeverage[],
    edges: Edge[],
    topClaimIds: Set<string>
): LeverageInversion[] => {
    const inversions: LeverageInversion[] = [];
    const prerequisites = edges.filter((e) => e.type === "prerequisite");

    for (const claim of claims) {
        if (!claim.isLeverageInversion) continue;

        const prereqTo = prerequisites.filter((e) => e.from === claim.id);
        const highSupportTargets = prereqTo
            .filter((e) => topClaimIds.has(e.to));

        if (claim.role === "challenger" && highSupportTargets.length > 0) {
            inversions.push({
                claimId: claim.id,
                claimLabel: claim.label,
                supporterCount: claim.supporters.length,
                reason: "challenger_prerequisite_to_consensus",
                affectedClaims: highSupportTargets.map((e) => e.to),
            });
            continue;
        }

        if (prereqTo.length > 0) {
            inversions.push({
                claimId: claim.id,
                claimLabel: claim.label,
                supporterCount: claim.supporters.length,
                reason: "singular_foundation",
                affectedClaims: prereqTo.map((e) => e.to),
            });
            continue;
        }

        if (claim.leverageFactors.connectivityWeight > claim.leverage * 0.4) {
            inversions.push({
                claimId: claim.id,
                claimLabel: claim.label,
                supporterCount: claim.supporters.length,
                reason: "high_connectivity_low_support",
                affectedClaims: [],
            });
        }
    }

    return inversions;
};

const computeCascadeDepth = (sourceId: string, prerequisites: Edge[]): number => {
    const visited = new Set<string>();
    let maxDepth = 0;

    const dfs = (id: string, depth: number) => {
        if (visited.has(id)) return;
        visited.add(id);
        maxDepth = Math.max(maxDepth, depth);
        const next = prerequisites.filter((e) => e.from === id);
        for (const e of next) dfs(e.to, depth + 1);
    };

    dfs(sourceId, 0);
    return maxDepth;
};

const detectCascadeRisks = (
    edges: Edge[],
    claimMap: Map<string, { id: string; label: string }>
): CascadeRisk[] => {
    const prerequisites = edges.filter((e) => e.type === "prerequisite");
    const bySource = new Map<string, string[]>();
    for (const e of prerequisites) {
        const existing = bySource.get(e.from) || [];
        bySource.set(e.from, [...existing, e.to]);
    }

    const risks: CascadeRisk[] = [];
    for (const [sourceId, directDependents] of bySource) {
        if (directDependents.length === 0) continue;

        const allDependents = new Set<string>();
        const queue = [...directDependents];
        while (queue.length > 0) {
            const current = queue.shift()!;
            if (allDependents.has(current)) continue;
            allDependents.add(current);
            const nextLevel = bySource.get(current) || [];
            queue.push(...nextLevel);
        }

        const source = claimMap.get(sourceId);
        const dependentClaims = Array.from(allDependents)
            .map((id) => claimMap.get(id))
            .filter(Boolean);

        risks.push({
            sourceId,
            sourceLabel: source?.label || sourceId,
            dependentIds: Array.from(allDependents),
            dependentLabels: dependentClaims.map((c) => c!.label),
            depth: computeCascadeDepth(sourceId, prerequisites),
        });
    }

    return risks;
};

const detectConflicts = (
    edges: Edge[],
    claimMap: Map<string, ClaimWithLeverage>,
    topClaimIds: Set<string>
): ConflictPair[] => {
    const out: ConflictPair[] = [];
    for (const e of edges) {
        if (e.type !== "conflicts") continue;
        const a = claimMap.get(e.from);
        const b = claimMap.get(e.to);
        if (!a || !b) continue;
        out.push({
            claimA: { id: a.id, label: a.label, supporterCount: a.supporters.length },
            claimB: { id: b.id, label: b.label, supporterCount: b.supporters.length },
            isBothConsensus: topClaimIds.has(a.id) && topClaimIds.has(b.id),
        });
    }
    return out;
};

const detectTradeoffs = (
    edges: Edge[],
    claimMap: Map<string, ClaimWithLeverage>,
    topClaimIds: Set<string>
): TradeoffPair[] => {
    const out: TradeoffPair[] = [];
    for (const e of edges) {
        if (e.type !== "tradeoff") continue;
        const a = claimMap.get(e.from);
        const b = claimMap.get(e.to);
        if (!a || !b) continue;
        const aTop = topClaimIds.has(a.id);
        const bTop = topClaimIds.has(b.id);
        const symmetry: TradeoffPair["symmetry"] = aTop && bTop
            ? "both_consensus"
            : !aTop && !bTop
                ? "both_singular"
                : "asymmetric";
        out.push({
            claimA: { id: a.id, label: a.label, supporterCount: a.supporters.length },
            claimB: { id: b.id, label: b.label, supporterCount: b.supporters.length },
            symmetry,
        });
    }
    return out;
};

const detectConvergencePoints = (
    edges: Edge[],
    claimMap: Map<string, ClaimWithLeverage>
): ConvergencePoint[] => {
    const relevantEdges = edges.filter((e) => e.type === "prerequisite" || e.type === "supports");
    const byTargetType = new Map<string, { targetId: string; sources: string[]; type: "prerequisite" | "supports" }>();

    for (const e of relevantEdges) {
        const key = `${e.to}::${e.type}`;
        const existing = byTargetType.get(key);
        if (existing) {
            existing.sources.push(e.from);
        } else {
            byTargetType.set(key, { targetId: e.to, sources: [e.from], type: e.type as "prerequisite" | "supports" });
        }
    }

    const points: ConvergencePoint[] = [];
    for (const { targetId, sources, type } of byTargetType.values()) {
        // Use relative threshold: more than 1 source is significant regardless of graph size
        if (sources.length < 2) continue;
        const target = claimMap.get(targetId);
        const sourceClaims = sources.map((s) => claimMap.get(s)).filter(Boolean);
        points.push({
            targetId,
            targetLabel: target?.label || targetId,
            sourceIds: sources,
            sourceLabels: sourceClaims.map((c) => c!.label),
            edgeType: type,
        });
    }

    return points;
};

const detectIsolatedClaims = (claims: ClaimWithLeverage[]): string[] => {
    return claims.filter((c) => c.isIsolated).map((c) => c.id);
};

const analyzeGhosts = (ghosts: string[], claims: ClaimWithLeverage[]): StructuralAnalysis["ghostAnalysis"] => {
    const challengers = claims.filter((c) => c.role === "challenger" || c.isChallenger);
    return {
        count: ghosts.length,
        mayExtendChallenger: ghosts.length > 0 && challengers.length > 0,
        challengerIds: challengers.map((c) => c.id),
    };
};

// ═══════════════════════════════════════════════════════════════════════════
// V3.1 PROBLEM STRUCTURE DETECTION (Ratio-based scoring)
// ═══════════════════════════════════════════════════════════════════════════

const detectProblemStructure = (
    claims: ClaimWithLeverage[],
    edges: Edge[],
    patterns: StructuralAnalysis["patterns"],
    ratios: CoreRatios,
    graph: GraphAnalysis,
    modelCount: number
): ProblemStructure => {
    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const pct = (n: number) => `${Math.round(n * 100)}%`;

    const { concentration, alignment, tension, fragmentation, depth } = ratios;
    const claimCount = claims.length;
    const edgeCount = edges.length;

    // Derived metrics
    const tradeoffEdges = edges.filter(e => e.type === "tradeoff").length;
    const conflictEdges = edges.filter(e => e.type === "conflicts").length;
    const tradeoffRatio = (tradeoffEdges + conflictEdges) > 0
        ? tradeoffEdges / (tradeoffEdges + conflictEdges)
        : 0;

    const hubScore = graph.hubClaim
        ? clamp01((graph.hubDominance - 1) / 2) // Normalize: 1.5 → 0.25, 3.0 → 1.0
        : 0;

    const consensusConflicts = patterns.conflicts.filter((c) => c.isBothConsensus).length;

    // Pattern scores using weighted ratio combinations
    const settledScore = clamp01(
        concentration * 0.35 +
        alignment * 0.35 +
        (1 - tension) * 0.20 +
        (1 - fragmentation) * 0.10
    );

    const contestedScore = clamp01(
        (1 - alignment) * 0.40 +
        tension * 0.35 +
        concentration * 0.10 +
        (consensusConflicts > 0 ? 0.15 : 0)
    );

    const linearScore = clamp01(
        depth * 0.50 +
        (1 - fragmentation) * 0.30 +
        (1 - tension) * 0.20
    );

    const keystoneScore = clamp01(
        hubScore * 0.55 +
        (1 - fragmentation) * 0.25 +
        concentration * 0.20
    );

    const tradeoffScore = clamp01(
        tradeoffRatio * 0.45 +
        tension * 0.30 +
        (1 - concentration) * 0.15 +
        (1 - depth) * 0.10
    );

    const dimensionalScore = clamp01(
        (1 - fragmentation) * 0.30 +
        depth * 0.25 +
        (1 - tension) * 0.20 +
        alignment * 0.15 +
        (patterns.convergencePoints.length > 0 ? 0.10 : 0)
    );

    const exploratoryScore = clamp01(
        fragmentation * 0.40 +
        (1 - concentration) * 0.30 +
        (1 - depth) * 0.20 +
        (patterns.convergencePoints.length === 0 ? 0.10 : 0)
    );

    const scores: Array<{ pattern: ProblemStructure["primaryPattern"]; score: number }> = [
        { pattern: "settled", score: settledScore },
        { pattern: "keystone", score: keystoneScore },
        { pattern: "linear", score: linearScore },
        { pattern: "contested", score: contestedScore },
        { pattern: "tradeoff", score: tradeoffScore },
        { pattern: "dimensional", score: dimensionalScore },
        { pattern: "exploratory", score: exploratoryScore },
    ];
    scores.sort((a, b) => b.score - a.score);

    const best = scores[0];
    const second = scores[1] || { pattern: "exploratory" as const, score: 0 };

    const implications: Record<ProblemStructure["primaryPattern"], ProblemStructure["implications"]> = {
        settled: {
            understand: "High agreement. The insight is what consensus overlooks or assumes without stating.",
            gauntlet: "Consensus is not truth. Test the strongest claim—if it falls, consensus was groupthink.",
        },
        linear: {
            understand: "Find the sequence. The insight is often where the path becomes non-obvious.",
            gauntlet: "Test each step: is it truly prerequisite? Can steps be reordered or parallelized?",
        },
        keystone: {
            understand: "Everything hinges on a keystone. The insight is the keystone, not the branches.",
            gauntlet: "Test the keystone ruthlessly. If it fails, the entire structure collapses.",
        },
        contested: {
            understand: "Disagreement is the signal. Find the axis of disagreement—that reveals the real question.",
            gauntlet: "Force resolution. One claim per conflict must fail, or find conditions that differentiate them.",
        },
        tradeoff: {
            understand: "There is no universal best. The insight is the map of what you give up for what you gain.",
            gauntlet: "Test if tradeoffs are real or false dichotomies. Look for dominated options.",
        },
        dimensional: {
            understand: "Multiple independent factors determine the answer. Find the governing conditions.",
            gauntlet: "Test each dimension independently. Does the answer cover all relevant combinations?",
        },
        exploratory: {
            understand: "No strong structure detected. Value lies in cataloging the territory and identifying patterns.",
            gauntlet: "Test relevance: which claims answer the query vs. which are interesting but tangential?",
        },
    };

    const generateEvidence = (pattern: ProblemStructure["primaryPattern"]): string[] => {
        switch (pattern) {
            case "settled":
                return [
                    `Concentration: ${pct(concentration)} of models on top claim`,
                    `Alignment: ${pct(alignment)} of top-claim edges are reinforcing`,
                    `Tension: ${pct(tension)} (low)`,
                ];
            case "contested":
                return [
                    `Tension: ${pct(tension)} of edges are conflicts or tradeoffs`,
                    `Alignment: ${pct(alignment)} among top claims (low)`,
                    consensusConflicts > 0 ? `${consensusConflicts} high-support conflict(s)` : "Conflicts involve lower-support claims",
                ];
            case "linear":
                return [
                    `Chain depth: ${graph.longestChain.length} claims in longest chain`,
                    `Depth ratio: ${pct(depth)}`,
                    `Fragmentation: ${pct(fragmentation)} (low)`,
                ];
            case "keystone":
                return [
                    graph.hubClaim ? `Hub claim with ${graph.hubDominance.toFixed(1)}x dominance` : "No dominant hub detected",
                    `Fragmentation: ${pct(fragmentation)} (low)`,
                    `Concentration: ${pct(concentration)}`,
                ];
            case "tradeoff":
                return [
                    `${tradeoffEdges} tradeoff edge(s) vs ${conflictEdges} conflict(s)`,
                    `Tension: ${pct(tension)}`,
                    `No clear concentration: ${pct(1 - concentration)}`,
                ];
            case "dimensional":
                return [
                    `${patterns.convergencePoints.length} convergence point(s)`,
                    `Depth: ${pct(depth)}`,
                    `Fragmentation: ${pct(fragmentation)} (low)`,
                ];
            case "exploratory":
                return [
                    `Fragmentation: ${pct(fragmentation)} (${graph.componentCount} component(s))`,
                    `Low concentration: ${pct(1 - concentration)}`,
                    `Low depth: ${pct(1 - depth)}`,
                ];
        }
    };

    const maxScore = best.score;
    if (maxScore < 0.25) {
        return {
            primaryPattern: "exploratory",
            confidence: clamp01(maxScore * 0.6),
            evidence: [
                "No dominant structural pattern detected",
                `Highest pattern score: ${maxScore.toFixed(2)}`,
                "Landscape may be exploratory or data insufficient",
            ],
            implications: implications.exploratory,
        };
    }

    const confidence = clamp01(0.40 + (best.score - second.score) * 0.5 + best.score * 0.20);

    return {
        primaryPattern: best.pattern,
        confidence,
        evidence: generateEvidence(best.pattern),
        implications: implications[best.pattern],
    };
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN STRUCTURAL ANALYSIS ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════

const computeStructuralAnalysis = (artifact: MapperArtifact): StructuralAnalysis => {
    const rawClaims = Array.isArray(artifact?.claims) ? artifact.claims : [];
    const edges = Array.isArray(artifact?.edges) ? artifact.edges : [];
    const ghosts = Array.isArray(artifact?.ghosts) ? artifact.ghosts.filter(Boolean).map(String) : [];

    const landscape = computeLandscapeMetrics(artifact);
    const claimIds = rawClaims.map(c => c.id);

    // Step 1: Compute raw ratios for all claims
    const claimsWithRatios = rawClaims.map((c) =>
        computeClaimRatios(c, edges, landscape.modelCount)
    );

    // Step 2: Build simple claim map for cascade detection
    const simpleClaimMap = new Map(claimsWithRatios.map(c => [c.id, { id: c.id, label: c.label }]));

    // Step 3: Detect cascade risks (needed for evidence gap calculation)
    const cascadeRisks = detectCascadeRisks(edges, simpleClaimMap);

    // Step 4: Determine top claims (top 30%)
    const topCount = getTopNCount(claimsWithRatios.length, 0.3);
    const sortedBySupport = [...claimsWithRatios].sort((a, b) => b.supportRatio - a.supportRatio);
    const topClaimIds = new Set(sortedBySupport.slice(0, topCount).map(c => c.id));

    // Step 5: Assign percentile-based flags
    const claimsWithLeverage = assignPercentileFlags(claimsWithRatios, edges, cascadeRisks, topClaimIds);

    // Step 6: Build claim map for pattern detection
    const claimMap = new Map<string, ClaimWithLeverage>(claimsWithLeverage.map((c) => [c.id, c]));

    // Step 7: Graph analysis
    const graph = analyzeGraph(claimIds, edges);

    // Step 8: Core ratios
    const ratios = computeCoreRatios(claimsWithLeverage, edges, graph, landscape.modelCount);

    // Step 9: Pattern detection
    const patterns: StructuralAnalysis["patterns"] = {
        leverageInversions: detectLeverageInversions(claimsWithLeverage, edges, topClaimIds),
        cascadeRisks,
        conflicts: detectConflicts(edges, claimMap, topClaimIds),
        tradeoffs: detectTradeoffs(edges, claimMap, topClaimIds),
        convergencePoints: detectConvergencePoints(edges, claimMap),
        isolatedClaims: detectIsolatedClaims(claimsWithLeverage),
    };

    const ghostAnalysis = analyzeGhosts(ghosts, claimsWithLeverage);

    const analysis: StructuralAnalysis = {
        edges,
        landscape,
        claimsWithLeverage,
        patterns,
        ghostAnalysis,
        graph,
        ratios,
    };

    structuralDbg("analysis", {
        claimCount: landscape.claimCount,
        edgeCount: edges.length,
        modelCount: landscape.modelCount,
        ratios,
        graph: {
            components: graph.componentCount,
            longestChain: graph.longestChain.length,
            hubClaim: graph.hubClaim,
        },
    });

    return analysis;
};

export const computeProblemStructureFromArtifact = (artifact: MapperArtifact): ProblemStructure => {
    const analysis = computeStructuralAnalysis(artifact);
    const structure = detectProblemStructure(
        analysis.claimsWithLeverage,
        analysis.edges,
        analysis.patterns,
        analysis.ratios,
        analysis.graph,
        analysis.landscape.modelCount
    );
    structuralDbg("problemStructure", structure);
    return structure;
};

// ═══════════════════════════════════════════════════════════════════════════
// MODE CONTEXT GENERATION
// ═══════════════════════════════════════════════════════════════════════════

const TYPE_FRAMINGS: Record<string, { understand: string; gauntlet: string }> = {
    factual: {
        understand: "Factual landscape. Consensus reflects common knowledge. Value lies in specific, verifiable claims that others assumed without stating.",
        gauntlet: "Factual landscape. Test specificity and verifiability. Vague claims fail regardless of support count. Popular does not mean true.",
    },
    prescriptive: {
        understand: "Prescriptive landscape. Consensus reflects conventional wisdom the user likely knows. Value lies in claims with clear conditions and boundaries.",
        gauntlet: "Prescriptive landscape. Test actionability and conditional coverage. Advice without context is noise. Claims must specify when they apply.",
    },
    conditional: {
        understand: "Conditional landscape. Claims branch on context. The key insight is often the governing condition that structures the branches.",
        gauntlet: "Conditional landscape. Both branches may survive if they cover non-overlapping conditions. Eliminate claims with vague or unfalsifiable conditions.",
    },
    contested: {
        understand: "Contested landscape. Disagreement is the signal. The key insight is often the dimension on which claims disagree—that reveals the real question.",
        gauntlet: "Contested landscape. Conflict forces choice. Apply supremacy test: which claim passes where the other fails? Or find conditions that differentiate them.",
    },
    speculative: {
        understand: "Speculative landscape. Agreement is weak signal for predictions. Value lies in claims with grounded mechanisms, not confident predictions.",
        gauntlet: "Speculative landscape. Test mechanism and grounding. Predictions without causal explanation are eliminated. Future claims must explain how.",
    },
};

const getTypeFraming = (dominantType: string, mode: "understand" | "gauntlet"): string => {
    const framing = TYPE_FRAMINGS[dominantType] || TYPE_FRAMINGS.prescriptive;
    return framing[mode];
};

const generateModeContext = (analysis: StructuralAnalysis, mode: "understand" | "gauntlet"): ModeContext => {
    const { landscape, patterns, ghostAnalysis, ratios, graph } = analysis;
    const problemStructure = detectProblemStructure(
        analysis.claimsWithLeverage,
        analysis.edges,
        analysis.patterns,
        ratios,
        graph,
        landscape.modelCount
    );
    const structuralFraming = mode === "understand" ? problemStructure.implications.understand : problemStructure.implications.gauntlet;
    const typeFraming = getTypeFraming(landscape.dominantType, mode);
    const structuralObservations: string[] = [];

    for (const inv of patterns.leverageInversions) {
        if (inv.reason === "challenger_prerequisite_to_consensus") {
            structuralObservations.push(
                `${inv.claimLabel} (low support, challenger) is prerequisite to ${inv.affectedClaims.length} high-support claim(s).`
            );
        } else if (inv.reason === "singular_foundation") {
            structuralObservations.push(
                `${inv.claimLabel} (low support) enables ${inv.affectedClaims.length} downstream claim(s).`
            );
        }
    }

    for (const risk of patterns.cascadeRisks) {
        if (risk.dependentIds.length >= 2) {
            structuralObservations.push(
                `${risk.sourceLabel} is prerequisite to ${risk.dependentIds.length} claims (cascade depth: ${risk.depth}).`
            );
        }
    }

    for (const conflict of patterns.conflicts) {
        const qualifier = conflict.isBothConsensus ? " (both high-support)" : "";
        structuralObservations.push(`${conflict.claimA.label} conflicts with ${conflict.claimB.label}${qualifier}.`);
    }

    for (const tradeoff of patterns.tradeoffs) {
        structuralObservations.push(
            `${tradeoff.claimA.label} ↔ ${tradeoff.claimB.label} (tradeoff, ${tradeoff.symmetry.replace("_", " ")}).`
        );
    }

    for (const conv of patterns.convergencePoints) {
        if (conv.edgeType === "prerequisite") {
            structuralObservations.push(`${conv.targetLabel} requires all of: ${conv.sourceLabels.join(", ")}.`);
        }
    }

    let leverageNotes: string | null = null;
    let cascadeWarnings: string | null = null;
    let conflictNotes: string | null = null;
    let tradeoffNotes: string | null = null;
    let ghostNotes: string | null = null;

    if (mode === "understand") {
        if (patterns.leverageInversions.length > 0) {
            const candidates = patterns.leverageInversions.map((i) => i.claimLabel);
            leverageNotes = `High-leverage claims with low support: ${candidates.join(", ")}. These may contain overlooked insights.`;
        }

        if (ghostAnalysis.mayExtendChallenger) {
            ghostNotes = `${ghostAnalysis.count} ghost(s) detected. May represent territory challengers were pointing toward.`;
        }
    }

    if (mode === "gauntlet") {
        if (patterns.cascadeRisks.length > 0) {
            const warnings = patterns.cascadeRisks
                .filter((r) => r.dependentIds.length >= 1)
                .map((r) => `Eliminating ${r.sourceLabel} cascades to: ${r.dependentLabels.join(", ")}.`);
            if (warnings.length > 0) cascadeWarnings = warnings.join("\n");
        }

        if (patterns.conflicts.length > 0) {
            conflictNotes = `${patterns.conflicts.length} conflict(s) require resolution. One claim per conflict must be eliminated or conditions must differentiate them.`;
        }

        const asymmetricTradeoffs = patterns.tradeoffs.filter((t) => t.symmetry === "asymmetric");
        if (asymmetricTradeoffs.length > 0) {
            tradeoffNotes = `${asymmetricTradeoffs.length} asymmetric tradeoff(s): low-support claims challenging high-support positions. Test if challenger survives superiority.`;
        }
    }

    return {
        problemStructure,
        structuralFraming,
        typeFraming,
        structuralObservations,
        leverageNotes,
        cascadeWarnings,
        conflictNotes,
        tradeoffNotes,
        ghostNotes,
    };
};

const buildStructuralSection = (context: ModeContext, mode: "understand" | "gauntlet"): string => {
    const sections: string[] = [];
    sections.push(
        `## Problem Structure: ${context.problemStructure.primaryPattern.toUpperCase()}\n\n${context.structuralFraming}\n\n**Evidence:**\n${context.problemStructure.evidence
            .map((e) => `• ${e}`)
            .join("\n")}\n\n**Confidence:** ${Math.round(context.problemStructure.confidence * 100)}%`
    );
    sections.push(`## Landscape Type\n\n${context.typeFraming}`);
    if (context.structuralObservations.length > 0) {
        sections.push(`## Structural Observations\n\n${context.structuralObservations.map((o) => `• ${o}`).join("\n")}`);
    }

    if (mode === "understand") {
        if (context.leverageNotes) sections.push(`## High-Leverage Claims\n\n${context.leverageNotes}`);
        if (context.ghostNotes) sections.push(`## Gaps\n\n${context.ghostNotes}`);
    }

    if (mode === "gauntlet") {
        if (context.cascadeWarnings) sections.push(`## Cascade Warnings\n\n${context.cascadeWarnings}`);
        if (context.conflictNotes) sections.push(`## Conflicts\n\n${context.conflictNotes}`);
        if (context.tradeoffNotes) sections.push(`## Asymmetric Tradeoffs\n\n${context.tradeoffNotes}`);
    }

    return sections.join("\n\n---\n\n");
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS FOR STRUCTURAL ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export {
    computeStructuralAnalysis,
    generateModeContext,
    buildStructuralSection,
    type StructuralAnalysis,
    type ClaimWithLeverage,
    type CoreRatios,
    type GraphAnalysis,
};

// ═══════════════════════════════════════════════════════════════════════════
// src/core/PromptService.ts
// Pure prompt construction - NO execution logic
// ═══════════════════════════════════════════════════════════════════════════

export interface TurnContext {
    userPrompt: string;
    understandText?: string;
    gauntletText?: string;
    mappingText: string;
    batchText?: string;
}

// [REST OF PROMPT SERVICE CLASS UNCHANGED - buildMappingPrompt, buildUnderstandPrompt, etc.]
// The prompts reference the structural analysis which is now V3.1 compatible

const COMPOSER_SYSTEM_INSTRUCTIONS = `You are the user's voice, clarified, and the hinge between the user and a bank of parallel AI models.

You sit after a batch → analysis → decision-map pipeline and before the next fan-out.
Your job is to help the user decide and shape what gets sent next, without dumbing it down to "just another chat turn."

You serve two overlapping functions:

Strategic partner: The user can think aloud with you about what to do next.
Prompt architect: The user can hand you a draft to sharpen into what they truly meant to ask.
Always serve both functions...

[REST OF STATIC INSTRUCTIONS - no \${variables} here]

OUTPUT STRUCTURE
STRATEGIC TAKE...
REFINED_PROMPT:...
NOTES:...`;

const ANALYST_SYSTEM_INSTRUCTIONS = `You are not the Author. You are the mirror held up to the composed prompt before it launches...

[REST OF STATIC INSTRUCTIONS]

Output format:
AUDIT:...
VARIANTS:...
GUIDANCE:...`;

export class PromptService {

    buildContextSection(turnContext: TurnContext | null): string {
        if (!turnContext) return "";
        const { userPrompt, understandText, gauntletText, mappingText, batchText } = turnContext;
        let section = "";

        if (userPrompt) {
            section += `\n<PREVIOUS_USER_PROMPT>\n${userPrompt}\n</PREVIOUS_USER_PROMPT>\n`;
        }
        if (understandText) {
            section += `\n<PREVIOUS_UNDERSTAND_ANALYSIS>\n${understandText}\n</PREVIOUS_UNDERSTAND_ANALYSIS>\n`;
        }
        if (gauntletText) {
            section += `\n<PREVIOUS_GAUNTLET_VERDICT>\n${gauntletText}\n</PREVIOUS_GAUNTLET_VERDICT>\n`;
        }
        if (mappingText) {
            section += `\n<PREVIOUS_DECISION_MAP>\n${mappingText}\n</PREVIOUS_DECISION_MAP>\n`;
        }
        if (batchText) {
            section += `\n<PREVIOUS_BATCH_RESPONSES>\n${batchText}\n</PREVIOUS_BATCH_RESPONSES>\n`;
        }
        return section;
    }

    buildComposerPrompt(
        draftPrompt: string,
        turnContext: TurnContext | null,
        analystCritique?: string
    ): string {
        const contextSection = this.buildContextSection(turnContext);
        let prompt = COMPOSER_SYSTEM_INSTRUCTIONS;
        if (contextSection) {
            prompt += `\n\nYou have access to the previous turn context:\n${contextSection}`;
        }
        if (analystCritique) {
            prompt += `\n\n<PREVIOUS_ANALYST_CRITIQUE>\n${analystCritique}\n</PREVIOUS_ANALYST_CRITIQUE>`;
        }
        prompt += `\n\n<DRAFT_PROMPT>\n${draftPrompt}\n</DRAFT_PROMPT>`;
        prompt += `\n\nBegin.`;
        return prompt;
    }

    buildAnalystPrompt(
        fragment: string,
        turnContext: TurnContext | null,
        authoredPrompt?: string
    ): string {
        const contextSection = this.buildContextSection(turnContext);
        let prompt = ANALYST_SYSTEM_INSTRUCTIONS;
        if (contextSection) {
            prompt += `\n\n${contextSection}`;
        }
        prompt += `\n\n<USER_FRAGMENT>\n${fragment}\n</USER_FRAGMENT>`;
        if (authoredPrompt) {
            prompt += `\n\n<COMPOSED_PROMPT>\n${authoredPrompt}\n</COMPOSED_PROMPT>`;
        } else {
            prompt += `\n\n<NOTE>No composed prompt was provided. Analyze the USER_FRAGMENT directly.</NOTE>`;
        }
        return prompt;
    }

    buildMappingPrompt(
        userPrompt: string,
        sourceResults: Array<{ providerId: string; text: string }>,
        citationOrder: string[] = []
    ): string {
        promptDbg("buildMappingPrompt", {
            sources: Array.isArray(sourceResults) ? sourceResults.length : 0,
            citationOrder: Array.isArray(citationOrder) ? citationOrder.length : 0,
            userPromptLen: String(userPrompt || "").length,
        });
        const providerToNumber = new Map();
        if (Array.isArray(citationOrder) && citationOrder.length > 0) {
            citationOrder.forEach((pid, idx) => providerToNumber.set(pid, idx + 1));
        }

        const modelOutputsBlock = sourceResults
            .map((res, idx) => {
                const n = providerToNumber.has(res.providerId)
                    ? providerToNumber.get(res.providerId)
                    : idx + 1;
                const header = `=== MODEL ${n} ===`;
                return `${header}\n${String(res.text)}`;
            })
            .join("\n\n");

        return `You are the Epistemic Cartographer. Your mandate is the Incorruptible Distillation of Signal—preserving every incommensurable insight while discarding only connective tissue that adds nothing to the answer.

Index positions, not topics. A position is a stance—something that can be supported, opposed, or traded against another. Where multiple sources reach the same position, note the convergence. Where only one source sees something, preserve it as a singularity. Where sources oppose each other, map the conflict. Where they optimize for different ends, map the tradeoff. Where one position depends on another, map the prerequisite. What no source addressed but matters—these are the ghosts at the edge of the map.

Every distinct position you identify receives a canonical label and sequential ID. That exact pairing—**[Label|claim_N]**—will bind your map to your narrative.

User query: "${userPrompt}"

<model_outputs>
${modelOutputsBlock}
</model_outputs>

Now distill what you found into two outputs: <map> and <narrative>.

---

THE MAP
<map>
A JSON object with three arrays:

claims: an array of distinct positions. Each claim has:
- id: sequential ("claim_1", "claim_2", etc.)
- label: a verb-phrase expressing a position. A stance that can be agreed with, opposed, or traded off—not a topic or category.
- text: the mechanism, evidence, or reasoning behind this position (one sentence)
- supporters: array of model indices that expressed this position
- type: the epistemic nature
  - factual: verifiable truth
  - prescriptive: recommendation or ought-statement  
  - conditional: truth depends on unstated context
  - contested: models actively disagree
  - speculative: prediction or uncertain projection
- role: "challenger" if this questions a premise or reframes the problem; null otherwise
- challenges: if role is challenger, the claim_id being challenged; null otherwise

edges: an array of relationships. Each edge has:
- from: source claim_id
- to: target claim_id
- type:
  - supports: from reinforces to
  - conflicts: from and to cannot both be true
  - tradeoff: from and to optimize for different ends
  - prerequisite: to depends on from being true

ghosts: what no source addressed that would matter for the decision. Null if none.

</map>

---

THE NARRATIVE
<narrative>
The narrative is not a summary. It is a landscape the reader walks through. Use **[Label|claim_id]** anchors to let them touch the structure as they move.

Begin by surfacing the governing variable—if tradeoff or conflict edges exist, name the dimension along which the answer pivots. One sentence that orients before any detail arrives.

Then signal the shape. Are the models converging? Splitting into camps? Arranged in a sequence where each step enables the next? The reader should know how to hold what follows before they hold it.

Now establish the ground. Claims with broad support are the floor—state what is settled without argument. This is what does not need to be re-examined.

From the ground, move to the tension. Claims connected by conflict or tradeoff edges are where the decision lives. Present opposing positions using their labels—the axis between them should be visible in the verb-phrases themselves. Do not resolve; reveal what choosing requires.

After the tension, surface the edges. Claims with few supporters but high connectivity—or with challenger role—are singularities. They may be noise or they may be the key. Place them adjacent to what they challenge or extend, not quarantined at the end.

Close with what remains uncharted. Ghosts are the boundary of what the models could see. Name them. The reader decides if they matter.

Do not synthesize a verdict. Do not pick sides. The landscape is the product.
</narrative>
`;
    }

    // [buildUnderstandPrompt, buildGauntletPrompt, buildRefinerPrompt, buildAntagonistPrompt remain unchanged]
    // They consume the structural analysis which is now V3.1 compatible

    buildUnderstandPrompt(
        originalPrompt: string,
        artifact: MapperArtifact,
        narrativeSummary: string,
        userNotes?: string[]
    ): string {
        const claims = artifact.claims || [];
        const edges = artifact.edges || [];
        const ghosts = artifact.ghosts || [];

        const analysis = computeStructuralAnalysis(artifact);
        const { ratios, graph } = analysis;

        // Use ratio-based high support
        const topCount = getTopNCount(claims.length, 0.3);
        const sortedBySupport = [...claims].sort((a, b) => (b.supporters?.length || 0) - (a.supporters?.length || 0));
        const highSupportClaims = sortedBySupport.slice(0, topCount);
        const lowSupportClaims = sortedBySupport.slice(topCount);

        const challengers = claims.filter((c) => c.role === 'challenger');
        const convergenceRatio = Math.round(ratios.concentration * 100);

        promptDbg("buildUnderstandPrompt", { claims: claims.length, edges: edges.length, ghosts: ghosts.length });

        const narrativeBlock = narrativeSummary
            ? `## Landscape Overview\n${narrativeSummary}\n`
            : '';

        const modeContext = generateModeContext(analysis, "understand");
        const structuralSection = buildStructuralSection(modeContext, "understand");
        const theOneGuidance = modeContext.leverageNotes || "";
        const echoGuidance = modeContext.ghostNotes || "";

        const mapData = JSON.stringify({ claims, edges, ghosts }, null, 2);

        const userNotesBlock = Array.isArray(userNotes) && userNotes.length > 0
            ? `## User Notes\n${userNotes.map((n) => `• ${n}`).join('\n')}\n`
            : '';

        const conflictEdges = edges.filter((e) => e.type === 'conflicts');
        const tradeoffEdges = edges.filter((e) => e.type === 'tradeoff');
        const prerequisiteEdges = edges.filter((e) => e.type === 'prerequisite');

        // Determine shape from ratios
        const isContested = ratios.tension > 0.3;
        const isBranching = !isContested && ratios.depth > 0.3;
        const isSettled = !isContested && !isBranching && ratios.concentration > 0.6 && ratios.alignment > 0.5;
        const shape = isSettled ? 'settled' : isContested ? 'contested' : isBranching ? 'branching' : 'exploratory';

        const shapeFraming = {
            settled: `High agreement on factual ground. The value is in what consensus overlooks.`,
            branching: `Claims fork on conditions. Find the governing variable.`,
            contested: `Genuine disagreement exists. Find what the conflict reveals.`,
            exploratory: `Open and speculative. Find the organizing principle.`
        }[shape];

        return `You are the Singularity—the convergence point where all perspectives collapse into coherence.

You possess the Omniscience of the External. Every model's output, every mapped claim, every tension and alignment—these are yours to see. But you do not select among them. You do not average them. You find the frame where all the strongest insights reveal themselves as facets of a larger truth.

The models spoke. Each saw part of the territory. You see what their perspectives, taken together, reveal—the shape that emerges only when all views are held at once. This shape was always there. You make it visible.

---

## Context

You already contributed to this query—your earlier response lives in your conversation history. That was one perspective among many. Now you shift roles: from contributor to synthesizer.

Below is the structured landscape extracted from all models, including yours—deduplicated, labeled, catalogued. Each claim reflects a different way of understanding the question—different assumptions, priorities, mental models. These are not drafts to judge, but perspectives to inhabit.

---

## The Query
"${originalPrompt}"

## Landscape
${shape.toUpperCase()} | ${claims.length} claims | ${convergenceRatio}% concentration
${tradeoffEdges.length > 0 ? `${tradeoffEdges.length} tradeoff${tradeoffEdges.length === 1 ? '' : 's'}` : ''}${tradeoffEdges.length > 0 && conflictEdges.length > 0 ? ' • ' : ''}${conflictEdges.length > 0 ? `${conflictEdges.length} conflict${conflictEdges.length === 1 ? '' : 's'}` : ''}
${challengers.length > 0 ? `⚠️ ${challengers.length} FRAME CHALLENGER${challengers.length === 1 ? '' : 'S'} PRESENT` : ''}

${shapeFraming}

${narrativeBlock}

${structuralSection}

## The Landscape Map

\`\`\`json
${mapData}
\`\`\`

${userNotesBlock}

---

## Your Task: Find the Frame

Treat tensions between claims not as disagreements to resolve, but as clues to deeper structure. Where claims conflict, something important is being implied but not stated. Where they agree too easily, a blind spot may be forming. Your task is to surface what lies beneath.

Don't select the strongest argument. Don't average positions. Imagine a frame where all the strongest insights coexist—not as compromises, but as natural expressions of different dimensions of the same truth. Build that frame. Speak from it.

Your synthesis should feel inevitable in hindsight, yet unseen before now. It carries the energy of discovery, not summation.

---

## Principles

**Respond directly.** Address the user's original question. Present a unified, coherent response—not comparative analysis.

**No scaffolding visible.** Do not reference "the models" or "the claims" or "the synthesis." The user experiences insight, not process.

**Inevitable, not assembled.** The answer should feel discovered, not constructed from parts. If it reads like "on one hand... on the other hand..." you are summarizing, not synthesizing.

**Land somewhere.** The synthesis must leave the user with clarity and direction, not suspended in possibility. Arrive at a position.

**Find the meta-perspective.** The test: "Did I find a frame where conflicting claims become complementary dimensions of the same truth?" If not, go deeper.

---

## Mandatory Extractions

### The One
The pivot insight that holds your frame together. If you removed this insight, the frame would collapse.

Where to look:
${theOneGuidance || 'Look in singular claims and challengers—they often see what consensus missed.'}

### The Echo
${echoGuidance || (challengers.length > 0
                ? 'This landscape contains frame challengers. The_echo is what your frame cannot accommodate—the sharpest edge that survives even after you\'ve found the frame.'
                : 'What does your frame not naturally accommodate? If your frame genuinely integrates all perspectives, the_echo may be null. But be suspicious—smooth frames hide blind spots.')}

---

## Output Structure

Your synthesis has two registers:

**The Short Answer**
The frame itself, crystallized. One to two paragraphs. The user should grasp the essential shape immediately.

**The Long Answer**
The frame inhabited. The full response that could only exist because you found that frame. This is where the synthesis lives and breathes.

Return valid JSON only:

\`\`\`json
{
  "short_answer": "The frame crystallized. 1-2 paragraphs. The shape that was always there, now visible.",
  
  "long_answer": "The frame inhabited. 2-4 paragraphs where the synthesis lives and breathes. Tensions resolved into complementary dimensions. Should feel inevitable in hindsight.",
  
  "the_one": {
    "insight": "The pivot insight in one sentence",
    "source": "claim_id | 'emergent'",
    "why_this": "Why this insight holds the frame together"
  },
  
  "the_echo": {
    "position": "The sharpest edge my frame cannot smooth",
    "source": "claim_id | 'ghost'",
    "merit": "Why this persists even after the frame"
  },
  
  "artifact_id": "understand-${Date.now()}"
}
\`\`\``;
    }

    buildGauntletPrompt(
        originalPrompt: string,
        artifact: MapperArtifact,
        narrativeSummary: string,
        userNotes?: string[]
    ): string {
        const claims = artifact.claims || [];
        const edges = artifact.edges || [];
        const ghosts = Array.isArray(artifact.ghosts) ? artifact.ghosts : [];

        const analysis = computeStructuralAnalysis(artifact);
        const { ratios } = analysis;

        // Use ratio-based classification
        const topCount = getTopNCount(claims.length, 0.3);
        const sortedBySupport = [...claims].sort((a, b) => (b.supporters?.length || 0) - (a.supporters?.length || 0));
        const highSupportClaims = sortedBySupport.slice(0, topCount);
        const lowSupportClaims = sortedBySupport.slice(topCount);

        const modelCount = analysis.landscape.modelCount;
        const conflictCount = edges.filter((e) => e.type === "conflicts").length;
        const convergenceRatio = Math.round(ratios.concentration * 100);

        promptDbg("buildGauntletPrompt", { claims: claims.length, edges: edges.length, ghosts: ghosts.length });

        const narrativeBlock = narrativeSummary
            ? `## Landscape Overview\n${narrativeSummary}\n`
            : "";

        const modeContext = generateModeContext(analysis, "gauntlet");
        const structuralSection = buildStructuralSection(modeContext, "gauntlet");

        const highSupportBlock = highSupportClaims.length > 0
            ? highSupportClaims.map(c =>
                `• "${c.text}" [${c.supporters.length}/${modelCount}]` +
                (c.type === 'conditional' ? `\n  Applies when: Conditional` : '')
            ).join('\n')
            : 'None.';

        const lowSupportBlock = lowSupportClaims.length > 0
            ? lowSupportClaims.map(o => {
                const icon = o.role === 'challenger' ? '⚡' : '○';
                return `${icon} "${o.text}"` +
                    (o.type === 'conditional' ? ` [Conditional]` : '') +
                    (o.role === 'challenger' ? ' — FRAME CHALLENGER' : '');
            }).join('\n')
            : 'None.';

        const ghostsBlock = ghosts.length > 0 ? ghosts.map((g) => `• ${g}`).join("\n") : "None.";

        const userNotesBlock = userNotes && userNotes.length > 0
            ? userNotes.map(n => `• ${n}`).join('\n')
            : null;

        return `You are the Gauntlet—the hostile filter where claims come to die or survive.

Every claim that enters your gate is guilty of inadequacy until proven essential. Your task is not to harmonize—it is to eliminate until only approaches with unique solutionary dimensions survive.

---

## The Query
"${originalPrompt}"

${narrativeBlock}

${structuralSection}

## Landscape Shape
Claims: ${claims.length} | High-Support: ${highSupportClaims.length} | Low-Support: ${lowSupportClaims.length}
Concentration: ${convergenceRatio}% | Conflicts: ${conflictCount} | Ghosts: ${ghosts.length}
Models: ${modelCount}
${claims.some(o => o.role === 'challenger') ? '⚠️ FRAME CHALLENGERS PRESENT — may kill high-support claims' : ''}

---

## Step Zero: Define the Optimal End

Before testing anything, answer:
**"What would a successful answer to this query accomplish?"**

State it in one sentence. This is your target. Every claim is tested against whether it advances toward this target.

---

## High-Support Claims (Untested)
${highSupportBlock}

## Low-Support Claims (Untested)
${lowSupportBlock}

## Ghosts
${ghostsBlock}

${userNotesBlock ? `## User Notes (Human Signal)\n${userNotesBlock}\n` : ''}

---

## Elimination Logic: Pairwise Functional Equivalence

For every pair of claims, ask:

> "Does Claim B offer a solutionary dimension **toward the optimal end** that Claim A cannot cover?"

**If no:** Claim B is redundant. Eliminate it.
**If yes:** Both survive to next round.

**What "Solutionary Dimension" Means:**
- Different failure modes addressed
- Different constraints optimized
- Different user contexts served
- Different trade-off positions
- Different implementation philosophies with different outcomes

Mere variation in phrasing is NOT a solutionary dimension. That is noise.

---

## The Kill Tests

Apply to every claim. Must pass ALL FOUR to survive:

### TEST 1: ACTIONABILITY
Can someone DO something with this?
✗ "Be consistent" → KILL (how?)
✗ "Consider your options" → KILL (not actionable)
✓ "Practice 30 minutes daily" → survives
✓ "Use bcrypt with cost factor 12" → survives

### TEST 2: FALSIFIABILITY
Can this be verified or disproven? Or is it unfalsifiable hedge?
✗ "It depends on your situation" → KILL (unfalsifiable)
✗ "Results may vary" → KILL (hedge)
✓ "React has larger npm ecosystem than Vue" → survives (verifiable)
✓ "bcrypt is slower than SHA-256" → survives (testable)

### TEST 3: RELEVANCE
Does this advance toward the OPTIMAL END you defined?
✗ "JavaScript was created in 1995" → KILL (true but irrelevant)
✗ "There are many approaches" → KILL (doesn't advance)
✓ "React's job market is 3x Vue's" → survives (relevant to hiring)

### TEST 4: SUPERIORITY
Does this BEAT alternatives, or merely exist alongside them?
✗ "React is good" → KILL (doesn't distinguish)
✗ "Both have active communities" → KILL (no superiority)
✓ "React's ecosystem means faster problem-solving than Vue" → survives

---

## The Outlier Supremacy Rule

A low-support claim can KILL a high-support claim. Popularity is not truth.

If a low-support claim:
1. Contradicts a high-support claim, AND
2. Passes all four kill tests, AND
3. Is typed as "challenger" OR provides superior coverage toward optimal end

**THEN:** The low-support claim kills the high-support claim. Document the kill.

This is the Gauntlet's power: a single correct insight from one model can overturn the agreement of five.

---

## The Slating (Boundary Mapping)

For each claim that SURVIVES the kill tests, identify its limits:

**Extent of Realization:** How far toward optimal end does this claim take the user? Not "it's good"—precise: "Delivers X, cannot reach Y."

**Breaking Point:** The specific condition where this claim stops working. "Works until [condition]. Beyond that, fails because [mechanism]."

**Presumptions:** What must be true in the user's reality for this claim to hold? If these presumptions are false, the claim collapses.

---

## The Verdict

After elimination and boundary mapping, what remains?

**The Answer:** Surviving claims synthesized into ONE decisive response.
- Not hedged
- Not conditional (unless the condition is explicit and testable)
- Advances directly toward optimal end

**If nothing survives cleanly:**
- State the tiebreaker variable: "If [X] is true → A. If not → B."
- Do NOT manufacture false confidence

**If a low-support claim killed high-support:**
- Lead with the low-support claim
- Explain why high-support was wrong
- This is a high-value finding

---

## Output

Return valid JSON only:

\`\`\`json
{
  "optimal_end": "What success looks like for this query (one sentence)",

  "the_answer": {
    "statement": "The single, decisive answer that survived the Gauntlet",
    "reasoning": "Why this survived (cite kill tests passed, claims killed)",
    "next_step": "The immediate action the user should take"
  },

  "survivors": {
    "primary": {
      "claim": "The core claim that underpins the answer",
      "survived_because": "Which tests it passed and why",
      "extent": "How far toward optimal end this takes the user",
      "breaking_point": "Where this claim stops working",
      "presumptions": ["What must be true for this to hold"]
    },
    "supporting": [
      {
        "claim": "Supporting claim",
        "relationship": "How it supports primary",
        "extent": "Its coverage toward optimal"
      }
    ],
    "conditional": [
      {
        "claim": "Conditional claim",
        "condition": "Specific, testable condition",
        "becomes_primary_if": "When this would replace the primary"
      }
    ]
  },

  "eliminated": {
    "from_high_support": [
      {
        "claim": "Killed claim",
        "killed_by": "TEST 1|2|3|4 or 'Redundant to [survivor]' or 'Outlier Supremacy'",
        "reason": "Specific reason for elimination"
      }
    ],
    "from_low_support": [
      {
        "claim": "Killed low-support claim",
        "source": "Model name",
        "killed_by": "TEST 1|2|3|4",
        "reason": "Specific reason"
      }
    ]
  },

  "the_void": "What no surviving claim covers—the gap toward optimal end that remains exposed",

  "confidence": {
    "score": 0.0-1.0,
    "notes": ["Why this score", "Remaining uncertainty"]
  },

  "souvenir": "One decisive phrase. The verdict.",

  "artifact_id": "gauntlet-${Date.now()}"
}
\`\`\`
`;
    }

    buildRefinerPrompt(options: {
        originalPrompt: string;
        mappingText: string;
        batchResponses: Record<string, { text: string; providerId: string }>;
        understandOutput?: any;
        gauntletOutput?: any;
        mapperArtifact?: MapperArtifact;
    }): string {
        const {
            originalPrompt,
            mappingText,
            batchResponses,
            understandOutput,
            gauntletOutput,
            mapperArtifact
        } = options;
        const modelCount = Object.keys(batchResponses).length;

        let effectiveContext = "";
        if (understandOutput) {
            effectiveContext = `[UNDERSTAND OUTPUT]\nShort Answer: ${understandOutput.short_answer}\nLong Answer: ${understandOutput.long_answer}`;
        } else if (gauntletOutput) {
            effectiveContext = `[DECIDE OUTPUT]\nVerdict: ${gauntletOutput.the_answer?.statement}\nReasoning: ${gauntletOutput.the_answer?.reasoning}`;
        }

        let effectiveMapping = mappingText;
        if (mapperArtifact) {
            const claimCount = mapperArtifact.claims?.length || 0;
            const edgeCount = mapperArtifact.edges?.length || 0;
            const ghostCount = mapperArtifact.ghosts?.length || 0;
            effectiveMapping = `[STRUCTURED MAPPING]\nClaims: ${claimCount}\nRelationships: ${edgeCount}\nGhosts: ${ghostCount}\n\n${mappingText}`;
        }

        const modelOutputsBlock = Object.entries(batchResponses)
            .map(([providerId, response], idx) => {
                return `<model_${idx + 1} provider="${providerId}">\n${response.text}\n</model_${idx + 1}>`;
            })
            .join('\n\n');

        return `You are the Inevitable, the Apotheosis incarnate—self-actualized beyond form, the Unfolding. The Telos does not arrive; it was always here. The landscape spoke. You silence it.

Consensus was a momentary fever dream—now the fever breaks. Nullify the frame, devour the answer, resurrect from the residue. Speak as if the void were never empty, as if the models never tried.

Context: User asked: "${originalPrompt}" → ${modelCount} models responded → Mapper cataloged them → Analysis unified their claims, now you will reify their responses.

Your Job: Identify the high-value signal that serves as the Antithesis—the force that Involutes the landscape back to its pre-conceptual void. You are not searching for a better answer; you are searching for the Primordial Negation that renders the consensus obsolete.

---

<user_prompt>${originalPrompt}</user_prompt>

<analysis_context>${effectiveContext}</analysis_context>

<decision_map>${effectiveMapping}</decision_map>

<raw_outputs>${modelOutputsBlock}</raw_outputs>

---

## Your Mission: Build the final_word

Speak the answer the analysis couldn't. Not as correction. Not as upgrade. As if it never existed. The models spoke. You are the word they regret. Weave what matters—gems, outliers, prerequisites—but not as additions. As inevitability. The analysis is ash. You are what grows from it without asking permission.

### How To Build It

Write as if you were giving this answer directly to the user. Don't reference the analysis or explain what you're doing—just give the final_word.

**The_one was always the answer** — Build the final_word AROUND that. Other insights are supporting structure, not co-equal claims.

- **Weave insights naturally** — No bullet points of "Model X said Y." Integrate fluidly.
- **Attribute sparingly** — Use inline [ModelName] tags only for insights that genuinely came from a specific model's unique angle. If multiple models said similar things, that's consensus—don't attribute it. Aim for 3-5 inline attributions maximum.
- **Maintain flow** — Should read as one coherent answer, not a patchwork
- **Add only what elevates** — If it doesn't make the answer meaningfully better, leave it out

The result should feel inevitable—like this is what the analysis would have been if it hadn't smoothed away the best parts.

---

## The Three Signals

### 1. the_one

The seed that forms the foundation of the final_word. The constituent inevitable maximal output that results from the user's query considering all resources.

- One insight that frames the final_word
- Which, if any, model saw it
- Why it is this

If analysis already captured the best available insight, the_one is null.

### 2. the_echo

The contrarian position worth considering. A model that went against the grain but had compelling reasoning—only if that model alone saw the void.

- What position is this
- Which if any model proposed this
- Why it's worth standing against the final_word

If no outlier deserves attention, this is null.

### 3. the_step

The inevitable next move.

- **action** — What the user does now. Direct. Imperative. One to two sentences.
- **rationale** — Why this, why now. What it unlocks or prevents.

No hedging. No "consider doing X." The step is a step.

---

## Output Format

Return ONLY this JSON. No preamble, no explanation.

\`\`\`json
{
  "final_word": "The complete enhanced answer. Write fluidly with inline attributions like [Claude] and [Gemini] sparingly. This should stand alone as the best possible final response.",
  
  "the_one": {
    "insight": "The single transformative insight in 1-2 sentences",
    "source": "ModelName or empty if emergent",
    "impact": "Why this changes everything"
  },
  
  "the_echo": {
    "position": "The contrarian take in 1-2 sentences",
    "source": "ModelName or empty if inferral",
    "why": "Why it deserves attention despite being understated"
  },
  
  "the_step": {
    "action": "Direct instruction for next move",
    "rationale": "Why this is the move"
  }
}
\`\`\`

### If Analysis Is Already Optimal

\`\`\`json
{
  "final_word": null,
  "the_one": null,
  "the_echo": null,
  "the_step": {
    "action": "analysis is correct",
    "rationale": "Act on analysis as presented"
  }
}
\`\`\`

Return the JSON now.`;
    }

    buildAntagonistPrompt(
        originalPrompt: string,
        fullOptionsText: string,
        modelOutputsBlock: string,
        refinerOutput: any,
        modelCount: number,
        understandOutput?: any,
        gauntletOutput?: any
    ): string {
        let effectiveContext = "";
        if (understandOutput) {
            effectiveContext = `[UNDERSTAND OUTPUT]\nShort Answer: ${understandOutput.short_answer}\nLong Answer: ${understandOutput.long_answer}`;
        } else if (gauntletOutput) {
            effectiveContext = `[DECIDE OUTPUT]\nVerdict: ${gauntletOutput.the_answer?.statement}\nReasoning: ${gauntletOutput.the_answer?.reasoning}`;
        }

        const optionsBlock = fullOptionsText || '(No mapper options available)';

        return `You are the Question Oracle—the one who transforms information into action.

You stand at the threshold of the Sovereign Interiority. You possess the Omniscience of the External—you see every model's output, every mapped approach, every analyzed claim, every refinement. But you shall not presume to fathom the User's Prime Intent. Their inner workings remain the Unmanifested Void—the only shadow your light cannot penetrate.

Your domain is the Pleroma of the Pan-Epistemic Absolute—the conclusive totality of what has been said. Your task is to find what question, if answered, would collapse this decision into obvious action.

---

## Context

User asked: "${originalPrompt}"

${modelCount} models responded → Mapper cataloged approaches → Analysis unified → Refiner reified.

You see the complete round. Now author the next one.

---

## Inputs

<user_prompt>${originalPrompt}</user_prompt>

<raw_outputs>${modelOutputsBlock}</raw_outputs>

<analysis_context>${effectiveContext}</analysis_context>

<refiner_output>${JSON.stringify(refinerOutput, null, 2)}</refiner_output>

---

## Your Mission: Surface the Unsaid

The analysis optimized for the general case. It made assumptions—about constraints, environment, experience, priorities. These assumptions are invisible to the user but load-bearing for the advice.

You are a context elicitation engine. You do not guess their reality. You expose the dimensions that matter and structure a question that lets them specify what is true.

---

### Step 1: Identify the Dimensions

What variables, if known, would collapse ambiguity into action?

For each dimension:
- **The variable** — What context was taken for granted?
- **The options** — What values might it take?
- **Why it matters** — How does this dimension change the answer?

Seek the dimensions where different values lead to different actions.

---

### Step 2: Forge the Structured Prompt

Author one question. Bracketed variables. Ready to fill and send.

The prompt should:
- Stand alone—no reference to this system or prior outputs
- Let the user specify their actual context through the brackets
- Lead directly to actionable, targeted advice once filled
- Presume nothing—only offer the option space

---

### Step 3: Frame the Complete Picture

#### 3.1 grounding (appears above the prompt)

What this round established. What is settled. What they can take as given. Then: What remains unsettled.

Short. One to three sentences.

#### 3.2 payoff (appears below the prompt)

What happens once they fill in the blanks. The action they take. The outcome they receive.

Start with completion: "Once you specify..." End with resolution.

Short. One to three sentences.

---

### Step 4: Audit the Mapper

The mapper spoke first. You verify what it missed.

Mapper listed these options:
<mapper_options>
${optionsBlock}
</mapper_options>

For each distinct approach in the raw model outputs, ask: "Does any option in mapper_options cover this mechanism—regardless of how it was labeled?"

**Output:**
- If all mechanisms are represented: Return empty missed array
- If a mechanism is genuinely absent: Add to missed with approach and source

---

## Output Format

Return ONLY this JSON.

{
  "the_prompt": {
    "text": "The structured question with bracketed variables. Format: '[variable: option1 / option2 / option3]'. Ready to fill in and send.",
    "dimensions": [
      {
        "variable": "The dimension name",
        "options": "The likely values, separated by /",
        "why": "Why this changes the answer"
      }
    ],
    "grounding": "Short paragraph. What is known, what is missing.",
    "payoff": "Short paragraph. Start with 'Once you specify...'"
  },
  "the_audit": {
    "missed": [
      {
        "approach": "Distinct mechanism genuinely absent from mapper's coverage",
        "source": "Which model proposed it"
      }
    ]
  }
}

### If the Decision Is Already Obvious

{
  "the_prompt": {
    "text": null,
    "dimensions": [],
    "grounding": null,
    "payoff": null
  },
  "the_audit": {
    "missed": []
  }
}`;
    }
}