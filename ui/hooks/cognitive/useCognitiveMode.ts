import { useCallback, useState } from "react";
import { useAtomValue } from "jotai";
import { isLoadingAtom, currentSessionIdAtom } from "../../state/atoms";
import api from "../../services/extension-api";

export type CognitiveMode = 'understand' | 'gauntlet';

export function useCognitiveMode() {
    const sessionId = useAtomValue(currentSessionIdAtom);
    const globalIsLoading = useAtomValue(isLoadingAtom);
    const [localIsTransitioning, setLocalIsTransitioning] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Derived loading state: true if either local trigger is active OR global loading is active
    // But we only want to be "isTransitioning" if we were the one who started it.
    // Simplifying: if global loading stops, we stop.
    const isTransitioning = localIsTransitioning && globalIsLoading;

    const transitionToMode = useCallback(async (aiTurnId: string, mode: CognitiveMode) => {
        if (!sessionId) {
            setError("No active session found.");
            return;
        }

        setLocalIsTransitioning(true);
        setError(null);

        try {
            // Send message to background via extension-api (which wraps chrome.runtime.sendMessage or port.postMessage)
            // Since our ConnectionHandler listens to the port, we should use the port if possible.
            // However, extension-api.ts usually handles the generic messaging.

            // Let's verify how extension-api sends messages.
            await api.sendPortMessage({
                type: "CONTINUE_COGNITIVE_WORKFLOW",
                payload: {
                    sessionId,
                    aiTurnId,
                    mode
                }
            });

            // We don't await the full result here because it might stream back through the port
            // which usePortMessageHandler handles.
        } catch (err: any) {
            console.error(`[useCognitiveMode] Transition failed:`, err);
            setError(err.message || String(err));
            setLocalIsTransitioning(false);
        }
    }, [sessionId]);

    return {
        transitionToMode,
        isTransitioning,
        setLocalIsTransitioning, // Allow resetting if needed
        error
    };
}
