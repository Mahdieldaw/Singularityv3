// ui/hooks/useRetryProvider.ts
import { useCallback } from 'react';
import api from '../../services/extension-api';

export function useRetryProvider() {
  const retryProviders = useCallback(
    async (
      sessionId: string,
      aiTurnId: string,
      providerIds: string[],
      retryScope: 'batch' | 'mapping' = 'batch'
    ) => {
      try {
        const port = await api.ensurePort();
        port.postMessage({
          type: 'RETRY_PROVIDERS',
          sessionId,
          aiTurnId,
          providerIds,
          retryScope,
        });
      } catch (e) {
        console.error('[useRetryProvider] Failed to send retry request', e);
      }
    },
    []
  );

  return { retryProviders };
}
