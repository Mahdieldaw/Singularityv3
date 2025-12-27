import { useCallback, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
    activeAiTurnIdAtom,
    currentSessionIdAtom,
    isLoadingAtom,
    uiPhaseAtom,
} from "../../state/atoms";
import api from "../../services/extension-api";

import { MapperArtifact } from "../../../shared/contract";

export type CognitiveMode = 'understand' | 'gauntlet';

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
};

export function useCognitiveMode(trackedAiTurnId?: string) {
    const sessionId = useAtomValue(currentSessionIdAtom);
    const globalIsLoading = useAtomValue(isLoadingAtom);
    const activeAiTurnId = useAtomValue(activeAiTurnIdAtom);
    const setGlobalIsLoading = useSetAtom(isLoadingAtom);
    const setUiPhase = useSetAtom(uiPhaseAtom);
    const setActiveAiTurnId = useSetAtom(activeAiTurnIdAtom);
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
                },
            });
        } catch (err: any) {
            console.error(`[useCognitiveMode] Transition failed:`, err);
            setError(err.message || String(err));
            setLocalIsTransitioning(false);
            setGlobalIsLoading(false);
            setUiPhase("awaiting_action");
            setActiveAiTurnId(null);
        }
    }, [sessionId, setActiveAiTurnId, setGlobalIsLoading, setUiPhase]);

    return {
        transitionToMode,
        isTransitioning,
        setLocalIsTransitioning, // Allow resetting if needed
        error
    };
}
