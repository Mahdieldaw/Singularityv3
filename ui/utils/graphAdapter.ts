import { GraphTopology, GraphNode, GraphEdge, Claim, Edge, EnrichedClaim, GraphAnalysis, CascadeRisk, ConflictPair, LeverageInversion } from '../../shared/contract';

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

    // Convert nodes to Claims
    const claims: Claim[] = safeNodes.map((node: GraphNode) => ({
        id: String(node.id),
        label: String(node.label ?? node.id ?? ''),
        text: String(node.label ?? node.id ?? ''), // Use label as text fallback
        supporters: (Array.isArray((node as any)?.supporters) ? (node as any).supporters : []).map((s: any) => Number(s)).filter((n: number) => Number.isFinite(n)),
        support_count: Number((node as any)?.support_count) || 0,
        type: isClaimType((node as any)?.theme) ? (node as any).theme : "factual",
        role: "anchor", // Default role
        challenges: null, // Default challenges
        originalId: String(node.id),
        quote: (node as any)?.quote // Optional quote
    }));

    // Convert edges to Edges (from/to)
    const edges: Edge[] = safeEdges.map((edge: GraphEdge) => ({
        from: String((edge as any)?.source || ''),
        to: String((edge as any)?.target || ''),
        type: mapGraphEdgeTypeToEdgeType((edge as any)?.type)
    }));

    graphAdapterDbg("adapted", { nodes: safeNodes.length, edges: safeEdges.length });
    return { claims, edges };
}

export interface InsightData {
    type: string;
    claim: { label: string; supporters: (string | number)[] };
    metadata: Record<string, any>;
}

export function generateInsightsFromAnalysis(
    claims: EnrichedClaim[],
    patterns: {
        leverageInversions: LeverageInversion[];
        cascadeRisks: CascadeRisk[];
        conflicts: ConflictPair[];
    },
    graph: GraphAnalysis
): InsightData[] {
    const insights: InsightData[] = [];

    // Keystone / Hub
    if (graph.hubClaim) {
        const hub = claims.find(c => c.id === graph.hubClaim);
        if (hub) {
            insights.push({
                type: 'keystone',
                claim: { label: hub.label, supporters: hub.supporters },
                metadata: {
                    dependentCount: hub.outDegree,
                    hubDominance: graph.hubDominance,
                    supportRatio: hub.supportRatio,
                }
            });
        }
    }

    // Leverage Inversions
    for (const inv of patterns.leverageInversions) {
        const claim = claims.find(c => c.id === inv.claimId);
        if (claim) {
            insights.push({
                type: 'leverage_inversion',
                claim: { label: claim.label, supporters: claim.supporters },
                metadata: {
                    supportRatio: claim.supportRatio,
                    inversionReason: inv.reason,
                    dependentCount: inv.affectedClaims.length,
                    leverageScore: claim.leverage,
                }
            });
        }
    }

    // Evidence Gaps
    for (const claim of claims.filter(c => c.isEvidenceGap)) {
        const cascade = patterns.cascadeRisks.find(r => r.sourceId === claim.id);
        insights.push({
            type: 'evidence_gap',
            claim: { label: claim.label, supporters: claim.supporters },
            metadata: {
                supportRatio: claim.supportRatio,
                gapScore: claim.evidenceGapScore,
                dependentCount: cascade?.dependentIds.length || 0,
                dependentLabels: cascade?.dependentLabels || [],
            }
        });
    }

    // High-Support Conflicts
    for (const conflict of patterns.conflicts.filter(c => c.isBothConsensus)) {
        insights.push({
            type: 'consensus_conflict',
            claim: { label: conflict.claimA.label, supporters: [] },
            metadata: {
                conflictsWith: conflict.claimB.label,
            }
        });
    }

    // Challengers
    for (const claim of claims.filter(c => c.isChallenger)) {
        insights.push({
            type: 'challenger_threat',
            claim: { label: claim.label, supporters: claim.supporters },
            metadata: {
                supportRatio: claim.supportRatio,
            }
        });
    }

    // Orphans (isolated claims)
    for (const claim of claims.filter(c => c.isIsolated)) {
        insights.push({
            type: 'orphan',
            claim: { label: claim.label, supporters: claim.supporters },
            metadata: {}
        });
    }

    // Chain Roots
    const chainRoots = claims.filter(c => c.isChainRoot);
    if (graph.longestChain.length >= 3) {
        for (const root of chainRoots.filter(c => graph.longestChain[0] === c.id)) {
            insights.push({
                type: 'chain_root',
                claim: { label: root.label, supporters: root.supporters },
                metadata: {
                    chainLength: graph.longestChain.length,
                }
            });
        }
    }

    // Cascade Risks (deep ones)
    for (const risk of patterns.cascadeRisks.filter(r => r.depth >= 3)) {
        const claim = claims.find(c => c.id === risk.sourceId);
        if (claim) {
            insights.push({
                type: 'cascade_risk',
                claim: { label: claim.label, supporters: claim.supporters },
                metadata: {
                    dependentCount: risk.dependentIds.length,
                    cascadeDepth: risk.depth,
                    dependentLabels: risk.dependentLabels,
                }
            });
        }
    }

    // Support Outliers
    for (const claim of claims.filter(c => c.isOutlier)) {
        insights.push({
            type: 'support_outlier',
            claim: { label: claim.label, supporters: claim.supporters },
            metadata: {
                skew: claim.supportSkew,
                supportRatio: claim.supportRatio,
            }
        });
    }

    return insights;
}
