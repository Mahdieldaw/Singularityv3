import React, { useMemo, useEffect, useState } from 'react';
import { AiTurn } from '../../types';
import { useSingularityMode } from '../../hooks/cognitive/useCognitiveMode';
import SingularityOutputView from './SingularityOutputView';
import { SingularityOutputState } from '../../hooks/useSingularityOutput';
import { CouncilOrbs } from '../CouncilOrbs';
import { LLM_PROVIDERS_CONFIG } from '../../constants';
import { useAtomValue, useSetAtom } from 'jotai';
import { selectedModelsAtom, workflowProgressForTurnFamily, activeSplitPanelAtom, isDecisionMapOpenAtom, currentSessionIdAtom, turnStreamingStateFamily } from '../../state/atoms';
import { MetricsRibbon } from './MetricsRibbon';
import StructureGlyph from '../StructureGlyph';
import { computeProblemStructureFromArtifact, computeStructuralAnalysis } from '../../../src/core/PromptMethods';
import { MapperArtifact } from '../../../shared/contract';
import { TraversalGraphView } from '../traversal/TraversalGraphView';

interface CognitiveOutputRendererProps {
    aiTurn: AiTurn;
    singularityState: SingularityOutputState;
    onArtifactSelect?: (artifact: { title: string; identifier: string; content: string }) => void;
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
    onArtifactSelect
}) => {
    const [activeMode, setActiveModeInternal] = useState<'artifact' | 'singularity'>('artifact');
    const { runSingularity } = useSingularityMode(aiTurn.id);

    // Derived transition state
    const isTransitioning = singularityState.isLoading;

    // Helper for recomputing singularity
    const triggerAndSwitch = async (options: any = {}) => {
        setActiveModeInternal('singularity');
        if (options.providerId) {
            singularityState.setPinnedProvider(options.providerId);
        }
        await runSingularity(aiTurn.id, options);
    };

    const selectedModels = useAtomValue(selectedModelsAtom);
    const workflowProgress = useAtomValue(workflowProgressForTurnFamily(aiTurn.id));
    const streamingState = useAtomValue(turnStreamingStateFamily(aiTurn.id));
    const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
    const setIsDecisionMapOpen = useSetAtom(isDecisionMapOpenAtom);
    const currentSessionId = useAtomValue(currentSessionIdAtom);

    const hasSingularityText = useMemo(() => {
        return String(singularityState.output?.text || "").trim().length > 0;
    }, [singularityState.output]);

    const [hasAutoSwitched, setHasAutoSwitched] = useState(false);
    const [hasUserOverride, setHasUserOverride] = useState(false);
    const [isOrbTrayExpanded, setIsOrbTrayExpanded] = useState(false);

    const setActiveMode = (mode: 'artifact' | 'singularity') => {
        setHasUserOverride(true);
        setActiveModeInternal(mode);
    };

    useEffect(() => {
        if (!hasSingularityText || hasAutoSwitched || hasUserOverride) return;
        if (aiTurn.pipelineStatus && aiTurn.pipelineStatus !== 'complete') return;
        if (activeMode !== 'singularity') {
            setActiveModeInternal('singularity');
        }
        setHasAutoSwitched(true);
    }, [hasSingularityText, hasAutoSwitched, hasUserOverride, activeMode, aiTurn.pipelineStatus]);

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
        if (!aiTurn.mapperArtifact) return undefined;
        try {
            return computeStructuralAnalysis(aiTurn.mapperArtifact as MapperArtifact);
        } catch (e) {
            return undefined;
        }
    }, [aiTurn.mapperArtifact]);

    const problemStructure = useMemo(() => {
        if (!aiTurn.mapperArtifact) return undefined;
        try {
            return computeProblemStructureFromArtifact(aiTurn.mapperArtifact as MapperArtifact);
        } catch {
            return undefined;
        }
    }, [aiTurn.mapperArtifact]);

    const isAwaitingTraversal = aiTurn.pipelineStatus === 'awaiting_traversal';
    const hasTraversalGraph = !!aiTurn.mapperArtifact?.traversalGraph && !!currentSessionId;
    const isPipelineComplete = !aiTurn.pipelineStatus || aiTurn.pipelineStatus === 'complete';
    const isRoundActive = streamingState.isLoading || isAwaitingTraversal;

    // Show Singularity if we have text AND mode is active...
    const showSingularity = hasSingularityText && activeMode === 'singularity' && isPipelineComplete;

    if (isAwaitingTraversal && hasTraversalGraph) {
        return (
            <div className="w-full max-w-3xl mx-auto animate-in fade-in duration-500">
                <TraversalGraphView
                    traversalGraph={aiTurn.mapperArtifact!.traversalGraph!}
                    forcingPoints={aiTurn.mapperArtifact!.forcingPoints || []}
                    claims={aiTurn.mapperArtifact!.claims || []}
                    originalQuery={aiTurn.mapperArtifact!.query || ''}
                    sessionId={currentSessionId!}
                    aiTurnId={aiTurn.id}
                    onComplete={() => {
                        setHasUserOverride(false);
                        setActiveModeInternal('singularity');
                    }}
                />
            </div>
        );
    }


    return (
        <div className="w-full max-w-3xl mx-auto animate-in fade-in duration-500">
            {/* === UNIFIED HEADER (Toggle + Orbs + Metrics) === */}
            <div className="flex flex-col gap-6 mb-8">
                {/* View Toggle */}
                {hasSingularityText && isPipelineComplete && (
                    <div className="flex justify-center">
                        <button
                            onClick={() => setActiveMode(showSingularity ? 'artifact' : 'singularity')}
                            className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface-raised border border-border-subtle hover:bg-surface-highlight text-sm font-medium text-text-secondary transition-all shadow-sm"
                        >
                            <span>{showSingularity ? '🗺️' : '✨'}</span>
                            <span>{showSingularity ? 'See Analysis' : 'Back to Response'}</span>
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
                            variant={isRoundActive ? "active" : "historical"}
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
                                        claimCount={aiTurn.mapperArtifact?.claims?.length || 0}
                                        width={320}
                                        height={140}
                                        onClick={() => setIsDecisionMapOpen({ turnId: aiTurn.id })}
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
            {showSingularity ? (
                <SingularityOutputView
                    aiTurn={aiTurn}
                    singularityState={singularityState}
                    onRecompute={triggerAndSwitch}
                    isLoading={isTransitioning}
                />
            ) : (
                /* === INTERIM / ANALYSIS BUBBLE === */
                <div className="animate-in fade-in duration-500">
                    {!isPipelineComplete && isRoundActive ? (
                        <div className="flex flex-col items-center justify-center p-12 bg-surface-highlight/10 rounded-xl border border-dashed border-border-subtle">
                            <div className="text-3xl mb-4 animate-pulse">🧩</div>
                            <div className="text-text-secondary font-medium">
                                Gathering perspectives...
                            </div>
                            <div className="text-xs text-text-muted mt-2 text-center">
                                Experts are deliberating. Analysis will appear shortly.
                            </div>
                        </div>
                    ) : isPipelineComplete && aiTurn.mapperArtifact ? (
                        <div className="bg-surface border border-border-subtle rounded-2xl overflow-hidden shadow-sm">
                            <div className="px-4 py-3 border-b border-border-subtle bg-surface-highlight/10 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">🧠</span>
                                    <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                                        Analysis
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {aiTurn.mapperArtifact && onArtifactSelect && (
                                        <button
                                            onClick={() => onArtifactSelect({
                                                title: "Mapper Artifact",
                                                identifier: `artifact-${aiTurn.id}`,
                                                content: JSON.stringify(aiTurn.mapperArtifact, null, 2)
                                            })}
                                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-raised hover:bg-surface-highlight border border-border-subtle text-xs text-text-secondary transition-colors"
                                            title="View Artifact"
                                        >
                                            <span>📄</span>
                                            <span>Artifact</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setIsDecisionMapOpen({ turnId: aiTurn.id })}
                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-raised hover:bg-surface-highlight border border-border-subtle text-xs text-text-secondary transition-colors"
                                        title="Open Decision Map"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                                            <line x1="3" x2="21" y1="9" y2="9" />
                                            <line x1="9" x2="9" y1="21" y2="9" />
                                        </svg>
                                        <span>Map</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
};
