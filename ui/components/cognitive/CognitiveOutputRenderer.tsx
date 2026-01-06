import React, { useMemo } from 'react';
import { AiTurn, CognitiveViewMode } from '../../types';
import { useModeSwitching } from '../../hooks/cognitive/useModeSwitching';
import { ArtifactShowcase } from './ArtifactShowcase';
import TransitionBar from './TransitionBar';
import { useProviderActions } from '../../hooks/providers/useProviderActions';
import SingularityOutputView from './SingularityOutputView';
import { SingularityOutputState } from '../../hooks/useSingularityOutput';

interface CognitiveOutputRendererProps {
    aiTurn: AiTurn;
    singularityState: SingularityOutputState;
}

/**
 * The unified rendering hub for cognitive pipeline turns.
 * Manages the transition between the initial "Landscape" (PostMapper/ArtifactShowcase)
 * and specialized outcomes (Understand/Decide).
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

    const { handleRetryProvider } = useProviderActions(undefined, aiTurn.id);

    // Determine available modes based on turn data
    const availableModes = useMemo(() => {
        const modes: CognitiveViewMode[] = ['artifact'];
        if (aiTurn.singularityOutput || (aiTurn.singularityResponses && Object.keys(aiTurn.singularityResponses).length > 0)) {
            modes.push('singularity');
        }
        return modes;
    }, [aiTurn.singularityOutput, aiTurn.singularityResponses]);

    // Derived flags
    const hasSpecializedOutput = !!(aiTurn.singularityOutput || (aiTurn.singularityResponses && Object.keys(aiTurn.singularityResponses).length > 0));

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

            <div className="w-full">
                {activeMode === 'artifact' && (
                    <ArtifactShowcase
                        mapperArtifact={aiTurn.mapperArtifact || undefined}
                        analysis={aiTurn.exploreAnalysis || undefined}
                        turn={aiTurn}
                        onRetryMapping={(pid) => handleRetryProvider(pid)}
                        isLoading={isTransitioning}
                    />
                )}

                {/* Loading state for Singularity */}
                {isTransitioning && activeMode === 'singularity' && !singularityState.output && (
                    <div className="flex flex-col items-center justify-center p-12 bg-surface-highlight/10 rounded-xl border border-dashed border-border-subtle animate-pulse">
                        <div className="text-3xl mb-4">✨</div>
                        <div className="text-text-secondary font-medium">
                            Converging the Singularity...
                        </div>
                    </div>
                )}

                {activeMode === 'singularity' && (
                    <SingularityOutputView
                        aiTurn={aiTurn}
                        singularityState={singularityState}
                        onRecompute={(options) => triggerAndSwitch('singularity', options)}
                        isLoading={isTransitioning}
                    />
                )}
            </div>
        </div>
    );
};
