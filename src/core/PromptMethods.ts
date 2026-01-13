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
    CentralConflict,
    DimensionCluster,
    // NEW: Composite shape types for peak-first detection
    PrimaryShape,
    SecondaryPattern,
    CompositeShape,
    PeakAnalysis,
    DissentPatternData,
    ChallengedPatternData,
    KeystonePatternData,
    ChainPatternData,
    FragilePatternData,
    ConditionalPatternData,
    OrphanedPatternData,
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
// PEAK-FIRST DETECTION CONSTANTS AND FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

const PEAK_THRESHOLD = 0.5;      // >50% support = peak (this is a ratio, scales with model count)
const HILL_THRESHOLD = 0.25;    // 25-50% = hill
const MIN_PEAK_SUPPORTERS = 2;  // At least 2 models must agree for a peak (handles 2-model edge case)
const MIN_CHAIN_LENGTH = 3;     // Chains must be >2 steps to be significant

const isPeakClaim = (claim: EnrichedClaim): boolean => {
    return claim.supportRatio > PEAK_THRESHOLD &&
        claim.supporters.length >= MIN_PEAK_SUPPORTERS;
};

const analyzePeaks = (
    claims: EnrichedClaim[],
    edges: Edge[]
): PeakAnalysis => {
    const peaks = claims.filter(c => isPeakClaim(c));
    const hills = claims.filter(c =>
        c.supportRatio > HILL_THRESHOLD &&
        c.supportRatio <= PEAK_THRESHOLD
    );
    const floor = claims.filter(c => c.supportRatio <= HILL_THRESHOLD);

    const peakIds = new Set(peaks.map(p => p.id));

    // Edges between peaks only
    const peakEdges = edges.filter(e => peakIds.has(e.from) && peakIds.has(e.to));
    const peakConflicts = peakEdges.filter(e => e.type === 'conflicts');
    const peakTradeoffs = peakEdges.filter(e => e.type === 'tradeoff');
    const peakSupports = peakEdges.filter(e =>
        e.type === 'supports' || e.type === 'prerequisite'
    );

    // Check if peaks are unconnected to each other
    const peakUnconnected = peaks.length > 1 && peakEdges.length === 0;

    return {
        peaks,
        hills,
        floor,
        peakIds: Array.from(peakIds),
        peakConflicts,
        peakTradeoffs,
        peakSupports,
        peakUnconnected
    };
};

const detectPrimaryShape = (
    peakAnalysis: PeakAnalysis
): { primary: PrimaryShape; confidence: number; evidence: string[] } => {
    const { peaks, hills, peakConflicts, peakTradeoffs, peakSupports, peakUnconnected } = peakAnalysis;

    // SPARSE: No peaks and fewer than 3 hills
    if (peaks.length === 0 && hills.length < 3) {
        return {
            primary: 'sparse',
            confidence: 0.9,
            evidence: [
                `No claims with >50% support`,
                `Only ${hills.length} claim(s) in contested range`,
                `Insufficient signal to determine structure`
            ]
        };
    }

    // CONVERGENT: Requires at least one peak
    if (peaks.length === 1 ||
        (peaks.length > 1 && peakConflicts.length === 0 && peakTradeoffs.length === 0 && peakSupports.length > 0)) {

        // Safe to access peaks since we know peaks.length >= 1
        const avgSupport = peaks.reduce((s, p) => s + p.supportRatio, 0) / peaks.length;

        return {
            primary: 'convergent',
            confidence: Math.min(0.9, 0.5 + avgSupport * 0.4),
            evidence: [
                peaks.length === 1
                    ? `Single dominant position: "${peaks[0].label}" (${(peaks[0].supportRatio * 100).toFixed(0)}%)`
                    : `${peaks.length} aligned peaks with mutual support`,
                peakSupports.length > 0 ? `${peakSupports.length} reinforcing connection(s) between peaks` : '',
            ].filter(Boolean) as string[]
        };
    }

    // Edge case: No peaks but multiple hills - not sparse, not convergent
    if (peaks.length === 0) {
        return {
            primary: 'parallel',  // Unified with parallel for unsettled landscape
            confidence: 0.5,
            evidence: [
                `No dominant positions (0 peaks)`,
                `${hills.length} claims in contested range`,
                `Landscape is unsettled`
            ]
        };
    }

    // Peaks conflict with each other → FORKED
    if (peakConflicts.length > 0) {
        const symmetricConflicts = peakConflicts.filter(e => {
            const a = peaks.find(p => p.id === e.from);
            const b = peaks.find(p => p.id === e.to);
            return a && b && Math.abs(a.supportRatio - b.supportRatio) < 0.15;
        });

        return {
            primary: 'forked',
            confidence: 0.85,
            evidence: [
                `${peakConflicts.length} conflict(s) between high-support positions`,
                symmetricConflicts.length > 0
                    ? `${symmetricConflicts.length} symmetric (evenly matched) conflict(s)`
                    : `Asymmetric conflict—one position dominates`,
                `This is a genuine fork, not noise`
            ]
        };
    }

    // Peaks trade off against each other → CONSTRAINED
    if (peakTradeoffs.length > 0) {
        return {
            primary: 'constrained',
            confidence: 0.8,
            evidence: [
                `${peakTradeoffs.length} tradeoff(s) between high-support positions`,
                `Cannot optimize for all simultaneously`,
                `Choice requires sacrifice`
            ]
        };
    }

    // Peaks exist but aren't connected → PARALLEL
    if (peakUnconnected) {
        return {
            primary: 'parallel',
            confidence: 0.75,
            evidence: [
                `${peaks.length} independent high-support positions`,
                `No direct relationships between peaks`,
                `May represent different dimensions of the problem`
            ]
        };
    }

    // Fallback: multiple peaks with some connections but no conflicts/tradeoffs
    return {
        primary: 'convergent',
        confidence: 0.6,
        evidence: [
            `${peaks.length} peaks with mixed relationships`,
            `No major conflicts detected`,
            `Defaulting to convergent with lower confidence`
        ]
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// DISSENT PATTERN DETECTION (CRITICAL - Most important secondary pattern)
// ─────────────────────────────────────────────────────────────────────────────

const generateWhyItMatters = (
    voice: DissentPatternData['voices'][0],
    peaks: EnrichedClaim[]
): string => {
    switch (voice.insightType) {
        case 'leverage_inversion':
            return `Low support but high structural importance—if "${voice.label}" is right, it reshapes the entire answer.`;

        case 'explicit_challenger': {
            const targetLabels = voice.targets?.map(t => peaks.find(p => p.id === t)?.label).filter(Boolean);
            return targetLabels && targetLabels.length > 0
                ? `Directly challenges "${targetLabels[0]}"—the consensus may be missing something.`
                : `Explicitly contests the dominant view.`;
        }

        case 'unique_perspective':
            return `Comes from model(s) that don't support any consensus position—a genuinely different angle.`;

        case 'edge_case':
            return `Conditional insight that may apply to your specific situation.`;

        default:
            return `Minority position that warrants consideration.`;
    }
};

const detectDissentPattern = (
    _claims: EnrichedClaim[],
    edges: Edge[],
    peakIds: string[],
    peaks: EnrichedClaim[]
): SecondaryPattern | null => {
    const peakIdsSet = new Set(peakIds);

    const dissentVoices: DissentPatternData['voices'] = [];

    // ─────────────────────────────────────────────────────────────────────────
    // 1. LEVERAGE INVERSIONS: Low support, high structural importance
    // ─────────────────────────────────────────────────────────────────────────
    const leverageInversions = _claims.filter(c => c.isLeverageInversion);

    for (const claim of leverageInversions) {
        const targets = edges
            .filter(e => e.from === claim.id && (e.type === 'prerequisite' || e.type === 'supports'))
            .map(e => e.to)
            .filter(id => peakIdsSet.has(id));

        dissentVoices.push({
            id: claim.id,
            label: claim.label,
            text: claim.text,
            supportRatio: claim.supportRatio,
            insightType: 'leverage_inversion',
            targets,
            insightScore: claim.leverage * (1 - claim.supportRatio) * 2
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. EXPLICIT CHALLENGERS: Role = challenger, attacks peaks
    // ─────────────────────────────────────────────────────────────────────────
    const challengers = _claims.filter(c =>
        c.role === 'challenger' ||
        (c.challenges && peakIdsSet.has(c.challenges))
    );

    for (const claim of challengers) {
        if (dissentVoices.some(v => v.id === claim.id)) continue;

        const targets = claim.challenges && peakIdsSet.has(claim.challenges)
            ? [claim.challenges]
            : edges
                .filter(e => e.from === claim.id && e.type === 'conflicts' && peakIdsSet.has(e.to))
                .map(e => e.to);

        if (targets.length === 0 && (claim.role === 'challenger' || claim.challenges)) {
            // If it was explicitly marked as a challenger but has no valid peak targets,
            // we skip adding it as an 'explicit_challenger' to avoid broken links
            if (!claim.challenges) continue;
            // If it has a challenge but it's not a peak, it might still be a unique perspective or leverage inversion
            // (already handled or will be handled by other blocks)
            continue;
        }

        dissentVoices.push({
            id: claim.id,
            label: claim.label,
            text: claim.text,
            supportRatio: claim.supportRatio,
            insightType: 'explicit_challenger',
            targets,
            insightScore: targets.length * (1 - claim.supportRatio) * 1.5
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. UNIQUE PERSPECTIVES: Claims from models that don't support any peak
    // ─────────────────────────────────────────────────────────────────────────
    const peakSupporters = new Set(peaks.flatMap(p => p.supporters));
    const outsiderModels = new Set<number>();

    _claims.forEach(c => {
        c.supporters.forEach(s => {
            if (!peakSupporters.has(s)) outsiderModels.add(s);
        });
    });

    if (outsiderModels.size > 0) {
        const outsiderClaims = _claims.filter(c => {
            const outsiderSupport = c.supporters.filter(s => outsiderModels.has(s)).length;
            return outsiderSupport > c.supporters.length * 0.5 && !peakIdsSet.has(c.id);
        });

        for (const claim of outsiderClaims) {
            if (dissentVoices.some(v => v.id === claim.id)) continue;

            dissentVoices.push({
                id: claim.id,
                label: claim.label,
                text: claim.text,
                supportRatio: claim.supportRatio,
                insightType: 'unique_perspective',
                targets: [],
                insightScore: claim.supporters.length * 0.5
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. EDGE CASES: Conditional claims with low support
    // ─────────────────────────────────────────────────────────────────────────
    const edgeCases = _claims.filter(c =>
        c.type === 'conditional' &&
        c.supportRatio < 0.4 &&
        !dissentVoices.some(v => v.id === c.id)
    );

    for (const claim of edgeCases) {
        dissentVoices.push({
            id: claim.id,
            label: claim.label,
            text: claim.text,
            supportRatio: claim.supportRatio,
            insightType: 'edge_case',
            targets: [],
            insightScore: 0.3
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RANK AND SELECT
    // ─────────────────────────────────────────────────────────────────────────

    if (dissentVoices.length === 0) return null;

    const rankedVoices = [...dissentVoices].sort((a, b) => b.insightScore - a.insightScore);

    // Identify suppressed dimensions
    const peakTypes = new Set(peaks.map(p => p.type));
    const minorityOnlyTypes = Array.from(new Set(rankedVoices.map(v => {
        const claim = _claims.find(c => c.id === v.id);
        return claim?.type;
    }))).filter(t => t && !peakTypes.has(t));

    const strongestVoice = rankedVoices[0];
    const strongestClaim = _claims.find(c => c.id === strongestVoice.id);

    return {
        type: 'dissent',
        severity: rankedVoices.length > 3 ? 'high' : rankedVoices.length > 1 ? 'medium' : 'low',
        data: {
            voices: rankedVoices.slice(0, 5),
            strongestVoice: strongestClaim ? {
                id: strongestVoice.id,
                label: strongestVoice.label,
                text: strongestVoice.text,
                supportRatio: strongestVoice.supportRatio,
                whyItMatters: generateWhyItMatters(strongestVoice, peaks)
            } : null,
            suppressedDimensions: minorityOnlyTypes as string[]
        } as DissentPatternData
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// OTHER SECONDARY PATTERN DETECTORS
// ─────────────────────────────────────────────────────────────────────────────

const detectChallengedPattern = (
    peakAnalysis: PeakAnalysis,
    claims: EnrichedClaim[],
    edges: Edge[]
): SecondaryPattern | null => {
    const { peakIds, floor } = peakAnalysis;
    const peakIdsSet = new Set(peakIds);
    const floorIds = new Set(floor.map(f => f.id));

    const challengeEdges = edges.filter(e =>
        e.type === 'conflicts' &&
        floorIds.has(e.from) &&
        peakIdsSet.has(e.to)
    );

    if (challengeEdges.length === 0) return null;

    const challenges = challengeEdges
        .map(e => {
            const challenger = claims.find(c => c.id === e.from);
            const target = claims.find(c => c.id === e.to);

            // Skip edges where either endpoint is missing
            if (!challenger || !target) {
                return null;
            }

            return {
                challenger: { id: challenger.id, label: challenger.label, supportRatio: challenger.supportRatio },
                target: { id: target.id, label: target.label, supportRatio: target.supportRatio }
            };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

    return {
        type: 'challenged',
        severity: challenges.length > 2 ? 'high' : challenges.length > 1 ? 'medium' : 'low',
        data: { challenges } as ChallengedPatternData
    };
};

const detectKeystonePatternSecondary = (
    peaks: EnrichedClaim[],
    edges: Edge[],
    cascadeRisks: CascadeRisk[],
    _graph?: GraphAnalysis
): SecondaryPattern | null => {
    for (const peak of peaks) {
        const outgoingPrereqs = edges.filter(e =>
            e.from === peak.id && e.type === 'prerequisite'
        );

        if (outgoingPrereqs.length >= 2) {
            const cascade = cascadeRisks.find(r => r.sourceId === peak.id);
            const cascadeSize = cascade?.dependentIds.length || outgoingPrereqs.length;

            return {
                type: 'keystone',
                severity: cascadeSize > 3 ? 'high' : cascadeSize > 1 ? 'medium' : 'low',
                data: {
                    keystone: { id: peak.id, label: peak.label, supportRatio: peak.supportRatio },
                    dependents: outgoingPrereqs.map(e => e.to),
                    cascadeSize
                } as KeystonePatternData
            };
        }
    }
    return null;
};

const detectChainPatternSecondary = (
    graph: GraphAnalysis,
    claims: EnrichedClaim[]
): SecondaryPattern | null => {
    if (graph.longestChain.length < MIN_CHAIN_LENGTH) return null;

    const chainClaims = graph.longestChain
        .map(id => claims.find(c => c.id === id))
        .filter((c): c is EnrichedClaim => !!c);
    const weakLinks = chainClaims
        .filter(c => c.supportRatio < HILL_THRESHOLD)
        .map(c => c.id);

    return {
        type: 'chain',
        severity: weakLinks.length > 1 ? 'high' : weakLinks.length > 0 ? 'medium' : 'low',
        data: {
            chain: graph.longestChain,
            length: graph.longestChain.length,
            weakLinks
        } as ChainPatternData
    };
};

const detectFragilePattern = (
    peakAnalysis: PeakAnalysis,
    claims: EnrichedClaim[],
    edges: Edge[]
): SecondaryPattern | null => {
    const { peaks } = peakAnalysis;
    const fragilities: FragilePatternData['fragilities'] = [];

    for (const peak of peaks) {
        const incomingPrereqs = edges.filter(e =>
            e.to === peak.id && e.type === 'prerequisite'
        );

        for (const prereq of incomingPrereqs) {
            const foundation = claims.find(c => c.id === prereq.from);
            if (foundation && foundation.supportRatio <= HILL_THRESHOLD) {
                fragilities.push({
                    peak: { id: peak.id, label: peak.label },
                    weakFoundation: {
                        id: foundation.id,
                        label: foundation.label,
                        supportRatio: foundation.supportRatio
                    }
                });
            }
        }
    }

    if (fragilities.length === 0) return null;

    return {
        type: 'fragile',
        severity: fragilities.length > 2 ? 'high' : fragilities.length > 1 ? 'medium' : 'low',
        data: { fragilities } as FragilePatternData
    };
};

const detectConditionalPatternSecondary = (
    claims: EnrichedClaim[],
    edges: Edge[]
): SecondaryPattern | null => {
    const conditionalClaims = claims.filter(c => c.type === 'conditional');

    const conditions = conditionalClaims.map(c => {
        const branches = edges
            .filter(e => e.from === c.id && e.type === 'prerequisite')
            .map(e => e.to);
        return { id: c.id, label: c.label, branches };
    }).filter(c => c.branches.length > 0);

    if (conditions.length === 0) return null;

    return {
        type: 'conditional',
        severity: conditions.length > 2 ? 'high' : 'medium',
        data: { conditions } as ConditionalPatternData
    };
};

const detectOrphanedPattern = (
    peaks: EnrichedClaim[],
    edges: Edge[]
): SecondaryPattern | null => {
    const isolatedPeaks = peaks.filter(p => {
        const hasEdge = edges.some(e => e.from === p.id || e.to === p.id);
        return !hasEdge;
    });

    if (isolatedPeaks.length === 0) return null;

    return {
        type: 'orphaned',
        severity: isolatedPeaks.length > 1 ? 'high' : 'medium',
        data: {
            orphans: isolatedPeaks.map(p => ({
                id: p.id,
                label: p.label,
                supportRatio: p.supportRatio,
                reason: 'High support but no structural connections'
            }))
        } as OrphanedPatternData
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// SECONDARY PATTERN AGGREGATOR
// ─────────────────────────────────────────────────────────────────────────────

const detectSecondaryPatterns = (
    peakAnalysis: PeakAnalysis,
    claims: EnrichedClaim[],
    edges: Edge[],
    graph: GraphAnalysis,
    cascadeRisks: CascadeRisk[]
): SecondaryPattern[] => {
    const patterns: SecondaryPattern[] = [];

    // 1. DISSENT - Most important, always check first
    const dissent = detectDissentPattern(claims, edges, peakAnalysis.peakIds, peakAnalysis.peaks);
    if (dissent) patterns.push(dissent);

    // 2. FRAGILE - Consensus on shaky ground
    const fragile = detectFragilePattern(peakAnalysis, claims, edges);
    if (fragile) patterns.push(fragile);

    // 3. KEYSTONE - Single point of failure
    const keystone = detectKeystonePatternSecondary(peakAnalysis.peaks, edges, cascadeRisks);
    if (keystone) patterns.push(keystone);

    // 4. CHAIN - Sequential dependencies (only if significant)
    const chain = detectChainPatternSecondary(graph, claims);
    if (chain) patterns.push(chain);

    // 5. CONDITIONAL - Context-dependent answers
    const conditional = detectConditionalPatternSecondary(claims, edges);
    if (conditional) patterns.push(conditional);

    // 6. ORPHANED - Disconnected peaks (structural anomaly)
    const orphaned = detectOrphanedPattern(peakAnalysis.peaks, edges);
    if (orphaned) patterns.push(orphaned);

    // 7. CHALLENGED - Only if not already covered by dissent
    if (!dissent) {
        const challenged = detectChallengedPattern(peakAnalysis, claims, edges);
        if (challenged) patterns.push(challenged);
    }

    return patterns;
};

// ─────────────────────────────────────────────────────────────────────────────
// TRANSFER QUESTION GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

const generateTransferQuestion = (
    primary: PrimaryShape,
    patterns: SecondaryPattern[],
    peaks: EnrichedClaim[]
): string => {
    const dissentPattern = patterns.find(p => p.type === 'dissent');

    switch (primary) {
        case 'convergent':
            if (dissentPattern) {
                const dissent = dissentPattern.data as DissentPatternData;
                if (dissent.strongestVoice) {
                    return `The consensus may be missing something. Is "${dissent.strongestVoice.label}" onto something the majority missed?`;
                }
            }
            return "For the consensus to hold, what assumption must be true? Is it true in your situation?";

        case 'forked':
            const peakLabels = peaks.slice(0, 2).map(p => `"${p.label}"`).join(' vs ');
            return `Two valid paths exist: ${peakLabels}. Which constraint matters more to you?`;

        case 'parallel':
            return "Which dimension is most relevant to your situation?";

        case 'constrained':
            return "What are you optimizing for? You cannot maximize both.";

        case 'sparse':
            return "What specific question would collapse this ambiguity?";

        default:
            return "What would help you navigate this?";
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPOSITE SHAPE DETECTOR
// ─────────────────────────────────────────────────────────────────────────────
 
const detectCompositeShape = (
    claims: EnrichedClaim[],
    edges: Edge[],
    graph: GraphAnalysis,
    cascadeRisks: CascadeRisk[]
): CompositeShape => {

    // Step 1: Analyze peak structure
    const peakAnalysis = analyzePeaks(claims, edges);

    // Step 2: Determine primary shape from peaks
    const { primary, confidence: primaryConfidence, evidence } = detectPrimaryShape(peakAnalysis);

    // Step 3: Detect secondary patterns
    const patterns = detectSecondaryPatterns(
        peakAnalysis,
        claims,
        edges,
        graph,
        cascadeRisks
    );

    let peakRelationship: CompositeShape['peakRelationship'] = 'none';
    if (peakAnalysis.peaks.length > 1) {
        if (peakAnalysis.peakConflicts.length > 0) peakRelationship = 'conflicting';
        else if (peakAnalysis.peakTradeoffs.length > 0) peakRelationship = 'trading-off';
        else if (peakAnalysis.peakSupports.length > 0) peakRelationship = 'supporting';
        else if (peakAnalysis.peakUnconnected) peakRelationship = 'independent';
    }
 
    const transferQuestion = generateTransferQuestion(primary, patterns, peakAnalysis.peaks);
 
    const patternEvidence = patterns.map(p => {
        switch (p.type) {
            case 'dissent':
                return `⚡ Minority voice with potential insight`;
            case 'challenged':
                return `⚠️ Dominant position under challenge`;
            case 'keystone':
                return `🔑 Structure depends on "${(p.data as KeystonePatternData).keystone.label}"`;
            case 'chain':
                return `⛓️ ${(p.data as ChainPatternData).length}-step chain`;
            case 'fragile':
                return `🧊 Peak(s) on weak foundations`;
            case 'conditional':
                return `🔀 Context-dependent branches`;
            case 'orphaned':
                return `🏝️ Isolated high-support claim(s)`;
            default:
                return null;
        }
    }).filter(Boolean) as string[];
 
    return {
        primary,
        confidence: primaryConfidence,
        patterns,
        peaks: peakAnalysis.peaks.map(p => ({
            id: p.id,
            label: p.label,
            supportRatio: p.supportRatio
        })),
        peakRelationship,
        evidence: [...evidence, ...patternEvidence],
        transferQuestion,
    };
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
        const key = `${e.to}::${e.type}`;
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
// V3.1 PROBLEM STRUCTURE DETECTION (Replaced by peak-first composite)
// ═══════════════════════════════════════════════════════════════════════════

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

    const signalStrength = computeSignalStrength(
        claimsWithLeverage.length,
        edges.length,
        landscape.modelCount,
        claimsWithLeverage.map(c => c.supporters)
    );

    const compositeShape = detectCompositeShape(
        claimsWithLeverage,
        edges,
        graph,
        patterns.cascadeRisks
    );

    const shape: ProblemStructure = {
        primary: compositeShape.primary,
        confidence: compositeShape.confidence,
        patterns: compositeShape.patterns,
        peaks: compositeShape.peaks,
        peakRelationship: compositeShape.peakRelationship,
        evidence: compositeShape.evidence,
        transferQuestion: compositeShape.transferQuestion,
        signalStrength,
    };

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
        shape: shape.primary,
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

export {
    getTopNCount
};
