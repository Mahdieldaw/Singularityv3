import React from 'react';
import { ExploreOutput } from '../../../../shared/contract';
import { DirectAnswerContainer } from './DirectAnswerContainer';
import { DecisionTreeContainer } from './DecisionTreeContainer';
import { ComparisonMatrixContainer } from './ComparisonMatrixContainer';
import { ExplorationSpaceContainer } from './ExplorationSpaceContainer';

interface ContainerWrapperProps {
    output: ExploreOutput;
}

export const ContainerWrapper: React.FC<ContainerWrapperProps> = ({ output }) => {
    const renderContainer = () => {
        switch (output.container) {
            case 'direct_answer':
                return <DirectAnswerContainer content={output.content as any} />;
            case 'decision_tree':
                return <DecisionTreeContainer content={output.content as any} />;
            case 'comparison_matrix':
                return <ComparisonMatrixContainer content={output.content as any} />;
            case 'exploration_space':
                return <ExplorationSpaceContainer content={output.content as any} />;
            default:
                return <div className="p-4 text-red-400">Unknown container type: {output.container}</div>;
        }
    };

    return (
        <div className="w-full flex flex-col gap-4">
            {/* Mode Indicator & Souvenir */}
            <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-blue-500/10 to-transparent border-t border-b border-blue-500/20">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    <span className="text-xs font-bold text-blue-300 uppercase tracking-widest">Explore Mode</span>
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-400 font-mono uppercase">{output.container.replace('_', ' ')}</span>
                </div>
            </div>

            {/* Main Container */}
            <div className="min-h-[200px]">
                {renderContainer()}
            </div>

            {/* Souvenir/Footer */}
            <div className="mx-4 mb-4 p-3 bg-white/[0.02] border border-white/5 rounded-lg">
                <p className="text-sm text-gray-400 italic">" {output.souvenir} "</p>
            </div>

            {/* Alternatives */}
            {output.alternatives && output.alternatives.length > 0 && (
                <div className="px-4 pb-4 flex gap-2 flex-wrap">
                    <span className="text-xs text-gray-600 self-center mr-2">View as:</span>
                    {output.alternatives.map((alt, idx) => (
                        <button key={idx} className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors border border-white/5">
                            {alt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
