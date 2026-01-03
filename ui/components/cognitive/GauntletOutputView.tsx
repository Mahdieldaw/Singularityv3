import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { GauntletOutput } from '../../../shared/contract';
import { motion, AnimatePresence } from 'framer-motion';
import { useAtomValue, useSetAtom } from 'jotai';
import { selectedModelsAtom, activeSplitPanelAtom, isDecisionMapOpenAtom, chatInputValueAtom, includePromptInCopyAtom } from '../../state/atoms';
import { formatTurnForMd, formatAnalysisContextForMd } from '../../utils/copy-format-utils';
import { getLatestResponse } from '../../utils/turn-helpers';
import { CopyButton } from '../CopyButton';
import { getProviderName } from '../../utils/provider-helpers';
import { useProviderLimits } from '../../hooks/useProviderLimits';
import { LLM_PROVIDERS_CONFIG } from '../../constants';
import type { CognitiveTransitionOptions } from '../../hooks/cognitive/useCognitiveMode';
import { AntagonistOutputState } from '../../hooks/useAntagonistOutput';
import { RefinerOutput } from '../../../shared/parsing-utils';
import { AiTurn, ProviderResponse } from '../../types';
import RefinerDot from '../refinerui/RefinerDot';
import AntagonistCard from '../antagonist/AntagonistCard';
import clsx from 'clsx';

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
const MapIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><line x1="3" x2="21" y1="9" y2="9" /><line x1="9" x2="9" y1="21" y2="9" /></svg>
);

interface GauntletOutputViewProps {
    output: GauntletOutput;
    onRecompute?: (options?: CognitiveTransitionOptions) => void;
    onRefine?: (options?: CognitiveTransitionOptions) => void;
    onAntagonist?: (options?: CognitiveTransitionOptions) => void;
    isLoading?: boolean;
    refinerState: { output: RefinerOutput | null; isLoading: boolean };
    antagonistState: AntagonistOutputState;
    aiTurn: AiTurn;
}

const GauntletOutputView: React.FC<GauntletOutputViewProps> = ({
    output,
    onRecompute,
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
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const selectedModels = useAtomValue(selectedModelsAtom);
    const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
    const setIsDecisionMapOpen = useSetAtom(isDecisionMapOpenAtom);
    const setChatInputValue = useSetAtom(chatInputValueAtom);

    const availableProviders = useMemo(() => {
        const enabled = LLM_PROVIDERS_CONFIG.filter((p) => !!selectedModels?.[p.id]);
        return enabled.length > 0 ? enabled : LLM_PROVIDERS_CONFIG;
    }, [selectedModels]);

    const gauntletTabs = useMemo(() => {
        if (!aiTurn.gauntletResponses) return [];

        interface GauntletTab {
            id: string;
            providerId: string;
            index: number;
            label: string;
            response: ProviderResponse;
            isLatest: boolean;
            structuredOutput?: GauntletOutput;
        }

        const tabs: GauntletTab[] = [];
        const providerOrder = new Map(
            LLM_PROVIDERS_CONFIG.map((p, idx) => [String(p.id), idx] as const)
        );
        const providersWithResponses = Object.entries(aiTurn.gauntletResponses)
            .filter(([_, resps]) => Array.isArray(resps) && resps.length > 0);

        const sortedProviders = providersWithResponses.sort((a, b) => {
            const idxA = providerOrder.get(a[0]) ?? Number.POSITIVE_INFINITY;
            const idxB = providerOrder.get(b[0]) ?? Number.POSITIVE_INFINITY;
            if (idxA !== idxB) return idxA - idxB;
            return String(a[0]).localeCompare(String(b[0]));
        });

        sortedProviders.forEach(([pid, resps]) => {
            const name = getProviderName(pid);
            const respsArray = Array.isArray(resps) ? resps : [resps];
            const validResps = respsArray.filter((r) => {
                if (!r) return false;
                const hasText = typeof r.text === 'string' && r.text.trim().length > 0;
                const hasStatus = r.status === 'streaming' || r.status === 'pending' || r.status === 'error';
                const hasStructured = !!(r.meta as any)?.gauntletOutput;
                return hasText || hasStatus || hasStructured;
            });

            validResps.forEach((resp, idx) => {
                const count = validResps.length;
                const label = count > 1 ? `${name} ${idx + 1}` : name;
                const structuredOutput = (resp.meta as any)?.gauntletOutput as GauntletOutput | undefined;

                tabs.push({
                    id: `${pid}-${idx}`,
                    providerId: pid,
                    index: idx,
                    label,
                    response: resp,
                    isLatest: idx === validResps.length - 1,
                    structuredOutput,
                });
            });
        });

        return tabs;
    }, [aiTurn.gauntletResponses]);

    const [nextProviderId, setNextProviderId] = useState<string>(() => availableProviders[0]?.id || "gemini");

    useEffect(() => {
        if (!availableProviders.some((p) => p.id === nextProviderId)) {
            setNextProviderId(availableProviders[0]?.id || "gemini");
        }
    }, [availableProviders, nextProviderId]);

    useEffect(() => {
        if (gauntletTabs.length === 0) return;
        if (activeTabId && gauntletTabs.some((t) => t.id === activeTabId)) return;
        const latestWithOutput = [...gauntletTabs].reverse().find((t) => t.structuredOutput);
        const target = latestWithOutput || gauntletTabs[gauntletTabs.length - 1];
        setActiveTabId(target.id);
    }, [gauntletTabs, activeTabId]);

    const activeTab = useMemo(() => {
        if (gauntletTabs.length === 0) return null;
        return gauntletTabs.find((t) => t.id === activeTabId) || gauntletTabs[gauntletTabs.length - 1];
    }, [gauntletTabs, activeTabId]);

    useEffect(() => {
        if (activeTab) {
            setNextProviderId(activeTab.providerId);
        }
    }, [activeTab]);

    const activeOutput: GauntletOutput = useMemo(() => {
        const fromTab = activeTab?.structuredOutput;
        if (fromTab) return fromTab;
        return output;
    }, [activeTab, output]);

    const actualProviderId = useMemo(() => {
        if (activeTab) return activeTab.providerId;
        if (!aiTurn?.gauntletResponses) return null;
        const keys = Object.keys(aiTurn.gauntletResponses);
        return keys.length > 0 ? keys[0] : null;
    }, [activeTab, aiTurn]);

    const actualProviderName = actualProviderId ? getProviderName(actualProviderId) : "";

    const includePromptInCopy = useAtomValue(includePromptInCopyAtom);

    const handleCopyGauntlet = useCallback(() => {
        const providerName = actualProviderName || getProviderName(nextProviderId);
        const md = formatAnalysisContextForMd(activeOutput, providerName);
        navigator.clipboard.writeText(md);
    }, [activeOutput, nextProviderId, actualProviderName]);

    const handleCopyTurn = useCallback(() => {
        // Gather Batch Responses (latest for each provider)
        const batchResponses: Record<string, ProviderResponse> = {};
        Object.entries(aiTurn.batchResponses || {}).forEach(([pid, resps]) => {
            const latest = getLatestResponse(resps);
            if (latest) batchResponses[pid] = latest;
        });

        // Mapping Data
        const activeMapperPid = aiTurn.meta?.mapper || Object.keys(aiTurn.mappingResponses || {})[0];
        const mapperResp = activeMapperPid ? getLatestResponse(aiTurn.mappingResponses?.[activeMapperPid]) : null;
        const decisionMap = mapperResp ? {
            narrative: mapperResp.text || "",
            options: (mapperResp.meta as any)?.allAvailableOptions || null,
            topology: (mapperResp.meta as any)?.graphTopology || null
        } : null;

        const userPrompt = (aiTurn as any)?.userPrompt ?? (aiTurn as any)?.prompt ?? null;

        const md = formatTurnForMd(
            aiTurn.id,
            userPrompt,
            activeOutput,
            nextProviderId, // Analysis Provider ID
            decisionMap,
            batchResponses,
            includePromptInCopy,
            refinerState.output,
            refinerState.isLoading ? null : aiTurn.refinerResponses && Object.keys(aiTurn.refinerResponses).length > 0 ? Object.keys(aiTurn.refinerResponses)[0] : null,
            antagonistState.output,
            antagonistState.providerId
        );
        navigator.clipboard.writeText(md);
    }, [aiTurn, output, nextProviderId, includePromptInCopy, refinerState, antagonistState]);

    const handleCopySouvenir = () => {
        if (activeOutput.souvenir) {
            navigator.clipboard.writeText(activeOutput.souvenir);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleRecomputeClick = () => {
        const hasExisting = !!aiTurn.gauntletResponses?.[nextProviderId]?.length;
        if (hasExisting) {
            setShowConfirm(true);
            return;
        }
        onRecompute?.({ providerId: nextProviderId, isRecompute: true, sourceTurnId: aiTurn.id });
    };

    if (!activeOutput.the_answer.statement && !activeOutput.souvenir) {
        return <div className="p-4 text-text-secondary italic">Gauntlet is empty.</div>;
    }

    const refinerOutput = refinerState.output;

    const [voidOpen, setVoidOpen] = useState(false);
    const [breakOpen, setBreakOpen] = useState(false);
    const [presumptionsOpen, setPresumptionsOpen] = useState(false);

    return (
        <>
        <div className="flex flex-col gap-5 p-1 max-w-full overflow-hidden text-sm">
            {/* HER0 - THE ANSWER */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-base border border-border-subtle rounded-xl p-5 shadow-sm relative overflow-hidden"
            >
                {/* Decorative background glow */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

                <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-semibold text-text-primary tracking-tight m-0">The Verdict</h2>
                            {actualProviderName && (
                                <span className="text-[11px] text-text-tertiary">by {actualProviderName}</span>
                            )}
                            {activeOutput.optimal_end && (
                                <div className="hidden sm:flex items-center gap-2 px-2 py-0.5 rounded-full bg-surface-highlight/50 border border-border-subtle/50">
                                    <span className="text-[10px] uppercase font-bold text-text-tertiary">Goal</span>
                                    <span className="text-xs text-text-secondary truncate max-w-[200px]" title={activeOutput.optimal_end}>{activeOutput.optimal_end}</span>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsDecisionMapOpen({ turnId: aiTurn.id })}
                            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-raised hover:bg-surface-highlight border border-border-subtle text-xs text-text-secondary transition-colors"
                            title="Open Decision Map"
                        >
                            <MapIcon className="w-3.5 h-3.5" />
                            <span>Map</span>
                        </button>

                        {/* Header with Refiner Indicators */}
                        <div className="flex items-center gap-1.5">
                            {/* Indicator dots - only show when refiner has findings */}
                            {refinerOutput?.the_one && (
                                <button
                                    onClick={() => setActiveSplitPanel({ turnId: aiTurn.id, providerId: '__trust__' })}
                                    className="w-2 h-2 rounded-full bg-amber-500/80 hover:bg-amber-400 transition-colors"
                                    title="Refiner found a missed insight"
                                />
                            )}
                            {refinerOutput?.the_echo && (
                                <button
                                    onClick={() => setActiveSplitPanel({ turnId: aiTurn.id, providerId: '__trust__' })}
                                    className="w-2 h-2 rounded-full bg-indigo-500/80 hover:bg-indigo-400 transition-colors"
                                    title="Refiner found an edge case"
                                />
                            )}
                            <RefinerDot
                                refiner={refinerOutput}
                                isLoading={refinerState.isLoading}
                                onClick={() => setActiveSplitPanel({ turnId: aiTurn.id, providerId: '__trust__' })}
                            />
                        </div>
                        <div className="border-l border-border-subtle h-4 mx-1" />
                        <CopyButton
                            onCopy={handleCopyGauntlet}
                            label="Copy Gauntlet Output"
                            variant="icon"
                        />
                    </div>
                </div>

                {/* COUNCIL ORBS (Historic View - Source Layer) */}


                {/* Mobile-only optimal end */}
                {activeOutput.optimal_end && (
                    <div className="sm:hidden mb-3 flex items-start gap-2 px-2 py-1.5 rounded-lg bg-surface-highlight/30 border border-border-subtle/30">
                        <span className="text-[10px] uppercase font-bold text-text-tertiary mt-0.5">Goal</span>
                        <span className="text-xs text-text-secondary leading-snug">{activeOutput.optimal_end}</span>
                    </div>
                )}

                <div className="prose prose-sm max-w-none text-text-primary mb-4">
                    <p className="font-medium text-base leading-relaxed">{activeOutput.the_answer.statement}</p>
                </div>

                {activeOutput.the_answer.next_step && (
                    <div className="bg-surface-highlight/30 border-l-2 border-accent-primary pl-3 py-2 mb-4">
                        <span className="text-xs uppercase tracking-wider font-semibold text-accent-primary block mb-1">Next Step</span>
                        <p className="text-text-primary">{activeOutput.the_answer.next_step}</p>
                    </div>
                )}

            </motion.div>

            {/* COGNITIVE ANCHORS ROW (The Void, Breaking Point, Presumptions) */}
            <div className="flex flex-col gap-1.5">

                {activeOutput.the_void && (
                    <div className="rounded-lg border border-fuchsia-500/15 bg-fuchsia-500/[0.03] overflow-hidden">
                        <button
                            onClick={() => setVoidOpen(!voidOpen)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-fuchsia-500/5 transition-colors"
                        >
                            {voidOpen ? <ChevronDown className="text-fuchsia-600/60 flex-shrink-0" /> : <ChevronRight className="text-fuchsia-600/60 flex-shrink-0" />}
                            <span className="text-xs font-medium text-fuchsia-700/70">The Void</span>
                            <span className="text-[11px] text-text-muted/70 ml-1">— Missing Dimension</span>
                        </button>
                        <AnimatePresence>
                            {voidOpen && (
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: 'auto' }}
                                    exit={{ height: 0 }}
                                    className="overflow-hidden"
                                >
                                <div className="px-3 pb-3 pt-0">
                                        <p className="text-sm text-text-primary leading-relaxed">{activeOutput.the_void}</p>
                                        <p className="text-[10px] text-text-muted/60 mt-2">What no surviving claim covers — the remaining gap toward the optimal end.</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {activeOutput.survivors.primary.breaking_point && (
                    <div className="rounded-lg border border-orange-500/15 bg-orange-500/[0.03] overflow-hidden">
                        <button
                            onClick={() => setBreakOpen(!breakOpen)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-orange-500/5 transition-colors"
                        >
                            {breakOpen ? <ChevronDown className="text-orange-600/60 flex-shrink-0" /> : <ChevronRight className="text-orange-600/60 flex-shrink-0" />}
                            <span className="text-xs font-medium text-orange-700/70">Breaking Point</span>
                            <span className="text-[11px] text-text-muted/70 ml-1">— Boundary Condition</span>
                        </button>
                        <AnimatePresence>
                            {breakOpen && (
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: 'auto' }}
                                    exit={{ height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-3 pb-3 pt-0">
                                        <p className="text-sm text-text-primary leading-relaxed">{activeOutput.survivors.primary.breaking_point}</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                {activeOutput.survivors.primary.presumptions && activeOutput.survivors.primary.presumptions.length > 0 && (
                    <div className="rounded-lg border border-blue-500/15 bg-blue-500/[0.03] overflow-hidden">
                        <button
                            onClick={() => setPresumptionsOpen(!presumptionsOpen)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-blue-500/5 transition-colors"
                        >
                            {presumptionsOpen ? <ChevronDown className="text-blue-600/60 flex-shrink-0" /> : <ChevronRight className="text-blue-600/60 flex-shrink-0" />}
                            <span className="text-xs font-medium text-blue-700/70">Presumptions</span>
                            <span className="text-[11px] text-text-muted/70 ml-1">— Required Reality</span>
                        </button>
                        <AnimatePresence>
                            {presumptionsOpen && (
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: 'auto' }}
                                    exit={{ height: 0 }}
                                    className="overflow-hidden"
                                >
                                    <div className="px-3 pb-3 pt-0">
                                        <ul className="list-disc list-inside space-y-1">
                                            {activeOutput.survivors.primary.presumptions.map((p, i) => (
                                                <li key={i} className="text-sm text-text-primary leading-relaxed">{p}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {/* REASONING DISCLOSURE - Outside hero, between anchors and trial summary */}
            <details className="text-xs text-text-tertiary group">
                <summary className="cursor-pointer hover:text-text-secondary flex items-center gap-1.5 py-2">
                    <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                    <span>Why this survived</span>
                </summary>
                <div className="pl-5 pb-3 space-y-2">
                    <p className="text-text-secondary leading-relaxed">{output.the_answer.reasoning}</p>
                    {activeOutput.confidence.notes && activeOutput.confidence.notes.length > 0 && (
                        <ul className="list-disc list-inside text-text-secondary/80 space-y-1">
                            {activeOutput.confidence.notes.map((note, i) => (
                                <li key={i}>{note}</li>
                            ))}
                        </ul>
                    )}
                </div>
            </details>

            {/* TRIAL SUMMARY - Horizontal */}
            <div className="grid grid-cols-2 gap-3">

                {/* SURVIVORS */}
                <div className="border border-border-subtle rounded-lg bg-surface-base/50 overflow-hidden">
                    <button
                        onClick={() => setSurvivorsOpen(!survivorsOpen)}
                        className="w-full flex items-center justify-between p-3 hover:bg-surface-highlight/50 transition-colors text-left"
                    >
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="text-green-500" />
                            <span className="font-medium text-text-primary text-sm">Survived</span>
                            <span className="text-xs text-text-tertiary bg-surface-highlight px-1.5 py-0.5 rounded-full">
                                {1 + activeOutput.survivors.supporting.length + activeOutput.survivors.conditional.length}
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
                                        <div className="text-[10px] font-bold text-green-600 mb-1 uppercase tracking-tight">PRIMARY CLAIM</div>
                                        <div className="text-text-primary text-xs mb-1 font-medium">{activeOutput.survivors.primary.claim}</div>
                                        <div className="text-[10px] text-text-secondary italic mb-2 leading-tight">Survived because: {activeOutput.survivors.primary.survived_because}</div>
                                        {activeOutput.survivors.primary.extent && (
                                            <div className="mt-2 pt-2 border-t border-green-500/20 text-[10px]">
                                                <span className="font-semibold text-green-700/70 uppercase tracking-wide">Extent:</span>
                                                <span className="text-text-secondary ml-1">{activeOutput.survivors.primary.extent}</span>
                                            </div>
                                        )}
                                    </div>

                                    {activeOutput.survivors.supporting.length > 0 && (
                                        <div className="space-y-1.5">
                                            <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Supporting</div>
                                            {activeOutput.survivors.supporting.map((s, i) => (
                                                <div key={i} className="pl-2 border-l border-border-subtle text-xs leading-tight">
                                                    <span className="text-text-primary">{s.claim}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {activeOutput.survivors.conditional.length > 0 && (
                                        <div className="space-y-1.5">
                                            <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Conditional</div>
                                            {activeOutput.survivors.conditional.map((s, i) => (
                                                <div key={i} className="pl-2 border-l border-orange-500/30 text-xs leading-tight">
                                                    <span className="text-text-primary">{s.claim}</span>
                                                    <div className="text-orange-500/80 text-[10px] font-medium mt-0.5">IF {s.condition}</div>
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
                            <span className="font-medium text-text-primary text-sm">Eliminated</span>
                            <span className="text-xs text-text-tertiary bg-surface-highlight px-1.5 py-0.5 rounded-full">
                                {activeOutput.eliminated.from_consensus.length + activeOutput.eliminated.from_outliers.length}
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
                                    {activeOutput.eliminated.from_consensus.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">From Consensus</div>
                                            {activeOutput.eliminated.from_consensus.map((e, i) => (
                                                <div key={i} className="flex flex-col gap-1 text-xs">
                                                    <span className="text-text-tertiary line-through decoration-red-500/30">{e.claim}</span>
                                                    <span className="text-red-500/70 text-[10px] italic">killed: {e.killed_because}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {activeOutput.eliminated.from_outliers.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">From Outliers</div>
                                            {activeOutput.eliminated.from_outliers.map((e, i) => (
                                                <div key={i} className="flex flex-col gap-1 text-xs">
                                                    <span className="text-text-tertiary line-through decoration-red-500/30">{e.claim}</span>
                                                    <span className="text-red-500/70 text-[10px] italic">killed: {e.killed_because}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {activeOutput.eliminated.ghost && (
                                        <div className="bg-purple-500/5 border border-purple-500/10 rounded p-2 text-[10px]">
                                            <span className="font-semibold text-purple-600 mr-2">GHOST:</span>
                                            <span className="text-text-secondary">{activeOutput.eliminated.ghost}</span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {antagonistState.output && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <AntagonistCard
                        aiTurn={aiTurn}
                        activeProviderId={antagonistState.providerId || undefined}
                        onUsePrompt={(text) => setChatInputValue(text)}
                    />
                </div>
            )}

            {activeOutput.souvenir && (
                <div className="flex items-center justify-between bg-surface-highlight/30 rounded-lg py-2.5 px-3 border border-border-subtle/50">
                    <div className="flex items-start gap-2">
                        <span className="text-lg flex-shrink-0 mt-0.5">💎</span>
                        <span className="text-xs italic font-serif text-text-secondary leading-relaxed">"{activeOutput.souvenir}"</span>
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

            {gauntletTabs.length > 0 && (
                <div className="relative z-10 flex gap-2 overflow-x-auto pb-4 px-2 mb-2 no-scrollbar border-b border-border-subtle/50">
                    {gauntletTabs.map((tab) => {
                        const isActive = tab.id === activeTabId;
                        const isStreaming = tab.response.status === 'streaming' || tab.response.status === 'pending';
                        const isError = tab.response.status === 'error';

                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTabId(tab.id)}
                                className={clsx(
                                    "relative px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap border",
                                    isActive
                                        ? "bg-surface-raised border-brand-400 text-text-primary shadow-sm"
                                        : "bg-transparent border-transparent text-text-muted hover:bg-surface-highlight hover:text-text-secondary"
                                )}
                            >
                                <span className="flex items-center gap-2">
                                    {tab.label}
                                    {isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-intent-warning animate-pulse" />}
                                    {isError && <span className="w-1.5 h-1.5 rounded-full bg-intent-danger" />}
                                </span>
                                {isActive && (
                                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-brand-500 rounded-t-full" />
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="flex items-center gap-3 bg-surface-raised border border-border-subtle rounded-xl px-3 py-2 mt-4">
                <div className="text-xs text-text-secondary">Model</div>
                <select
                    value={nextProviderId}
                    onChange={(e) => setNextProviderId(e.target.value)}
                    disabled={isLoading}
                    className="flex-1 bg-[#1a1b26] border border-border-subtle rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-brand-500 disabled:opacity-50 appearance-none"
                >
                    {availableProviders.map((p) => {
                        const estimatedLength = (activeOutput.the_answer.statement?.length || 0) + (activeOutput.the_void?.length || 0) + 3000;
                        const { isAllowed } = useProviderLimits(p.id, estimatedLength);
                        return (
                            <option key={p.id} value={p.id} disabled={!isAllowed}>
                                {p.name} {!isAllowed && "(Limit Exceeded)"}
                            </option>
                        );
                    })}
                </select>
                <button
                    onClick={handleRecomputeClick}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-xs rounded-md border border-border-subtle bg-surface-base text-text-secondary hover:text-text-primary hover:bg-surface-highlight/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Re-run
                </button>
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

            {/* Contextual Copy Turn Button */}
            <div className="mt-8 pt-4 border-t border-border-subtle/30">
                <CopyButton
                    onCopy={handleCopyTurn}
                    label="Copy Full Turn"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface-highlight border border-border-subtle text-xs text-text-secondary transition-all"
                >
                    <span>📋 Copy Turn</span>
                </CopyButton>
            </div>
        </div>

        {showConfirm && (
            <div
                className="fixed inset-0 bg-overlay-backdrop/70 flex items-center justify-center z-[1000]"
                onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        setShowConfirm(false);
                    }
                }}
            >
                <div className="bg-surface-modal border border-border-subtle rounded-2xl p-6 min-w-[360px] max-w-[480px] shadow-overlay">
                    <h3 className="m-0 mb-3 text-lg font-semibold text-text-primary">
                        Re-run Decide on this model?
                    </h3>
                    <p className="text-sm text-text-secondary mb-6">
                        This model already has a Decide result for this turn. Running again will create an additional tab.
                    </p>
                    <div className="flex gap-3 justify-end">
                        <button
                            onClick={() => setShowConfirm(false)}
                            className="px-4 py-2 bg-transparent border border-border-subtle rounded-lg text-text-muted text-sm font-medium cursor-pointer hover:bg-surface-highlight/40 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                setShowConfirm(false);
                                onRecompute?.({ providerId: nextProviderId, isRecompute: true, sourceTurnId: aiTurn.id });
                            }}
                            className="px-4 py-2 border rounded-lg text-sm font-medium bg-intent-warning text-white border-intent-warning cursor-pointer hover:bg-intent-warning/90 transition-all"
                        >
                            Yes, run again
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default GauntletOutputView;
