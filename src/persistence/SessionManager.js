// Enhanced SessionManager with Persistence Adapter Integration
// Supports both legacy chrome.storage and new persistence layer via feature flag

import { SimpleIndexedDBAdapter } from "./SimpleIndexedDBAdapter.js";
import { DEFAULT_THREAD } from "../../shared/messaging.js";

const getSessionLogger = () => {
  try {
    const candidate =
      globalThis.processLogger ||
      globalThis.logger ||
      (globalThis.window
        ? globalThis.window["processLogger"] || globalThis.window["logger"]
        : null);
    if (candidate && typeof candidate.error === "function") return candidate;
  } catch (_) { }
  return console;
};




export class SessionManager {
  constructor() {
    this.isExtensionContext = false;

    // Persistence layer components will be injected
    this.adapter = null;
    this.isInitialized = false;
  }

  _safeArtifact(artifact) {
    return this._toJsonSafe(artifact, { maxDepth: 20, maxStringLength: 250000 });
  }

  _toJsonSafe(value, opts = {}, _seen = new WeakSet(), _depth = 0) {
    const maxDepth = typeof opts.maxDepth === "number" ? opts.maxDepth : 6;
    const maxStringLength =
      typeof opts.maxStringLength === "number" ? opts.maxStringLength : 250000;

    if (value === null || value === undefined) return value;

    const t = typeof value;
    if (t === "string") {
      return value.length > maxStringLength
        ? value.slice(0, maxStringLength)
        : value;
    }
    if (t === "number" || t === "boolean") return value;
    if (t === "bigint") return String(value);
    if (t === "function" || t === "symbol") return undefined;

    if (_depth >= maxDepth) return undefined;

    if (Array.isArray(value)) {
      const arr = [];
      for (const item of value) {
        const safe = this._toJsonSafe(item, opts, _seen, _depth + 1);
        if (safe !== undefined) arr.push(safe);
      }
      return arr;
    }

    if (t === "object") {
      try {
        if (_seen.has(value)) return "[Circular]";
        _seen.add(value);
      } catch (_) {
        return String(value);
      }

      if (value instanceof Date) return value.toISOString();

      const out = {};
      for (const [k, v] of Object.entries(value)) {
        const safe = this._toJsonSafe(v, opts, _seen, _depth + 1);
        if (safe !== undefined) out[k] = safe;
      }
      return out;
    }

    try {
      return String(value);
    } catch (_) {
      return undefined;
    }
  }

  _safeMeta(meta) {
    const safe = this._toJsonSafe(meta, { maxDepth: 8, maxStringLength: 250000 });
    if (safe && typeof safe === "object") return safe;
    if (safe === null || safe === undefined) return {};
    return { value: safe };
  }

  /**
   * Upsert a single provider response by compound key. Used for immediate
   * persistence on step completion so we don't lose results if later phases fail.
   * @param {string} sessionId
   * @param {string} aiTurnId
   * @param {string} providerId
   * @param {"batch"|"mapping"|"singularity"} responseType
   * @param {number} responseIndex
   * @param {{ text?: string, status?: string, meta?: any, createdAt?: number }} payload
   */
  async upsertProviderResponse(
    sessionId,
    aiTurnId,
    providerId,
    responseType,
    responseIndex,
    payload = {},
  ) {
    try {
      if (!this.adapter) throw new Error("adapter not initialized");
      const keyTuple = [aiTurnId, providerId, responseType, responseIndex];
      let existing = [];
      try {
        existing = await this.adapter.getByIndex(
          "provider_responses",
          "byCompoundKey",
          keyTuple,
        );
      } catch (_) {
        existing = [];
      }

      const now = Date.now();
      const base = {
        id: existing?.[0]?.id || `pr-${sessionId}-${aiTurnId}-${providerId}-${responseType}-${responseIndex}`,
        sessionId,
        aiTurnId,
        providerId,
        responseType,
        responseIndex,
        text: payload.text || (existing?.[0]?.text || ""),
        status: payload.status || (existing?.[0]?.status || "streaming"),
        meta: this._safeMeta(payload.meta ?? existing?.[0]?.meta ?? {}),
        createdAt: existing?.[0]?.createdAt || payload.createdAt || now,
        updatedAt: now,
      };

      await this.adapter.put("provider_responses", base, base.id);
      return base;
    } catch (e) {
      console.warn("[SessionManager] upsertProviderResponse failed:", e);
      return null;
    }
  }

  /**
   * Primary persistence entry point
   * Routes to appropriate primitive-specific handler
   * @param {Object} request - { type, sessionId, userMessage, sourceTurnId?, stepType?, targetProvider? }
   * @param {Object} context - ResolvedContext from ContextResolver
   * @param {Object} result - { batchOutputs, mappingOutputs, singularityOutputs }
   * @returns {Promise<{sessionId, userTurnId?, aiTurnId?}>}
   */
  async persist(request, context, result) {
    if (!request?.type)
      throw new Error("[SessionManager] persist() requires request.type");
    switch (request.type) {
      case "initialize":
        return this._persistInitialize(request, result);
      case "extend":
        return this._persistExtend(request, context, result);
      case "recompute":
        return this._persistRecompute(request, context, result);
      default:
        throw new Error(
          `[SessionManager] Unknown request type: ${request.type}`,
        );
    }
  }

  /**
   * Initialize: Create new session + first turn
   */
  async _persistInitialize(request, result) {
    const sessionId = request.sessionId;
    if (!sessionId) {
      throw new Error("[SessionManager] initialize requires request.sessionId");
    }
    const now = Date.now();

    const contextSummary = this._buildContextSummary(result, request);

    const userTurnId = request.canonicalUserTurnId || `user-${now}`;
    const aiTurnId = request.canonicalAiTurnId || `ai-${now}`;
    const isComplete = !request?.partial;
    const pipelineStatus = request?.partial
      ? request?.pipelineStatus
      : (request?.pipelineStatus || "complete");
    const runId = request?.runId;
    let existingUserTurnId = null;

    try {
      const existingAi = await this.adapter.get("turns", aiTurnId);
      if (existingAi && (existingAi.type === "ai" || existingAi.role === "assistant")) {
        existingUserTurnId = existingAi.userTurnId || userTurnId;
        try {
          const existingUser = await this.adapter.get("turns", existingUserTurnId);
          if (!existingUser) {
            const userText = request.userMessage || "";
            await this.adapter.put("turns", {
              id: existingUserTurnId,
              type: "user",
              role: "user",
              sessionId,
              threadId: DEFAULT_THREAD,
              createdAt: existingAi.createdAt || now,
              updatedAt: now,
              text: userText,
              content: userText,
              sequence: Math.max((existingAi.sequence || 1) - 1, 0),
            });
          }
        } catch (err) {
          const logger = getSessionLogger();
          logger.error(
            `[SessionManager] adapter.get("turns", existingUserTurnId) failed (aiTurnId=${aiTurnId}, existingUserTurnId=${existingUserTurnId}, sessionId=${sessionId})`,
            err,
          );
        }

        const providerContexts = this._extractContextsFromResult(result);
        const mapperArtifact = request?.mapperArtifact
          ? this._safeArtifact(request.mapperArtifact)
          : undefined;
        const pipelineArtifacts = request?.pipelineArtifacts
          ? this._toJsonSafe(request.pipelineArtifacts)
          : undefined;
        const storedAnalysis = request?.storedAnalysis
          ? this._toJsonSafe(request.storedAnalysis)
          : undefined;
        const singularityOutput = request?.singularityOutput
          ? this._toJsonSafe(request.singularityOutput)
          : undefined;

        const updatedAi = {
          ...existingAi,
          updatedAt: now,
          providerContexts: {
            ...(existingAi.providerContexts || {}),
            ...(providerContexts || {}),
          },
          isComplete,
          batchResponseCount: this.countResponses(result.batchOutputs),
          mappingResponseCount: this.countResponses(result.mappingOutputs),
          singularityResponseCount: this.countResponses(result.singularityOutputs),
          ...(mapperArtifact ? { mapperArtifact } : {}),
          ...(pipelineArtifacts ? { pipelineArtifacts } : {}),
          ...(storedAnalysis ? { storedAnalysis } : {}),
          ...(singularityOutput ? { singularityOutput } : {}),
          lastContextSummary: contextSummary,
          ...(pipelineStatus ? { pipelineStatus } : {}),
        };
        await this.adapter.put("turns", updatedAi);

        await this._persistProviderResponses(sessionId, aiTurnId, result, now, runId);

        try {
          const session = await this.adapter.get("sessions", sessionId);
          if (session) {
            session.lastTurnId = aiTurnId;
            if (storedAnalysis) session.lastStructuralTurnId = aiTurnId;
            session.lastActivity = now;
            session.updatedAt = now;
            await this.adapter.put("sessions", session);
          }
        } catch (err) {
          const logger = getSessionLogger();
          logger.error(
            `[SessionManager] adapter.get("sessions", sessionId) failed (aiTurnId=${aiTurnId}, existingUserTurnId=${existingUserTurnId}, sessionId=${sessionId})`,
            err,
          );
        }

        return { sessionId, userTurnId: existingUserTurnId, aiTurnId };
      }
    } catch (err) {
      const logger = getSessionLogger();
      logger.error(
        `[SessionManager] Existing AI-turn handling failed (adapterOp=initialize existing-ai path, aiTurnId=${aiTurnId}, existingUserTurnId=${existingUserTurnId}, sessionId=${sessionId})`,
        err,
      );

      const base = err instanceof Error ? err : new Error(String(err));
      const wrapped = new Error(
        `[SessionManager] Persistence adapter failure during initialize (aiTurnId=${aiTurnId}, existingUserTurnId=${existingUserTurnId}, sessionId=${sessionId})`,
      );
      wrapped.cause = base;
      throw wrapped;
    }

    // 1) Create session
    const sessionRecord = {
      id: sessionId,
      title: String(request.userMessage || "").slice(0, 50),
      createdAt: now,
      lastActivity: now,
      defaultThreadId: DEFAULT_THREAD,
      activeThreadId: DEFAULT_THREAD,
      turnCount: 2,
      isActive: true,
      lastTurnId: null,
      updatedAt: now,
      userId: "default-user",
      provider: "multi",
      conciergePhaseState: this._defaultConciergePhaseState(),
    };
    await this.adapter.put("sessions", sessionRecord);

    // 2) Default thread
    const defaultThread = {
      id: DEFAULT_THREAD,
      sessionId,
      parentThreadId: null,
      branchPointTurnId: null,
      title: "Main Thread",
      name: "Main Thread",
      color: "#6366f1",
      isActive: true,
      createdAt: now,
      lastActivity: now,
      updatedAt: now,
    };
    await this.adapter.put("threads", defaultThread);

    // 3) User turn
    const userText = request.userMessage || "";
    const userTurnRecord = {
      id: userTurnId,
      type: "user",
      role: "user",
      sessionId,
      threadId: DEFAULT_THREAD,
      createdAt: now,
      updatedAt: now,
      text: userText,
      content: userText,
      sequence: 0,
    };
    await this.adapter.put("turns", userTurnRecord);

    // 4) AI turn with contexts
    const providerContexts = this._extractContextsFromResult(result);
    const mapperArtifact = request?.mapperArtifact
      ? this._safeArtifact(request.mapperArtifact)
      : undefined;
    const pipelineArtifacts = request?.pipelineArtifacts
      ? this._toJsonSafe(request.pipelineArtifacts)
      : undefined;
    const storedAnalysis = request?.storedAnalysis
      ? this._toJsonSafe(request.storedAnalysis)
      : undefined;
    const singularityOutput = request?.singularityOutput
      ? this._toJsonSafe(request.singularityOutput)
      : undefined;
    const aiTurnRecord = {
      id: aiTurnId,
      type: "ai",
      role: "assistant",
      sessionId,
      threadId: DEFAULT_THREAD,
      userTurnId,
      createdAt: now,
      updatedAt: now,
      providerContexts,
      isComplete,
      sequence: 1,
      batchResponseCount: this.countResponses(result.batchOutputs),
      mappingResponseCount: this.countResponses(result.mappingOutputs),
      singularityResponseCount: this.countResponses(result.singularityOutputs),
      ...(mapperArtifact ? { mapperArtifact } : {}),
      ...(pipelineArtifacts ? { pipelineArtifacts } : {}),
      ...(storedAnalysis ? { storedAnalysis } : {}),
      ...(singularityOutput ? { singularityOutput } : {}),
      lastContextSummary: contextSummary,
      meta: await this._attachRunIdMeta(aiTurnId),
      ...(pipelineStatus ? { pipelineStatus } : {}),
    };
    await this.adapter.put("turns", aiTurnRecord);

    // 5) Provider responses
    await this._persistProviderResponses(sessionId, aiTurnId, result, now, runId);

    // 6) Update session lastTurnId
    sessionRecord.lastTurnId = aiTurnId;
    if (storedAnalysis) sessionRecord.lastStructuralTurnId = aiTurnId;
    sessionRecord.updatedAt = now;
    await this.adapter.put("sessions", sessionRecord);

    return { sessionId, userTurnId, aiTurnId };
  }

  /**
   * Extend: Append turn to existing session
   */
  async _persistExtend(request, context, result) {
    const { sessionId } = request;
    const now = Date.now();

    const contextSummary = this._buildContextSummary(result, request);
    const userTurnId = request.canonicalUserTurnId || `user-${now}`;
    const aiTurnId = request.canonicalAiTurnId || `ai-${now}`;
    const isComplete = !request?.partial;
    const pipelineStatus = request?.partial
      ? request?.pipelineStatus
      : (request?.pipelineStatus || "complete");
    const runId = request?.runId;

    try {
      const existingAi = await this.adapter.get("turns", aiTurnId);
      if (existingAi && (existingAi.type === "ai" || existingAi.role === "assistant")) {
        try {
          const existingUserTurnId = existingAi.userTurnId || userTurnId;
          const existingUser = await this.adapter.get("turns", existingUserTurnId);
          if (!existingUser) {
            const userText = request.userMessage || "";
            await this.adapter.put("turns", {
              id: existingUserTurnId,
              type: "user",
              role: "user",
              sessionId,
              threadId: DEFAULT_THREAD,
              createdAt: existingAi.createdAt || now,
              updatedAt: now,
              text: userText,
              content: userText,
              sequence: Math.max((existingAi.sequence || 1) - 1, 0),
            });
          }
        } catch (_) { }

        const newContexts = this._extractContextsFromResult(result);
        const mapperArtifact = request?.mapperArtifact
          ? this._safeArtifact(request.mapperArtifact)
          : undefined;
        const pipelineArtifacts = request?.pipelineArtifacts
          ? this._toJsonSafe(request.pipelineArtifacts)
          : undefined;
        const storedAnalysis = request?.storedAnalysis
          ? this._toJsonSafe(request.storedAnalysis)
          : undefined;
        const singularityOutput = request?.singularityOutput
          ? this._toJsonSafe(request.singularityOutput)
          : undefined;

        const updatedAi = {
          ...existingAi,
          updatedAt: now,
          providerContexts: {
            ...(existingAi.providerContexts || {}),
            ...(newContexts || {}),
          },
          isComplete,
          batchResponseCount: this.countResponses(result.batchOutputs),
          mappingResponseCount: this.countResponses(result.mappingOutputs),
          singularityResponseCount: this.countResponses(result.singularityOutputs),
          ...(mapperArtifact ? { mapperArtifact } : {}),
          ...(pipelineArtifacts ? { pipelineArtifacts } : {}),
          ...(storedAnalysis ? { storedAnalysis } : {}),
          ...(singularityOutput ? { singularityOutput } : {}),
          lastContextSummary: contextSummary,
          ...(pipelineStatus ? { pipelineStatus } : {}),
        };
        await this.adapter.put("turns", updatedAi);

        await this._persistProviderResponses(sessionId, aiTurnId, result, now, runId);

        try {
          const session = await this.adapter.get("sessions", sessionId);
          if (session) {
            session.lastTurnId = aiTurnId;
            if (storedAnalysis) session.lastStructuralTurnId = aiTurnId;
            session.lastActivity = now;
            session.updatedAt = now;
            await this.adapter.put("sessions", session);
          }
        } catch (_) { }

        return { sessionId, userTurnId: existingAi.userTurnId || userTurnId, aiTurnId };
      }
    } catch (_) { }

    // Validate last turn
    if (!context?.lastTurnId) {
      throw new Error("[SessionManager] Extend requires context.lastTurnId");
    }
    const lastTurn = await this.adapter.get("turns", context.lastTurnId);
    if (!lastTurn)
      throw new Error(
        `[SessionManager] Last turn ${context.lastTurnId} not found`,
      );

    // Determine next sequence using session.turnCount when available (avoid full-store scan)
    let nextSequence = 0;
    try {
      const session = await this.adapter.get("sessions", sessionId);
      if (session && typeof session.turnCount === "number") {
        nextSequence = session.turnCount;
      } else {
        // Indexed fallback: compute from turns using adapter.getTurnsBySessionId
        const sessionTurns = await this.adapter.getTurnsBySessionId(sessionId);
        nextSequence = Array.isArray(sessionTurns) ? sessionTurns.length : 0;
      }
    } catch (e) {
      // Conservative fallback on error
      try {
        const sessionTurns = await this.adapter.getTurnsBySessionId(sessionId);
        nextSequence = Array.isArray(sessionTurns) ? sessionTurns.length : 0;
      } catch (_) {
        nextSequence = 0;
      }
    }

    // 1) User turn
    const userText = request.userMessage || "";
    const userTurnRecord = {
      id: userTurnId,
      type: "user",
      role: "user",
      sessionId,
      threadId: DEFAULT_THREAD,
      createdAt: now,
      updatedAt: now,
      text: userText,
      content: userText,
      sequence: nextSequence,
    };
    await this.adapter.put("turns", userTurnRecord);

    // 2) Merge contexts
    const newContexts = this._extractContextsFromResult(result);
    const mergedContexts = {
      ...(lastTurn.providerContexts || {}),
      ...newContexts,
    };

    // 3) AI turn
    const mapperArtifact = request?.mapperArtifact
      ? this._safeArtifact(request.mapperArtifact)
      : undefined;
    const pipelineArtifacts = request?.pipelineArtifacts
      ? this._toJsonSafe(request.pipelineArtifacts)
      : undefined;
    const storedAnalysis = request?.storedAnalysis
      ? this._toJsonSafe(request.storedAnalysis)
      : undefined;
    const singularityOutput = request?.singularityOutput
      ? this._toJsonSafe(request.singularityOutput)
      : undefined;
    const aiTurnRecord = {
      id: aiTurnId,
      type: "ai",
      role: "assistant",
      sessionId,
      threadId: DEFAULT_THREAD,
      userTurnId,
      createdAt: now,
      updatedAt: now,
      providerContexts: mergedContexts,
      isComplete,
      sequence: nextSequence + 1,
      batchResponseCount: this.countResponses(result.batchOutputs),
      mappingResponseCount: this.countResponses(result.mappingOutputs),
      singularityResponseCount: this.countResponses(result.singularityOutputs),
      ...(mapperArtifact ? { mapperArtifact } : {}),
      ...(pipelineArtifacts ? { pipelineArtifacts } : {}),
      ...(storedAnalysis ? { storedAnalysis } : {}),
      ...(singularityOutput ? { singularityOutput } : {}),
      lastContextSummary: contextSummary,
      meta: await this._attachRunIdMeta(aiTurnId),
      ...(pipelineStatus ? { pipelineStatus } : {}),
    };
    await this.adapter.put("turns", aiTurnRecord);

    // 4) Provider responses
    await this._persistProviderResponses(sessionId, aiTurnId, result, now, runId);

    // 5) Update session
    const session = await this.adapter.get("sessions", sessionId);
    if (session) {
      session.lastTurnId = aiTurnId;
      if (storedAnalysis) session.lastStructuralTurnId = aiTurnId;
      session.lastActivity = now;
      // If session.turnCount was previously undefined, use nextSequence + 2 (the accurate total after this extend)
      const computedNewCount =
        typeof session.turnCount === "number"
          ? session.turnCount + 2
          : nextSequence + 2;
      session.turnCount = computedNewCount;
      session.updatedAt = now;
      await this.adapter.put("sessions", session);
    }

    return { sessionId, userTurnId, aiTurnId };
  }

  /**
   * Recompute: Create derived turn (timeline branch)
   */
  async _persistRecompute(request, _context, result) {
    const { sessionId, sourceTurnId, stepType, targetProvider } = request;
    const now = Date.now();

    // 1) Source turn exists?
    const sourceTurn = await this.adapter.get("turns", sourceTurnId);
    if (!sourceTurn)
      throw new Error(`[SessionManager] Source turn ${sourceTurnId} not found`);

    // 2) Extract Result Data
    let output;
    if (stepType === "batch") output = result?.batchOutputs?.[targetProvider];
    else if (stepType === "mapping")
      output = result?.mappingOutputs?.[targetProvider];
    else if (stepType === "singularity")
      output = result?.singularityOutputs?.[targetProvider];

    if (!output) {
      console.warn(
        `[SessionManager] No output for ${stepType}/${targetProvider}`,
      );
      return { sessionId };
    }

    // 3) Calculate Version Index (UNIFIED "Physics")
    let nextIndex = 0;
    try {
      const existingResponses = await this.adapter.getResponsesByTurnId(
        sourceTurnId,
      );
      const relevantVersions = existingResponses.filter(
        (r) => r.providerId === targetProvider && r.responseType === stepType,
      );
      if (relevantVersions.length > 0) {
        const maxIndex = Math.max(
          ...relevantVersions.map((r) => r.responseIndex || 0),
        );
        nextIndex = maxIndex + 1;
      }
    } catch (_) { }

    // 4) Persist Response (UNIFIED - no if/else branching)
    const respId = `pr-${sessionId}-${sourceTurnId}-${targetProvider}-${stepType}-${nextIndex}-${now}`;
    await this.adapter.put("provider_responses", {
      id: respId,
      sessionId,
      aiTurnId: sourceTurnId, // ALWAYS the original turn
      providerId: targetProvider,
      responseType: stepType,
      responseIndex: nextIndex,
      text: output.text || "",
      status: output.status || "completed",
      meta: {
        ...this._safeMeta(output?.meta || {}),
        isRecompute: true,
        recomputeDate: now,
      },
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });

    // 5) Update Parent Turn Metadata (UNIFIED)
    try {
      const freshTurn = await this.adapter.get("turns", sourceTurnId);
      if (freshTurn) {
        freshTurn.updatedAt = now;

        // Increment specific counter
        if (stepType === "batch")
          freshTurn.batchResponseCount = (freshTurn.batchResponseCount || 0) + 1;
        else if (stepType === "mapping")
          freshTurn.mappingResponseCount =
            (freshTurn.mappingResponseCount || 0) + 1;
        else if (stepType === "singularity")
          freshTurn.singularityResponseCount =
            (freshTurn.singularityResponseCount || 0) + 1;

        // Update snapshot context ONLY for batch retries
        if (stepType === "batch") {
          const contexts = freshTurn.providerContexts || {};
          const existingCtx = contexts[targetProvider] || {};
          contexts[targetProvider] = {
            ...existingCtx,
            ...this._safeMeta(output?.meta || {}),
          };
          freshTurn.providerContexts = contexts;
        }

        await this.adapter.put("turns", freshTurn);
      }
    } catch (_) { }

    return { sessionId }; // NO new turn IDs
  }

  /**
   * Extract provider contexts from workflow result
   */
  _extractContextsFromResult(result) {
    const contexts = {};
    try {
      Object.entries(result?.batchOutputs || {}).forEach(([pid, output]) => {
        if (output?.meta && Object.keys(output.meta).length > 0)
          contexts[`${pid}:batch`] = this._safeMeta(output.meta);
      });
      Object.entries(result?.mappingOutputs || {}).forEach(([pid, output]) => {
        if (output?.meta && Object.keys(output.meta).length > 0)
          contexts[`${pid}:mapping`] = this._safeMeta(output.meta);
      });
      Object.entries(result?.singularityOutputs || {}).forEach(([pid, output]) => {
        if (output?.meta && Object.keys(output.meta).length > 0)
          contexts[`${pid}:singularity`] = this._safeMeta(output.meta);
      });
    } catch (_) { }
    return contexts;
  }

  /**
   * Helper: Persist provider responses for a turn (BATCHED)
   * @param {string} sessionId
   * @param {string} aiTurnId
   * @param {Object} result
   * @param {number} now
   */
  async _persistProviderResponses(sessionId, aiTurnId, result, now, runId = null) {
    const recordsToSave = [];
    let existingResponses = [];

    // Pre-fetch all existing responses for this turn to calculate indices correctly
    try {
      existingResponses = await this.adapter.getResponsesByTurnId(aiTurnId) || [];
    } catch (_) { }

    // Helper to calculate next index for a specific provider/type
    const getNextIndex = (providerId, type) => {
      // Check existing persisted records
      const persisted = existingResponses.filter(
        (r) => r.providerId === providerId && r.responseType === type
      );
      // Check currently pending records to handle multiple items of same type in this batch
      const pending = recordsToSave.filter(
        (r) => r.providerId === providerId && r.responseType === type
      );

      const maxPersisted = persisted.length > 0
        ? Math.max(...persisted.map(r => (typeof r.responseIndex === "number" ? r.responseIndex : 0)))
        : -1;

      const maxPending = pending.length > 0
        ? Math.max(...pending.map(r => (typeof r.responseIndex === "number" ? r.responseIndex : 0)))
        : -1;

      return Math.max(maxPersisted, maxPending) + 1;
    };

    let count = 0;

    // 1. Batch Responses (versioned)
    for (const [providerId, output] of Object.entries(result?.batchOutputs || {})) {
      let existingForRun = null;
      if (runId) {
        const matching = existingResponses
          .filter(
            (r) =>
              r &&
              r.providerId === providerId &&
              r.responseType === "batch" &&
              r.meta &&
              r.meta.runId === runId,
          )
          .sort((a, b) => (b.responseIndex ?? 0) - (a.responseIndex ?? 0));
        existingForRun = matching.length > 0 ? matching[0] : null;
      }

      const responseIndex = typeof existingForRun?.responseIndex === "number"
        ? existingForRun.responseIndex
        : getNextIndex(providerId, "batch");
      const respId = existingForRun?.id || `pr-${sessionId}-${aiTurnId}-${providerId}-batch-${responseIndex}-${now}-${count++}`;
      const createdAtKeep = existingForRun?.createdAt || now;

      recordsToSave.push({
        id: respId,
        sessionId,
        aiTurnId,
        providerId,
        responseType: "batch",
        responseIndex,
        text: output?.text || "",
        status: output?.status || "completed",
        meta: this._safeMeta({ ...(output?.meta || {}), ...(runId ? { runId } : {}) }),
        createdAt: createdAtKeep,
        updatedAt: now,
        completedAt: now,
      });
    }

    // 3. Mapping (idempotent/singleton per provider)
    for (const [providerId, output] of Object.entries(result?.mappingOutputs || {})) {
      const existing = existingResponses.find(
        r => r.providerId === providerId && r.responseType === "mapping" && r.responseIndex === 0
      );

      const respId = existing?.id || `pr-${sessionId}-${aiTurnId}-${providerId}-mapping-0-${now}-${count++}`;
      const createdAtKeep = existing?.createdAt || now;

      recordsToSave.push({
        id: respId,
        sessionId,
        aiTurnId,
        providerId,
        responseType: "mapping",
        responseIndex: 0,
        text: output?.text || existing?.text || "",
        status: output?.status || existing?.status || "completed",
        meta: this._safeMeta(output?.meta ?? existing?.meta ?? {}),
        createdAt: createdAtKeep,
        updatedAt: now,
        completedAt: now,
      });
    }

    // 4. Singularity (idempotent/singleton per provider)
    for (const [providerId, output] of Object.entries(result?.singularityOutputs || {})) {
      const existing = existingResponses.find(
        r => r.providerId === providerId && r.responseType === "singularity" && r.responseIndex === 0
      );

      const respId = existing?.id || `pr-${sessionId}-${aiTurnId}-${providerId}-singularity-0-${now}-${count++}`;
      const createdAtKeep = existing?.createdAt || now;

      recordsToSave.push({
        id: respId,
        sessionId,
        aiTurnId,
        providerId,
        responseType: "singularity",
        responseIndex: 0,
        text: output?.text || existing?.text || "",
        status: output?.status || existing?.status || "completed",
        meta: this._safeMeta(output?.meta ?? existing?.meta ?? {}),
        createdAt: createdAtKeep,
        updatedAt: now,
        completedAt: now,
      });
    }

    // Perform single batch write
    if (recordsToSave.length > 0) {
      await this.adapter.batchPut("provider_responses", recordsToSave);
    }
  }

  /**
   * Helper function to count responses in a response bucket
   * @param {Object} responseBucket - Object containing provider responses
   * @returns {number} Total count of responses
   */
  countResponses(responseBucket) {
    return responseBucket ? Object.keys(responseBucket).length : 0;
  }

  /**
   * Initialize the session manager.
   * It now accepts the persistence adapter as an argument.
   */
  async initialize(config = {}) {
    const { adapter = null, initTimeoutMs = 8000 } = config || {};

    console.log("[SessionManager] Initializing with persistence adapter...");

    if (adapter) {
      this.adapter = adapter;
    } else {
      // Create and initialize SimpleIndexedDBAdapter
      this.adapter = new SimpleIndexedDBAdapter();
      await this.adapter.init({ timeoutMs: initTimeoutMs, autoRepair: true });
    }

    this.isInitialized = true;

    // Migrations removed; adapter initialization completes without migration step
  }

  async _attachRunIdMeta(aiTurnId) {
    try {
      const metas = await this.adapter.getMetadataByEntityId(aiTurnId);
      const inflight = (metas || []).find(
        (m) => m && m.type === "inflight_workflow",
      );
      if (inflight && inflight.runId) {
        return { runId: inflight.runId };
      }
    } catch (_) { }
    return {};
  }

  /**
   * Get or create a session (persistence-backed with cache)
   */
  async getOrCreateSession(sessionId) {
    if (!sessionId) throw new Error("sessionId required");

    // Direct persistence-backed retrieval/creation
    // 1. Try to get existing session from DB
    let sessionRecord = await this.adapter.get("sessions", sessionId);

    // 2. Create new session if doesn't exist
    if (!sessionRecord) {
      sessionRecord = {
        id: sessionId,
        userId: "default-user",
        provider: "multi",
        title: "",
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastTurnId: null,
        lastActivity: Date.now(),
      };

      await this.adapter.put("sessions", sessionRecord);

      // Create default thread
      const defaultThread = {
        id: DEFAULT_THREAD,
        sessionId: sessionId,
        parentThreadId: null,
        branchPointTurnId: null,
        title: "Main Thread",
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await this.adapter.put("threads", defaultThread);
      console.log(`[SessionManager] Created new session: ${sessionId}`);
    }

    return sessionRecord;
  }

  /**
   * Save session (enhanced with persistence layer support)
   */
  async saveSession(sessionId) {
    try {
      // Direct DB update - typically used to sync explicit saves/metadata
      const sessionRecord = await this.adapter.get("sessions", sessionId);
      if (sessionRecord) {
        sessionRecord.updatedAt = Date.now();
        await this.adapter.put("sessions", sessionRecord);
        console.log(`[SessionManager] Updated session ${sessionId} timestamp`);
      }
    } catch (error) {
      console.error(
        `[SessionManager] Failed to update session ${sessionId}:`,
        error,
      );
    }
  }


  /**
   * Delete session (enhanced with persistence layer support)
   */
  async deleteSession(sessionId) {
    try {
      // Perform an atomic, indexed cascade delete inside a single transaction
      await this.adapter.transaction(
        [
          "sessions",
          "threads",
          "turns",
          "provider_responses",
          "provider_contexts",
          "metadata",
        ],
        "readwrite",
        async (tx) => {
          const getAllByIndex = (store, indexName, key) =>
            new Promise((resolve, reject) => {
              let idx;
              try {
                idx = store.index(indexName);
              } catch (e) {
                return reject(e);
              }
              const req = idx.getAll(key);
              req.onsuccess = () => resolve(req.result || []);
              req.onerror = () => reject(req.error);
            });

          // 1) Delete session record
          await new Promise((resolve, reject) => {
            const req = tx.objectStore("sessions").delete(sessionId);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
          });

          // 2) Threads by session
          const threadsStore = tx.objectStore("threads");
          const threads = await getAllByIndex(
            threadsStore,
            "bySessionId",
            sessionId,
          );
          for (const t of threads) {
            await new Promise((resolve, reject) => {
              const req = threadsStore.delete(t.id);
              req.onsuccess = () => resolve(true);
              req.onerror = () => reject(req.error);
            });
          }

          // 3) Turns by session
          const turnsStore = tx.objectStore("turns");
          const turns = await getAllByIndex(
            turnsStore,
            "bySessionId",
            sessionId,
          );
          for (const turn of turns) {
            await new Promise((resolve, reject) => {
              const req = turnsStore.delete(turn.id);
              req.onsuccess = () => resolve(true);
              req.onerror = () => reject(req.error);
            });
          }

          // 4) Provider responses by sessionId (indexed; no fallbacks)
          const responsesStore = tx.objectStore("provider_responses");
          const responses = await getAllByIndex(
            responsesStore,
            "bySessionId",
            sessionId,
          );
          for (const r of responses) {
            await new Promise((resolve, reject) => {
              const req = responsesStore.delete(r.id);
              req.onsuccess = () => resolve(true);
              req.onerror = () => reject(req.error);
            });
          }

          // 5) Provider contexts by session (composite key delete)
          const contextsStore = tx.objectStore("provider_contexts");
          const contexts = await getAllByIndex(
            contextsStore,
            "bySessionId",
            sessionId,
          );
          for (const ctx of contexts) {
            await new Promise((resolve, reject) => {
              const key = [ctx.sessionId, ctx.providerId];
              const req = contextsStore.delete(key);
              req.onsuccess = () => resolve(true);
              req.onerror = () => reject(req.error);
            });
          }

          // 6) Metadata scoped to this session (indexed by sessionId; avoid full-store scans)
          const metaStore = tx.objectStore("metadata");
          const metasBySession = await getAllByIndex(
            metaStore,
            "bySessionId",
            sessionId,
          );
          for (const m of metasBySession) {
            await new Promise((resolve, reject) => {
              const req = metaStore.delete(m.key);
              req.onsuccess = () => resolve(true);
              req.onerror = () => reject(req.error);
            });
          }
        },
      );

      return true;
    } catch (error) {
      console.error(
        `[SessionManager] Failed to delete session ${sessionId} from persistence layer:`,
        error,
      );
      throw error; // Changed: Throw explicit error
    }
  }


  /**
   * Update provider context (enhanced with persistence layer support)
   */
  async updateProviderContext(
    sessionId,
    providerId,
    result = {},
  ) {
    if (!sessionId || !providerId) return;
    // skipSave option removed - always persists
    try {
      const session = await this.getOrCreateSession(sessionId);

      // Get or create provider context via indexed query by session
      let contexts = [];
      try {
        contexts = await this.adapter.getContextsBySessionId(sessionId);
        // Narrow to target provider
        contexts = contexts.filter(
          (context) => context.providerId === providerId,
        );
      } catch (e) {
        console.warn(
          "[SessionManager] updateProviderContext: contexts lookup failed, using empty set",
          e,
        );
        contexts = [];
      }
      // Select the most recent context by updatedAt (fallback createdAt)
      let contextRecord = null;
      if (contexts.length > 0) {
        const sorted = contexts.sort((a, b) => {
          const ta = a.updatedAt ?? a.createdAt ?? 0;
          const tb = b.updatedAt ?? b.createdAt ?? 0;
          return tb - ta; // newest first
        });
        contextRecord = sorted[0];
        console.log(
          `[SessionManager] updateProviderContext: selected latest context for ${providerId} in ${sessionId}`,
          {
            candidates: contexts.length,
            selectedId: contextRecord.id,
            selectedUpdatedAt: contextRecord.updatedAt,
            selectedCreatedAt: contextRecord.createdAt,
          },
        );
      }

      if (!contextRecord) {
        // Create new context
        contextRecord = {
          id: `ctx-${sessionId}-${providerId}-${Date.now()}`,
          sessionId: sessionId,
          providerId: providerId,
          threadId: DEFAULT_THREAD,
          contextData: {},
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      }

      // Update context data
      const existingContext = contextRecord.contextData || {};
      contextRecord.contextData = {
        ...existingContext,
        text: result?.text || existingContext.text || "",
        meta: {
          ...this._safeMeta(existingContext.meta || {}),
          ...this._safeMeta(result?.meta || {}),
        },
        lastUpdated: Date.now(),
      };
      contextRecord.updatedAt = Date.now();

      // Save or update context
      await this.adapter.put("provider_contexts", contextRecord);

      // Direct session update for activity tracking
      if (session) {
        session.lastActivity = Date.now();
        session.updatedAt = Date.now();
        await this.adapter.put("sessions", session);
      }
    } catch (error) {
      console.error(
        `[SessionManager] Failed to update provider context in persistence layer:`,
        error,
      );
      throw error; // Changed: Propagate errors
    }
  }

  /**
   * Batch update multiple provider contexts in a single pass.
   * updates shape: { [providerId]: { text?: string, meta?: object } }
   */
  async updateProviderContextsBatch(sessionId, updates = {}, options = {}) {
    const { contextRole = null } = options;
    if (!sessionId || !updates || typeof updates !== "object") return;

    try {
      const session = await this.getOrCreateSession(sessionId);
      const now = Date.now();

      // Load all existing contexts once using indexed query, pick latest per provider
      let sessionContexts = [];
      try {
        sessionContexts = await this.adapter.getContextsBySessionId(sessionId);
      } catch (e) {
        console.warn(
          "[SessionManager] updateProviderContextsBatch: contexts lookup failed; proceeding with empty list",
          e,
        );
        sessionContexts = [];
      }
      const latestByProvider = {};
      for (const ctx of sessionContexts) {
        const pid = ctx.providerId;
        const ts = ctx.updatedAt ?? ctx.createdAt ?? 0;
        const existing = latestByProvider[pid];
        if (!existing || ts > (existing._ts || 0)) {
          latestByProvider[pid] = { record: ctx, _ts: ts };
        }
      }

      // Apply updates
      for (const [providerId, result] of Object.entries(updates)) {
        // Isolation: if role specified, use suffixed key (e.g. "gemini:batch")
        const effectivePid = contextRole ? `${providerId}:${contextRole}` : providerId;

        let contextRecord = latestByProvider[effectivePid]?.record;
        if (!contextRecord) {
          contextRecord = {
            id: `ctx-${sessionId}-${effectivePid}-${now}-${Math.random().toString(36).slice(2, 8)}`,
            sessionId,
            providerId: effectivePid,
            threadId: DEFAULT_THREAD,
            contextData: {},
            isActive: true,
            createdAt: now,
            updatedAt: now,
          };
        }

        const existingData = contextRecord.contextData || {};
        contextRecord.contextData = {
          ...existingData,
          text: result?.text || existingData.text || "",
          meta: {
            ...this._safeMeta(existingData.meta || {}),
            ...this._safeMeta(result?.meta || {}),
          },
          lastUpdated: now,
        };
        contextRecord.updatedAt = now;

        // Persist updated context
        await this.adapter.put("provider_contexts", contextRecord);
      }

      // Direct session update for activity tracking
      if (session) {
        session.lastActivity = now;
        session.updatedAt = now;
        await this.adapter.put("sessions", session);
      }
    } catch (error) {
      console.error(
        "[SessionManager] Failed to batch update provider contexts:",
        error,
      );
    }
  }


  /**
   * Get provider contexts (persistence-backed, backward compatible shape)
   * Returns an object: { [providerId]: { meta: <contextMeta> } }
   * @param {string} sessionId
   * @param {string} _threadId
   * @param {Object} options { contextRole?: "batch" | "singularity" }
   */
  async getProviderContexts(sessionId, _threadId = DEFAULT_THREAD, options = {}) {
    const { contextRole = null } = options;
    try {
      if (!sessionId) {
        console.warn(
          "[SessionManager] getProviderContexts called without sessionId",
        );
        return {};
      }
      if (!this.adapter || !this.adapter.isReady()) {
        console.warn(
          "[SessionManager] getProviderContexts called but adapter is not ready",
        );
        return {}; // Return empty if DB isn't available
      }

      // Use the fast, indexed method. No more turn scanning.
      const contextRecords =
        await this.adapter.getContextsBySessionId(sessionId);

      const contexts = {};
      for (const record of contextRecords) {
        if (record.providerId && record.contextData?.meta) {
          const pid = record.providerId;

          if (contextRole) {
            // Only include records with the specific role suffix
            const suffix = `:${contextRole}`;
            if (pid.endsWith(suffix)) {
              const baseId = pid.slice(0, -suffix.length);
              contexts[baseId] = { meta: record.contextData.meta };
            }
          } else {
            // Legacy/Default: only include records WITHOUT a role suffix (the batch base thread)
            if (!pid.includes(":")) {
              contexts[pid] = { meta: record.contextData.meta };
            }
          }
        }
      }

      return contexts;
    } catch (e) {
      console.error("[SessionManager] getProviderContexts failed:", e);
      return {}; // Return empty on error
    }
  }

  /**
   * Extract decision map context (consensus + divergence) from narrative section
   * @param {string} text - Narrative section only (pre-parsed)
   */
  _extractContextFromMapping(text) {
    if (!text) return "";

    // Look for "Consensus:" section
    const consensusMatch = text.match(/Consensus:/i);
    if (consensusMatch) {
      return text.slice(consensusMatch.index).trim();
    }

    return text.trim();
  }

  /**
   * Combine extracted answers + artifacts into context blob
   */
  _buildContextSummary(result, request) {
    void result;
    let summary = "";

    if (request?.understandOutput?.short_answer) {
      summary += `<previous_answer>\n${request.understandOutput.short_answer}\n</previous_answer>\n\n`;
    } else if (request?.gauntletOutput?.the_answer?.statement) {
      summary += `<previous_answer>\n${request.gauntletOutput.the_answer.statement}\n</previous_answer>\n\n`;
    }


    const finalSummary = summary.trim();
    console.log("[SessionManager] Built Context Summary:", {
      length: finalSummary.length,
      preview: finalSummary.slice(0, 100).replace(/\n/g, "\\n") + "...",
      hasPreviousAnswer: finalSummary.includes("<previous_answer>"),
    });

    return finalSummary;
  }

  async persistContextBridge(sessionId, turnId, bridge) {
    try {
      if (!this.adapter) return;
      const record = { ...bridge, sessionId, createdAt: Date.now() };
      await this.adapter.put("context_bridges", record, turnId);
    } catch (_) { }
  }

  async getContextBridge(turnId) {
    try {
      if (!this.adapter) return null;
      return await this.adapter.get("context_bridges", turnId);
    } catch (_) {
      return null;
    }
  }

  async getLatestContextBridge(sessionId) {
    try {
      if (!this.adapter) return null;
      const turns = await this.adapter.getTurnsBySessionId(sessionId);
      if (!Array.isArray(turns) || turns.length === 0) return null;
      for (let i = turns.length - 1; i >= 0; i--) {
        const t = turns[i];
        if (t?.type === "ai") {
          const br = await this.getContextBridge(t.id);
          if (br) return br;
        }
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  _defaultConciergePhaseState() {
    return {
      hasRunConcierge: false,
      lastSingularityProviderId: null,
      activeWorkflow: null,
      // Handoff V2 fields
      turnInCurrentInstance: 0,    // Tracks Turn 1, 2, 3+ within current instance
      pendingHandoff: null,        // ConciergeDelta from last response
      commitPending: false,        // True when COMMIT detected, triggers fresh spawn
    };
  }

  async getConciergePhaseState(sessionId) {
    try {
      if (!this.adapter || !this.adapter.isReady || !this.adapter.isReady()) {
        return this._defaultConciergePhaseState();
      }
      const session = await this.adapter.get("sessions", sessionId);
      const state = session?.conciergePhaseState;
      if (!state || typeof state !== "object") return this._defaultConciergePhaseState();
      return {
        ...this._defaultConciergePhaseState(),
        ...state,
      };
    } catch (_) {
      return this._defaultConciergePhaseState();
    }
  }

  async setConciergePhaseState(sessionId, phaseState) {
    try {
      if (!this.adapter) return false;
      const session = await this.adapter.get("sessions", sessionId);
      if (!session) return false;
      const now = Date.now();
      const updated = {
        ...session,
        conciergePhaseState: this._toJsonSafe(phaseState) || this._defaultConciergePhaseState(),
        lastActivity: now,
        updatedAt: now,
      };
      await this.adapter.put("sessions", updated, sessionId);
      return true;
    } catch (_) {
      return false;
    }
  }



  /**
   * Get persistence adapter status
   */
  getPersistenceStatus() {
    return {
      persistenceEnabled: true,
      isInitialized: this.isInitialized,
      adapterReady: this.adapter?.isReady() || false,
    };
  }
}
