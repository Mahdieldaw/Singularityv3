import React from "react";
import { RefinerOutput } from "../../../shared/parsing-utils";

interface GapsSectionPanelProps {
    gaps: NonNullable<RefinerOutput["gaps"]>;
    className?: string;
}

export const GapsSectionPanel: React.FC<GapsSectionPanelProps> = ({
    gaps,
    className = ""
}) => {
    if (!gaps || gaps.length === 0) return null;

    const foundationalGaps = gaps.filter(g => g.category === 'foundational');
    const tacticalGaps = gaps.filter(g => g.category === 'tactical' || !g.category);

    return (
        <div className={`flex flex-col gap-4 ${className}`}>
            {/* Foundational Gaps - Prominent styling */}
            {foundationalGaps.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                        <h3 className="text-xs font-bold text-amber-300 uppercase tracking-widest">
                            Foundational Gaps
                        </h3>
                    </div>

                    <div className="space-y-3">
                        {foundationalGaps.map((gap, idx) => (
                            <div
                                key={idx}
                                className="border-l-2 border-amber-500/50 pl-3 hover:border-amber-400 transition-colors"
                            >
                                <h4 className="text-sm font-semibold text-amber-100">
                                    {gap.title}
                                </h4>
                                <p className="text-xs text-amber-200/70 leading-relaxed mt-1">
                                    {gap.explanation}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tactical Gaps - Subdued styling */}
            {tacticalGaps.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400/50" />
                        <h3 className="text-xs font-medium text-white/50 uppercase tracking-widest">
                            Additional Considerations
                        </h3>
                    </div>

                    <div className="space-y-2">
                        {tacticalGaps.map((gap, idx) => (
                            <div
                                key={idx}
                                className="bg-white/5 rounded p-3 hover:bg-white/10 transition-colors"
                            >
                                <h4 className="text-sm font-medium text-indigo-100 mb-1">
                                    {gap.title}
                                </h4>
                                <p className="text-xs text-indigo-200/60 leading-relaxed">
                                    {gap.explanation}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
