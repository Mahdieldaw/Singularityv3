import { useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { providerAuthStatusAtom } from '../state/atoms';
import api from '../services/extension-api';

export function useProviderStatus() {
  const [status, setStatus] = useAtom(providerAuthStatusAtom);

  useEffect(() => {
    // 1. Instant load from storage
    chrome.storage.local.get(['provider_auth_status'], (result) => {
      if (result.provider_auth_status) {
        setStatus(result.provider_auth_status as Record<string, boolean>);
      }
      // 2. Force a fresh check on mount
      api.refreshAuthStatus();
    });

    // 3. Listen for live updates
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (area === 'local' && changes.provider_auth_status) {
        setStatus((changes.provider_auth_status.newValue as Record<string, boolean>) || ({} as Record<string, boolean>));
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [setStatus]);

  const manualRefresh = useCallback(async () => {
    const fresh = await api.refreshAuthStatus();
    setStatus(fresh);
    return fresh;
  }, [setStatus]);

  return { status, manualRefresh };
}
