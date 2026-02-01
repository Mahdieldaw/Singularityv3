import React, { useMemo, useState } from 'react';
import { AiTurn } from '../../types';
import { useSingularityMode } from '../../hooks/cognitive/useCognitiveMode';
import SingularityOutputView from './SingularityOutputView';
import { SingularityOutputState } from '../../hooks/useSingularityOutput';
import { CouncilOrbs } from '../CouncilOrbs';
import { LLM_PROVIDERS_CONFIG } from '../../constants';
import { useAtomValue, useSetAtom } from 'jotai';
import { selectedModelsAtom, workflowProgressForTurnFamily, activeSplitPanelAtom, currentSessionIdAtom, turnStreamingStateFamily, isDecisionMapOpenAtom, providerErrorsForTurnFamily } from '../../state/atoms';
import { MetricsRibbon } from './MetricsRibbon';
import StructureGlyph from '../StructureGlyph';
import { computeProblemStructureFromArtifact, computeStructuralAnalysis } from '../../../src/core/PromptMethods';
import { MapperArtifact } from '../../../shared/contract';
import { TraversalGraphView } from '../traversal/TraversalGraphView';
import { PipelineErrorBanner } from '../PipelineErrorBanner';
import { useProviderActions } from '../../hooks/providers/useProviderActions';

interface CognitiveOutputRendererProps {
    aiTurn: AiTurn;
    singularityState: SingularityOutputState;
}

/**
 * Orchestrates the Singularity Response Flow:
 * 1. Batch Streaming: Orbs showing progress
 * 2. Mapper Ready: MetricsRibbon + StructureGlyph appear
 * 3. Concierge Ready: Singularity response crowns the view
 */
export const CognitiveOutputRenderer: React.FC<CognitiveOutputRendererProps> = ({
    aiTurn,
    singularityState,
}) => {
    const [viewOverride, setViewOverride] = useState<null | 'traverse' | 'response'>(null);
    const { runSingularity } = useSingularityMode(aiTurn.id);
    const mappingArtifact = (aiTurn as any)?.mapping?.artifact || null;
    const effectiveMapperArtifact = useMemo(() => {
        if (aiTurn.mapperArtifact) return aiTurn.mapperArtifact;
        if (!mappingArtifact) return undefined;
        return {
            claims: mappingArtifact.semantic?.claims || [],
            edges: mappingArtifact.semantic?.edges || [],
            conditionals: mappingArtifact.semantic?.conditionals || [],
            narrative: mappingArtifact.semantic?.narrative,
            traversalGraph: mappingArtifact.traversal?.graph || null,
            forcingPoints: mappingArtifact.traversal?.forcingPoints || null,
            shadow: {
                statements: mappingArtifact.shadow?.statements || [],
                audit: mappingArtifact.shadow?.audit || {},
                topUnreferenced: [],
            },
        } as MapperArtifact;
    }, [aiTurn.mapperArtifact, mappingArtifact]);

    // Derived transition state
    const isTransitioning = singularityState.isLoading;

    // Helper for recomputing singularity
    const triggerAndSwitch = async (options: any = {}) => {
        setViewOverride('response');
        if (options.providerId) {
            singularityState.setPinnedProvider(options.providerId);
        }
        await runSingularity(aiTurn.id, { ...options, isRecompute: true, sourceTurnId: aiTurn.id });
    };

    const selectedModels = useAtomValue(selectedModelsAtom);
    const workflowProgress = useAtomValue(workflowProgressForTurnFamily(aiTurn.id));
    const streamingState = useAtomValue(turnStreamingStateFamily(aiTurn.id));
    const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
    const setDecisionMapOpen = useSetAtom(isDecisionMapOpenAtom);
    const currentSessionId = useAtomValue(currentSessionIdAtom);
    const effectiveSessionId = currentSessionId || aiTurn.sessionId;
    const providerErrors = useAtomValue(providerErrorsForTurnFamily(aiTurn.id));
    const { handleRetryProvider } = useProviderActions(effectiveSessionId || undefined, aiTurn.id);

    const hasSingularityText = useMemo(() => {
        return String(singularityState.output?.text || "").trim().length > 0;
    }, [singularityState.output]);

    const [isOrbTrayExpanded, setIsOrbTrayExpanded] = useState(false);

    const mapperProviderId = useMemo(() => {
        if (aiTurn.meta?.mapper) return String(aiTurn.meta.mapper);
        const keys = Object.keys(aiTurn.mappingResponses || {});
        return keys.length > 0 ? String(keys[0]) : null;
    }, [aiTurn.meta?.mapper, aiTurn.mappingResponses]);

    // Visible providers for orbs
    const visibleProviderIds = useMemo(() => {
        const keys = Object.keys(aiTurn?.batchResponses || {});
        if (keys.length > 0) return keys;
        return LLM_PROVIDERS_CONFIG.filter(p => !!selectedModels?.[p.id]).map(p => p.id);
    }, [aiTurn, selectedModels]);

    const orbProviderIds = useMemo(() => {
        const ids = [
            ...visibleProviderIds,
            ...(mapperProviderId ? [String(mapperProviderId)] : []),
        ].filter(Boolean).map(String);
        return Array.from(new Set(ids));
    }, [mapperProviderId, visibleProviderIds]);

    const orbVoiceProviderId = useMemo(() => {
        const fromMeta = mapperProviderId ? String(mapperProviderId) : null;
        if (fromMeta) return fromMeta;
        const fromMapping = Object.keys(aiTurn.mappingResponses || {})[0];
        if (fromMapping) return String(fromMapping);
        return orbProviderIds[0] ? String(orbProviderIds[0]) : null;
    }, [mapperProviderId, aiTurn.mappingResponses, orbProviderIds]);

    const isWorkflowSettled = useMemo(() => {
        const states = Object.values(workflowProgress || {});
        if (states.length === 0) return false;
        return states.every((p: any) => {
            const stage = String(p?.stage || 'idle');
            return stage === 'idle' || stage === 'complete';
        });
    }, [workflowProgress]);

    // Compute structural analysis
    const structuralAnalysis = useMemo(() => {
        if (!effectiveMapperArtifact) return undefined;
        try {
            return computeStructuralAnalysis(effectiveMapperArtifact as MapperArtifact);
        } catch (e) {
            return undefined;
        }
    }, [effectiveMapperArtifact]);

    const problemStructure = useMemo(() => {
        if (!effectiveMapperArtifact) return undefined;
        try {
            return computeProblemStructureFromArtifact(effectiveMapperArtifact as MapperArtifact);
        } catch {
            return undefined;
        }
    }, [effectiveMapperArtifact]);

    if (aiTurn.pipelineStatus === 'error') {
        const pipelineError = (aiTurn.meta as any)?.pipelineError;
        const metaRetryable = (aiTurn.meta as any)?.retryable;
        const retryable =
            typeof metaRetryable === "boolean"
                ? metaRetryable
                : (typeof (pipelineError as any)?.retryable === "boolean" ? (pipelineError as any).retryable : true);
        const failedProviderId = (aiTurn.meta as any)?.singularity || undefined;
        const errorMessage =
            typeof pipelineError === "string"
                ? pipelineError
                : ((pipelineError as any)?.message || "Pipeline failed unexpectedly");
        return (
            <div className="w-full max-w-3xl mx-auto animate-in fade-in duration-500">
                <div className="flex flex-col gap-6 mb-8">
                    <PipelineErrorBanner
                        type="singularity"
                        failedProviderId={failedProviderId}
                        onRetry={(pid) => triggerAndSwitch({ providerId: pid })}
                        errorMessage={errorMessage}
                        retryable={retryable}
                    />
                </div>
            </div>
        );
    }

    const isAwaitingTraversal = aiTurn.pipelineStatus === 'awaiting_traversal';
    const hasTraversalGraph = !!effectiveMapperArtifact?.traversalGraph && !!effectiveSessionId;
    const isPipelineComplete = !aiTurn.pipelineStatus || aiTurn.pipelineStatus === 'complete';
    const isRoundActive = streamingState.isLoading || isAwaitingTraversal;

    const canShowTraversal = hasTraversalGraph;
    const canShowResponse = isPipelineComplete && (hasSingularityText || singularityState.isLoading || singularityState.isError);

    const currentView: 'loading' | 'traverse' | 'response' = useMemo(() => {
        if (isAwaitingTraversal && canShowTraversal) return 'traverse';
        if (viewOverride === 'traverse' && canShowTraversal) return 'traverse';
        if (viewOverride === 'response' && canShowResponse) return 'response';
        if (canShowResponse) return 'response';
        return 'loading';
    }, [isAwaitingTraversal, canShowTraversal, viewOverride, canShowResponse]);

    const mappingFailure = useMemo(() => {
        if (!mapperProviderId) return null;
        const raw = (aiTurn.mappingResponses as any)?.[mapperProviderId];
        const arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
        const latest = arr.length > 0 ? arr[arr.length - 1] : null;
        if (!latest) return null;
        const status = String(latest.status || '');
        const isError = status === 'error' || status === 'failed' || status === 'skipped';
        if (!isError) return null;

        const metaError = (latest.meta as any)?.error;
        const metaRetryable = (latest.meta as any)?.retryable;
        const metaRequiresReauth = (latest.meta as any)?.requiresReauth;
        const classifiedError: any = (providerErrors as any)?.[mapperProviderId];
        const errorMessage =
            typeof metaError === 'string'
                ? metaError
                : (metaError?.message || classifiedError?.message || "Mapping failed.");
        const requiresReauth = !!(metaError?.requiresReauth ?? metaRequiresReauth ?? classifiedError?.requiresReauth);
        const retryable =
            typeof metaError?.retryable === "boolean"
                ? metaError.retryable
                : (typeof metaRetryable === "boolean" ? metaRetryable : (typeof classifiedError?.retryable === "boolean" ? classifiedError.retryable : undefined));

        return {
            providerId: String(mapperProviderId),
            errorMessage,
            requiresReauth,
            retryable,
        };
    }, [aiTurn.mappingResponses, mapperProviderId, providerErrors]);


    return (
        <div className="w-full max-w-3xl mx-auto animate-in fade-in duration-500">
            {/* === UNIFIED HEADER (Toggle + Orbs + Metrics) === */}
            <div className="flex flex-col gap-6 mb-8">
                <div className="flex justify-center">
                    <button
                        type="button"
                        onClick={() => setDecisionMapOpen({ turnId: aiTurn.id, tab: 'pipeline' })}
                        className="px-3 py-2 bg-surface-highlight border border-border-strong rounded-lg text-text-secondary cursor-pointer transition-all duration-200 hover:bg-surface-raised flex items-center gap-2"
                        aria-label="Open debug pipeline artifacts for this turn"
                    >
                        <span>Debug</span>
                    </button>
                </div>

                {canShowTraversal && canShowResponse && (
                    <div className="flex justify-center">
                        <button
                            onClick={() => setViewOverride(currentView === 'response' ? 'traverse' : 'response')}
                            className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-raised border border-border-subtle hover:bg-surface-highlight text-sm font-medium text-text-secondary transition-all shadow-sm"
                        >
                            <span>{currentView === 'response' ? '🧭' : '✨'}</span>
                            <span>{currentView === 'response' ? 'Back to Traverse' : 'Back to Response'}</span>
                        </button>
                    </div>
                )}

                {/* Council Orbs */}
                <div className="flex justify-center">
                    <div
                        onMouseEnter={() => setIsOrbTrayExpanded(true)}
                        onMouseLeave={() => setIsOrbTrayExpanded(false)}
                        className="transition-all duration-200"
                    >
                        <CouncilOrbs
                            providers={LLM_PROVIDERS_CONFIG}
                            turnId={aiTurn.id}
                            voiceProviderId={orbVoiceProviderId}
                            visibleProviderIds={
                                !isRoundActive && isWorkflowSettled && isPipelineComplete && !isOrbTrayExpanded
                                    ? (orbVoiceProviderId ? [String(orbVoiceProviderId)] : [])
                                    : orbProviderIds
                            }
                            variant={isRoundActive ? "tray" : "historical"}
                            workflowProgress={workflowProgress}
                            onOrbClick={(pid) => {
                                // Orbs strictly control the ModelResponsePanel selection, not the Singularity Main View
                                setActiveSplitPanel({ turnId: aiTurn.id, providerId: pid });
                            }}
                        />
                    </div>
                </div>

                {/* Structural Summary (Ribbon + Glyph) */}
                {isPipelineComplete && structuralAnalysis && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
                        <MetricsRibbon
                            artifact={aiTurn.mapperArtifact}
                            analysis={structuralAnalysis}
                            problemStructure={problemStructure}
                        />

                        {problemStructure && (
                            <div className="flex justify-center p-4 bg-surface-raised/30 rounded-xl border border-border-subtle/50">
                                <div className="flex flex-col items-center gap-2">
                                    <div className="text-[10px] uppercase tracking-widest text-text-muted font-bold">
                                        Structural Topology
                                    </div>
                                    <StructureGlyph
                                        pattern={problemStructure.primary}
                                        claimCount={effectiveMapperArtifact?.claims?.length || 0}
                                        width={320}
                                        height={140}
                                    />
                                    <div className="text-[11px] text-text-muted italic">
                                        {problemStructure.confidence > 0.7
                                            ? `High confidence ${problemStructure.primary} pattern detected`
                                            : `Emerging ${problemStructure.primary} structure`}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* === MAIN CONTENT AREA === */}
            {mappingFailure && currentView !== 'traverse' && (
                <div className="mb-6">
                    <PipelineErrorBanner
                        type="mapping"
                        failedProviderId={mappingFailure.providerId}
                        onRetry={(pid) => handleRetryProvider(pid, "mapping")}
                        errorMessage={mappingFailure.errorMessage}
                        requiresReauth={mappingFailure.requiresReauth}
                        retryable={mappingFailure.retryable}
                        onContinue={() => setViewOverride('response')}
                    />
                </div>
            )}
            {currentView === 'response' ? (
                <SingularityOutputView
                    aiTurn={aiTurn}
                    singularityState={singularityState}
                    onRecompute={triggerAndSwitch}
                    isLoading={isTransitioning}
                />
            ) : currentView === 'traverse' && canShowTraversal ? (
                <div className="animate-in fade-in duration-500">
                    <TraversalGraphView
                        traversalGraph={aiTurn.mapperArtifact!.traversalGraph!}
                        conditionals={aiTurn.mapperArtifact!.conditionals || []}
                        claims={aiTurn.mapperArtifact!.claims || []}
                        originalQuery={aiTurn.mapperArtifact!.query || ''}
                        sessionId={effectiveSessionId!}
                        aiTurnId={aiTurn.id}
                        pipelineStatus={aiTurn.pipelineStatus}
                        hasReceivedSingularityResponse={hasSingularityText}
                        onComplete={() => setViewOverride('response')}
                    />
                </div>
            ) : (
                <div className="animate-in fade-in duration-500">
                    <div className="flex flex-col items-center justify-center p-12 bg-surface-highlight/10 rounded-xl border border-dashed border-border-subtle">
                        <div className="text-3xl mb-4 animate-pulse">🧩</div>
                        <div className="text-text-secondary font-medium">
                            Gathering perspectives...
                        </div>
                        <div className="text-xs text-text-muted mt-2 text-center">
                            Exploring council outputs. Decision traversal will appear when ready.
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
