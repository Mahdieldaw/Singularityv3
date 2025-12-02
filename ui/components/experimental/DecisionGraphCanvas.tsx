// ui/components/experimental/DecisionGraphCanvas.tsx

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import ReactFlow, { Background, Controls, Edge, Node, useReactFlow } from 'reactflow';
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide, forceX, forceY, SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
import OptionNode from './OptionNode';
import { GraphTopology } from '../../types';
import 'reactflow/dist/style.css';

interface DecisionGraphCanvasProps {
    topology: GraphTopology;
}

// Internal simulation node type that d3-force will mutate
interface SimNode extends SimulationNodeDatum {
    id: string;
    label: string;
    theme: string;
    supporters: number[];
    supportCount: number;
}

// Internal simulation link type
interface SimLink extends SimulationLinkDatum<SimNode> {
    type: string;
    reason: string;
}

/**
 * React Flow canvas with animated force-directed layout.
 * Uses d3-force for physics simulation with proper React state management.
 * Nodes organize themselves with smooth animation, clustering by theme.
 */
const DecisionGraphCanvas: React.FC<DecisionGraphCanvasProps> = ({ topology }) => {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [isSettling, setIsSettling] = useState(true);
    const simulationRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);
    const simNodesRef = useRef<SimNode[]>([]);
    const animFrameRef = useRef<number>(0);
    const { fitView } = useReactFlow();

    // Custom node types
    const nodeTypes = useMemo(() => ({ optionNode: OptionNode }), []);

    // Theme-based clustering - assign initial positions based on theme
    const getThemePosition = useCallback((theme: string, index: number): { x: number; y: number } => {
        const themes: Record<string, { cx: number; cy: number }> = {
            'Architecture': { cx: -150, cy: -100 },
            'Infrastructure': { cx: 150, cy: -100 },
            'Database': { cx: 0, cy: 150 },
        };
        const base = themes[theme] || { cx: 0, cy: 0 };
        // Add jitter within theme cluster
        const jitter = 80;
        return {
            x: base.cx + (Math.random() - 0.5) * jitter,
            y: base.cy + (Math.random() - 0.5) * jitter,
        };
    }, []);

    useEffect(() => {
        // Clean up previous simulation
        if (simulationRef.current) {
            simulationRef.current.stop();
        }
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
        }

        // Create simulation nodes with theme-clustered initial positions
        const simNodes: SimNode[] = topology.nodes.map((n, i) => {
            const pos = getThemePosition(n.theme, i);
            return {
                id: n.id,
                label: n.label,
                theme: n.theme,
                supporters: n.supporters,
                supportCount: n.support_count,
                x: pos.x,
                y: pos.y,
                vx: 0,
                vy: 0,
            };
        });
        simNodesRef.current = simNodes;

        // Create simulation links (d3 will resolve source/target to nodes)
        const simLinks: SimLink[] = topology.edges.map(e => ({
            source: e.source,
            target: e.target,
            type: e.type,
            reason: e.reason,
        }));

        // Create edges for React Flow (visual representation)
        const flowEdges: Edge[] = topology.edges.map((e, i) => {
            let strokeColor = '#4b5563';
            let strokeWidth = 2;
            let animated = false;
            
            if (e.type === 'conflicts') {
                strokeColor = '#ef4444';
                strokeWidth = 2.5;
            } else if (e.type === 'complements') {
                strokeColor = '#10b981';
                strokeWidth = 2;
                animated = true;
            } else if (e.type === 'prerequisite') {
                strokeColor = '#3b82f6';
                strokeWidth = 2;
                animated = true;
            }

            return {
                id: `edge_${i}`,
                source: e.source,
                target: e.target,
                type: 'default',
                animated,
                style: {
                    stroke: strokeColor,
                    strokeWidth,
                    opacity: 0.7,
                    filter: `drop-shadow(0 0 3px ${strokeColor}40)`,
                },
                labelStyle: {
                    fontSize: 10,
                    fill: '#d1d5db',
                    fontWeight: 500,
                },
            };
        });
        setEdges(flowEdges);

        // Custom force for theme clustering
        const themeForce = () => {
            const themes: Record<string, { cx: number; cy: number }> = {
                'Architecture': { cx: -120, cy: -80 },
                'Infrastructure': { cx: 120, cy: -80 },
                'Database': { cx: 0, cy: 120 },
            };
            
            return (alpha: number) => {
                simNodesRef.current.forEach(node => {
                    const target = themes[node.theme] || { cx: 0, cy: 0 };
                    const strength = 0.03 * alpha;
                    node.vx! += (target.cx - node.x!) * strength;
                    node.vy! += (target.cy - node.y!) * strength;
                });
            };
        };

        // Create d3 force simulation
        const simulation = forceSimulation<SimNode>(simNodes)
            .force('charge', forceManyBody<SimNode>().strength(-300)) // Repulsion
            .force('link', forceLink<SimNode, SimLink>(simLinks)
                .id(d => d.id)
                .distance(link => {
                    // Conflicts push apart, complements pull together
                    if (link.type === 'conflicts') return 200;
                    if (link.type === 'complements') return 120;
                    return 150;
                })
                .strength(link => {
                    if (link.type === 'conflicts') return 0.3;
                    if (link.type === 'complements') return 0.8;
                    return 0.5;
                }))
            .force('center', forceCenter(0, 0).strength(0.05))
            .force('collision', forceCollide<SimNode>().radius(70))
            .force('themeCluster', themeForce())
            .force('x', forceX(0).strength(0.02)) // Gentle pull to center
            .force('y', forceY(0).strength(0.02))
            .alphaDecay(0.02) // Slower decay for smoother animation
            .velocityDecay(0.3); // More momentum for organic feel

        simulationRef.current = simulation;
        setIsSettling(true);

        // Animation loop - update React state from simulation
        let frameCount = 0;
        const animate = () => {
            frameCount++;
            
            // Update React Flow nodes from simulation positions
            const updatedNodes: Node[] = simNodesRef.current.map(simNode => ({
                id: simNode.id,
                type: 'optionNode',
                position: { x: simNode.x || 0, y: simNode.y || 0 },
                data: {
                    label: simNode.label,
                    theme: simNode.theme,
                    supporters: simNode.supporters,
                    supportCount: simNode.supportCount,
                    isSettling,
                },
            }));
            setNodes(updatedNodes);

            // Fit view periodically during settling
            if (frameCount === 30 || frameCount === 60 || frameCount === 90) {
                fitView({ duration: 300, padding: 0.3 });
            }

            // Continue animation if simulation is still active
            if (simulation.alpha() > 0.01) {
                animFrameRef.current = requestAnimationFrame(animate);
            } else {
                setIsSettling(false);
                fitView({ duration: 800, padding: 0.3 });
            }
        };

        // Start animation loop
        animFrameRef.current = requestAnimationFrame(animate);

        // Force stop after 4 seconds max
        const timeout = setTimeout(() => {
            simulation.stop();
            setIsSettling(false);
            fitView({ duration: 800, padding: 0.3 });
        }, 4000);

        return () => {
            clearTimeout(timeout);
            simulation.stop();
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }
        };
    }, [topology, fitView, getThemePosition]);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            {/* Settling indicator */}
            {isSettling && (
                <div
                    style={{
                        position: 'absolute',
                        top: 16,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 10,
                        padding: '8px 16px',
                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(59, 130, 246, 0.15))',
                        backdropFilter: 'blur(8px)',
                        color: '#e5e7eb',
                        borderRadius: 24,
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: '0.03em',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3), 0 0 30px rgba(16, 185, 129, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                    }}
                >
                    <span
                        style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: '#10b981',
                            boxShadow: '0 0 10px #10b981',
                            animation: 'pulse 1s ease-in-out infinite',
                        }}
                    />
                    Mapping Decision Space...
                </div>
            )}

            {/* Legend */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 16,
                    left: 16,
                    zIndex: 10,
                    padding: '10px 14px',
                    background: 'rgba(17, 24, 39, 0.9)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: 12,
                    border: '1px solid rgba(75, 85, 99, 0.5)',
                    fontSize: 11,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 20, height: 3, background: '#10b981', borderRadius: 2, boxShadow: '0 0 6px #10b981' }} />
                    <span style={{ color: '#9ca3af' }}>Complements</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 20, height: 3, background: '#ef4444', borderRadius: 2, boxShadow: '0 0 6px #ef4444' }} />
                    <span style={{ color: '#9ca3af' }}>Conflicts</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 20, height: 3, background: '#3b82f6', borderRadius: 2, boxShadow: '0 0 6px #3b82f6' }} />
                    <span style={{ color: '#9ca3af' }}>Prerequisite</span>
                </div>
            </div>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.3 }}
                minZoom={0.3}
                maxZoom={1.5}
                nodesDraggable={!isSettling}
                nodesConnectable={false}
                elementsSelectable={true}
                proOptions={{ hideAttribution: true }}
                style={{ background: 'transparent' }}
            >
                <Background color="#374151" gap={24} size={1} style={{ opacity: 0.15 }} />
                <Controls 
                    showInteractive={false} 
                    style={{ 
                        bottom: 16, 
                        right: 16, 
                        top: 'auto', 
                        left: 'auto', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: 4,
                        background: 'rgba(17, 24, 39, 0.9)',
                        borderRadius: 8,
                        border: '1px solid rgba(75, 85, 99, 0.5)',
                        padding: 4,
                    }} 
                />
            </ReactFlow>

            {/* CSS for animations */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(1.2); }
                }
            `}</style>
        </div>
    );
};

export default DecisionGraphCanvas;
