import { useEffect, useMemo, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { activeSplitPanelAtom, turnIdsAtom, turnsMapAtom } from "../../state/atoms";
import type { AiTurn } from "../../types";

function getScrollerElement(): HTMLElement | null {
  return document.querySelector('[data-chat-scroller="true"]') as HTMLElement | null;
}

function isAiTurnId(turnId: string, turnsMap: Map<string, any>): boolean {
  const turn = turnsMap.get(turnId);
  return !!turn && turn.type === "ai";
}

function resolveProviderForTurn(
  turnId: string,
  desiredProviderId: string,
  turnsMap: Map<string, any>,
): string | null {
  if (desiredProviderId === "__trust__") return desiredProviderId;

  const turn = turnsMap.get(turnId);
  if (!turn || turn.type !== "ai") return null;

  const aiTurn = turn as AiTurn;
  const keys = Object.keys(aiTurn.batchResponses || {});
  if (keys.length === 0) return null;
  if (keys.includes(desiredProviderId)) return desiredProviderId;
  return keys[0] || null;
}

export function useScrollSyncedTurn({
  enabled,
  debounceMs = 300,
  minVisibleRatio = 0.55,
}: {
  enabled: boolean;
  debounceMs?: number;
  minVisibleRatio?: number;
}) {
  const activePanel = useAtomValue(activeSplitPanelAtom);
  const setActivePanel = useSetAtom(activeSplitPanelAtom);
  const turnIds = useAtomValue(turnIdsAtom);
  const turnsMap = useAtomValue(turnsMapAtom);

  const aiTurnIds = useMemo(() => {
    return turnIds.filter((id) => isAiTurnId(id, turnsMap));
  }, [turnIds, turnsMap]);

  const activePanelRef = useRef(activePanel);
  const turnsMapRef = useRef(turnsMap);
  const ratiosRef = useRef(new Map<string, number>());
  const debounceTimerRef = useRef<number | null>(null);
  const candidateRef = useRef<string | null>(null);

  useEffect(() => {
    activePanelRef.current = activePanel;
  }, [activePanel]);

  useEffect(() => {
    turnsMapRef.current = turnsMap;
  }, [turnsMap]);

  useEffect(() => {
    if (!enabled) return;
    if (!activePanel) return;
    if (aiTurnIds.length === 0) return;

    const scroller = getScrollerElement();
    if (!scroller) return;

    ratiosRef.current.clear();
    candidateRef.current = null;

    const thresholds = [0, 0.25, 0.5, 0.6, 0.75, 1];

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          const id = el.getAttribute("data-turn-id") || "";
          if (!id) continue;
          ratiosRef.current.set(id, entry.intersectionRatio || 0);
        }

        let bestId: string | null = null;
        let bestRatio = 0;

        for (const [id, ratio] of ratiosRef.current.entries()) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }

        if (!bestId || bestRatio < minVisibleRatio) return;

        candidateRef.current = bestId;

        if (debounceTimerRef.current) {
          window.clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }

        debounceTimerRef.current = window.setTimeout(() => {
          const panel = activePanelRef.current;
          const candidate = candidateRef.current;
          if (!panel || !candidate) return;
          if (panel.turnId === candidate) return;

          const providerId = resolveProviderForTurn(
            candidate,
            panel.providerId,
            turnsMapRef.current as any,
          );
          if (!providerId) return;

          setActivePanel({ turnId: candidate, providerId });
        }, debounceMs);
      },
      { root: scroller, threshold: thresholds },
    );

    const observeMounted = () => {
      const nodes = Array.from(
        scroller.querySelectorAll<HTMLElement>(".message-row[data-turn-type='ai']"),
      );
      for (const el of nodes) observer.observe(el);
    };

    observeMounted();

    const mutationObserver = new MutationObserver(() => {
      observeMounted();
    });

    mutationObserver.observe(scroller, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [enabled, activePanel, aiTurnIds, debounceMs, minVisibleRatio, setActivePanel]);
}

