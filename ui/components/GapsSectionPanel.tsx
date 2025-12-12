import React from "react";
import { RefinerOutput } from "../../shared/parsing-utils";

interface GapsSectionPanelProps {
    gaps: NonNullable<RefinerOutput["gaps"]>;
    className?: string;
}

export const GapsSectionPanel: React.FC<GapsSectionPanelProps> = ({ gaps, className = "" }) => {
    if (!gaps || gaps.length === 0) return null;

    return (
        <div className={`flex flex-col gap-3 p-4 bg-black/20 border border-white/5 rounded-lg ${className}`}>
            <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
                <h3 className="text-xs font-medium text-indigo-300 uppercase tracking-widest">
                    Detected Gaps
                </h3>
            </div>

            <div className="grid gap-3">
                {gaps.map((gap, idx) => (
                    <div key={idx} className="bg-white/5 border border-white/5 rounded p-3 hover:bg-white/10 transition-colors">
                        <h4 className="text-sm font-semibold text-indigo-100 mb-1">
                            {gap.title}
                        </h4>
                        <p className="text-xs text-indigo-200/70 leading-relaxed">
                            {gap.explanation}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
};
