import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3-force';
import { Claim, Edge, ProblemStructure } from '../../shared/contract';

const DEBUG_DECISION_MAP_GRAPH = false;
const decisionMapGraphDbg = (...args: any[]) => {
    if (DEBUG_DECISION_MAP_GRAPH) console.debug('[DecisionMapGraph]', ...args);
};

// Internal node type for d3 simulation, extending V3 Claim
export interface GraphNode extends d3.SimulationNodeDatum {
    id: string; // V3 claim id
    label: string;
    text: string;
    supporters: (string | number)[]; // V3 numbers or legacy strings
    support_count: number;
    type: Claim['type'];
    role: Claim['role'];
    // D3 state
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
    vx?: number;
    vy?: number;
}

export interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
    source: string | GraphNode;
    target: string | GraphNode;
    type: string; // V3 edge type
    reason?: string;
}

interface Props {
    claims: Claim[];
    edges: Edge[];
    problemStructure?: ProblemStructure;
    citationSourceOrder?: Record<number, string>;
    onNodeClick?: (node: GraphNode) => void;
    selectedClaimIds?: string[];
    width?: number;
    height?: number;
}

function getRoleColor(role: Claim['role']): string {
    switch (role) {
        case 'anchor':
            return '#3b82f6';
        case 'branch':
            return '#10b981';
        case 'challenger':
            return '#f59e0b';
        case 'supplement':
            return '#6b7280';
        default:
            return '#8b5cf6';
    }
}

// Node sizing by support_count: 1=48px diameter (24 radius), 2=64px (32 radius), 3+=80px (40 radius)
function getNodeRadius(supportCount: number): number {
    const base = 20;
    const scale = 8;
    return base + Math.max(1, supportCount) * scale;
}

function computePrereqDepths(nodeIds: string[], edges: Edge[]): Map<string, number> {
    const incoming = new Map<string, string[]>();
    for (const id of nodeIds) incoming.set(id, []);
    for (const e of edges) {
        if (e.type !== 'prerequisite') continue;
        if (!incoming.has(e.to)) incoming.set(e.to, []);
        incoming.get(e.to)!.push(e.from);
        if (!incoming.has(e.from)) incoming.set(e.from, []);
    }

    const visiting = new Set<string>();
    const memo = new Map<string, number>();
    const dfs = (id: string): number => {
        if (memo.has(id)) return memo.get(id)!;
        if (visiting.has(id)) return 0;
        visiting.add(id);
        const prereqs = incoming.get(id) || [];
        let depth = 0;
        for (const p of prereqs) {
            depth = Math.max(depth, dfs(p) + 1);
        }
        visiting.delete(id);
        memo.set(id, depth);
        return depth;
    };

    for (const id of nodeIds) dfs(id);
    return memo;
}

function pickKeystoneId(nodes: GraphNode[], edges: Edge[]): string | null {
    const out = new Map<string, number>();
    for (const e of edges) {
        if (e.type !== 'supports' && e.type !== 'prerequisite') continue;
        out.set(e.from, (out.get(e.from) || 0) + 1);
    }
    let best: string | null = null;
    let bestCount = -1;
    for (const n of nodes) {
        const c = out.get(n.id) || 0;
        if (c > bestCount) {
            bestCount = c;
            best = n.id;
        }
    }
    return bestCount > 0 ? best : null;
}

const DecisionMapGraph: React.FC<Props> = ({
    claims: inputClaims,
    edges: inputEdges,
    problemStructure,
    citationSourceOrder: _citationSourceOrder,
    onNodeClick,
    selectedClaimIds,
    width = 400,
    height = 250,
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const simulationRef = useRef<d3.Simulation<GraphNode, GraphEdge> | null>(null);
    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [edges, setEdges] = useState<GraphEdge[]>([]);
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [hoveredEdge, setHoveredEdge] = useState<{ edge: GraphEdge; x: number; y: number } | null>(null);

    // Zoom/pan state
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0 });

    // ...

    useEffect(() => {
        if (!inputClaims.length) {
            setNodes([]);
            setEdges([]);
            return;
        }

        const existingPositions = new Map(
            nodes.map(n => [n.id, { x: n.x, y: n.y }])
        );

        const nodeIds = inputClaims.map((c) => c.id);
        const hasPrereqs = inputEdges.some((e) => e.type === 'prerequisite');
        const targets = new Map<string, { x: number; y: number }>();

        const padding = 60;
        const usableW = Math.max(1, width - padding * 2);
        const usableH = Math.max(1, height - padding * 2);

        if (problemStructure?.primaryPattern === 'linear' && hasPrereqs) {
            const depths = computePrereqDepths(nodeIds, inputEdges);
            const maxDepth = Math.max(0, ...Array.from(depths.values()));
            const levels: Record<number, string[]> = {};
            nodeIds.forEach((id) => {
                const d = depths.get(id) || 0;
                if (!levels[d]) levels[d] = [];
                levels[d].push(id);
            });

            for (let d = 0; d <= maxDepth; d++) {
                const levelIds = levels[d] || [];
                const y = padding + (maxDepth === 0 ? usableH / 2 : (d / maxDepth) * usableH);
                const count = levelIds.length;
                levelIds.forEach((id, idx) => {
                    const x = padding + (count === 1 ? usableW / 2 : (idx / (count - 1)) * usableW);
                    targets.set(id, { x, y });
                });
            }
        } else if (problemStructure?.primaryPattern === 'keystone') {
            const provisionalNodes: GraphNode[] = inputClaims.map((c) => ({
                id: c.id,
                label: c.label,
                text: c.text,
                supporters: c.supporters,
                support_count: c.support_count || c.supporters.length || 1,
                type: c.type,
                role: c.role,
            }));
            const keystoneId = pickKeystoneId(provisionalNodes, inputEdges);
            if (keystoneId) {
                targets.set(keystoneId, { x: width / 2, y: height / 2 });
                const neighbors = inputEdges
                    .filter((e) => e.from === keystoneId || e.to === keystoneId)
                    .map((e) => (e.from === keystoneId ? e.to : e.from))
                    .filter((id) => id !== keystoneId);
                const uniq = Array.from(new Set(neighbors));
                const radius = Math.min(usableW, usableH) * 0.28;
                uniq.forEach((id, idx) => {
                    const a = (idx / Math.max(uniq.length, 1)) * Math.PI * 2;
                    targets.set(id, {
                        x: width / 2 + Math.cos(a) * radius,
                        y: height / 2 + Math.sin(a) * radius,
                    });
                });
            }
        }

        // Map V3 Claims to GraphNodes
        const simNodes: GraphNode[] = inputClaims.map(c => {
            const existing = existingPositions.get(c.id);
            const supporters = Array.isArray(c.supporters) ? c.supporters : [];
            const supportCount = (typeof c.support_count === 'number' && c.support_count > 0) ? c.support_count : (supporters.length || 1);
            const target = targets.get(c.id);
            return {
                id: c.id,
                label: c.label,
                text: c.text,
                supporters,
                support_count: supportCount,
                type: c.type,
                role: c.role,
                x: existing?.x ?? target?.x ?? width / 2 + (Math.random() - 0.5) * 100,
                y: existing?.y ?? target?.y ?? height / 2 + (Math.random() - 0.5) * 100,
            };
        });

        // Map V3 Edges to GraphEdges
        const simEdges: GraphEdge[] = inputEdges.map(e => ({
            source: e.from,
            target: e.to,
            type: e.type,
            reason: e.type // Use type as reason for now or logic from meta
        }));

        decisionMapGraphDbg("init", {
            claims: inputClaims.length,
            edges: inputEdges.length,
            pattern: problemStructure?.primaryPattern || null,
            confidence: problemStructure?.confidence ?? null,
            targets: targets.size,
        });

        // Stop existing simulation
        if (simulationRef.current) {
            simulationRef.current.stop();
        }

        // Create new simulation with SEMANTIC forces - SPREAD OUT LAYOUT
        const aspectRatio = width / height;
        const isWideLayout = aspectRatio > 1.5;
        const nodePadding = 80; // Keep nodes away from edges (increased for larger spread)

        const isLinear = problemStructure?.primaryPattern === 'linear' && targets.size > 0;
        const isKeystone = problemStructure?.primaryPattern === 'keystone' && targets.size > 0;

        const simulation = d3.forceSimulation<GraphNode>(simNodes)
            .force('charge', d3.forceManyBody().strength(isLinear ? -700 : -1000))
            .force('link', d3.forceLink<GraphNode, GraphEdge>(simEdges)
                .id(d => d.id)
                .distance(link => {
                    const baseDist = link.type === 'supports' ? 120 :
                        link.type === 'conflicts' ? 220 :
                            link.type === 'tradeoff' ? 180 :
                                link.type === 'prerequisite' ? 150 : 120;
                    return isWideLayout ? baseDist * 1.6 : baseDist; // Increased distance
                })
                .strength(link => {
                    if (link.type === 'supports') return 0.45;
                    if (link.type === 'conflicts') return 0.15;
                    if (link.type === 'tradeoff') return 0.22;
                    if (link.type === 'prerequisite') return 0.3;
                    return 0.28;
                }))
            .force('center', d3.forceCenter(width / 2, height / 2).strength(0.01)) // Extremely weak centering
            .force('collision', d3.forceCollide<GraphNode>().radius(d => getNodeRadius(d.support_count) + 45)) // Large collision radius for labels
            // No x-centering force - let nodes spread horizontally
            .force('y', d3.forceY(height / 2).strength(0.02)) // Very weak vertical centering
            // Soft boundary force to keep nodes inside canvas
            .force('boundary', () => {
                simNodes.forEach(node => {
                    const r = getNodeRadius(node.support_count);
                    if (node.x !== undefined) {
                        if (node.x < nodePadding + r) {
                            node.vx = (node.vx || 0) + 1.5;
                        } else if (node.x > width - nodePadding - r) {
                            node.vx = (node.vx || 0) - 1.5;
                        }
                    }
                    if (node.y !== undefined) {
                        if (node.y < nodePadding + r) {
                            node.vy = (node.vy || 0) + 1.5;
                        } else if (node.y > height - nodePadding - r) {
                            node.vy = (node.vy || 0) - 1.5;
                        }
                    }
                });
            })
            .force('prerequisite', () => {
                simEdges.forEach(link => {
                    if (link.type === 'prerequisite') {
                        const source = typeof link.source === 'object' ? link.source : simNodes.find(n => n.id === link.source);
                        const target = typeof link.target === 'object' ? link.target : simNodes.find(n => n.id === link.target);

                        if (source && target && source.x !== undefined && target.x !== undefined) {
                            const dx = (target.x - source.x) - 60;
                            if (dx < 0) {
                                source.vx = (source.vx || 0) + dx * 0.01;
                                target.vx = (target.vx || 0) - dx * 0.01;
                            }
                        }
                    }
                });
            })
            .alphaDecay(0.02);

        if (isLinear || isKeystone) {
            simulation.force('xTarget', d3.forceX<GraphNode>(d => (targets.get(d.id)?.x ?? width / 2)).strength(isLinear ? 0.18 : 0.12));
            simulation.force('yTarget', d3.forceY<GraphNode>(d => (targets.get(d.id)?.y ?? height / 2)).strength(isLinear ? 0.22 : 0.12));
        } else {
            simulation.force('xTarget', null);
            simulation.force('yTarget', null);
        }

        simulation.on('tick', () => {
            setNodes([...simNodes]);
            setEdges([...simEdges]);
        });

        simulationRef.current = simulation;

        return () => {
            simulation.stop();
        };
    }, [inputClaims, inputEdges, width, height]);

    // Get edge coordinates
    const getEdgeCoords = useCallback((edge: GraphEdge) => {
        const source = typeof edge.source === 'object'
            ? edge.source as GraphNode
            : nodes.find(n => n.id === edge.source);
        const target = typeof edge.target === 'object'
            ? edge.target as GraphNode
            : nodes.find(n => n.id === edge.target);

        if (!source?.x || !target?.x) return null;

        return { x1: source.x, y1: source.y!, x2: target.x, y2: target.y! };
    }, [nodes]);

    // Drag handlers
    const handleDragStart = useCallback((nodeId: string) => {
        if (simulationRef.current) {
            simulationRef.current.alphaTarget(0.3).restart();
        }
        setNodes(prev => prev.map(n =>
            n.id === nodeId ? { ...n, fx: n.x, fy: n.y } : n
        ));
    }, []);

    const handleDrag = useCallback((nodeId: string, x: number, y: number) => {
        // Account for transform when dragging
        const adjustedX = (x - transform.x) / transform.scale;
        const adjustedY = (y - transform.y) / transform.scale;
        setNodes(prev => prev.map(n =>
            n.id === nodeId ? { ...n, fx: adjustedX, fy: adjustedY, x: adjustedX, y: adjustedY } : n
        ));
    }, [transform]);

    const handleDragEnd = useCallback((nodeId: string) => {
        if (simulationRef.current) {
            simulationRef.current.alphaTarget(0);
        }
        setNodes(prev => prev.map(n =>
            n.id === nodeId ? { ...n, fx: null, fy: null } : n
        ));
    }, []);

    // Mouse handlers for SVG
    const dragState = useRef<{ nodeId: string | null; startX: number; startY: number }>({
        nodeId: null, startX: 0, startY: 0
    });

    const handleMouseDown = (nodeId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const svg = svgRef.current;
        if (!svg) return;

        const rect = svg.getBoundingClientRect();
        dragState.current = {
            nodeId,
            startX: e.clientX - rect.left,
            startY: e.clientY - rect.top,
        };
        handleDragStart(nodeId);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!svgRef.current) return;

        // Handle node dragging
        if (dragState.current.nodeId) {
            const rect = svgRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            handleDrag(dragState.current.nodeId, x, y);
            return;
        }

        // Handle panning
        if (isPanningRef.current) {
            const dx = e.clientX - panStartRef.current.x;
            const dy = e.clientY - panStartRef.current.y;
            setTransform(prev => ({
                ...prev,
                x: prev.x + dx,
                y: prev.y + dy
            }));
            panStartRef.current = { x: e.clientX, y: e.clientY };
        }
    };

    const handleMouseUp = () => {
        if (dragState.current.nodeId) {
            handleDragEnd(dragState.current.nodeId);
            dragState.current.nodeId = null;
        }
        isPanningRef.current = false;
    };

    // Pan on background drag
    const handleBackgroundMouseDown = (e: React.MouseEvent) => {
        if ((e.target as Element).classList.contains('graph-background')) {
            isPanningRef.current = true;
            panStartRef.current = { x: e.clientX, y: e.clientY };
        }
    };

    // Zoom with scroll wheel
    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation(); // Good practice to stop bubbling

        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.5, Math.min(2, transform.scale * delta));

        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const newX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
            const newY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);

            setTransform({ x: newX, y: newY, scale: newScale });
        }
    }, [transform]);

    // 2. Add this useEffect to attach the non-passive listener
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        // { passive: false } is the key fix here
        svg.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            svg.removeEventListener('wheel', handleWheel);
        };
    }, [handleWheel]);

    if (!nodes.length) {
        return (
            <div
                style={{
                    width,
                    height,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    borderRadius: 12,
                }}
            >
                <div style={{
                    color: 'rgba(167,139,250,0.7)',
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: 'center',
                }}>
                    No claims visualized
                </div>
            </div>
        );
    }

    return (
        <svg
            ref={svgRef}
            width={width}
            height={height}
            style={{
                background: 'transparent',
                borderRadius: 12,
                cursor: isPanningRef.current ? 'grabbing' : (dragState.current.nodeId ? 'grabbing' : 'grab'),
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onMouseDown={handleBackgroundMouseDown}
        >
            <defs>
                {/* Enhanced glow filters */}
                <filter id="edgeGlowGreen" x="-150%" y="-150%" width="400%" height="400%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feFlood floodColor="#10b981" floodOpacity="0.6" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                        <feMergeNode in="glow" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                <filter id="edgeGlowRed" x="-150%" y="-150%" width="400%" height="400%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feFlood floodColor="#ef4444" floodOpacity="0.5" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                        <feMergeNode in="glow" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                <filter id="edgeGlowBlue" x="-150%" y="-150%" width="400%" height="400%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feFlood floodColor="#3b82f6" floodOpacity="0.8" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                        <feMergeNode in="glow" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                <filter id="edgeGlowOrange" x="-150%" y="-150%" width="400%" height="400%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feFlood floodColor="#f97316" floodOpacity="0.75" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                        <feMergeNode in="glow" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                <marker id="arrowGray" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af" />
                </marker>
                <marker id="arrowRed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                </marker>
                <marker id="arrowOrange" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#f97316" />
                </marker>
                <marker id="arrowBlack" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#111827" />
                </marker>

                <filter id="nodeGlow" x="-200%" y="-200%" width="500%" height="500%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {/* Background for panning */}
            <rect
                className="graph-background"
                width="100%"
                height="100%"
                fill="transparent"
            />

            {/* Transform group for zoom/pan */}
            <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
                {/* Edges with enhanced visuals */}
                <g className="edges">
                    {edges.map((edge, i) => {
                        const coords = getEdgeCoords(edge);
                        if (!coords) return null;

                        const baseColor =
                            edge.type === 'supports' ? '#9ca3af' :
                                edge.type === 'conflicts' ? '#ef4444' :
                                    edge.type === 'tradeoff' ? '#f97316' :
                                        edge.type === 'prerequisite' ? '#111827' :
                                            '#9ca3af';
                        const dash =
                            edge.type === 'conflicts' ? '6,4' :
                                edge.type === 'tradeoff' ? '2,2' :
                                    undefined;
                        const markerEnd =
                            edge.type === 'supports' ? 'url(#arrowGray)' :
                                edge.type === 'conflicts' ? 'url(#arrowRed)' :
                                    edge.type === 'tradeoff' ? 'url(#arrowOrange)' :
                                        edge.type === 'prerequisite' ? 'url(#arrowBlack)' :
                                            undefined;
                        const markerStart =
                            edge.type === 'conflicts' ? 'url(#arrowRed)' :
                                edge.type === 'tradeoff' ? 'url(#arrowOrange)' :
                                    undefined;
                        const midX = (coords.x1 + coords.x2) / 2;
                        const midY = (coords.y1 + coords.y2) / 2;

                        return (
                            <g key={`edge-${i}`}>
                                {/* Wide glow layer */}
                                <line
                                    x1={coords.x1}
                                    y1={coords.y1}
                                    x2={coords.x2}
                                    y2={coords.y2}
                                    stroke={baseColor}
                                    strokeWidth={12}
                                    strokeOpacity={0.12}
                                />
                                {/* Main line with filter */}
                                <line
                                    x1={coords.x1}
                                    y1={coords.y1}
                                    x2={coords.x2}
                                    y2={coords.y2}
                                    stroke={baseColor}
                                    strokeWidth={2.5}
                                    strokeDasharray={dash}
                                    markerStart={markerStart}
                                    markerEnd={markerEnd}
                                    filter={
                                        edge.type === 'conflicts' ? 'url(#edgeGlowRed)' :
                                            edge.type === 'tradeoff' ? 'url(#edgeGlowOrange)' :
                                                edge.type === 'prerequisite' ? 'url(#edgeGlowBlue)' :
                                                    undefined
                                    }
                                    style={{
                                        animation: edge.type === 'conflicts' ? 'conflictPulse 2s ease-in-out infinite' : undefined
                                    }}
                                >
                                    {edge.type === 'conflicts' && (
                                        <animate
                                            attributeName="stroke-opacity"
                                            values="0.4;0.8;0.4"
                                            dur="2s"
                                            repeatCount="indefinite"
                                        />
                                    )}
                                </line>
                                {/* Invisible wider hit area for hover */}
                                <line
                                    x1={coords.x1}
                                    y1={coords.y1}
                                    x2={coords.x2}
                                    y2={coords.y2}
                                    stroke="transparent"
                                    strokeWidth={20}
                                    style={{ cursor: 'pointer' }}
                                    onMouseEnter={() => setHoveredEdge({ edge, x: midX, y: midY })}
                                    onMouseLeave={() => setHoveredEdge(null)}
                                />
                            </g>
                        );
                    })}
                </g>

                {/* Nodes with premium styling */}
                <g className="nodes">
                    {nodes.map(node => {
                        const x = node.x || 0;
                        const y = node.y || 0;
                        const radius = getNodeRadius(node.support_count);
                        const isHovered = hoveredNode === node.id;
                        const color = getRoleColor(node.role);
                        const isSelected = Array.isArray(selectedClaimIds) && selectedClaimIds.includes(node.id);

                        return (
                            <g
                                key={node.id}
                                transform={`translate(${x}, ${y})`}
                                style={{ cursor: 'pointer' }}
                                onMouseDown={(e) => handleMouseDown(node.id, e)}
                                onMouseEnter={() => setHoveredNode(node.id)}
                                onMouseLeave={() => setHoveredNode(null)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onNodeClick?.(node);
                                }}
                            >
                                {/* Hover aura */}
                                {isHovered && (
                                    <circle r={radius + 16} fill={color} opacity={0.25} filter="url(#nodeGlow)">
                                        <animate attributeName="opacity" values="0.25;0.4;0.25" dur="1.5s" repeatCount="indefinite" />
                                    </circle>
                                )}

                                {isSelected && (
                                    <circle r={radius + 10} fill="none" stroke={color} strokeWidth={3} strokeOpacity={0.9} />
                                )}

                                {/* Outer ring */}
                                {node.role !== 'challenger' ? (
                                    <circle
                                        r={radius + 3}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth={isHovered ? 2.5 : 1.5}
                                        strokeOpacity={0.5}
                                    />
                                ) : (
                                    <polygon
                                        points={`${0},${-(radius + 3)} ${radius + 3},0 0,${radius + 3} ${-(radius + 3)},0`}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth={isHovered ? 2.5 : 1.5}
                                        strokeOpacity={0.5}
                                    />
                                )}

                                {/* Radial gradient definition */}
                                <defs>
                                    <radialGradient id={`nodeGrad-${node.id}`} cx="30%" cy="30%">
                                        <stop offset="0%" stopColor={`${color}cc`} />
                                        <stop offset="60%" stopColor={color} />
                                        <stop offset="100%" stopColor={`${color}88`} />
                                    </radialGradient>
                                </defs>

                                {/* Main node */}
                                {node.role !== 'challenger' ? (
                                    <circle
                                        r={radius}
                                        fill={`url(#nodeGrad-${node.id})`}
                                        stroke={color}
                                        strokeWidth={isHovered ? 3 : 2}
                                        filter="url(#nodeGlow)"
                                    />
                                ) : (
                                    <polygon
                                        points={`${0},${-radius} ${radius},0 0,${radius} ${-radius},0`}
                                        fill={`url(#nodeGrad-${node.id})`}
                                        stroke={color}
                                        strokeWidth={isHovered ? 3 : 2}
                                        filter="url(#nodeGlow)"
                                    />
                                )}

                                {/* Highlight sparkle */}
                                <circle
                                    cx={-radius * 0.35}
                                    cy={-radius * 0.35}
                                    r={radius * 0.2}
                                    fill="rgba(255,255,255,0.5)"
                                    opacity={isHovered ? 0.7 : 0.4}
                                />



                                {/* Support count badge */}
                                {node.support_count > 1 && (
                                    <g>
                                        <circle
                                            cx={radius * 0.6}
                                            cy={-radius * 0.6}
                                            r={10}
                                            fill="rgba(0,0,0,0.8)"
                                            stroke={color}
                                            strokeWidth={1.5}
                                        />
                                        <text
                                            x={radius * 0.6}
                                            y={-radius * 0.6 + 4}
                                            textAnchor="middle"
                                            fill="white"
                                            fontSize={10}
                                            fontWeight="bold"
                                            style={{ pointerEvents: 'none' }}
                                        >
                                            {node.support_count}
                                        </text>
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </g>

                {/* Labels - rendered after nodes to ensure z-index priority */}
                <g className="labels" style={{ pointerEvents: 'none' }}>
                    {nodes.map(node => {
                        const x = node.x || 0;
                        const y = node.y || 0;
                        const radius = getNodeRadius(node.support_count);
                        const isHovered = hoveredNode === node.id;

                        // Show for larger nodes always, others on hover
                        if (!isHovered && node.support_count < 2) return null;

                        return (
                            <g
                                key={`label-${node.id}`}
                                transform={`translate(${x}, ${y})`}
                            >
                                <foreignObject
                                    x={-90}
                                    y={radius + 8}
                                    width={180}
                                    height={50}
                                    style={{ overflow: 'visible' }}
                                >
                                    <div
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: 'rgba(255,255,255,0.95)',
                                            textAlign: 'center',
                                            wordWrap: 'break-word',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 3,
                                            WebkitBoxOrient: 'vertical',
                                            lineHeight: 1.3,
                                            textShadow: '0 2px 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,1)'
                                        }}
                                    >
                                        {node.label}
                                    </div>
                                </foreignObject>
                            </g>
                        );
                    })}
                </g>

                {/* Edge reason tooltip - rendered last so it's on top */}
                {hoveredEdge && hoveredEdge.edge.reason && (
                    <g transform={`translate(${hoveredEdge.x}, ${hoveredEdge.y})`} style={{ pointerEvents: 'none' }}>
                        <foreignObject
                            x={-150}
                            y={-40}
                            width={300}
                            height={100}
                            style={{ overflow: 'visible' }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', height: '100%', paddingBottom: 12 }}>
                                <div
                                    style={{
                                        background: 'rgba(0,0,0,0.95)',
                                        border: `1px solid ${hoveredEdge.edge.type === 'supports' ? '#9ca3af' : hoveredEdge.edge.type === 'conflicts' ? '#ef4444' : hoveredEdge.edge.type === 'tradeoff' ? '#f97316' : '#111827'}`,
                                        borderRadius: 6,
                                        padding: '6px 10px',
                                        fontSize: 11,
                                        fontWeight: 500,
                                        color: 'rgba(255,255,255,0.95)',
                                        textAlign: 'center',
                                        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                                        maxWidth: '100%'
                                    }}
                                >
                                    {hoveredEdge.edge.reason}
                                </div>
                            </div>
                        </foreignObject>
                    </g>
                )}
            </g>

            {/* Legend - fixed position outside transform */}
            <g transform={`translate(${width - 140}, 20)`}>
                <rect x={-10} y={-10} width={135} height={98} fill="rgba(0,0,0,0.85)" rx={8} stroke="rgba(139,92,246,0.3)" strokeWidth={1} />
                <text x={0} y={8} fill="rgba(255,255,255,0.8)" fontSize={10} fontWeight={600}>Legend</text>

                <line x1={0} y1={24} x2={30} y2={24} stroke="#9ca3af" strokeWidth={2.5} markerEnd="url(#arrowGray)" />
                <text x={38} y={28} fill="rgba(255,255,255,0.7)" fontSize={9}>Supports</text>

                <line x1={0} y1={42} x2={30} y2={42} stroke="#f97316" strokeWidth={2.5} strokeDasharray="2,2" markerStart="url(#arrowOrange)" markerEnd="url(#arrowOrange)" />
                <text x={38} y={46} fill="rgba(255,255,255,0.7)" fontSize={9}>Tradeoff</text>

                <line x1={0} y1={60} x2={30} y2={60} stroke="#ef4444" strokeWidth={2.5} strokeDasharray="6,4" markerStart="url(#arrowRed)" markerEnd="url(#arrowRed)" />
                <text x={38} y={64} fill="rgba(255,255,255,0.7)" fontSize={9}>Conflicts</text>

                <line x1={0} y1={78} x2={30} y2={78} stroke="#111827" strokeWidth={2.5} markerEnd="url(#arrowBlack)" />
                <text x={38} y={82} fill="rgba(255,255,255,0.7)" fontSize={9}>Prerequisite</text>
            </g>
        </svg>
    );
};

export default DecisionMapGraph;
