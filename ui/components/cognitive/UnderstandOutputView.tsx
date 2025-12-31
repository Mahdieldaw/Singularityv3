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
    const selectedModels = useAtomValue(selectedModelsAtom);
    const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
    const setIsDecisionMapOpen = useSetAtom(isDecisionMapOpenAtom);
    const setChatInputValue = useSetAtom(chatInputValueAtom);
    const includePromptInCopy = useAtomValue(includePromptInCopyAtom);
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

    // Copy Handlers
    const handleCopyUnderstand = useCallback(() => {
        const providerName = getProviderName(nextProviderId);
        const md = formatAnalysisContextForMd(output, providerName);
        navigator.clipboard.writeText(md);
    }, [output, nextProviderId]);

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
            output, // Analysis (Understand/Gauntlet)
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
        if (output.souvenir) {
            navigator.clipboard.writeText(output.souvenir);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!output.short_answer && !output.souvenir) {
        return <div className="p-4 text-text-secondary italic">Understanding output is empty.</div>;
    }

    const refinerOutput = refinerState.output;

    return (
        <div className="flex flex-col gap-6 p-1 max-w-full overflow-hidden text-sm">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-base border border-border-subtle rounded-xl p-5 shadow-sm relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

                <div className="flex items-start justify-between mb-4">
                    <h2 className="text-lg font-semibold text-text-primary tracking-tight m-0">The Understanding</h2>
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

                {/* COUNCIL ORBS (Historic View) */}


                <div className="prose prose-sm max-w-none text-text-primary">
                    <p className="font-medium text-base leading-relaxed">{output.short_answer}</p>
                </div>
            </motion.div>

            {/* COGNITIVE ANCHORS - Collapsed cards for The One & Echo */}
            <CognitiveAnchors
                one={output.the_one}
                echo={output.the_echo}
            />

            {/* ANTAGONIST INLINE */}
            {antagonistState.output && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <AntagonistCard
                        aiTurn={aiTurn}
                        activeProviderId={antagonistState.providerId || undefined}
                        onUsePrompt={(text) => setChatInputValue(text)}
                    />
                </div>
            )}

            {/* THE LONG ANSWER (Collapsible) */}
            {output.long_answer && (
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
                                        {output.long_answer}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* SOUVENIR */}
            {output.souvenir && (
                <div className="flex items-center justify-between bg-surface-highlight/30 rounded-lg py-2.5 px-3 border border-border-subtle/50">
                    <div className="flex items-start gap-2">
                        <span className="text-lg flex-shrink-0 mt-0.5">💎</span>
                        <span className="text-xs italic font-serif text-text-secondary leading-relaxed">"{output.souvenir}"</span>
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
                <button
                    onClick={() => onRecompute?.({ providerId: nextProviderId, isRecompute: true, sourceTurnId: aiTurn.id })}
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

            {/* Fixed Copy Turn Button */}
            <div className="fixed bottom-6 left-6 z-50">
                <CopyButton
                    onCopy={handleCopyTurn}
                    label="Copy Full Turn"
                    className="bg-surface/90 backdrop-blur-sm shadow-xl rounded-lg text-xs font-semibold px-4 py-2 border border-border-subtle hover:scale-105 transition-transform"
                >
                    📋 Copy Turn
                </CopyButton>
            </div>
        </div>
    );
};

export default UnderstandOutputView;
