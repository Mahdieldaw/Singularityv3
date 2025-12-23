// ui/utils/turn-helpers.ts - ALIGNED VERSION
import type { AiTurn, ProviderResponse, UserTurn, ProviderKey } from "../types";
import { PRIMARY_STREAMING_PROVIDER_IDS } from "../constants";

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
  shouldUseSynthesis: boolean,
  shouldUseRefiner: boolean,
  mappingProvider?: string,
  synthesisProvider?: string,
  refinerProvider?: string,
  antagonistProvider?: string,
  timestamp?: number,
  explicitUserTurnId?: string,
  requestedFeatures?: { synthesis: boolean; mapping: boolean; refiner: boolean; antagonist: boolean },
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

  // Initialize synthesis responses if enabled
  const synthesisResponses: Record<string, ProviderResponse[]> = {};
  if (shouldUseSynthesis && synthesisProvider) {
    synthesisResponses[synthesisProvider] = [
      {
        providerId: synthesisProvider as ProviderKey,
        text: "",
        status: PRIMARY_STREAMING_PROVIDER_IDS.includes(
          String(synthesisProvider),
        )
          ? "streaming"
          : "pending",
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

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
  // --- NEW: Refiner setup ---
  const refinerResponses: Record<string, ProviderResponse[]> = {};
  if (shouldUseRefiner && refinerProvider) {
    refinerResponses[refinerProvider] = [{
      providerId: refinerProvider as ProviderKey,
      text: "",
      status: PRIMARY_STREAMING_PROVIDER_IDS.includes(String(refinerProvider)) ? "streaming" : "pending",
      createdAt: now,
      updatedAt: now,
    }];
  }

  // --- NEW: Antagonist setup ---
  const antagonistResponses: Record<string, ProviderResponse[]> = {};
  if (requestedFeatures?.antagonist && antagonistProvider) {
    antagonistResponses[antagonistProvider] = [{
      providerId: antagonistProvider as ProviderKey,
      text: "",
      status: PRIMARY_STREAMING_PROVIDER_IDS.includes(String(antagonistProvider)) ? "streaming" : "pending",
      createdAt: now,
      updatedAt: now,
    }];
  }

  const effectiveUserTurnId = explicitUserTurnId || userTurn.id;

  return {
    type: "ai",
    id: aiTurnId,
    createdAt: now,
    sessionId: userTurn.sessionId,
    threadId: "default-thread",
    userTurnId: effectiveUserTurnId,
    batchResponses: pendingBatch,
    synthesisResponses,
    mappingResponses,
    refinerResponses,
    antagonistResponses,
    meta: {
      isOptimistic: true,
      expectedProviders: activeProviders, // ✅ STORE expected providers
      synthesizer: synthesisProvider,
      mapper: mappingProvider,
      refiner: refinerProvider,
      antagonist: antagonistProvider,
      ...(requestedFeatures ? { requestedFeatures } : {}),
      ...(synthesisProvider ? { synthesizer: synthesisProvider } : {}),
      ...(mappingProvider ? { mapper: mappingProvider } : {}),
      ...(refinerProvider ? { refiner: refinerProvider } : {}),
      ...(antagonistProvider ? { antagonist: antagonistProvider } : {}),
    },
  };
}


export function applyStreamingUpdates(
  aiTurn: AiTurn,
  updates: Array<{
    providerId: string;
    text: string;
    status: string;
    responseType: "batch" | "synthesis" | "mapping" | "refiner" | "antagonist";
  }>,
) {
  let batchChanged = false;
  let synthesisChanged = false;
  let mappingChanged = false;
  let refinerChanged = false;
  let antagonistChanged = false;

  updates.forEach(({ providerId, text: delta, status, responseType }) => {
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
          text: (latest.text || "") + delta,
          status: status as any,
          updatedAt: Date.now(),
        };
      } else if (isLatestTerminal && !isNewStream) {
        arr[arr.length - 1] = {
          ...latest,
          text: (latest.text || "") + delta,
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
    } else if (responseType === "synthesis") {
      synthesisChanged = true;
      if (!aiTurn.synthesisResponses) aiTurn.synthesisResponses = {};
      const arr = normalizeResponseArray(aiTurn.synthesisResponses[providerId]);

      const latest = arr.length > 0 ? arr[arr.length - 1] : undefined;
      const isLatestTerminal = latest && (latest.status === "completed" || latest.status === "error");

      if (latest && !isLatestTerminal) {
        arr[arr.length - 1] = {
          ...latest,
          text: (latest.text || "") + delta,
          status: status as any,
          updatedAt: Date.now(),
        };
      } else {
        arr.push({
          providerId: providerId as ProviderKey,
          text: delta,
          status: status as any,
          createdAt: Date.now(),
        });
      }

      aiTurn.synthesisResponses[providerId] = arr;
    } else if (responseType === "mapping") {
      mappingChanged = true;
      if (!aiTurn.mappingResponses) aiTurn.mappingResponses = {};
      const arr = normalizeResponseArray(aiTurn.mappingResponses[providerId]);

      const latest = arr.length > 0 ? arr[arr.length - 1] : undefined;
      const isLatestTerminal = latest && (latest.status === "completed" || latest.status === "error");

      if (latest && !isLatestTerminal) {
        arr[arr.length - 1] = {
          ...latest,
          text: (latest.text || "") + delta,
          status: status as any,
          updatedAt: Date.now(),
        };
      } else {
        arr.push({
          providerId: providerId as ProviderKey,
          text: delta,
          status: status as any,
          createdAt: Date.now(),
        });
      }

      aiTurn.mappingResponses[providerId] = arr;
    } else if (responseType === "refiner") {
      refinerChanged = true;
      if (!aiTurn.refinerResponses) aiTurn.refinerResponses = {};
      const arr = normalizeResponseArray(aiTurn.refinerResponses[providerId]);

      const latest = arr.length > 0 ? arr[arr.length - 1] : undefined;
      const isLatestTerminal = latest && (latest.status === "completed" || latest.status === "error");

      if (latest && !isLatestTerminal) {
        arr[arr.length - 1] = {
          ...latest,
          text: (latest.text || "") + delta,
          status: status as any,
          updatedAt: Date.now(),
        };
      } else {
        arr.push({
          providerId: providerId as ProviderKey,
          text: delta,
          status: status as any,
          createdAt: Date.now(),
        });
      }

      aiTurn.refinerResponses[providerId] = arr;
    } else if (responseType === "antagonist") {
      antagonistChanged = true;
      if (!aiTurn.antagonistResponses) aiTurn.antagonistResponses = {};
      const arr = normalizeResponseArray(aiTurn.antagonistResponses[providerId]);

      const latest = arr.length > 0 ? arr[arr.length - 1] : undefined;
      const isLatestTerminal = latest && (latest.status === "completed" || latest.status === "error");

      if (latest && !isLatestTerminal) {
        arr[arr.length - 1] = {
          ...latest,
          text: (latest.text || "") + delta,
          status: status as any,
          updatedAt: Date.now(),
        };
      } else {
        arr.push({
          providerId: providerId as ProviderKey,
          text: delta,
          status: status as any,
          createdAt: Date.now(),
        });
      }

      aiTurn.antagonistResponses[providerId] = arr;
    }
  });

  // ✅ Bump versions only for changed types
  if (batchChanged) aiTurn.batchVersion = (aiTurn.batchVersion ?? 0) + 1;
  if (synthesisChanged) aiTurn.synthesisVersion = (aiTurn.synthesisVersion ?? 0) + 1;
  if (mappingChanged) aiTurn.mappingVersion = (aiTurn.mappingVersion ?? 0) + 1;
  if (refinerChanged) aiTurn.refinerVersion = (aiTurn.refinerVersion ?? 0) + 1;
  if (antagonistChanged) aiTurn.antagonistVersion = (aiTurn.antagonistVersion ?? 0) + 1;
}

/**
 * Transforms raw backend "rounds" (from fullSession.turns) into normalized UserTurn/AiTurn objects
 * mirroring the logic in useChat.ts selectChat
 */
export function normalizeBackendRoundsToTurns(
  rawTurns: any[],
  sessionId: string
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

      // Normalize synthesis/mapping responses to arrays
      const normalizeSynthMap = (
        raw: any
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
        sessionId: sessionId,
        threadId: "default-thread",
        createdAt: round.completedAt || round.createdAt || Date.now(),
        batchResponses,
        synthesisResponses: normalizeSynthMap(round.synthesisResponses),
        mappingResponses: normalizeSynthMap(round.mappingResponses),
        refinerResponses: normalizeSynthMap(round.refinerResponses),
        antagonistResponses: normalizeSynthMap(round.antagonistResponses),
        meta: round.meta || {},
      };
      normalized.push(aiTurn);
    }
  });

  return normalized;
}
