// ui/components/experimental/DecisionGraph.tsx

import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import DecisionGraphCanvas from './DecisionGraphCanvas';
import { generateMockTopology } from './mockData';
import { GraphTopology } from '../../types';

interface DecisionGraphProps {
    /** Parsed topology from mapping response, if available */
    topology?: GraphTopology | null;
    /** AI turn ID for identification */
    aiTurnId?: string;
}

/**
 * Experimental decision graph visualization.
 * Shows a force-directed graph of decision options with support/conflict relationships.
 * Features smooth physics animation with theme-based clustering.
 */
const DecisionGraph: React.FC<DecisionGraphProps> = ({ topology, aiTurnId }) => {
    // Always use mock data if no topology provided for testing
    const displayTopology = topology || generateMockTopology();
    const hasTopology = !!displayTopology;

    return (
        <div
            className="decision-graph-experimental"
            style={{
                marginTop: 20,
                borderTop: '1px solid rgba(75, 85, 99, 0.3)',
                paddingTop: 20,
            }}
        >
            {/* Header */}
            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                marginBottom: 16,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                            boxShadow: '0 0 10px rgba(16, 185, 129, 0.5)',
                        }}
                    />
                    <span style={{ 
                        fontSize: 14, 
                        fontWeight: 600, 
                        color: '#e5e7eb', 
                        letterSpacing: '0.02em',
                    }}>
                        Decision Topology
                    </span>
                    <span
                        style={{
                            fontSize: 10,
                            color: '#10b981',
                            background: 'rgba(16, 185, 129, 0.1)',
                            padding: '3px 10px',
                            borderRadius: 12,
                            border: '1px solid rgba(16, 185, 129, 0.2)',
                            fontWeight: 500,
                            letterSpacing: '0.03em',
                        }}
                    >
                        EXPERIMENTAL
                    </span>
                </div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>
                    {displayTopology?.nodes.length || 0} options • {displayTopology?.edges.length || 0} relationships
                </div>
            </div>

            {/* Graph Canvas */}
            {hasTopology && displayTopology && (
                <div style={{
                    height: 480,
                    background: 'linear-gradient(180deg, #0f172a 0%, #111827 50%, #0f172a 100%)',
                    borderRadius: 16,
                    overflow: 'hidden',
                    border: '1px solid rgba(75, 85, 99, 0.3)',
                    position: 'relative',
                    boxShadow: `
                        0 4px 6px -1px rgba(0, 0, 0, 0.2),
                        0 2px 4px -1px rgba(0, 0, 0, 0.1),
                        inset 0 1px 0 rgba(255, 255, 255, 0.03)
                    `,
                }}>
                    {/* Subtle gradient overlay for depth */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0,0,0,0.3) 100%)',
                            pointerEvents: 'none',
                            zIndex: 1,
                        }}
                    />
                    <ReactFlowProvider>
                        <DecisionGraphCanvas topology={displayTopology} />
                    </ReactFlowProvider>
                </div>
            )}
        </div>
    );
};

export default DecisionGraph;
