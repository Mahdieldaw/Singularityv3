import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3-force';

export interface ClaimNode extends d3.SimulationNodeDatum {
    id: string;
    label: string;
    supporters: string[];
    support_count: number;
    consensusStrength: number; // 0-1, maps to node size
    theme?: string;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
    vx?: number;
    vy?: number;
}

export interface ClaimEdge extends d3.SimulationLinkDatum<ClaimNode> {
    source: string | ClaimNode;
    target: string | ClaimNode;
    type: 'conflicts' | 'complements' | 'prerequisite';
    reason?: string;
}

interface Props {
    nodes: ClaimNode[];
    edges: ClaimEdge[];
    onNodeClick?: (node: ClaimNode) => void;
    isStreaming?: boolean;
    width?: number;
    height?: number;
}

const DecisionMapGraph: React.FC<Props> = ({
    nodes: inputNodes,
    edges: inputEdges,
    onNodeClick,
    isStreaming = false,
    width = 400,
    height = 250,
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const simulationRef = useRef<d3.Simulation<ClaimNode, ClaimEdge> | null>(null);
    const [nodes, setNodes] = useState<ClaimNode[]>([]);
    const [edges, setEdges] = useState<ClaimEdge[]>([]);
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);

    // Initialize and update simulation when input changes
    useEffect(() => {
        if (!inputNodes.length) {
            setNodes([]);
            setEdges([]);
            return;
        }

        // Preserve existing positions for nodes that already exist
        const existingPositions = new Map(
            nodes.map(n => [n.id, { x: n.x, y: n.y }])
        );

        const simNodes: ClaimNode[] = inputNodes.map(n => {
            const existing = existingPositions.get(n.id);
            return {
                ...n,
                x: existing?.x ?? width / 2 + (Math.random() - 0.5) * 100,
                y: existing?.y ?? height / 2 + (Math.random() - 0.5) * 100,
            };
        });

        const simEdges: ClaimEdge[] = inputEdges.map(e => ({ ...e }));

        // Stop existing simulation
        if (simulationRef.current) {
            simulationRef.current.stop();
        }

        // Create new simulation with SEMANTIC forces
        const simulation = d3.forceSimulation<ClaimNode>(simNodes)
            .force('charge', d3.forceManyBody().strength(-300))
            .force('link', d3.forceLink<ClaimNode, ClaimEdge>(simEdges)
                .id(d => d.id)
                // SEMANTIC DISTANCES: encode relationship meaning spatially
                .distance(link => {
                    if (link.type === 'complements') return 80;   // Close together
                    if (link.type === 'conflicts') return 200;    // Far apart
                    if (link.type === 'prerequisite') return 120; // Medium distance
                    return 100;
                })
                // SEMANTIC STRENGTHS: encode relationship importance
                .strength(link => {
                    if (link.type === 'complements') return 0.8;   // Strong attraction
                    if (link.type === 'conflicts') return 0.3;     // Weak (let repulsion dominate)
                    if (link.type === 'prerequisite') return 0.6;  // Medium
                    return 0.5;
                }))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide<ClaimNode>().radius(d => 22 + d.consensusStrength * 20))
            .force('x', d3.forceX(width / 2).strength(0.03))
            .force('y', d3.forceY(height / 2).strength(0.03))
            // DIRECTIONAL FLOW: prerequisites flow left-to-right
            .force('prerequisite', () => {
                simEdges.forEach(link => {
                    if (link.type === 'prerequisite') {
                        const source = typeof link.source === 'object' ? link.source : simNodes.find(n => n.id === link.source);
                        const target = typeof link.target === 'object' ? link.target : simNodes.find(n => n.id === link.target);

                        if (source && target && source.x !== undefined && target.x !== undefined) {
                            // Source should be left of target
                            const dx = (target.x - source.x) - 60;
                            if (dx < 0) {
                                source.vx = (source.vx || 0) + dx * 0.01;
                                target.vx = (target.vx || 0) - dx * 0.01;
                            }
                        }
                    }
                });
            })
            .alphaDecay(isStreaming ? 0.01 : 0.02);

        simulation.on('tick', () => {
            setNodes([...simNodes]);
            setEdges([...simEdges]);
        });

        simulationRef.current = simulation;

        return () => {
            simulation.stop();
        };
    }, [inputNodes, inputEdges, width, height, isStreaming]);

    // Reheat simulation when streaming adds new nodes
    useEffect(() => {
        if (isStreaming && simulationRef.current) {
            simulationRef.current.alpha(0.3).restart();
        }
    }, [inputNodes.length, isStreaming]);

    // Get edge coordinates
    const getEdgeCoords = useCallback((edge: ClaimEdge) => {
        const source = typeof edge.source === 'object'
            ? edge.source as ClaimNode
            : nodes.find(n => n.id === edge.source);
        const target = typeof edge.target === 'object'
            ? edge.target as ClaimNode
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
        setNodes(prev => prev.map(n =>
            n.id === nodeId ? { ...n, fx: x, fy: y, x, y } : n
        ));
    }, []);

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
        if (!dragState.current.nodeId || !svgRef.current) return;

        const rect = svgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        handleDrag(dragState.current.nodeId, x, y);
    };

    const handleMouseUp = () => {
        if (dragState.current.nodeId) {
            handleDragEnd(dragState.current.nodeId);
            dragState.current.nodeId = null;
        }
    };

    if (!nodes.length) {
        return (
            <div
                style={{
                    width,
                    height,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.12) 0%, rgba(17,24,39,0.6) 100%)',
                    borderRadius: 12,
                    border: '1px solid rgba(139,92,246,0.25)',
                }}
            >
                <div style={{
                    color: 'rgba(167,139,250,0.7)',
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: 'center',
                }}>
                    {isStreaming ? (
                        <div>
                            <div style={{ fontSize: 28, marginBottom: 8 }}>✨</div>
                            <div>Mapping decision space...</div>
                        </div>
                    ) : 'No claims visualized'}
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
                background: 'radial-gradient(ellipse at center, rgba(30,27,75,1) 0%, rgba(17,24,39,1) 100%)',
                borderRadius: 12,
                cursor: dragState.current.nodeId ? 'grabbing' : 'default',
                border: '1px solid rgba(139,92,246,0.3)',
                boxShadow: '0 0 50px rgba(99,102,241,0.15)',
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <defs>
                {/* Animated grid pattern */}
                <pattern id="decisionGrid" width="50" height="50" patternUnits="userSpaceOnUse">
                    <circle cx="0" cy="0" r="1.2" fill="rgba(139,92,246,0.2)">
                        <animate attributeName="opacity" values="0.2;0.4;0.2" dur="5s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="25" cy="25" r="0.8" fill="rgba(167,139,250,0.15)">
                        <animate attributeName="opacity" values="0.15;0.3;0.15" dur="4s" repeatCount="indefinite" />
                    </circle>
                </pattern>

                {/* Enhanced glow filters */}
                <filter id="edgeGlowGreen" x="-150%" y="-150%" width="400%" height="400%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feFlood floodColor="#10b981" floodOpacity="0.8" />
                    <feComposite in2="blur" operator="in" result="glow" />
                    <feMerge>
                        <feMergeNode in="glow" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                <filter id="edgeGlowRed" x="-150%" y="-150%" width="400%" height="400%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feFlood floodColor="#ef4444" floodOpacity="0.8" />
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

                {/* Arrow marker for prerequisites */}
                <marker
                    id="arrowBlue"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
                </marker>

                <filter id="nodeGlow" x="-200%" y="-200%" width="500%" height="500%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            <rect width="100%" height="100%" fill="url(#decisionGrid)" opacity={0.5} />

            {/* Floating particles for streaming */}
            {isStreaming && (
                <g className="particles" opacity={0.4}>
                    {Array.from({ length: 15 }).map((_, i) => (
                        <circle
                            key={`particle-${i}`}
                            cx={Math.random() * width}
                            cy={Math.random() * height}
                            r="2.5"
                            fill={`hsl(${240 + Math.random() * 80}, 75%, 65%)`}
                        >
                            <animate
                                attributeName="opacity"
                                values="0;0.7;0"
                                dur={`${2 + Math.random() * 4}s`}
                                repeatCount="indefinite"
                            />
                            <animate
                                attributeName="cy"
                                values={`${Math.random() * height};${Math.random() * height}`}
                                dur={`${5 + Math.random() * 5}s`}
                                repeatCount="indefinite"
                            />
                        </circle>
                    ))}
                </g>
            )}

            {/* Edges with enhanced visuals */}
            <g className="edges">
                {edges.map((edge, i) => {
                    const coords = getEdgeCoords(edge);
                    if (!coords) return null;

                    // SEMANTIC COLORS: visual vocabulary for relationships
                    const baseColor =
                        edge.type === 'complements' ? '#10b981' :  // Green for synergy
                            edge.type === 'conflicts' ? '#ef4444' :     // Red for tension
                                '#3b82f6';                                   // Blue for flow
                    const isDashed = edge.type === 'conflicts';

                    return (
                        <g key={`edge-${i}`}>
                            {/* Wide glow layer */}
                            <line
                                x1={coords.x1}
                                y1={coords.y1}
                                x2={coords.x2}
                                y2={coords.y2}
                                stroke={baseColor}
                                strokeWidth={10}
                                strokeOpacity={0.15}
                            />
                            {/* Main line with filter */}
                            <line
                                x1={coords.x1}
                                y1={coords.y1}
                                x2={coords.x2}
                                y2={coords.y2}
                                stroke={baseColor}
                                strokeWidth={2.5}
                                strokeOpacity={0.85}
                                strokeDasharray={isDashed ? '8,5' : undefined}
                                markerEnd={edge.type === 'prerequisite' ? 'url(#arrowBlue)' : undefined}
                                filter={
                                    edge.type === 'complements' ? 'url(#edgeGlowGreen)' :
                                        edge.type === 'conflicts' ? 'url(#edgeGlowRed)' :
                                            'url(#edgeGlowBlue)'
                                }
                            >
                                {isStreaming && (
                                    <animate
                                        attributeName="stroke-opacity"
                                        values="0.6;1;0.6"
                                        dur="2.5s"
                                        repeatCount="indefinite"
                                    />
                                )}
                            </line>
                        </g>
                    );
                })
                }
            </g>

            {/* Nodes with premium styling */}
            <g className="nodes">
                {nodes.map(node => {
                    const x = node.x || 0;
                    const y = node.y || 0;
                    const baseRadius = 16;
                    const radius = baseRadius + node.consensusStrength * 24;
                    const isHovered = hoveredNode === node.id;

                    // Dynamic color: cyan → purple → magenta based on consensus
                    const hue = 180 + node.consensusStrength * 110;
                    const saturation = 75 + node.consensusStrength * 15;
                    const lightness = 55 + node.consensusStrength * 10;
                    const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

                    return (
                        <g
                            key={node.id}
                            transform={`translate(${x}, ${y})`}
                            style={{ cursor: 'grab' }}
                            onMouseDown={(e) => handleMouseDown(node.id, e)}
                            onMouseEnter={() => setHoveredNode(node.id)}
                            onMouseLeave={() => setHoveredNode(null)}
                            onClick={() => onNodeClick?.(node)}
                        >
                            {/* Streaming pulse waves */}
                            {isStreaming && (
                                <>
                                    <circle r={radius + 10} fill={color} opacity={0.12}>
                                        <animate attributeName="r" values={`${radius + 10};${radius + 25};${radius + 10}`} dur="3.5s" repeatCount="indefinite" />
                                        <animate attributeName="opacity" values="0.12;0.02;0.12" dur="3.5s" repeatCount="indefinite" />
                                    </circle>
                                    <circle r={radius + 6} fill={color} opacity={0.18}>
                                        <animate attributeName="r" values={`${radius + 6};${radius + 18};${radius + 6}`} dur="3s" repeatCount="indefinite" />
                                        <animate attributeName="opacity" values="0.18;0.04;0.18" dur="3s" repeatCount="indefinite" />
                                    </circle>
                                </>
                            )}

                            {/* Hover aura */}
                            {isHovered && (
                                <circle r={radius + 14} fill={color} opacity={0.28} filter="url(#nodeGlow)">
                                    <animate attributeName="opacity" values="0.28;0.45;0.28" dur="1.8s" repeatCount="indefinite" />
                                </circle>
                            )}

                            {/* Outer ring */}
                            <circle
                                r={radius + 3}
                                fill="none"
                                stroke={color}
                                strokeWidth={isHovered ? 2.5 : 1.5}
                                strokeOpacity={0.5}
                            />

                            {/* Radial gradient definition */}
                            <defs>
                                <radialGradient id={`nodeGrad-${node.id}`} cx="30%" cy="30%">
                                    <stop offset="0%" stopColor={`hsl(${hue + 15}, ${saturation}%, ${lightness + 25}%)`} />
                                    <stop offset="60%" stopColor={color} />
                                    <stop offset="100%" stopColor={`hsl(${hue - 15}, ${saturation + 10}%, ${lightness - 18}%)`} />
                                </radialGradient>
                            </defs>

                            {/* Main node sphere */}
                            <circle
                                r={radius}
                                fill={`url(#nodeGrad-${node.id})`}
                                stroke={color}
                                strokeWidth={isHovered ? 3.5 : 2.5}
                                filter="url(#nodeGlow)"
                            />

                            {/* Highlight sparkle */}
                            <circle
                                cx={-radius * 0.35}
                                cy={-radius * 0.35}
                                r={radius * 0.25}
                                fill="rgba(255,255,255,0.5)"
                                opacity={isHovered ? 0.7 : 0.4}
                            />

                            {/* Label with styled background */}
                            {(isHovered || node.consensusStrength > 0.7) && (
                                <g>
                                    <rect
                                        x={-55}
                                        y={radius + 10}
                                        width={110}
                                        height={20}
                                        fill="rgba(17,24,39,0.95)"
                                        stroke={color}
                                        strokeWidth={1.2}
                                        strokeOpacity={0.6}
                                        rx={5}
                                    />
                                    <text
                                        y={radius + 24}
                                        textAnchor="middle"
                                        fill="rgba(255,255,255,0.97)"
                                        fontSize={11}
                                        fontWeight={600}
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        {node.label.length > 16
                                            ? node.label.slice(0, 16) + '…'
                                            : node.label}
                                    </text>
                                </g>
                            )}

                            {/* Consensus percentage on hover */}
                            {isHovered && (
                                <text
                                    y={-radius - 10}
                                    textAnchor="middle"
                                    fill={color}
                                    fontSize={10}
                                    fontWeight="bold"
                                    style={{ pointerEvents: 'none' }}
                                >
                                    {Math.round(node.consensusStrength * 100)}%
                                </text>
                            )}
                        </g>
                    );
                })}
            </g>

            {/* Enhanced streaming indicator */}
            {
                isStreaming && (
                    <g transform={`translate(${width - 85}, 22)`}>
                        <rect
                            x={-8}
                            y={-10}
                            width={82}
                            height={24}
                            fill="rgba(17,24,39,0.85)"
                            stroke="rgba(16,185,129,0.5)"
                            strokeWidth={1.5}
                            rx={12}
                        />
                        <circle r="5.5" fill="#10b981" filter="url(#nodeGlow)">
                            <animate attributeName="opacity" values="1;0.3;1" dur="1.3s" repeatCount="indefinite" />
                        </circle>
                        <text x="14" y="5" fill="rgba(16,185,129,1)" fontSize={12} fontWeight={700}>
                            LIVE
                        </text>
                    </g>
                )
            }
        </svg >
    );
};

export default DecisionMapGraph;
