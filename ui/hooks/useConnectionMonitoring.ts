// ui/hooks/useConnectionMonitoring.ts
import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { connectionStatusAtom } from "../state/atoms";
import api from "../services/extension-api";

// This hook's only job is to instantiate the PortHealthManager
// and sync its state to a global Jotai atom.
export function useConnectionMonitoring() {
  const setConnectionStatus = useSetAtom(connectionStatusAtom);

  useEffect(() => {
    // The api object already contains an instance of PortHealthManager.
    // We just need to subscribe to its state changes.
    const unsubscribe = api.onConnectionStateChange((isConnected) => {
      console.log(
        `[useConnectionMonitoring] Connection state updated: ${isConnected}`,
      );
      setConnectionStatus((prev) => {
        const prevState =
          prev || { isConnected: false, isReconnecting: false, hasEverConnected: false };
        if (isConnected) {
          return {
            isConnected: true,
            isReconnecting: false,
            hasEverConnected: true,
          };
        }
        const hasEverConnected = prevState.hasEverConnected;
        return {
          isConnected: false,
          isReconnecting: hasEverConnected,
          hasEverConnected,
        };
      });
    });

    // Perform an initial check on mount.
    api.checkHealth();

    // The PortHealthManager handles its own intervals. We just need to
    // clean up our subscription when the component unmounts.
    return () => {
      unsubscribe();
    };
  }, [setConnectionStatus]);

  // This hook has no return value; it's a pure side-effect hook.
}
