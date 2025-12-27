import React from "react";
import { DecisionTreeContent } from "../../../../shared/contract";

interface DecisionTreeContainerProps {
    content: DecisionTreeContent;
}

export const DecisionTreeContainer: React.FC<DecisionTreeContainerProps> = ({ content }) => {
    return (
        <div className="flex flex-col gap-6 p-4 text-white">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2">Recommended Path</h4>
                <p className="text-lg text-emerald-100">{content.default_path}</p>
            </div>

            <div className="flex flex-col gap-3">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Conditional Branches</h4>
                <div className="grid gap-4">
                    {content.conditions.map((item, idx) => (
                        <div
                            key={idx}
                            className="relative pl-6 border-l-2 border-dashed border-gray-700 hover:border-blue-500/50 transition-colors"
                        >
                            <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-gray-800 border-2 border-gray-600 flex items-center justify-center">
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <span className="text-sm font-semibold text-blue-300">If: {item.condition}</span>
                                <p className="text-gray-300">{item.path}</p>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="text-xs text-gray-500 italic">{item.reasoning}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-400">
                                        {item.source}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {content.frame_challenger && (
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 mt-2">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest">Frame Challenger</h4>
                        <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">
                            {content.frame_challenger.source}
                        </span>
                    </div>
                    <p className="text-purple-100 mb-2">{content.frame_challenger.position}</p>
                    <p className="text-sm text-purple-300/80 italic">
                        Consider if: {content.frame_challenger.consider_if}
                    </p>
                </div>
            )}
        </div>
    );
};

