import React, { useState } from "react";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface HeaderGuidanceProps {
    confidenceScore: number;
    biggestRisk?: string;
    reliabilitySummary?: string;
    presentationStrategy?: string;
    strategyRationale?: string;
    className?: string;
}

export const HeaderGuidance: React.FC<HeaderGuidanceProps> = ({
    confidenceScore,
    biggestRisk,
    reliabilitySummary,
    presentationStrategy,
    strategyRationale,
    className = ""
}) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className={`bg-black/20 border border-white/10 rounded-lg p-3 mb-4 ${className}`}>
            <div className="flex flex-wrap items-center gap-3">
                <ConfidenceBadge score={confidenceScore} />

                {biggestRisk && (
                    <div className="flex-1 min-w-0">
                        <span className="text-amber-400/60 text-xs uppercase tracking-wide mr-2">
                            Watch for:
                        </span>
                        <span className="text-sm text-amber-200/80">{biggestRisk}</span>
                    </div>
                )}
            </div>

            {presentationStrategy && (
                <>
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 mt-2 transition-colors"
                    >
                        <span className="text-[10px]">{expanded ? '▼' : '▶'}</span>
                        Why this format?
                    </button>

                    {expanded && (
                        <div className="mt-2 pl-3 border-l border-white/10 animate-in fade-in slide-in-from-top-1 duration-150">
                            <div className="text-xs text-white/60">
                                <span className="text-sky-400/80 font-medium">{presentationStrategy}</span>
                                {strategyRationale && (
                                    <span className="ml-1">— {strategyRationale}</span>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
