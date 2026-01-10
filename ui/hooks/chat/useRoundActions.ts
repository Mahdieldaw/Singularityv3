// ui/hooks/useRoundActions.ts - PRIMITIVES-ALIGNED VERSION
import { useCallback } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";

import {
  turnsMapAtom,

  mappingRecomputeSelectionByRoundAtom,
  currentSessionIdAtom,
  isLoadingAtom,
  uiPhaseAtom,
  currentAppStepAtom,
  activeAiTurnIdAtom,
  thinkMappingByRoundAtom,
  activeRecomputeStateAtom,
  alertTextAtom,
} from "../../state/atoms";
import api from "../../services/extension-api";
import { PRIMARY_STREAMING_PROVIDER_IDS } from "../../constants";
import type {
  ProviderKey,
  PrimitiveWorkflowRequest,
} from "../../../shared/contract";
import type { TurnMessage, AiTurn, ProviderResponse } from "../../types";

export function useRoundActions() {
  const turnsMap = useAtomValue(turnsMapAtom);
  const setTurnsMap = useSetAtom(turnsMapAtom);


  const [mappingSelectionByRound, setMappingSelectionByRound] = useAtom(
    mappingRecomputeSelectionByRoundAtom,
  );
  const [currentSessionId] = useAtom(currentSessionIdAtom);
  const setIsLoading = useSetAtom(isLoadingAtom);
  const setUiPhase = useSetAtom(uiPhaseAtom);
  const setCurrentAppStep = useSetAtom(currentAppStepAtom);
  const setActiveAiTurnId = useSetAtom(activeAiTurnIdAtom);
  const [thinkMappingByRound] = useAtom(thinkMappingByRoundAtom);
  const setActiveRecomputeState = useSetAtom(activeRecomputeStateAtom);
  const setAlertText = useSetAtom(alertTextAtom);






  // ============================================================================
  // MAPPING RECOMPUTE (Direct AI Turn Operation)
  // ============================================================================

  /**
   * Recompute mapping for a specific AI turn.
   * Uses the 'recompute' primitive which fetches frozen outputs from the backend.
   *
   * @param aiTurnId - The AI turn to recompute mapping for
   * @param providerIdOverride - Optional: Force mapping for a specific provider
   */
  const runMappingForAiTurn = useCallback(
    async (aiTurnId: string, providerIdOverride?: string) => {
      if (!currentSessionId) return;

      const ai = turnsMap.get(aiTurnId) as AiTurn | undefined;
      if (!ai || ai.type !== "ai") {
        console.warn(`[RoundActions] AI turn ${aiTurnId} not found`);
        return;
      }

      // ✅ Validate we have enough source data for mapping
      const outputsFromBatch = Object.values(ai.batchResponses || {})
        .flat()
        .filter(
          (response: ProviderResponse) => response.status === "completed" && response.text?.trim(),
        );




      const hasCompletedMapping = ai?.mappingResponses
        ? Object.values(ai.mappingResponses).some((resp) => {
          const responses = Array.isArray(resp) ? resp : [resp];
          return responses.some(
            (r) => r.status === "completed" && r.text?.trim(),
          );
        })
        : false;

      const enoughOutputs =
        outputsFromBatch.length >= 2 ||
        hasCompletedMapping;
      if (!enoughOutputs) {
        console.warn(
          `[RoundActions] Not enough outputs for mapping in turn ${aiTurnId}`,
        );
        setAlertText("Not enough source data to run mapping. Please wait for more providers to finish.");
        return;
      }

      // ✅ Determine which provider to use for mapping
      // NOTE: UI state keys still use userTurnId for backward compatibility
      const userTurnId = ai.userTurnId;
      const effectiveMappingProvider =
        providerIdOverride || mappingSelectionByRound[userTurnId];

      if (!effectiveMappingProvider) {
        console.warn(
          `[RoundActions] No mapping provider selected for turn ${aiTurnId}`,
        );
        return;
      }

      // ✅ Update UI state to track mapping selection
      setMappingSelectionByRound((draft: Record<string, string | null>) => {
        if (draft[userTurnId] === effectiveMappingProvider) return;
        draft[userTurnId] = effectiveMappingProvider;
      });

      // ✅ Initialize optimistic mapping response in UI state
      setTurnsMap((draft: Map<string, TurnMessage>) => {
        const existing = draft.get(ai.id);
        if (!existing || existing.type !== "ai") return;
        const aiTurn = existing as AiTurn;
        const prev = aiTurn.mappingResponses || {};
        const next: Record<string, ProviderResponse[]> = { ...prev };

        const arr = Array.isArray(next[effectiveMappingProvider])
          ? [...next[effectiveMappingProvider]]
          : [];

        const initialStatus: "streaming" | "pending" =
          PRIMARY_STREAMING_PROVIDER_IDS.includes(effectiveMappingProvider)
            ? "streaming"
            : "pending";

        arr.push({
          providerId: effectiveMappingProvider as ProviderKey,
          text: "",
          status: initialStatus,
          createdAt: Date.now(),
        });
        next[effectiveMappingProvider] = arr;
        aiTurn.mappingResponses = next;
        aiTurn.mappingVersion = (aiTurn.mappingVersion ?? 0) + 1;
        draft.set(ai.id, { ...aiTurn });
      });

      // ✅ Set loading state
      setActiveAiTurnId(ai.id);
      setIsLoading(true);
      setUiPhase("streaming");
      setCurrentAppStep("cognitive");

      try {
        // Aim recompute state precisely at the mapping provider
        setActiveRecomputeState({
          aiTurnId: ai.id,
          stepType: "mapping",
          providerId: effectiveMappingProvider,
        });

        // ✅ Send recompute primitive - backend will fetch frozen outputs
        const primitive: PrimitiveWorkflowRequest = {
          type: "recompute",
          sessionId: currentSessionId as string,
          sourceTurnId: ai.id, // ✅ Direct AI turn reference - no user turn lookup needed
          stepType: "mapping",
          targetProvider: effectiveMappingProvider as ProviderKey,
          useThinking:
            effectiveMappingProvider === "chatgpt"
              ? !!thinkMappingByRound[userTurnId]
              : false,
        };

        await api.executeWorkflow(primitive);
      } catch (err) {
        console.error("[RoundActions] Mapping run failed:", err);
        setAlertText("Mapping request failed. Please try again.");

        // Revert optimistic state to error
        setTurnsMap((draft) => {
          const turn = draft.get(ai.id) as AiTurn | undefined;
          if (!turn || turn.type !== "ai" || !turn.mappingResponses) return;
          const arr = turn.mappingResponses[effectiveMappingProvider];
          if (Array.isArray(arr) && arr.length > 0) {
            const last = arr[arr.length - 1];
            if (last.status === "streaming" || last.status === "pending") {
              last.status = "error";
              last.text = "Request failed";
            }
          }
        });

        setIsLoading(false);
        setUiPhase("awaiting_action");
        setActiveAiTurnId(null);
        setActiveRecomputeState(null);
      }
    },
    [
      currentSessionId,
      turnsMap,
      mappingSelectionByRound,
      setMappingSelectionByRound,
      thinkMappingByRound,
      setTurnsMap,
      setActiveAiTurnId,
      setIsLoading,
      setUiPhase,
      setCurrentAppStep,
      setActiveRecomputeState,
      setAlertText,
    ],
  );

  const runSingularityForAiTurn = useCallback(
    async (aiTurnId: string, providerIdOverride?: string) => {
      if (!currentSessionId) return;

      const ai = turnsMap.get(aiTurnId) as AiTurn | undefined;
      if (!ai || ai.type !== "ai") {
        console.warn(`[RoundActions] AI turn ${aiTurnId} not found`);
        return;
      }

      const effectiveProviderId = providerIdOverride || "gemini";

      // Initialize optimistic state
      setTurnsMap((draft: Map<string, TurnMessage>) => {
        const existing = draft.get(ai.id);
        if (!existing || existing.type !== "ai") return;
        const aiTurn = existing as AiTurn;

        const prev = aiTurn.singularityResponses || {};
        const next: Record<string, ProviderResponse[]> = { ...prev };

        const arr = Array.isArray(next[effectiveProviderId]) ? [...next[effectiveProviderId]] : [];
        const initialStatus = PRIMARY_STREAMING_PROVIDER_IDS.includes(effectiveProviderId)
          ? "streaming"
          : "pending";

        arr.push({
          providerId: effectiveProviderId as ProviderKey,
          text: "",
          status: initialStatus,
          createdAt: Date.now(),
        });
        next[effectiveProviderId] = arr;
        aiTurn.singularityResponses = next;
      });

      // Set Loading
      setActiveAiTurnId(ai.id);
      setIsLoading(true);
      setUiPhase("streaming");

      try {
        setActiveRecomputeState({
          aiTurnId: ai.id,
          stepType: "singularity" as any,
          providerId: effectiveProviderId,
        });

        const primitive: PrimitiveWorkflowRequest = {
          type: "recompute",
          sessionId: currentSessionId as string,
          sourceTurnId: ai.id,
          stepType: "singularity",
          targetProvider: effectiveProviderId as ProviderKey,
          useThinking: false,
        };

        await api.executeWorkflow(primitive);
      } catch (err) {
        console.error("[RoundActions] Singularity run failed:", err);
        setAlertText("Singularity request failed. Please try again.");

        setTurnsMap((draft) => {
          const turn = draft.get(ai.id) as AiTurn | undefined;
          if (!turn || turn.type !== "ai" || !turn.singularityResponses) return;
          const arr = turn.singularityResponses[effectiveProviderId];
          if (Array.isArray(arr) && arr.length > 0) {
            const last = arr[arr.length - 1];
            if (last.status === "streaming" || last.status === "pending") {
              last.status = "error";
              last.text = "Request failed";
            }
          }
        });
      } finally {
        setIsLoading(false);
        setUiPhase("awaiting_action");
        setActiveAiTurnId(null);
        setActiveRecomputeState(null);
      }
    },
    [currentSessionId, turnsMap, setTurnsMap, setActiveAiTurnId, setIsLoading, setUiPhase, setActiveRecomputeState, setAlertText]
  );

  // ============================================================================
  // UI STATE HELPERS (For controlling per-turn settings)
  // ============================================================================

  /**
   * Select mapping provider for a specific user turn.
   * NOTE: This uses userTurnId as the key for backward compatibility with existing UI state.
   */
  const selectMappingForRound = useCallback(
    (userTurnId: string, providerId: string) => {
      setMappingSelectionByRound((draft: Record<string, string | null>) => {
        draft[userTurnId] =
          draft[userTurnId] === providerId ? null : providerId;
      });
    },
    [setMappingSelectionByRound],
  );

  return {
    runMappingForAiTurn,
    runSingularityForAiTurn,
    selectMappingForRound,
  };
}
