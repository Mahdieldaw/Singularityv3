import { useRef } from "react";

// This hook is now ONLY responsible for saving/restoring scroll position across sessions.
// All live streaming scroll logic has been removed.
export function useScrollPersistence() {
  // Temporarily disabled: no save/restore during troubleshooting scroll behavior
  const scrollerRef = useRef<HTMLElement | null>(null);
  return scrollerRef;
}
