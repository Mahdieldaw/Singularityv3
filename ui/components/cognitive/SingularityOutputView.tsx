import React from 'react';
import { AiTurn } from '../../types';
import MarkdownDisplay from '../MarkdownDisplay';
import { SectionHeader } from './SectionHeader';
import { SingularityOutputState } from '../../hooks/useSingularityOutput';

interface SingularityOutputViewProps {
    aiTurn: AiTurn;
    singularityState: SingularityOutputState;
    onRecompute: (options?: any) => void;
    isLoading?: boolean;
}

const SingularityOutputView: React.FC<SingularityOutputViewProps> = ({
    singularityState,
    onRecompute,
    isLoading
}) => {
    const { output } = singularityState;

    if (!output && !isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted italic gap-4">
                <span className="text-4xl filter grayscale opacity-20">🕳️</span>
                <span>No Singularity response generated for this turn.</span>
                <button
                    onClick={() => onRecompute()}
                    className="mt-4 px-6 py-2 rounded-full bg-brand-500/10 hover:bg-brand-500/20 text-brand-500 text-sm font-medium transition-colors border border-brand-500/20"
                >
                    Run Concierge
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Main Content Area */}
            <div className="flex flex-col lg:flex-row gap-8 items-start">
                <div className="flex-1 w-full min-w-0">
                    <SectionHeader
                        icon="✨"
                        title="The Singularity"
                        subtitle="Consolidated Expert Synthesis"
                        onAction={() => onRecompute()}
                        actionLabel="Recompute"
                    />

                    <div className="bg-surface border border-border-subtle rounded-2xl p-8 shadow-sm relative overflow-hidden mt-6">
                        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />

                        <div className="prose prose-lg dark:prose-invert max-w-none relative z-10">
                            <MarkdownDisplay content={output?.text || "Converging..."} />
                        </div>

                        {output?.leakageDetected && output.leakageViolations && (
                            <div className="mt-8 pt-6 border-t border-border-subtle/50 relative z-10">
                                <div className="flex items-center gap-2 text-amber-500 text-[10px] font-bold uppercase tracking-widest mb-3">
                                    <span>⚠️ Machinery Leakage</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {output.leakageViolations.map((v, i) => (
                                        <span key={i} className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-mono">
                                            {v}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Action Bar */}
                    <div className="mt-8 flex items-center justify-end gap-3">
                        <button
                            onClick={() => onRecompute({ stance: 'challenge' })}
                            className="group flex items-center gap-3 px-8 py-3 rounded-xl bg-surface-raised border border-border-subtle text-text-secondary font-semibold hover:bg-surface-highlight transition-all"
                        >
                            <span>Challenge Perspective</span>
                            <span className="text-xl group-hover:rotate-12 transition-transform">⚖️</span>
                        </button>
                        <button
                            onClick={() => onRecompute({ stance: 'decide' })}
                            className="group flex items-center gap-3 px-8 py-3 rounded-xl bg-brand-500 text-white font-semibold hover:bg-brand-600 transition-all shadow-glow-brand"
                        >
                            <span>Final Decision</span>
                            <span className="text-xl group-hover:translate-x-1 transition-transform">🚀</span>
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SingularityOutputView;
