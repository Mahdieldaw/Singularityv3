// ui/utils/turn-helpers.ts - ALIGNED VERSION
import type { AiTurn, ProviderResponse, UserTurn, ProviderKey } from "../types";
import { PRIMARY_STREAMING_PROVIDER_IDS } from "../constants";
import { DEFAULT_THREAD } from "../../shared/messaging";

/**
 * Normalize a response value to ProviderResponse[]
 * Backend can send either single object or array
 */
export function normalizeResponseArray(value: any): ProviderResponse[] {
  if (!value) return [];
  if (Array.isArray(value)) return value as ProviderResponse[];
  return [value as ProviderResponse];
}

/**
 * Safely get the latest response from a provider's response array
 */
export function getLatestResponse(
  responses: ProviderResponse[] | ProviderResponse | undefined,
): ProviderResponse | undefined {
  if (!responses) return undefined;
  if (Array.isArray(responses)) return responses[responses.length - 1];
  return responses as ProviderResponse;
}

export function createOptimisticAiTurn(
  aiTurnId: string,
  userTurn: UserTurn,
  activeProviders: ProviderKey[],
  shouldUseMapping: boolean,
  shouldUseSingularity: boolean,
  mappingProvider?: string,
  singularityProvider?: string,
  timestamp?: number,
  explicitUserTurnId?: string,
  requestedFeatures?: { mapping: boolean; singularity: boolean },
): AiTurn {
  const now = timestamp || Date.now();

  const pendingBatch = activeProviders.length
    ? {
      responses: Object.fromEntries(
        activeProviders.map((pid, index) => [
          String(pid),
          {
            text: "",
            modelIndex: index,
            status: PRIMARY_STREAMING_PROVIDER_IDS.includes(String(pid))
              ? "streaming"
              : "pending",
          },
        ]),
      ),
    }
    : undefined;

  const effectiveUserTurnId = explicitUserTurnId || userTurn.id;

  return {
    type: "ai",
    id: aiTurnId,
    createdAt: now,
    sessionId: userTurn.sessionId,
    threadId: DEFAULT_THREAD,
    userTurnId: effectiveUserTurnId,
    ...(pendingBatch ? { batch: pendingBatch } : {}),
    meta: {
      isOptimistic: true,
      expectedProviders: activeProviders, // ✅ STORE expected providers
      ...(requestedFeatures ? { requestedFeatures } : {}),
      ...(mappingProvider ? { mapper: mappingProvider } : {}),
      ...(singularityProvider ? { singularity: singularityProvider } : {}),
    },
  };
}


export function applyStreamingUpdates(
  aiTurn: AiTurn,
  updates: Array<{
    providerId: string;
    text: string;
    status: string;
    responseType:
    | "batch"
    | "mapping"
    | "singularity";
    isReplace?: boolean;
  }>,
) {
  updates.forEach(({ providerId, text: delta, status, responseType, isReplace }) => {
    if (responseType === "batch") {
      if (!aiTurn.batch) aiTurn.batch = { responses: {} };
      const existing = aiTurn.batch.responses[providerId];
      const nextText = isReplace
        ? delta
        : `${existing?.text || ""}${delta}`;
      aiTurn.batch.responses[providerId] = {
        text: nextText,
        modelIndex: existing?.modelIndex ?? 0,
        status,
        meta: existing?.meta,
      };
      aiTurn.batchVersion = (aiTurn.batchVersion ?? 0) + 1;
    } else if (responseType === "singularity") {
      const existing = aiTurn.singularity;
      const nextText = isReplace
        ? delta
        : `${existing?.output || ""}${delta}`;
      aiTurn.singularity = {
        prompt: existing?.prompt || "",
        output: nextText,
        traversalState: existing?.traversalState,
      };
      aiTurn.singularityVersion = (aiTurn.singularityVersion ?? 0) + 1;
    }
  });
}

/**
 * Transforms raw backend "rounds" (from fullSession.turns) into normalized UserTurn/AiTurn objects
 * mirroring the logic in useChat.ts selectChat
 */
export function normalizeBackendRoundsToTurns(
  rawTurns: any[],
  sessionId: string,
  providerContexts?: Record<string, any>
): Array<UserTurn | AiTurn> {
  if (!rawTurns) return [];
  const normalized: Array<UserTurn | AiTurn> = [];

  rawTurns.forEach((round: any) => {
    if (!round) return;

    // 1. Extract UserTurn
    if (round.user && round.user.text) {
      const userTurn: UserTurn = {
        type: "user",
        id: round.userTurnId || round.user.id || `user-${round.createdAt}`,
        text: round.user.text,
        createdAt: round.user.createdAt || round.createdAt || Date.now(),
        sessionId: sessionId,
      };
      normalized.push(userTurn);
    }

    // 2. Extract AiTurn
    const hasPhases = !!round.batch || !!round.mapping || !!round.singularity;

    if (hasPhases) {
      const aiTurn: AiTurn = {
        type: "ai",
        id: round.aiTurnId || `ai-${round.completedAt || Date.now()}`,
        userTurnId: round.userTurnId,
        sessionId: sessionId,
        threadId: DEFAULT_THREAD,
        createdAt: round.completedAt || round.createdAt || Date.now(),
        ...(round.batch ? { batch: round.batch } : {}),
        ...(round.mapping ? { mapping: round.mapping } : {}),
        ...(round.singularity ? { singularity: round.singularity } : {}),
        pipelineStatus: round.pipelineStatus || undefined,
        meta: round.meta || {},
      };
      normalized.push(aiTurn);
    }
  });

  return normalized;
}
