import { useCallback, useState } from "react";
import { useAtomValue } from "jotai";
import { currentSessionIdAtom } from "../../state/atoms";
import api from "../../services/extension-api";

export type CognitiveMode = 'understand' | 'gauntlet';

export function useCognitiveMode() {
    const sessionId = useAtomValue(currentSessionIdAtom);
    const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const transitionToMode = useCallback(async (aiTurnId: string, mode: CognitiveMode) => {
        if (!sessionId) {
            setError("No active session found.");
            return;
        }

        setIsTransitioning(true);
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
            setIsTransitioning(false);
        }
    }, [sessionId]);

    return {
        transitionToMode,
        isTransitioning,
        setIsTransitioning, // Allow resetting if needed
        error
    };
}
