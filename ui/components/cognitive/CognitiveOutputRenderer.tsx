import React, { useMemo } from 'react';
import { AiTurn, CognitiveViewMode } from '../../types';
import { useModeSwitching } from '../../hooks/cognitive/useModeSwitching';
import { ArtifactShowcase } from './ArtifactShowcase';
import UnderstandOutputView from './UnderstandOutputView';
import GauntletOutputView from './GauntletOutputView';
import TransitionBar from './TransitionBar';
import { PipelineErrorBanner } from '../PipelineErrorBanner';
import { AntagonistOutputState } from '../../hooks/useAntagonistOutput';
import { RefinerOutputState } from '../../hooks/useRefinerOutput';
import { useProviderActions } from '../../hooks/providers/useProviderActions';
import SingularityOutputView from './SingularityOutputView';
import { SingularityOutputState } from '../../hooks/useSingularityOutput';

interface CognitiveOutputRendererProps {
    aiTurn: AiTurn;
    refinerState: RefinerOutputState;
    antagonistState: AntagonistOutputState;
    singularityState: SingularityOutputState;
}

/**
 * The unified rendering hub for cognitive pipeline turns.
 * Manages the transition between the initial "Landscape" (PostMapper/ArtifactShowcase)
 * and specialized outcomes (Understand/Decide).
 */
export const CognitiveOutputRenderer: React.FC<CognitiveOutputRendererProps> = ({
    aiTurn,
    refinerState,
    antagonistState,
    singularityState
}) => {
    const {
        activeMode,
        setActiveMode,
        triggerAndSwitch,
        isTransitioning
    } = useModeSwitching(aiTurn.id);

    const { handleRetryProvider } = useProviderActions(undefined, aiTurn.id);

    // Determine available modes based on turn data
    const availableModes = useMemo(() => {
        const modes: CognitiveViewMode[] = ['artifact'];
        if (aiTurn.understandOutput) modes.push('understand');
        if (aiTurn.gauntletOutput) modes.push('gauntlet');
        if (aiTurn.singularityOutput || (aiTurn.singularityResponses && Object.keys(aiTurn.singularityResponses).length > 0)) modes.push('singularity');
        return modes;
    }, [aiTurn.understandOutput, aiTurn.gauntletOutput, aiTurn.singularityOutput, aiTurn.singularityResponses]);

    // Check for errors in specialized modes
    const understandErrorResponse = useMemo(() => {
        if (aiTurn.understandOutput) return null;
        const resps = Object.values(aiTurn.understandResponses || {}).flat();
        const latest = resps.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
        return latest?.status === 'error' ? latest : null;
    }, [aiTurn.understandResponses, aiTurn.understandOutput]);

    const gauntletErrorResponse = useMemo(() => {
        if (aiTurn.gauntletOutput) return null;
        const resps = Object.values(aiTurn.gauntletResponses || {}).flat();
        const latest = resps.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
        return latest?.status === 'error' ? latest : null;
    }, [aiTurn.gauntletResponses, aiTurn.gauntletOutput]);

    // Derived flags
    const hasSpecializedOutput = aiTurn.understandOutput || aiTurn.gauntletOutput || understandErrorResponse || gauntletErrorResponse;

    return (
        <div className="flex flex-col w-full">
            {/* Show TransitionBar if we have something to switch to or if we are already in a specialized mode */}
            {(hasSpecializedOutput || activeMode !== 'artifact') && (
                <TransitionBar
                    activeMode={activeMode}
                    onModeChange={setActiveMode}
                    availableModes={availableModes}
                    isLoading={isTransitioning}
                />
            )}

            {/* Rendering Logic */}
            <div className="w-full">
                {activeMode === 'artifact' && (
                    <ArtifactShowcase
                        mapperArtifact={aiTurn.mapperArtifact || undefined}
                        analysis={aiTurn.exploreAnalysis || undefined}
                        turn={aiTurn}
                        onUnderstand={(options) => triggerAndSwitch('understand', options)}
                        onDecide={(options) => triggerAndSwitch('gauntlet', options)}
                        onRetryMapping={(pid) => handleRetryProvider(pid)}
                        isLoading={isTransitioning}
                    />
                )}

                {activeMode === 'understand' && (
                    aiTurn.understandOutput ? (
                        <UnderstandOutputView
                            output={aiTurn.understandOutput}
                            onRecompute={(options) => triggerAndSwitch('understand', options)}
                            onRefine={(options) => triggerAndSwitch('refine', options)}
                            onAntagonist={(options) => triggerAndSwitch('antagonist', options)}
                            isLoading={isTransitioning}
                            refinerState={refinerState}
                            antagonistState={antagonistState}
                            aiTurn={aiTurn}
                        />
                    ) : understandErrorResponse ? (
                        <div className="py-8">
                            <PipelineErrorBanner
                                type="understand"
                                onRetry={() => handleRetryProvider(understandErrorResponse.providerId, 'understand')}
                                errorMessage={understandErrorResponse.meta?._rawError || "Analysis failed."}
                                requiresReauth={(understandErrorResponse as any).meta?.requiresReauth}
                                failedProviderId={understandErrorResponse.providerId}
                            />
                        </div>
                    ) : null
                )}

                {activeMode === 'gauntlet' && (
                    aiTurn.gauntletOutput ? (
                        <GauntletOutputView
                            output={aiTurn.gauntletOutput}
                            onRecompute={(options) => triggerAndSwitch('gauntlet', options)}
                            onRefine={(options) => triggerAndSwitch('refine', options)}
                            onAntagonist={(options) => triggerAndSwitch('antagonist', options)}
                            isLoading={isTransitioning}
                            refinerState={refinerState}
                            antagonistState={antagonistState}
                            aiTurn={aiTurn}
                        />
                    ) : gauntletErrorResponse ? (
                        <div className="py-8">
                            <PipelineErrorBanner
                                type="gauntlet"
                                onRetry={() => handleRetryProvider(gauntletErrorResponse.providerId, 'gauntlet')}
                                errorMessage={gauntletErrorResponse.meta?._rawError || "Gauntlet failed."}
                                requiresReauth={(gauntletErrorResponse as any).meta?.requiresReauth}
                                failedProviderId={gauntletErrorResponse.providerId}
                            />
                        </div>
                    ) : null
                )}

                {/* Loading state for specialized modes without data yet and NO error */}
                {isTransitioning && activeMode !== 'artifact' && !aiTurn.understandOutput && !aiTurn.gauntletOutput && !singularityState.output && !understandErrorResponse && !gauntletErrorResponse && (
                    <div className="flex flex-col items-center justify-center p-12 bg-surface-highlight/10 rounded-xl border border-dashed border-border-subtle animate-pulse">
                        <div className="text-3xl mb-4">
                            {activeMode === 'understand' ? '🧠' : activeMode === 'gauntlet' ? '⚖️' : '✨'}
                        </div>
                        <div className="text-text-secondary font-medium">
                            {activeMode === 'understand' ? 'Synthesizing Perspective...' : activeMode === 'gauntlet' ? 'Running the Gauntlet...' : 'Converging the Singularity...'}
                        </div>
                    </div>
                )}

                {activeMode === 'singularity' && (
                    <SingularityOutputView
                        aiTurn={aiTurn}
                        singularityState={singularityState}
                        antagonistState={antagonistState}
                        refinerState={refinerState}
                        onRecompute={(options) => triggerAndSwitch('singularity', options)}
                        onDecide={(options) => triggerAndSwitch('gauntlet', options)}
                        isLoading={isTransitioning}
                    />
                )}
            </div>
        </div>
    );
};
