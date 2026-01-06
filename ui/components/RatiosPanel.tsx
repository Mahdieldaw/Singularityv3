import React from 'react';
import { CoreRatios, GraphAnalysis, ProblemStructure } from '../../shared/contract';

interface RatiosPanelProps {
    ratios: CoreRatios;
    graph: GraphAnalysis;
    pattern: ProblemStructure;
    claimCount: number;
}

const RatioBar: React.FC<{
    label: string;
    value: number;
    color: string;
    description: string;
}> = ({ label, value, color, description }) => (
    <div className="mb-3">
        <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-400">{label}</span>
            <span className="text-white font-medium">{Math.round(value * 100)}%</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                    width: `${Math.round(value * 100)}%`,
                    backgroundColor: color
                }}
            />
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">{description}</div>
    </div>
);

export const RatiosPanel: React.FC<RatiosPanelProps> = ({
    ratios,
    graph,
    pattern,
    // claimCount
}) => {
    const { concentration, alignment, tension, fragmentation, depth } = ratios;

    return (
        <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Structural Ratios</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${pattern.primaryPattern === 'settled' ? 'bg-green-500/20 text-green-400' :
                    pattern.primaryPattern === 'contested' ? 'bg-red-500/20 text-red-400' :
                        pattern.primaryPattern === 'keystone' ? 'bg-purple-500/20 text-purple-400' :
                            pattern.primaryPattern === 'linear' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-gray-500/20 text-gray-400'
                    }`}>
                    {pattern.primaryPattern.toUpperCase()}
                </span>
            </div>

            <RatioBar
                label="Concentration"
                value={concentration}
                color="#3b82f6"
                description="How focused support is on top claims"
            />

            <RatioBar
                label="Alignment"
                value={alignment}
                color="#10b981"
                description="How much top claims reinforce each other"
            />

            <RatioBar
                label="Tension"
                value={tension}
                color="#ef4444"
                description="Proportion of conflict/tradeoff edges"
            />

            <RatioBar
                label="Fragmentation"
                value={fragmentation}
                color="#f59e0b"
                description="How disconnected the graph is"
            />

            <RatioBar
                label="Depth"
                value={depth}
                color="#8b5cf6"
                description="Longest chain relative to total claims"
            />

            {/* Graph Summary */}
            <div className="mt-4 pt-4 border-t border-gray-800">
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between">
                        <span className="text-gray-500">Components</span>
                        <span className="text-white">{graph.componentCount}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Longest Chain</span>
                        <span className="text-white">{graph.longestChain.length}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Chain Count</span>
                        <span className="text-white">{graph.chainCount}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500">Hub Dominance</span>
                        <span className="text-white">
                            {graph.hubClaim ? `${graph.hubDominance.toFixed(1)}x` : '—'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Confidence */}
            <div className="mt-4 pt-4 border-t border-gray-800">
                <div className="flex justify-between text-xs">
                    <span className="text-gray-500">Pattern Confidence</span>
                    <span className="text-white font-medium">{Math.round(pattern.confidence * 100)}%</span>
                </div>
                <div className="mt-2 text-[10px] text-gray-500 italic">
                    {pattern.implications.understand}
                </div>
            </div>
        </div>
    );
};
