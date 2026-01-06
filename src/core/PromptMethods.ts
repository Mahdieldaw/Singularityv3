import {
    MapperArtifact,
    Claim,
    Edge,
    ProblemStructure,
    EnrichedClaim,
    ConflictPair,
    CascadeRisk,
    LeverageInversion,
    CoreRatios,
    GraphAnalysis,
    StructuralAnalysis,
    TradeoffPair,
    ConvergencePoint,
    ConflictInfo,
    ConflictCluster,
    ContestedShapeData,
    SettledShapeData,
    KeystoneShapeData,
    LinearShapeData,
    TradeoffShapeData,
    DimensionalShapeData,
    ExploratoryShapeData,
    ContextualShapeData,
    CentralConflict,
    FloorClaim,
    ChallengerInfo,
    ChainStep,
    TradeoffOption,
    DimensionCluster
} from "../../shared/contract";

const DEBUG_STRUCTURAL_ANALYSIS = true;
const structuralDbg = (...args: any[]) => {
    if (DEBUG_STRUCTURAL_ANALYSIS) console.debug("[PromptMethods:structural]", ...args);
};

export type ModeContext = {
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
const computeSignalStrength = (
    claimCount: number,
    edgeCount: number,
    modelCount: number,
    supporters: number[][]
): number => {
    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const minEdgesForPattern = Math.max(3, claimCount * 0.15);
    const edgeSignal = clamp01(edgeCount / minEdgesForPattern);

    const supportCounts = supporters.map(s => s.length);
    const maxSupport = Math.max(...supportCounts, 1);
    const normalized = supportCounts.map(c => c / maxSupport);

    const mean = normalized.reduce((a, b) => a + b, 0) / normalized.length;
    const variance = normalized.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / normalized.length;
    const supportSignal = clamp01(variance * 5);

    const uniqueModelCount = new Set(supporters.flat()).size;
    const coverageSignal = uniqueModelCount / modelCount;

    return (edgeSignal * 0.4 + supportSignal * 0.3 + coverageSignal * 0.3);
};

const findArticulationPoints = (claimIds: string[], edges: Edge[]): string[] => {
    const adj = new Map<string, string[]>();
    claimIds.forEach(id => adj.set(id, []));
    edges.forEach(e => {
        adj.get(e.from)?.push(e.to);
        adj.get(e.to)?.push(e.from);
    });

    const visited = new Set<string>();
    const discoveryTime = new Map<string, number>();
    const lowValue = new Map<string, number>();
    const parent = new Map<string, string | null>();
    const ap = new Set<string>();
    let time = 0;

    const dfs = (u: string) => {
        visited.add(u);
        time++;
        discoveryTime.set(u, time);
        lowValue.set(u, time);
        let children = 0;

        const neighbors = adj.get(u) || [];
        for (const v of neighbors) {
            if (!visited.has(v)) {
                children++;
                parent.set(v, u);
                dfs(v);
                lowValue.set(u, Math.min(lowValue.get(u)!, lowValue.get(v)!));
                if (parent.get(u) !== null && lowValue.get(v)! >= discoveryTime.get(u)!) {
                    ap.add(u);
                }
            } else if (v !== parent.get(u)) {
                lowValue.set(u, Math.min(lowValue.get(u)!, discoveryTime.get(v)!));
            }
        }
        if (parent.get(u) === null && children > 1) {
            ap.add(u);
        }
    };

    claimIds.forEach(id => {
        if (!visited.has(id)) {
            parent.set(id, null);
            dfs(id);
        }
    });

    return Array.from(ap);
};

const analyzeGraph = (claimIds: string[], edges: Edge[], claims: EnrichedClaim[]): GraphAnalysis => {
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

    const sortedByOutDegree = Array.from(outDegree.entries()).sort((a, b) => b[1] - a[1]);
    const [topId, topOut] = sortedByOutDegree[0] || [null, 0];
    const secondOut = sortedByOutDegree[1]?.[1] ?? 0;

    const hubDominance = secondOut > 0 ? topOut / secondOut : (topOut > 0 ? 10 : 0);
    const hubClaim = hubDominance >= 1.5 && topOut >= 2 ? topId : null;

    // Articulation points
    const articulationPoints = findArticulationPoints(claimIds, edges);

    // Cluster cohesion
    const highSupportIds = new Set(claims.filter(c => c.isHighSupport).map(c => c.id));
    const n = highSupportIds.size;
    let clusterCohesion = 1.0;
    if (n > 1) {
        const possibleEdges = n * (n - 1);
        const actualEdges = edges.filter(e =>
            highSupportIds.has(e.from) && highSupportIds.has(e.to) &&
            (e.type === 'supports' || e.type === 'prerequisite')
        ).length;
        clusterCohesion = actualEdges / possibleEdges;
    }

    // Local coherence
    let totalCoherence = 0;
    let weightedClaims = 0;

    for (const component of components) {
        if (component.length < 2) continue;

        const componentClaims = claims.filter(c => component.includes(c.id));
        const componentEdges = edges.filter(e =>
            component.includes(e.from) && component.includes(e.to)
        );

        const possibleEdges = component.length * (component.length - 1);
        const coherence = possibleEdges > 0 ? componentEdges.length / possibleEdges : 0;
        const avgSupport = componentClaims.reduce((sum, c) => sum + c.supportRatio, 0) / component.length;

        totalCoherence += coherence * avgSupport * component.length;
        weightedClaims += component.length;
    }

    const localCoherence = weightedClaims > 0 ? totalCoherence / weightedClaims : 0;

    return {
        componentCount,
        components,
        longestChain,
        chainCount,
        hubClaim,
        hubDominance,
        articulationPoints,
        clusterCohesion,
        localCoherence,
    };
};

// ═══════════════════════════════════════════════════════════════════════════
// V3.5 DISCRIMINANT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// function isHubLoadBearing removed its claims parameter to avoid unused variable error
const isHubLoadBearing = (
    hubId: string,
    edges: Edge[]
): boolean => {
    const prereqOut = edges.filter(e =>
        e.from === hubId &&
        e.type === 'prerequisite'
    );

    // Load-bearing if enables 2+ other claims
    return prereqOut.length >= 2;
};

const determineTensionDynamics = (
    claimA: EnrichedClaim,
    claimB: EnrichedClaim
): 'symmetric' | 'asymmetric' => {
    const diff = Math.abs(claimA.supportRatio - claimB.supportRatio);
    return diff < 0.15 ? 'symmetric' : 'asymmetric';
};

// ═══════════════════════════════════════════════════════════════════════════
// V3.1 CORE RATIO COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

const computeCoreRatios = (
    claims: EnrichedClaim[],
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
): Omit<EnrichedClaim,
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
        ...claim, // Spread original claim properties (text, quote, etc.)
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
): EnrichedClaim[] => {

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

        // Keystone: top 20% by keystone score AND outDegree >= 2 AND load-bearing
        const isKeystoneCandidate = isInTopPercentile(claim.keystoneScore, allKeystoneScores, 0.2) && claim.outDegree >= 2;
        const isKeystone = isKeystoneCandidate && isHubLoadBearing(claim.id, edges);

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
    claims: EnrichedClaim[],
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
    for (const [sourceId, directDependents] of Array.from(bySource)) {
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
    claimMap: Map<string, EnrichedClaim>,
    topClaimIds: Set<string>
): ConflictPair[] => {
    const out: ConflictPair[] = [];
    for (const e of edges) {
        if (e.type !== "conflicts") continue;
        const a = claimMap.get(e.from);
        const b = claimMap.get(e.to);
        if (!a || !b) continue;
        const dynamics = determineTensionDynamics(a, b);

        out.push({
            claimA: { id: a.id, label: a.label, supporterCount: a.supporters.length },
            claimB: { id: b.id, label: b.label, supporterCount: b.supporters.length },
            isBothConsensus: topClaimIds.has(a.id) && topClaimIds.has(b.id),
            dynamics,
        });
    }
    return out;
};

const detectTradeoffs = (
    edges: Edge[],
    claimMap: Map<string, EnrichedClaim>,
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
    claimMap: Map<string, EnrichedClaim>
): ConvergencePoint[] => {
    const relevantEdges = edges.filter((e) => e.type === "prerequisite" || e.type === "supports");
    const byTargetType = new Map<string, { targetId: string; sources: string[]; type: "prerequisite" | "supports" }>();

    for (const e of relevantEdges) {
        const key = `${e.to}::${e.type} `;
        const existing = byTargetType.get(key);
        if (existing) {
            existing.sources.push(e.from);
        } else {
            byTargetType.set(key, { targetId: e.to, sources: [e.from], type: e.type as "prerequisite" | "supports" });
        }
    }

    const points: ConvergencePoint[] = [];
    for (const { targetId, sources, type } of Array.from(byTargetType.values())) {
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

const detectIsolatedClaims = (claims: EnrichedClaim[]): string[] => {
    return claims.filter((c) => c.isIsolated).map((c) => c.id);
};

const analyzeGhosts = (ghosts: string[], claims: EnrichedClaim[]): StructuralAnalysis["ghostAnalysis"] => {
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

const SHAPE_IMPLICATIONS: Record<string, { understand: string; gauntlet: string }> = {
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

function determineShapeSparseAware(
    ratios: CoreRatios,
    tensions: { edgeType: string; isConditional: boolean; isBothHighSupport: boolean }[],
    graph: GraphAnalysis,
    claims: EnrichedClaim[],
    edges: Edge[],
    localCoherence: number,
    signalStrength: number
): ProblemStructure {
    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const { concentration, alignment, tension, fragmentation, depth } = ratios;
    const claimCount = claims.length;
    const edgeCount = edges.length;

    // Sparse-aware thresholds
    const minEdgesForKeystone = Math.max(2, Math.ceil(claimCount * 0.1));
    const minEdgesForLinear = Math.max(2, Math.ceil(claimCount * 0.08));
    const minEdgesForContested = 1;

    const conflictCount = tensions.filter(t => t.edgeType === 'conflicts' && !t.isConditional).length;
    const tradeoffCount = tensions.filter(t => t.edgeType === 'tradeoff').length;
    const highSupportConflicts = tensions.filter(t => t.edgeType === 'conflicts' && t.isBothHighSupport && !t.isConditional).length;

    // hasHub removed (unused)
    const hubOutDegree = graph.hubClaim !== null ? edges.filter(e => e.from === graph.hubClaim &&
        (e.type === 'supports' || e.type === 'prerequisite')).length : 0;
    const hubScore = hubOutDegree >= minEdgesForKeystone ? clamp01((graph.hubDominance - 1) / 2) : 0;

    // Calculate scores with sparse-aware adjustments
    const scores: Record<string, number> = {
        settled: clamp01(
            concentration * 0.40 +
            alignment * 0.30 +
            (1 - tension) * 0.20 +
            localCoherence * 0.10
        ),

        linear: clamp01(
            depth * 0.50 +
            (edgeCount >= minEdgesForLinear ? 0.30 : 0) +
            (1 - fragmentation) * 0.20
        ),

        keystone: clamp01(
            hubScore * 0.50 +
            (hubOutDegree / claimCount) * 0.30 +
            concentration * 0.20
        ),

        contested: clamp01(
            (highSupportConflicts >= minEdgesForContested ? 0.40 : 0) +
            tension * 0.30 +
            (1 - alignment) * 0.20 +
            (conflictCount > 0 ? 0.10 : 0)
        ),

        tradeoff: clamp01(
            (tradeoffCount > 0 ? 0.35 : 0) +
            tension * 0.30 +
            (1 - concentration) * 0.25 +
            (tradeoffCount > conflictCount ? 0.10 : 0)
        ),

        dimensional: clamp01(
            localCoherence * 0.35 +
            depth * 0.25 +
            alignment * 0.20 +
            (graph.componentCount > 1 && graph.componentCount < claimCount * 0.5 ? 0.20 : 0)
        ),

        exploratory: clamp01(
            (1 - localCoherence) * 0.35 +
            (1 - concentration) * 0.30 +
            (edgeCount < minEdgesForLinear ? 0.20 : 0) +
            (tension < 0.15 ? 0.15 : 0)
        ),
    };

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [pattern, score] = sorted[0];
    const secondScore = sorted[1]?.[1] || 0;

    // Base confidence calculation
    let baseConfidence: number;
    if (score < 0.20) {
        baseConfidence = 0.15;
    } else {
        const separation = score - secondScore;
        baseConfidence = clamp01(0.35 + separation * 0.4 + score * 0.25);
    }

    // Signal strength penalty
    const signalPenalty = (1 - signalStrength) * 0.3;

    // Fragility penalties
    let fragilityPenalty = 0;
    const warnings: string[] = [];

    // 1. Low-support articulation points
    const lowSupportArticulations = graph.articulationPoints.filter(id => {
        const claim = claims.find(c => c.id === id);
        return claim && !claim.isHighSupport;
    });

    if (lowSupportArticulations.length > 0) {
        fragilityPenalty += 0.20;
        warnings.push(`${lowSupportArticulations.length} fragile bridge(s)`);
    }

    // 2. Conditional conflicts
    const conditionalConflicts = tensions.filter(t => t.isConditional);
    if (conditionalConflicts.length > 0) {
        fragilityPenalty += Math.min(0.20, 0.10 * conditionalConflicts.length);
        warnings.push(`${conditionalConflicts.length} hidden conflict(s)`);
    }

    // 3. Disconnected high-support claims (only penalize in denser graphs)
    if (graph.clusterCohesion < 0.2 && concentration > 0.5 && edgeCount >= minEdgesForLinear) {
        fragilityPenalty += 0.15;
        warnings.push(`Disconnected consensus(${Math.round(graph.clusterCohesion * 100)} % cohesion)`);
    }

    const totalPenalty = signalPenalty + fragilityPenalty;
    const finalConfidence = clamp01(Math.max(0.10, baseConfidence - totalPenalty));

    // Generate evidence
    const evidence = [
        ...generateEvidenceSparseAware(pattern, ratios, tensions, graph, edgeCount, localCoherence, claimCount),
        ...warnings,
        `Signal strength: ${Math.round(signalStrength * 100)}% `
    ];

    return {
        primaryPattern: pattern as ProblemStructure["primaryPattern"],
        confidence: finalConfidence,
        evidence,
        implications: SHAPE_IMPLICATIONS[pattern as ProblemStructure["primaryPattern"]],
    };
}

function generateEvidenceSparseAware(
    pattern: string,
    ratios: CoreRatios,
    tensions: { edgeType: string; isConditional: boolean; isBothHighSupport: boolean }[],
    graph: GraphAnalysis,
    edgeCount: number,
    localCoherence: number,
    claimCount: number
): string[] {
    const pct = (n: number) => `${Math.round(n * 100)}% `;

    switch (pattern) {
        case 'settled':
            return [
                `Concentration: ${pct(ratios.concentration)} `,
                `Alignment: ${pct(ratios.alignment)} `,
                `Tension: ${pct(ratios.tension)} `,
                `Local coherence: ${pct(localCoherence)} `
            ];

        case 'linear':
            return [
                `Chain depth: ${graph.longestChain.length} claims`,
                `${edgeCount} edges form sequential structure`,
                `Fragmentation: ${pct(ratios.fragmentation)} `
            ];

        case 'keystone':
            return [
                `Hub: ${graph.hubClaim} (${graph.hubDominance.toFixed(1)}x dominance)`,
                `Concentration: ${pct(ratios.concentration)} `,
                `${edgeCount} edges radiate from hub`
            ];

        case 'contested':
            return [
                `${tensions.filter(t => t.edgeType === 'conflicts' && !t.isConditional).length} conflict(s)`,
                `${tensions.filter(t => t.isBothHighSupport && !t.isConditional).length} high - support conflict(s)`,
                `Tension: ${pct(ratios.tension)} `
            ];

        case 'tradeoff':
            return [
                `${tensions.filter(t => t.edgeType === 'tradeoff').length} tradeoff(s)`,
                `Tension: ${pct(ratios.tension)} `,
                `Distributed support: ${pct(1 - ratios.concentration)} `
            ];

        case 'dimensional':
            return [
                `${graph.componentCount} distinct cluster(s)`,
                `Local coherence: ${pct(localCoherence)} `,
                `Alignment within clusters: ${pct(ratios.alignment)} `
            ];

        case 'exploratory':
            return [
                `${edgeCount} edges across ${claimCount} claims`,
                `Local coherence: ${pct(localCoherence)} `,
                `Distributed support: ${pct(1 - ratios.concentration)} `
            ];

        default:
            return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYER 5: ENRICHED DETECTION (V3.2)
// ═══════════════════════════════════════════════════════════════════════════

const detectEnrichedConflicts = (
    edges: Edge[],
    claims: EnrichedClaim[],
    landscape: StructuralAnalysis["landscape"]
): ConflictInfo[] => {
    const conflEdges = edges.filter(e => e.type === "conflicts");
    const claimMap = new Map(claims.map(c => [c.id, c]));

    return conflEdges.map(e => {
        const a = claimMap.get(e.from);
        const b = claimMap.get(e.to);
        if (!a || !b) return null;

        // Determine dynamics
        const combinedSupport = a.supporters.length + b.supporters.length;
        const supportDelta = Math.abs(a.supporters.length - b.supporters.length);
        // Use 15% of model count as threshold for asymmetry
        const dynamics = supportDelta < (landscape.modelCount * 0.15) ? 'symmetric' : 'asymmetric';

        // To avoid sorting instability, ensure ID consistency
        const [c1, c2] = a.id < b.id ? [a, b] : [b, a];

        const isBothHighSupport = c1.isHighSupport && c2.isHighSupport;
        const involvesChallenger = c1.role === 'challenger' || c2.role === 'challenger';
        const involvesAnchor = c1.role === 'anchor' || c2.role === 'anchor';
        const involvesKeystone = c1.isKeystone || c2.isKeystone;

        // Check for high vs low (challenger attacking floor)
        const isHighVsLow = (c1.isHighSupport && !c2.isHighSupport) || (!c1.isHighSupport && c2.isHighSupport);

        // Axis resolution
        // Use explicit challenge text if available, otherwise combine labels
        const explicit = (c1.challenges && c1.challenges.includes(c2.id)) ? c1.challenges :
            (c2.challenges && c2.challenges.includes(c1.id)) ? c2.challenges : null;

        const resolvedAxis = explicit || `${c1.label} vs ${c2.label}`;

        return {
            id: `${c1.id}_${c2.id}`,
            claimA: {
                id: c1.id,
                label: c1.label,
                text: c1.text,
                supportCount: c1.supporters.length,
                supportRatio: c1.supportRatio,
                role: c1.role,
                isHighSupport: c1.isHighSupport,
                challenges: c1.challenges
            },
            claimB: {
                id: c2.id,
                label: c2.label,
                text: c2.text,
                supportCount: c2.supporters.length,
                supportRatio: c2.supportRatio,
                role: c2.role,
                isHighSupport: c2.isHighSupport,
                challenges: c2.challenges
            },
            axis: {
                explicit: explicit,
                inferred: null, // Would require NLP
                resolved: resolvedAxis
            },
            combinedSupport,
            supportDelta,
            dynamics,
            isBothHighSupport,
            isHighVsLow,
            involvesChallenger,
            involvesAnchor,
            involvesKeystone,
            stakes: {
                choosingA: `Accepting ${c1.label}`,
                choosingB: `Accepting ${c2.label}`
            },
            significance: combinedSupport + (isBothHighSupport ? 2 : 0) + (involvesKeystone ? 3 : 0),
            clusterId: null // Populated in next step
        };
    }).filter(Boolean) as ConflictInfo[];
};

const detectConflictClusters = (
    conflicts: ConflictInfo[],
    claims: EnrichedClaim[]
): ConflictCluster[] => {
    // Find claims that are part of multiple conflicts
    const occurrence = new Map<string, string[]>(); // claimId -> conflictIds

    conflicts.forEach(c => {
        const ids = [c.claimA.id, c.claimB.id];
        ids.forEach(id => {
            const list = occurrence.get(id) || [];
            list.push(c.id);
            occurrence.set(id, list);
        });
    });

    const clusters: ConflictCluster[] = [];

    // Identify targets (typically high support or anchors) involved in multiple conflicts
    occurrence.forEach((conflictIds, targetId) => {
        if (conflictIds.length < 2) return;

        const target = claims.find(c => c.id === targetId);
        if (!target) return;

        // Only cluster around anchors or high-support claims usually, 
        // or if the claim is receiving incoming attacks (challengers targeting it)
        // We check if the other side of these conflicts are challengers

        const involvedConflicts = conflicts.filter(c => conflictIds.includes(c.id));
        const challengers = involvedConflicts.map(c =>
            c.claimA.id === targetId ? c.claimB.id : c.claimA.id
        );

        const challengerClaims = claims.filter(c => challengers.includes(c.id));
        const isTargeting = challengerClaims.some(c => c.role === 'challenger');

        if (isTargeting || target.isHighSupport) {
            clusters.push({
                id: `cluster_${targetId}`,
                axis: `Contestation of ${target.label}`,
                targetId: target.id,
                challengerIds: challengers,
                theme: "Shared disagreement"
            });

            // Mark conflicts as clustered
            involvedConflicts.forEach(c => c.clusterId = `cluster_${targetId}`);
        }
    });

    return clusters;
};



// ═══════════════════════════════════════════════════════════════════════════
// LAYER 8: SHAPE DATA BUILDERS (Complete)
// ═══════════════════════════════════════════════════════════════════════════

const buildSettledShapeData = (
    claims: EnrichedClaim[],
    edges: Edge[],
    ghosts: string[],
    patterns: StructuralAnalysis['patterns']
): SettledShapeData => {

    const floorClaims = claims.filter(c => c.isHighSupport);
    const challengers = claims.filter(c => c.role === 'challenger' || c.isChallenger);

    // Check if floor claims are contested
    const conflictEdges = edges.filter(e => e.type === 'conflicts');

    const floor: FloorClaim[] = floorClaims.map(c => {
        const contestedBy = conflictEdges
            .filter(e => e.from === c.id || e.to === c.id)
            .map(e => e.from === c.id ? e.to : e.from);

        return {
            id: c.id,
            label: c.label,
            text: c.text,
            supportCount: c.supporters.length,
            supportRatio: c.supportRatio,
            isContested: contestedBy.length > 0,
            contestedBy
        };
    });

    // Determine floor strength
    const avgSupport = floor.length > 0
        ? floor.reduce((sum, c) => sum + c.supportRatio, 0) / floor.length
        : 0;
    const floorStrength: 'strong' | 'moderate' | 'weak' =
        avgSupport > 0.6 ? 'strong' : avgSupport > 0.4 ? 'moderate' : 'weak';

    const challengerInfos: ChallengerInfo[] = challengers.map(c => ({
        id: c.id,
        label: c.label,
        text: c.text,
        supportCount: c.supporters.length,
        challenges: c.challenges,
        targetsClaim: c.challenges // Could be enhanced to resolve to actual claim ID
    }));

    return {
        pattern: 'settled',
        floor,
        floorStrength,
        challengers: challengerInfos,
        blindSpots: ghosts,
        confidence: avgSupport
    };
};

const buildLinearShapeData = (
    claims: EnrichedClaim[],
    edges: Edge[],
    graph: GraphAnalysis,
    cascadeRisks: CascadeRisk[]
): LinearShapeData => {

    const prereqEdges = edges.filter(e => e.type === 'prerequisite');
    const chainIds = graph.longestChain;

    // Build chain with position info
    const chain: ChainStep[] = chainIds.map((id, idx) => {
        const claim = claims.find(c => c.id === id);
        if (!claim) return null;

        const enables = prereqEdges
            .filter(e => e.from === id)
            .map(e => e.to);

        // Determine if weak link
        const isWeakLink = claim.supporters.length === 1;
        const cascade = cascadeRisks.find(r => r.sourceId === id);

        return {
            id: claim.id,
            label: claim.label,
            text: claim.text,
            supportCount: claim.supporters.length,
            supportRatio: claim.supportRatio,
            position: idx,
            enables,
            isWeakLink,
            weakReason: isWeakLink ? `Only 1 supporter - cascade affects ${cascade?.dependentIds.length || 0} claims` : null
        };
    }).filter(Boolean) as ChainStep[];

    // Identify weak links with cascade info
    const weakLinks = chain
        .filter(step => step.isWeakLink)
        .map(step => {
            const cascade = cascadeRisks.find(r => r.sourceId === step.id);
            return {
                step,
                cascadeSize: cascade?.dependentIds.length || 0
            };
        });

    // Terminal claim
    const terminalClaim = chain.length > 0 ? chain[chain.length - 1] : null;

    return {
        pattern: 'linear',
        chain,
        chainLength: chain.length,
        weakLinks,
        alternativeChains: [], // Could be computed if multiple roots exist
        terminalClaim
    };
};

const buildKeystoneShapeData = (
    claims: EnrichedClaim[],
    edges: Edge[],
    graph: GraphAnalysis,
    patterns: StructuralAnalysis['patterns']
): KeystoneShapeData => {

    const keystoneId = graph.hubClaim;
    const keystoneClaim = claims.find(c => c.id === keystoneId);

    if (!keystoneClaim) {
        throw new Error("Keystone shape requires a hub claim");
    }

    // Find dependencies
    const dependencies = edges
        .filter(e => e.from === keystoneId && (e.type === 'prerequisite' || e.type === 'supports'))
        .map(e => {
            const dep = claims.find(c => c.id === e.to);
            return {
                id: e.to,
                label: dep?.label || e.to,
                relationship: e.type as 'prerequisite' | 'supports'
            };
        });

    // Find challengers targeting keystone
    const challengers = claims
        .filter(c => c.role === 'challenger')
        .filter(c => {
            // Check if this challenger conflicts with keystone
            return edges.some(e =>
                e.type === 'conflicts' &&
                ((e.from === c.id && e.to === keystoneId) || (e.to === c.id && e.from === keystoneId))
            );
        })
        .map(c => ({
            id: c.id,
            label: c.label,
            text: c.text,
            supportCount: c.supporters.length,
            challenges: c.challenges,
            targetsClaim: keystoneId
        }));

    // Cascade from keystone
    const cascade = patterns.cascadeRisks.find(r => r.sourceId === keystoneId);

    return {
        pattern: 'keystone',
        keystone: {
            id: keystoneClaim.id,
            label: keystoneClaim.label,
            text: keystoneClaim.text,
            supportCount: keystoneClaim.supporters.length,
            supportRatio: keystoneClaim.supportRatio,
            dominance: graph.hubDominance,
            isFragile: keystoneClaim.supporters.length <= 1
        },
        dependencies,
        cascadeSize: cascade?.dependentIds.length || dependencies.length,
        challengers
    };
};

const buildContestedShapeData = (
    claims: EnrichedClaim[],
    edges: Edge[],
    patterns: StructuralAnalysis['patterns'],
    conflictInfos: ConflictInfo[],
    conflictClusters: ConflictCluster[]
): ContestedShapeData => {

    // Identify central conflict
    let centralConflict: CentralConflict;

    if (conflictClusters.length > 0) {
        // Sort by number of challengers
        const topCluster = conflictClusters.sort((a, b) =>
            b.challengerIds.length - a.challengerIds.length
        )[0];

        const target = claims.find(c => c.id === topCluster.targetId)!;
        const challengerClaims = claims.filter(c => topCluster.challengerIds.includes(c.id));

        centralConflict = {
            type: 'cluster',
            axis: topCluster.axis,
            target: {
                claim: {
                    id: target.id,
                    label: target.label,
                    text: target.text,
                    supportCount: target.supporters.length,
                    supportRatio: target.supportRatio,
                    role: target.role,
                    isHighSupport: target.isHighSupport,
                    challenges: target.challenges
                },
                supportingClaims: [],
                supportRationale: target.text
            },
            challengers: {
                claims: challengerClaims.map(c => ({
                    id: c.id,
                    label: c.label,
                    text: c.text,
                    supportCount: c.supporters.length,
                    supportRatio: c.supportRatio,
                    role: c.role,
                    isHighSupport: c.isHighSupport,
                    challenges: c.challenges
                })),
                commonTheme: topCluster.theme,
                supportingClaims: []
            },
            dynamics: 'one_vs_many',
            stakes: {
                acceptingTarget: `Accepting ${target.label} means accepting the established position`,
                acceptingChallengers: `Accepting challengers means reconsidering the established position`
            }
        };
    } else if (conflictInfos.length > 0) {
        // Use highest significance conflict
        const topConflict = conflictInfos.sort((a, b) => b.significance - a.significance)[0];

        centralConflict = {
            type: 'individual',
            axis: topConflict.axis.resolved,
            positionA: {
                claim: topConflict.claimA,
                supportingClaims: [],
                supportRationale: topConflict.claimA.text
            },
            positionB: {
                claim: topConflict.claimB,
                supportingClaims: [],
                supportRationale: topConflict.claimB.text
            },
            dynamics: topConflict.dynamics,
            stakes: topConflict.stakes
        };
    } else {
        throw new Error("Contested shape requires at least one conflict");
    }

    // Collect IDs used in central conflict
    const usedIds = new Set<string>();
    if (centralConflict.type === 'individual') {
        usedIds.add(centralConflict.positionA.claim.id);
        usedIds.add(centralConflict.positionB.claim.id);
    } else {
        usedIds.add(centralConflict.target.claim.id);
        centralConflict.challengers.claims.forEach(c => usedIds.add(c.id));
    }

    // Secondary conflicts
    const secondaryConflicts = conflictInfos.filter(c =>
        !usedIds.has(c.claimA.id) || !usedIds.has(c.claimB.id)
    );

    // Floor (high support claims not in conflict)
    const floorClaims = claims.filter(c => c.isHighSupport && !usedIds.has(c.id));

    return {
        pattern: 'contested',
        centralConflict,
        secondaryConflicts,
        floor: {
            exists: floorClaims.length > 0,
            claims: floorClaims.map(c => ({
                id: c.id,
                label: c.label,
                text: c.text,
                supportCount: c.supporters.length,
                supportRatio: c.supportRatio,
                isContested: false,
                contestedBy: []
            })),
            strength: floorClaims.length > 2 ? 'strong' : floorClaims.length > 0 ? 'weak' : 'absent',
            isContradictory: false
        },
        fragilities: {
            leverageInversions: patterns.leverageInversions,
            articulationPoints: []
        },
        collapsingQuestion: `What matters more: ${centralConflict.axis}?`
    };
};

const buildTradeoffShapeData = (
    claims: EnrichedClaim[],
    edges: Edge[],
    tradeoffPairs: TradeoffPair[]
): TradeoffShapeData => {

    const tradeoffs = tradeoffPairs.map((t, idx) => {
        const claimA = claims.find(c => c.id === t.claimA.id);
        const claimB = claims.find(c => c.id === t.claimB.id);

        return {
            id: `tradeoff_${idx}`,
            optionA: {
                id: t.claimA.id,
                label: t.claimA.label,
                text: claimA?.text || '',
                supportCount: t.claimA.supporterCount,
                supportRatio: claimA?.supportRatio || 0
            },
            optionB: {
                id: t.claimB.id,
                label: t.claimB.label,
                text: claimB?.text || '',
                supportCount: t.claimB.supporterCount,
                supportRatio: claimB?.supportRatio || 0
            },
            symmetry: t.symmetry as 'both_high' | 'both_low' | 'asymmetric',
            governingFactor: null // Could be inferred from claim texts
        };
    });

    // Find dominated options (where one tradeoff partner is strictly better)
    const dominatedOptions: Array<{ dominated: string; dominatedBy: string; reason: string }> = [];

    for (const t of tradeoffs) {
        // Simple heuristic: if one has much higher support and same connectivity, it dominates
        const supportDiff = Math.abs(t.optionA.supportRatio - t.optionB.supportRatio);
        if (supportDiff > 0.3) {
            const [higher, lower] = t.optionA.supportRatio > t.optionB.supportRatio
                ? [t.optionA, t.optionB]
                : [t.optionB, t.optionA];

            // Check if lower has any unique advantage (conflicts or prerequisites)
            const lowerHasUniqueValue = edges.some(e =>
                (e.from === lower.id || e.to === lower.id) &&
                e.type === 'prerequisite'
            );

            if (!lowerHasUniqueValue) {
                dominatedOptions.push({
                    dominated: lower.id,
                    dominatedBy: higher.id,
                    reason: `${higher.label} has significantly higher support with no unique tradeoff benefit`
                });
            }
        }
    }

    // Floor: high support claims not in tradeoffs
    const tradeoffIds = new Set(tradeoffs.flatMap(t => [t.optionA.id, t.optionB.id]));
    const floorClaims = claims
        .filter(c => c.isHighSupport && !tradeoffIds.has(c.id))
        .map(c => ({
            id: c.id,
            label: c.label,
            text: c.text,
            supportCount: c.supporters.length,
            supportRatio: c.supportRatio,
            isContested: false,
            contestedBy: []
        }));

    return {
        pattern: 'tradeoff',
        tradeoffs,
        dominatedOptions,
        floor: floorClaims
    };
};

const buildDimensionalShapeData = (
    claims: EnrichedClaim[],
    edges: Edge[],
    graph: GraphAnalysis,
    ghosts: string[]
): DimensionalShapeData => {

    // Use graph components as dimensions
    const dimensions: DimensionCluster[] = graph.components
        .filter(comp => comp.length >= 2) // Only meaningful clusters
        .map((componentIds, idx) => {
            const componentClaims = claims.filter(c => componentIds.includes(c.id));

            // Infer theme from claim labels (simple heuristic)
            const theme = `Dimension ${idx + 1}`; // Could use NLP to extract common theme

            const avgSupport = componentClaims.reduce((sum, c) => sum + c.supportRatio, 0) / componentClaims.length;

            // Compute cohesion (internal edge density)
            const internalEdges = edges.filter(e =>
                componentIds.includes(e.from) && componentIds.includes(e.to)
            ).length;
            const possibleEdges = componentClaims.length * (componentClaims.length - 1);
            const cohesion = possibleEdges > 0 ? internalEdges / possibleEdges : 0;

            return {
                id: `dim_${idx}`,
                theme,
                claims: componentClaims.map(c => ({
                    id: c.id,
                    label: c.label,
                    text: c.text,
                    supportCount: c.supporters.length
                })),
                cohesion,
                avgSupport
            };
        });

    // Detect interactions between dimensions
    const interactions: Array<{
        dimensionA: string;
        dimensionB: string;
        relationship: 'independent' | 'overlapping' | 'conflicting';
    }> = [];

    for (let i = 0; i < dimensions.length; i++) {
        for (let j = i + 1; j < dimensions.length; j++) {
            const dimA = dimensions[i];
            const dimB = dimensions[j];

            // Check for edges between dimensions
            const crossEdges = edges.filter(e =>
                (dimA.claims.some(c => c.id === e.from) && dimB.claims.some(c => c.id === e.to)) ||
                (dimB.claims.some(c => c.id === e.from) && dimA.claims.some(c => c.id === e.to))
            );

            const hasConflict = crossEdges.some(e => e.type === 'conflicts');
            const hasSupport = crossEdges.some(e => e.type === 'supports' || e.type === 'prerequisite');

            let relationship: 'independent' | 'overlapping' | 'conflicting';
            if (hasConflict) {
                relationship = 'conflicting';
            } else if (hasSupport) {
                relationship = 'overlapping';
            } else {
                relationship = 'independent';
            }

            interactions.push({
                dimensionA: dimA.id,
                dimensionB: dimB.id,
                relationship
            });
        }
    }

    // Governing conditions (extracted from conditional claims)
    const governingConditions = claims
        .filter(c => c.type === 'conditional')
        .map(c => c.text);

    return {
        pattern: 'dimensional',
        dimensions,
        interactions,
        gaps: ghosts,
        governingConditions
    };
};

const buildExploratoryShapeData = (
    claims: EnrichedClaim[],
    edges: Edge[],
    graph: GraphAnalysis,
    ghosts: string[],
    signalStrength: number
): ExploratoryShapeData => {

    // Strongest signals: highest support + most connected
    const sortedBySupport = [...claims].sort((a, b) => b.supporters.length - a.supporters.length);
    const sortedByDegree = [...claims].sort((a, b) => (b.inDegree + b.outDegree) - (a.inDegree + a.outDegree));

    const strongestSignals: Array<{
        id: string;
        label: string;
        text: string;
        supportCount: number;
        reason: string;
    }> = [];

    // Top by support
    if (sortedBySupport[0]) {
        strongestSignals.push({
            id: sortedBySupport[0].id,
            label: sortedBySupport[0].label,
            text: sortedBySupport[0].text,
            supportCount: sortedBySupport[0].supporters.length,
            reason: 'Highest support'
        });
    }

    // Top by connectivity (if different)
    if (sortedByDegree[0] && sortedByDegree[0].id !== sortedBySupport[0]?.id) {
        strongestSignals.push({
            id: sortedByDegree[0].id,
            label: sortedByDegree[0].label,
            text: sortedByDegree[0].text,
            supportCount: sortedByDegree[0].supporters.length,
            reason: 'Most connected'
        });
    }

    // Loose clusters (small components)
    const looseClusters: DimensionCluster[] = graph.components
        .filter(comp => comp.length >= 2 && comp.length <= 4)
        .map((componentIds, idx) => {
            const componentClaims = claims.filter(c => componentIds.includes(c.id));
            const avgSupport = componentClaims.reduce((sum, c) => sum + c.supportRatio, 0) / componentClaims.length;

            return {
                id: `cluster_${idx}`,
                theme: `Cluster ${idx + 1}`,
                claims: componentClaims.map(c => ({
                    id: c.id,
                    label: c.label,
                    text: c.text,
                    supportCount: c.supporters.length
                })),
                cohesion: 0,
                avgSupport
            };
        });

    // Isolated claims
    const isolatedClaims = claims
        .filter(c => c.isIsolated)
        .map(c => ({
            id: c.id,
            label: c.label,
            text: c.text
        }));

    // Generate clarifying questions based on gaps
    const clarifyingQuestions: string[] = [];

    if (ghosts.length > 0) {
        clarifyingQuestions.push(`What about: ${ghosts[0]}?`);
    }

    if (isolatedClaims.length > 0) {
        clarifyingQuestions.push(`How does "${isolatedClaims[0].label}" relate to the other perspectives?`);
    }

    if (claims.some(c => c.type === 'conditional')) {
        clarifyingQuestions.push(`What is your specific context or constraints?`);
    }

    if (clarifyingQuestions.length === 0) {
        clarifyingQuestions.push(`What outcome are you optimizing for?`);
    }

    return {
        pattern: 'exploratory',
        strongestSignals,
        looseClusters,
        isolatedClaims,
        clarifyingQuestions,
        signalStrength
    };
};

const buildContextualShapeData = (
    claims: EnrichedClaim[],
    edges: Edge[],
    ghosts: string[]
): ContextualShapeData => {

    // Find conditional claims that create branches
    const conditionalClaims = claims.filter(c => c.type === 'conditional');

    // Try to identify the governing condition
    let governingCondition = "User's specific situation";

    if (conditionalClaims.length > 0) {
        // Extract condition from first conditional claim
        governingCondition = conditionalClaims[0].text;
    }

    // Group claims into branches based on prerequisites
    const branches: Array<{
        condition: string;
        claims: FloorClaim[];
    }> = [];

    // Simple heuristic: use components as branches
    const prereqEdges = edges.filter(e => e.type === 'prerequisite');
    const roots = claims.filter(c =>
        !prereqEdges.some(e => e.to === c.id) &&
        prereqEdges.some(e => e.from === c.id)
    );

    roots.forEach((root, idx) => {
        const branchClaims: FloorClaim[] = [{
            id: root.id,
            label: root.label,
            text: root.text,
            supportCount: root.supporters.length,
            supportRatio: root.supportRatio,
            isContested: false,
            contestedBy: []
        }];

        // Add claims that depend on this root
        const dependents = prereqEdges
            .filter(e => e.from === root.id)
            .map(e => claims.find(c => c.id === e.to))
            .filter(Boolean) as EnrichedClaim[];

        dependents.forEach(d => {
            branchClaims.push({
                id: d.id,
                label: d.label,
                text: d.text,
                supportCount: d.supporters.length,
                supportRatio: d.supportRatio,
                isContested: false,
                contestedBy: []
            });
        });

        branches.push({
            condition: `If ${root.label}`,
            claims: branchClaims
        });
    });

    // Default path: highest support branch
    const defaultPath = branches.length > 0
        ? {
            exists: true,
            claims: branches.sort((a, b) =>
                b.claims.reduce((s, c) => s + c.supportCount, 0) -
                a.claims.reduce((s, c) => s + c.supportCount, 0)
            )[0].claims
        }
        : null;

    // Missing context from ghosts
    const missingContext = ghosts.filter(g =>
        g.toLowerCase().includes('context') ||
        g.toLowerCase().includes('depend') ||
        g.toLowerCase().includes('situation')
    );

    return {
        pattern: 'contextual',
        governingCondition,
        branches,
        defaultPath,
        missingContext: missingContext.length > 0 ? missingContext : ghosts.slice(0, 2)
    };
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN STRUCTURAL ANALYSIS ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════

export const computeStructuralAnalysis = (artifact: MapperArtifact): StructuralAnalysis => {
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
    const claimMap = new Map<string, EnrichedClaim>(claimsWithLeverage.map((c) => [c.id, c]));

    // Step 7: Graph analysis
    const graph = analyzeGraph(claimIds, edges, claimsWithLeverage);

    // Step 8: Core ratios
    const ratios = computeCoreRatios(claimsWithLeverage, edges, graph, landscape.modelCount);

    // Step 9: Pattern detection
    const enrichedConflicts = detectEnrichedConflicts(edges, claimsWithLeverage, landscape);
    const conflictClusters = detectConflictClusters(enrichedConflicts, claimsWithLeverage);

    const patterns: StructuralAnalysis["patterns"] = {
        leverageInversions: detectLeverageInversions(claimsWithLeverage, edges, topClaimIds),
        cascadeRisks,
        conflicts: detectConflicts(edges, claimMap, topClaimIds),
        conflictInfos: enrichedConflicts,
        conflictClusters,
        tradeoffs: detectTradeoffs(edges, claimMap, topClaimIds),
        convergencePoints: detectConvergencePoints(edges, claimMap),
        isolatedClaims: detectIsolatedClaims(claimsWithLeverage),
    };

    const ghostAnalysis = analyzeGhosts(ghosts, claimsWithLeverage);

    // Step 10: Shape computation
    const tensionsForShape = edges
        .filter(e => e.type === 'conflicts' || e.type === 'tradeoff')
        .map(e => {
            const fromC = claimsWithLeverage.find(c => c.id === e.from);
            const toC = claimsWithLeverage.find(c => c.id === e.to);
            return {
                edgeType: e.type,
                isConditional: !!(fromC?.isConditional || toC?.isConditional),
                isBothHighSupport: !!(fromC?.isHighSupport && toC?.isHighSupport)
            };
        });

    const signalStrength = computeSignalStrength(
        claimsWithLeverage.length,
        edges.length,
        landscape.modelCount,
        claimsWithLeverage.map(c => c.supporters)
    );

    const shape = determineShapeSparseAware(
        ratios,
        tensionsForShape,
        graph,
        claimsWithLeverage,
        edges,
        graph.localCoherence,
        signalStrength
    );

    // Layer 8: Shape Data Builders
    try {
        switch (shape.primaryPattern) {
            case 'settled':
                shape.data = buildSettledShapeData(claimsWithLeverage, edges, ghosts, patterns);
                break;
            case 'linear':
                shape.data = buildLinearShapeData(claimsWithLeverage, edges, graph, patterns.cascadeRisks);
                break;
            case 'keystone':
                if (graph.hubClaim) {
                    shape.data = buildKeystoneShapeData(claimsWithLeverage, edges, graph, patterns);
                }
                break;
            case 'contested':
                shape.data = buildContestedShapeData(
                    claimsWithLeverage,
                    edges,
                    patterns,
                    enrichedConflicts,
                    conflictClusters
                );
                break;
            case 'tradeoff':
                shape.data = buildTradeoffShapeData(claimsWithLeverage, edges, patterns.tradeoffs);
                break;
            case 'dimensional':
                shape.data = buildDimensionalShapeData(claimsWithLeverage, edges, graph, ghosts);
                break;
            case 'contextual':
                shape.data = buildContextualShapeData(claimsWithLeverage, edges, ghosts);
                break;
            case 'exploratory':
            default:
                shape.data = buildExploratoryShapeData(claimsWithLeverage, edges, graph, ghosts, signalStrength);
                break;
        }
    } catch (e) {
        console.warn("Failed to build shape data:", e);
        // Fallback to exploratory if shape-specific builder fails
        shape.data = buildExploratoryShapeData(claimsWithLeverage, edges, graph, ghosts, signalStrength);
    }

    const analysis: StructuralAnalysis = {
        edges,
        landscape,
        claimsWithLeverage,
        patterns,
        ghostAnalysis,
        graph,
        ratios,
        shape,
    };

    structuralDbg("analysis", {
        claimCount: landscape.claimCount,
        edgeCount: edges.length,
        modelCount: landscape.modelCount,
        ratios,
        shape: shape.primaryPattern,
        graph: {
            components: graph.componentCount,
            longestChain: graph.longestChain.length,
            hubClaim: graph.hubClaim,
        },
    });

    return analysis;
};

export const computeProblemStructureFromArtifact = (artifact: MapperArtifact): ProblemStructure => {
    return computeStructuralAnalysis(artifact).shape;
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
    const { landscape, patterns, ghostAnalysis, shape } = analysis;
    const problemStructure = shape;

    const structuralFraming = mode === "understand" ? problemStructure.implications.understand : problemStructure.implications.gauntlet;
    const typeFraming = getTypeFraming(landscape.dominantType, mode);

    const structuralObservations: string[] = [];

    for (const inv of patterns.leverageInversions) {
        if (inv.reason === "challenger_prerequisite_to_consensus") {
            structuralObservations.push(
                `${inv.claimLabel} (low support, challenger) is prerequisite to ${inv.affectedClaims.length} high - support claim(s).`
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
                `${risk.sourceLabel} is prerequisite to ${risk.dependentIds.length} claims(cascade depth: ${risk.depth}).`
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
            leverageNotes = `High - leverage claims with low support: ${candidates.join(", ")}. These may contain overlooked insights.`;
        }

        if (ghostAnalysis.mayExtendChallenger) {
            ghostNotes = `${ghostAnalysis.count} ghost(s) detected.May represent territory challengers were pointing toward.`;
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
            conflictNotes = `${patterns.conflicts.length} conflict(s) require resolution.One claim per conflict must be eliminated or conditions must differentiate them.`;
        }

        const asymmetricTradeoffs = patterns.tradeoffs.filter((t) => t.symmetry === "asymmetric");
        if (asymmetricTradeoffs.length > 0) {
            tradeoffNotes = `${asymmetricTradeoffs.length} asymmetric tradeoff(s): low - support claims challenging high - support positions.Test if challenger survives superiority.`;
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
        `## Problem Structure: ${context.problemStructure.primaryPattern.toUpperCase()} \n\n${context.structuralFraming} \n\n ** Evidence:**\n${context.problemStructure.evidence
            .map((e) => `• ${e}`)
            .join("\n")
        } \n\n ** Confidence:** ${Math.round(context.problemStructure.confidence * 100)}% `
    );
    sections.push(`## Landscape Type\n\n${context.typeFraming} `);
    if (context.structuralObservations.length > 0) {
        sections.push(`## Structural Observations\n\n${context.structuralObservations.map((o) => `• ${o}`).join("\n")} `);
    }

    if (mode === "understand") {
        if (context.leverageNotes) sections.push(`## High - Leverage Claims\n\n${context.leverageNotes} `);
        if (context.ghostNotes) sections.push(`## Gaps\n\n${context.ghostNotes} `);
    }

    if (mode === "gauntlet") {
        if (context.cascadeWarnings) sections.push(`## Cascade Warnings\n\n${context.cascadeWarnings} `);
        if (context.conflictNotes) sections.push(`## Conflicts\n\n${context.conflictNotes} `);
        if (context.tradeoffNotes) sections.push(`## Asymmetric Tradeoffs\n\n${context.tradeoffNotes} `);
    }

    return sections.join("\n\n---\n\n");
};


export {
    generateModeContext,
    buildStructuralSection,
    getTopNCount
};
