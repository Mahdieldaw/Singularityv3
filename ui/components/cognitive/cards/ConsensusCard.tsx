import React, { useState } from "react";
import { MapperArtifact } from "../../../../shared/contract";
import { ChevronDownIcon, ChevronUpIcon } from "../../Icons";

interface ConsensusCardProps {
    consensus: MapperArtifact["consensus"];
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
}

export const ConsensusCard: React.FC<ConsensusCardProps> = ({
    consensus,
    selectedIds,
    onToggle,
}) => {
    const [isExpanded, setIsExpanded] = useState(true);

    if (!consensus?.claims?.length) return null;

    const qualityColor =
        consensus.quality === "resolved"
            ? "text-intent-success bg-intent-success/10 border-intent-success/20"
            : consensus.quality === "conventional"
                ? "text-intent-warning bg-intent-warning/10 border-intent-warning/20"
                : "text-intent-danger bg-intent-danger/10 border-intent-danger/20";

    return (
        <div className="bg-surface-raised border border-border-subtle rounded-xl overflow-hidden transition-all duration-200">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-4 hover:bg-surface-highlight transition-colors text-left"
            >
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-surface-highlight flex items-center justify-center text-lg shadow-inner">
                        🤝
                    </div>
                    <div>
                        <h3 className="font-semibold text-text-primary">Consensus</h3>
                        <div className="flex items-center gap-2 mt-1">
                            <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full border border-current capitalize ${qualityColor}`}
                            >
                                {consensus.quality}
                            </span>
                            <div className="flex items-center gap-0.5" title={`Strength: ${(consensus.strength * 100).toFixed(0)}%`}>
                                {[1, 2, 3, 4, 5].map((i) => (
                                    <div
                                        key={i}
                                        className={`w-1.5 h-1.5 rounded-full ${i <= (consensus.strength * 5) ? "bg-primary-500" : "bg-text-muted/30"
                                            }`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                {isExpanded ? (
                    <ChevronUpIcon className="w-5 h-5 text-text-muted" />
                ) : (
                    <ChevronDownIcon className="w-5 h-5 text-text-muted" />
                )}
            </button>

            {isExpanded && (
                <div className="px-4 pb-4 space-y-2 animate-in slide-in-from-top-2 duration-200">
                    {consensus.claims.map((claim, idx) => {
                        const id = `consensus-${idx}`;
                        const isSelected = selectedIds.has(id);
                        return (
                            <div
                                key={idx}
                                onClick={() => onToggle(id)}
                                className={`
                    p-3 rounded-lg border cursor-pointer transition-all duration-200
                    ${isSelected
                                        ? "bg-primary-500/10 border-primary-500/40 shadow-sm"
                                        : "bg-surface-base border-border-subtle hover:border-border-strong hover:bg-surface-highlight"
                                    }
                `}
                            >
                                <div className="flex items-start gap-2.5">
                                    <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? "bg-primary-500 border-primary-500" : "border-text-muted"}`}>
                                        {isSelected && <span className="text-white text-[10px] pb-0.5">✓</span>}
                                    </div>
                                    <span className="text-sm text-text-primary leading-relaxed">{claim.text}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
