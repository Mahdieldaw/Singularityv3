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

  // Initialize batch responses for all active providers as arrays
  const pendingBatch: Record<string, ProviderResponse[]> = {};
  activeProviders.forEach((pid) => {
    pendingBatch[pid] = [
      {
        providerId: pid,
        text: "",
        status: PRIMARY_STREAMING_PROVIDER_IDS.includes(String(pid))
          ? "streaming"
          : "pending",
        createdAt: now,
        updatedAt: now,
      },
    ];
  });

  // Initialize mapping responses if enabled
  const mappingResponses: Record<string, ProviderResponse[]> = {};
  if (shouldUseMapping && mappingProvider) {
    mappingResponses[mappingProvider] = [
      {
        providerId: mappingProvider as ProviderKey,
        text: "",
        status: PRIMARY_STREAMING_PROVIDER_IDS.includes(String(mappingProvider))
          ? "streaming"
          : "pending",
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  // Initialize singularity responses if enabled
  const singularityResponses: Record<string, ProviderResponse[]> = {};
  if (shouldUseSingularity && singularityProvider) {
    singularityResponses[singularityProvider] = [
      {
        providerId: singularityProvider as ProviderKey,
        text: "",
        status: PRIMARY_STREAMING_PROVIDER_IDS.includes(String(singularityProvider))
          ? "streaming"
          : "pending",
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  const effectiveUserTurnId = explicitUserTurnId || userTurn.id;

  return {
    type: "ai",
    id: aiTurnId,
    createdAt: now,
    sessionId: userTurn.sessionId,
    threadId: DEFAULT_THREAD,
    userTurnId: effectiveUserTurnId,
    batchResponses: pendingBatch,
    mappingResponses,
    singularityResponses,
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
  let batchChanged = false;
  let mappingChanged = false;
  let singularityChanged = false;

  updates.forEach(({ providerId, text: delta, status, responseType, isReplace }) => {
    if (responseType === "batch") {
      batchChanged = true;
      if (!aiTurn.batchResponses) aiTurn.batchResponses = {};
      const arr = normalizeResponseArray(aiTurn.batchResponses[providerId]);

      const latest = arr.length > 0 ? arr[arr.length - 1] : undefined;
      const isLatestTerminal = latest && (latest.status === "completed" || latest.status === "error");
      const isNewStream = status === "streaming" || status === "pending";

      if (latest && !isLatestTerminal) {
        arr[arr.length - 1] = {
          ...latest,
          text: isReplace ? delta : (latest.text || "") + delta,
          status: status as any,
          updatedAt: Date.now(),
        };
      } else if (isLatestTerminal && !isNewStream) {
        arr[arr.length - 1] = {
          ...latest,
          text: isReplace ? delta : (latest.text || "") + delta,
          status: status as any,
          updatedAt: Date.now(),
        };
      } else {
        arr.push({
          providerId: providerId as ProviderKey,
          text: delta,
          status: status as any,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      aiTurn.batchResponses[providerId] = arr;

    } else if (responseType === "mapping") {
      mappingChanged = true;
      if (!aiTurn.mappingResponses) aiTurn.mappingResponses = {};
      const arr = normalizeResponseArray(aiTurn.mappingResponses[providerId]);

      const latest = arr.length > 0 ? arr[arr.length - 1] : undefined;
      const isLatestTerminal = latest && (latest.status === "completed" || latest.status === "error");

      if (latest && !isLatestTerminal) {
        arr[arr.length - 1] = {
          ...latest,
          text: isReplace ? delta : (latest.text || "") + delta,
          status: status as any,
          updatedAt: Date.now(),
        };
      } else {
        arr.push({
          providerId: providerId as ProviderKey,
          text: delta,
          status: status as any,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      aiTurn.mappingResponses[providerId] = arr;
    } else if (responseType === "singularity") {
      singularityChanged = true;
      if (!aiTurn.singularityResponses) aiTurn.singularityResponses = {};
      const arr = normalizeResponseArray(aiTurn.singularityResponses[providerId]);
      const latest = arr.length > 0 ? arr[arr.length - 1] : undefined;
      const isLatestTerminal =
        latest && (latest.status === "completed" || latest.status === "error");

      if (latest && !isLatestTerminal) {
        arr[arr.length - 1] = {
          ...latest,
          text: isReplace ? delta : (latest.text || "") + delta,
          status: status as any,
          updatedAt: Date.now(),
        };
      } else {
        arr.push({
          providerId: providerId as ProviderKey,
          text: delta,
          status: status as any,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      aiTurn.singularityResponses[providerId] = arr;
    }
  });

  // ✅ Bump versions only for changed types
  if (batchChanged) aiTurn.batchVersion = (aiTurn.batchVersion ?? 0) + 1;
  if (mappingChanged) aiTurn.mappingVersion = (aiTurn.mappingVersion ?? 0) + 1;
  if (singularityChanged) aiTurn.singularityVersion = (aiTurn.singularityVersion ?? 0) + 1;
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
    const providers = round.providers || {};
    const hasProviderData = Object.keys(providers).length > 0;

    if (hasProviderData) {
      // Transform providers object to batchResponses (arrays per provider)
      const batchResponses: Record<string, ProviderResponse[]> = {};
      Object.entries(providers).forEach(([providerId, data]: [string, any]) => {
        const arr: ProviderResponse[] = Array.isArray(data)
          ? (data as ProviderResponse[])
          : [
            {
              providerId: providerId as ProviderKey,
              text: (data?.text as string) || "",
              status: "completed",
              createdAt: round.completedAt || round.createdAt || Date.now(),
              updatedAt: round.completedAt || round.createdAt || Date.now(),
              meta: data?.meta || {},
            },
          ];
        batchResponses[providerId] = arr;
      });

      // Normalize mapping/other responses to arrays
      const normalizeResponseMap = (
        raw: any
      ): Record<string, ProviderResponse[]> => {
        if (!raw) return {};
        const result: Record<string, ProviderResponse[]> = {};
        const hydrateTextFromMeta = (resp: any): ProviderResponse => {
          const baseMeta = resp?.meta || {};
          const ctxEntry =
            providerContexts && typeof providerContexts === "object"
              ? (providerContexts as any)[resp?.providerId]
              : undefined;
          const ctxMeta =
            ctxEntry && typeof ctxEntry === "object"
              ? (ctxEntry as any).meta || {}
              : {};
          const mergedMeta = { ...ctxMeta, ...baseMeta };
          const fromMeta =
            typeof mergedMeta?.rawMappingText === "string"
              ? mergedMeta.rawMappingText
              : "";
          const fromText = typeof resp?.text === "string" ? resp.text : "";
          const text =
            fromMeta && fromMeta.length >= fromText.length ? fromMeta : fromText;
          return {
            ...(resp || {}),
            text,
            meta: mergedMeta,
          } as ProviderResponse;
        };
        Object.entries(raw).forEach(([pid, val]: [string, any]) => {
          if (Array.isArray(val)) {
            result[pid] = val.map(hydrateTextFromMeta);
          } else {
            result[pid] = [hydrateTextFromMeta(val)];
          }
        });
        return result;
      };

      const aiTurn: AiTurn = {
        type: "ai",
        id: round.aiTurnId || `ai-${round.completedAt || Date.now()}`,
        userTurnId: round.userTurnId,
        sessionId: sessionId,
        threadId: DEFAULT_THREAD,
        createdAt: round.completedAt || round.createdAt || Date.now(),
        batchResponses,
        mappingResponses: normalizeResponseMap(round.mappingResponses),
        singularityResponses: normalizeResponseMap(round.singularityResponses),
        mapperArtifact: round.mapperArtifact || undefined,
        pipelineArtifacts: round.pipelineArtifacts || undefined,
        singularityOutput: round.singularityOutput || undefined,
        pipelineStatus: round.pipelineStatus || undefined,
        meta: round.meta || {},
      };
      normalized.push(aiTurn);
    }
  });

  return normalized;
}
