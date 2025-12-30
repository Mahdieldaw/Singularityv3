// ui/hooks/useRoundActions.ts - PRIMITIVES-ALIGNED VERSION
import { useCallback, useRef } from "react";
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
      const outputsFromBatch = Object.values(ai.batchResponses || {}).filter(
        (r: any) => r.status === "completed" && r.text?.trim(),
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

  const runUnderstandForAiTurn = useCallback(
    async (aiTurnId: string, providerIdOverride?: string) => {
      if (!currentSessionId) return;

      const ai = turnsMap.get(aiTurnId) as AiTurn | undefined;
      if (!ai || ai.type !== "ai") {
        console.warn(`[RoundActions] AI turn ${aiTurnId} not found`);
        return;
      }

      const hasMapper = !!ai.mapperArtifact;
      if (!hasMapper) {
        setAlertText("Understand requires mapping to be completed first.");
        return;
      }

      const effectiveProviderId =
        providerIdOverride || ai.meta?.mapper || Object.keys(ai.mappingResponses || {})[0] || "gemini";

      setActiveAiTurnId(ai.id);
      setIsLoading(true);
      setUiPhase("streaming");

      setActiveRecomputeState({
        aiTurnId: ai.id,
        stepType: "understand",
        providerId: effectiveProviderId,
      });

      try {
        await api.sendPortMessage({
          type: "CONTINUE_COGNITIVE_WORKFLOW",
          payload: {
            sessionId: currentSessionId,
            aiTurnId: ai.id,
            mode: "understand",
            providerId: effectiveProviderId,
            isRecompute: true,
            sourceTurnId: ai.id,
          },
        });
      } catch (err) {
        console.error("[RoundActions] Understand run failed:", err);
        setAlertText("Understand request failed. Please try again.");
        setIsLoading(false);
        setUiPhase("awaiting_action");
        setActiveAiTurnId(null);
        setActiveRecomputeState(null);
      }
    },
    [
      currentSessionId,
      turnsMap,
      setActiveAiTurnId,
      setIsLoading,
      setUiPhase,
      setActiveRecomputeState,
      setAlertText,
    ],
  );

  const runGauntletForAiTurn = useCallback(
    async (aiTurnId: string, providerIdOverride?: string) => {
      if (!currentSessionId) return;

      const ai = turnsMap.get(aiTurnId) as AiTurn | undefined;
      if (!ai || ai.type !== "ai") {
        console.warn(`[RoundActions] AI turn ${aiTurnId} not found`);
        return;
      }

      const hasMapper = !!ai.mapperArtifact;
      if (!hasMapper) {
        setAlertText("Gauntlet requires mapping to be completed first.");
        return;
      }

      const effectiveProviderId =
        providerIdOverride || ai.meta?.mapper || Object.keys(ai.mappingResponses || {})[0] || "gemini";

      setActiveAiTurnId(ai.id);
      setIsLoading(true);
      setUiPhase("streaming");

      setActiveRecomputeState({
        aiTurnId: ai.id,
        stepType: "gauntlet",
        providerId: effectiveProviderId,
      });

      try {
        await api.sendPortMessage({
          type: "CONTINUE_COGNITIVE_WORKFLOW",
          payload: {
            sessionId: currentSessionId,
            aiTurnId: ai.id,
            mode: "gauntlet",
            providerId: effectiveProviderId,
            isRecompute: true,
            sourceTurnId: ai.id,
          },
        });
      } catch (err) {
        console.error("[RoundActions] Gauntlet run failed:", err);
        setAlertText("Gauntlet request failed. Please try again.");
        setIsLoading(false);
        setUiPhase("awaiting_action");
        setActiveAiTurnId(null);
        setActiveRecomputeState(null);
      }
    },
    [
      currentSessionId,
      turnsMap,
      setActiveAiTurnId,
      setIsLoading,
      setUiPhase,
      setActiveRecomputeState,
      setAlertText,
    ],
  );


  const runRefinerForAiTurn = useCallback(
    async (aiTurnId: string, providerIdOverride?: string) => {
      if (!currentSessionId) return;

      const ai = turnsMap.get(aiTurnId) as AiTurn | undefined;
      if (!ai || ai.type !== "ai") {
        console.warn(`[RoundActions] AI turn ${aiTurnId} not found`);
        return;
      }

      const hasMapper = !!ai.mapperArtifact;
      const hasPivot = !!ai.understandOutput || !!ai.gauntletOutput;
      if (!hasMapper) {
        setAlertText("Refiner requires mapping to be completed first.");
        return;
      }
      if (!hasPivot) {
        setAlertText("Refiner requires Understand or Gauntlet to be run first.");
        return;
      }

      // Determine provider
      let effectiveProviderId = providerIdOverride;
      if (!effectiveProviderId) {
        try {
          const stored = localStorage.getItem("htos_last_refiner_model");
          if (stored) effectiveProviderId = stored;
        } catch { }
      }
      if (!effectiveProviderId) effectiveProviderId = "gemini"; // Default

      // Initialize optimistic state
      setTurnsMap((draft: Map<string, TurnMessage>) => {
        const existing = draft.get(ai.id);
        if (!existing || existing.type !== "ai") return;
        const aiTurn = existing as AiTurn;

        const prev = aiTurn.refinerResponses || {};
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
        aiTurn.refinerResponses = next;
      });

      // Set Loading
      setActiveAiTurnId(ai.id);
      setIsLoading(true);
      setUiPhase("streaming");

      try {
        setActiveRecomputeState({
          aiTurnId: ai.id,
          stepType: "refiner" as any, // Cast to 'any' if types aren't updated yet
          providerId: effectiveProviderId,
        });

        await api.sendPortMessage({
          type: "CONTINUE_COGNITIVE_WORKFLOW",
          payload: {
            sessionId: currentSessionId,
            aiTurnId: ai.id,
            mode: "refine",
            providerId: effectiveProviderId,
            isRecompute: true,
            sourceTurnId: ai.id,
          },
        });

        // Persist last refiner used
        try {
          localStorage.setItem("htos_last_refiner_model", effectiveProviderId);
        } catch { }

      } catch (err) {
        console.error("[RoundActions] Refiner run failed:", err);
        setAlertText("Refiner request failed. Please try again.");


        // Revert optimistic
        setTurnsMap((draft) => {
          const turn = draft.get(ai.id) as AiTurn | undefined;
          if (!turn || turn.type !== "ai" || !turn.refinerResponses) return;
          const arr = turn.refinerResponses[effectiveProviderId];
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
    [currentSessionId, turnsMap, setTurnsMap, setActiveAiTurnId, setIsLoading, setUiPhase, setActiveRecomputeState, setAlertText]
  );

  const runAntagonistForAiTurn = useCallback(
    async (aiTurnId: string, providerIdOverride?: string) => {
      if (!currentSessionId) return;

      const ai = turnsMap.get(aiTurnId) as AiTurn | undefined;
      if (!ai || ai.type !== "ai") {
        console.warn(`[RoundActions] AI turn ${aiTurnId} not found`);
        return;
      }

      const hasMapper = !!ai.mapperArtifact;
      const hasPivot = !!ai.understandOutput || !!ai.gauntletOutput;
      if (!hasMapper) {
        setAlertText("Antagonist requires mapping to be completed first.");
        return;
      }
      if (!hasPivot) {
        setAlertText("Antagonist requires Understand or Gauntlet to be run first.");
        return;
      }

      // Determine provider
      let effectiveProviderId = providerIdOverride;
      if (!effectiveProviderId) {
        try {
          const stored = localStorage.getItem("htos_last_antagonist_model");
          if (stored) effectiveProviderId = stored;
        } catch { }
      }
      if (!effectiveProviderId) effectiveProviderId = "gemini"; // Default

      // Initialize optimistic state
      setTurnsMap((draft: Map<string, TurnMessage>) => {
        const existing = draft.get(ai.id);
        if (!existing || existing.type !== "ai") return;
        const aiTurn = existing as AiTurn;

        const prev = aiTurn.antagonistResponses || {};
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
        aiTurn.antagonistResponses = next;
      });

      // Set Loading
      setActiveAiTurnId(ai.id);
      setIsLoading(true);
      setUiPhase("streaming");

      try {
        setActiveRecomputeState({
          aiTurnId: ai.id,
          stepType: "antagonist" as any,
          providerId: effectiveProviderId,
        });

        await api.sendPortMessage({
          type: "CONTINUE_COGNITIVE_WORKFLOW",
          payload: {
            sessionId: currentSessionId,
            aiTurnId: ai.id,
            mode: "antagonist",
            providerId: effectiveProviderId,
            isRecompute: true,
            sourceTurnId: ai.id,
          },
        });

        try {
          localStorage.setItem("htos_last_antagonist_model", effectiveProviderId);
        } catch { }

      } catch (err) {
        console.error("[RoundActions] Antagonist run failed:", err);
        setAlertText("Antagonist request failed. Please try again.");

        setTurnsMap((draft) => {
          const turn = draft.get(ai.id) as AiTurn | undefined;
          if (!turn || turn.type !== "ai" || !turn.antagonistResponses) return;
          const arr = turn.antagonistResponses[effectiveProviderId];
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
    [currentSessionId, turnsMap, setTurnsMap, setActiveAiTurnId, setIsLoading, setUiPhase, setActiveRecomputeState, setAlertText]
  );

  // ============================================================================
  // UI STATE HELPERS (For controlling per-turn settings)
  // ============================================================================

  /**
  
   * NOTE: This uses userTurnId as the key for backward compatibility with existing UI state.
   */


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
    runUnderstandForAiTurn,
    runGauntletForAiTurn,
    runRefinerForAiTurn,
    runAntagonistForAiTurn,

    selectMappingForRound,
  };
}
