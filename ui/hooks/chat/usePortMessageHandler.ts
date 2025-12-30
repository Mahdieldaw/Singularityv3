// ui/hooks/usePortMessageHandler.ts - ALIGNED VERSION
import { useCallback, useRef, useEffect } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import {
  turnsMapAtom,
  turnIdsAtom,
  currentSessionIdAtom,
  isLoadingAtom,
  uiPhaseAtom,
  activeAiTurnIdAtom,
  providerContextsAtom,
  selectedModelsAtom,
  mappingEnabledAtom,
  mappingProviderAtom,

  refinerProviderAtom,
  antagonistProviderAtom,
  lastActivityAtAtom,
  workflowProgressAtom,
  providerErrorsAtom,
  workflowDegradedAtom,
  activeSplitPanelAtom,
  isSplitOpenAtom,
  hasAutoOpenedPaneAtom,

} from "../../state/atoms";
import { activeRecomputeStateAtom, lastStreamingProviderAtom } from "../../state/atoms";
import { StreamingBuffer } from "../../utils/streamingBuffer";
import {
  applyStreamingUpdates,
  createOptimisticAiTurn,
} from "../../utils/turn-helpers";
import { normalizeProviderId } from "../../utils/provider-id-mapper";
import api from "../../services/extension-api";
import type { TurnMessage, UserTurn, AiTurn, ProviderKey } from "../../types";
import { LLM_PROVIDERS_CONFIG } from "../../constants";

const PORT_DEBUG_UI = false;

/**
 * CRITICAL: Step type detection must match backend stepId patterns
 * Backend generates: 'batch-<timestamp>', 'synthesis-<provider>-<timestamp>', 'mapping-<provider>-<timestamp>'
 */
function getStepType(stepId: string): "batch" | "mapping" | "refiner" | "antagonist" | "understand" | "gauntlet" | null {
  if (!stepId || typeof stepId !== "string") return null;

  // Match backend patterns exactly

  if (stepId.startsWith("mapping-") || stepId.includes("-mapping-"))
    return "mapping";
  if (stepId.startsWith("refiner-") || stepId.includes("-refiner-"))
    return "refiner";
  if (stepId.startsWith("antagonist-") || stepId.includes("-antagonist-"))
    return "antagonist";
  if (stepId.startsWith("batch-") || stepId.includes("prompt")) return "batch";
  if (stepId.startsWith("understand-") || stepId.includes("understand")) return "understand";
  if (stepId.startsWith("gauntlet-") || stepId.includes("gauntlet")) return "gauntlet";
  if (stepId.startsWith("explore-")) return "batch"; // Explore currently uses batch-like routing

  console.warn(`[Port] Unknown stepId pattern: ${stepId}`);
  return null;
}

/**
 * Extract provider ID from stepId for synthesis/mapping steps
 * Backend format: 'synthesis-gemini-1234567890' or 'mapping-chatgpt-1234567890'
 */
function extractProviderFromStepId(
  stepId: string,
  stepType: "mapping" | "refiner" | "antagonist" | "understand" | "gauntlet",
): string | null {
  // Support provider IDs with hyphens/dots/etc., assuming last segment is numeric timestamp
  const re = new RegExp(`^${stepType}-(.+)-(\\d+)$`);
  const match = stepId.match(re);
  return match ? match[1] : null;
}

export function usePortMessageHandler() {
  const setTurnsMap = useSetAtom(turnsMapAtom);
  const setTurnIds = useSetAtom(turnIdsAtom);
  const setCurrentSessionId = useSetAtom(currentSessionIdAtom);
  const currentSessionId = useAtomValue(currentSessionIdAtom);
  const setIsLoading = useSetAtom(isLoadingAtom);
  const setUiPhase = useSetAtom(uiPhaseAtom);
  const activeAiTurnId = useAtomValue(activeAiTurnIdAtom);
  const setActiveAiTurnId = useSetAtom(activeAiTurnIdAtom);
  const setProviderContexts = useSetAtom(providerContextsAtom);
  const selectedModels = useAtomValue(selectedModelsAtom);
  const mappingEnabled = useAtomValue(mappingEnabledAtom);
  const mappingProvider = useAtomValue(mappingProviderAtom);

  const refinerProvider = useAtomValue(refinerProviderAtom);
  const antagonistProvider = useAtomValue(antagonistProviderAtom);
  const setLastActivityAt = useSetAtom(lastActivityAtAtom);
  const setWorkflowProgress = useSetAtom(workflowProgressAtom);
  const setProviderErrors = useSetAtom(providerErrorsAtom);
  const setWorkflowDegraded = useSetAtom(workflowDegradedAtom);

  // Auto-open split pane state
  const isSplitOpen = useAtomValue(isSplitOpenAtom);
  const activeSplitPanel = useAtomValue(activeSplitPanelAtom);
  const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
  const hasAutoOpenedPane = useAtomValue(hasAutoOpenedPaneAtom);
  const setHasAutoOpenedPane = useSetAtom(hasAutoOpenedPaneAtom);

  // Note: We rely on Jotai's per-atom update serialization; no manual pending cache

  // Refs to avoid stale closure values during streaming updates
  const isSplitOpenRef = useRef<boolean>(false);
  useEffect(() => { isSplitOpenRef.current = isSplitOpen; }, [isSplitOpen]);
  const activeSplitPanelRef = useRef<{ turnId: string; providerId: string } | null>(null);
  useEffect(() => { activeSplitPanelRef.current = activeSplitPanel; }, [activeSplitPanel]);

  const streamingBufferRef = useRef<StreamingBuffer | null>(null);
  const activeAiTurnIdRef = useRef<string | null>(null);
  const activeRecomputeRef = useRef<{
    aiTurnId: string;
    stepType: "mapping" | "batch" | "refiner" | "antagonist" | "understand" | "gauntlet";
    providerId: string;
  } | null>(null);
  // Track whether we've already logged the first PARTIAL_RESULT for a given
  // stepId/providerId pair to avoid noisy, repeated logs in devtools.
  const partialLoggedRef = useRef<Map<string, Set<string>>>(new Map());

  // Keep ref in sync with atom
  useEffect(() => {
    activeAiTurnIdRef.current = activeAiTurnId;
  }, [activeAiTurnId]);

  const activeRecomputeState = useAtomValue(activeRecomputeStateAtom);
  const setActiveRecomputeState = useSetAtom(activeRecomputeStateAtom);
  const setLastStreamingProvider = useSetAtom(lastStreamingProviderAtom);
  useEffect(() => {
    activeRecomputeRef.current = activeRecomputeState;
  }, [activeRecomputeState]);

  const handler = useCallback(
    (message: any) => {
      if (!message || !message.type) return;

      if (
        PORT_DEBUG_UI &&
        message.type !== "PARTIAL_RESULT" &&
        message.type !== "WORKFLOW_PROGRESS"
      ) {
        console.log("[Port Handler]", message.type, message);
      }

      switch (message.type) {

        case "PREFLIGHT_WARNINGS": {
          const { warnings } = message;
          console.warn('[Preflight] Warnings:', warnings);
          if (Array.isArray(warnings)) {
            warnings.forEach((warning: string) => {
              console.warn('[Preflight]', warning);
            });
          }
          break;
        }

        case "TURN_CREATED": {
          const {
            userTurnId,
            aiTurnId,
            sessionId: msgSessionId,
            providers: msgProviders,

            mappingProvider: msgMappingProvider,
            refinerProvider: msgRefinerProvider,
            antagonistProvider: msgAntagonistProvider
          } = message;

          // Always adopt the backend sessionId for TURN_CREATED
          if (msgSessionId) {
            if (!currentSessionId || currentSessionId === msgSessionId) {
              setCurrentSessionId(msgSessionId);
            }
          }

          // ✅ CRITICAL FIX: Use providers from message (authoritative backend data)
          // instead of reading from atoms which may be stale
          const activeProviders = msgProviders && msgProviders.length > 0
            ? msgProviders
            : LLM_PROVIDERS_CONFIG.filter((p) => selectedModels[p.id]).map((p) => p.id as ProviderKey);


          const effectiveMappingProvider = msgMappingProvider || mappingProvider;
          const effectiveRefinerProvider = msgRefinerProvider || refinerProvider;
          const effectiveAntagonistProvider = msgAntagonistProvider || antagonistProvider;

          // Single atomic update to turnsMap ensures we read the latest user turn
          setTurnsMap((draft: Map<string, TurnMessage>) => {
            const existing = draft.get(userTurnId);
            if (!existing || existing.type !== "user") {
              // Under Jotai's per-atom serialization, the user turn should be present.
              // If not, avoid creating the AI turn prematurely.
              console.error(
                "[Port] TURN_CREATED: user turn missing in updater for",
                userTurnId,
              );
              return;
            }
            const existingUser = existing as UserTurn;
            const ensuredUser: UserTurn = {
              ...existingUser,
              sessionId:
                existingUser.sessionId ||
                msgSessionId ||
                currentSessionId ||
                null,
            };
            // Backfill sessionId if it was missing
            draft.set(userTurnId, ensuredUser);

            const aiTurn = createOptimisticAiTurn(
              aiTurnId,
              ensuredUser,
              activeProviders,
              !!mappingEnabled && !!effectiveMappingProvider,
              !!effectiveRefinerProvider,
              effectiveMappingProvider || undefined,
              effectiveRefinerProvider || undefined,
              effectiveAntagonistProvider || undefined,
              Date.now(),
              ensuredUser.id,
              {
                mapping: !!mappingEnabled && !!effectiveMappingProvider,
                refiner: !!effectiveRefinerProvider,
                antagonist: !!effectiveAntagonistProvider
              },
            );
            draft.set(aiTurnId, aiTurn);
          });

          // Ensure ordering in ID list (user first, then AI)
          setTurnIds((idsDraft: string[]) => {
            if (!idsDraft.includes(userTurnId)) idsDraft.push(userTurnId);
            if (!idsDraft.includes(aiTurnId)) idsDraft.push(aiTurnId);
          });

          setActiveAiTurnId(aiTurnId);
          setLastActivityAt(Date.now());
          break;
        }

        case "TURN_FINALIZED": {
          const {
            userTurnId,
            aiTurnId,
            turn,
            sessionId: msgSessionId,
          } = message;

          // Adopt sessionId on finalization to ensure coherence
          if (msgSessionId) {
            if (!currentSessionId || currentSessionId === msgSessionId) {
              setCurrentSessionId(msgSessionId);
            }
          }

          console.log("[Port] Received TURN_FINALIZED", {
            userTurnId,
            aiTurnId,
            hasUserData: !!turn?.user,
            hasAiData: !!turn?.ai,
            aiHasUserTurnId: !!turn?.ai?.userTurnId,
          });

          // Flush any pending streaming data first
          streamingBufferRef.current?.flushImmediate?.();

          // Merge canonical data into existing turns (no ID remapping needed)
          setTurnsMap((draft: Map<string, TurnMessage>) => {
            // Update user turn if provided
            if (turn?.user) {
              const existingUser = draft.get(turn.user.id) as
                | UserTurn
                | undefined;
              draft.set(turn.user.id, {
                ...(existingUser || {}),
                ...(turn.user as UserTurn),
              });
            }

            if (turn?.ai) {
              const existingAi = draft.get(aiTurnId) as AiTurn | undefined;
              if (!existingAi) {
                // Fallback: if the AI turn wasn't created (should be rare), add it directly
                // Normalize batchResponses to arrays if needed
                const incoming = turn.ai as any;
                const normalizedBatch = Object.fromEntries(
                  Object.entries(incoming.batchResponses || {}).map(([pid, val]: [string, any]) => [
                    pid,
                    Array.isArray(val) ? (val as any[]) : [val],
                  ]),
                );
                draft.set(aiTurnId, { ...(turn.ai as AiTurn), batchResponses: normalizedBatch } as AiTurn);
              } else {
                const mergedAi: AiTurn = {
                  ...existingAi,
                  ...(turn.ai as AiTurn),
                  type: "ai",
                  userTurnId: turn.user?.id || existingAi.userTurnId,
                  // Merge responses: preserve existing data while accepting backend updates
                  // This is important for recompute scenarios where only some responses change
                  batchResponses: (() => {
                    const incoming = (turn.ai as any)?.batchResponses || {};
                    const normalizedIncoming = Object.fromEntries(
                      Object.entries(incoming).map(([pid, val]: [string, any]) => [
                        pid,
                        Array.isArray(val) ? (val as any[]) : [val],
                      ]),
                    );
                    return {
                      ...(existingAi.batchResponses || {}),
                      ...normalizedIncoming,
                    } as any;
                  })(),

                  mappingResponses: {
                    ...(existingAi.mappingResponses || {}),
                    ...((turn.ai as AiTurn)?.mappingResponses || {}),
                  },
                  meta: {
                    ...(existingAi.meta || {}),
                    ...((turn.ai as AiTurn)?.meta || {}),
                    isOptimistic: false,
                  },
                };
                draft.set(aiTurnId, mergedAi);
              }
            }
          });

          // Ensure canonical IDs exist in turnIds (no remapping)
          setTurnIds((idsDraft: string[]) => {
            const ensureId = (id: string | undefined) => {
              if (!id) return;
              if (!idsDraft.includes(id)) idsDraft.push(id);
            };
            ensureId(turn?.user?.id);
            ensureId(aiTurnId);
            // Deduplicate while preserving the first occurrence
            const seen = new Set<string>();
            for (let i = idsDraft.length - 1; i >= 0; i--) {
              const id = idsDraft[i];
              if (seen.has(id)) {
                idsDraft.splice(i, 1);
              } else {
                seen.add(id);
              }
            }
          });

          // Finalization UI state updates
          setIsLoading(false);
          setUiPhase("awaiting_action");
          // Clear active AI turn only after finalization (not in WORKFLOW_COMPLETE)
          setActiveAiTurnId(null);
          setLastActivityAt(Date.now());

          // Reset streaming UX state flags on finalization
          setHasAutoOpenedPane(null);


          break;
        }

        case "PARTIAL_RESULT": {
          const {
            stepId,
            providerId,
            chunk,
          } = message;
          if (!chunk?.text) return;

          const stepType = getStepType(stepId);
          if (!stepType) {
            console.warn(`[Port] Cannot determine step type for: ${stepId}`);
            return;
          }

          // Some backends omit providerId for synthesis/mapping partials; derive from stepId if needed
          let pid: string | null | undefined = providerId;
          if (
            (!pid || typeof pid !== "string") &&
            (stepType === "mapping")
          ) {
            pid = extractProviderFromStepId(stepId, stepType);
          }
          // ✅ Normalize provider ID to canonical form
          if (pid) {
            pid = normalizeProviderId(pid);
          }
          if (!pid) {
            if (STREAMING_DEBUG_UI) {
              console.warn(
                `[Port] PARTIAL_RESULT missing providerId and could not be derived for step ${stepId}`,
              );
            }
            return;
          }

          // Track which provider is actively streaming (for granular UI indicators)
          setLastStreamingProvider(pid);

          // Log the first partial per provider per step only
          try {
            let perStep = partialLoggedRef.current.get(stepId);
            if (!perStep) {
              perStep = new Set<string>();
              partialLoggedRef.current.set(stepId, perStep);
            }
            if (!perStep.has(pid as string)) {
              const preview =
                typeof chunk?.text === "string" ? chunk.text.slice(0, 200) : "";
              console.log("[Port Handler] PARTIAL_RESULT (first)", {
                stepId,
                providerId: pid,
                preview,
              });
              perStep.add(pid as string);
            }
          } catch (e) {
            // non-fatal
          }

          // Initialize buffer if needed
          if (!streamingBufferRef.current) {
            streamingBufferRef.current = new StreamingBuffer((updates) => {
              const activeId =
                activeRecomputeRef.current?.aiTurnId ||
                activeAiTurnIdRef.current;
              if (!activeId || !updates || updates.length === 0) return;

              setTurnsMap((draft: Map<string, TurnMessage>) => {
                const existing = draft.get(activeId);
                if (!existing || existing.type !== "ai") return;
                const aiTurn = existing as AiTurn;

                // Apply batched updates
                applyStreamingUpdates(aiTurn, updates);

                // CRITICAL: ensure the Map entry is observed as changed
                draft.set(activeId, { ...aiTurn });
              });
            });
          }

          streamingBufferRef.current.addDelta(
            pid,
            chunk.text,
            "streaming",
            stepType,
          );
          setLastActivityAt(Date.now());

          // Store provider context in separate atom
          if (chunk.meta) {
            setProviderContexts((draft: Record<string, any>) => {
              draft[pid as string] = {
                ...(draft[pid as string] || {}),
                ...chunk.meta,
              };
            });
          }
          break;
        }

        case "WORKFLOW_STEP_UPDATE": {
          const {
            stepId,
            status,
            result,
            error,
          } = message;

          // Clean up once a step completes/fails to avoid memory growth
          if (status === "completed" || status === "failed") {
            try {
              partialLoggedRef.current.delete(stepId);
            } catch { }
          }

          // Do not gate by session; process updates irrespective of UI session state

          if (status === "completed" && result) {
            streamingBufferRef.current?.flushImmediate();
            setLastActivityAt(Date.now());

            // ✅ CRITICAL FIX: Properly detect step type and route completions
            const stepType = getStepType(stepId);

            if (!stepType) {
              console.error(
                `[Port] Cannot route completion - unknown stepId: ${stepId}`,
              );
              break;
            }

            // Backend sends either:
            // 1. { results: { claude: {...}, gemini: {...} } } for batch steps
            // 2. { providerId: 'gemini', text: '...', status: '...' } for single-provider steps
            const resultsMap =
              result.results ||
              (result.providerId ? { [result.providerId]: result } : {});

            const _completedProviders: string[] = [];
            Object.entries(resultsMap).forEach(
              ([providerId, data]: [string, any]) => {
                // ✅ Normalize provider ID to canonical form
                const normalizedId = normalizeProviderId(providerId);
                const targetId =
                  (message as any).isRecompute && (message as any).sourceTurnId
                    ? (message as any).sourceTurnId
                    : activeAiTurnIdRef.current;
                if (!targetId) return;
                _completedProviders.push(normalizedId);

                setTurnsMap((draft: Map<string, TurnMessage>) => {
                  const existing = draft.get(targetId);
                  if (!existing || existing.type !== "ai") return;
                  const aiTurn = existing as AiTurn;

                  // Helper to safely update/append response
                  const updateResponseList = (
                    list: any[] | undefined,
                    entry: any,
                  ) => {
                    const arr = Array.isArray(list) ? [...list] : [];
                    const last = arr.length > 0 ? arr[arr.length - 1] : null;
                    // If last item is completed/error, we append a new version (history).
                    // If last item is streaming/pending, we update it (in-place).
                    const isFinal =
                      last?.status === "completed" || last?.status === "error";

                    if (!last || isFinal) {
                      arr.push(entry);
                    } else {
                      // Preserve creation time when updating
                      arr[arr.length - 1] = {
                        ...last,
                        ...entry,
                        createdAt: last.createdAt,
                      };
                    }
                    return arr;
                  };

                  const baseEntry = {
                    providerId: normalizedId,
                    text: data?.text || "",
                    status: "completed" as const,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    meta: {
                      ...(data?.meta || {}),
                    },
                    artifacts: data?.artifacts || [], // ✅ Preserve artifacts
                  };


                  if (stepType === "mapping") {
                    aiTurn.mappingResponses = {
                      ...(aiTurn.mappingResponses || {}),
                      [normalizedId]: updateResponseList(
                        aiTurn.mappingResponses?.[normalizedId],
                        baseEntry,
                      ),
                    };
                    aiTurn.mappingVersion = (aiTurn.mappingVersion ?? 0) + 1;
                  } else if (stepType === "batch") {
                    aiTurn.batchResponses = {
                      ...(aiTurn.batchResponses || {}),
                      [normalizedId]: updateResponseList(
                        aiTurn.batchResponses?.[normalizedId],
                        baseEntry,
                      ),
                    };
                  } else if (stepType === "refiner") {
                    aiTurn.refinerResponses = {
                      ...(aiTurn.refinerResponses || {}),
                      [normalizedId]: updateResponseList(
                        aiTurn.refinerResponses?.[normalizedId],
                        baseEntry,
                      ),
                    };
                    aiTurn.refinerVersion = (aiTurn.refinerVersion ?? 0) + 1;
                  } else if (stepType === "antagonist") {
                    aiTurn.antagonistResponses = {
                      ...(aiTurn.antagonistResponses || {}),
                      [normalizedId]: updateResponseList(
                        aiTurn.antagonistResponses?.[normalizedId],
                        baseEntry,
                      ),
                    };
                    aiTurn.antagonistVersion = (aiTurn.antagonistVersion ?? 0) + 1;
                  } else if (stepType === "understand") {
                    aiTurn.understandResponses = {
                      ...(aiTurn.understandResponses || {}),
                      [normalizedId]: updateResponseList(
                        aiTurn.understandResponses?.[normalizedId],
                        baseEntry,
                      ),
                    };
                    // Extract structured output from meta if available
                    if (data?.meta?.understandOutput) {
                      aiTurn.understandOutput = data.meta.understandOutput;
                    }
                    aiTurn.understandVersion = (aiTurn.understandVersion ?? 0) + 1;
                  } else if (stepType === "gauntlet") {
                    aiTurn.gauntletResponses = {
                      ...(aiTurn.gauntletResponses || {}),
                      [normalizedId]: updateResponseList(
                        aiTurn.gauntletResponses?.[normalizedId],
                        baseEntry,
                      ),
                    };
                    // Extract structured output from meta if available
                    if (data?.meta?.gauntletOutput) {
                      aiTurn.gauntletOutput = data.meta.gauntletOutput;
                    }
                    aiTurn.gauntletVersion = (aiTurn.gauntletVersion ?? 0) + 1;
                  }

                  // CRITICAL: ensure the Map entry is observed as changed
                  draft.set(targetId, { ...aiTurn });
                });

                if (data?.meta) {
                  setProviderContexts((draft: Record<string, any>) => {
                    draft[normalizedId] = {
                      ...(draft[normalizedId] || {}),
                      ...data.meta,
                    };
                  });
                }
              },
            );

            // Emit a single aggregated completion log for batch steps to reduce verbosity
            try {
              if (stepType === "batch") {
                const targetId = activeAiTurnIdRef.current;
                if (targetId && _completedProviders.length > 0) {
                  console.log(
                    `[Port] Batch step completed on turn ${targetId} with results from ${_completedProviders.length} providers: ${_completedProviders.join(", ")}`,
                  );
                }
              }
            } catch (_) { }

            if (message.isRecompute) {
              setActiveRecomputeState(null);
            }
          } else if (status === "failed") {
            console.error(`[Port] Step failed: ${stepId}`, error);
            // Update the corresponding response entry to reflect the error
            try {
              const stepType = getStepType(stepId);
              if (stepType) {
                let providerId: string | null | undefined = result?.providerId;
                if (
                  (!providerId || typeof providerId !== "string") &&
                  (!providerId || typeof providerId !== "string") &&
                  (stepType === "mapping" || stepType === "refiner" || stepType === "antagonist")
                ) {
                  providerId = extractProviderFromStepId(stepId, stepType);
                }
                // ✅ Normalize provider ID to canonical form
                if (providerId) {
                  providerId = normalizeProviderId(providerId);
                }
                const targetId = (message as any).isRecompute && (message as any).sourceTurnId
                  ? (message as any).sourceTurnId
                  : activeRecomputeRef.current?.aiTurnId ||
                  activeAiTurnIdRef.current;
                if (targetId && providerId) {
                  setTurnsMap((draft: Map<string, TurnMessage>) => {
                    const existing = draft.get(targetId);
                    if (!existing || existing.type !== "ai") return;
                    const aiTurn = existing as AiTurn;
                    const errText =
                      typeof error === "string" ? error : result?.text || "";
                    const now = Date.now();


                    if (stepType === "mapping") {
                      const arr = Array.isArray(
                        aiTurn.mappingResponses?.[providerId!],
                      )
                        ? [...(aiTurn.mappingResponses![providerId!] as any[])]
                        : [];
                      if (arr.length > 0) {
                        const latest = arr[arr.length - 1] as any;
                        arr[arr.length - 1] = {
                          ...latest,
                          status: "error",
                          text: errText || (latest?.text ?? ""),
                          updatedAt: now,
                        };
                      } else {
                        arr.push({
                          providerId: providerId!,
                          text: errText || "",
                          status: "error",
                          createdAt: now,
                          updatedAt: now,
                        } as any);
                      }
                      aiTurn.mappingResponses = {
                        ...(aiTurn.mappingResponses || {}),
                        [providerId!]: arr as any,
                      };
                      aiTurn.mappingVersion = (aiTurn.mappingVersion ?? 0) + 1;
                    } else if (stepType === "batch") {
                      const arr = Array.isArray(aiTurn.batchResponses?.[providerId!])
                        ? [...(aiTurn.batchResponses![providerId!] as any[])]
                        : [];
                      if (arr.length > 0) {
                        const latest = arr[arr.length - 1] as any;
                        arr[arr.length - 1] = {
                          ...latest,
                          status: "error",
                          text: errText || (latest?.text ?? ""),
                          updatedAt: now,
                        } as any;
                      } else {
                        arr.push({
                          providerId: providerId!,
                          text: errText || "",
                          status: "error",
                          createdAt: now,
                          updatedAt: now,
                        } as any);
                      }
                      aiTurn.batchResponses = {
                        ...(aiTurn.batchResponses || {}),
                        [providerId!]: arr as any,
                      } as any;
                    } else if (stepType === "refiner") {
                      const arr = Array.isArray(aiTurn.refinerResponses?.[providerId!])
                        ? [...(aiTurn.refinerResponses![providerId!] as any[])]
                        : [];
                      if (arr.length > 0) {
                        const latest = arr[arr.length - 1] as any;
                        arr[arr.length - 1] = {
                          ...latest,
                          status: "error",
                          text: errText || (latest?.text ?? ""),
                          updatedAt: now,
                        } as any;
                      } else {
                        arr.push({
                          providerId: providerId!,
                          text: errText || "",
                          status: "error",
                          createdAt: now,
                          updatedAt: now,
                        } as any);
                      }
                      aiTurn.refinerResponses = {
                        ...(aiTurn.refinerResponses || {}),
                        [providerId!]: arr as any,
                      } as any;
                      aiTurn.refinerVersion = (aiTurn.refinerVersion ?? 0) + 1;
                    } else if (stepType === "antagonist") {
                      const arr = Array.isArray(aiTurn.antagonistResponses?.[providerId!])
                        ? [...(aiTurn.antagonistResponses![providerId!] as any[])]
                        : [];
                      if (arr.length > 0) {
                        const latest = arr[arr.length - 1] as any;
                        arr[arr.length - 1] = {
                          ...latest,
                          status: "error",
                          text: errText || (latest?.text ?? ""),
                          updatedAt: now,
                        } as any;
                      } else {
                        arr.push({
                          providerId: providerId!,
                          text: errText || "",
                          status: "error",
                          createdAt: now,
                          updatedAt: now,
                        } as any);
                      }
                      aiTurn.antagonistResponses = {
                        ...(aiTurn.antagonistResponses || {}),
                        [providerId!]: arr as any,
                      } as any;
                      aiTurn.antagonistVersion = (aiTurn.antagonistVersion ?? 0) + 1;
                    } else if (stepType === "understand") {
                      aiTurn.understandVersion = (aiTurn.understandVersion ?? 0) + 1;
                    } else if (stepType === "gauntlet") {
                      aiTurn.gauntletVersion = (aiTurn.gauntletVersion ?? 0) + 1;
                    }
                  });
                }
                // ✅ CRITICAL: Always clear loading state on step failure to unlock UI
                setIsLoading(false);
                setUiPhase("awaiting_action");
              }
            } catch (e) {
              console.warn(
                "[Port] Failed to tag error state on turn response",
                e,
              );
            }

            setIsLoading(false);
            setUiPhase("awaiting_action");
            setLastActivityAt(Date.now());
            // On failure, clear recompute target so UI stops indicating loading
            if (message.isRecompute) {
              setActiveRecomputeState(null);
            }
          }
          break;
        }

        case "WORKFLOW_PROGRESS": {
          try {
            const { providerStatuses, phase } = message as any;
            const mapStatusToStage = (
              status: 'queued' | 'active' | 'streaming' | 'completed' | 'failed',
              phase: 'batch' | 'synthesis' | 'mapping'
            ) => {
              if (status === 'queued') return 'idle';
              if (status === 'active') return phase === 'synthesis' ? 'synthesizing' : 'thinking';
              if (status === 'streaming') return 'streaming';
              if (status === 'completed') return 'complete';
              if (status === 'failed') return 'error';
              return 'idle';
            };
            if (Array.isArray(providerStatuses)) {
              const progressMap: Record<string, { stage: string; progress?: number; error?: string }> = {};
              for (const ps of providerStatuses) {
                const pid = String(ps.providerId);
                progressMap[pid] = {
                  stage: mapStatusToStage(ps.status, phase),
                  progress: typeof ps.progress === 'number' ? ps.progress : undefined,
                  error: ps.error,
                };
              }
              setWorkflowProgress(progressMap as any);

              // NEW: Extract and store errors for retry controls
              try {
                const errors: Record<string, any> = {};
                for (const status of providerStatuses) {
                  if (status?.error) {
                    errors[String(status.providerId)] = status.error;
                  }
                }
                setProviderErrors(errors);
              } catch (_) { }

              // AUTO-OPEN SPLIT PANE: On first streaming provider (do not override if already open or user-selected)
              const activeId = activeAiTurnIdRef.current;
              if (activeId && hasAutoOpenedPane !== activeId && phase === 'batch') {
                const firstStreaming = providerStatuses.find(
                  (ps: any) => ps.status === 'streaming' || ps.status === 'active'
                );

                if (firstStreaming && !isSplitOpenRef.current && !activeSplitPanelRef.current) {
                  setActiveSplitPanel({
                    turnId: activeId,
                    providerId: String(firstStreaming.providerId)
                  });
                  setHasAutoOpenedPane(activeId);
                }
              }


            }
          } catch (e) {
            console.warn('[Port] Failed to process WORKFLOW_PROGRESS', e);
          }
          break;
        }

        case "WORKFLOW_PARTIAL_COMPLETE": {
          try {
            const partialMsg = message as any;
            setWorkflowDegraded({
              isDegraded: Array.isArray(partialMsg.failedProviders) && partialMsg.failedProviders.length > 0,
              successCount: Array.isArray(partialMsg.successfulProviders) ? partialMsg.successfulProviders.length : 0,
              totalCount: ((partialMsg.successfulProviders || []).length) + ((partialMsg.failedProviders || []).length),
              failedProviders: (partialMsg.failedProviders || []).map((f: any) => f.providerId),
            });
            const errors: Record<string, any> = {};
            for (const failed of partialMsg.failedProviders || []) {
              errors[failed.providerId] = failed.error;
            }
            setProviderErrors(errors);
          } catch (e) {
            console.warn('[Port] Failed to process WORKFLOW_PARTIAL_COMPLETE', e);
          }
          break;
        }

        case "WORKFLOW_COMPLETE": {
          const { } = message;

          streamingBufferRef.current?.flushImmediate();
          // Fallback finalization is no longer needed.
          // The robust TURN_FINALIZED handler will manage this state change.
          setIsLoading(false);
          setUiPhase("awaiting_action");
          setLastActivityAt(Date.now());

          // Reset streaming UX state for next round
          setHasAutoOpenedPane(null);
          setHasAutoOpenedPane(null);
          // Do NOT clear activeAiTurnId here; wait for TURN_FINALIZED
          break;
        }

        case "MAPPER_ARTIFACT_READY": {
          const { aiTurnId, artifact, analysis } = message as any;
          if (!aiTurnId) return;

          setTurnsMap((draft: Map<string, TurnMessage>) => {
            const existing = draft.get(aiTurnId);
            if (!existing || existing.type !== "ai") return;
            const aiTurn = existing as AiTurn;

            // Update with cognitive artifacts
            draft.set(aiTurnId, {
              ...aiTurn,
              mapperArtifact: artifact,
              exploreAnalysis: analysis,
            });
          });
          break;
        }
      }
    },
    [
      setTurnsMap,
      setTurnIds,
      setCurrentSessionId,
      currentSessionId,
      setIsLoading,
      setUiPhase,
      setActiveAiTurnId,
      setProviderContexts,
      selectedModels,
      mappingEnabled,
      mappingProvider,

    ],
  );

  // Register handler with API
  useEffect(() => {
    api.setPortMessageHandler(handler);
    return () => {
      api.setPortMessageHandler(null);
      streamingBufferRef.current?.clear();
    };
  }, [handler]);

  return { streamingBufferRef };
}
// Minimize streaming log noise in UI; toggle for deep debugging only
const STREAMING_DEBUG_UI = false;
