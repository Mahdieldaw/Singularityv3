
import React, { useMemo, useEffect, useRef } from 'react';
import { AiTurn, CognitiveViewMode } from '../../types';
import { useModeSwitching } from '../../hooks/cognitive/useModeSwitching';
import { ArtifactShowcase } from './ArtifactShowcase';
import UnderstandOutputView from './UnderstandOutputView';
import GauntletOutputView from './GauntletOutputView';
import TransitionBar from './TransitionBar';
import { AntagonistOutputState } from '../../hooks/useAntagonistOutput';
import { RefinerOutput } from '../../../shared/parsing-utils';

interface CognitiveOutputRendererProps {
    aiTurn: AiTurn;
    refinerState: { output: RefinerOutput | null; isLoading: boolean };
    antagonistState: AntagonistOutputState;
}

/**
 * The unified rendering hub for cognitive pipeline turns.
 * Manages the transition between the initial "Landscape" (PostMapper/ArtifactShowcase)
 * and specialized outcomes (Understand/Decide).
 */
export const CognitiveOutputRenderer: React.FC<CognitiveOutputRendererProps> = ({ 
    aiTurn, 
    refinerState, 
    antagonistState 
}) => {
    const {
        activeMode,
        setActiveMode,
        triggerAndSwitch,
        isTransitioning
    } = useModeSwitching(aiTurn.id);

    // Determine available modes based on turn data
    const availableModes = useMemo(() => {
        const modes: CognitiveViewMode[] = ['artifact'];
        if (aiTurn.understandOutput) modes.push('understand');
        if (aiTurn.gauntletOutput) modes.push('gauntlet');
        return modes;
    }, [aiTurn.understandOutput, aiTurn.gauntletOutput]);

    // Track previous state to detect *new* data arrival
    const prevUnderstand = useRef(aiTurn.understandOutput);
    const prevGauntlet = useRef(aiTurn.gauntletOutput);

    // Auto-switch UI to the new mode ONLY when data newly arrives
    useEffect(() => {
        const hasUnderstand = !!aiTurn.understandOutput;
        const hadUnderstand = !!prevUnderstand.current;
        const hasGauntlet = !!aiTurn.gauntletOutput;
        const hadGauntlet = !!prevGauntlet.current;

        if (!hadUnderstand && hasUnderstand && activeMode === 'artifact') {
            setActiveMode('understand');
        } else if (!hadGauntlet && hasGauntlet && activeMode === 'artifact') {
            setActiveMode('gauntlet');
        }

        // Update refs
        prevUnderstand.current = aiTurn.understandOutput;
        prevGauntlet.current = aiTurn.gauntletOutput;
    }, [aiTurn.understandOutput, aiTurn.gauntletOutput, activeMode, setActiveMode]);

    // Derived flags
    const hasSpecializedOutput = aiTurn.understandOutput || aiTurn.gauntletOutput;

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
                        mapperArtifact={aiTurn.mapperArtifact!}
                        analysis={aiTurn.exploreAnalysis!}
                        turn={aiTurn}
                        onUnderstand={(options) => triggerAndSwitch('understand', options)}
                        onDecide={(options) => triggerAndSwitch('gauntlet', options)}
                        isLoading={isTransitioning || !!hasSpecializedOutput}
                    />
                )}

                {activeMode === 'understand' && aiTurn.understandOutput && (
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
                )}

                {activeMode === 'gauntlet' && aiTurn.gauntletOutput && (
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
                )}

                {/* Loading state for specialized modes without data yet */}
                {isTransitioning && activeMode !== 'artifact' && !aiTurn.understandOutput && !aiTurn.gauntletOutput && (
                    <div className="flex flex-col items-center justify-center p-12 bg-surface-highlight/10 rounded-xl border border-dashed border-border-subtle animate-pulse">
                        <div className="text-3xl mb-4">
                            {activeMode === 'understand' ? '🧠' : '⚖️'}
                        </div>
                        <div className="text-text-secondary font-medium">
                            {activeMode === 'understand' ? 'Synthesizing Perspective...' : 'Running the Gauntlet...'}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
