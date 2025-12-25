import React, { useState } from "react";
import { MapperArtifact } from "../../../../shared/contract";
import { ChevronDownIcon, ChevronUpIcon } from "../../Icons";

interface OutlierCardProps {
    outliers: MapperArtifact["outliers"];
    selectedIds: Set<string>;
    onToggle: (id: string, text: string) => void;
}

export const OutlierCard: React.FC<OutlierCardProps> = ({
    outliers,
    selectedIds,
    onToggle,
}) => {
    const [isExpanded, setIsExpanded] = useState(true);

    if (!outliers?.length) return null;

    return (
        <div className="bg-surface-raised border border-border-subtle rounded-xl overflow-hidden transition-all duration-200 mt-3">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-4 hover:bg-surface-highlight transition-colors text-left"
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-surface-highlight flex items-center justify-center text-lg shadow-inner">
                        🧪
                    </div>
                    <div>
                        <h3 className="font-semibold text-text-primary">Outliers & Insights</h3>
                        <p className="text-xs text-text-muted">
                            {outliers.length} unique perspective{outliers.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>
                {isExpanded ? (
                    <ChevronUpIcon className="w-5 h-5 text-text-muted" />
                ) : (
                    <ChevronDownIcon className="w-5 h-5 text-text-muted" />
                )}
            </button>

            {isExpanded && (
                <div className="px-4 pb-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                    {outliers.map((outlier, idx) => {
                        const id = `outlier-${idx}`;
                        const isSelected = selectedIds.has(id);
                        const isChallenger = outlier.type === "frame_challenger";

                        return (
                            <div
                                key={idx}
                                onClick={() => onToggle(id, outlier.insight)}
                                className={`
                    group relative p-3 rounded-lg border cursor-pointer transition-all duration-200
                    ${isSelected
                                        ? "bg-primary-500/10 border-primary-500/40 shadow-sm"
                                        : isChallenger
                                            ? "bg-intent-warning/5 border-intent-warning/20 hover:bg-intent-warning/10"
                                            : "bg-surface-base border-border-subtle hover:border-border-strong hover:bg-surface-highlight"
                                    }
                `}
                            >
                                <div className="flex justify-between items-start gap-2 mb-1">
                                    <div className={`
                          text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1
                          ${isChallenger
                                            ? "bg-intent-warning/20 text-intent-warning"
                                            : "bg-surface-highlight text-text-secondary"
                                        }
                      `}>
                                        {isChallenger ? "⚡ Frame Challenger" : "💡 Supplemental"}
                                    </div>
                                    <span className="text-[10px] text-text-muted font-mono px-1.5 py-0.5 rounded bg-surface-base border border-border-subtle">
                                        {outlier.source}
                                    </span>
                                </div>

                                <div className="flex items-start gap-2.5">
                                    <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? "bg-primary-500 border-primary-500" : "border-text-muted"}`}>
                                        {isSelected && <span className="text-white text-[10px] pb-0.5">✓</span>}
                                    </div>
                                    <div>
                                        <p className="text-sm text-text-primary leading-relaxed font-medium">
                                            {outlier.insight}
                                        </p>
                                        {outlier.raw_context && (
                                            <p className="text-xs text-text-muted mt-1 italic border-l-2 border-border-subtle pl-2">
                                                "{outlier.raw_context}"
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
