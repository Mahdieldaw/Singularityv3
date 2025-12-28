import React, { useState, useMemo, useEffect } from 'react';
import { GauntletOutput } from '../../../shared/contract';
import { motion, AnimatePresence } from 'framer-motion';
import { useAtomValue, useSetAtom } from 'jotai';
import { selectedModelsAtom, activeSplitPanelAtom } from '../../state/atoms';
import { LLM_PROVIDERS_CONFIG } from '../../constants';
import type { CognitiveTransitionOptions } from '../../hooks/cognitive/useCognitiveMode';
import { AntagonistOutputState } from '../../hooks/useAntagonistOutput';
import { RefinerOutput } from '../../../shared/parsing-utils';
import { AiTurn } from '../../types';
import RefinerDot from '../refinerui/RefinerDot';
import AntagonistCard from '../antagonist/AntagonistCard';

// Icons
const ChevronDown = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6" /></svg>
);
const ChevronRight = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m9 18 6-6-6-6" /></svg>
);
const ShieldCheck = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></svg>
);
const Skull = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12.5 17-.5-1-.5 1h1z" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><path d="M8 17h8" /><path d="M12 2a10 10 0 0 0-9.95 9h19.9A10 10 0 0 0 12 2z" /></svg>
);
const CopyIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
);
const CheckIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 6 9 17l-5-5" /></svg>
);
const Sparkles = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" /></svg>
);
const Wind = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M17.7 7.7A2.5 2.5 0 1 1 20 12h-3.3" /><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" /></svg>
);

interface GauntletOutputViewProps {
    output: GauntletOutput;
    onRefine?: (options?: CognitiveTransitionOptions) => void;
    onAntagonist?: (options?: CognitiveTransitionOptions) => void;
    isLoading?: boolean;
    refinerState: { output: RefinerOutput | null; isLoading: boolean };
    antagonistState: AntagonistOutputState;
    aiTurn: AiTurn;
}

const GauntletOutputView: React.FC<GauntletOutputViewProps> = ({ 
    output,
    onRefine,
    onAntagonist,
    isLoading = false,
    refinerState,
    antagonistState,
    aiTurn
}) => {
    const [survivorsOpen, setSurvivorsOpen] = useState(false);
    const [eliminatedOpen, setEliminatedOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const selectedModels = useAtomValue(selectedModelsAtom);
    const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);

    const availableProviders = useMemo(() => {
        const enabled = LLM_PROVIDERS_CONFIG.filter((p) => !!selectedModels?.[p.id]);
        return enabled.length > 0 ? enabled : LLM_PROVIDERS_CONFIG;
    }, [selectedModels]);

    const [nextProviderId, setNextProviderId] = useState<string>(() => availableProviders[0]?.id || "gemini");

    useEffect(() => {
        if (!availableProviders.some((p) => p.id === nextProviderId)) {
            setNextProviderId(availableProviders[0]?.id || "gemini");
        }
    }, [availableProviders, nextProviderId]);

    const handleCopySouvenir = () => {
        if (output.souvenir) {
            navigator.clipboard.writeText(output.souvenir);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!output.the_answer.statement && !output.souvenir) {
        return <div className="p-4 text-text-secondary italic">Gauntlet is empty.</div>;
    }

    const refinerOutput = refinerState.output;

    return (
        <div className="flex flex-col gap-6 p-1 max-w-full overflow-hidden text-sm">
            {/* HER0 - THE ANSWER */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-base border border-border-subtle rounded-xl p-5 shadow-sm relative overflow-hidden"
            >
                {/* Decorative background glow */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

                <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex flex-col gap-1">
                        <h2 className="text-lg font-semibold text-text-primary tracking-tight m-0">The Answer</h2>
                        <div className="flex items-center gap-2 text-xs font-mono text-text-tertiary bg-surface-highlight/50 px-2 py-1 rounded w-fit">
                            <span>Confidence</span>
                            <span className="text-accent-primary tracking-widest font-bold">{output.confidence.display}</span>
                        </div>
                    </div>
                    <RefinerDot 
                        refiner={refinerOutput} 
                        isLoading={refinerState.isLoading} 
                        onClick={() => setActiveSplitPanel({ turnId: aiTurn.id, providerId: '__trust__' })}
                    />
                </div>

                <div className="prose prose-sm max-w-none text-text-primary mb-4">
                    <p className="font-medium text-base leading-relaxed">{output.the_answer.statement}</p>
                    <p className="text-text-secondary leading-relaxed mt-2 opacity-90">{output.the_answer.reasoning}</p>
                </div>

                {output.the_answer.next_step && (
                    <div className="bg-surface-highlight/30 border-l-2 border-accent-primary pl-3 py-2 mt-4">
                        <span className="text-xs uppercase tracking-wider font-semibold text-accent-primary block mb-1">Next Step</span>
                        <p className="text-text-primary">{output.the_answer.next_step}</p>
                    </div>
                )}
            </motion.div>

            {/* REFINER INLINE SIGNALS (GEM / ECHO / NEXT) */}
            {refinerOutput && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {refinerOutput.gem && (
                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Sparkles className="text-amber-500" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-amber-600">The Insight</span>
                                </div>
                                <p className="text-text-primary font-medium leading-normal mb-1">
                                    {refinerOutput.gem.insight}
                                </p>
                                {refinerOutput.gem.impact && (
                                    <p className="text-xs text-text-secondary italic">
                                        {refinerOutput.gem.impact}
                                    </p>
                                )}
                            </div>
                        )}
                        {refinerOutput.outlier && (
                            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Wind className="text-indigo-500" />
                                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Contrarian View</span>
                                </div>
                                <p className="text-text-primary font-medium leading-normal mb-1">
                                    {refinerOutput.outlier.position}
                                </p>
                                {refinerOutput.outlier.why && (
                                    <p className="text-xs text-text-secondary italic">
                                        {refinerOutput.outlier.why}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {refinerOutput.leap && refinerOutput.leap.action && (
                        <div className="bg-brand-500/10 border border-brand-500/20 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-2 h-2 rounded-full bg-brand-400" />
                                <span className="text-xs font-bold text-brand-400 uppercase tracking-wider">Refiner's Next Move</span>
                            </div>
                            <div className="text-sm font-bold text-text-primary mb-1">
                                {refinerOutput.leap.action}
                            </div>
                            {refinerOutput.leap.rationale && (
                                <div className="text-xs text-text-secondary italic">
                                    {refinerOutput.leap.rationale}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* SECTIONS GRID */}
            <div className="grid grid-cols-1 gap-4">

                {/* SURVIVORS */}
                <div className="border border-border-subtle rounded-lg bg-surface-base/50 overflow-hidden">
                    <button
                        onClick={() => setSurvivorsOpen(!survivorsOpen)}
                        className="w-full flex items-center justify-between p-3 hover:bg-surface-highlight/50 transition-colors text-left"
                    >
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="text-green-500" />
                            <span className="font-medium text-text-primary">Survivors</span>
                            <span className="text-xs text-text-tertiary bg-surface-highlight px-1.5 py-0.5 rounded-full">
                                {1 + output.survivors.supporting.length + output.survivors.conditional.length}
                            </span>
                        </div>
                        {survivorsOpen ? <ChevronDown className="text-text-tertiary" /> : <ChevronRight className="text-text-tertiary" />}
                    </button>

                    <AnimatePresence>
                        {survivorsOpen && (
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: 'auto' }}
                                exit={{ height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-3 pt-0 flex flex-col gap-3">
                                    <div className="bg-green-500/10 border border-green-500/20 rounded p-3">
                                        <div className="text-xs font-semibold text-green-600 mb-1">PRIMARY CLAIM</div>
                                        <div className="text-text-primary mb-1">{output.survivors.primary.claim}</div>
                                        <div className="text-xs text-text-secondary italic">Survived because: {output.survivors.primary.survived_because}</div>
                                    </div>

                                    {output.survivors.supporting.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-mono text-text-tertiary uppercase">Supporting</div>
                                            {output.survivors.supporting.map((s, i) => (
                                                <div key={i} className="pl-3 border-l border-border-subtle text-sm">
                                                    <span className="text-text-primary">{s.claim}</span>
                                                    <span className="text-text-tertiary ml-2 text-xs">({s.relationship})</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {output.survivors.conditional.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-mono text-text-tertiary uppercase">Conditional</div>
                                            {output.survivors.conditional.map((s, i) => (
                                                <div key={i} className="pl-3 border-l border-orange-500/30 text-sm">
                                                    <span className="text-text-primary">{s.claim}</span>
                                                    <span className="text-orange-500/80 ml-2 text-xs">IF {s.condition}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ELIMINATED */}
                <div className="border border-border-subtle rounded-lg bg-surface-base/50 overflow-hidden">
                    <button
                        onClick={() => setEliminatedOpen(!eliminatedOpen)}
                        className="w-full flex items-center justify-between p-3 hover:bg-surface-highlight/50 transition-colors text-left"
                    >
                        <div className="flex items-center gap-2">
                            <Skull className="text-red-500" />
                            <span className="font-medium text-text-primary">Eliminated</span>
                            <span className="text-xs text-text-tertiary bg-surface-highlight px-1.5 py-0.5 rounded-full">
                                {output.eliminated.from_consensus.length + output.eliminated.from_outliers.length}
                            </span>
                        </div>
                        {eliminatedOpen ? <ChevronDown className="text-text-tertiary" /> : <ChevronRight className="text-text-tertiary" />}
                    </button>

                    <AnimatePresence>
                        {eliminatedOpen && (
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: 'auto' }}
                                exit={{ height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-3 pt-0 flex flex-col gap-3">
                                    {output.eliminated.from_consensus.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-mono text-text-tertiary uppercase">From Consensus</div>
                                            {output.eliminated.from_consensus.map((e, i) => (
                                                <div key={i} className="flex gap-2 items-start text-sm group">
                                                    <span className="text-text-tertiary line-through decoration-red-500/50 decoration-2">{e.claim}</span>
                                                    <span className="text-red-500 text-xs mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap">killed: {e.killed_because}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {output.eliminated.from_outliers.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-mono text-text-tertiary uppercase">From Outliers</div>
                                            {output.eliminated.from_outliers.map((e, i) => (
                                                <div key={i} className="flex gap-2 items-start text-sm group">
                                                    <span className="text-text-tertiary line-through decoration-red-500/50 decoration-2">{e.claim}</span>
                                                    <span className="text-red-500 text-xs mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap">killed: {e.killed_because}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {output.eliminated.ghost && (
                                        <div className="bg-purple-500/5 border border-purple-500/10 rounded p-2 text-xs">
                                            <span className="font-semibold text-purple-600 mr-2">GHOST IDENTIFIED:</span>
                                            <span className="text-text-secondary">{output.eliminated.ghost}</span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

            </div>

            {/* ANTAGONIST INLINE */}
            {antagonistState.output && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <AntagonistCard 
                        aiTurn={aiTurn} 
                        activeProviderId={antagonistState.providerId || undefined}
                    />
                </div>
            )}

            {/* SOUVENIR */}
            {output.souvenir && (
                <div className="flex items-center justify-between bg-surface-highlight/30 rounded-lg py-2.5 px-3 border border-border-subtle/50">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <span className="text-lg">💎</span>
                        <span className="text-xs italic font-serif text-text-secondary truncate">"{output.souvenir}"</span>
                    </div>
                    <button
                        onClick={handleCopySouvenir}
                        className="text-text-tertiary hover:text-text-primary p-1.5 rounded transition-colors"
                        title="Copy takeaway"
                    >
                        {copied ? <CheckIcon className="text-green-500" /> : <CopyIcon />}
                    </button>
                </div>
            )}

            {/* CONTROLS */}
            <div className="flex items-center gap-3 bg-surface-raised border border-border-subtle rounded-xl px-3 py-2 mt-4">
                <div className="text-xs text-text-secondary">Model</div>
                <select
                    value={nextProviderId}
                    onChange={(e) => setNextProviderId(e.target.value)}
                    disabled={isLoading}
                    className="flex-1 bg-[#1a1b26] border border-border-subtle rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-brand-500 disabled:opacity-50 appearance-none"
                >
                    {availableProviders.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name}
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex gap-3 mt-2">
                <button
                    onClick={() => onRefine?.({ providerId: nextProviderId })}
                    disabled={isLoading}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-fuchsia-600 
                               hover:from-purple-500 hover:to-fuchsia-500 
                               text-white rounded-lg font-medium transition-all
                               disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    🔥 Challenge
                </button>
                <button
                    onClick={() => onAntagonist?.({ providerId: nextProviderId })}
                    disabled={isLoading}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-slate-700 to-slate-800 
                               hover:from-slate-600 hover:to-slate-700 
                               text-white rounded-lg font-medium transition-all
                               disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    ⏭️ Next
                </button>
            </div>
        </div>
    );
};

export default GauntletOutputView;