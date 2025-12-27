import React from "react";
import { ComparisonContent } from "../../../../shared/contract";

interface ComparisonMatrixContainerProps {
    content: ComparisonContent;
}

export const ComparisonMatrixContainer: React.FC<ComparisonMatrixContainerProps> = ({ content }) => {
    return (
        <div className="flex flex-col gap-6 p-4 text-white">
            <div className="grid gap-3">
                {content.dimensions.map((dim, idx) => (
                    <div
                        key={idx}
                        className="bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col gap-2"
                    >
                        <div className="flex justify-between items-center">
                            <span className="text-sm font-bold text-gray-400 uppercase">{dim.name}</span>
                            <div className="flex gap-1">
                                {dim.sources.map((s) => (
                                    <span
                                        key={s}
                                        className="text-[10px] bg-white/10 text-gray-500 px-1.5 py-0.5 rounded"
                                    >
                                        {s}
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-between items-baseline">
                            <span className="text-lg font-semibold text-blue-200">{dim.winner}</span>
                        </div>
                        <p className="text-sm text-gray-400 italic border-t border-white/5 pt-2 mt-1">{dim.tradeoff}</p>
                    </div>
                ))}
            </div>

            <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-400">
                    <thead>
                        <tr className="border-b border-gray-700">
                            <th className="p-2"></th>
                            {content.matrix.approaches.map((app, i) => (
                                <th key={i} className="p-2 font-medium text-gray-300">
                                    {app}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {content.matrix.dimensions.map((dim, rowIdx) => (
                            <tr key={rowIdx} className="border-b border-gray-800/50">
                                <td className="p-2 font-medium text-gray-500">{dim}</td>
                                {content.matrix.scores[rowIdx]?.map((score, colIdx) => (
                                    <td key={colIdx} className="p-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-full bg-gray-800 rounded-full h-1.5 max-w-[60px]">
                                                <div
                                                    className="bg-blue-500 h-1.5 rounded-full"
                                                    style={{ width: `${score * 10}%` }}
                                                />
                                            </div>
                                            <span className="text-xs">{score}/10</span>
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

