import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { useCognitivePipelineAtom } from "../../state/atoms";

/**
 * Syncs the cognitive pipeline feature flag from Jotai (localStorage)
 * to chrome.storage.local so the backend service worker can read it.
 */
export function useExperimentalFlagSync() {
    const useCognitivePipeline = useAtomValue(useCognitivePipelineAtom);

    useEffect(() => {
        // Only run in extension environment
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ USE_COGNITIVE_PIPELINE: useCognitivePipeline }, () => {
                if (chrome.runtime.lastError) {
                    console.error("[Sync] Failed to sync cognitive flag:", chrome.runtime.lastError);
                } else {
                    console.debug("[Sync] Cognitive pipeline flag synced:", useCognitivePipeline);
                }
            });
        }
    }, [useCognitivePipeline]);
}
