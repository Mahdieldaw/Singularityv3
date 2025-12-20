import React from "react";

interface BuriedInsightCardProps {
    points: string[];
    providerName: string;
    className?: string;
    onView?: () => void;
}

export const BuriedInsightCard: React.FC<BuriedInsightCardProps> = ({
    points,
    className = "",
    onView
}) => {
    if (!points || points.length === 0) return null;

    return (
        <div className={`mt-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-md ${className}`}>
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Buried Insights
                </h4>
                {onView && (
                    <button
                        onClick={onView}
                        className="text-[10px] text-indigo-400 hover:text-indigo-200 transition-colors bg-indigo-500/10 px-1.5 py-0.5 rounded cursor-pointer"
                    >
                        View
                    </button>
                )}
            </div>

            <div className="space-y-2">
                {points.map((point, idx) => (
                    <div key={idx} className="flex gap-2 items-start text-xs text-indigo-200/80">
                        <span className="mt-1 w-1 h-1 rounded-full bg-indigo-500/50 shrink-0" />
                        <span>{point}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
