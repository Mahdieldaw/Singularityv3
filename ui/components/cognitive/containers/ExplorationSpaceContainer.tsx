import React from 'react';
import { ExplorationContent } from '../../../../shared/contract';

interface ExplorationSpaceContainerProps {
    content: ExplorationContent;
}

export const ExplorationSpaceContainer: React.FC<ExplorationSpaceContainerProps> = ({ content }) => {
    return (
        <div className="flex flex-col gap-6 p-4 text-white">

            {/* Common Thread */}
            {content.common_thread && (
                <div className="p-3 bg-blue-500/10 border-l-2 border-blue-500 text-blue-100 text-sm italic rounded-r-lg">
                    <span className="font-bold not-italic text-blue-400 mr-2">Common Thread:</span>
                    {content.common_thread}
                </div>
            )}

            {/* Paradigm Cards */}
            <div className="grid gap-4 sm:grid-cols-2">
                {content.paradigms.map((paradigm, idx) => (
                    <div key={idx} className="flex flex-col bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all group">
                        <div className="flex justify-between items-start mb-3">
                            <h4 className="text-md font-bold text-gray-200 group-hover:text-blue-300 transition-colors">{paradigm.name}</h4>
                            <span className="text-[10px] bg-white/10 text-gray-400 px-2 py-0.5 rounded-full">{paradigm.source}</span>
                        </div>
                        <p className="text-sm text-gray-300 mb-4 flex-grow">{paradigm.core_idea}</p>
                        <div className="mt-auto pt-3 border-t border-white/5">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Best For</span>
                            <span className="text-xs text-emerald-400">{paradigm.best_for}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Ghost */}
            {content.ghost && (
                <div className="mt-4 p-4 rounded-xl border border-dashed border-gray-700 bg-black/20 flex flex-col gap-2">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">The Ghost (Unexplored)</h4>
                    <p className="text-sm text-gray-400 italic">{content.ghost}</p>
                </div>
            )}
        </div>
    );
};
