// ui/components/experimental/forceLayout.ts

import * as d3 from 'd3-force';

interface Node {
    id: string;
    x?: number;
    y?: number;
    [key: string]: any;
}

interface Edge {
    source: string | Node;
    target: string | Node;
    [key: string]: any;
}

/**
 * Apply force-directed layout algorithm to position nodes.
 * Uses d3-force simulation with charge repulsion, link constraints,
 * center gravity, and collision detection.
 * 
 * @param nodes - Array of node objects
 * @param edges - Array of edge objects
 * @param width - Canvas width for centering
 * @param height - Canvas height for centering
 * @returns Object with positioned nodes and edges
 */
export function applyForceLayout(
    nodes: Node[],
    edges: Edge[],
    width = 800,
    height = 600
): { nodes: Node[]; edges: Edge[] } {
    // Create mutable copies
    const simulationNodes = nodes.map(n => ({ ...n }));
    const simulationEdges = edges.map(e => ({ ...e }));

    // Create force simulation
    const simulation = d3.forceSimulation(simulationNodes as any)
        .force('charge', d3.forceManyBody().strength(-300))
        .force('link', d3.forceLink(simulationEdges as any)
            .id((d: any) => d.id)
            .distance(120))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(80));

    // Run simulation to completion (not animated, just for initial positions)
    simulation.stop();
    for (let i = 0; i < 300; i++) {
        simulation.tick();
    }

    // Transfer computed positions back to original format
    const positionedNodes = simulationNodes.map(n => ({
        ...n,
        x: n.x || 0,
        y: n.y || 0,
    }));

    return {
        nodes: positionedNodes,
        edges: simulationEdges,
    };
}
