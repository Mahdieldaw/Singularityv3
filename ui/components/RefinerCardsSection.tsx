import React, { useState } from "react";
import { RefinerOutput } from "../../shared/parsing-utils";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { GapsSectionPanel } from "./GapsSectionPanel";
import { SynthesisAccuracySection } from "./SynthesisAccuracySection";

interface RefinerCardsSectionProps {
    output: RefinerOutput;
    className?: string;
}

export const RefinerCardsSection: React.FC<RefinerCardsSectionProps> = ({ output, className = "" }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const {
        confidenceScore,
        honestAssessment,
        gaps,
        synthesisAccuracy,
        verificationTriggers
    } = output;

    return (
        <div className={`flex flex-col gap-3 ${className}`}>
            {/* Header / Summary */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-bold text-indigo-400 tracking-wider">Refiner Analysis</span>
                    {confidenceScore !== undefined && (
                        <ConfidenceBadge score={confidenceScore} />
                    )}
                </div>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-xs text-white/40 hover:text-white/80 transition-colors uppercase tracking-wider"
                >
                    {isExpanded ? "Collapse" : "Expand Details"}
                </button>
            </div>

            {/* Assessment (Always visible or specific logic?) - Let's keep it concise */}
            {honestAssessment && (
                <div className="text-xs text-white/70 italic leading-relaxed border-l-2 border-indigo-500/30 pl-3 py-1">
                    {honestAssessment}
                </div>
            )}

            {/* Expanded Sections */}
            {isExpanded && (
                <div className="flex flex-col gap-4 mt-2 animate-in fade-in duration-300">
                    {/* Accuracy */}
                    {synthesisAccuracy && (
                        <SynthesisAccuracySection
                            preserved={synthesisAccuracy.preserved}
                            overclaimed={synthesisAccuracy.overclaimed}
                        />
                    )}

                    {/* Gaps */}
                    {gaps && gaps.length > 0 && (
                        <GapsSectionPanel gaps={gaps} />
                    )}

                    {/* Verification Triggers */}
                    {verificationTriggers && verificationTriggers.length > 0 && (
                        <div className="bg-orange-500/5 border border-orange-500/10 rounded-md p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                <h4 className="text-xs font-semibold text-orange-300 uppercase tracking-wide">
                                    Verification Required
                                </h4>
                            </div>
                            <ul className="space-y-2">
                                {verificationTriggers.map((trigger, idx) => (
                                    <li key={idx} className="text-xs text-orange-100/70">
                                        <strong className="text-orange-200 block mb-0.5">{trigger.claim}</strong>
                                        <span className="block opacity-80">{trigger.why}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
