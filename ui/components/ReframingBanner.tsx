import React, { useState } from "react";
import { RefinerOutput } from "../../shared/parsing-utils";

interface ReframingBannerProps {
    suggestion: NonNullable<RefinerOutput["reframingSuggestion"]>;
    onApply?: (question: string) => void;
    onDismiss?: () => void;
    className?: string;
}

export const ReframingBanner: React.FC<ReframingBannerProps> = ({
    suggestion,
    onApply,
    onDismiss,
    className = ""
}) => {
    const { issue, betterQuestion, unlocks } = suggestion;

    return (
        <div className={`relative overflow-hidden rounded-lg bg-gradient-to-r from-violet-600/20 to-indigo-600/20 border border-violet-500/30 p-4 ${className}`}>
            {/* Glow effect */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400 opacity-70" />

            <div className="flex flex-col gap-3 relative z-10">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-violet-200 uppercase tracking-wide flex items-center gap-2">
                            <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Reframing Opportunity
                        </h3>
                        <p className="text-xs text-violet-200/70 mt-1">
                            {issue}
                        </p>
                    </div>
                    {onDismiss && (
                        <button
                            onClick={onDismiss}
                            className="text-white/40 hover:text-white transition-colors p-1"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className="bg-black/30 rounded p-3 border border-white/5">
                    <p className="text-sm font-medium text-white mb-2">
                        "{betterQuestion}"
                    </p>
                    {unlocks && (
                        <div className="flex items-center gap-2 text-xs text-indigo-300">
                            <span className="opacity-70">Unlocks:</span>
                            <span>{unlocks}</span>
                        </div>
                    )}
                </div>

                {onApply && (
                    <div className="flex justify-end">
                        <button
                            onClick={() => onApply(betterQuestion)}
                            className="text-xs bg-violet-600 hover:bg-violet-500 text-white font-medium px-3 py-1.5 rounded transition-colors shadow-lg shadow-violet-900/20"
                        >
                            Use This Question
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
