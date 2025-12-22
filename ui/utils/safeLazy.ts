import React from 'react';

/**
 * A wrapper around React.lazy that detects if a chunk fails to load
 * (usually due to a new deployment/build) and reloads the page automatically.
 */
export function safeLazy<T extends React.ComponentType<any>>(
    importFn: () => Promise<{ default: T }>
) {
    return React.lazy(async () => {
        try {
            return await importFn();
        } catch (error) {
            console.warn("[safeLazy] Lazy load failed, reloading to get new version...", error);
            // Force a reload of the extension frame to fetch the new index.html and chunks
            window.location.reload();
            // Return a dummy component to satisfy Typescript while the page reloads
            return { default: (() => null) as unknown as T };
        }
    });
}
