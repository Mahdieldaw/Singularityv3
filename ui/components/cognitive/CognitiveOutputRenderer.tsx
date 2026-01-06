import React, { useMemo, useEffect, useState } from 'react';
import { AiTurn } from '../../types';
import { useModeSwitching } from '../../hooks/cognitive/useModeSwitching';
import SingularityOutputView from './SingularityOutputView';
import { SingularityOutputState } from '../../hooks/useSingularityOutput';
import { CouncilOrbs } from '../CouncilOrbs';
import { LLM_PROVIDERS_CONFIG } from '../../constants';
import { useAtomValue, useSetAtom } from 'jotai';
import { selectedModelsAtom, workflowProgressForTurnFamily, activeSplitPanelAtom, isDecisionMapOpenAtom } from '../../state/atoms';
import { parseMappingResponse } from '../../../shared/parsing-utils';
import { getLatestResponse } from '../../utils/turn-helpers';
import { getProviderName } from '../../utils/provider-helpers';
import MarkdownDisplay from '../MarkdownDisplay';
import { MapperMetricsPanel } from './MapperMetricsPanel';
import { computeProblemStructureFromArtifact, computeStructuralAnalysis } from '../../../src/core/PromptMethods';
import { MapperArtifact } from '../../../shared/contract';

interface CognitiveOutputRendererProps {
    aiTurn: AiTurn;
    singularityState: SingularityOutputState;
}

/**
 * Simplified Chat-like Cognitive Output Renderer
 * 
 * Flow:
 * 1. During batch streaming: Show council orbs loading + mapper narrative + metrics panel
 * 2. When singularity is ready: Automatically shift to singularity response (front and center)
 * 3. Toggle for power users to access mapper layer
 */
export const CognitiveOutputRenderer: React.FC<CognitiveOutputRendererProps> = ({
    aiTurn,
    singularityState
}) => {
    const {
        activeMode,
        setActiveMode,
        triggerAndSwitch,
        isTransitioning
    } = useModeSwitching(aiTurn.id);

    // removed unused handleRetryProvider
    const selectedModels = useAtomValue(selectedModelsAtom);
    const workflowProgress = useAtomValue(workflowProgressForTurnFamily(aiTurn.id));
    const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
    const setIsDecisionMapOpen = useSetAtom(isDecisionMapOpenAtom);

    // Determine if singularity is ready
    const hasSingularityOutput = !!(
        aiTurn.singularityOutput ||
        (aiTurn.singularityResponses && Object.keys(aiTurn.singularityResponses).length > 0)
    );

    // Auto-switch to singularity when it becomes ready
    const [hasAutoSwitched, setHasAutoSwitched] = useState(false);
    useEffect(() => {
        if (hasSingularityOutput && !hasAutoSwitched && activeMode !== 'singularity') {
            setActiveMode('singularity');
            setHasAutoSwitched(true);
        }
    }, [hasSingularityOutput, hasAutoSwitched, activeMode, setActiveMode]);

    // Get mapper data for the interim view
    const activeMapperPid = useMemo(() => {
        if (aiTurn.meta?.mapper) return aiTurn.meta.mapper;
        const keys = Object.keys(aiTurn.mappingResponses || {});
        return keys.length > 0 ? keys[0] : null;
    }, [aiTurn.meta?.mapper, aiTurn.mappingResponses]);

    const latestMapping = useMemo(() => {
        if (!activeMapperPid) return null;
        return getLatestResponse((aiTurn.mappingResponses || {})[activeMapperPid]);
    }, [aiTurn.mappingResponses, activeMapperPid]);

    const mapperNarrative = useMemo(() => {
        const raw = String(latestMapping?.text || "");
        const parsed = parseMappingResponse(raw);
        return parsed.narrative || "";
    }, [latestMapping]);

    const mapperProviderName = useMemo(() => {
        return activeMapperPid ? getProviderName(activeMapperPid) : "";
    }, [activeMapperPid]);

    // Visible providers for orbs
    const visibleProviderIds = useMemo(() => {
        const keys = Object.keys(aiTurn?.batchResponses || {});
        if (keys.length > 0) return keys;
        return LLM_PROVIDERS_CONFIG.filter(p => !!selectedModels?.[p.id]).map(p => p.id);
    }, [aiTurn, selectedModels]);

    // Compute structural analysis for metrics panel
    const structuralAnalysis = useMemo(() => {
        if (!aiTurn.mapperArtifact) return undefined;
        try {
            return computeStructuralAnalysis(aiTurn.mapperArtifact as MapperArtifact);
        } catch (e) {
            console.warn("[CognitiveOutputRenderer] structural analysis failed:", e);
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

    // Determine current state
    const isStreaming = Object.values(workflowProgress).some(
        p => p.stage === 'thinking' || p.stage === 'streaming'
    );
    const showSingularity = hasSingularityOutput && activeMode === 'singularity';
    // removed unused showMapperLayer

    return (
        <div className="w-full max-w-3xl mx-auto animate-in fade-in duration-500">
            {/* Toggle between Singularity and Mapper layer */}
            {hasSingularityOutput && (
                <div className="flex items-center justify-center gap-1 p-1 mb-6 bg-surface-highlight/20 rounded-xl border border-border-subtle/50 w-fit mx-auto">
                    <button
                        onClick={() => setActiveMode('singularity')}
                        className={`
                            relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                            ${activeMode === 'singularity'
                                ? 'bg-surface-base text-text-primary shadow-sm border border-border-subtle'
                                : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-highlight/50'}
                        `}
                    >
                        <span>✨</span>
                        <span>Response</span>
                    </button>
                    <button
                        onClick={() => setActiveMode('artifact')}
                        className={`
                            relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                            ${activeMode === 'artifact'
                                ? 'bg-surface-base text-text-primary shadow-sm border border-border-subtle'
                                : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-highlight/50'}
                        `}
                    >
                        <span>🗺️</span>
                        <span>Analysis</span>
                    </button>
                </div>
            )}

            {/* === SINGULARITY VIEW (Front and Center) === */}
            {showSingularity && (
                <SingularityOutputView
                    aiTurn={aiTurn}
                    singularityState={singularityState}
                    onRecompute={(options) => triggerAndSwitch('singularity', options)}
                    isLoading={isTransitioning}
                />
            )}

            {/* === STREAMING/INTERIM VIEW: Council Orbs + Mapper Narrative + Metrics === */}
            {!showSingularity && (
                <div className="space-y-6">
                    {/* Council Orbs - Shows provider progress */}
                    <div className="flex justify-center">
                        <CouncilOrbs
                            providers={LLM_PROVIDERS_CONFIG}
                            turnId={aiTurn.id}
                            voiceProviderId={activeMapperPid || Object.keys(aiTurn.mappingResponses || {})[0] || null}
                            visibleProviderIds={visibleProviderIds}
                            variant={isStreaming ? "active" : "historical"}
                            workflowProgress={workflowProgress}
                            onOrbClick={(pid) => setActiveSplitPanel({ turnId: aiTurn.id, providerId: pid })}
                        />
                    </div>

                    {/* Mapper Metrics Panel (new component) */}
                    {structuralAnalysis && (
                        <MapperMetricsPanel
                            structuralAnalysis={structuralAnalysis}
                            problemStructure={problemStructure}
                            claimCount={aiTurn.mapperArtifact?.claims?.length || 0}
                            ghostCount={aiTurn.mapperArtifact?.ghosts?.length || 0}
                        />
                    )}

                    {/* Mapper Narrative */}
                    {mapperNarrative ? (
                        <div className="bg-surface-raised border border-border-subtle rounded-xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-border-subtle bg-surface-highlight/10 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg">📖</span>
                                    <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                                        The Landscape
                                    </span>
                                    {mapperProviderName && (
                                        <span className="text-[11px] text-text-tertiary">
                                            via {mapperProviderName}
                                        </span>
                                    )}
                                </div>
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
                            <div className="px-5 py-5 text-sm text-text-muted leading-relaxed">
                                <MarkdownDisplay content={mapperNarrative} />
                            </div>
                        </div>
                    ) : isStreaming ? (
                        <div className="flex flex-col items-center justify-center p-12 bg-surface-highlight/10 rounded-xl border border-dashed border-border-subtle">
                            <div className="text-3xl mb-4 animate-pulse">🧩</div>
                            <div className="text-text-secondary font-medium">
                                Gathering perspectives...
                            </div>
                            <div className="text-xs text-text-muted mt-2">
                                The council is deliberating
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-12 bg-surface-highlight/10 rounded-xl border border-dashed border-border-subtle">
                            <div className="text-3xl mb-4">🕳️</div>
                            <div className="text-text-secondary font-medium">
                                No analysis available
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
