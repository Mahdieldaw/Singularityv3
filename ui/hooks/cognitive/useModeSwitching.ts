import { useAtom } from "jotai";
import { turnCognitiveModeFamily } from "../../state/atoms";
import { CognitiveViewMode } from "../../types";
import { SingularityTransitionOptions, useSingularityMode } from "./useCognitiveMode";
import { useCallback } from "react";

/**
 * Hook to manage switching between cognitive views (Map vs. Singularity)
 * and triggering backend recomputes (e.g. for stance changes).
 */
export function useModeSwitching(aiTurnId: string) {
    const [activeMode, setActiveMode] = useAtom(turnCognitiveModeFamily(aiTurnId));
    const { runSingularity, isTransitioning, error } = useSingularityMode(aiTurnId);

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
        options: SingularityTransitionOptions = {},
    ) => {
        setActiveMode('singularity');
        await runSingularity(aiTurnId, options);
    }, [aiTurnId, setActiveMode, runSingularity]);

    return {
        activeMode,
        setActiveMode: switchToMode,
        triggerAndSwitch,
        isTransitioning,
        error
    };
}
