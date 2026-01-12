import { useEffect, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    providerAuthStatusAtom,
    mappingProviderAtom,
    singularityProviderAtom,
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

// Reusable hook for auto-selecting providers
const useAutoSelectProvider = (
    role: 'mapping' | 'singularity',
    currentProvider: string | null,
    isLocked: boolean,
    setProvider: (provider: string) => void
) => {
    const authStatus = useAtomValue(providerAuthStatusAtom);

    useEffect(() => {
        // Skip if no auth data yet
        if (Object.keys(authStatus).length === 0) return;

        if (isLocked) return;

        // Check if current is invalid
        const isCurrentValid = currentProvider && isProviderAuthorized(currentProvider, authStatus);

        if (!isCurrentValid) {
            const best = selectBestProvider(role, authStatus);
            if (best && best !== currentProvider) {
                console.log(`[SmartDefaults] ${role}: ${currentProvider} → ${best}`);
                setProvider(best);
            }
        }
    }, [authStatus, currentProvider, isLocked, role, setProvider]);
};

/**
 * Automatically selects best available providers when:
 * 1. Auth status changes (provider logged in/out)
 * 2. Current selection becomes unauthorized
 * 3. No selection exists yet
 * 
 * Respects user locks - won't auto-change locked providers.
 */
export function useSmartProviderDefaults() {
    const [mappingProvider, setMappingProvider] = useAtom(mappingProviderAtom);
    const [singularityProvider, setSingularityProvider] = useAtom(singularityProviderAtom);
    const setLocks = useSetAtom(providerLocksAtom);
    const locks = useAtomValue(providerLocksAtom);

    // Track if we've done initial selection to avoid flash
    const [initialized, setInitialized] = useState(false);

    // Load locks from chrome.storage on mount + subscribe to changes
    useEffect(() => {
        getProviderLocks().then(setLocks);
        return subscribeToLockChanges(setLocks);
    }, [setLocks]);

    // Use extracted logic
    useAutoSelectProvider('mapping', mappingProvider, locks.mapping, setMappingProvider);
    useAutoSelectProvider('singularity', singularityProvider, locks.singularity, setSingularityProvider);

    useEffect(() => {
        setInitialized(true);
    }, []);

    return { isInitialized: initialized };
}
