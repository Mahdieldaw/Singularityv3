import { GraphTopology, GraphNode, GraphEdge } from '../../types';
import { ClaimNode, ClaimEdge } from './DecisionMapGraph';

/**
 * Converts mapper GraphTopology output to DecisionMapGraph format
 */
export function adaptGraphTopology(topology: GraphTopology | null): {
    nodes: ClaimNode[];
    edges: ClaimEdge[];
} {
    if (!topology || !topology.nodes.length) {
        return { nodes: [], edges: [] };
    }

    // Convert nodes
    const nodes: ClaimNode[] = topology.nodes.map(node => ({
        id: node.id,
        label: node.label,
        theme: node.theme,
        supporters: node.supporters.map(s => String(s)),
        support_count: node.support_count,
        // Preserve consensus strength for visual sizing
        consensusStrength: node.support_count / Math.max(...topology.nodes.map(n => n.support_count), 1),
    }));

    // Convert edges - preserve all 3 semantic types
    const edges: ClaimEdge[] = topology.edges.map(edge => ({
        source: edge.source,
        target: edge.target,
        reason: edge.reason,
        // Preserve semantic edge types for force-directed layout
        type: edge.type, // 'conflicts' | 'complements' | 'prerequisite'
    }));

    return { nodes, edges };
}
