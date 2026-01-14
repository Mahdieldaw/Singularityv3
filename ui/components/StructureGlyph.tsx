import React from "react";
import { ProblemStructure } from "../../shared/contract";

// Secondary pattern type - should match your contract.ts
interface SecondaryPattern {
    type: 'dissent' | 'challenged' | 'keystone' | 'chain' | 'fragile' | 'conditional' | 'orphaned';
    data?: unknown;
    confidence?: number;
}

interface StructureGlyphProps {
    pattern: ProblemStructure["primary"];
    secondaryPatterns?: SecondaryPattern[];
    claimCount: number;
    width?: number;
    height?: number;
    onClick?: () => void;
}

const StructureGlyph: React.FC<StructureGlyphProps> = ({
    pattern,
    secondaryPatterns = [],
    claimCount,
    width = 120,
    height = 80,
    onClick,
}) => {
    const cx = width / 2;
    const cy = height / 2;

    // ═══════════════════════════════════════════════════════════════════════════
    // SECONDARY PATTERN DETECTION
    // ═══════════════════════════════════════════════════════════════════════════
    const hasKeystone = secondaryPatterns.some(p => p.type === 'keystone');
    const hasChain = secondaryPatterns.some(p => p.type === 'chain');
    const hasDissent = secondaryPatterns.some(p => p.type === 'dissent');
    const hasFragile = secondaryPatterns.some(p => p.type === 'fragile');
    const hasChallenged = secondaryPatterns.some(p => p.type === 'challenged');
    const hasConditional = secondaryPatterns.some(p => p.type === 'conditional');

    // ═══════════════════════════════════════════════════════════════════════════
    // SECONDARY PATTERN OVERLAYS
    // These render ON TOP of the primary pattern
    // ═══════════════════════════════════════════════════════════════════════════

    const renderKeystoneOverlay = () => {
        if (!hasKeystone) return null;
        // Hub indicator - central node with radiating importance
        return (
            <g className="keystone-overlay">
                <circle 
                    cx={cx} 
                    cy={cy} 
                    r={10} 
                    fill="none" 
                    stroke="rgba(139, 92, 246, 0.6)" 
                    strokeWidth={2}
                    strokeDasharray="4,2"
                />
                <circle cx={cx} cy={cy} r={4} fill="rgba(139, 92, 246, 0.8)" />
            </g>
        );
    };

    const renderChainOverlay = () => {
        if (!hasChain) return null;
        // Directional flow indicator
        const arrowY = height * 0.85;
        return (
            <g className="chain-overlay">
                <line
                    x1={width * 0.2}
                    y1={arrowY}
                    x2={width * 0.8}
                    y2={arrowY}
                    stroke="rgba(59, 130, 246, 0.5)"
                    strokeWidth={1.5}
                    markerEnd="url(#arrowBlue)"
                />
                {/* Chain links */}
                {[0.3, 0.5, 0.7].map((ratio, i) => (
                    <circle
                        key={i}
                        cx={width * ratio}
                        cy={arrowY}
                        r={2}
                        fill="rgba(59, 130, 246, 0.6)"
                    />
                ))}
            </g>
        );
    };

    const renderDissentOverlay = () => {
        if (!hasDissent) return null;
        // Minority voice indicator - contrasting dot with "challenge" position
        return (
            <g className="dissent-overlay">
                {/* Dissent indicator in corner */}
                <circle 
                    cx={width * 0.85} 
                    cy={height * 0.15} 
                    r={5} 
                    fill="rgba(251, 191, 36, 0.8)"
                    stroke="rgba(251, 191, 36, 1)"
                    strokeWidth={1}
                />
                {/* Challenge line toward center */}
                <line
                    x1={width * 0.82}
                    y1={height * 0.18}
                    x2={width * 0.65}
                    y2={height * 0.35}
                    stroke="rgba(251, 191, 36, 0.4)"
                    strokeWidth={1}
                    strokeDasharray="2,2"
                />
            </g>
        );
    };

    const renderFragileOverlay = () => {
        if (!hasFragile) return null;
        // Fragility indicator - unstable foundation
        return (
            <g className="fragile-overlay">
                <line
                    x1={width * 0.3}
                    y1={height * 0.9}
                    x2={width * 0.7}
                    y2={height * 0.9}
                    stroke="rgba(239, 68, 68, 0.4)"
                    strokeWidth={2}
                    strokeDasharray="3,3"
                />
            </g>
        );
    };

    const renderChallengedOverlay = () => {
        if (!hasChallenged) return null;
        // Challenged indicator - attack arrows
        return (
            <g className="challenged-overlay">
                <line
                    x1={width * 0.15}
                    y1={height * 0.85}
                    x2={width * 0.35}
                    y2={height * 0.55}
                    stroke="rgba(239, 68, 68, 0.5)"
                    strokeWidth={1.5}
                    markerEnd="url(#arrowRed)"
                />
            </g>
        );
    };

    const renderConditionalOverlay = () => {
        if (!hasConditional) return null;
        // Conditional branching indicator
        return (
            <g className="conditional-overlay">
                {/* Fork symbol */}
                <path
                    d={`M ${width * 0.1} ${height * 0.5} L ${width * 0.2} ${height * 0.5} L ${width * 0.3} ${height * 0.3}`}
                    stroke="rgba(16, 185, 129, 0.5)"
                    strokeWidth={1.5}
                    fill="none"
                />
                <path
                    d={`M ${width * 0.2} ${height * 0.5} L ${width * 0.3} ${height * 0.7}`}
                    stroke="rgba(16, 185, 129, 0.5)"
                    strokeWidth={1.5}
                    fill="none"
                />
            </g>
        );
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIMARY PATTERN RENDERING
    // ═══════════════════════════════════════════════════════════════════════════

    const renderPrimaryPattern = () => {
        switch (pattern) {
            // ─────────────────────────────────────────────────────────────────────
            // CONVERGENT: Consensus ring with central gravity
            // Maps from: settled, contextual
            // ─────────────────────────────────────────────────────────────────────
            case "convergent": {
                const nodes = Math.min(claimCount, 6);
                const radius = Math.min(width, height) * 0.3;
                
                // If keystone secondary pattern, render as hub-centric instead
                if (hasKeystone) {
                    const satellites = Math.max(0, Math.min(claimCount - 1, 6));
                    return (
                        <>
                            {/* Central keystone hub */}
                            <circle cx={cx} cy={cy} r={8} fill="rgba(139, 92, 246, 0.8)" />
                            {/* Satellite dependencies */}
                            {Array.from({ length: satellites }).map((_, i) => {
                                const angle = (i / satellites) * Math.PI * 2 || 0;
                                const x = cx + Math.cos(angle) * radius;
                                const y = cy + Math.sin(angle) * radius;
                                return (
                                    <g key={i}>
                                        <line
                                            x1={cx}
                                            y1={cy}
                                            x2={x}
                                            y2={y}
                                            stroke="rgba(139, 92, 246, 0.2)"
                                            strokeWidth={1}
                                        />
                                        <circle cx={x} cy={y} r={3} fill="rgba(139, 92, 246, 0.5)" />
                                    </g>
                                );
                            })}
                        </>
                    );
                }

                // If chain secondary pattern, render as sequential
                if (hasChain) {
                    const chainNodes = Math.min(claimCount, 5);
                    const spacing = width / (chainNodes + 1 || 1);
                    return (
                        <>
                            {Array.from({ length: chainNodes }).map((_, i) => {
                                const x = spacing * (i + 1);
                                return (
                                    <g key={i}>
                                        <circle cx={x} cy={cy} r={4} fill="rgba(59, 130, 246, 0.6)" />
                                        {i < chainNodes - 1 && (
                                            <line
                                                x1={x + 4}
                                                y1={cy}
                                                x2={x + spacing - 4}
                                                y2={cy}
                                                stroke="rgba(59, 130, 246, 0.3)"
                                                strokeWidth={1.5}
                                                markerEnd="url(#arrowBlue)"
                                            />
                                        )}
                                    </g>
                                );
                            })}
                        </>
                    );
                }

                // If conditional secondary pattern, show branching
                if (hasConditional) {
                    return (
                        <>
                            {/* Central decision point */}
                            <circle cx={cx} cy={cy} r={6} fill="rgba(16, 185, 129, 0.6)" />
                            {/* Branch A */}
                            <line
                                x1={cx}
                                y1={cy}
                                x2={width * 0.75}
                                y2={height * 0.25}
                                stroke="rgba(16, 185, 129, 0.3)"
                                strokeWidth={1.5}
                            />
                            <circle cx={width * 0.75} cy={height * 0.25} r={4} fill="rgba(16, 185, 129, 0.5)" />
                            {/* Branch B */}
                            <line
                                x1={cx}
                                y1={cy}
                                x2={width * 0.75}
                                y2={height * 0.75}
                                stroke="rgba(16, 185, 129, 0.3)"
                                strokeWidth={1.5}
                            />
                            <circle cx={width * 0.75} cy={height * 0.75} r={4} fill="rgba(16, 185, 129, 0.5)" />
                            {/* Incoming consensus */}
                            <line
                                x1={width * 0.15}
                                y1={cy}
                                x2={cx - 6}
                                y2={cy}
                                stroke="rgba(16, 185, 129, 0.3)"
                                strokeWidth={1.5}
                                markerEnd="url(#arrowGreen)"
                            />
                        </>
                    );
                }

                // Default: standard convergent ring
                return (
                    <>
                        {Array.from({ length: nodes }).map((_, i) => {
                            const angle = (i / nodes) * Math.PI * 2;
                            const x = cx + Math.cos(angle) * radius;
                            const y = cy + Math.sin(angle) * radius;
                            return (
                                <g key={i}>
                                    <circle cx={x} cy={y} r={4} fill="rgba(16, 185, 129, 0.6)" />
                                    <line
                                        x1={x}
                                        y1={y}
                                        x2={cx + Math.cos(angle - (Math.PI * 2 / nodes)) * radius}
                                        y2={cy + Math.sin(angle - (Math.PI * 2 / nodes)) * radius}
                                        stroke="rgba(16, 185, 129, 0.3)"
                                        strokeWidth={1.5}
                                    />
                                </g>
                            );
                        })}
                        <circle 
                            cx={cx} 
                            cy={cy} 
                            r={radius * 1.5} 
                            fill="none" 
                            stroke="rgba(16, 185, 129, 0.1)" 
                            strokeWidth={1} 
                            strokeDasharray="2,2" 
                        />
                    </>
                );
            }

            // ─────────────────────────────────────────────────────────────────────
            // FORKED: Conflicting positions - genuine disagreement
            // Maps from: contested
            // ─────────────────────────────────────────────────────────────────────
            case "forked": {
                const leftX = width * 0.25;
                const rightX = width * 0.75;
                return (
                    <>
                        {/* Group A (Position 1) */}
                        <circle cx={leftX} cy={cy} r={6} fill="rgba(239, 68, 68, 0.6)" />
                        <circle cx={leftX - 8} cy={cy - 8} r={3} fill="rgba(239, 68, 68, 0.4)" />
                        <circle cx={leftX - 8} cy={cy + 8} r={3} fill="rgba(239, 68, 68, 0.4)" />

                        {/* Conflict Line */}
                        <line
                            x1={leftX + 6}
                            y1={cy}
                            x2={rightX - 6}
                            y2={cy}
                            stroke="#ef4444"
                            strokeWidth={2}
                            strokeDasharray="3,2"
                            markerStart="url(#arrowRed)"
                            markerEnd="url(#arrowRed)"
                        />

                        {/* Group B (Position 2) */}
                        <circle cx={rightX} cy={cy} r={6} fill="rgba(239, 68, 68, 0.6)" />
                        <circle cx={rightX + 8} cy={cy - 8} r={3} fill="rgba(239, 68, 68, 0.4)" />
                        <circle cx={rightX + 8} cy={cy + 8} r={3} fill="rgba(239, 68, 68, 0.4)" />
                    </>
                );
            }

            // ─────────────────────────────────────────────────────────────────────
            // CONSTRAINED: Trade-off between options
            // Maps from: tradeoff
            // ─────────────────────────────────────────────────────────────────────
            case "constrained": {
                const leftX = width * 0.3;
                const rightX = width * 0.7;
                return (
                    <>
                        <circle cx={leftX} cy={cy} r={6} fill="rgba(249, 115, 22, 0.6)" />
                        <line
                            x1={leftX + 6}
                            y1={cy}
                            x2={rightX - 6}
                            y2={cy}
                            stroke="#f97316"
                            strokeWidth={2}
                            strokeDasharray="2,2"
                            markerStart="url(#arrowOrange)"
                            markerEnd="url(#arrowOrange)"
                        />
                        <circle cx={rightX} cy={cy} r={6} fill="rgba(249, 115, 22, 0.6)" />
                        {/* Optimization boundary indicator */}
                        <text
                            x={cx}
                            y={cy - 12}
                            textAnchor="middle"
                            fontSize={8}
                            fill="rgba(249, 115, 22, 0.5)"
                        >
                            ⇌
                        </text>
                    </>
                );
            }

            // ─────────────────────────────────────────────────────────────────────
            // PARALLEL: Independent dimensions
            // Maps from: dimensional
            // ─────────────────────────────────────────────────────────────────────
            case "parallel": {
                const ratios = [0.3, 0.5, 0.7];
                return (
                    <>
                        {/* Axis lines showing independence */}
                        <line 
                            x1={width * 0.1} 
                            y1={height * 0.5} 
                            x2={width * 0.9} 
                            y2={height * 0.5} 
                            stroke="rgba(255,255,255,0.1)" 
                            strokeWidth={1} 
                        />
                        <line 
                            x1={width * 0.5} 
                            y1={height * 0.1} 
                            x2={width * 0.5} 
                            y2={height * 0.9} 
                            stroke="rgba(255,255,255,0.1)" 
                            strokeWidth={1} 
                        />
                        {/* Claims distributed across dimensions */}
                        {ratios.map((xRatio, i) =>
                            ratios.map((yRatio, j) => (
                                <circle
                                    key={`${i}-${j}`}
                                    cx={width * xRatio}
                                    cy={height * yRatio}
                                    r={3}
                                    fill="rgba(168, 85, 247, 0.5)"
                                />
                            ))
                        )}
                    </>
                );
            }

            // ─────────────────────────────────────────────────────────────────────
            // SPARSE: Insufficient signal, exploratory
            // Maps from: exploratory
            // ─────────────────────────────────────────────────────────────────────
            case "sparse":
            default: {
                const positions: Array<[number, number]> = [
                    [0.2, 0.3], [0.5, 0.2], [0.7, 0.5], [0.3, 0.7], [0.8, 0.8]
                ];
                const count = Math.min(claimCount, positions.length);
                return (
                    <>
                        {positions.slice(0, count).map(([x, y], i) => (
                            <circle
                                key={i}
                                cx={width * x}
                                cy={height * y}
                                r={3}
                                fill="rgba(156, 163, 175, 0.5)"
                            />
                        ))}
                        {/* Sparse indicator - question marks or uncertainty */}
                        <text
                            x={cx}
                            y={height * 0.95}
                            textAnchor="middle"
                            fontSize={8}
                            fill="rgba(156, 163, 175, 0.4)"
                        >
                            ?
                        </text>
                    </>
                );
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PATTERN LABEL
    // Shows primary + secondary count
    // ═══════════════════════════════════════════════════════════════════════════
    const getPatternLabel = (): string => {
        const secondaryCount = secondaryPatterns.length;
        if (secondaryCount === 0) {
            return pattern;
        }
        // Show most important secondary pattern
        const importantSecondary = secondaryPatterns.find(p => 
            p.type === 'dissent' || p.type === 'keystone' || p.type === 'chain'
        );
        if (importantSecondary) {
            return `${pattern} + ${importantSecondary.type}`;
        }
        return `${pattern} (+${secondaryCount})`;
    };

    return (
        <div
            className="relative cursor-pointer group"
            onClick={onClick}
            title={`${getPatternLabel()} structure — click to explore`}
        >
            <svg width={width} height={height} className="overflow-visible">
                <defs>
                    <marker 
                        id="arrowBlue" 
                        viewBox="0 0 10 10" 
                        refX="9" 
                        refY="5" 
                        markerWidth="4" 
                        markerHeight="4" 
                        orient="auto"
                    >
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(59, 130, 246, 0.6)" />
                    </marker>
                    <marker 
                        id="arrowRed" 
                        viewBox="0 0 10 10" 
                        refX="9" 
                        refY="5" 
                        markerWidth="4" 
                        markerHeight="4" 
                        orient="auto"
                    >
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                    </marker>
                    <marker 
                        id="arrowOrange" 
                        viewBox="0 0 10 10" 
                        refX="9" 
                        refY="5" 
                        markerWidth="4" 
                        markerHeight="4" 
                        orient="auto"
                    >
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#f97316" />
                    </marker>
                    <marker 
                        id="arrowGreen" 
                        viewBox="0 0 10 10" 
                        refX="9" 
                        refY="5" 
                        markerWidth="4" 
                        markerHeight="4" 
                        orient="auto"
                    >
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(16, 185, 129, 0.6)" />
                    </marker>
                </defs>
                
                {/* Primary pattern base layer */}
                {renderPrimaryPattern()}
                
                {/* Secondary pattern overlays (only if not already incorporated into primary) */}
                {!hasKeystone && !hasChain && !hasConditional && (
                    <>
                        {renderKeystoneOverlay()}
                        {renderChainOverlay()}
                        {renderConditionalOverlay()}
                    </>
                )}
                {renderDissentOverlay()}
                {renderFragileOverlay()}
                {renderChallengedOverlay()}
            </svg>
            
            <div className="absolute inset-0 bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <span className="text-xs font-medium text-brand-400">
                    Click to explore →
                </span>
            </div>
        </div>
    );
};

export default StructureGlyph;