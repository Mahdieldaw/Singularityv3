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
    FloorClaim,
    ChainStep,
    ChallengerInfo,
    // Composite shape types
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
    // Shape data types
    SettledShapeData,
    KeystoneShapeData,
    LinearShapeData,
    DimensionalShapeData,
    ExploratoryShapeData,
    ContestedShapeData,
    TradeoffShapeData,
    ContextualShapeData,
} from "../../shared/contract";

// ═══════════════════════════════════════════════════════════════════════════
// SHADOW MAPPER INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════
import {
    executeShadowExtraction,
    executeShadowDelta,
    ShadowAudit,
    UnindexedStatement,
    TwoPassResult,
    DeltaResult,
} from './shadow';

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
// PERCENTILE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const getPercentileThreshold = (values: number[], percentile: number): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile);
    return sorted[Math.min(index, sorted.length - 1)];
};

const getTopNCount = (total: number, ratio: number): number => {
    return Math.max(1, Math.ceil(total * ratio));
};

const isInTopPercentile = (value: number, allValues: number[], percentile: number): boolean => {
    const threshold = getPercentileThreshold(allValues, 1 - percentile);
    return value >= threshold;
};

const isInBottomPercentile = (value: number, allValues: number[], percentile: number): boolean => {
    const threshold = getPercentileThreshold(allValues, percentile);
    return value <= threshold;
};

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

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

const computeLongestChain = (claimIds: string[], edges: Edge[]): string[] => {
    const prereqEdges = edges.filter(e => e.type === "prerequisite");
    const prereqChildren = new Map<string, string[]>();
    const hasIncomingPrereq = new Set<string>();

    claimIds.forEach(id => prereqChildren.set(id, []));
    prereqEdges.forEach(e => {
        prereqChildren.get(e.from)?.push(e.to);
        hasIncomingPrereq.add(e.to);
    });

    const roots = claimIds.filter(id => !hasIncomingPrereq.has(id));
    let longestChain: string[] = [];

    const findChain = (id: string, chain: string[]): string[] => {
        const newChain = [...chain, id];
        const children = prereqChildren.get(id) ?? [];

        if (children.length === 0) return newChain;

        let best = newChain;
        children.forEach(child => {
            if (!chain.includes(child)) {
                const candidate = findChain(child, newChain);
                if (candidate.length > best.length) best = candidate;
            }
        });
        return best;
    };

    roots.forEach(root => {
        const chain = findChain(root, []);
        if (chain.length > longestChain.length) longestChain = chain;
    });

    if (longestChain.length === 0) {
        claimIds.forEach(id => {
            const chain = findChain(id, []);
            if (chain.length > longestChain.length) longestChain = chain;
        });
    }

    return longestChain;
};

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

    const articulationPoints = findArticulationPoints(claimIds, edges);

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
// DISCRIMINANT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const isHubLoadBearing = (hubId: string, edges: Edge[]): boolean => {
    const prereqOut = edges.filter(e =>
        e.from === hubId && e.type === 'prerequisite'
    );
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

const PEAK_THRESHOLD = 0.5;
const HILL_THRESHOLD = 0.25;
const MIN_PEAK_SUPPORTERS = 2;
const MIN_CHAIN_LENGTH = 3;

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

    const peakEdges = edges.filter(e => peakIds.has(e.from) && peakIds.has(e.to));
    const peakConflicts = peakEdges.filter(e => e.type === 'conflicts');
    const peakTradeoffs = peakEdges.filter(e => e.type === 'tradeoff');
    const peakSupports = peakEdges.filter(e =>
        e.type === 'supports' || e.type === 'prerequisite'
    );

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

    // CONVERGENT: Single peak or peaks that support each other
    if (peaks.length === 1 ||
        (peaks.length > 1 && peakConflicts.length === 0 && peakTradeoffs.length === 0 && peakSupports.length > 0)) {

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

    // Edge case: No peaks but multiple hills
    if (peaks.length === 0) {
        return {
            primary: 'parallel',
            confidence: 0.5,
            evidence: [
                `No dominant positions (0 peaks)`,
                `${hills.length} claims in contested range`,
                `Landscape is unsettled`
            ]
        };
    }

    // FORKED: Peaks conflict with each other
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

    // CONSTRAINED: Peaks trade off
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

    // PARALLEL: Peaks exist but aren't connected
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

// ═══════════════════════════════════════════════════════════════════════════
// DISSENT PATTERN DETECTION
// ═══════════════════════════════════════════════════════════════════════════

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
    claims: EnrichedClaim[],
    edges: Edge[],
    peakIds: string[],
    peaks: EnrichedClaim[]
): SecondaryPattern | null => {
    const peakIdsSet = new Set(peakIds);
    const dissentVoices: DissentPatternData['voices'] = [];

    // 1. LEVERAGE INVERSIONS
    const leverageInversions = claims.filter(c => c.isLeverageInversion);

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

    // 2. EXPLICIT CHALLENGERS
    const challengers = claims.filter(c =>
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

        if (targets.length === 0 && !claim.challenges) continue;

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

    // 3. UNIQUE PERSPECTIVES
    const peakSupporters = new Set(peaks.flatMap(p => p.supporters));
    const outsiderModels = new Set<number>();

    claims.forEach(c => {
        c.supporters.forEach(s => {
            if (!peakSupporters.has(s)) outsiderModels.add(s);
        });
    });

    if (outsiderModels.size > 0) {
        const outsiderClaims = claims.filter(c => {
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

    // 4. EDGE CASES
    const edgeCases = claims.filter(c =>
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

    if (dissentVoices.length === 0) return null;

    const rankedVoices = [...dissentVoices].sort((a, b) => b.insightScore - a.insightScore);

    const peakTypes = new Set(peaks.map(p => p.type));
    const minorityOnlyTypes = Array.from(new Set(rankedVoices.map(v => {
        const claim = claims.find(c => c.id === v.id);
        return claim?.type;
    }))).filter(t => t && !peakTypes.has(t));

    const strongestVoice = rankedVoices[0];
    const strongestClaim = claims.find(c => c.id === strongestVoice.id);

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

// ═══════════════════════════════════════════════════════════════════════════
// OTHER SECONDARY PATTERN DETECTORS
// ═══════════════════════════════════════════════════════════════════════════

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
            if (!challenger || !target) return null;

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
    cascadeRisks: CascadeRisk[]
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

// ═══════════════════════════════════════════════════════════════════════════
// SECONDARY PATTERN AGGREGATOR
// ═══════════════════════════════════════════════════════════════════════════

const detectSecondaryPatterns = (
    peakAnalysis: PeakAnalysis,
    claims: EnrichedClaim[],
    edges: Edge[],
    graph: GraphAnalysis,
    cascadeRisks: CascadeRisk[]
): SecondaryPattern[] => {
    const patterns: SecondaryPattern[] = [];

    // 1. DISSENT - Most important
    const dissent = detectDissentPattern(claims, edges, peakAnalysis.peakIds, peakAnalysis.peaks);
    if (dissent) patterns.push(dissent);

    // 2. FRAGILE
    const fragile = detectFragilePattern(peakAnalysis, claims, edges);
    if (fragile) patterns.push(fragile);

    // 3. KEYSTONE
    const keystone = detectKeystonePatternSecondary(peakAnalysis.peaks, edges, cascadeRisks);
    if (keystone) patterns.push(keystone);

    // 4. CHAIN
    const chain = detectChainPatternSecondary(graph, claims);
    if (chain) patterns.push(chain);

    // 5. CONDITIONAL
    const conditional = detectConditionalPatternSecondary(claims, edges);
    if (conditional) patterns.push(conditional);

    // 6. ORPHANED
    const orphaned = detectOrphanedPattern(peakAnalysis.peaks, edges);
    if (orphaned) patterns.push(orphaned);

    // 7. CHALLENGED (only if no dissent)
    if (!dissent) {
        const challenged = detectChallengedPattern(peakAnalysis, claims, edges);
        if (challenged) patterns.push(challenged);
    }

    return patterns;
};

// ═══════════════════════════════════════════════════════════════════════════
// TRANSFER QUESTION GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPOSITE SHAPE DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

const detectCompositeShape = (
    claims: EnrichedClaim[],
    edges: Edge[],
    graph: GraphAnalysis,
    cascadeRisks: CascadeRisk[]
): CompositeShape => {

    const peakAnalysis = analyzePeaks(claims, edges);
    const { primary, confidence: primaryConfidence, evidence } = detectPrimaryShape(peakAnalysis);

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
// CORE RATIO COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

const computeCoreRatios = (
    claims: EnrichedClaim[],
    edges: Edge[],
    graph: GraphAnalysis,
    modelCount: number
): CoreRatios => {
    const claimCount = claims.length;
    const edgeCount = edges.length;

    const maxSupport = Math.max(...claims.map(c => c.supporters.length), 0);
    const concentration = modelCount > 0 ? maxSupport / modelCount : 0;

    const topCount = getTopNCount(claimCount, 0.3);
    const sortedBySupport = [...claims].sort((a, b) => b.supporters.length - a.supporters.length);
    const topIds = new Set(sortedBySupport.slice(0, topCount).map(c => c.id));

    const topEdges = edges.filter(e => topIds.has(e.from) && topIds.has(e.to));
    const reinforcingEdges = topEdges.filter(e =>
        e.type === "supports" || e.type === "prerequisite"
    ).length;

    const alignment = topEdges.length > 0
        ? reinforcingEdges / topEdges.length
        : 0.5;

    const tensionEdges = edges.filter(e =>
        e.type === "conflicts" || e.type === "tradeoff"
    ).length;
    const tension = edgeCount > 0 ? tensionEdges / edgeCount : 0;

    const fragmentation = claimCount > 1
        ? (graph.componentCount - 1) / (claimCount - 1)
        : 0;

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
// CLAIM ENRICHMENT
// ═══════════════════════════════════════════════════════════════════════════

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

    const supportRatio = supporters.length / safeModelCount;
    const supportWeight = supportRatio * 2;

    const roleWeights: Record<string, number> = {
        challenger: 4,
        anchor: 2,
        branch: 1,
        supplement: 0.5,
    };
    const roleWeight = roleWeights[claim.role] ?? 1;

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

    const leverage = supportWeight + roleWeight + connectivityWeight + positionWeight;
    const keystoneScore = outDegree * supporters.length;

    const supporterCounts = supporters.reduce((acc, s) => {
        const key = String(s);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const maxFromSingleModel = Object.values(supporterCounts).length > 0
        ? Math.max(...Object.values(supporterCounts))
        : 0;
    const supportSkew = supporters.length > 0 ? maxFromSingleModel / supporters.length : 0;

    const isChainRoot = !hasIncomingPrereq && hasOutgoingPrereq;
    const isChainTerminal = hasIncomingPrereq && !hasOutgoingPrereq;

    return {
        ...claim,
        supportRatio,
        leverage,
        leverageFactors: {
            supportWeight,
            roleWeight,
            connectivityWeight,
            positionWeight,
        },
        keystoneScore,
        evidenceGapScore: 0,
        supportSkew,
        inDegree,
        outDegree,
        isChainRoot,
        isChainTerminal,
    };
};

const assignPercentileFlags = (
    claims: Array<ReturnType<typeof computeClaimRatios>>,
    edges: Edge[],
    cascadeRisks: CascadeRisk[],
    topClaimIds: Set<string>
): EnrichedClaim[] => {

    const allSupportRatios = claims.map(c => c.supportRatio);
    const allLeverages = claims.map(c => c.leverage);
    const allKeystoneScores = claims.map(c => c.keystoneScore);
    const allSupportSkews = claims.map(c => c.supportSkew);

    const cascadeBySource = new Map<string, CascadeRisk>();
    cascadeRisks.forEach(risk => cascadeBySource.set(risk.sourceId, risk));

    const connectedIds = new Set<string>();
    edges.forEach(e => {
        connectedIds.add(e.from);
        connectedIds.add(e.to);
    });

    return claims.map(claim => {
        const cascade = cascadeBySource.get(claim.id);
        const evidenceGapScore = cascade && claim.supporters.length > 0
            ? cascade.dependentIds.length / claim.supporters.length
            : 0;

        const allEvidenceGaps = claims.map(c => {
            const cCascade = cascadeBySource.get(c.id);
            return cCascade && c.supporters.length > 0
                ? cCascade.dependentIds.length / c.supporters.length
                : 0;
        });

        const isHighSupport = isInTopPercentile(claim.supportRatio, allSupportRatios, 0.3);
        const isLowSupport = isInBottomPercentile(claim.supportRatio, allSupportRatios, 0.3);
        const isHighLeverage = isInTopPercentile(claim.leverage, allLeverages, 0.25);
        const isLeverageInversion = isLowSupport && isHighLeverage;

        const isKeystoneCandidate = isInTopPercentile(claim.keystoneScore, allKeystoneScores, 0.2) && claim.outDegree >= 2;
        const isKeystone = isKeystoneCandidate && isHubLoadBearing(claim.id, edges);

        const isEvidenceGap = isInTopPercentile(evidenceGapScore, allEvidenceGaps, 0.2) && evidenceGapScore > 0;
        const isOutlier = isInTopPercentile(claim.supportSkew, allSupportSkews, 0.2) && claim.supporters.length >= 2;

        const hasConflict = edges.some(e =>
            e.type === "conflicts" && (e.from === claim.id || e.to === claim.id)
        );
        const hasIncomingPrereq = edges.some(e =>
            e.type === "prerequisite" && e.to === claim.id
        );

        const challengesHighSupport = claim.role === "challenger" && edges.some(e =>
            e.from === claim.id &&
            topClaimIds.has(e.to) &&
            (e.type === "conflicts" || e.type === "prerequisite")
        );
        const isChallenger = isLowSupport && challengesHighSupport;

        const isIsolated = !connectedIds.has(claim.id);
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
        const highSupportTargets = prereqTo.filter((e) => topClaimIds.has(e.to));

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
// SHAPE DATA BUILDERS (Restored + Adapted for Peak-First Primary Shapes)
// ═══════════════════════════════════════════════════════════════════════════

type SettledShapeDataExtended = SettledShapeData & {
    strongestOutlier: {
        claim: {
            id: string;
            label: string;
            text: string;
            supportCount: number;
            supportRatio: number;
        };
        reason: "leverage_inversion" | "explicit_challenger" | "minority_voice";
        structuralRole: string;
        whatItQuestions: string;
    } | null;
    floorAssumptions: string[];
    transferQuestion: string;
};

type KeystoneShapeDataExtended = KeystoneShapeData & {
    decoupledClaims: Array<{
        id: string;
        label: string;
        text: string;
        supportCount: number;
        independenceReason: string;
    }>;
    cascadeConsequences: {
        directlyAffected: number;
        transitivelyAffected: number;
        survives: number;
    };
    transferQuestion: string;
};

type LinearShapeDataExtended = LinearShapeData & {
    shortcuts: Array<{
        from: ChainStep;
        to: ChainStep;
        skips: string[];
        supportEvidence: string;
    }>;
    chainFragility: {
        weakLinkCount: number;
        totalSteps: number;
        fragilityRatio: number;
        mostVulnerableStep: { step: ChainStep; cascadeSize: number } | null;
    };
    transferQuestion: string;
};

type DimensionalShapeDataExtended = DimensionalShapeData & {
    dominantDimension: DimensionCluster | null;
    hiddenDimension: DimensionCluster | null;
    dominantBlindSpots: string[];
    transferQuestion: string;
};

type ExploratoryShapeDataExtended = ExploratoryShapeData & {
    outerBoundary: {
        id: string;
        label: string;
        text: string;
        supportCount: number;
        distanceReason: string;
    } | null;
    sparsityReasons: string[];
    transferQuestion: string;
};

function inferWhatOutlierQuestions(
    outlier: EnrichedClaim,
    floorClaims: EnrichedClaim[]
): string {
    if (outlier.challenges) {
        return outlier.challenges;
    }
    if (outlier.role === "challenger") {
        const mostSupported = [...floorClaims].sort((a, b) => b.supporters.length - a.supporters.length)[0];
        return mostSupported ? `the validity of "${mostSupported.label}"` : "the floor consensus";
    }
    return "assumptions underlying the consensus";
}

const buildSettledShapeData = (
    claims: EnrichedClaim[],
    edges: Edge[],
    ghosts: string[]
): SettledShapeDataExtended => {
    const floorClaims = claims.filter(c => c.isHighSupport);
    const floorIds = new Set(floorClaims.map(c => c.id));
    const conflictEdges = edges.filter(e => e.type === "conflicts");

    const floor: FloorClaim[] = floorClaims.map(c => {
        const contestedBy = conflictEdges
            .filter(e => e.from === c.id || e.to === c.id)
            .map(e => (e.from === c.id ? e.to : e.from));
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

    const avgSupport = floor.length > 0
        ? floor.reduce((sum, c) => sum + c.supportRatio, 0) / floor.length
        : 0;
    const floorStrength: "strong" | "moderate" | "weak" =
        avgSupport > 0.6 ? "strong" : avgSupport > 0.4 ? "moderate" : "weak";

    const challengers = claims.filter(c => c.role === "challenger" || c.isChallenger);
    const challengerInfos: ChallengerInfo[] = challengers.map(c => ({
        id: c.id,
        label: c.label,
        text: c.text,
        supportCount: c.supporters.length,
        challenges: c.challenges,
        targetsClaim: c.challenges
    }));

    const outsideClaims = claims.filter(c => !floorIds.has(c.id));
    let strongestOutlier: SettledShapeDataExtended["strongestOutlier"] = null;

    if (outsideClaims.length > 0) {
        const leverageInversion = claims.find(c => c.isLeverageInversion);
        if (leverageInversion) {
            strongestOutlier = {
                claim: {
                    id: leverageInversion.id,
                    label: leverageInversion.label,
                    text: leverageInversion.text,
                    supportCount: leverageInversion.supporters.length,
                    supportRatio: leverageInversion.supportRatio
                },
                reason: "leverage_inversion",
                structuralRole: "Leverage inversion claim with high structural importance and low support",
                whatItQuestions: inferWhatOutlierQuestions(leverageInversion, floorClaims)
            };
        }
        if (!strongestOutlier && challengerInfos.length > 0) {
            const topChallenger = [...challengerInfos].sort((a, b) => b.supportCount - a.supportCount)[0];
            const challengerClaim = claims.find(c => c.id === topChallenger.id);
            if (challengerClaim) {
                strongestOutlier = {
                    claim: {
                        id: challengerClaim.id,
                        label: challengerClaim.label,
                        text: challengerClaim.text,
                        supportCount: challengerClaim.supporters.length,
                        supportRatio: challengerClaim.supportRatio
                    },
                    reason: "explicit_challenger",
                    structuralRole: "Direct challenger to the floor",
                    whatItQuestions: topChallenger.challenges || "the consensus position"
                };
            }
        }
        if (!strongestOutlier) {
            const topOutside = [...outsideClaims].sort((a, b) => b.supporters.length - a.supporters.length)[0];
            strongestOutlier = {
                claim: {
                    id: topOutside.id,
                    label: topOutside.label,
                    text: topOutside.text,
                    supportCount: topOutside.supporters.length,
                    supportRatio: topOutside.supportRatio
                },
                reason: "minority_voice",
                structuralRole: "Strongest claim outside consensus",
                whatItQuestions: inferWhatOutlierQuestions(topOutside, floorClaims)
            };
        }
    }

    const floorAssumptions: string[] = [];
    const floorSupporters = new Set(floorClaims.flatMap(c => c.supporters));
    if (floorSupporters.size < (claims[0]?.supporters?.length || 0) * 0.5) {
        floorAssumptions.push("Relies on a subset of model perspectives");
    }
    const hasConditional = floorClaims.some(c => c.type === "conditional");
    if (!hasConditional) {
        floorAssumptions.push("Assumes context-independence");
    }
    const contestedFloor = floor.filter(c => c.isContested);
    if (contestedFloor.length > 0) {
        floorAssumptions.push(`${contestedFloor.length} floor claim(s) are under active challenge`);
    }

    const transferQuestion = strongestOutlier
        ? `For the consensus to hold, ${strongestOutlier.whatItQuestions} must be wrong. Is it?`
        : "For the consensus to hold, what assumption must be true? Is it true in your situation?";

    return {
        pattern: "settled",
        floor,
        floorStrength,
        challengers: challengerInfos,
        blindSpots: ghosts,
        confidence: avgSupport,
        strongestOutlier,
        floorAssumptions,
        transferQuestion
    };
};

const buildLinearShapeData = (
    claims: EnrichedClaim[],
    edges: Edge[],
    graph: GraphAnalysis,
    cascadeRisks: CascadeRisk[]
): LinearShapeDataExtended => {
    const prereqEdges = edges.filter(e => e.type === "prerequisite");
    const chainIds = graph.longestChain;

    const chain: ChainStep[] = chainIds.map((id, idx) => {
        const claim = claims.find(c => c.id === id);
        if (!claim) return null;
        const enables = prereqEdges
            .filter(e => e.from === id)
            .map(e => e.to);
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
            weakReason: isWeakLink
                ? `Only 1 supporter - cascade affects ${cascade?.dependentIds.length || 0} claims`
                : null
        };
    }).filter(Boolean) as ChainStep[];

    const weakLinks = chain
        .filter(step => step.isWeakLink)
        .map(step => {
            const cascade = cascadeRisks.find(r => r.sourceId === step.id);
            return {
                step,
                cascadeSize: cascade?.dependentIds.length || 0
            };
        });

    const terminalClaim = chain.length > 0 ? chain[chain.length - 1] : null;
    const chainIdSet = new Set(chainIds);
    const chainPositions = new Map(chainIds.map((id, idx) => [id, idx]));

    const shortcuts: LinearShapeDataExtended["shortcuts"] = [];
    for (const edge of prereqEdges) {
        const fromPos = chainPositions.get(edge.from);
        const toPos = chainPositions.get(edge.to);
        if (fromPos !== undefined && toPos !== undefined && toPos - fromPos > 1) {
            const fromStep = chain.find(s => s.id === edge.from);
            const toStep = chain.find(s => s.id === edge.to);
            const skippedIds = chainIds.slice(fromPos + 1, toPos);
            if (fromStep && toStep && skippedIds.length > 0) {
                shortcuts.push({
                    from: fromStep,
                    to: toStep,
                    skips: skippedIds,
                    supportEvidence: `Direct edge exists from step ${fromPos + 1} to step ${toPos + 1}`
                });
            }
        }
    }

    const outsideChain = claims.filter(c => !chainIdSet.has(c.id));
    for (const outside of outsideChain) {
        const connectsTo = prereqEdges
            .filter(e => e.from === outside.id && chainIdSet.has(e.to))
            .map(e => chainPositions.get(e.to)!)
            .filter(pos => pos !== undefined);
        if (connectsTo.length > 0) {
            const minPos = Math.min(...connectsTo);
            if (minPos > 0) {
                const toStep = chain[minPos];
                shortcuts.push({
                    from: {
                        id: outside.id,
                        label: outside.label,
                        text: outside.text,
                        supportCount: outside.supporters.length,
                        supportRatio: outside.supportRatio,
                        position: -1,
                        enables: [],
                        isWeakLink: false,
                        weakReason: null
                    },
                    to: toStep,
                    skips: chainIds.slice(0, minPos),
                    supportEvidence: `"${outside.label}" may bypass early steps`
                });
            }
        }
    }

    const chainFragility = {
        weakLinkCount: weakLinks.length,
        totalSteps: chain.length,
        fragilityRatio: chain.length > 0 ? weakLinks.length / chain.length : 0,
        mostVulnerableStep: weakLinks.length > 0
            ? [...weakLinks].sort((a, b) => b.cascadeSize - a.cascadeSize)[0]
            : null
    };

    const transferQuestion = weakLinks.length > 0
        ? `Step "${weakLinks[0].step.label}" is a weak link. Is it actually required?`
        : "Where are you in this sequence? Have you validated the early steps?";

    return {
        pattern: "linear",
        chain,
        chainLength: chain.length,
        weakLinks,
        alternativeChains: [],
        terminalClaim,
        shortcuts,
        chainFragility,
        transferQuestion
    };
};

const buildKeystoneShapeData = (
    claims: EnrichedClaim[],
    edges: Edge[],
    graph: GraphAnalysis,
    patterns: StructuralAnalysis["patterns"]
): KeystoneShapeDataExtended => {
    const keystoneId = graph.hubClaim;
    const keystoneClaim = claims.find(c => c.id === keystoneId);

    if (!keystoneClaim) {
        throw new Error("Keystone shape requires a hub claim");
    }

    const dependencies = edges
        .filter(e => e.from === keystoneId && (e.type === "prerequisite" || e.type === "supports"))
        .map(e => {
            const dep = claims.find(c => c.id === e.to);
            return {
                id: e.to,
                label: dep?.label || e.to,
                relationship: e.type as "prerequisite" | "supports"
            };
        });

    const cascade = patterns.cascadeRisks.find(r => r.sourceId === keystoneId);

    const challengers = claims
        .filter(c => c.role === "challenger")
        .filter(c => {
            return edges.some(e =>
                e.type === "conflicts" &&
                ((e.from === c.id && e.to === keystoneId) || (e.to === c.id && e.from === keystoneId))
            );
        })
        .map(c => ({
            id: c.id,
            label: c.label,
            text: c.text,
            supportCount: c.supporters.length,
            challenges: c.challenges,
            targetsClaim: keystoneId || null
        }));

    const dependentIds = new Set(dependencies.map(d => d.id));
    const keystoneConnectedIds = new Set<string>([keystoneId!, ...dependentIds]);

    const decoupledClaims = claims
        .filter(c => !keystoneConnectedIds.has(c.id))
        .filter(c => c.supporters.length > 0)
        .sort((a, b) => b.supporters.length - a.supporters.length)
        .slice(0, 3)
        .map(c => ({
            id: c.id,
            label: c.label,
            text: c.text,
            supportCount: c.supporters.length,
            independenceReason: "Not connected to hub in graph structure"
        }));

    const cascadeConsequences = {
        directlyAffected: dependencies.length,
        transitivelyAffected: cascade?.dependentIds.length || dependencies.length,
        survives: decoupledClaims.length
    };

    const transferQuestion = keystoneClaim.supporters.length <= 1
        ? `The keystone has only ${keystoneClaim.supporters.length} supporter(s). Is "${keystoneClaim.label}" actually true in your situation?`
        : `Everything flows from "${keystoneClaim.label}". Have you validated this foundation?`;

    return {
        pattern: "keystone",
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
        challengers,
        decoupledClaims,
        cascadeConsequences,
        transferQuestion
    };
};

const buildContestedShapeData = (
    claims: EnrichedClaim[],
    patterns: StructuralAnalysis['patterns'],
    conflictInfos: ConflictInfo[],
    conflictClusters: ConflictCluster[]
): ContestedShapeData => {
    let centralConflict: CentralConflict;

    if (conflictClusters.length > 0) {
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

    const usedIds = new Set<string>();
    if (centralConflict.type === 'individual') {
        usedIds.add(centralConflict.positionA.claim.id);
        usedIds.add(centralConflict.positionB.claim.id);
    } else {
        usedIds.add(centralConflict.target.claim.id);
        centralConflict.challengers.claims.forEach(c => usedIds.add(c.id));
    }

    const secondaryConflicts = conflictInfos.filter(c =>
        !usedIds.has(c.claimA.id) || !usedIds.has(c.claimB.id)
    );

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
            governingFactor: null
        };
    });

    const dominatedOptions: Array<{ dominated: string; dominatedBy: string; reason: string }> = [];

    for (const t of tradeoffs) {
        const supportDiff = Math.abs(t.optionA.supportRatio - t.optionB.supportRatio);
        if (supportDiff > 0.3) {
            const [higher, lower] = t.optionA.supportRatio > t.optionB.supportRatio
                ? [t.optionA, t.optionB]
                : [t.optionB, t.optionA];

            dominatedOptions.push({
                dominated: lower.id,
                dominatedBy: higher.id,
                reason: `${higher.label} has significantly higher support with no unique tradeoff benefit`
            });
        }
    }

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

function inferDimensionTheme(claims: EnrichedClaim[]): string {
    const types = claims.map(c => c.type);
    const dominantType = mode(types);
    const typeThemes: Record<string, string> = {
        factual: "Evidence",
        prescriptive: "Recommendations",
        conditional: "Conditions",
        contested: "Debates",
        speculative: "Possibilities"
    };
    return typeThemes[dominantType] || `Cluster (${claims.length} claims)`;
}

function mode<T>(arr: T[]): T {
    const counts = new Map<T, number>();
    arr.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? arr[0];
}

const buildDimensionalShapeData = (
    claims: EnrichedClaim[],
    edges: Edge[],
    graph: GraphAnalysis,
    ghosts: string[]
): DimensionalShapeDataExtended => {
    const dimensions: Array<DimensionCluster & { claimCount: number }> = graph.components
        .filter(comp => comp.length >= 2)
        .map((componentIds, idx) => {
            const componentClaims = claims.filter(c => componentIds.includes(c.id));
            const avgSupport = componentClaims.reduce((sum, c) => sum + c.supportRatio, 0) / componentClaims.length;
            const internalEdges = edges.filter(e =>
                componentIds.includes(e.from) && componentIds.includes(e.to)
            ).length;
            const possibleEdges = componentClaims.length * (componentClaims.length - 1);
            const cohesion = possibleEdges > 0 ? internalEdges / possibleEdges : 0;
            return {
                id: `dim_${idx}`,
                theme: inferDimensionTheme(componentClaims),
                claims: componentClaims.map(c => ({
                    id: c.id,
                    label: c.label,
                    text: c.text,
                    supportCount: c.supporters.length
                })),
                cohesion,
                avgSupport,
                claimCount: componentClaims.length
            };
        })
        .sort((a, b) => b.claimCount - a.claimCount);

    const interactions: DimensionalShapeDataExtended["interactions"] = [];
    for (let i = 0; i < dimensions.length; i++) {
        for (let j = i + 1; j < dimensions.length; j++) {
            const dimA = dimensions[i];
            const dimB = dimensions[j];
            const crossEdges = edges.filter(e =>
                (dimA.claims.some(c => c.id === e.from) && dimB.claims.some(c => c.id === e.to)) ||
                (dimB.claims.some(c => c.id === e.from) && dimA.claims.some(c => c.id === e.to))
            );
            const hasConflict = crossEdges.some(e => e.type === "conflicts");
            const hasSupport = crossEdges.some(e => e.type === "supports" || e.type === "prerequisite");
            interactions.push({
                dimensionA: dimA.id,
                dimensionB: dimB.id,
                relationship: hasConflict ? "conflicting" : hasSupport ? "overlapping" : "independent"
            });
        }
    }

    const dominantDimension = dimensions[0] || null;
    const hiddenDimension = dimensions.length > 1 ? dimensions[dimensions.length - 1] : null;

    const dominantBlindSpots: string[] = [];
    if (hiddenDimension) {
        dominantBlindSpots.push(
            `"${hiddenDimension.theme}" perspective with ${hiddenDimension.claimCount} claim(s)`
        );
    }
    const conflictingDims = interactions
        .filter((i: any) => i.relationship === "conflicting")
        .map((i: any) => {
            const other = i.dimensionA === dominantDimension?.id
                ? dimensions.find(d => d.id === i.dimensionB)
                : dimensions.find(d => d.id === i.dimensionA);
            return other?.theme;
        })
        .filter((t): t is string => Boolean(t));
    if (conflictingDims.length > 0) {
        dominantBlindSpots.push(`Conflicts with: ${conflictingDims.join(", ")}`);
    }

    const governingConditions = claims
        .filter(c => c.type === "conditional")
        .map(c => c.text);

    const transferQuestion = dimensions.length > 1
        ? `Which dimension is most relevant: "${dominantDimension?.theme}" or "${hiddenDimension?.theme}"?`
        : "Are there perspectives not represented in these dimensions?";

    return {
        pattern: "dimensional",
        dimensions,
        interactions,
        gaps: ghosts,
        governingConditions,
        dominantDimension,
        hiddenDimension,
        dominantBlindSpots,
        transferQuestion
    };
};

const buildExploratoryShapeData = (
    claims: EnrichedClaim[],
    graph: GraphAnalysis,
    ghosts: string[],
    signalStrength: number
): ExploratoryShapeDataExtended => {
    const sortedBySupport = [...claims].sort((a, b) => b.supporters.length - a.supporters.length);
    const sortedByDegree = [...claims].sort(
        (a, b) => (b.inDegree + b.outDegree) - (a.inDegree + a.outDegree)
    );

    const strongestSignals: ExploratoryShapeDataExtended["strongestSignals"] = [];
    if (sortedBySupport[0]) {
        strongestSignals.push({
            id: sortedBySupport[0].id,
            label: sortedBySupport[0].label,
            text: sortedBySupport[0].text,
            supportCount: sortedBySupport[0].supporters.length,
            reason: "Highest support"
        });
    }
    if (sortedByDegree[0] && sortedByDegree[0].id !== sortedBySupport[0]?.id) {
        strongestSignals.push({
            id: sortedByDegree[0].id,
            label: sortedByDegree[0].label,
            text: sortedByDegree[0].text,
            supportCount: sortedByDegree[0].supporters.length,
            reason: "Most connected"
        });
    }

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

    const isolatedClaims = claims
        .filter(c => c.isIsolated)
        .map(c => ({
            id: c.id,
            label: c.label,
            text: c.text
        }));

    const outerBoundaryClaim = claims
        .filter(c => c.supporters.length > 0)
        .sort((a, b) => {
            const aScore = a.supportRatio + (a.inDegree + a.outDegree) / 10;
            const bScore = b.supportRatio + (b.inDegree + b.outDegree) / 10;
            return aScore - bScore;
        })[0] || null;

    const sparsityReasons: string[] = [];
    if (graph.componentCount > claims.length * 0.5) {
        sparsityReasons.push("Claims form many disconnected islands");
    }
    const avgSupport = claims.length > 0
        ? claims.reduce((sum, c) => sum + c.supportRatio, 0) / claims.length
        : 0;
    if (avgSupport < 0.3) {
        sparsityReasons.push("Low support concentration (models diverge)");
    }
    if (ghosts.length > claims.length * 0.3) {
        sparsityReasons.push("Many gaps identified (unexplored territory)");
    }
    if (claims.every(c => c.inDegree + c.outDegree < 2)) {
        sparsityReasons.push("No claims strongly connected (flat structure)");
    }

    const clarifyingQuestions: string[] = [];
    if (ghosts.length > 0) {
        clarifyingQuestions.push(`What about: ${ghosts[0]}?`);
    }
    if (isolatedClaims.length > 0) {
        clarifyingQuestions.push(
            `How does "${isolatedClaims[0].label}" relate to your situation?`
        );
    }
    if (claims.some(c => c.type === "conditional")) {
        clarifyingQuestions.push("What is your specific context or constraints?");
    }
    if (clarifyingQuestions.length === 0) {
        clarifyingQuestions.push("What outcome are you optimizing for?");
    }

    return {
        pattern: "exploratory",
        strongestSignals,
        looseClusters,
        isolatedClaims,
        clarifyingQuestions,
        signalStrength,
        outerBoundary: outerBoundaryClaim
            ? {
                id: outerBoundaryClaim.id,
                label: outerBoundaryClaim.label,
                text: outerBoundaryClaim.text,
                supportCount: outerBoundaryClaim.supporters.length,
                distanceReason: "Lowest combined support and connectivity"
            }
            : null,
        sparsityReasons,
        transferQuestion: "What specific question would help collapse this ambiguity?"
    };
};

const buildContextualShapeData = (
    claims: EnrichedClaim[],
    ghosts: string[]
): ContextualShapeData => {
    const conditionalClaims = claims.filter(c => c.type === 'conditional');

    let governingCondition = "User's specific situation";
    if (conditionalClaims.length > 0) {
        governingCondition = conditionalClaims[0].text;
    }

    const branches: Array<{
        condition: string;
        claims: FloorClaim[];
    }> = [];

    const roots = claims.filter(c => c.type === 'conditional');

    roots.forEach((root) => {
        const branchClaims: FloorClaim[] = [{
            id: root.id,
            label: root.label,
            text: root.text,
            supportCount: root.supporters.length,
            supportRatio: root.supportRatio,
            isContested: false,
            contestedBy: []
        }];

        branches.push({
            condition: `If ${root.label}`,
            claims: branchClaims
        });
    });

    const defaultPath = branches.length > 0
        ? {
            exists: true,
            claims: branches.sort((a, b) =>
                b.claims.reduce((s, c) => s + c.supportCount, 0) -
                a.claims.reduce((s, c) => s + c.supportCount, 0)
            )[0].claims
        }
        : null;

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

const detectEnrichedConflicts = (
    edges: Edge[],
    claims: EnrichedClaim[],
    landscape: { modelCount: number }
): ConflictInfo[] => {
    const claimMap = new Map(claims.map(c => [c.id, c]));
    const conflictEdges = edges.filter(e => e.type === "conflicts");
    const infos: ConflictInfo[] = [];

    const toConflictClaim = (c: EnrichedClaim): ConflictInfo['claimA'] => ({
        id: c.id,
        label: c.label,
        text: c.text,
        supportCount: c.supporters.length,
        supportRatio: c.supportRatio,
        role: c.role,
        isHighSupport: c.isHighSupport,
        challenges: c.challenges
    });

    for (const e of conflictEdges) {
        const a = claimMap.get(e.from);
        const b = claimMap.get(e.to);
        if (!a || !b) continue;

        const combinedSupport = a.supporters.length + b.supporters.length;
        const supportDelta = Math.abs(a.supporters.length - b.supporters.length);
        const dynamics = determineTensionDynamics(a, b);

        const inferredAxis = `${a.label} vs ${b.label}`;

        infos.push({
            id: `${a.id}_vs_${b.id}`,
            claimA: toConflictClaim(a),
            claimB: toConflictClaim(b),
            axis: {
                explicit: a.challenges === b.id ? a.text : (b.challenges === a.id ? b.text : null),
                inferred: inferredAxis,
                resolved: a.challenges === b.id ? a.text : inferredAxis
            },
            combinedSupport,
            supportDelta,
            dynamics,
            isBothHighSupport: a.isHighSupport && b.isHighSupport,
            isHighVsLow: (a.isHighSupport && !b.isHighSupport) || (!a.isHighSupport && b.isHighSupport),
            involvesChallenger: a.role === 'challenger' || b.role === 'challenger',
            involvesAnchor: a.role === 'anchor' || b.role === 'anchor',
            involvesKeystone: a.isKeystone || b.isKeystone,
            stakes: {
                choosingA: `Prioritizing ${a.label}`,
                choosingB: `Prioritizing ${b.label}`
            },
            significance: (a.supportRatio + b.supportRatio) * (a.role === 'challenger' || b.role === 'challenger' ? 1.5 : 1.0),
            clusterId: null
        });
    }

    return infos.sort((a, b) => b.significance - a.significance);
};

const detectConflictClusters = (
    conflicts: ConflictInfo[],
    claims: EnrichedClaim[]
): ConflictCluster[] => {
    const clusters: ConflictCluster[] = [];
    const conflictsByClaim = new Map<string, string[]>();

    for (const c of conflicts) {
        // If explicit challenge, direction is known
        if (c.claimA.challenges === c.claimB.id) {
            const list = conflictsByClaim.get(c.claimB.id) || [];
            list.push(c.claimA.id);
            conflictsByClaim.set(c.claimB.id, list);
        } else if (c.claimB.challenges === c.claimA.id) {
            const list = conflictsByClaim.get(c.claimA.id) || [];
            list.push(c.claimB.id);
            conflictsByClaim.set(c.claimA.id, list);
        } else {
            // Indeterminate/Symmetric: Assume floor is the target
            if (c.claimB.isHighSupport && !c.claimA.isHighSupport) {
                const list = conflictsByClaim.get(c.claimB.id) || [];
                list.push(c.claimA.id);
                conflictsByClaim.set(c.claimB.id, list);
            } else if (c.claimA.isHighSupport && !c.claimB.isHighSupport) {
                const list = conflictsByClaim.get(c.claimA.id) || [];
                list.push(c.claimB.id);
                conflictsByClaim.set(c.claimA.id, list);
            }
        }
    }

    let clusterIdx = 0;
    for (const [targetId, challengers] of Array.from(conflictsByClaim.entries())) {
        if (challengers.length >= 2) {
            clusters.push({
                id: `cluster_${clusterIdx++}`,
                axis: `Multiple challenges to ${targetId}`,
                targetId,
                challengerIds: challengers,
                theme: "Dissent against consensus" // Placeholder theme
            });
        }
    }

    return clusters;
};

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

    // Step 10: Signal strength
    const signalStrength = computeSignalStrength(
        claimsWithLeverage.length,
        edges.length,
        landscape.modelCount,
        claimsWithLeverage.map(c => c.supporters)
    );

    // Step 11: Composite shape detection (peak-first approach)
    const compositeShape = detectCompositeShape(
        claimsWithLeverage,
        edges,
        graph,
        patterns.cascadeRisks
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // Step 12: BUILD SHAPE DATA BASED ON NEW PRIMARY SHAPE
    // Secondary patterns augment, they don't replace
    // ═══════════════════════════════════════════════════════════════════════════

    const buildShapeData = (): ProblemStructure['data'] => {
        const { primary, patterns: secondaryPatterns } = compositeShape;

        // Check for secondary patterns that require specific handling
        const hasKeystone = secondaryPatterns.some(p => p.type === 'keystone');
        const hasChain = secondaryPatterns.some(p => p.type === 'chain');
        const keystonePatternData = secondaryPatterns.find(p => p.type === 'keystone')?.data as KeystonePatternData | undefined;
        const chainPatternData = secondaryPatterns.find(p => p.type === 'chain')?.data as ChainPatternData | undefined;

        switch (primary) {
            case 'convergent': {
                // Use settled builder - consensus with challengers
                const settledData = buildSettledShapeData(claimsWithLeverage, edges, ghosts);

                // If keystone secondary pattern exists AND we have a hub, enrich with keystone info
                if (hasKeystone && keystonePatternData && graph.hubClaim) {
                    try {
                        const keystoneEnrichment = buildKeystoneShapeData(claimsWithLeverage, edges, graph, patterns);
                        return {
                            ...settledData,
                            keystone: keystoneEnrichment.keystone,
                            cascadeConsequences: keystoneEnrichment.cascadeConsequences,
                            dependencies: keystoneEnrichment.dependencies,
                        } as any;
                    } catch (e) {
                        // Keystone builder failed, continue with settled data
                        console.warn('[PromptMethods] Keystone enrichment failed:', e);
                    }
                }

                // If chain secondary pattern exists, note the dependency sequence
                if (hasChain && chainPatternData && chainPatternData.length >= 3) {
                    const linearEnrichment = buildLinearShapeData(claimsWithLeverage, edges, graph, patterns.cascadeRisks);
                    return {
                        ...settledData,
                        chain: linearEnrichment.chain,
                        chainFragility: linearEnrichment.chainFragility,
                        chainLength: linearEnrichment.chainLength,
                    } as any;
                }

                return settledData;
            }

            case 'forked': {
                // Use contested builder - genuine disagreement between peaks
                if (enrichedConflicts.length === 0 && conflictClusters.length === 0) {
                    // No conflicts found despite forked shape - fall back to settled with warning
                    console.warn('[PromptMethods] Forked shape but no conflicts - falling back to settled');
                    return buildSettledShapeData(claimsWithLeverage, edges, ghosts);
                }
                return buildContestedShapeData(
                    claimsWithLeverage,
                    patterns,
                    enrichedConflicts,
                    conflictClusters
                );
            }

            case 'constrained': {
                // Use tradeoff builder - optimization boundaries
                if (patterns.tradeoffs.length === 0) {
                    // No tradeoffs found despite constrained shape - check for conflicts
                    if (enrichedConflicts.length > 0) {
                        return buildContestedShapeData(
                            claimsWithLeverage,
                            patterns,
                            enrichedConflicts,
                            conflictClusters
                        );
                    }
                    // Fall back to exploratory
                    console.warn('[PromptMethods] Constrained shape but no tradeoffs - falling back to exploratory');
                    return buildExploratoryShapeData(claimsWithLeverage, graph, ghosts, signalStrength);
                }
                return buildTradeoffShapeData(claimsWithLeverage, patterns.tradeoffs);
            }

            case 'parallel': {
                // Use dimensional builder - independent axes
                if (graph.componentCount < 2) {
                    // Only one component - check if there are conditional claims
                    const conditionalClaims = claimsWithLeverage.filter(c => c.type === 'conditional');
                    if (conditionalClaims.length > 0) {
                        return buildContextualShapeData(claimsWithLeverage, ghosts);
                    }
                    // Fall back to settled
                    return buildSettledShapeData(claimsWithLeverage, edges, ghosts);
                }
                return buildDimensionalShapeData(claimsWithLeverage, edges, graph, ghosts);
            }

            case 'sparse':
            default: {
                // Use exploratory builder - weak signal
                return buildExploratoryShapeData(claimsWithLeverage, graph, ghosts, signalStrength);
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // Step 13: Assemble final shape with composite + data
    // ═══════════════════════════════════════════════════════════════════════════

    let shapeData: ProblemStructure['data'] | undefined;

    try {
        shapeData = buildShapeData();
        console.log('[PromptMethods] Shape data built for primary:', compositeShape.primary, {
            hasData: !!shapeData,
            dataPattern: (shapeData as any)?.pattern,
            secondaryPatterns: compositeShape.patterns.map(p => p.type),
        });
    } catch (e) {
        console.error("[PromptMethods] Failed to build shape data:", e);
        // Fallback to exploratory if shape-specific builder fails
        shapeData = buildExploratoryShapeData(claimsWithLeverage, graph, ghosts, signalStrength);
        console.log('[PromptMethods] Fell back to exploratory shape data');
    }

    // Build the final ProblemStructure
    const shape: ProblemStructure = {
        // New peak-first fields
        primary: compositeShape.primary,
        confidence: compositeShape.confidence,
        patterns: compositeShape.patterns,
        peaks: compositeShape.peaks,
        peakRelationship: compositeShape.peakRelationship,
        evidence: compositeShape.evidence,
        transferQuestion: compositeShape.transferQuestion,

        // Rich shape data from builders
        data: shapeData,

        // Signal strength for sparse detection
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
        primaryShape: shape.primary,
        peakCount: compositeShape.peaks.length,
        secondaryPatterns: compositeShape.patterns.map(p => p.type),
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
// SHADOW MAPPER INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute full analysis including Shadow Mapper.
 * Call this after batch responses AND mapper artifact are available.
 * 
 * @param batchResponses - Raw batch responses with modelIndex and content
 * @param primaryArtifact - MapperArtifact from primary mapper
 * @param userQuery - Original user query for relevance scoring
 */
export const computeFullAnalysis = (
    batchResponses: Array<{ modelIndex: number; content: string }>,
    primaryArtifact: MapperArtifact,
    userQuery: string
): StructuralAnalysis & {
    shadow: {
        audit: ShadowAudit;
        unindexed: UnindexedStatement[];
        topUnindexed: UnindexedStatement[];
        processingTime: number;
    }
} => {
    // 1. Run existing structural analysis (unchanged)
    const baseAnalysis = computeStructuralAnalysis(primaryArtifact);

    // 2. Run Shadow two-pass extraction
    const shadowExtraction = executeShadowExtraction(batchResponses);

    // 3. Run Shadow delta (compare to Primary)
    const shadowDelta = executeShadowDelta(
        shadowExtraction,
        primaryArtifact,
        userQuery
    );

    // ═════════════════════════════════════════════════════════════════
    // DEBUG LOGGING (Shadow Mapper)
    // ═════════════════════════════════════════════════════════════════
    console.groupCollapsed(`[Shadow] Audit: ${shadowDelta.unindexed.length} unindexed gaps found`);
    console.log("Stats:", shadowDelta.audit.extraction);
    console.log("Gaps:", shadowDelta.audit.gaps);

    if (shadowDelta.unindexed.length > 0) {
        console.log("TOP UNINDEXED GAPS (Query-Relevant):");
        console.table(shadowDelta.unindexed.slice(0, 10).map(u => ({
            Type: u.type,
            Score: u.adjustedScore.toFixed(2),
            Text: u.text.length > 120 ? u.text.substring(0, 117) + "..." : u.text,
            Models: u.sourceModels.join(', ')
        })));
    }

    console.log("Survival by Type:", shadowDelta.audit.typeSurvival);
    console.groupEnd();

    // 4. Combine
    return {
        ...baseAnalysis,
        shadow: {
            audit: shadowDelta.audit,
            unindexed: shadowDelta.unindexed,
            topUnindexed: shadowDelta.unindexed.slice(0, 5),
            processingTime: shadowExtraction.processingTime + shadowDelta.processingTime
        }
    };
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
    getTopNCount,
    // Re-export shadow types for consumers
    executeShadowExtraction,
    executeShadowDelta,
};

// Re-export types
export type { ShadowAudit, UnindexedStatement, TwoPassResult, DeltaResult };