// ui/components/experimental/OptionNode.tsx

import React, { useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

interface OptionNodeData {
    label: string;
    theme: string;
    supporters: number[];
    supportCount: number;
    isSettling?: boolean;
}

type OptionNodeProps = NodeProps<OptionNodeData>;

// Theme color mapping for futuristic look
const THEME_COLORS: Record<string, { primary: string; glow: string; gradient: string }> = {
    'Architecture': {
        primary: '#8b5cf6', // Purple
        glow: 'rgba(139, 92, 246, 0.4)',
        gradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.05))',
    },
    'Infrastructure': {
        primary: '#3b82f6', // Blue
        glow: 'rgba(59, 130, 246, 0.4)',
        gradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.05))',
    },
    'Database': {
        primary: '#10b981', // Emerald
        glow: 'rgba(16, 185, 129, 0.4)',
        gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.05))',
    },
    'default': {
        primary: '#6b7280', // Gray
        glow: 'rgba(107, 114, 128, 0.4)',
        gradient: 'linear-gradient(135deg, rgba(107, 114, 128, 0.2), rgba(107, 114, 128, 0.05))',
    },
};

/**
 * Custom node component for displaying decision options in the graph.
 * Features:
 * - Hexagonal/rounded shape with glowing border based on theme
 * - Pulsing supporter orbs showing model consensus
 * - Hover effects with scale and glow intensity
 * - Size scales with support count
 */
const OptionNode: React.FC<OptionNodeProps> = ({ data, selected }) => {
    const baseSize = 110;
    const size = Math.min(160, baseSize + (data.supportCount * 10));
    const themeColor = THEME_COLORS[data.theme] || THEME_COLORS.default;

    // Generate unique animation delay for orbs
    const orbDelays = useMemo(() => 
        [1, 2, 3, 4, 5, 6].map(() => Math.random() * 2),
    []);

    return (
        <>
            {/* Connection handles - invisible but functional */}
            <Handle 
                type="target" 
                position={Position.Top} 
                style={{ 
                    opacity: 0,
                    width: 10,
                    height: 10,
                }} 
            />
            <Handle 
                type="source" 
                position={Position.Bottom} 
                style={{ 
                    opacity: 0,
                    width: 10,
                    height: 10,
                }} 
            />

            {/* Outer glow ring */}
            <div
                style={{
                    position: 'absolute',
                    inset: -4,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${themeColor.glow} 0%, transparent 70%)`,
                    opacity: selected ? 0.8 : 0.4,
                    transition: 'opacity 0.3s ease',
                    animation: 'nodeGlow 3s ease-in-out infinite',
                    pointerEvents: 'none',
                }}
            />

            {/* Main node container */}
            <div
                className="option-node"
                style={{
                    width: size,
                    height: size,
                    padding: 14,
                    background: themeColor.gradient,
                    backdropFilter: 'blur(12px)',
                    border: `2px solid ${themeColor.primary}50`,
                    borderRadius: '50%',
                    boxShadow: `
                        0 0 20px ${themeColor.glow},
                        0 8px 32px rgba(0, 0, 0, 0.4),
                        inset 0 1px 0 rgba(255, 255, 255, 0.1)
                    `,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    color: '#f3f4f6',
                    cursor: 'grab',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                {/* Animated shine effect */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: '-100%',
                        width: '200%',
                        height: '100%',
                        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)',
                        animation: 'nodeShine 4s ease-in-out infinite',
                        pointerEvents: 'none',
                    }}
                />

                {/* Label */}
                <div
                    style={{
                        fontWeight: 600,
                        marginBottom: 4,
                        fontSize: 11,
                        lineHeight: 1.3,
                        textShadow: `0 0 10px ${themeColor.glow}`,
                        maxWidth: '90%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        letterSpacing: '0.01em',
                    }}
                >
                    {data.label}
                </div>

                {/* Theme badge */}
                <div
                    style={{
                        fontSize: 9,
                        color: themeColor.primary,
                        marginBottom: 8,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        fontWeight: 700,
                        padding: '2px 8px',
                        background: `${themeColor.primary}15`,
                        borderRadius: 10,
                        border: `1px solid ${themeColor.primary}30`,
                    }}
                >
                    {data.theme}
                </div>

                {/* Supporter orbs */}
                <div
                    style={{
                        display: 'flex',
                        gap: 4,
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        maxWidth: '85%',
                    }}
                >
                    {[1, 2, 3, 4, 5, 6].map((modelNum, idx) => {
                        const isSupporter = data.supporters.includes(modelNum);
                        return (
                            <span
                                key={modelNum}
                                style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    background: isSupporter
                                        ? `linear-gradient(135deg, #10b981, #059669)`
                                        : 'rgba(55, 65, 81, 0.6)',
                                    boxShadow: isSupporter
                                        ? '0 0 12px rgba(16, 185, 129, 0.8), inset 0 1px 0 rgba(255,255,255,0.3)'
                                        : 'inset 0 1px 2px rgba(0,0,0,0.3)',
                                    border: isSupporter
                                        ? '1px solid rgba(16, 185, 129, 0.6)'
                                        : '1px solid rgba(75, 85, 99, 0.4)',
                                    transition: 'all 0.3s ease',
                                    animation: isSupporter
                                        ? `orbPulse 2s ease-in-out ${orbDelays[idx]}s infinite`
                                        : 'none',
                                }}
                                title={`Model ${modelNum}${isSupporter ? ' supports this option' : ''}`}
                            />
                        );
                    })}
                </div>

                {/* Support count indicator */}
                <div
                    style={{
                        position: 'absolute',
                        bottom: 8,
                        fontSize: 9,
                        color: '#9ca3af',
                        opacity: 0.7,
                    }}
                >
                    {data.supportCount}/6
                </div>
            </div>

            {/* CSS animations */}
            <style>{`
                @keyframes nodeGlow {
                    0%, 100% { opacity: 0.4; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(1.05); }
                }
                @keyframes nodeShine {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                @keyframes orbPulse {
                    0%, 100% { transform: scale(1); box-shadow: 0 0 12px rgba(16, 185, 129, 0.8); }
                    50% { transform: scale(1.15); box-shadow: 0 0 18px rgba(16, 185, 129, 1); }
                }
                .option-node:hover {
                    transform: scale(1.05);
                    border-color: rgba(255, 255, 255, 0.3) !important;
                }
                .option-node:active {
                    cursor: grabbing;
                }
            `}</style>
        </>
    );
};

export default OptionNode;
