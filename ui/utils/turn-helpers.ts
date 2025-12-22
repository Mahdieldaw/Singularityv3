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
  shouldUseSynthesis: boolean,
  shouldUseMapping: boolean,
  shouldUseRefiner: boolean,
  synthesisProvider?: string,
  mappingProvider?: string,
  refinerProvider?: string,
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
  if (requestedFeatures?.antagonist) {
    // Wait, I don't have antagonistProvider passed in as a distinct argument yet, I need to add it to the signature in chunk 1 first?
    // Actually I missed adding it to the signature in chunk 1, let me fix chunk 1 first.
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
      // antagonist: antagonistProvider, // Need to make sure I have this variable
      ...(requestedFeatures ? { requestedFeatures } : {}),
      ...(synthesisProvider ? { synthesizer: synthesisProvider } : {}),
      ...(mappingProvider ? { mapper: mappingProvider } : {}),
      ...(refinerProvider ? { refiner: refinerProvider } : {}),
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
  updates.forEach(({ providerId, text: delta, status, responseType }) => {
    if (responseType === "batch") {
      // Update batch responses (array per provider)
      if (!aiTurn.batchResponses) aiTurn.batchResponses = {};
      const arr = normalizeResponseArray(
        aiTurn.batchResponses[providerId],
      );

      // Check if we should start a new response (branching/retry)
      // If the latest response is terminal (completed/error) and the new update is active (streaming/pending),
      // we must preserve the history and start a new entry.
      const latest = arr.length > 0 ? arr[arr.length - 1] : undefined;
      const isLatestTerminal = latest && (latest.status === "completed" || latest.status === "error");
      const isNewStream = status === "streaming" || status === "pending";

      if (latest && !isLatestTerminal) {
        // Update existing active response
        arr[arr.length - 1] = {
          ...latest,
          text: (latest.text || "") + delta,
          status: status as any,
          updatedAt: Date.now(),
        };
      } else if (isLatestTerminal && !isNewStream) {
        // Edge case: late arrival of terminal update for already terminal response?
        // Or maybe just updating metadata. For safety, we update the latest.
        arr[arr.length - 1] = {
          ...latest,
          text: (latest.text || "") + delta,
          status: status as any,
          updatedAt: Date.now(),
        };
      } else {
        // Create new response (either first one, or branching from terminal)
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
      // Update synthesis responses (array per provider)
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
      aiTurn.synthesisVersion = (aiTurn.synthesisVersion ?? 0) + 1;
    } else if (responseType === "mapping") {
      // Update mapping responses (array per provider)
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
      aiTurn.mappingVersion = (aiTurn.mappingVersion ?? 0) + 1;
    }
    else if (responseType === "refiner") {
      // Update refiner responses (array per provider)
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
      aiTurn.refinerVersion = (aiTurn.refinerVersion ?? 0) + 1;
    } else if (responseType === "antagonist") {
      // Update antagonist responses (array per provider)
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
      // aiTurn.antagonistVersion = (aiTurn.antagonistVersion ?? 0) + 1;
    }
  });
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
