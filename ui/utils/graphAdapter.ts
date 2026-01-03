import { GraphTopology, GraphNode, GraphEdge, Claim, Edge } from '../../shared/contract';

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
        id: node.id,
        label: node.label,
        text: node.label, // Use label as text fallback
        supporters: (Array.isArray((node as any)?.supporters) ? (node as any).supporters : []).map((s: any) => Number(s)).filter((n: number) => Number.isFinite(n)),
        support_count: Number((node as any)?.support_count) || 0,
        type: (node.theme as any) || "factual", // Map theme to type if available, cast as needed
        role: "anchor", // Default role
        challenges: null, // Default challenges
        originalId: node.id,
        quote: (node as any)?.quote // Optional quote
    }));

    // Convert edges to Edges (from/to)
    const edges: Edge[] = safeEdges.map((edge: GraphEdge) => ({
        from: String((edge as any)?.source || ''),
        to: String((edge as any)?.target || ''),
        type: (edge as any)?.type || 'supports' // Default to supports, cast if needed
    }));

    return { claims, edges };
}
