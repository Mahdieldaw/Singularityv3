const STORAGE_KEY = 'htos_provider_locks';

export interface ProviderLocks {
    synthesis: boolean;
    mapping: boolean;
    antagonist: boolean;
    refiner: boolean;
}

const DEFAULT_LOCKS: ProviderLocks = { synthesis: false, mapping: false, antagonist: false, refiner: false };

/**
 * Read locks from chrome.storage.local
 * Works in both UI and service worker
 */
export async function getProviderLocks(): Promise<ProviderLocks> {
    try {
        const data = await chrome.storage.local.get(STORAGE_KEY);
        return { ...DEFAULT_LOCKS, ...(data[STORAGE_KEY] || {}) };
    } catch {
        return DEFAULT_LOCKS;
    }
}

/**
 * Write locks to chrome.storage.local
 */
export async function setProviderLock(
    role: 'synthesis' | 'mapping' | 'antagonist' | 'refiner',
    locked: boolean
): Promise<void> {
    const current = await getProviderLocks();
    current[role] = locked;
    await chrome.storage.local.set({ [STORAGE_KEY]: current });
}

/**
 * Subscribe to lock changes (for UI reactivity)
 */
export function subscribeToLockChanges(
    callback: (locks: ProviderLocks) => void
): () => void {
    const listener = (
        changes: { [key: string]: chrome.storage.StorageChange },
        area: string
    ) => {
        if (area === 'local' && changes[STORAGE_KEY]) {
            const newValue = changes[STORAGE_KEY].newValue || {};
            callback({ ...DEFAULT_LOCKS, ...newValue });
        }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
}
