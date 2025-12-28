import { useAtom } from "jotai";
import { turnCognitiveModeFamily } from "../../state/atoms";
import { CognitiveViewMode } from "../../types";
import { CognitiveTransitionOptions, useCognitiveMode } from "./useCognitiveMode";
import { useCallback } from "react";

/**
 * Hook to manage switching between cognitive views (Artifact Showcase vs Synthesis)
 * and triggering backend transitions if data isn't present yet.
 */
export function useModeSwitching(aiTurnId: string) {
    const [activeMode, setActiveMode] = useAtom(turnCognitiveModeFamily(aiTurnId));
    const { transitionToMode, isTransitioning, error } = useCognitiveMode(aiTurnId);

    const switchToMode = useCallback(async (mode: CognitiveViewMode) => {
        // If switching to a mode that needs a backend run (understand/gauntlet),
        // we might need to trigger it if it's not and we're not already transitioning.
        // However, usually the PostMapperView handles the initial trigger.
        // This setter just changes the LOCAL UI active mode.
        setActiveMode(mode);
    }, [setActiveMode]);

    const triggerAndSwitch = useCallback(async (
        mode: 'understand' | 'gauntlet' | 'refine' | 'antagonist',
        options: CognitiveTransitionOptions = {},
    ) => {
        // Change UI mode immediately to show loading if needed
        setActiveMode(mode);
        // Trigger backend
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
