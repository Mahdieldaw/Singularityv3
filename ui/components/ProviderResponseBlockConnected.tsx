/**
 * @deprecated DEPRECATED: Side-by-side layout removed.
 * Logic migrated to useProviderActions hook and ModelResponsePanel.
 * Keep for reference until new system verified. Do not extend.
 */
import React, { useMemo, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  isReducedMotionAtom,
  turnsMapAtom,
  currentSessionIdAtom,
  turnStreamingStateFamily,
  activeRecomputeStateAtom,
  activeProviderTargetAtom,
  providerIdsForTurnFamily,
} from "../state/atoms";
import { useAtom } from "jotai";
import { ProviderKey, ProviderResponse } from "../types";
import ProviderResponseBlock from "./ProviderResponseBlock";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import { getLatestResponse, normalizeResponseArray } from "../utils/turn-helpers";
import type { AiTurn } from "../types";
import { normalizeProviderId } from "../utils/provider-id-mapper";
import api from "../services/extension-api";
import type { PrimitiveWorkflowRequest } from "../../shared/contract";

interface ProviderResponseBlockConnectedProps {
  aiTurnId: string;
  expectedProviders?: ProviderKey[];
}

function ProviderResponseBlockConnected({
  aiTurnId,
  expectedProviders
}: ProviderResponseBlockConnectedProps) {
  // Per-turn streaming state with active provider tracking
  const streamingState = useAtomValue(turnStreamingStateFamily(aiTurnId));
  const { isLoading, appStep: currentAppStep, activeProviderId } = streamingState;

  // Other global state
  const turnsMap = useAtomValue(turnsMapAtom);
  const isReducedMotion = useAtomValue(isReducedMotionAtom);
  const sessionId = useAtomValue(currentSessionIdAtom);

  // Subscribe to provider IDs only (not data) - critical for isolation
  const providerIds = useAtomValue(providerIdsForTurnFamily(aiTurnId));

  const aiTurn = turnsMap.get(aiTurnId) as AiTurn | undefined;
  if (!aiTurn) return null;

  // Check if a specific provider is the streaming target
  const isStreamingTarget = useCallback(
    (providerId: string) => activeProviderId === providerId,
    [activeProviderId]
  );

  // Retry handler for failed providers (recompute in-place)
  const setActiveRecomputeState = useSetAtom(activeRecomputeStateAtom);
  const handleRetryProvider = useCallback(async (providerId: string) => {
    if (!sessionId || !aiTurn) {
      console.warn("[ProviderResponseBlock] Cannot retry: missing session or turn data");
      return;
    }

    // Target existing AI turn for recompute
    console.log(`[ProviderResponseBlock] Retrying provider via recompute-batch: ${providerId}`, {
      aiTurnId,
      sessionId,
    });

    // Route streaming to the existing turn during recompute
    try {
      setActiveRecomputeState({ aiTurnId, stepType: "batch" as any, providerId });
    } catch (_) { /* non-fatal */ }

    // Use recompute primitive to update existing turn
    const primitive: PrimitiveWorkflowRequest = {
      type: "recompute",
      sessionId,
      sourceTurnId: aiTurnId,
      stepType: "batch" as any,
      targetProvider: providerId as ProviderKey,
      // For retries: send the frozen/original user prompt for this turn
      userMessage: (() => {
        try {
          const u = turnsMap.get(aiTurn.userTurnId) as any;
          return u && u.type === "user" && typeof u.text === "string" ? u.text : undefined;
        } catch {
          return undefined;
        }
      })(),
      useThinking: false,
    } as any;

    try {
      await api.executeWorkflow(primitive);
    } catch (error) {
      console.error("[ProviderResponseBlock] Retry failed:", error);
      // Clear recompute targeting on failure path in case backend didn't send failure yet
      try { setActiveRecomputeState(null); } catch { }
    }
  }, [sessionId, aiTurn, aiTurnId, setActiveRecomputeState]);

  if (!aiTurn) return null;


  // Build Copy All text: Synthesis, Mapping, All Options, then Batch Responses
  const copyAllText = useMemo(() => {
    if (!aiTurn) return "";
    const ORDER = ["gemini-exp", "claude", "gemini-pro", "qwen", "chatgpt", "gemini"];
    const nameMap = new Map(LLM_PROVIDERS_CONFIG.map((p) => [String(p.id), p.name]));

    function parseMappingResponse(response?: string | null) {
      if (!response) return { mapping: "", options: null as string | null };
      const separator = "===ALL_AVAILABLE_OPTIONS===";
      if (response.includes(separator)) {
        const [mainMapping, optionsSection] = response.split(separator);
        return { mapping: mainMapping.trim(), options: optionsSection.trim() };
      }
      const optionsPatterns = [
        /\*\*All Available Options:\*\*/i,
        /## All Available Options/i,
        /All Available Options:/i,
      ];
      for (const pattern of optionsPatterns) {
        const match = response.match(pattern);
        if (match && typeof (match as any).index === "number") {
          const idx = (match as any).index as number;
          return {
            mapping: response.substring(0, idx).trim(),
            options: response.substring(idx).trim(),
          };
        }
      }
      return { mapping: response, options: null };
    }

    const lines: string[] = [];

    // Synthesis
    ORDER.forEach((pid) => {
      const arr = aiTurn.synthesisResponses?.[pid] || [];
      const take = getLatestResponse(normalizeResponseArray(arr));
      const text = take?.text ? String(take.text) : "";
      if (text && text.trim().length > 0) {
        lines.push(`=== Synthesis • ${nameMap.get(pid) || pid} ===`);
        lines.push(text.trim());
        lines.push("\n---\n");
      }
    });

    // Mapping + Options
    ORDER.forEach((pid) => {
      const arr = aiTurn.mappingResponses?.[pid] || [];
      const take = getLatestResponse(normalizeResponseArray(arr));
      const raw = take?.text ? String(take.text) : "";
      if (raw && raw.trim().length > 0) {
        const { mapping, options } = parseMappingResponse(raw);
        if (mapping && mapping.trim().length > 0) {
          lines.push(`=== Mapping • ${nameMap.get(pid) || pid} ===`);
          lines.push(mapping.trim());
          lines.push("\n---\n");
        }
        if (options && options.trim().length > 0) {
          lines.push(`=== All Available Options • ${nameMap.get(pid) || pid} ===`);
          lines.push(options.trim());
          lines.push("\n---\n");
        }
      }
    });

    // Batch Responses
    ORDER.forEach((pid) => {
      const arr = aiTurn.batchResponses?.[pid] || [];
      const take = getLatestResponse(normalizeResponseArray(arr));
      const text = take?.text ? String(take.text) : "";
      if (text && text.trim().length > 0) {
        lines.push(`=== Batch Responses • ${nameMap.get(pid) || pid} ===`);
        lines.push(text.trim());
        lines.push("\n---\n");
      }
    });

    return lines.join("\n");
  }, [aiTurn]);

  // Targeting state
  const [activeTarget, setActiveTarget] = useAtom(activeProviderTargetAtom);
  const handleToggleTarget = useCallback((providerId: string) => {
    if (activeTarget?.aiTurnId === aiTurnId && activeTarget?.providerId === providerId) {
      setActiveTarget(null);
    } else {
      setActiveTarget({ aiTurnId, providerId });
    }
  }, [activeTarget, aiTurnId, setActiveTarget]);

  // Branch continuation handler
  const handleBranchContinue = useCallback(async (providerId: string, prompt: string) => {
    if (!sessionId || !aiTurn) {
      console.warn("[ProviderResponseBlock] Cannot branch: missing session or turn");
      return;
    }

    try {
      setActiveRecomputeState({ aiTurnId, stepType: "batch" as any, providerId });
    } catch (_) { /* non-fatal */ }

    const primitive: PrimitiveWorkflowRequest = {
      type: "recompute",
      sessionId,
      sourceTurnId: aiTurnId,
      stepType: "batch" as any,
      targetProvider: providerId as ProviderKey,
      userMessage: prompt,
      useThinking: false,
    } as any;

    try {
      await api.executeWorkflow(primitive);
    } catch (error) {
      console.error("[ProviderResponseBlock] Branch failed:", error);
      try { setActiveRecomputeState(null); } catch { }
    }
  }, [sessionId, aiTurn, aiTurnId, setActiveRecomputeState]);

  // Compute provider statuses for LEDs
  const providerStatuses = useMemo(() => {
    const statuses: Record<string, 'streaming' | 'completed' | 'error' | 'idle'> = {};
    if (!aiTurn) return statuses;

    LLM_PROVIDERS_CONFIG.forEach(p => {
      const pid = String(p.id);
      const synth = getLatestResponse(normalizeResponseArray(aiTurn.synthesisResponses?.[pid]));
      const map = getLatestResponse(normalizeResponseArray(aiTurn.mappingResponses?.[pid]));
      const batch = getLatestResponse(normalizeResponseArray(aiTurn.batchResponses?.[pid]));

      const all = [synth, map, batch].filter(Boolean);

      if (all.some(r => r?.status === 'streaming' || r?.status === 'pending')) {
        statuses[pid] = 'streaming';
      } else if (all.some(r => r?.status === 'error')) {
        statuses[pid] = 'error';
      } else if (all.some(r => r?.status === 'completed')) {
        statuses[pid] = 'completed';
      } else {
        statuses[pid] = 'idle';
      }
    });
    return statuses;
  }, [aiTurn]);

  return (
    <ProviderResponseBlock
      providerIds={providerIds}
      isStreamingTarget={isStreamingTarget}
      aiTurnId={aiTurnId}
      sessionId={sessionId || undefined}
      userTurnId={aiTurn.userTurnId}
      onRetryProvider={handleRetryProvider}
      onToggleTarget={handleToggleTarget}
      onBranchContinue={handleBranchContinue}
      activeTarget={activeTarget?.aiTurnId === aiTurnId ? activeTarget : null}
      isLoading={isLoading}
      currentAppStep={currentAppStep}
      copyAllText={copyAllText}
      isReducedMotion={isReducedMotion}
      providerStatuses={providerStatuses}
    />
  );
}

export default React.memo(ProviderResponseBlockConnected);