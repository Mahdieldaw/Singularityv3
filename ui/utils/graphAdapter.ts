import { GraphTopology, GraphNode, GraphEdge } from '../../shared/parsing-utils';
import { ClaimNode, ClaimEdge } from '../components/DecisionMapGraph';

/**
 * Converts mapper GraphTopology output to DecisionMapGraph format
 */
export function adaptGraphTopology(topology: GraphTopology | null): {
    nodes: ClaimNode[];
    edges: ClaimEdge[];
} {
    const safeNodes: GraphNode[] = Array.isArray((topology as any)?.nodes) ? (topology as any).nodes : [];
    const safeEdges: GraphEdge[] = Array.isArray((topology as any)?.edges) ? (topology as any).edges : [];

    if (safeNodes.length === 0) return { nodes: [], edges: [] };

    // Convert nodes
    const maxSupport = Math.max(...safeNodes.map((n: GraphNode) => Number((n as any)?.support_count) || 0), 1);

    const nodes: ClaimNode[] = safeNodes.map((node: GraphNode) => ({
        id: node.id,
        label: node.label,
        theme: node.theme,
        supporters: (Array.isArray((node as any)?.supporters) ? (node as any).supporters : []).map((s: any) => String(s)),
        support_count: Number((node as any)?.support_count) || 0,
        // Preserve consensus strength for visual sizing
        consensusStrength: (Number((node as any)?.support_count) || 0) / maxSupport,
    }));

    // Convert edges - preserve all 3 semantic types
    const edges: ClaimEdge[] = safeEdges.map((edge: GraphEdge) => ({
        source: String((edge as any)?.source || ''),
        target: String((edge as any)?.target || ''),
        reason: String((edge as any)?.reason || ''),
        // Preserve semantic edge types for force-directed layout
        type: (['conflicts', 'complements', 'prerequisite'].includes(String((edge as any)?.type)) ? String((edge as any)?.type) : 'complements') as ClaimEdge['type'],
    }));

    return { nodes, edges };
}
