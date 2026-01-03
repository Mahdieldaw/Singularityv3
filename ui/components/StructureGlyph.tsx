import React from "react";
import { ProblemStructure } from "../../shared/contract";

interface StructureGlyphProps {
    pattern: ProblemStructure["primaryPattern"];
    claimCount: number;
    width?: number;
    height?: number;
    onClick?: () => void;
}

const StructureGlyph: React.FC<StructureGlyphProps> = ({
    pattern,
    claimCount,
    width = 120,
    height = 80,
    onClick,
}) => {
    const cx = width / 2;
    const cy = height / 2;

    const renderPattern = () => {
        switch (pattern) {
            case "linear": {
                const nodes = Math.min(claimCount, 5);
                const spacing = width / (nodes + 1 || 1);
                return (
                    <>
                        {Array.from({ length: nodes }).map((_, i) => {
                            const x = spacing * (i + 1);
                            return (
                                <g key={i}>
                                    <circle cx={x} cy={cy} r={4} fill="rgba(139, 92, 246, 0.6)" />
                                    {i < nodes - 1 && (
                                        <line
                                            x1={x + 4}
                                            y1={cy}
                                            x2={x + spacing - 4}
                                            y2={cy}
                                            stroke="rgba(139, 92, 246, 0.3)"
                                            strokeWidth={1.5}
                                            markerEnd="url(#arrow)"
                                        />
                                    )}
                                </g>
                            );
                        })}
                    </>
                );
            }
            case "keystone": {
                const satellites = Math.max(0, Math.min(claimCount - 1, 6));
                const radius = Math.min(width, height) * 0.3;
                return (
                    <>
                        <circle cx={cx} cy={cy} r={8} fill="rgba(139, 92, 246, 0.8)" />
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
            case "contested": {
                const leftX = width * 0.25;
                const rightX = width * 0.75;
                return (
                    <>
                        <circle cx={leftX} cy={cy} r={6} fill="rgba(139, 92, 246, 0.6)" />
                        <circle cx={leftX - 8} cy={cy - 8} r={3} fill="rgba(139, 92, 246, 0.4)" />
                        <circle cx={leftX - 8} cy={cy + 8} r={3} fill="rgba(139, 92, 246, 0.4)" />
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
                        <circle cx={rightX} cy={cy} r={6} fill="rgba(139, 92, 246, 0.6)" />
                        <circle cx={rightX + 8} cy={cy - 8} r={3} fill="rgba(139, 92, 246, 0.4)" />
                        <circle cx={rightX + 8} cy={cy + 8} r={3} fill="rgba(139, 92, 246, 0.4)" />
                    </>
                );
            }
            case "tradeoff": {
                const leftX = width * 0.3;
                const rightX = width * 0.7;
                return (
                    <>
                        <circle cx={leftX} cy={cy} r={6} fill="rgba(139, 92, 246, 0.6)" />
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
                        <circle cx={rightX} cy={cy} r={6} fill="rgba(139, 92, 246, 0.6)" />
                    </>
                );
            }
            case "dimensional": {
                const ratios = [0.3, 0.5, 0.7];
                return (
                    <>
                        {ratios.map((xRatio, i) =>
                            ratios.map((yRatio, j) => (
                                <circle
                                    key={`${i}-${j}`}
                                    cx={width * xRatio}
                                    cy={height * yRatio}
                                    r={3}
                                    fill="rgba(139, 92, 246, 0.5)"
                                />
                            ))
                        )}
                    </>
                );
            }
            case "exploratory":
            default: {
                const positions: Array<[number, number]> = [
                    [0.2, 0.3],
                    [0.5, 0.2],
                    [0.7, 0.5],
                    [0.3, 0.7],
                    [0.8, 0.8],
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
                                fill="rgba(139, 92, 246, 0.5)"
                            />
                        ))}
                    </>
                );
            }
        }
    };

    return (
        <div
            className="relative cursor-pointer group"
            onClick={onClick}
            title={`${pattern} structure — click to explore`}
        >
            <svg width={width} height={height} className="overflow-visible">
                <defs>
                    <marker
                        id="arrow"
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="4"
                        markerHeight="4"
                        orient="auto"
                    >
                        <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(139, 92, 246, 0.6)" />
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
                </defs>
                {renderPattern()}
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

