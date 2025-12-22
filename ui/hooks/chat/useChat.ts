// ui/hooks/useChat.ts - MAP-BASED STATE MANAGEMENT
import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import api from "../../services/extension-api";
import {
  turnsMapAtom,
  turnIdsAtom,
  messagesAtom,
  currentSessionIdAtom,
  isLoadingAtom,
  selectedModelsAtom,
  mappingEnabledAtom,
  mappingProviderAtom,
  synthesisProviderAtom,
  refinerProviderAtom,
  antagonistProviderAtom,
  powerUserModeAtom,
  thinkOnChatGPTAtom,
  activeAiTurnIdAtom,
  currentAppStepAtom,
  uiPhaseAtom,
  isHistoryPanelOpenAtom,

  iscomposingAtom, // Import new atom
  composerModelAtom, // Import new atom
  analystModelAtom,
  hasRejectedRefinementAtom,
  activeProviderTargetAtom,
  launchpadDraftsAtom, // Import launchpad atom
  launchpadOpenAtom,
} from "../../state/atoms";
// Optimistic AI turn creation is now handled upon TURN_CREATED from backend
import type {
  ProviderKey,
  PrimitiveWorkflowRequest,
} from "../../../shared/contract";
import { LLM_PROVIDERS_CONFIG } from "../../constants";
import { computeThinkFlag } from "../../../src/think/computeThinkFlag.js";

import type {
  HistorySessionSummary,
  FullSessionPayload,
  TurnMessage,
  UserTurn,
  AiTurn,
  ProviderResponse,
} from "../../types";

export function useChat() {
  // Reads
  const selectedModels = useAtomValue(selectedModelsAtom);
  const mappingEnabled = useAtomValue(mappingEnabledAtom);
  const mappingProvider = useAtomValue(mappingProviderAtom);
  const synthesisProvider = useAtomValue(synthesisProviderAtom);
  const powerUserMode = useAtomValue(powerUserModeAtom);
  const thinkOnChatGPT = useAtomValue(thinkOnChatGPTAtom);
  const currentSessionId = useAtomValue(currentSessionIdAtom);
  const turnIds = useAtomValue(turnIdsAtom);
  const refinerProvider = useAtomValue(refinerProviderAtom);
  const antagonistProvider = useAtomValue(antagonistProviderAtom);



  // Writes
  const setTurnsMap = useSetAtom(turnsMapAtom);
  const setTurnIds = useSetAtom(turnIdsAtom);
  const setCurrentSessionId = useSetAtom(currentSessionIdAtom);
  // pendingUserTurns is no longer used in the new TURN_CREATED flow
  const setIsLoading = useSetAtom(isLoadingAtom);
  const setActiveAiTurnId = useSetAtom(activeAiTurnIdAtom);
  const setCurrentAppStep = useSetAtom(currentAppStepAtom);
  const setUiPhase = useSetAtom(uiPhaseAtom);
  const setIsHistoryPanelOpen = useSetAtom(isHistoryPanelOpenAtom);

  const setiscomposing = useSetAtom(iscomposingAtom); // Set new atom
  const setHasRejectedRefinement = useSetAtom(hasRejectedRefinementAtom);
  const setActiveTarget = useSetAtom(activeProviderTargetAtom);

  const setLaunchpadDrafts = useSetAtom(launchpadDraftsAtom);
  const setLaunchpadOpen = useSetAtom(launchpadOpenAtom);

  const sendMessage = useCallback(
    async (prompt: string, mode: "new" | "continuation") => {
      if (!prompt || !prompt.trim()) return;

      setHasRejectedRefinement(false); // Reset rejection state on send

      setIsLoading(true);
      setUiPhase("streaming");
      setCurrentAppStep("initial");

      const activeProviders = LLM_PROVIDERS_CONFIG
        .filter((p) => selectedModels[p.id])
        .map((p) => p.id as ProviderKey);

      const ts = Date.now();
      const userTurnId = `user-${ts}-${Math.random().toString(36).slice(2, 8)}`;
      const userTurn: UserTurn = {
        type: "user",
        id: userTurnId,
        text: prompt,
        createdAt: ts,
        sessionId: currentSessionId || null,
      };

      // Write user turn to Map + IDs
      setTurnsMap((draft: Map<string, TurnMessage>) => {
        draft.set(userTurn.id, userTurn);
      });
      setTurnIds((draft: string[]) => {
        draft.push(userTurn.id);
      });
      // No pending cache: rely on Jotai atom serialization across updaters

      try {
        const shouldUseSynthesis = !!synthesisProvider;

        const fallbackMapping = (() => {
          try {
            return localStorage.getItem("htos_mapping_provider");
          } catch {
            return null;
          }
        })();
        const effectiveMappingProvider =
          mappingProvider || fallbackMapping || null;
        // Uniform behavior: allow Map to run even if its provider is not in the witness selection
        const shouldUseMapping = !!(
          mappingEnabled &&
          effectiveMappingProvider
        );

        const fallbackRefiner = (() => {
          try {
            return localStorage.getItem("htos_refiner_provider") || localStorage.getItem("htos_last_refiner_model");
          } catch {
            return null;
          }
        })();
        const effectiveRefinerProvider = refinerProvider || fallbackRefiner || null;

        const fallbackAntagonist = (() => {
          try {
            return localStorage.getItem("htos_antagonist_provider");
          } catch {
            return null;
          }
        })();
        const effectiveAntagonistProvider = antagonistProvider || fallbackAntagonist || null;

        const isInitialize =
          mode === "new" && (!currentSessionId || turnIds.length === 0);

        // Validate continuation has a sessionId and bind the port before sending
        if (!isInitialize) {
          if (!currentSessionId) {
            console.error(
              "[useChat] Continuation requested but currentSessionId is missing. Aborting send.",
            );
            setIsLoading(false);
            setUiPhase("awaiting_action");
            return;
          }
          // Proactively bind/reconnect the port scoped to the target session
          try {
            await api.ensurePort({ sessionId: currentSessionId });
          } catch (e) {
            console.warn(
              "[useChat] ensurePort failed prior to extend; proceeding with executeWorkflow",
              e,
            );
          }
        }

        // Build NEW primitive request shape
        const primitive: PrimitiveWorkflowRequest = isInitialize
          ? {
            type: "initialize",
            sessionId: null, // backend is authoritative; do not generate in UI
            userMessage: prompt,
            providers: activeProviders,
            includeMapping: shouldUseMapping,
            includeSynthesis: shouldUseSynthesis,
            synthesizer: shouldUseSynthesis
              ? (synthesisProvider as ProviderKey)
              : undefined,
            mapper: shouldUseMapping
              ? (effectiveMappingProvider as ProviderKey)
              : undefined,
            refiner: shouldUseSynthesis && effectiveRefinerProvider // Only run refiner if synthesis acts (it audits synthesis)
              ? (effectiveRefinerProvider as ProviderKey)
              : undefined,
            antagonist: effectiveAntagonistProvider
              ? (effectiveAntagonistProvider as ProviderKey)
              : undefined,
            includeRefiner: !!(shouldUseSynthesis && effectiveRefinerProvider),
            includeAntagonist: !!effectiveAntagonistProvider,
            useThinking: computeThinkFlag({
              modeThinkButtonOn: thinkOnChatGPT,
              input: prompt,
            }),
            providerMeta: {},
            clientUserTurnId: userTurnId,
          }
          : {
            type: "extend",
            sessionId: currentSessionId as string,
            userMessage: prompt,
            providers: activeProviders,
            includeMapping: shouldUseMapping,
            includeSynthesis: shouldUseSynthesis,
            synthesizer: shouldUseSynthesis
              ? (synthesisProvider as ProviderKey)
              : undefined,
            mapper: shouldUseMapping
              ? (effectiveMappingProvider as ProviderKey)
              : undefined,
            refiner: shouldUseSynthesis && effectiveRefinerProvider
              ? (effectiveRefinerProvider as ProviderKey)
              : undefined,
            antagonist: effectiveAntagonistProvider
              ? (effectiveAntagonistProvider as ProviderKey)
              : undefined,
            includeRefiner: !!(shouldUseSynthesis && effectiveRefinerProvider),
            includeAntagonist: !!effectiveAntagonistProvider,
            useThinking: computeThinkFlag({
              modeThinkButtonOn: thinkOnChatGPT,
              input: prompt,
            }),
            providerMeta: {},
            clientUserTurnId: userTurnId,
          };

        // AI turn will be created upon TURN_CREATED from backend
        // Port is already ensured above for extend; for initialize, executeWorkflow ensures port
        await api.executeWorkflow(primitive);
        // For initialize, sessionId will be set by TURN_CREATED handler; do not set here
      } catch (err) {
        console.error("Failed to execute workflow:", err);
        setIsLoading(false);
        setActiveAiTurnId(null);
      }
    },
    [
      setTurnsMap,
      setTurnIds,
      selectedModels,
      currentSessionId,
      setCurrentSessionId,
      setIsLoading,
      setActiveAiTurnId,
      synthesisProvider,
      mappingEnabled,
      mappingProvider,
      refinerProvider,
      antagonistProvider,
      thinkOnChatGPT,
      powerUserMode,
      turnIds.length,
    ],
  );

  const newChat = useCallback(() => {
    // Reset to initial welcome state for a brand-new conversation
    setCurrentSessionId(null);
    setTurnsMap(new Map());
    setTurnIds([]);
    setActiveAiTurnId(null);
    setActiveTarget(null);
  }, [setCurrentSessionId, setTurnsMap, setTurnIds, setActiveAiTurnId, setActiveTarget]);

  const selectChat = useCallback(
    async (session: HistorySessionSummary) => {
      const sessionId = session.sessionId || session.id;
      if (!sessionId) {
        console.error("[useChat] No sessionId in session object");
        return;
      }

      setCurrentSessionId(sessionId);
      setActiveTarget(null);
      setIsLoading(true);

      try {
        const response = await api.getHistorySession(sessionId);
        const fullSession = response as unknown as FullSessionPayload;

        if (!fullSession || !fullSession.turns) {
          console.warn("[useChat] Empty session loaded");
          setTurnsMap((draft: Map<string, TurnMessage>) => {
            draft.clear();
          });
          setTurnIds((draft: string[]) => {
            draft.length = 0;
          });
          setIsLoading(false);
          return;
        }

        /**
         * CRITICAL FIX: Transform backend "rounds" format
         * Backend sends: { userTurnId, aiTurnId, user: {...}, providers: {...}, synthesisResponses, mappingResponses }
         */
        const newIds: string[] = [];
        const newMap = new Map<string, TurnMessage>();

        fullSession.turns.forEach((round: any) => {
          // 1. Extract UserTurn
          if (round.user && round.user.text) {
            const userTurn: UserTurn = {
              type: "user",
              id:
                round.userTurnId || round.user.id || `user-${round.createdAt}`,
              text: round.user.text,
              createdAt: round.user.createdAt || round.createdAt || Date.now(),
              sessionId: fullSession.sessionId,
            };
            newIds.push(userTurn.id);
            newMap.set(userTurn.id, userTurn);
          }

          // 2. Extract AiTurn
          const providers = round.providers || {};
          const hasProviderData = Object.keys(providers).length > 0;

          if (hasProviderData) {
            // Transform providers object to batchResponses (arrays per provider)
            const batchResponses: Record<string, ProviderResponse[]> = {};
            Object.entries(providers).forEach(
              ([providerId, data]: [string, any]) => {
                const arr: ProviderResponse[] = Array.isArray(data)
                  ? (data as ProviderResponse[])
                  : [
                    {
                      providerId: providerId as ProviderKey,
                      text: (data?.text as string) || "",
                      status: "completed",
                      createdAt:
                        round.completedAt || round.createdAt || Date.now(),
                      updatedAt:
                        round.completedAt || round.createdAt || Date.now(),
                      meta: data?.meta || {},
                    },
                  ];
                batchResponses[providerId] = arr;
              },
            );

            // Normalize synthesis/mapping responses to arrays
            const normalizeSynthMap = (
              raw: any,
            ): Record<string, ProviderResponse[]> => {
              if (!raw) return {};
              const result: Record<string, ProviderResponse[]> = {};
              Object.entries(raw).forEach(([pid, val]: [string, any]) => {
                if (Array.isArray(val)) {
                  result[pid] = val;
                } else {
                  result[pid] = [val];
                }
              });
              return result;
            };

            const aiTurn: AiTurn = {
              type: "ai",
              id: round.aiTurnId || `ai-${round.completedAt || Date.now()}`,
              userTurnId: round.userTurnId,
              sessionId: fullSession.sessionId,
              threadId: "default-thread",
              createdAt: round.completedAt || round.createdAt || Date.now(),
              batchResponses,
              synthesisResponses: normalizeSynthMap(round.synthesisResponses),
              mappingResponses: normalizeSynthMap(round.mappingResponses),
              refinerResponses: normalizeSynthMap(round.refinerResponses),
              antagonistResponses: normalizeSynthMap(round.antagonistResponses),
            };
            newIds.push(aiTurn.id);
            newMap.set(aiTurn.id, aiTurn);
          }
        });

        console.log("[useChat] Loaded session with", newIds.length, "turns");

        // Replace Map + IDs atomically
        setTurnsMap(newMap);
        setTurnIds(newIds);

        await api.ensurePort({ sessionId });
      } catch (error) {
        console.error("[useChat] Error loading session:", error);
        setTurnsMap((draft: Map<string, TurnMessage>) => {
          draft.clear();
        });
        setTurnIds((draft: string[]) => {
          draft.length = 0;
        });
      } finally {
        setIsLoading(false);
        setIsHistoryPanelOpen(false);
      }
    },
    [
      setTurnsMap,
      setTurnIds,
      setCurrentSessionId,
      setIsLoading,
      setIsHistoryPanelOpen,
      setActiveTarget,
    ],
  );

  const deleteChat = useCallback(
    async (sessionId: string): Promise<boolean> => {
      try {
        const result = await api.deleteBackgroundSession(sessionId);
        const removed = !!result?.removed;

        // If the deleted session is currently active, clear chat state
        if (removed && currentSessionId && currentSessionId === sessionId) {
          setCurrentSessionId(null);
          setTurnsMap(new Map());
          setTurnIds([]);
          setActiveAiTurnId(null);
          setActiveTarget(null);
        }

        return removed;
      } catch (err) {
        console.error("Failed to delete session", err);
        return false;
      }
    },
    [
      currentSessionId,
      setCurrentSessionId,
      setTurnsMap,
      setTurnIds,
      setActiveAiTurnId,
      setActiveTarget,
    ],
  );

  const deleteChats = useCallback(
    async (sessionIds: string[]): Promise<{ removed: string[] }> => {
      try {
        const response = await api.deleteBackgroundSessions(sessionIds);
        const removedIds = Array.isArray(response?.ids) ? response.ids : [];
        // If active chat is among removed, clear state
        if (currentSessionId && removedIds.includes(currentSessionId)) {
          setCurrentSessionId(null);
          setTurnsMap(new Map());
          setTurnIds([]);
          setActiveAiTurnId(null);
          setActiveTarget(null);
        }
        return { removed: removedIds };
      } catch (err) {
        console.error("Failed to batch delete sessions", err);
        return { removed: [] };
      }
    },
    [
      currentSessionId,
      setCurrentSessionId,
      setTurnsMap,
      setTurnIds,
      setActiveAiTurnId,
      setActiveTarget,
    ],
  );

  const turnsMap = useAtomValue(turnsMapAtom);

  const composerModel = useAtomValue(composerModelAtom);
  const analystModel = useAtomValue(analystModelAtom);


  const runComposerFlow = useCallback(
    async (draftPrompt: string, mode: "compose" | "explain", originalPromptContext?: string) => {
      if (!draftPrompt || !draftPrompt.trim()) return;

      setiscomposing(true);

      try {
        const lastTurnId = turnIds[turnIds.length - 1];

        let userPrompt = "";
        let synthesisText = "";
        let mappingText = "";
        let batchText = "";

        if (lastTurnId) {
          const lastTurn = turnsMap.get(lastTurnId);
          if (lastTurn && lastTurn.type === "ai") {
            const aiTurn = lastTurn as AiTurn;
            const userTurn = turnsMap.get(aiTurn.userTurnId);
            userPrompt = userTurn?.type === "user" ? userTurn.text : "";

            synthesisText = Object.values(aiTurn.synthesisResponses || {})
              .flat()
              .map((r) => r.text)
              .join("\n\n");

            mappingText = Object.values(aiTurn.mappingResponses || {})
              .flat()
              .map((r) => r.text)
              .join("\n\n");

            batchText = Object.entries(aiTurn.batchResponses || {})
              .map(([pid, v]: [string, any]) => {
                const arr = Array.isArray(v) ? v : [v];
                const last = arr[arr.length - 1];
                return `[${pid}]: ${last?.text || ""}`;
              })
              .join("\n\n");
          }
        }

        const context = {
          userPrompt,
          synthesisText,
          mappingText,
          batchText,
          sessionId: currentSessionId || null,
          isInitialize: !currentSessionId || turnIds.length === 0,
        };

        // Determine the User Intent (Original Prompt)
        // If provided (chaining), use it. Otherwise, if starting fresh, the input IS the original.
        const effectiveOriginal = originalPromptContext || draftPrompt;

        if (mode === "compose") {
          // Compose Mode: Run Composer
          // Note: In new flow, we don't automatically pass critique unless we chain it. 
          // For now, simple run.
          const result = await api.runComposer(draftPrompt, context, composerModel ?? undefined);

          if (result) {
            const snippet = (result.refinedPrompt || "").slice(0, 60).trim();
            const newDraft: any = {
              id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              title: `Composer – ${snippet}`,
              text: result.refinedPrompt,
              source: "composer",
              createdAt: Date.now(),
              originalPrompt: effectiveOriginal, // PERSIST INTENT
              primarySectionId: 'refined',
              sections: [
                { id: 'refined', title: 'Refined Prompt', text: result.refinedPrompt },
                ...(result.explanation ? [{ id: 'notes', title: 'Notes', text: result.explanation }] : [])
              ],
            };
            setLaunchpadDrafts((prev: any[]) => [newDraft, ...prev]);
            setLaunchpadOpen(true);
          }
        } else {
          // Explain Mode: Run Analyst
          // analyze the current text box content (draftPrompt) as the "candidate"
          const candidatePrompt = draftPrompt;

          const result = await api.runAnalyst(
            effectiveOriginal, // User Intent
            context,
            candidatePrompt, // The Text to Analyze
            analystModel ?? undefined,
            effectiveOriginal
          );

          if (result) {
            const ts = Date.now();
            const snippet = (candidatePrompt || "").slice(0, 60).trim();
            const sections: any[] = [];
            const primaryId = 'audit';

            const auditText = result.audit || "";
            if (auditText) {
              sections.push({ id: 'audit', title: 'Audit', text: auditText });
            }
            if (result.variants && result.variants.length > 0) {
              const numbered = result.variants.map((v, i) => `${i + 1}. ${v}`).join('\n\n');
              sections.push({ id: 'variants', title: 'Variants', text: numbered });
            }

            const analystDraft: any = {
              id: `draft-${ts}-${Math.random().toString(36).slice(2, 8)}`,
              title: `Analyst – ${snippet}`,
              text: auditText || (result.variants || []).join('\n\n'),
              source: "analyst-audit",
              createdAt: ts,
              originalPrompt: effectiveOriginal, // PERSIST INTENT
              primarySectionId: primaryId,
              sections,
            };
            setLaunchpadDrafts((prev: any[]) => [analystDraft, ...prev]);
            setLaunchpadOpen(true);
          }
        }

      } catch (err) {
        console.error("Failed to run composer flow:", err);
      } finally {
        setiscomposing(false);
      }
    },
    [
      turnIds,
      turnsMap,
      setiscomposing,
      currentSessionId,
      composerModel,
      analystModel,
      setLaunchpadDrafts,
      setLaunchpadOpen
    ],
  );

  const abort = useCallback(async (): Promise<void> => {
    try {
      const sid = currentSessionId;
      if (!sid) {
        console.warn("[useChat] abort() called but no currentSessionId");
      } else {
        await api.abortWorkflow(sid);
      }
    } catch (err) {
      console.error("[useChat] Failed to abort workflow:", err);
    } finally {
      // Immediately reflect stop intent in UI; backend will send finalization if applicable
      setIsLoading(false);
      setUiPhase("awaiting_action");
    }
  }, [currentSessionId, setIsLoading, setUiPhase]);

  // Backward-compat: derive messages for consumers still expecting it
  const messages = useAtomValue(messagesAtom);
  return {
    sendMessage,
    newChat,
    selectChat,
    deleteChat,
    deleteChats,
    abort,
    runComposerFlow,
    messages,
  };
}
