import { useAtom } from "jotai";
import { turnCognitiveModeFamily } from "../../state/atoms";
import { CognitiveViewMode } from "../../types";
import { CognitiveTransitionOptions, useCognitiveMode } from "./useCognitiveMode";
import { useCallback } from "react";

/**
 * Hook to manage switching between cognitive views (Map vs. Singularity)
 * and triggering backend recomputes (e.g. for stance changes).
 */
export function useModeSwitching(aiTurnId: string) {
    const [activeMode, setActiveMode] = useAtom(turnCognitiveModeFamily(aiTurnId));
    const { transitionToMode, isTransitioning, error } = useCognitiveMode(aiTurnId);

    /**
     * Simply flips the UI tab (e.g. from 'artifact' to 'singularity')
     */
    const switchToMode = useCallback(async (mode: CognitiveViewMode) => {
        setActiveMode(mode);
    }, [setActiveMode]);

    /**
     * Triggers a backend Singularity recompute (e.g. new model or stance change)
     * and switches the view.
     */
    const triggerAndSwitch = useCallback(async (
        mode: 'singularity',
        options: CognitiveTransitionOptions = {},
    ) => {
        // Change UI mode immediately to show loading
        setActiveMode(mode);
        
        // Trigger backend execution via useCognitiveMode
        await transitionToMode(aiTurnId, mode, options);
    }, [aiTurnId, setActiveMode, transitionToMode]);

    return {
        activeMode,
        setActiveMode: switchToMode,
        triggerAndSwitch,
        isTransitioning,
        error
    };
}
