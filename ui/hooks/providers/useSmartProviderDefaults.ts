import { useEffect, useRef, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    providerAuthStatusAtom,
    mappingProviderAtom,
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
    const [mappingProvider, setMappingProvider] = useAtom(mappingProviderAtom);
    const setLocks = useSetAtom(providerLocksAtom);

    // Track if we've done initial selection to avoid flash
    const [initialized, setInitialized] = useState(false);

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

        setInitialized(true);
    }, [authStatus, locks, mappingProvider, setMappingProvider]);

    return { isInitialized: initialized };
}
