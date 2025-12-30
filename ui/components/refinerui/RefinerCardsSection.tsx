/**
 * RefinerCardsSection - Container components for refiner output display.
 * Updated for signal-based RefinerOutput structure.
 */

import React, { useState } from "react";
import { RefinerOutput } from "../../../shared/parsing-utils";
import { SignalCard } from "./SignalCard";
import { categorizeSignals, getSignalCounts } from "../../utils/signalUtils";

interface RefinerSectionProps {
    output: RefinerOutput;
    className?: string;
}

/**
 * Renders the full epistemic audit (all signals, next step, etc.).
 * Intended for the Decision Map Sheet.
 */
interface RefinerAuditProps extends RefinerSectionProps {
    rawText?: string;
}

export const RefinerEpistemicAudit: React.FC<RefinerAuditProps> = ({ output, rawText, className = "" }) => {
    const [showRaw, setShowRaw] = useState(false);

    const { blockerSignals, riskSignals, enhancementSignals } = categorizeSignals(output.signals);
    const counts = getSignalCounts(output.signals);
    const unlistedOptions = output.unlistedOptions || [];

    return (
        <div className={`flex flex-col gap-6 p-6 ${className}`}>
            {/* Header / Summary */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <span className="text-sm uppercase font-bold text-indigo-400 tracking-wider">Epistemic Audit</span>
                    <div className="flex gap-2">
                        {counts.blockers > 0 && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-intent-danger/20 text-intent-danger">
                                {counts.blockers} blocker{counts.blockers > 1 ? 's' : ''}
                            </span>
                        )}
                        {counts.risks > 0 && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-intent-warning/20 text-intent-warning">
                                {counts.risks} risk{counts.risks > 1 ? 's' : ''}
                            </span>
                        )}
                        {counts.enhancements > 0 && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-brand-500/20 text-brand-400">
                                {counts.enhancements} enhancement{counts.enhancements > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Blocker Signals */}
            {blockerSignals.length > 0 && (
                <div>
                    <h3 className="text-xs uppercase font-bold text-intent-danger mb-3 tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-intent-danger" />
                        Blockers
                    </h3>
                    <div className="space-y-2">
                        {blockerSignals.map((signal, idx) => (
                            <SignalCard key={idx} signal={signal} />
                        ))}
                    </div>
                </div>
            )}

            {/* Risk Signals */}
            {riskSignals.length > 0 && (
                <div>
                    <h3 className="text-xs uppercase font-bold text-intent-warning mb-3 tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-intent-warning" />
                        Risks to Review
                    </h3>
                    <div className="space-y-2">
                        {riskSignals.map((signal, idx) => (
                            <SignalCard key={idx} signal={signal} />
                        ))}
                    </div>
                </div>
            )}

            {/* Enhancement Signals */}
            {enhancementSignals.length > 0 && (
                <div>
                    <h3 className="text-xs uppercase font-bold text-brand-400 mb-3 tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-brand-400" />
                        Enhancements
                    </h3>
                    <div className="space-y-2">
                        {enhancementSignals.map((signal, idx) => (
                            <SignalCard key={idx} signal={signal} />
                        ))}
                    </div>
                </div>
            )}

            {/* Unlisted Options */}
            {unlistedOptions.length > 0 && (
                <div>
                    <h3 className="text-xs uppercase font-bold text-white/50 mb-3 tracking-wider">
                        Unlisted Options
                    </h3>
                    <div className="space-y-2">
                        {unlistedOptions.map((opt, idx) => (
                            <div key={idx} className="p-3 bg-white/5 border border-white/10 rounded-lg">
                                <div className="text-sm font-medium text-white">{opt.title}</div>
                                <div className="text-xs text-white/70 mt-1">{opt.description}</div>
                                {opt.source && (
                                    <div className="text-xs text-white/40 mt-1">Source: {opt.source}</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Next Step */}
            {output.leap && output.leap.action && (
                <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                        <span className="w-2 h-2 rounded-full bg-brand-400" />
                        <h4 className="text-xs font-bold text-brand-400 uppercase tracking-wider">The Next Move</h4>
                    </div>
                    <div className="text-lg font-bold text-white leading-snug mb-2">
                        {output.leap.action}
                    </div>
                    {output.leap.rationale && (
                        <div className="text-sm text-white/70 italic border-l-2 border-brand-400/30 pl-3 py-0.5">
                            {output.leap.rationale}
                        </div>
                    )}
                </div>
            )}

            {/* Reframe Suggestion */}
            {output.reframe && (
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-violet-400" />
                        <h4 className="text-xs font-bold text-violet-400 uppercase tracking-wider">Reframe Suggested</h4>
                    </div>
                    {output.reframe.issue && (
                        <div className="text-xs text-violet-200/70 mb-2">{output.reframe.issue}</div>
                    )}
                    <div className="text-sm text-white/90">"{output.reframe.suggestion}"</div>
                    {output.reframe.unlocks && (
                        <div className="text-xs text-violet-300 mt-2">
                            <span className="opacity-70">Unlocks:</span> {output.reframe.unlocks}
                        </div>
                    )}
                </div>
            )}

            {/* Raw Text (Collapsed by default) */}
            {rawText && (
                <div className="mt-2 pt-4 border-t border-white/10">
                    <button
                        onClick={() => setShowRaw(!showRaw)}
                        className="flex items-center justify-between w-full text-left group"
                    >
                        <span className="text-xs uppercase font-bold text-white/40 group-hover:text-white/70 transition-colors tracking-wider">
                            Raw Refiner Response
                        </span>
                        <span className="text-white/40 text-xs">
                            {showRaw ? "Collapse" : "View Raw"}
                        </span>
                    </button>

                    {showRaw && (
                        <div className="mt-4 bg-black/40 rounded-lg p-4 font-mono text-xs text-white/60 whitespace-pre-wrap border border-white/10 overflow-x-auto">
                            {rawText}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

