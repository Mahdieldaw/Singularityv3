import { useEffect, useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    providerAuthStatusAtom,
    synthesisProviderAtom,
    mappingProviderAtom,
    antagonistProviderAtom,
    refinerProviderAtom,
    providerLocksAtom,
} from '../../state/atoms';
import {
    selectBestProvider,
    isProviderAuthorized,
} from '@shared/provider-config';
import {
    getProviderLocks,
    subscribeToLockChanges,
} from '@shared/provider-locks';

/**
 * Automatically selects best available providers when:
 * 1. Auth status changes (provider logged in/out)
 * 2. Current selection becomes unauthorized
 * 3. No selection exists yet
 * 
 * Respects user locks - won't auto-change locked providers.
 */
export function useSmartProviderDefaults() {
    const authStatus = useAtomValue(providerAuthStatusAtom);
    const [synthesisProvider, setSynthesisProvider] = useAtom(synthesisProviderAtom);
    const [mappingProvider, setMappingProvider] = useAtom(mappingProviderAtom);
    const [antagonistProvider, setAntagonistProvider] = useAtom(antagonistProviderAtom);
    const [refinerProvider, setRefinerProvider] = useAtom(refinerProviderAtom);
    const setLocks = useSetAtom(providerLocksAtom);

    // Track if we've done initial selection to avoid flash
    const initializedRef = useRef(false);

    // Load locks from chrome.storage on mount + subscribe to changes
    useEffect(() => {
        getProviderLocks().then(setLocks);
        return subscribeToLockChanges(setLocks);
    }, [setLocks]);

    const locks = useAtomValue(providerLocksAtom);

    // React to auth changes
    useEffect(() => {
        // Skip if no auth data yet
        if (Object.keys(authStatus).length === 0) return;

        // === Synthesis Provider ===
        if (!locks.synthesis) {
            const currentValid = synthesisProvider && isProviderAuthorized(synthesisProvider, authStatus);

            if (!currentValid) {
                const best = selectBestProvider('synthesis', authStatus);
                if (best && best !== synthesisProvider) {
                    console.log(`[SmartDefaults] Synthesis: ${synthesisProvider} → ${best}`);
                    setSynthesisProvider(best);
                }
            }
        }

        // === Mapping Provider ===
        if (!locks.mapping) {
            const currentValid = mappingProvider && isProviderAuthorized(mappingProvider, authStatus);

            if (!currentValid) {
                const best = selectBestProvider('mapping', authStatus);
                if (best && best !== mappingProvider) {
                    console.log(`[SmartDefaults] Mapping: ${mappingProvider} → ${best}`);
                    setMappingProvider(best);
                }
            }
        }

        // === Antagonist Provider ===
        if (!locks.antagonist) {
            const currentValid = antagonistProvider && isProviderAuthorized(antagonistProvider, authStatus);

            if (!currentValid) {
                const best = selectBestProvider('antagonist', authStatus);
                if (best && best !== antagonistProvider) {
                    console.log(`[SmartDefaults] Antagonist: ${antagonistProvider} → ${best}`);
                    setAntagonistProvider(best);
                }
            }
        }

        // === Refiner Provider ===
        if (!locks.refiner) {
            const currentValid = refinerProvider && isProviderAuthorized(refinerProvider, authStatus);

            if (!currentValid) {
                const best = selectBestProvider('refiner', authStatus);
                if (best && best !== refinerProvider) {
                    console.log(`[SmartDefaults] Refiner: ${refinerProvider} → ${best}`);
                    setRefinerProvider(best);
                }
            }
        }

        initializedRef.current = true;
    }, [authStatus, locks, synthesisProvider, mappingProvider, antagonistProvider, refinerProvider, setSynthesisProvider, setMappingProvider, setAntagonistProvider, setRefinerProvider]);

    return { isInitialized: initializedRef.current };
}
