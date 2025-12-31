import { useCallback, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
    activeAiTurnIdAtom,
    activeRecomputeStateAtom,
    currentSessionIdAtom,
    isLoadingAtom,
    uiPhaseAtom,
} from "../../state/atoms";
import api from "../../services/extension-api";

import { MapperArtifact } from "../../../shared/contract";

export type CognitiveMode = 'understand' | 'gauntlet' | 'refine' | 'antagonist';

export type SelectedArtifact = {
    id: string;
    kind: string;
    text: string;
    dimension?: string;
    source?: string;
    meta?: any;
};

export type CognitiveTransitionOptions = {
    providerId?: string;
    selectedArtifacts?: SelectedArtifact[];
    mapperArtifact?: MapperArtifact;
    userNotes?: string[];
    isRecompute?: boolean;
    sourceTurnId?: string;
};

export function useCognitiveMode(trackedAiTurnId?: string) {
    const sessionId = useAtomValue(currentSessionIdAtom);
    const globalIsLoading = useAtomValue(isLoadingAtom);
    const activeAiTurnId = useAtomValue(activeAiTurnIdAtom);
    const setGlobalIsLoading = useSetAtom(isLoadingAtom);
    const setUiPhase = useSetAtom(uiPhaseAtom);
    const setActiveAiTurnId = useSetAtom(activeAiTurnIdAtom);
    const setActiveRecomputeState = useSetAtom(activeRecomputeStateAtom);
    const [, setLocalIsTransitioning] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const isTransitioning = !!trackedAiTurnId && globalIsLoading && activeAiTurnId === trackedAiTurnId;

    const transitionToMode = useCallback(async (
        aiTurnId: string,
        mode: CognitiveMode,
        options: CognitiveTransitionOptions = {},
    ) => {
        if (!sessionId) {
            setError("No active session found.");
            return;
        }

        setLocalIsTransitioning(true);
        setError(null);

        try {
            setActiveAiTurnId(aiTurnId);
            setUiPhase("streaming");
            setGlobalIsLoading(true);

            if (options.isRecompute && options.providerId) {
                const stepTypeForUi =
                    mode === "refine" ? "refiner" : mode;
                setActiveRecomputeState({
                    aiTurnId,
                    stepType: stepTypeForUi,
                    providerId: options.providerId,
                });
            }

            // Proactively bind/reconnect the port scoped to the target session
            try {
                await api.ensurePort({ sessionId });
            } catch (e) {
                console.warn(
                    "[useCognitiveMode] ensurePort failed prior to transition; proceeding with sendPortMessage",
                    e,
                );
            }

            await api.sendPortMessage({
                type: "CONTINUE_COGNITIVE_WORKFLOW",
                payload: {
                    sessionId,
                    aiTurnId,
                    mode,
                    providerId: options.providerId,
                    selectedArtifacts: options.selectedArtifacts || [],
                    mapperArtifact: options.mapperArtifact,
                    userNotes: options.userNotes,
                    isRecompute: !!options.isRecompute,
                    sourceTurnId: options.sourceTurnId,
                },
            });

        } catch (err: any) {
            console.error(`[useCognitiveMode] Transition failed:`, err);
            setError(err.message || String(err));
            setLocalIsTransitioning(false);
            setGlobalIsLoading(false);
            setUiPhase("awaiting_action");
            setActiveAiTurnId(null);
            setActiveRecomputeState(null);
        }
    }, [
        sessionId,
        setActiveAiTurnId,
        setActiveRecomputeState,
        setGlobalIsLoading,
        setUiPhase,
    ]);

    return {
        transitionToMode,
        isTransitioning,
        setLocalIsTransitioning, // Allow resetting if needed
        error
    };
}
