import React from "react";

interface SynthesisAccuracySectionProps {
    preserved: string[];
    overclaimed: string[];
    className?: string;
}

export const SynthesisAccuracySection: React.FC<SynthesisAccuracySectionProps> = ({
    preserved,
    overclaimed,
    className = ""
}) => {
    const hasPreserved = preserved && preserved.length > 0;
    const hasOverclaimed = overclaimed && overclaimed.length > 0;

    if (!hasPreserved && !hasOverclaimed) return null;

    return (
        <div className={`flex flex-col gap-4 mt-2 ${className}`}>
            {hasPreserved && (
                <div className="bg-green-500/5 border border-green-500/10 rounded-md p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <h4 className="text-xs font-semibold text-green-300 uppercase tracking-wide">
                            Verified & Preserved
                        </h4>
                    </div>
                    <ul className="space-y-1.5 pl-1">
                        {preserved.map((point, i) => (
                            <li key={i} className="text-xs text-green-100/70 flex items-start gap-2">
                                <span className="mt-1.5 w-1 h-1 rounded-full bg-green-500/50 shrink-0" />
                                <span>{point}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {hasOverclaimed && (
                <div className="bg-red-500/5 border border-red-500/10 rounded-md p-3">
                    <div className="flex items-center gap-2 mb-2">
                        <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <h4 className="text-xs font-semibold text-red-300 uppercase tracking-wide">
                            Hallucinated / Overclaimed
                        </h4>
                    </div>
                    <ul className="space-y-1.5 pl-1">
                        {overclaimed.map((point, i) => (
                            <li key={i} className="text-xs text-red-100/70 flex items-start gap-2">
                                <span className="mt-1.5 w-1 h-1 rounded-full bg-red-500/50 shrink-0" />
                                <span>{point}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
