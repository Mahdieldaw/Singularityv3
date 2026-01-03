import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { UnderstandOutput } from '../../../shared/contract';
import { motion, AnimatePresence } from 'framer-motion';
import { useAtomValue, useSetAtom } from 'jotai';
import { selectedModelsAtom, activeSplitPanelAtom, isDecisionMapOpenAtom, chatInputValueAtom, includePromptInCopyAtom } from '../../state/atoms';
import { formatTurnForMd, formatAnalysisContextForMd } from '../../utils/copy-format-utils';
import { getLatestResponse } from '../../utils/turn-helpers';
import { CopyButton } from '../CopyButton';
import { LLM_PROVIDERS_CONFIG } from '../../constants';
import type { CognitiveTransitionOptions } from '../../hooks/cognitive/useCognitiveMode';
import { AntagonistOutputState } from '../../hooks/useAntagonistOutput';
import { RefinerOutput } from '../../../shared/parsing-utils';
import { AiTurn, ProviderResponse } from '../../types';
import AntagonistCard from '../antagonist/AntagonistCard';
import RefinerDot from '../refinerui/RefinerDot';
import CognitiveAnchors from './CognitiveAnchors';
import { getProviderName } from '../../utils/provider-helpers';
import { useProviderLimits } from '../../hooks/useProviderLimits';
import clsx from 'clsx';

// Icons
const ChevronDown = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6" /></svg>
);
const ChevronRight = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m9 18 6-6-6-6" /></svg>
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

interface UnderstandOutputViewProps {
    output: UnderstandOutput;
    onRecompute?: (options?: CognitiveTransitionOptions) => void;
    onRefine?: (options?: CognitiveTransitionOptions) => void;
    onAntagonist?: (options?: CognitiveTransitionOptions) => void;
    isLoading?: boolean;
    refinerState: { output: RefinerOutput | null; isLoading: boolean };
    antagonistState: AntagonistOutputState;
    aiTurn: AiTurn;
}

const UnderstandOutputView: React.FC<UnderstandOutputViewProps> = ({
    output,
    onRecompute,
    onRefine,
    onAntagonist,
    isLoading = false,
    refinerState,
    antagonistState,
    aiTurn
}) => {
    const [longAnswerOpen, setLongAnswerOpen] = useState(true);
    const [copied, setCopied] = useState(false);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const selectedModels = useAtomValue(selectedModelsAtom);
    const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
    const setIsDecisionMapOpen = useSetAtom(isDecisionMapOpenAtom);
    const setChatInputValue = useSetAtom(chatInputValueAtom);
    const includePromptInCopy = useAtomValue(includePromptInCopyAtom);
    const availableProviders = useMemo(() => {
        const enabled = LLM_PROVIDERS_CONFIG.filter((p) => !!selectedModels?.[p.id]);
        return enabled.length > 0 ? enabled : LLM_PROVIDERS_CONFIG;
    }, [selectedModels]);

    const understandTabs = useMemo(() => {
        if (!aiTurn.understandResponses) return [];

        interface UnderstandTab {
            id: string;
            providerId: string;
            index: number;
            label: string;
            response: ProviderResponse;
            isLatest: boolean;
            structuredOutput?: UnderstandOutput;
        }

        const tabs: UnderstandTab[] = [];
        const providerOrder = new Map(
            LLM_PROVIDERS_CONFIG.map((p, idx) => [String(p.id), idx] as const)
        );
        const providersWithResponses = Object.entries(aiTurn.understandResponses)
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
                const hasStructured = !!(r.meta as any)?.understandOutput;
                return hasText || hasStatus || hasStructured;
            });

            validResps.forEach((resp, idx) => {
                const count = validResps.length;
                const label = count > 1 ? `${name} ${idx + 1}` : name;
                const structuredOutput = (resp.meta as any)?.understandOutput as UnderstandOutput | undefined;

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
    }, [aiTurn.understandResponses]);

    const [nextProviderId, setNextProviderId] = useState<string>(() => availableProviders[0]?.id || "gemini");

    useEffect(() => {
        if (!availableProviders.some((p) => p.id === nextProviderId)) {
            setNextProviderId(availableProviders[0]?.id || "gemini");
        }
    }, [availableProviders, nextProviderId]);

    useEffect(() => {
        if (understandTabs.length === 0) return;
        if (activeTabId && understandTabs.some((t) => t.id === activeTabId)) return;
        const latestWithOutput = [...understandTabs].reverse().find((t) => t.structuredOutput);
        const target = latestWithOutput || understandTabs[understandTabs.length - 1];
        setActiveTabId(target.id);
    }, [understandTabs, activeTabId]);

    const activeTab = useMemo(() => {
        if (understandTabs.length === 0) return null;
        return understandTabs.find((t) => t.id === activeTabId) || understandTabs[understandTabs.length - 1];
    }, [understandTabs, activeTabId]);

    useEffect(() => {
        if (activeTab) {
            setNextProviderId(activeTab.providerId);
        }
    }, [activeTab]);

    const activeOutput: UnderstandOutput = useMemo(() => {
        const fromTab = activeTab?.structuredOutput;
        if (fromTab) return fromTab;
        return output;
    }, [activeTab, output]);

    const actualProviderId = useMemo(() => {
        if (activeTab) return activeTab.providerId;
        if (!aiTurn?.understandResponses) return null;
        const keys = Object.keys(aiTurn.understandResponses);
        return keys.length > 0 ? keys[0] : null;
    }, [activeTab, aiTurn]);

    const actualProviderName = actualProviderId ? getProviderName(actualProviderId) : "";

    const handleCopyUnderstand = useCallback(() => {
        const providerName = actualProviderName || getProviderName(nextProviderId);
        const md = formatAnalysisContextForMd(activeOutput, providerName);
        navigator.clipboard.writeText(md);
    }, [activeOutput, nextProviderId, actualProviderName]);

    const handleCopyTurn = useCallback(() => {
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
    }, [aiTurn, activeOutput, nextProviderId, includePromptInCopy, refinerState, antagonistState]);

    const handleCopySouvenir = () => {
        if (activeOutput.souvenir) {
            navigator.clipboard.writeText(activeOutput.souvenir);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleRecomputeClick = () => {
        const hasExisting = !!aiTurn.understandResponses?.[nextProviderId]?.length;
        if (hasExisting) {
            setShowConfirm(true);
            return;
        }
        onRecompute?.({ providerId: nextProviderId, isRecompute: true, sourceTurnId: aiTurn.id });
    };

    if (!activeOutput.short_answer && !activeOutput.souvenir) {
        return <div className="p-4 text-text-secondary italic">Understanding output is empty.</div>;
    }

    const refinerOutput = refinerState.output;

    return (
        <>
        <div className="flex flex-col gap-6 p-1 max-w-full overflow-hidden text-sm">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-base border border-border-subtle rounded-xl p-5 shadow-sm relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

                <div className="flex items-start justify-between mb-4">
                    <div className="flex flex-col">
                        <h2 className="text-lg font-semibold text-text-primary tracking-tight m-0">The Understanding</h2>
                        {actualProviderName && (
                            <span className="text-[11px] text-text-tertiary">by {actualProviderName}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsDecisionMapOpen({ turnId: aiTurn.id })}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-raised hover:bg-surface-highlight border border-border-subtle text-xs text-text-secondary transition-colors"
                            title="Open Decision Map"
                        >
                            <MapIcon className="w-3.5 h-3.5" />
                            <span>Map</span>
                        </button>
                        <RefinerDot
                            refiner={refinerOutput}
                            isLoading={refinerState.isLoading}
                            onClick={() => setActiveSplitPanel({ turnId: aiTurn.id, providerId: '__trust__' })}
                        />
                        <div className="border-l border-border-subtle h-4 mx-1" />
                        <CopyButton
                            onCopy={handleCopyUnderstand}
                            label="Copy Understand Output"
                            variant="icon"
                        />
                    </div>
                </div>

                <div className="prose prose-sm max-w-none text-text-primary">
                    <p className="font-medium text-base leading-relaxed">{activeOutput.short_answer}</p>
                </div>
            </motion.div>

            <CognitiveAnchors
                one={activeOutput.the_one}
                echo={activeOutput.the_echo}
            />

            {antagonistState.output && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <AntagonistCard
                        aiTurn={aiTurn}
                        activeProviderId={antagonistState.providerId || undefined}
                        onUsePrompt={(text) => setChatInputValue(text)}
                    />
                </div>
            )}

            {activeOutput.long_answer && (
                <div className="border border-border-subtle rounded-lg bg-surface-base/50 overflow-hidden">
                    <button
                        onClick={() => setLongAnswerOpen(!longAnswerOpen)}
                        className="w-full flex items-center justify-between p-3 hover:bg-surface-highlight/50 transition-colors text-left"
                    >
                        <span className="font-medium text-text-primary flex items-center gap-2">
                            Deep Context
                            <span className="text-[10px] text-text-tertiary font-mono bg-surface-highlight px-1.5 py-0.5 rounded uppercase">Full Context</span>
                        </span>
                        {longAnswerOpen ? <ChevronDown className="text-text-tertiary" /> : <ChevronRight className="text-text-tertiary" />}
                    </button>

                    <AnimatePresence>
                        {longAnswerOpen && (
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: 'auto' }}
                                exit={{ height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-4 pt-0">
                                    <div className="prose prose-sm max-w-none text-text-primary leading-relaxed whitespace-pre-wrap opacity-90">
                                        {activeOutput.long_answer}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
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

            {understandTabs.length > 0 && (
                <div className="relative z-10 flex gap-2 overflow-x-auto pb-4 px-2 mb-2 no-scrollbar border-b border-border-subtle/50">
                    {understandTabs.map((tab) => {
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
                        const estimatedLength = (activeOutput.short_answer?.length || 0) + (activeOutput.long_answer?.length || 0) + 2000;
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
                        Re-run Understand on this model?
                    </h3>
                    <p className="text-sm text-text-secondary mb-6">
                        This model already has an Understand result for this turn. Running again will create an additional tab.
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

export default UnderstandOutputView;
