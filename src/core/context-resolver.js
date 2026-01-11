// src/core/context-resolver.js
import {
  aggregateBatchOutputs,
  findLatestMappingOutput,
  extractUserMessage
} from './context-utils.js';

/**
 * ContextResolver
 *
 * Resolves the minimal context needed for a workflow request.
 * Implements the 3 primitives: initialize, extend, recompute.
 *
 * Responsibilities:
 * - Non-blocking, targeted lookups (no full session hydration)
 * - Deterministic provider context resolution
 * - Immutable resolved context objects
 */

export class ContextResolver {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
  }

  /**
   * Resolve context for any primitive request
   * @param {Object} request initialize | extend | recompute
   * @returns {Promise<Object>} ResolvedContext
   */
  async resolve(request) {
    if (!request || !request.type) {
      throw new Error("[ContextResolver] request.type is required");
    }

    switch (request.type) {
      case "initialize":
        return this._resolveInitialize(request);
      case "extend":
        return this._resolveExtend(request);
      case "recompute":
        return this._resolveRecompute(request);
      default:
        throw new Error(
          `[ContextResolver] Unknown request type: ${request.type}`,
        );
    }
  }

  // initialize: starting fresh
  async _resolveInitialize(request) {
    return {
      type: "initialize",
      providers: request.providers || [],
    };
  }

  // extend: fetch last turn and extract provider contexts for requested providers
  async _resolveExtend(request) {
    const sessionId = request.sessionId;
    if (!sessionId)
      throw new Error("[ContextResolver] Extend requires sessionId");

    const session = await this._getSessionMetadata(sessionId);
    if (!session || !session.lastTurnId) {
      throw new Error(
        `[ContextResolver] Cannot extend: no lastTurnId for session ${sessionId}`,
      );
    }

    const lastTurn = await this._getTurn(session.lastTurnId);
    if (!lastTurn)
      throw new Error(
        `[ContextResolver] Last turn ${session.lastTurnId} not found`,
      );

    // Prefer turn-scoped provider contexts
    // Normalization: stored shape may be either { [pid]: meta } or { [pid]: { meta } }
    const turnContexts = lastTurn.providerContexts || {};
    const normalized = {};
    for (const [pid, ctx] of Object.entries(turnContexts)) {
      normalized[pid] = ctx && ctx.meta ? ctx.meta : ctx;
    }

    // PERMISSIVE EXTEND LOGIC:
    // 1. Iterate over requested providers
    // 2. If forced reset -> New Joiner
    // 3. If context exists (prefer :batch suffix) -> Continue
    // 4. If no context -> New Joiner
    const resolvedContexts = {};
    const forcedResetSet = new Set(request.forcedContextReset || []);

    for (const pid of (request.providers || [])) {
      // ✅ CRITICAL FIX: Look for role-suffixed context (batch) first
      const batchPid = `${pid}:batch`;

      if (forcedResetSet.has(pid)) {
        // Case 1: Forced Reset
        resolvedContexts[pid] = { isNewJoiner: true };
      } else if (normalized[batchPid]) {
        // Case 2: Batch Context Exists -> Continue
        // We map the scoped context back to the raw PID for the step payload
        resolvedContexts[pid] = normalized[batchPid];
      } else if (normalized[pid]) {
        // Case 3: Legacy/Default Context Exists -> Continue
        resolvedContexts[pid] = normalized[pid];
      } else {
        // Case 4: No Context -> New Joiner
        resolvedContexts[pid] = { isNewJoiner: true };
      }
    }

    return {
      type: "extend",
      sessionId,
      lastTurnId: lastTurn.id,
      providerContexts: resolvedContexts,
      previousContext: lastTurn.lastContextSummary || null,
      previousAnalysis: lastTurn.mapperArtifact ? {
        claimsWithLeverage: lastTurn.mapperArtifact.claimsWithLeverage || [],
        edges: lastTurn.mapperArtifact.edges || []
      } : null,
    };
  }

  // recompute: fetch source AI turn, gather frozen batch outputs and original user message
  async _resolveRecompute(request) {
    const { sessionId, sourceTurnId, stepType, targetProvider } = request;
    if (!sessionId || !sourceTurnId) {
      throw new Error(
        "[ContextResolver] Recompute requires sessionId and sourceTurnId",
      );
    }

    const sourceTurn = await this._getTurn(sourceTurnId);
    if (!sourceTurn)
      throw new Error(
        `[ContextResolver] Source turn ${sourceTurnId} not found`,
      );

    // NEW: batch recompute - single provider retry using original user message OR custom override
    if (stepType === "batch") {
      const turnContexts = sourceTurn.providerContexts || {};
      const batchPid = targetProvider ? `${targetProvider}:batch` : null;

      // Extract specific context for target provider, prioritizing :batch
      let targetContext = undefined;
      if (batchPid && turnContexts[batchPid]) {
        targetContext = turnContexts[batchPid];
      } else if (targetProvider && turnContexts[targetProvider]) {
        targetContext = turnContexts[targetProvider];
      }

      const providerContextsAtSourceTurn = targetProvider && targetContext
        ? { [targetProvider]: targetContext }
        : {};

      // Prefer custom userMessage from request (targeted refinement), fallback to original turn text
      const sourceUserMessage = request.userMessage || await this._getUserMessageForTurn(sourceTurn);
      return {
        type: "recompute",
        sessionId,
        sourceTurnId,
        stepType,
        targetProvider,
        // No frozen outputs required for batch; we are re-running fresh for a single provider
        frozenBatchOutputs: {},
        providerContextsAtSourceTurn,
        latestMappingOutput: null,
        sourceUserMessage,
      };
    }

    // Build frozen outputs from provider_responses store, not embedded turn fields
    const responses = await this._getProviderResponsesForTurn(sourceTurnId);
    const frozenBatchOutputs = aggregateBatchOutputs(responses);
    if (!frozenBatchOutputs || Object.keys(frozenBatchOutputs).length === 0) {
      throw new Error(
        `[ContextResolver] Source turn ${sourceTurnId} has no batch outputs in provider_responses`,
      );
    }

    // Determine the latest valid mapping output for this source turn
    const latestMappingOutput = findLatestMappingOutput(
      responses,
      request.preferredMappingProvider,
    );

    const providerContextsAtSourceTurn = sourceTurn.providerContexts || {};
    const sourceUserMessage = await this._getUserMessageForTurn(sourceTurn);

    // Extract frozen prompt metadata for singularity recomputes
    const singularityResponse = responses.find(r => r.responseType === 'singularity');
    const frozenSingularityPromptType = singularityResponse?.meta?.frozenSingularityPromptType;
    const frozenSingularityPromptSeed = singularityResponse?.meta?.frozenSingularityPromptSeed;

    return {
      type: "recompute",
      sessionId,
      sourceTurnId,
      frozenBatchOutputs,
      latestMappingOutput,
      providerContextsAtSourceTurn,
      stepType,
      targetProvider,
      sourceUserMessage,
      frozenSingularityPromptType,
      frozenSingularityPromptSeed,
    };
  }

  // ===== helpers =====
  async _getSessionMetadata(sessionId) {
    try {
      if (
        this.sessionManager?.adapter?.isReady &&
        this.sessionManager.adapter.isReady()
      ) {
        return await this.sessionManager.adapter.get("sessions", sessionId);
      }
      return null;
    } catch (e) {
      console.error("[ContextResolver] _getSessionMetadata failed:", e);
      return null;
    }
  }

  async _getTurn(turnId) {
    try {
      if (
        this.sessionManager?.adapter?.isReady &&
        this.sessionManager.adapter.isReady()
      ) {
        return await this.sessionManager.adapter.get("turns", turnId);
      }
      return null;
    } catch (e) {
      console.error("[ContextResolver] _getTurn failed:", e);
      return null;
    }
  }

  // kept for legacy compatibility if strict filtering needed
  _filterContexts(allContexts, requestedProviders) {
    const filtered = {};
    for (const pid of requestedProviders) {
      if (allContexts[pid]) {
        filtered[pid] = { meta: allContexts[pid], continueThread: true };
      }
    }
    return filtered;
  }

  async _getUserMessageForTurn(aiTurn) {
    const userTurnId = aiTurn.userTurnId;
    if (!userTurnId) return "";
    const userTurn = await this._getTurn(userTurnId);
    return extractUserMessage(userTurn);
  }

  /**
   * Fetch provider responses for a given AI turn using adapter indices if available.
   * Simplified: always use the indexed adapter.getResponsesByTurnId for high performance.
   */
  async _getProviderResponsesForTurn(aiTurnId) {
    // No more fallbacks or readiness checks. Trust the adapter.
    // If this fails, it should throw an error, which is the desired "fail fast" behavior.
    return this.sessionManager.adapter.getResponsesByTurnId(aiTurnId);
  }
}
