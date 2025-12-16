import React from "react";

interface MissedInsightItem {
    insight: string;
    source: string;
    inMapperOptions: boolean;
}

interface SynthesisAccuracySectionProps {
    preserved: string[];
    overclaimed: string[];
    missed?: MissedInsightItem[];
    className?: string;
}

export const SynthesisAccuracySection: React.FC<SynthesisAccuracySectionProps> = ({
    preserved,
    overclaimed,
    missed,
    className = ""
}) => {
    const hasPreserved = preserved && preserved.length > 0;
    const hasOverclaimed = overclaimed && overclaimed.length > 0;
    const hasMissed = Array.isArray(missed) && missed.length > 0;

    return (
        <div className={`flex flex-col gap-4 mt-2 ${className}`}>
            <div className="bg-green-500/5 border border-green-500/10 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h4 className="text-xs font-bold text-green-300 uppercase tracking-wide">
                        Verified & Preserved
                    </h4>
                </div>
                {hasPreserved ? (
                    <ul className="space-y-2 pl-1">
                        {preserved.map((point, i) => (
                            <li key={i} className="text-xs text-green-100/70 flex items-start gap-2">
                                <span className="mt-1.5 w-1 h-1 rounded-full bg-green-500/50 shrink-0" />
                                <span>{point}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-xs text-green-100/50">None</div>
                )}
            </div>

            <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h4 className="text-xs font-bold text-red-300 uppercase tracking-wide">
                        Hallucinated / Overclaimed
                    </h4>
                </div>
                {hasOverclaimed ? (
                    <ul className="space-y-2 pl-1">
                        {overclaimed.map((point, i) => (
                            <li key={i} className="text-xs text-red-100/70 flex items-start gap-2">
                                <span className="mt-1.5 w-1 h-1 rounded-full bg-red-500/50 shrink-0" />
                                <span>{point}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-xs text-red-100/50">None</div>
                )}
            </div>

            <div className="bg-amber-500/5 border border-amber-500/10 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                        Missed Insights
                    </h4>
                </div>
                {hasMissed ? (
                    <ul className="space-y-2 pl-1">
                        {missed!.map((item, i) => (
                            <li key={i} className="text-xs text-amber-100/80 flex items-start gap-2">
                                <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-500/50 shrink-0" />
                                <span>
                                    {item.insight}
                                    {item.source && (
                                        <span className="text-amber-300/60"> — {item.source}{item.inMapperOptions ? " (in options)" : " (not in options)"}</span>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="text-xs text-amber-100/50">No missed insights</div>
                )}
            </div>
        </div>
    );
};
