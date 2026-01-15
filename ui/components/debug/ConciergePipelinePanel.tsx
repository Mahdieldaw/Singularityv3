import React, { useState, useMemo } from "react";
import type { StructuralAnalysis } from "../../../shared/contract";
import type { SingularityOutputState } from "../../hooks/useSingularityOutput";
import { ConciergeService } from "../../../src/core/ConciergeService";
import MarkdownDisplay from "../MarkdownDisplay";

interface ConciergePipelinePanelProps {
    state: SingularityOutputState;
    analysis: StructuralAnalysis | null;
    userMessage: string | null;
}

export const ConciergePipelinePanel: React.FC<ConciergePipelinePanelProps> = ({ state, analysis, userMessage }) => {
    const [showPrompt, setShowPrompt] = useState(false);

    const pipeline: any = useMemo(() => {
        if (state.output?.pipeline) return state.output.pipeline;
        if (!analysis || !userMessage || !state.output) return null;

        try {
            const selection = { stance: 'default' as const, reason: 'universal', confidence: 1.0 };
            const prompt = ConciergeService.buildConciergePrompt(userMessage, analysis, {});

            let leakageDetected = !!state.output.leakageDetected;
            let leakageViolations = state.output.leakageViolations || [];

            if ((!leakageViolations || leakageViolations.length === 0) && ConciergeService.detectMachineryLeakage && state.output.text) {
                const leak = ConciergeService.detectMachineryLeakage(state.output.text);
                leakageDetected = leak.leaked;
                leakageViolations = leak.violations || [];
            }

            return {
                userMessage,
                prompt,
                stance: selection.stance,
                stanceReason: selection.reason,
                stanceConfidence: selection.confidence,
                structuralShape: {
                    primaryPattern: analysis.shape.primary,
                    primary: analysis.shape.primary,
                    patterns: analysis.shape.patterns || [],
                    confidence: analysis.shape.confidence,
                },
                leakageDetected,
                leakageViolations,
            };
        } catch {
            return null;
        }
    }, [state.output, analysis, userMessage]);

    if (!state.output && !state.isLoading) {
        return (
            <div className="w-full h-full flex items-center justify-center opacity-70 text-xs text-text-muted">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                    <div>No Singularity pipeline captured for this turn.</div>
                </div>
            </div>
        );
    }

    if (state.isLoading && !state.output) {
        return (
            <div className="w-full h-full flex items-center justify-center opacity-70 text-xs text-text-muted">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                    <div>Running Concierge pipeline…</div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto relative custom-scrollbar p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🕳️</span>
                    <div>
                        <div className="text-sm font-semibold">Concierge Pipeline</div>
                        <div className="text-xs text-text-muted">Stance, prompt, response, leakage for this turn</div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => setShowPrompt((v) => !v)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border-subtle hover:bg-surface-highlight/10"
                >
                    {showPrompt ? "Hide Prompt" : "Show Prompt"}
                </button>
            </div>

            <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                    <div>
                        <div className="text-text-muted">Provider</div>
                        <div className="font-mono text-[11px] truncate">
                            {state.providerId || state.output?.providerId || "unknown"}
                        </div>
                    </div>
                    <div>
                        <div className="text-text-muted">Timestamp</div>
                        <div className="font-mono text-[11px]">
                            {new Date(state.output?.timestamp || Date.now()).toLocaleTimeString()}
                        </div>
                    </div>
                    <div>
                        <div className="text-text-muted">Leakage</div>
                        <div className="font-mono text-[11px]">
                            {state.output?.leakageDetected ? "Detected" : "None"}
                        </div>
                    </div>
                    <div>
                        <div className="text-text-muted">Shape</div>
                        <div className="font-mono text-[11px]">
                            {pipeline?.structuralShape?.primary || "—"}
                        </div>
                    </div>
                </div>

                <details open className="bg-surface border border-border-subtle rounded-lg p-3">
                    <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
                        <span>Stance Selection</span>
                    </summary>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                        <div>
                            <div className="text-text-muted">Stance</div>
                            <div className="font-mono">
                                {pipeline?.stance || "default"}
                            </div>
                        </div>
                        <div>
                            <div className="text-text-muted">Reason</div>
                            <div className="font-mono">
                                {pipeline?.stanceReason || "n/a"}
                            </div>
                        </div>
                        <div>
                            <div className="text-text-muted">Confidence</div>
                            <div className="font-mono">
                                {pipeline?.stanceConfidence != null ? pipeline.stanceConfidence.toFixed(2) : "—"}
                            </div>
                        </div>
                    </div>
                </details>

                {showPrompt && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-4">
                        <div className="text-sm font-semibold border-b border-border-subtle pb-2">Active Prompt</div>
                        <div className="bg-surface-raised border border-border-subtle rounded-lg p-4 font-mono text-[10px] whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
                            {pipeline?.prompt || "Prompt not captured"}
                        </div>
                    </div>
                )}

                <div className="space-y-3">
                    <div className="text-sm font-semibold border-b border-border-subtle pb-2">Final Concierge Response</div>
                    <div className="bg-surface-raised border border-border-subtle rounded-xl p-4 min-h-[100px] shadow-sm">
                        {state.output?.text ? (
                            <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-gray-900/50">
                                <MarkdownDisplay content={state.output.text} />
                            </div>
                        ) : (
                            <div className="h-24 flex items-center justify-center text-text-muted italic">
                                Awaiting response...
                            </div>
                        )}
                    </div>
                </div>

                {pipeline?.leakageDetected && pipeline?.leakageViolations?.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 animate-pulse">
                        <div className="text-sm font-bold text-red-400 mb-2 flex items-center gap-2">
                            <span>⚠️ MACHINERY LEAKAGE DETECTED</span>
                        </div>
                        <div className="text-[11px] text-red-300/80 mb-2">The model explicitly referenced internal structural analysis or prompt instructions.</div>
                        <ul className="list-disc list-inside space-y-1">
                            {pipeline.leakageViolations.map((v: string, idx: number) => (
                                <li key={idx} className="text-[11px] text-red-400 font-mono italic">"{v}"</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};
