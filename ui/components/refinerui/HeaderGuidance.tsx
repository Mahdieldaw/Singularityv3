import React from "react";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface HeaderGuidanceProps {
    confidenceScore: number;
    biggestRisk?: string;
    verificationEnabled?: boolean;
    verificationCount?: number;
    className?: string;
}

export const HeaderGuidance: React.FC<HeaderGuidanceProps> = ({
    confidenceScore,
    biggestRisk,
    verificationEnabled = true,
    verificationCount,
    className = ""
}) => {
    // Note: verification count rendered by parent via refiner helpers when needed
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

                {verificationEnabled && typeof verificationCount === 'number' && verificationCount > 0 && (
                    <div className="text-amber-300/80 text-xs">
                        🔍 {verificationCount} claim{verificationCount !== 1 ? 's' : ''} need verification
                    </div>
                )}
            </div>
        </div>
    );
};
