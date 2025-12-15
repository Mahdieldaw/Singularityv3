import React from "react";

interface BottomLineCardProps {
    recommendedNextStep?: string;
    reliabilitySummary?: string;
    gapCount: number;
    foundationalGapCount: number;
    hasVerificationTriggers: boolean;
    className?: string;
}

export const BottomLineCard: React.FC<BottomLineCardProps> = ({
    recommendedNextStep,
    reliabilitySummary,
    gapCount,
    foundationalGapCount,
    hasVerificationTriggers,
    className = ""
}) => {
    const tacticalGapCount = gapCount - foundationalGapCount;
    const hasContent = recommendedNextStep || reliabilitySummary || gapCount > 0 || hasVerificationTriggers;

    if (!hasContent) return null;

    return (
        <div className={`bg-gradient-to-r from-indigo-500/10 to-violet-500/10 border border-indigo-500/20 rounded-lg p-4 mt-4 ${className}`}>
            <h4 className="text-sm font-bold text-indigo-200 flex items-center gap-2 mb-3">
                <span>🎯</span>
                The Bottom Line
            </h4>

            {recommendedNextStep ? (
                <p className="text-sm text-white/90 leading-relaxed mb-3">
                    {recommendedNextStep}
                </p>
            ) : reliabilitySummary ? (
                <p className="text-sm text-white/70 italic mb-3">
                    {reliabilitySummary}
                </p>
            ) : null}

            <div className="flex flex-wrap gap-3 text-xs text-white/50">
                {foundationalGapCount > 0 && (
                    <span className="text-amber-400/80">
                        ⚠ {foundationalGapCount} foundational gap{foundationalGapCount !== 1 ? 's' : ''}
                    </span>
                )}
                {tacticalGapCount > 0 && (
                    <span>
                        {tacticalGapCount} tactical consideration{tacticalGapCount !== 1 ? 's' : ''}
                    </span>
                )}
                {hasVerificationTriggers && (
                    <span className="text-orange-400/80">
                        · Verification recommended
                    </span>
                )}
            </div>
        </div>
    );
};
