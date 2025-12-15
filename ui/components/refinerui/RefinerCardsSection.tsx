import React, { useState } from "react";
import { RefinerOutput } from "../../../shared/parsing-utils";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { GapsSectionPanel } from "./GapsSectionPanel";
import { SynthesisAccuracySection } from "./SynthesisAccuracySection";
import { MapperAuditSection } from "./MapperAuditSection";

interface RefinerSectionProps {
    output: RefinerOutput;
    className?: string;
}

/**
 * Renders ONLY the synthesis accuracy verification.
 * Intended for insertion directly below the synthesis bubble in the chat stream.
 */
export const RefinerSynthesisAccuracy: React.FC<RefinerSectionProps> = ({ output, className = "" }) => {
    const { synthesisAccuracy } = output;

    if (!synthesisAccuracy) return null;

    return (
        <div className={`mt-2 ${className}`}>
            <SynthesisAccuracySection
                preserved={synthesisAccuracy.preserved}
                overclaimed={synthesisAccuracy.overclaimed}
                missed={synthesisAccuracy.missed}
            />
        </div>
    );
};

/**
 * Renders the full epistemic audit (Reliability, Gaps, Verification).
 * Intended for the Decision Map Sheet.
 */
/**
 * Renders the full epistemic audit (Reliability, Gaps, Verification).
 * Intended for the Decision Map Sheet.
 */
interface RefinerAuditProps extends RefinerSectionProps {
    rawText?: string;
}

export const RefinerEpistemicAudit: React.FC<RefinerAuditProps> = ({ output, rawText, className = "" }) => {
    // DEBUG: Log what we received
    console.log('[RefinerEpistemicAudit] output:', output);
    console.log('[RefinerEpistemicAudit] honestAssessment type:', typeof output?.honestAssessment);

    const [showAccuracy, setShowAccuracy] = useState(false);
    const [showRaw, setShowRaw] = useState(false);

    const {
        confidenceScore,
        rationale,
        presentationStrategy,
        strategyRationale,
        honestAssessment,
        gaps,
        verificationTriggers,
        synthesisAccuracy,
        mapperAudit,
        metaPattern
    } = output;

    return (
        <div className={`flex flex-col gap-6 p-6 ${className}`}>
            {/* Header / Summary */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <span className="text-sm uppercase font-bold text-indigo-400 tracking-wider">Epistemic Audit</span>
                    {confidenceScore !== undefined && (
                        <ConfidenceBadge score={confidenceScore} />
                    )}
                </div>
            </div>

            {/* Assessment */}
            {rationale && (
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-400" />
                        <h4 className="text-xs font-bold text-indigo-200 uppercase tracking-wider">Reliability Rationale</h4>
                    </div>
                    <div className="text-sm text-white/90 leading-relaxed">{rationale}</div>
                </div>
            )}

            {/* Honest Assessment - Handle both string and structured formats */}
            {honestAssessment && (
                typeof honestAssessment === 'object' ? (
                    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="w-2 h-2 rounded-full bg-indigo-400" />
                            <h4 className="text-xs font-bold text-indigo-200 uppercase tracking-wider">
                                Honest Assessment
                            </h4>
                        </div>
                        <div className="space-y-3 text-sm">
                            <div>
                                <span className="text-indigo-300 font-medium">Reliability: </span>
                                <span className="text-white/90">{honestAssessment.reliabilitySummary}</span>
                            </div>
                            <div>
                                <span className="text-amber-300 font-medium">Biggest Risk: </span>
                                <span className="text-white/90">{honestAssessment.biggestRisk}</span>
                            </div>
                            <div>
                                <span className="text-green-300 font-medium">Next Step: </span>
                                <span className="text-white/90">{honestAssessment.recommendedNextStep}</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-sm text-white/90 leading-relaxed border-l-4 border-indigo-500 pl-4 py-2 italic bg-indigo-500/5 rounded-r-lg">
                        "{honestAssessment}"
                    </div>
                )
            )}
            {presentationStrategy && (
                <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-sky-400" />
                        <h4 className="text-xs font-bold text-sky-200 uppercase tracking-wider">Presentation Strategy</h4>
                    </div>
                    <div className="text-sm text-white/90">
                        <strong className="text-sky-300">Recommended:</strong> {presentationStrategy}
                    </div>
                    {strategyRationale && (
                        <div className="text-sm text-white/80 mt-2">
                            <strong className="text-sky-300">Why:</strong> {strategyRationale}
                        </div>
                    )}
                </div>
            )}

            {/* Gaps */}
            {gaps && gaps.length > 0 && (
                <div className="mt-2">
                    <h3 className="text-xs uppercase font-bold text-white/50 mb-3 tracking-wider">Strategic Gaps</h3>
                    <GapsSectionPanel gaps={gaps} />
                </div>
            )}

            {/* Verification Triggers - Enhanced */}
            {verificationTriggers && verificationTriggers.length > 0 && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-5 mt-2">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.6)]" />
                        <h4 className="text-xs font-bold text-orange-200 uppercase tracking-wider">
                            Verification Triggers
                        </h4>
                    </div>
                    <ul className="space-y-4">
                        {verificationTriggers.map((trigger, idx) => (
                            <li key={idx} className="text-sm text-orange-100/90 pl-3 border-l-2 border-orange-500/30">
                                <strong className="text-orange-300 block mb-1">
                                    "{trigger.claim}"
                                </strong>
                                <span className="block text-orange-100/80 italic mb-2">
                                    {trigger.why}
                                </span>
                                {trigger.sourceType && (
                                    <span className="text-xs text-orange-400/70">
                                        Look for: {trigger.sourceType}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Meta Pattern */}
            {metaPattern && (
                <div className="bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-2 h-2 rounded-full bg-fuchsia-400" />
                        <h4 className="text-xs font-bold text-fuchsia-200 uppercase tracking-wider">Meta-Pattern</h4>
                    </div>
                    <div className="text-sm text-white/90 leading-relaxed">{metaPattern}</div>
                </div>
            )}

            {/* Mapper Audit */}
            {mapperAudit && (
                <MapperAuditSection audit={mapperAudit} className="mt-2" />
            )}

            {/* Synthesis Accuracy (Collapsed by default) */}
            {synthesisAccuracy && (
                <div className="mt-4 pt-4 border-t border-white/10">
                    <button
                        onClick={() => setShowAccuracy(!showAccuracy)}
                        className="flex items-center justify-between w-full text-left group"
                    >
                        <span className="text-xs uppercase font-bold text-white/40 group-hover:text-white/70 transition-colors tracking-wider">
                            Synthesis Accuracy Report (Preserved/Overclaimed/Missed)
                        </span>
                        <span className="text-white/40 text-xs">
                            {showAccuracy ? "Collapse" : "Expand"}
                        </span>
                    </button>

                    {showAccuracy && (
                        <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <SynthesisAccuracySection
                                preserved={synthesisAccuracy.preserved}
                                overclaimed={synthesisAccuracy.overclaimed}
                                missed={synthesisAccuracy.missed}
                            />
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

/**
 * @deprecated Use RefinerSynthesisAccuracy or RefinerEpistemicAudit instead
 */
export const RefinerCardsSection: React.FC<RefinerSectionProps> = (props) => {
    return (
        <>
            <RefinerSynthesisAccuracy {...props} />
            <RefinerEpistemicAudit {...props} />
        </>
    );
};
