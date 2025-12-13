import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3-force';
import { PROVIDER_COLORS } from '../../constants';

export interface ClaimNode extends d3.SimulationNodeDatum {
    id: string;
    label: string;
    supporters: (string | number)[];
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
    citationSourceOrder?: Record<number, string>; // Maps citation number -> provider ID
    onNodeClick?: (node: ClaimNode) => void;
    width?: number;
    height?: number;
}

// Map supporter to provider ID using citationSourceOrder when available
function getProviderIdFromSupporter(s: string | number, citationSourceOrder?: Record<number, string>): string {
    // Handle 'S' as synthesizer identifier
    if (s === 'S' || s === 's') {
        return (citationSourceOrder as any)?.['S'] || 'synthesizer';
    }
    if ((typeof s === 'number' || !isNaN(Number(s))) && citationSourceOrder) {
        const num = Number(s);
        const providerId = citationSourceOrder[num];
        if (providerId) {
            return providerId;
        }
    }
    // If it's a string (direct provider ID), return as-is
    if (typeof s === 'string' && isNaN(Number(s))) {
        return s;
    }
    return 'default';
}

// Get blended color from multiple supporters
function getNodeColor(supporters: (string | number)[], citationSourceOrder?: Record<number, string>): string {
    if (!supporters || supporters.length === 0) {
        return '#8b5cf6'; // default violet
    }

    const colors = supporters.map(s => {
        const pid = getProviderIdFromSupporter(s, citationSourceOrder);
        return PROVIDER_COLORS[pid] || PROVIDER_COLORS['default'] || '#64748b';
    });

    if (colors.length === 1) {
        return colors[0];
    }

    // Average the colors for multiple supporters
    let r = 0, g = 0, b = 0;
    for (const hex of colors) {
        const parsed = hexToRgb(hex);
        r += parsed.r;
        g += parsed.g;
        b += parsed.b;
    }
    r = Math.round(r / colors.length);
    g = Math.round(g / colors.length);
    b = Math.round(b / colors.length);

    return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 139, g: 92, b: 246 }; // fallback to violet
}

// Node sizing by support_count: 1=48px diameter (24 radius), 2=64px (32 radius), 3+=80px (40 radius)
function getNodeRadius(supportCount: number): number {
    if (supportCount >= 3) return 40;
    if (supportCount === 2) return 32;
    return 24;
}

const DecisionMapGraph: React.FC<Props> = ({
    nodes: inputNodes,
    edges: inputEdges,
    citationSourceOrder,
    onNodeClick,
    width = 400,
    height = 250,
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const simulationRef = useRef<d3.Simulation<ClaimNode, ClaimEdge> | null>(null);
    const [nodes, setNodes] = useState<ClaimNode[]>([]);
    const [edges, setEdges] = useState<ClaimEdge[]>([]);
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [hoveredEdge, setHoveredEdge] = useState<{ edge: ClaimEdge; x: number; y: number } | null>(null);

    // Zoom/pan state
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0 });

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

        // Create new simulation with SEMANTIC forces - SPREAD OUT LAYOUT
        const aspectRatio = width / height;
        const isWideLayout = aspectRatio > 1.5;
        const nodePadding = 80; // Keep nodes away from edges (increased for larger spread)

        const simulation = d3.forceSimulation<ClaimNode>(simNodes)
            .force('charge', d3.forceManyBody().strength(-1000)) // Stronger repulsion to spread out
            .force('link', d3.forceLink<ClaimNode, ClaimEdge>(simEdges)
                .id(d => d.id)
                .distance(link => {
                    const baseDist = link.type === 'complements' ? 100 :
                        link.type === 'conflicts' ? 220 :
                            link.type === 'prerequisite' ? 150 : 120;
                    return isWideLayout ? baseDist * 1.6 : baseDist; // Increased distance
                })
                .strength(link => {
                    if (link.type === 'complements') return 0.5;
                    if (link.type === 'conflicts') return 0.15;
                    if (link.type === 'prerequisite') return 0.3;
                    return 0.3;
                }))
            .force('center', d3.forceCenter(width / 2, height / 2).strength(0.01)) // Extremely weak centering
            .force('collision', d3.forceCollide<ClaimNode>().radius(d => getNodeRadius(d.support_count) + 45)) // Large collision radius for labels
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

        simulation.on('tick', () => {
            setNodes([...simNodes]);
            setEdges([...simEdges]);
        });

        simulationRef.current = simulation;

        return () => {
            simulation.stop();
        };
    }, [inputNodes, inputEdges, width, height]);

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
                            edge.type === 'complements' ? '#10b981' :
                                edge.type === 'conflicts' ? '#ef4444' :
                                    '#3b82f6';
                        const isDashed = edge.type === 'conflicts';
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
                                    strokeDasharray={isDashed ? '8,5' : undefined}
                                    markerEnd={edge.type === 'prerequisite' ? 'url(#arrowBlue)' : undefined}
                                    filter={
                                        edge.type === 'complements' ? 'url(#edgeGlowGreen)' :
                                            edge.type === 'conflicts' ? 'url(#edgeGlowRed)' :
                                                'url(#edgeGlowBlue)'
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
                        const color = getNodeColor(node.supporters, citationSourceOrder);

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
                                        <stop offset="0%" stopColor={`${color}cc`} />
                                        <stop offset="60%" stopColor={color} />
                                        <stop offset="100%" stopColor={`${color}88`} />
                                    </radialGradient>
                                </defs>

                                {/* Main node sphere */}
                                <circle
                                    r={radius}
                                    fill={`url(#nodeGrad-${node.id})`}
                                    stroke={color}
                                    strokeWidth={isHovered ? 3 : 2}
                                    filter="url(#nodeGlow)"
                                />

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
                        const color = getNodeColor(node.supporters, citationSourceOrder);

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
                                        border: `1px solid ${hoveredEdge.edge.type === 'complements' ? '#10b981' : hoveredEdge.edge.type === 'conflicts' ? '#ef4444' : '#3b82f6'}`,
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
                <rect x={-10} y={-10} width={135} height={80} fill="rgba(0,0,0,0.85)" rx={8} stroke="rgba(139,92,246,0.3)" strokeWidth={1} />
                <text x={0} y={8} fill="rgba(255,255,255,0.8)" fontSize={10} fontWeight={600}>Legend</text>

                <line x1={0} y1={24} x2={30} y2={24} stroke="#10b981" strokeWidth={2.5} />
                <text x={38} y={28} fill="rgba(255,255,255,0.7)" fontSize={9}>Complements</text>

                <line x1={0} y1={42} x2={30} y2={42} stroke="#ef4444" strokeWidth={2.5} strokeDasharray="6,4" />
                <text x={38} y={46} fill="rgba(255,255,255,0.7)" fontSize={9}>Conflicts</text>

                <line x1={0} y1={60} x2={30} y2={60} stroke="#3b82f6" strokeWidth={2.5} markerEnd="url(#arrowBlue)" />
                <text x={38} y={64} fill="rgba(255,255,255,0.7)" fontSize={9}>Prerequisite</text>
            </g>
        </svg>
    );
};

export default DecisionMapGraph;
