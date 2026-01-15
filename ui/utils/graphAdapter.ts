import {
    GraphTopology, GraphNode, GraphEdge, Claim, Edge, EnrichedClaim,
    GraphAnalysis, CascadeRisk, ConflictPair, LeverageInversion,
    ProblemStructure, SecondaryPattern,
    DissentPatternData, KeystonePatternData, ChainPatternData,
    FragilePatternData, ChallengedPatternData, OrphanedPatternData
} from '../../shared/contract';

const DEBUG_GRAPH_ADAPTER = false;
const graphAdapterDbg = (...args: any[]) => {
    if (DEBUG_GRAPH_ADAPTER) console.debug('[graphAdapter]', ...args);
};

const CLAIM_TYPES: Claim["type"][] = ["factual", "prescriptive", "conditional", "contested", "speculative"];
const isClaimType = (value: unknown): value is Claim["type"] =>
    typeof value === "string" && (CLAIM_TYPES as string[]).includes(value);

const mapGraphEdgeTypeToEdgeType = (value: unknown): Edge["type"] => {
    if (value === "conflicts") return "conflicts";
    if (value === "tradeoff") return "tradeoff";
    if (value === "prerequisite") return "prerequisite";
    if (value === "supports") return "supports";
    if (value === "complements") return "supports";
    if (value === "bifurcation") return "supports";
    if (typeof value === "string" && value) {
        graphAdapterDbg("Unknown graph edge type, defaulting to supports:", value);
    }
    return "supports";
};

/**
 * Converts mapper GraphTopology output to DecisionMapGraph format (V3)
 */
export function adaptGraphTopology(topology: GraphTopology | null): {
    claims: Claim[];
    edges: Edge[];
} {
    const safeNodes: GraphNode[] = Array.isArray((topology as any)?.nodes) ? (topology as any).nodes : [];
    const safeEdges: GraphEdge[] = Array.isArray((topology as any)?.edges) ? (topology as any).edges : [];

    if (safeNodes.length === 0) return { claims: [], edges: [] };

    const claims: Claim[] = safeNodes.map((node: GraphNode) => ({
        id: String(node.id),
        label: String(node.label ?? node.id ?? ''),
        text: String(node.label ?? node.id ?? ''),
        supporters: (Array.isArray((node as any)?.supporters) ? (node as any).supporters : []).map((s: any) => Number(s)).filter((n: number) => Number.isFinite(n)),
        support_count: Number((node as any)?.support_count) || 0,
        type: isClaimType((node as any)?.theme) ? (node as any).theme : "factual",
        role: "anchor",
        challenges: null,
        originalId: String(node.id),
        quote: (node as any)?.quote
    }));

    const edges: Edge[] = safeEdges.map((edge: GraphEdge) => ({
        from: String((edge as any)?.source || ''),
        to: String((edge as any)?.target || ''),
        type: mapGraphEdgeTypeToEdgeType((edge as any)?.type)
    }));

    graphAdapterDbg("adapted", { nodes: safeNodes.length, edges: safeEdges.length });
    return { claims, edges };
}

// ═══════════════════════════════════════════════════════════════════════════
// INSIGHT TYPES - Updated for Peaks/Hills model
// ═══════════════════════════════════════════════════════════════════════════

export type InsightType =
    // PRIMARY from secondary patterns
    | 'dissent'           // NEW: Minority voice with potential insight
    | 'keystone'          // Hub that everything depends on
    | 'chain'             // NEW: Sequential dependency
    | 'fragile'           // NEW: Peak on weak foundation
    | 'challenged'        // NEW: Floor attacking peak
    | 'orphaned'          // NEW: Isolated high-support claim
    // DERIVED from claim flags (supplementary)
    | 'leverage_inversion'
    | 'evidence_gap'
    | 'consensus_conflict'
    | 'cascade_risk'
    | 'support_outlier'
    | 'challenger_threat';

export interface InsightData {
    type: InsightType;
    claim: { id: string; label: string; supporters: number[] };
    metadata: Record<string, any>;
    severity: 'high' | 'medium' | 'low';
    source: 'pattern' | 'claim_flag' | 'graph';  // Where this insight came from
}

/**
 * Generate insights from structural analysis.
 * UPDATED: Prioritizes secondary patterns from shape, then supplements with claim flags.
 */
export function generateInsightsFromAnalysis(
    claims: EnrichedClaim[],
    patterns: {
        leverageInversions: LeverageInversion[];
        cascadeRisks: CascadeRisk[];
        conflicts: ConflictPair[];
    } = { leverageInversions: [], cascadeRisks: [], conflicts: [] },
    graph: GraphAnalysis,
    shape?: ProblemStructure  // NEW: Optional shape for secondary patterns
): InsightData[] {
    const insights: InsightData[] = [];
    const claimMap = new Map(claims.map(c => [c.id, c]));

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: INSIGHTS FROM SECONDARY PATTERNS (Primary source of truth)
    // ═══════════════════════════════════════════════════════════════════════

    if (shape?.patterns) {
        for (const pattern of shape.patterns) {
            switch (pattern.type) {
                case 'dissent': {
                    const data = pattern.data as DissentPatternData;

                    // Strongest voice gets its own insight
                    const strongest = data.strongestVoice;
                    if (strongest) {
                        insights.push({
                            type: 'dissent',
                            claim: {
                                id: strongest.id,
                                label: strongest.label,
                                supporters: []
                            },
                            metadata: {
                                supportRatio: strongest.supportRatio,
                                whyItMatters: strongest.whyItMatters,
                                insightType: strongest.insightType || data.voices.find(v => v.id === strongest.id)?.insightType,
                                suppressedDimensions: data.suppressedDimensions,
                                voiceCount: data.voices.length,
                            },
                            severity: pattern.severity,
                            source: 'pattern'
                        });
                    }

                    // Add other voices as lower-priority insights
                    data.voices.slice(1, 3).forEach(voice => {
                        const claim = claimMap.get(voice.id);
                        if (claim) {
                            insights.push({
                                type: 'dissent',
                                claim: { id: claim.id, label: claim.label, supporters: claim.supporters },
                                metadata: {
                                    supportRatio: voice.supportRatio,
                                    insightType: voice.insightType,
                                    insightScore: voice.insightScore,
                                },
                                severity: 'low',
                                source: 'pattern'
                            });
                        }
                    });
                    break;
                }

                case 'keystone': {
                    const data = pattern.data as KeystonePatternData;
                    const claim = claimMap.get(data.keystone.id);
                    if (claim) {
                        insights.push({
                            type: 'keystone',
                            claim: { id: claim.id, label: claim.label, supporters: claim.supporters },
                            metadata: {
                                dependentCount: data.dependents.length,
                                cascadeSize: data.cascadeSize,
                                supportRatio: data.keystone.supportRatio,
                            },
                            severity: pattern.severity,
                            source: 'pattern'
                        });
                    }
                    break;
                }

                case 'chain': {
                    const data = pattern.data as ChainPatternData;
                    // First claim in chain
                    if (data.chain.length > 0) {
                        const firstId = data.chain[0];
                        const claim = claimMap.get(firstId);
                        if (claim) {
                            insights.push({
                                type: 'chain',
                                claim: { id: claim.id, label: claim.label, supporters: claim.supporters },
                                metadata: {
                                    chainLength: data.length,
                                    position: 0,
                                    isRoot: true,
                                    weakLinks: data.weakLinks,
                                },
                                severity: pattern.severity,
                                source: 'pattern'
                            });
                        }
                    }

                    // Weak links in chain
                    data.weakLinks.forEach(weakId => {
                        const claim = claimMap.get(weakId);
                        if (claim) {
                            const position = data.chain.indexOf(weakId);
                            insights.push({
                                type: 'chain',
                                claim: { id: claim.id, label: claim.label, supporters: claim.supporters },
                                metadata: {
                                    chainLength: data.length,
                                    position,
                                    isWeakLink: true,
                                },
                                severity: 'high',
                                source: 'pattern'
                            });
                        }
                    });
                    break;
                }

                case 'fragile': {
                    const data = pattern.data as FragilePatternData;
                    data.fragilities.forEach(frag => {
                        const peak = claimMap.get(frag.peak.id);
                        const foundation = claimMap.get(frag.weakFoundation.id);
                        if (peak && foundation) {
                            insights.push({
                                type: 'fragile',
                                claim: { id: peak.id, label: peak.label, supporters: peak.supporters },
                                metadata: {
                                    weakFoundation: {
                                        id: foundation.id,
                                        label: foundation.label,
                                        supportRatio: frag.weakFoundation.supportRatio,
                                    },
                                },
                                severity: pattern.severity,
                                source: 'pattern'
                            });
                        }
                    });
                    break;
                }

                case 'challenged': {
                    const data = pattern.data as ChallengedPatternData;
                    data.challenges.forEach(ch => {
                        const target = claimMap.get(ch.target.id);
                        if (target) {
                            insights.push({
                                type: 'challenged',
                                claim: { id: target.id, label: target.label, supporters: target.supporters },
                                metadata: {
                                    challenger: ch.challenger,
                                    targetSupportRatio: ch.target.supportRatio,
                                },
                                severity: pattern.severity,
                                source: 'pattern'
                            });
                        }
                    });
                    break;
                }

                case 'orphaned': {
                    const data = pattern.data as OrphanedPatternData;
                    data.orphans.forEach(orphan => {
                        const claim = claimMap.get(orphan.id);
                        if (claim) {
                            insights.push({
                                type: 'orphaned',
                                claim: { id: claim.id, label: claim.label, supporters: claim.supporters },
                                metadata: {
                                    supportRatio: orphan.supportRatio,
                                    reason: orphan.reason,
                                },
                                severity: pattern.severity,
                                source: 'pattern'
                            });
                        }
                    });
                    break;
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: FALLBACK KEYSTONE (only if no keystone pattern found)
    // ═══════════════════════════════════════════════════════════════════════

    const hasKeystonePattern = insights.some(i => i.type === 'keystone');
    if (!hasKeystonePattern && graph.hubClaim) {
        const hub = claims.find(c => c.id === graph.hubClaim);
        if (hub) {
            insights.push({
                type: 'keystone',
                claim: { id: hub.id, label: hub.label, supporters: hub.supporters },
                metadata: {
                    dependentCount: hub.outDegree,
                    hubDominance: graph.hubDominance,
                    supportRatio: hub.supportRatio,
                },
                severity: graph.hubDominance > 2 ? 'high' : 'medium',
                source: 'graph'
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: SUPPLEMENTARY INSIGHTS FROM CLAIM FLAGS
    // ═══════════════════════════════════════════════════════════════════════

    // Leverage Inversions (not already covered by dissent)
    const dissentIds = new Set(insights.filter(i => i.type === 'dissent').map(i => i.claim.id));

    if (patterns.leverageInversions.length > 0) {
        for (const inv of patterns.leverageInversions) {
            if (dissentIds.has(inv.claimId)) continue; // Already covered by dissent

            const claim = claims.find(c => c.id === inv.claimId);
            if (claim) {
                insights.push({
                    type: 'leverage_inversion',
                    claim: { id: claim.id, label: claim.label, supporters: claim.supporters },
                    metadata: {
                        supportRatio: claim.supportRatio,
                        inversionReason: inv.reason,
                        dependentCount: inv.affectedClaims.length,
                        leverageScore: claim.leverage,
                    },
                    severity: inv.affectedClaims.length > 2 ? 'high' : 'medium',
                    source: 'claim_flag'
                });
            }
        }
    }

    // Evidence Gaps
    for (const claim of claims.filter(c => c.isEvidenceGap)) {
        const cascade = patterns.cascadeRisks.find(r => r.sourceId === claim.id);
        insights.push({
            type: 'evidence_gap',
            claim: { id: claim.id, label: claim.label, supporters: claim.supporters },
            metadata: {
                supportRatio: claim.supportRatio,
                gapScore: claim.evidenceGapScore,
                dependentCount: cascade?.dependentIds.length || 0,
                dependentLabels: cascade?.dependentLabels || [],
            },
            severity: claim.evidenceGapScore > 2 ? 'high' : 'medium',
            source: 'claim_flag'
        });
    }

    // High-Support Conflicts
    for (const conflict of patterns.conflicts.filter(c => c.isBothConsensus)) {
        insights.push({
            type: 'consensus_conflict',
            claim: { id: conflict.claimA.id, label: conflict.claimA.label, supporters: [] },
            metadata: {
                conflictsWith: conflict.claimB.label,
                conflictsWithId: conflict.claimB.id,
                dynamics: conflict.dynamics,
            },
            severity: 'high',
            source: 'claim_flag'
        });
    }

    // Cascade Risks (deep ones not already covered)
    const keystoneIds = new Set(insights.filter(i => i.type === 'keystone').map(i => i.claim.id));
    for (const risk of patterns.cascadeRisks.filter(r => r.depth >= 3)) {
        if (keystoneIds.has(risk.sourceId)) continue; // Already covered by keystone

        const claim = claims.find(c => c.id === risk.sourceId);
        if (claim) {
            insights.push({
                type: 'cascade_risk',
                claim: { id: claim.id, label: claim.label, supporters: claim.supporters },
                metadata: {
                    dependentCount: risk.dependentIds.length,
                    cascadeDepth: risk.depth,
                    dependentLabels: risk.dependentLabels,
                },
                severity: risk.depth >= 4 ? 'high' : 'medium',
                source: 'claim_flag'
            });
        }
    }

    // Support Outliers
    for (const claim of claims.filter(c => c.isOutlier)) {
        insights.push({
            type: 'support_outlier',
            claim: { id: claim.id, label: claim.label, supporters: claim.supporters },
            metadata: {
                skew: claim.supportSkew,
                supportRatio: claim.supportRatio,
            },
            severity: claim.supportSkew > 0.7 ? 'high' : 'low',
            source: 'claim_flag'
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 4: SORT BY SEVERITY AND SOURCE PRIORITY
    // ═══════════════════════════════════════════════════════════════════════

    const severityOrder = { high: 0, medium: 1, low: 2 };
    const sourceOrder = { pattern: 0, graph: 1, claim_flag: 2 };

    insights.sort((a, b) => {
        // First by source (patterns first)
        const sourceDiff = sourceOrder[a.source] - sourceOrder[b.source];
        if (sourceDiff !== 0) return sourceDiff;

        // Then by severity
        return severityOrder[a.severity] - severityOrder[b.severity];
    });

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5: DEDUPLICATION
    // ═══════════════════════════════════════════════════════════════════════

    const uniqueInsights = new Map<string, InsightData>();

    // Process in order - relying on the sort we just did (Source, then Severity)
    // We want to KEEP the first one we find (highest priority)
    insights.forEach(insight => {
        const key = `${insight.type}:${insight.claim.id}`;
        if (!uniqueInsights.has(key)) {
            uniqueInsights.set(key, insight);
        }
    });

    const finalInsights = Array.from(uniqueInsights.values());

    graphAdapterDbg("insights generated", {
        total: finalInsights.length,
        fromPatterns: finalInsights.filter(i => i.source === 'pattern').length,
        fromGraph: finalInsights.filter(i => i.source === 'graph').length,
        fromFlags: finalInsights.filter(i => i.source === 'claim_flag').length,
    });

    return finalInsights;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Get peak claims from shape
// ═══════════════════════════════════════════════════════════════════════════

export function getPeakClaimIds(shape?: ProblemStructure): Set<string> {
    if (!shape?.peaks) return new Set();
    return new Set(shape.peaks.map(p => p.id));
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Check if claim has specific secondary pattern
// ═══════════════════════════════════════════════════════════════════════════

export function getClaimPatterns(claimId: string, shape?: ProblemStructure): SecondaryPattern[] {
    if (!shape?.patterns) return [];

    return shape.patterns.filter(p => {
        switch (p.type) {
            case 'dissent':
                return (p.data as DissentPatternData).voices.some(v => v.id === claimId);
            case 'keystone':
                return (p.data as KeystonePatternData).keystone.id === claimId;
            case 'chain':
                return (p.data as ChainPatternData).chain.includes(claimId);
            case 'fragile':
                return (p.data as FragilePatternData).fragilities.some(
                    f => f.peak.id === claimId || f.weakFoundation.id === claimId
                );
            case 'challenged':
                return (p.data as ChallengedPatternData).challenges.some(
                    c => c.target.id === claimId || c.challenger.id === claimId
                );
            case 'orphaned':
                return (p.data as OrphanedPatternData).orphans.some(o => o.id === claimId);
            default:
                return false;
        }
    });
}