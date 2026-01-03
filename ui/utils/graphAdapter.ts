import { GraphTopology, GraphNode, GraphEdge, Claim, Edge } from '../../shared/contract';

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
        id: node.id,
        label: String(node.label ?? node.id ?? ''),
        text: String(node.label ?? node.id ?? ''), // Use label as text fallback
        supporters: (Array.isArray((node as any)?.supporters) ? (node as any).supporters : []).map((s: any) => Number(s)).filter((n: number) => Number.isFinite(n)),
        support_count: Number((node as any)?.support_count) || 0,
        type: isClaimType((node as any)?.theme) ? (node as any).theme : "factual",
        role: "anchor", // Default role
        challenges: null, // Default challenges
        originalId: node.id,
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
