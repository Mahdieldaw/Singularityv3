// src/core/workflow-engine.js - FIXED VERSION
import { ArtifactProcessor } from '../../shared/artifact-processor';
import { formatArtifactAsOptions, parseMapperArtifact, parseExploreOutput, parseGauntletOutput, parseUnderstandOutput, parseV1MapperToArtifact, parseUnifiedMapperOutput } from '../../shared/parsing-utils';
import { computeExplore } from './cognitive/explore-computer';
import { PromptService } from './PromptService';
import { ResponseProcessor } from './ResponseProcessor';
import { getHealthTracker } from './provider-health-tracker.js';
import { classifyError } from './error-classifier.js';
import { extractUserMessage } from './context-utils.js';
import {
  errorHandler,
  createMultiProviderAuthError,
  isProviderAuthError
} from '../utils/ErrorHandler.js';
import { PROVIDER_LIMITS } from '../../shared/provider-limits';
// Parsing and Prompt building functions moved to ResponseProcessor.ts and PromptService.ts

// Track last seen text per provider/session for delta streaming
const lastStreamState = new Map();

function makeDelta(sessionId, stepId, providerId, fullText = "") {
  if (!sessionId) return fullText || "";

  const key = `${sessionId}:${stepId}:${providerId}`;
  const prev = lastStreamState.get(key) || "";
  let delta = "";

  if (prev.length === 0 && fullText && fullText.length > 0) {
    delta = fullText;
    lastStreamState.set(key, fullText);
    logger.stream("First emission:", {
      providerId,
      textLength: fullText.length,
    });
    return delta;
  }

  if (fullText && fullText.length > prev.length) {
    let prefixLen = 0;
    const minLen = Math.min(prev.length, fullText.length);

    while (prefixLen < minLen && prev[prefixLen] === fullText[prefixLen]) {
      prefixLen++;
    }

    if (prefixLen >= prev.length * 0.7) {
      delta = fullText.slice(prev.length);
      lastStreamState.set(key, fullText);
      logger.stream("Incremental append:", {
        providerId,
        deltaLen: delta.length,
      });
    } else {
      logger.stream(
        `Divergence detected for ${providerId}: commonPrefix=${prefixLen}/${prev.length}`,
      );
      lastStreamState.set(key, fullText);
      return fullText.slice(prefixLen);
    }
    return delta;
  }

  if (fullText === prev) {
    logger.stream("Duplicate call (no-op):", { providerId });
    return "";
  }

  if (fullText.length < prev.length) {
    const regression = prev.length - fullText.length;
    const regressionPercent = (regression / prev.length) * 100;
    const isSmallRegression = regression <= 200 || regressionPercent <= 5;

    if (isSmallRegression) {
      logger.stream(`Acceptable regression for ${providerId}:`, {
        chars: regression,
        percent: regressionPercent.toFixed(1) + "%",
      });
      lastStreamState.set(key, fullText);
      return "";
    }

    const now = Date.now();
    const lastWarnKey = `${key}:lastRegressionWarn`;
    const warnCountKey = `${key}:regressionWarnCount`;
    const lastWarn = lastStreamState.get(lastWarnKey) || 0;
    const currentCount = lastStreamState.get(warnCountKey) || 0;
    const WARN_MAX = 2;
    if (currentCount < WARN_MAX && now - lastWarn > 5000) {
      logger.warn(
        `[makeDelta] Significant text regression for ${providerId}:`,
        {
          prevLen: prev.length,
          fullLen: fullText.length,
          regression,
          regressionPercent: regressionPercent.toFixed(1) + "%",
        },
      );
      lastStreamState.set(lastWarnKey, now);
      lastStreamState.set(warnCountKey, currentCount + 1);
    }
    lastStreamState.set(key, fullText);
    return "";
  }

  return "";
}

function clearDeltaCache(sessionId) {
  if (!sessionId) return;

  const keysToDelete = [];
  lastStreamState.forEach((_, key) => {
    if (key.startsWith(`${sessionId}:`)) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => lastStreamState.delete(key));
  logger.debug(
    `[makeDelta] Cleared ${keysToDelete.length} cache entries for session ${sessionId}`,
  );
}

const STREAMING_DEBUG = false;
const logger = {
  stream: (msg, meta) => {
    if (STREAMING_DEBUG) console.debug(`[WorkflowEngine] ${msg}`, meta);
  },
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const WORKFLOW_DEBUG = false; // ✅ Off-by-default verbose workflow logs
const wdbg = (...args) => {
  if (WORKFLOW_DEBUG) console.log(...args);
};

function normalizeCitationId(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

function normalizeSupporterProviderIds(supporters, citationSourceOrder) {
  const out = new Set();
  const list = Array.isArray(supporters) ? supporters : [];
  const order = citationSourceOrder && typeof citationSourceOrder === "object" ? citationSourceOrder : {};

  for (const s of list) {
    const citationNum = normalizeCitationId(s);
    if (citationNum != null) {
      const pid = order[citationNum] || order[String(citationNum)];
      if (pid) {
        out.add(String(pid));
      } else {
        out.add(String(citationNum));
      }
      continue;
    }
    if (s != null) out.add(String(s));
  }

  return Array.from(out);
}

function computeConsensusGateFromMapping({ stepResults, mappingSteps }) {
  try {
    const mappingStep = Array.isArray(mappingSteps) ? mappingSteps[0] : null;
    if (!mappingStep) return null;

    const mappingTake = stepResults?.get(mappingStep.stepId);
    const mappingResult = mappingTake?.status === "completed" ? mappingTake.result : null;
    const mappingMeta = mappingResult?.meta && typeof mappingResult.meta === "object" ? mappingResult.meta : null;
    const graphTopology = mappingMeta?.graphTopology;
    const nodes = graphTopology?.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0) return null;

    const batchStepId = Array.isArray(mappingStep?.payload?.sourceStepIds) ? mappingStep.payload.sourceStepIds[0] : null;
    if (!batchStepId) return null;
    const batchTake = stepResults?.get(batchStepId);
    const batchResults = batchTake?.status === "completed" ? batchTake.result?.results : null;
    if (!batchResults || typeof batchResults !== "object") return null;

    const completedProviders = Object.entries(batchResults)
      .filter(([_pid, r]) => r && r.status === "completed" && String(r.text || "").trim().length > 0)
      .map(([pid]) => String(pid));

    const totalCompleted = completedProviders.length;
    const completedSet = new Set(completedProviders);

    const citationSourceOrder = mappingMeta?.citationSourceOrder;

    const approaches = nodes
      .map((n) => {
        const supporterIds = normalizeSupporterProviderIds(n?.supporters, citationSourceOrder).filter((pid) =>
          completedSet.has(pid),
        );
        const supportCount = supporterIds.length;
        const supportRatio = totalCompleted > 0 ? supportCount / totalCompleted : 0;
        return {
          id: n?.id != null ? String(n.id) : "",
          label: n?.label != null ? String(n.label) : "",
          supportCount,
          supportRatio,
          supporterProviderIds: supporterIds,
        };
      })
      .filter((a) => a.id || a.label);

    if (approaches.length === 0) return null;

    const maxSupporters = Math.max(...approaches.map((a) => a.supportCount));
    const skipRefiner = approaches.length === 1 || maxSupporters <= 2;

    let reason = "has_anchor_outlier";
    if (approaches.length === 1) reason = "monoculture";
    else if (maxSupporters <= 2) reason = "no_anchor";

    return {
      consensusOnly: !!skipRefiner,
      skipRefiner: !!skipRefiner,
      skipAntagonist: !!skipRefiner,
      reason,
      stats: {
        totalModelsCompleted: totalCompleted,
        approachesCount: approaches.length,
        maxSupporters,
        approaches,
      },
    };
  } catch (_) {
    return null;
  }
}
// =============================================================================
// WORKFLOW ENGINE - FIXED
// =============================================================================

export class WorkflowEngine {
  constructor(orchestrator, sessionManager, port, options = {}) {
    this.orchestrator = orchestrator;
    this.sessionManager = sessionManager;
    this.port = port;

    // Accept injected or create new
    this.promptService = options.promptService || new PromptService();
    this.responseProcessor = options.responseProcessor || new ResponseProcessor();

    // Keep track of the most recent finalized turn to align IDs with persistence
    this._lastFinalizedTurn = null;
    this.healthTracker = getHealthTracker();
  }

  async _haltForCognitivePipeline(request, context, steps, stepResults, resolvedContext) {
    try {
      const mappingResult = Array.from(stepResults.entries()).find(([_, v]) =>
        v.status === "completed" && v.result?.mapperArtifact,
      )?.[1]?.result;

      const userMessageForExplore =
        context?.userMessage || this.currentUserMessage || "";

      let mapperArtifact = mappingResult?.mapperArtifact || null;
      if (!mapperArtifact) {
        try {
          const mappingSteps = Array.isArray(steps)
            ? steps.filter((s) => s && s.type === "mapping")
            : [];
          for (const step of mappingSteps) {
            const take = stepResults.get(step.stepId);
            const result = take?.status === "completed" ? take.result : null;
            if (!result?.text) continue;
            mapperArtifact = parseV1MapperToArtifact(result.text, {
              graphTopology: result?.meta?.graphTopology,
              query: userMessageForExplore,
            });
            if (mapperArtifact) break;
          }
        } catch (_) { }
      }

      if (!mapperArtifact) {
        console.error("[WorkflowEngine] Cognitive pipeline missing mapperArtifact");
        try {
          if (resolvedContext?.type !== "recompute") {
            const persistResult = this._buildPersistenceResultFromStepResults(
              steps,
              stepResults,
            );
            const persistRequest = {
              type: resolvedContext?.type || "initialize",
              sessionId: context.sessionId,
              userMessage: context?.userMessage || this.currentUserMessage || "",
              canonicalUserTurnId: context?.canonicalUserTurnId,
              canonicalAiTurnId: context?.canonicalAiTurnId,
            };
            await this.sessionManager.persist(
              persistRequest,
              resolvedContext,
              persistResult,
            );
          }
        } catch (_) { }

        this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
        this.port.postMessage({
          type: "WORKFLOW_COMPLETE",
          sessionId: context.sessionId,
          workflowId: request.workflowId,
          finalResults: Object.fromEntries(stepResults),
          haltReason: "mapping_artifact_missing",
        });
        return true;
      }

      const exploreAnalysis = computeExplore(
        userMessageForExplore,
        mapperArtifact,
      );

      this.port.postMessage({
        type: "MAPPER_ARTIFACT_READY",
        sessionId: context.sessionId,
        aiTurnId: context.canonicalAiTurnId,
        artifact: mapperArtifact,
        analysis: exploreAnalysis,
      });

      try {
        if (resolvedContext?.type !== "recompute") {
          const persistResult = this._buildPersistenceResultFromStepResults(
            steps,
            stepResults,
          );
          const persistRequest = {
            type: resolvedContext?.type || "initialize",
            sessionId: context.sessionId,
            userMessage: context?.userMessage || this.currentUserMessage || "",
            canonicalUserTurnId: context?.canonicalUserTurnId,
            canonicalAiTurnId: context?.canonicalAiTurnId,
            mapperArtifact,
            exploreAnalysis,
          };

          await this.sessionManager.persist(
            persistRequest,
            resolvedContext,
            persistResult,
          );
        }
      } catch (err) {
        console.error(
          "[WorkflowEngine] Failed to persist cognitive halt state:",
          err,
        );
      }

      this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
      this.port.postMessage({
        type: "WORKFLOW_COMPLETE",
        sessionId: context.sessionId,
        workflowId: request.workflowId,
        finalResults: Object.fromEntries(stepResults),
        haltReason: "cognitive_exploration_ready",
      });
      return true;
    } catch (e) {
      console.error("[WorkflowEngine] computeExplore failed:", e);
      return false;
    }
  }

  _buildPersistenceResultFromStepResults(steps, stepResults) {
    const out = {
      batchOutputs: {},
      synthesisOutputs: {},
      mappingOutputs: {},
      refinerOutputs: {},
      antagonistOutputs: {},
      gauntletOutputs: {},
    };

    const stepById = new Map((steps || []).map((s) => [s.stepId, s]));
    stepResults.forEach((value, stepId) => {
      const step = stepById.get(stepId);
      if (!step || !value) return;

      if (value.status === "completed") {
        const result = value.result;
        if (step.type === "prompt") {
          const resultsObj = result && result.results ? result.results : {};
          Object.entries(resultsObj).forEach(([providerId, r]) => {
            out.batchOutputs[providerId] = {
              text: r?.text || "",
              status: r?.status || "completed",
              meta: r?.meta || {},
            };
          });
          return;
        }
        if (step.type === "synthesis") {
          const providerId = result?.providerId || step?.payload?.synthesisProvider;
          if (!providerId) return;
          out.synthesisOutputs[providerId] = {
            providerId,
            text: result?.text || "",
            status: result?.status || "completed",
            meta: result?.meta || {},
          };
          return;
        }
        if (step.type === "mapping") {
          const providerId = result?.providerId || step?.payload?.mappingProvider;
          if (!providerId) return;
          out.mappingOutputs[providerId] = {
            providerId,
            text: result?.text || "",
            status: result?.status || "completed",
            meta: result?.meta || {},
          };
          return;
        }
        if (step.type === "refiner") {
          const providerId = result?.providerId || step?.payload?.refinerProvider;
          if (!providerId) return;
          out.refinerOutputs[providerId] = {
            providerId,
            text: result?.text || "",
            status: result?.status || "completed",
            meta: result?.meta || {},
          };
          return;
        }
        if (step.type === "antagonist") {
          const providerId = result?.providerId || step?.payload?.antagonistProvider;
          if (!providerId) return;
          out.antagonistOutputs[providerId] = {
            providerId,
            text: result?.text || "",
            status: result?.status || "completed",
            meta: result?.meta || {},
          };
        }
        if (step.type === "gauntlet") {
          const providerId = result?.providerId || step?.payload?.gauntletProvider;
          if (!providerId) return;
          out.gauntletOutputs[providerId] = {
            providerId,
            text: result?.text || "",
            status: result?.status || "completed",
            meta: result?.meta || {},
          };
        }
        return;
      }

      if (value.status === "failed") {
        const errorText = value.error || "Unknown error";
        if (step.type === "prompt") {
          const providers = step?.payload?.providers || [];
          (providers || []).forEach((providerId) => {
            out.batchOutputs[providerId] = {
              text: "",
              status: "error",
              meta: { error: errorText },
            };
          });
          return;
        }
        if (step.type === "synthesis") {
          const providerId = step?.payload?.synthesisProvider;
          if (!providerId) return;
          out.synthesisOutputs[providerId] = {
            providerId,
            text: "",
            status: "error",
            meta: { error: errorText },
          };
          return;
        }
        if (step.type === "mapping") {
          const providerId = step?.payload?.mappingProvider;
          if (!providerId) return;
          out.mappingOutputs[providerId] = {
            providerId,
            text: "",
            status: "error",
            meta: { error: errorText },
          };
          return;
        }
        if (step.type === "refiner") {
          const providerId = step?.payload?.refinerProvider;
          if (!providerId) return;
          out.refinerOutputs[providerId] = {
            providerId,
            text: "",
            status: "error",
            meta: { error: errorText },
          };
          return;
        }
        if (step.type === "antagonist") {
          const providerId = step?.payload?.antagonistProvider;
          if (!providerId) return;
          out.antagonistOutputs[providerId] = {
            providerId,
            text: "",
            status: "error",
            meta: { error: errorText },
          };
        }
        if (step.type === "gauntlet") {
          const providerId = step?.payload?.gauntletProvider;
          if (!providerId) return;
          out.gauntletOutputs[providerId] = {
            providerId,
            text: "",
            status: "error",
            meta: { error: errorText },
          };
        }
      }
    });

    return out;
  }

  /**
   * Dispatch a non-empty streaming delta to the UI port.
   * Consolidates duplicate onPartial logic across step executors.
   */
  _dispatchPartialDelta(
    sessionId,
    stepId,
    providerId,
    text,
    label = null,
    isFinal = false,
  ) {
    try {
      let delta;

      // For final emissions, bypass makeDelta regression detection
      // This is critical when we strip sections (like GRAPH_TOPOLOGY) from the text
      if (isFinal) {
        // Force-replace with final text
        const key = `${sessionId}:${stepId}:${providerId}`;
        lastStreamState.set(key, text);
        delta = text; // Send complete final text
        logger.stream("Final emission (force-replace):", { stepId, providerId, len: text?.length || 0 });
      } else {
        delta = makeDelta(sessionId, stepId, providerId, text);
      }

      if (delta && delta.length > 0) {
        const chunk = isFinal
          ? { text: delta, isFinal: true }
          : { text: delta };
        this.port.postMessage({
          type: "PARTIAL_RESULT",
          sessionId,
          stepId,
          providerId,
          chunk,
        });
        logger.stream(label || "Delta", { stepId, providerId, len: delta.length });
        return true;
      } else {
        logger.stream("Delta skipped (empty):", { stepId, providerId });
        return false;
      }
    } catch (e) {
      logger.warn("Delta dispatch failed:", {
        stepId,
        providerId,
        error: String(e),
      });
      return false;
    }
  }



  async execute(request, resolvedContext) {
    const { context, steps } = request;
    const stepResults = new Map();
    const workflowContexts = {};

    this.currentUserMessage =
      context?.userMessage ||
      request?.context?.userMessage ||
      this.currentUserMessage ||
      "";
    if (!this.currentUserMessage?.trim()) {
      console.error("[WorkflowEngine] CRITICAL: execute() with empty userMessage!");
      return;
    }

    if (!context.sessionId || context.sessionId === "new-session") {
      context.sessionId =
        context.sessionId && context.sessionId !== "new-session"
          ? context.sessionId
          : `sid-${Date.now()}`;
    }

    try {
      // Unify V1/V2: Mode driven execution - default to cognitive mode 'auto'
      const mode = request.mode || "auto";
      const useCognitivePipeline = ["auto", "understand", "decide"].includes(mode);
      context.useCognitivePipeline = useCognitivePipeline;
      context.mode = mode;

      if (resolvedContext && resolvedContext.type === "recompute") {
        console.log(
          "[WorkflowEngine] Seeding frozen batch outputs for recompute",
        );
        try {
          stepResults.set("batch", {
            status: "completed",
            result: { results: resolvedContext.frozenBatchOutputs },
          });
        } catch (e) {
          console.warn(
            "[WorkflowEngine] Failed to seed frozen batch outputs:",
            e,
          );
        }

        try {
          Object.entries(
            resolvedContext.providerContextsAtSourceTurn || {},
          ).forEach(([pid, ctx]) => {
            if (ctx && typeof ctx === "object") {
              workflowContexts[pid] = ctx;
            }
          });
        } catch (e) {
          console.warn(
            "[WorkflowEngine] Failed to cache historical provider contexts:",
            e,
          );
        }
      }

      if (resolvedContext && resolvedContext.type === "extend") {
        try {
          const ctxs = resolvedContext.providerContexts || {};
          const cachedProviders = [];
          Object.entries(ctxs).forEach(([pid, meta]) => {
            if (
              meta &&
              typeof meta === "object" &&
              Object.keys(meta).length > 0
            ) {
              workflowContexts[pid] = meta;
              cachedProviders.push(pid);
            }
          });
          if (cachedProviders.length > 0) {
            console.log(
              `[WorkflowEngine] Pre-cached contexts from ResolvedContext.extend for providers: ${cachedProviders.join(", ")}`,
            );
          }
        } catch (e) {
          console.warn(
            "[WorkflowEngine] Failed to cache provider contexts from extend:",
            e,
          );
        }
      }

      await this._executeCognitivePipeline(
        request,
        context,
        steps,
        stepResults,
        workflowContexts,
        resolvedContext,
      );
    } catch (error) {
      console.error(
        `[WorkflowEngine] Critical workflow execution error:`,
        error,
      );
      this.port.postMessage({
        type: "WORKFLOW_COMPLETE",
        sessionId: context.sessionId,
        workflowId: request.workflowId,
        error: "A critical error occurred.",
      });
    } finally {
      clearDeltaCache(context?.sessionId);
    }
  }

  async _executeCognitivePipeline(request, context, steps, stepResults, workflowContexts, resolvedContext) {
    // V1 -> V2 Crossover: Hydrate MapperArtifact if missing and requested mode requires it
    if (!context.mapperArtifact && ["understand", "decide"].includes(context.mode)) {
      try {
        // Attempt to find a suitable V1 mapping output text from resolvedContext (previous turn)
        const previousOutputs = resolvedContext?.providerContexts || {};
        const v1MappingText = Object.values(previousOutputs)
          .map(ctx => ctx?.text || "")
          .find(text => text.includes("<mapping_output>") || text.includes("<decision_map>")); // Heuristic check

        if (v1MappingText) {
          console.log("[WorkflowEngine] Hydrating MapperArtifact from V1 output for crossover...");
          context.mapperArtifact = parseV1MapperToArtifact(v1MappingText, {
            query: context.userMessage || ""
          });
        }
      } catch (err) {
        console.warn("[WorkflowEngine] Failed to hydrate V1 artifact:", err);
      }
    }

    const promptSteps = steps.filter((step) => step.type === "prompt");
    const mappingSteps = steps.filter((step) => step.type === "mapping");

    for (const step of promptSteps) {
      try {
        const result = await this.executePromptStep(step, context);
        stepResults.set(step.stepId, { status: "completed", result });
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: context.sessionId,
          stepId: step.stepId,
          status: "completed",
          result,
          isRecompute: resolvedContext?.type === "recompute",
          sourceTurnId: resolvedContext?.sourceTurnId,
        });

        const resultsObj = result && result.results ? result.results : {};
        const successfulCount = Object.values(resultsObj).filter(
          (r) => r.status === "completed",
        ).length;

        if (resolvedContext?.type !== "recompute" && successfulCount < 2) {
          console.warn(
            `[WorkflowEngine] Pipeline halted: only ${successfulCount} models responded (need 2).`,
          );

          try {
            const persistResult = this._buildPersistenceResultFromStepResults(
              steps,
              stepResults,
            );
            await this.sessionManager.persist(
              {
                type: resolvedContext?.type || "initialize",
                sessionId: context.sessionId,
                userMessage: context?.userMessage || this.currentUserMessage || "",
                canonicalUserTurnId: context?.canonicalUserTurnId,
                canonicalAiTurnId: context?.canonicalAiTurnId,
              },
              resolvedContext,
              persistResult,
            );
          } catch (_) { }

          this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
          this.port.postMessage({
            type: "WORKFLOW_COMPLETE",
            sessionId: context.sessionId,
            workflowId: request.workflowId,
            finalResults: Object.fromEntries(stepResults),
            haltReason: "insufficient_witnesses",
          });
          return;
        }

        try {
          Object.entries(resultsObj).forEach(([pid, data]) => {
            if (data && data.meta && Object.keys(data.meta).length > 0) {
              workflowContexts[pid] = data.meta;
            }
          });
        } catch (_) { }
      } catch (error) {
        console.error(`[WorkflowEngine] Batch step failed:`, error);
        stepResults.set(step.stepId, { status: "failed", error: error.message });
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: context.sessionId,
          stepId: step.stepId,
          status: "failed",
          error: error.message,
          isRecompute: resolvedContext?.type === "recompute",
          sourceTurnId: resolvedContext?.sourceTurnId,
        });

        try {
          if (resolvedContext?.type !== "recompute") {
            const persistResult = this._buildPersistenceResultFromStepResults(
              steps,
              stepResults,
            );
            await this.sessionManager.persist(
              {
                type: resolvedContext?.type || "initialize",
                sessionId: context.sessionId,
                userMessage: context?.userMessage || this.currentUserMessage || "",
                canonicalUserTurnId: context?.canonicalUserTurnId,
                canonicalAiTurnId: context?.canonicalAiTurnId,
              },
              resolvedContext,
              persistResult,
            );
          }
        } catch (_) { }

        this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
        this.port.postMessage({
          type: "WORKFLOW_COMPLETE",
          sessionId: context.sessionId,
          workflowId: request.workflowId,
          finalResults: Object.fromEntries(stepResults),
          haltReason: "batch_failed",
        });
        return;
      }
    }

    for (const step of mappingSteps) {
      try {
        const result = await this.executeMappingStep(
          step,
          context,
          stepResults,
          workflowContexts,
          resolvedContext,
        );
        stepResults.set(step.stepId, { status: "completed", result });
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: context.sessionId,
          stepId: step.stepId,
          status: "completed",
          result,
          isRecompute: resolvedContext?.type === "recompute",
          sourceTurnId: resolvedContext?.sourceTurnId,
        });

        try {
          if (resolvedContext?.type !== "recompute") {
            const aiTurnId = context?.canonicalAiTurnId;
            const providerId = step?.payload?.mappingProvider;
            if (aiTurnId && providerId) {
              this.sessionManager
                .upsertProviderResponse(
                  context.sessionId,
                  aiTurnId,
                  providerId,
                  "mapping",
                  0,
                  {
                    text: result?.text || "",
                    status: result?.status || "completed",
                    meta: result?.meta || {},
                  },
                )
                .catch(() => { });
            }
          }
        } catch (_) { }
      } catch (error) {
        console.error(`[WorkflowEngine] Mapping failed (HALTING):`, error);
        stepResults.set(step.stepId, { status: "failed", error: error.message });
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: context.sessionId,
          stepId: step.stepId,
          status: "failed",
          error: error.message,
          isRecompute: resolvedContext?.type === "recompute",
          sourceTurnId: resolvedContext?.sourceTurnId,
        });

        try {
          if (resolvedContext?.type !== "recompute") {
            const persistResult = this._buildPersistenceResultFromStepResults(
              steps,
              stepResults,
            );
            await this.sessionManager.persist(
              {
                type: resolvedContext?.type || "initialize",
                sessionId: context.sessionId,
                userMessage: context?.userMessage || this.currentUserMessage || "",
                canonicalUserTurnId: context?.canonicalUserTurnId,
                canonicalAiTurnId: context?.canonicalAiTurnId,
              },
              resolvedContext,
              persistResult,
            );
          }
        } catch (_) { }

        this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
        this.port.postMessage({
          type: "WORKFLOW_COMPLETE",
          sessionId: context.sessionId,
          workflowId: request.workflowId,
          finalResults: Object.fromEntries(stepResults),
          haltReason: "mapping_failed",
        });
        return;
      }
    }

    const didHalt = await this._haltForCognitivePipeline(
      request,
      context,
      steps,
      stepResults,
      resolvedContext,
    );
    if (didHalt) return;

    this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
    this.port.postMessage({
      type: "WORKFLOW_COMPLETE",
      sessionId: context.sessionId,
      workflowId: request.workflowId,
      finalResults: Object.fromEntries(stepResults),
      haltReason: "cognitive_halt_failed",
    });
  }

  async _executeClassicPipeline(request, context, steps, stepResults, workflowContexts, resolvedContext) {
    // V2 -> V1 Crossover: Flatten MapperArtifact to text options if present
    if (context.mapperArtifact && !context.extractedOptions) {
      try {
        console.log("[WorkflowEngine] Flattening V2 MapperArtifact for V1 pipeline...");
        context.extractedOptions = formatArtifactAsOptions(context.mapperArtifact);
      } catch (err) {
        console.warn("[WorkflowEngine] Failed to flatten V2 artifact:", err);
      }
    }

    const promptSteps = steps.filter((step) => step.type === "prompt");
    const synthesisSteps = steps.filter((step) => step.type === "synthesis");
    const mappingSteps = steps.filter((step) => step.type === "mapping");

    for (const step of promptSteps) {
      try {
        const result = await this.executePromptStep(step, context);
        stepResults.set(step.stepId, { status: "completed", result });
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: context.sessionId,
          stepId: step.stepId,
          status: "completed",
          result,
          isRecompute: resolvedContext?.type === "recompute",
          sourceTurnId: resolvedContext?.sourceTurnId,
        });

        const resultsObj = result && result.results ? result.results : {};
        const successfulCount = Object.values(resultsObj).filter(
          (r) => r.status === "completed",
        ).length;

        if (resolvedContext?.type !== "recompute" && successfulCount < 2) {
          console.warn(
            `[WorkflowEngine] Pipeline halted: only ${successfulCount} models responded (need 2).`,
          );

          try {
            const persistResult = this._buildPersistenceResultFromStepResults(
              steps,
              stepResults,
            );
            await this.sessionManager.persist(
              {
                type: resolvedContext?.type || "initialize",
                sessionId: context.sessionId,
                userMessage: context?.userMessage || this.currentUserMessage || "",
                canonicalUserTurnId: context?.canonicalUserTurnId,
                canonicalAiTurnId: context?.canonicalAiTurnId,
              },
              resolvedContext,
              persistResult,
            );
          } catch (_) { }

          this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
          this.port.postMessage({
            type: "WORKFLOW_COMPLETE",
            sessionId: context.sessionId,
            workflowId: request.workflowId,
            finalResults: Object.fromEntries(stepResults),
            haltReason: "insufficient_witnesses",
          });
          return;
        }

        try {
          Object.entries(resultsObj).forEach(([pid, data]) => {
            if (data && data.meta && Object.keys(data.meta).length > 0) {
              workflowContexts[pid] = data.meta;
            }
          });
        } catch (_) { }
      } catch (error) {
        console.error(`[WorkflowEngine] Batch step failed:`, error);
        stepResults.set(step.stepId, { status: "failed", error: error.message });
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: context.sessionId,
          stepId: step.stepId,
          status: "failed",
          error: error.message,
          isRecompute: resolvedContext?.type === "recompute",
          sourceTurnId: resolvedContext?.sourceTurnId,
        });

        try {
          if (resolvedContext?.type !== "recompute") {
            const persistResult = this._buildPersistenceResultFromStepResults(
              steps,
              stepResults,
            );
            await this.sessionManager.persist(
              {
                type: resolvedContext?.type || "initialize",
                sessionId: context.sessionId,
                userMessage: context?.userMessage || this.currentUserMessage || "",
                canonicalUserTurnId: context?.canonicalUserTurnId,
                canonicalAiTurnId: context?.canonicalAiTurnId,
              },
              resolvedContext,
              persistResult,
            );
          }
        } catch (_) { }

        this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
        this.port.postMessage({
          type: "WORKFLOW_COMPLETE",
          sessionId: context.sessionId,
          workflowId: request.workflowId,
          finalResults: Object.fromEntries(stepResults),
          haltReason: "batch_failed",
        });
        return;
      }
    }

    for (const step of mappingSteps) {
      try {
        const result = await this.executeMappingStep(
          step,
          context,
          stepResults,
          workflowContexts,
          resolvedContext,
        );
        stepResults.set(step.stepId, { status: "completed", result });
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: context.sessionId,
          stepId: step.stepId,
          status: "completed",
          result,
          isRecompute: resolvedContext?.type === "recompute",
          sourceTurnId: resolvedContext?.sourceTurnId,
        });

        try {
          if (resolvedContext?.type !== "recompute") {
            const aiTurnId = context?.canonicalAiTurnId;
            const providerId = step?.payload?.mappingProvider;
            if (aiTurnId && providerId) {
              this.sessionManager
                .upsertProviderResponse(
                  context.sessionId,
                  aiTurnId,
                  providerId,
                  "mapping",
                  0,
                  {
                    text: result?.text || "",
                    status: result?.status || "completed",
                    meta: result?.meta || {},
                  },
                )
                .catch(() => { });
            }
          }
        } catch (_) { }
      } catch (error) {
        console.error(`[WorkflowEngine] Mapping failed (HALTING):`, error);
        stepResults.set(step.stepId, { status: "failed", error: error.message });
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: context.sessionId,
          stepId: step.stepId,
          status: "failed",
          error: error.message,
          isRecompute: resolvedContext?.type === "recompute",
          sourceTurnId: resolvedContext?.sourceTurnId,
        });

        try {
          if (resolvedContext?.type !== "recompute") {
            const persistResult = this._buildPersistenceResultFromStepResults(
              steps,
              stepResults,
            );
            await this.sessionManager.persist(
              {
                type: resolvedContext?.type || "initialize",
                sessionId: context.sessionId,
                userMessage: context?.userMessage || this.currentUserMessage || "",
                canonicalUserTurnId: context?.canonicalUserTurnId,
                canonicalAiTurnId: context?.canonicalAiTurnId,
              },
              resolvedContext,
              persistResult,
            );
          }
        } catch (_) { }

        this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
        this.port.postMessage({
          type: "WORKFLOW_COMPLETE",
          sessionId: context.sessionId,
          workflowId: request.workflowId,
          finalResults: Object.fromEntries(stepResults),
          haltReason: "mapping_failed",
        });
        return;
      }
    }

    const consensusGate =
      resolvedContext?.type === "recompute"
        ? null
        : computeConsensusGateFromMapping({ stepResults, mappingSteps });
    if (consensusGate) {
      context.workflowControl = consensusGate;
    }

    for (const step of synthesisSteps) {
      try {
        const result = await this.executeSynthesisStep(
          step,
          context,
          stepResults,
          workflowContexts,
          resolvedContext,
        );
        stepResults.set(step.stepId, { status: "completed", result });
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: context.sessionId,
          stepId: step.stepId,
          status: "completed",
          result,
          isRecompute: resolvedContext?.type === "recompute",
          sourceTurnId: resolvedContext?.sourceTurnId,
        });
        try {
          if (resolvedContext?.type !== "recompute") {
            const aiTurnId = context?.canonicalAiTurnId;
            const providerId = step?.payload?.synthesisProvider;
            if (aiTurnId && providerId) {
              this.sessionManager
                .upsertProviderResponse(
                  context.sessionId,
                  aiTurnId,
                  providerId,
                  "synthesis",
                  0,
                  {
                    text: result?.text || "",
                    status: result?.status || "completed",
                    meta: result?.meta || {},
                  },
                )
                .catch(() => { });
            }
          }
        } catch (_) { }
      } catch (error) {
        console.error(`[WorkflowEngine] Synthesis failed (HALTING):`, error);
        stepResults.set(step.stepId, { status: "failed", error: error.message });
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: context.sessionId,
          stepId: step.stepId,
          status: "failed",
          error: error.message,
          isRecompute: resolvedContext?.type === "recompute",
          sourceTurnId: resolvedContext?.sourceTurnId,
        });

        try {
          if (resolvedContext?.type !== "recompute") {
            const persistResult = this._buildPersistenceResultFromStepResults(
              steps,
              stepResults,
            );
            await this.sessionManager.persist(
              {
                type: resolvedContext?.type || "initialize",
                sessionId: context.sessionId,
                userMessage: context?.userMessage || this.currentUserMessage || "",
                canonicalUserTurnId: context?.canonicalUserTurnId,
                canonicalAiTurnId: context?.canonicalAiTurnId,
              },
              resolvedContext,
              persistResult,
            );
          }
        } catch (_) { }

        this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
        this.port.postMessage({
          type: "WORKFLOW_COMPLETE",
          sessionId: context.sessionId,
          workflowId: request.workflowId,
          finalResults: Object.fromEntries(stepResults),
          haltReason: "synthesis_failed",
        });
        return;
      }
    }

    const consensusOnly = !!context?.workflowControl?.consensusOnly;
    if (!consensusOnly) {
      const refinerSteps = steps.filter((step) => step.type === "refiner");
      for (const step of refinerSteps) {
        try {
          const result = await this.executeRefinerStep(
            step,
            context,
            stepResults,
          );
          stepResults.set(step.stepId, { status: "completed", result });
          this.port.postMessage({
            type: "WORKFLOW_STEP_UPDATE",
            sessionId: context.sessionId,
            stepId: step.stepId,
            status: "completed",
            result,
            isRecompute: resolvedContext?.type === "recompute",
            sourceTurnId: resolvedContext?.sourceTurnId,
          });
          try {
            if (resolvedContext?.type !== "recompute") {
              const aiTurnId = context?.canonicalAiTurnId;
              const providerId = step?.payload?.refinerProvider;
              if (aiTurnId && providerId) {
                this.sessionManager
                  .upsertProviderResponse(
                    context.sessionId,
                    aiTurnId,
                    providerId,
                    "refiner",
                    0,
                    {
                      text: result?.text || "",
                      status: result?.status || "completed",
                      meta: result?.meta || {},
                    },
                  )
                  .catch(() => { });
              }
            }
          } catch (_) { }
        } catch (error) {
          console.error(
            `[WorkflowEngine] Refiner step ${step.stepId} failed:`,
            error,
          );
          stepResults.set(step.stepId, {
            status: "failed",
            error: error.message,
          });
          this.port.postMessage({
            type: "WORKFLOW_STEP_UPDATE",
            sessionId: context.sessionId,
            stepId: step.stepId,
            status: "failed",
            error: error.message,
            isRecompute: resolvedContext?.type === "recompute",
            sourceTurnId: resolvedContext?.sourceTurnId,
          });
        }
      }

      const antagonistSteps = steps.filter((step) => step.type === "antagonist");
      for (const step of antagonistSteps) {
        try {
          const result = await this.executeAntagonistStep(
            step,
            context,
            stepResults,
          );
          stepResults.set(step.stepId, { status: "completed", result });
          this.port.postMessage({
            type: "WORKFLOW_STEP_UPDATE",
            sessionId: context.sessionId,
            stepId: step.stepId,
            status: "completed",
            result,
            isRecompute: resolvedContext?.type === "recompute",
            sourceTurnId: resolvedContext?.sourceTurnId,
          });
          try {
            if (resolvedContext?.type !== "recompute") {
              const aiTurnId = context?.canonicalAiTurnId;
              const providerId = step?.payload?.antagonistProvider;
              if (aiTurnId && providerId) {
                this.sessionManager
                  .upsertProviderResponse(
                    context.sessionId,
                    aiTurnId,
                    providerId,
                    "antagonist",
                    0,
                    {
                      text: result?.text || "",
                      status: result?.status || "completed",
                      meta: result?.meta || {},
                    },
                  )
                  .catch(() => { });
              }
            }
          } catch (_) { }
        } catch (error) {
          console.error(
            `[WorkflowEngine] Antagonist step ${step.stepId} failed:`,
            error,
          );
          stepResults.set(step.stepId, {
            status: "failed",
            error: error.message,
          });
          this.port.postMessage({
            type: "WORKFLOW_STEP_UPDATE",
            sessionId: context.sessionId,
            stepId: step.stepId,
            status: "failed",
            error: error.message,
            isRecompute: resolvedContext?.type === "recompute",
            sourceTurnId: resolvedContext?.sourceTurnId,
          });
        }
      }
    }

    const understandSteps = steps.filter((step) => step.type === "understand");
    for (const step of understandSteps) {
      try {
        const result = await this.executeUnderstandStep(
          step,
          context,
          stepResults,
        );
        stepResults.set(step.stepId, { status: "completed", result });
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: context.sessionId,
          stepId: step.stepId,
          status: "completed",
          result,
          isRecompute: resolvedContext?.type === "recompute",
          sourceTurnId: resolvedContext?.sourceTurnId,
        });
        try {
          if (resolvedContext?.type !== "recompute") {
            const aiTurnId = context?.canonicalAiTurnId;
            const providerId = step?.payload?.understandProvider;
            if (aiTurnId && providerId) {
              this.sessionManager
                .upsertProviderResponse(
                  context.sessionId,
                  aiTurnId,
                  providerId,
                  "understand",
                  0,
                  {
                    text: result?.text || "",
                    status: result?.status || "completed",
                    meta: result?.meta || {},
                  },
                )
                .catch(() => { });
            }
          }
        } catch (_) { }
      } catch (error) {
        console.error(
          `[WorkflowEngine] Understand step ${step.stepId} failed:`,
          error,
        );
        stepResults.set(step.stepId, {
          status: "failed",
          error: error.message,
        });
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: context.sessionId,
          stepId: step.stepId,
          status: "failed",
          error: error.message,
          isRecompute: resolvedContext?.type === "recompute",
          sourceTurnId: resolvedContext?.sourceTurnId,
        });
      }
    }

    const gauntletSteps = steps.filter((step) => step.type === "gauntlet");
    for (const step of gauntletSteps) {
      try {
        const result = await this.executeGauntletStep(
          step,
          context,
          stepResults,
        );
        stepResults.set(step.stepId, { status: "completed", result });
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: context.sessionId,
          stepId: step.stepId,
          status: "completed",
          result,
          isRecompute: resolvedContext?.type === "recompute",
          sourceTurnId: resolvedContext?.sourceTurnId,
        });
        try {
          if (resolvedContext?.type !== "recompute") {
            const aiTurnId = context?.canonicalAiTurnId;
            const providerId = step?.payload?.gauntletProvider;
            if (aiTurnId && providerId) {
              this.sessionManager
                .upsertProviderResponse(
                  context.sessionId,
                  aiTurnId,
                  providerId,
                  "gauntlet",
                  0,
                  {
                    text: result?.text || "",
                    status: result?.status || "completed",
                    meta: result?.meta || {},
                  },
                )
                .catch(() => { });
            }
          }
        } catch (_) { }
      } catch (error) {
        console.error(
          `[WorkflowEngine] Gauntlet step ${step.stepId} failed:`,
          error,
        );
        stepResults.set(step.stepId, {
          status: "failed",
          error: error.message,
        });
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: context.sessionId,
          stepId: step.stepId,
          status: "failed",
          error: error.message,
          isRecompute: resolvedContext?.type === "recompute",
          sourceTurnId: resolvedContext?.sourceTurnId,
        });
      }
    }

    try {
      const result = {
        batchOutputs: {},
        synthesisOutputs: {},
        mappingOutputs: {},
        refinerOutputs: {},
        antagonistOutputs: {},
        gauntletOutputs: {},
      };
      const stepById = new Map((steps || []).map((s) => [s.stepId, s]));
      stepResults.forEach((stepResult, stepId) => {
        if (stepResult.status !== "completed") return;
        const step = stepById.get(stepId);
        if (!step) return;
        if (step.type === "prompt") {
          result.batchOutputs = stepResult.result?.results || {};
        } else if (step.type === "synthesis") {
          const providerId = step.payload?.synthesisProvider;
          if (providerId) result.synthesisOutputs[providerId] = stepResult.result;
        } else if (step.type === "mapping") {
          const providerId = step.payload?.mappingProvider;
          if (providerId) result.mappingOutputs[providerId] = stepResult.result;
        } else if (step.type === "refiner") {
          const providerId = step.payload?.refinerProvider;
          if (providerId) result.refinerOutputs[providerId] = stepResult.result;
        } else if (step.type === "antagonist") {
          const providerId = step.payload?.antagonistProvider;
          if (providerId) result.antagonistOutputs[providerId] = stepResult.result;
        }
      });

      const userMessage =
        context?.userMessage || this.currentUserMessage || "";
      const persistRequest = {
        type: resolvedContext?.type || "unknown",
        sessionId: context.sessionId,
        userMessage,
      };
      if (resolvedContext?.type === "recompute") {
        persistRequest.sourceTurnId = resolvedContext.sourceTurnId;
        persistRequest.stepType = resolvedContext.stepType;
        persistRequest.targetProvider = resolvedContext.targetProvider;
      }
      if (context?.canonicalUserTurnId)
        persistRequest.canonicalUserTurnId = context.canonicalUserTurnId;
      if (context?.canonicalAiTurnId)
        persistRequest.canonicalAiTurnId = context.canonicalAiTurnId;

      console.log(
        `[WorkflowEngine] Persisting (consolidated) ${persistRequest.type} workflow to SessionManager`,
      );
      const persistResult = await this.sessionManager.persist(
        persistRequest,
        resolvedContext,
        result,
      );

      if (persistResult) {
        if (persistResult.userTurnId)
          context.canonicalUserTurnId = persistResult.userTurnId;
        if (persistResult.aiTurnId)
          context.canonicalAiTurnId = persistResult.aiTurnId;
        if (resolvedContext?.type === "initialize" && persistResult.sessionId) {
          context.sessionId = persistResult.sessionId;
          console.log(
            `[WorkflowEngine] Initialize complete: session=${persistResult.sessionId}`,
          );
        }
      }
    } catch (e) {
      console.error("[WorkflowEngine] Consolidated persistence failed:", e);
    }

    this.port.postMessage({
      type: "WORKFLOW_COMPLETE",
      sessionId: context.sessionId,
      workflowId: request.workflowId,
      finalResults: Object.fromEntries(stepResults),
      ...(context?.workflowControl?.consensusOnly ? { haltReason: "consensus_only" } : {}),
    });

    this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
  }

  /**
   * Emit TURN_FINALIZED message with canonical turn data
   * This allows UI to replace optimistic placeholders with backend-confirmed data
   */
  _emitTurnFinalized(context, steps, stepResults, resolvedContext) {
    // Skip TURN_FINALIZED for recompute operations (they don't create new turns)
    if (resolvedContext?.type === "recompute") {
      console.log(
        "[WorkflowEngine] Skipping TURN_FINALIZED for recompute operation",
      );
      return;
    }

    const userMessage = context?.userMessage || this.currentUserMessage || "";
    if (!userMessage) {
      return;
    }

    try {
      // Build canonical turn structure
      const timestamp = Date.now();
      // Prefer canonical IDs passed from connection-handler
      const userTurnId =
        context?.canonicalUserTurnId || this._generateId("user");
      const aiTurnId = context?.canonicalAiTurnId || this._generateId("ai");

      const userTurn = {
        id: userTurnId,
        type: "user",
        text: userMessage,
        createdAt: timestamp,
        sessionId: context.sessionId,
      };

      // Collect AI results from step results
      const batchResponses = {};
      const synthesisResponses = {};
      const mappingResponses = {};
      const refinerResponses = {};
      const antagonistResponses = {};
      const exploreResponses = {};
      const understandResponses = {};
      const gauntletResponses = {};
      let primarySynthesizer = null;
      let primaryMapper = null;

      const stepById = new Map((steps || []).map((s) => [s.stepId, s]));
      stepResults.forEach((value, stepId) => {
        const step = stepById.get(stepId);
        if (!step || !value) return;

        if (value.status === "completed") {
          const result = value.result;
          switch (step.type) {
            case "prompt": {
              const resultsObj = result?.results || {};
              Object.entries(resultsObj).forEach(([providerId, r]) => {
                batchResponses[providerId] = [{
                  providerId,
                  text: r.text || "",
                  status: r.status || "completed",
                  createdAt: timestamp,
                  updatedAt: timestamp,
                  meta: r.meta || {},
                }];
              });
              break;
            }
            case "synthesis": {
              const providerId = result?.providerId || step?.payload?.synthesisProvider;
              if (!providerId) return;
              if (!synthesisResponses[providerId])
                synthesisResponses[providerId] = [];
              synthesisResponses[providerId].push({
                providerId,
                text: result?.text || "",
                status: result?.status || "completed",
                createdAt: timestamp,
                updatedAt: timestamp,
                meta: result?.meta || {},
              });
              primarySynthesizer = providerId;
              break;
            }
            case "mapping": {
              const providerId = result?.providerId || step?.payload?.mappingProvider;
              if (!providerId) return;
              if (!mappingResponses[providerId])
                mappingResponses[providerId] = [];
              mappingResponses[providerId].push({
                providerId,
                text: result?.text || "",
                status: result?.status || "completed",
                createdAt: timestamp,
                updatedAt: timestamp,
                meta: result?.meta || {},
              });
              primaryMapper = providerId;
              break;
            }
            case "refiner": {
              const providerId = result?.providerId || step?.payload?.refinerProvider;
              if (!providerId) return;
              if (!refinerResponses[providerId])
                refinerResponses[providerId] = [];
              refinerResponses[providerId].push({
                providerId,
                text: result?.text || "",
                status: result?.status || "completed",
                createdAt: timestamp,
                updatedAt: timestamp,
                meta: result?.meta || {},
              });
              break;
            }
            case "explore": {
              const providerId = result?.providerId || step?.payload?.exploreProvider;
              if (!providerId) return;
              if (!exploreResponses[providerId])
                exploreResponses[providerId] = [];
              exploreResponses[providerId].push({
                providerId,
                text: result?.text || "",
                status: result?.status || "completed",
                createdAt: timestamp,
                updatedAt: timestamp,
                meta: result?.meta || {},
              });
              break;
            }
            case "antagonist": {
              const providerId = result?.providerId || step?.payload?.antagonistProvider;
              if (!providerId) return;
              if (!antagonistResponses[providerId])
                antagonistResponses[providerId] = [];
              antagonistResponses[providerId].push({
                providerId,
                text: result?.text || "",
                status: result?.status || "completed",
                createdAt: timestamp,
                updatedAt: timestamp,
                meta: result?.meta || {},
              });
              break;
            }
            case "understand": {
              const providerId = result?.providerId || step?.payload?.understandProvider;
              if (!providerId) return;
              if (!understandResponses[providerId])
                understandResponses[providerId] = [];
              understandResponses[providerId].push({
                providerId,
                text: result?.text || "",
                status: result?.status || "completed",
                createdAt: timestamp,
                updatedAt: timestamp,
                meta: result?.meta || {},
              });
              break;
            }
            case "gauntlet": {
              const providerId = result?.providerId || step?.payload?.gauntletProvider;
              if (!providerId) return;
              if (!gauntletResponses[providerId])
                gauntletResponses[providerId] = [];
              gauntletResponses[providerId].push({
                providerId,
                text: result?.text || "",
                status: result?.status || "completed",
                createdAt: timestamp,
                updatedAt: timestamp,
                meta: result?.meta || {},
              });
              break;
            }
          }
          return;
        }

        if (value.status === "failed") {
          const errorText = value.error || "Unknown error";
          switch (step.type) {
            case "prompt": {
              const providers = step?.payload?.providers || [];
              (providers || []).forEach((providerId) => {
                batchResponses[providerId] = [{
                  providerId,
                  text: "",
                  status: "error",
                  createdAt: timestamp,
                  updatedAt: timestamp,
                  meta: { error: errorText },
                }];
              });
              break;
            }
            case "synthesis": {
              const providerId = step?.payload?.synthesisProvider;
              if (!providerId) return;
              if (!synthesisResponses[providerId])
                synthesisResponses[providerId] = [];
              synthesisResponses[providerId].push({
                providerId,
                text: errorText || "",
                status: "error",
                createdAt: timestamp,
                updatedAt: timestamp,
                meta: { error: errorText },
              });
              if (!primarySynthesizer) primarySynthesizer = providerId;
              break;
            }
            case "mapping": {
              const providerId = step?.payload?.mappingProvider;
              if (!providerId) return;
              if (!mappingResponses[providerId])
                mappingResponses[providerId] = [];
              mappingResponses[providerId].push({
                providerId,
                text: errorText || "",
                status: "error",
                createdAt: timestamp,
                updatedAt: timestamp,
                meta: { error: errorText },
              });
              if (!primaryMapper) primaryMapper = providerId;
              break;
            }
            case "refiner": {
              const providerId = step?.payload?.refinerProvider;
              if (!providerId) return;
              if (!refinerResponses[providerId])
                refinerResponses[providerId] = [];
              refinerResponses[providerId].push({
                providerId,
                text: errorText || "",
                status: "error",
                createdAt: timestamp,
                updatedAt: timestamp,
                meta: { error: errorText },
              });
              break;
            }
            case "explore": {
              const providerId = step?.payload?.exploreProvider;
              if (!providerId) return;
              if (!exploreResponses[providerId])
                exploreResponses[providerId] = [];
              exploreResponses[providerId].push({
                providerId,
                text: errorText || "",
                status: "error",
                createdAt: timestamp,
                updatedAt: timestamp,
                meta: { error: errorText },
              });
              break;
            }
            case "antagonist": {
              const providerId = step?.payload?.antagonistProvider;
              if (!providerId) return;
              if (!antagonistResponses[providerId])
                antagonistResponses[providerId] = [];
              antagonistResponses[providerId].push({
                providerId,
                text: errorText || "",
                status: "error",
                createdAt: timestamp,
                updatedAt: timestamp,
                meta: { error: errorText },
              });
              break;
            }
            case "understand": {
              const providerId = step?.payload?.understandProvider;
              if (!providerId) return;
              if (!understandResponses[providerId])
                understandResponses[providerId] = [];
              understandResponses[providerId].push({
                providerId,
                text: errorText || "",
                status: "error",
                createdAt: timestamp,
                updatedAt: timestamp,
                meta: { error: errorText },
              });
              break;
            }
            case "gauntlet": {
              const providerId = step?.payload?.gauntletProvider;
              if (!providerId) return;
              if (!gauntletResponses[providerId])
                gauntletResponses[providerId] = [];
              gauntletResponses[providerId].push({
                providerId,
                text: errorText || "",
                status: "error",
                createdAt: timestamp,
                updatedAt: timestamp,
                meta: { error: errorText },
              });
              break;
            }
          }
        }
      });

      const hasData =
        Object.keys(batchResponses).length > 0 ||
        Object.keys(synthesisResponses).length > 0 ||
        Object.keys(mappingResponses).length > 0 ||
        Object.keys(refinerResponses).length > 0 ||
        Object.keys(antagonistResponses).length > 0 ||
        Object.keys(exploreResponses).length > 0 ||
        Object.keys(understandResponses).length > 0 ||
        Object.keys(gauntletResponses).length > 0;

      if (!hasData) {
        console.log("[WorkflowEngine] No AI responses to finalize");
        return;
      }

      const aiTurn = {
        id: aiTurnId,
        type: "ai",
        userTurnId: userTurn.id,
        sessionId: context.sessionId,
        threadId: "default-thread",
        createdAt: timestamp,
        batchResponses,
        synthesisResponses,
        mappingResponses,
        refinerResponses,
        antagonistResponses,
        exploreResponses,
        understandResponses,
        gauntletResponses,
        meta: {
          synthesizer: primarySynthesizer,
          mapper: primaryMapper,
          requestedFeatures: {
            synthesis: steps.some((s) => s.type === "synthesis"),
            mapping: steps.some((s) => s.type === "mapping"),
            refiner: !!(steps.some((s) => s.type === "refiner") && !context?.workflowControl?.consensusOnly),
            antagonist: !!(steps.some((s) => s.type === "antagonist") && !context?.workflowControl?.consensusOnly),
            explore: !!(steps.some((s) => s.type === "explore")),
            understand: !!(steps.some((s) => s.type === "understand")),
            gauntlet: !!(steps.some((s) => s.type === "gauntlet")),
          },
          ...(context?.workflowControl ? { workflowControl: context.workflowControl } : {}),
        },
      };

      console.log("[WorkflowEngine] Emitting TURN_FINALIZED", {
        userTurnId: userTurn.id,
        aiTurnId: aiTurn.id,
        batchCount: Object.keys(batchResponses).length,
        synthesisCount: Object.keys(synthesisResponses).length,
        mappingCount: Object.keys(mappingResponses).length,
      });

      this.port.postMessage({
        type: "TURN_FINALIZED",
        sessionId: context.sessionId,
        userTurnId: userTurn.id,
        aiTurnId: aiTurn.id,
        turn: {
          user: userTurn,
          ai: aiTurn,
        },
      });

      // Store for persistence alignment
      this._lastFinalizedTurn = {
        sessionId: context.sessionId,
        user: userTurn,
        ai: aiTurn,
      };
    } catch (error) {
      console.error("[WorkflowEngine] Failed to emit TURN_FINALIZED:", error);
    }
  }


  _generateId(prefix = "turn") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Resolves provider context using three-tier resolution:
   * 1. Workflow cache context (highest priority)
   * 2. Batch step context (medium priority)
   * 3. Persisted context (fallback)
   */
  _resolveProviderContext(
    providerId,
    context,
    payload,
    workflowContexts,
    previousResults,
    resolvedContext,
    stepType = "step",
  ) {
    const providerContexts = {};

    // Tier 1: Prefer workflow cache context produced within this workflow run
    if (workflowContexts && workflowContexts[providerId]) {
      providerContexts[providerId] = {
        meta: workflowContexts[providerId],
        continueThread: true,
      };
      try {
        wdbg(
          `[WorkflowEngine] ${stepType} using workflow-cached context for ${providerId}: ${Object.keys(
            workflowContexts[providerId],
          ).join(",")}`,
        );
      } catch (_) { }
      return providerContexts;
    }

    // Tier 2: ResolvedContext (for recompute - historical contexts)
    if (resolvedContext && resolvedContext.type === "recompute") {
      const historicalContext =
        resolvedContext.providerContextsAtSourceTurn?.[providerId];
      if (historicalContext) {
        providerContexts[providerId] = {
          meta: historicalContext,
          continueThread: true,
        };
        try {
          wdbg(
            `[WorkflowEngine] ${stepType} using historical context from ResolvedContext for ${providerId}`,
          );
        } catch (_) { }
        return providerContexts;
      }
    }

    // Tier 2: Fallback to batch step context for backwards compatibility
    if (payload.continueFromBatchStep) {
      const batchResult = previousResults.get(payload.continueFromBatchStep);
      if (batchResult?.status === "completed" && batchResult.result?.results) {
        const providerResult = batchResult.result.results[providerId];
        if (providerResult?.meta) {
          providerContexts[providerId] = {
            meta: providerResult.meta,
            continueThread: true,
          };
          try {
            wdbg(
              `[WorkflowEngine] ${stepType} continuing conversation for ${providerId} via batch step`,
            );
          } catch (_) { }
          return providerContexts;
        }
      }
    }

    // Tier 3: Last resort use persisted context (may be stale across workflow runs)
    try {
      const persisted = this.sessionManager.getProviderContexts(
        context.sessionId,
        context.threadId || "default-thread",
      );
      const persistedMeta = persisted?.[providerId]?.meta;
      if (persistedMeta && Object.keys(persistedMeta).length > 0) {
        providerContexts[providerId] = {
          meta: persistedMeta,
          continueThread: true,
        };
        try {
          console.log(
            `[WorkflowEngine] ${stepType} using persisted context for ${providerId}: ${Object.keys(
              persistedMeta,
            ).join(",")}`,
          );
        } catch (_) { }
        return providerContexts;
      }
    } catch (_) { }

    return providerContexts;
    return providerContexts;
  }

  /**
   * Execute Refiner Step
   */
  /**
   * Execute Refiner Step
   */
  async executeRefinerStep(step, context, stepResults) {
    const {
      refinerProvider,
      sourceStepIds,
      originalPrompt,
      synthesisStepIds,
      mappingStepIds,
      sourceHistorical // Present if recompute
    } = step.payload;

    let batchResponses = {};
    let synthesisText = "";
    let mappingText = "";

    // 1. Resolve Inputs (Dynamic: New or Historical)
    if (sourceHistorical) {
      // --- RECOMPUTE FLOW ---
      const { turnId } = sourceHistorical;
      console.log(`[WorkflowEngine] Refiner recompute: resolving historical inputs from turn ${turnId}`);

      // Helper to fetch textual content from historical outputs
      const fetchHistoricalText = async (type) => {
        try {
          const historicalPayload = { sourceHistorical: { turnId, responseType: type } };
          const data = await this.resolveSourceData(historicalPayload, context, stepResults);
          // Return first valid text
          return data[0]?.text || "";
        } catch (e) {
          console.warn(`[WorkflowEngine] Refiner failed to fetch historical ${type}:`, e.message);
          return "";
        }
      };

      // A. Batch Responses
      try {
        const batchPayload = { sourceHistorical: { turnId, responseType: 'batch' } };
        const data = await this.resolveSourceData(batchPayload, context, stepResults);
        data.forEach(item => {
          if (item.text) batchResponses[item.providerId] = { text: item.text, providerId: item.providerId };
        });
      } catch (e) { console.warn("[WorkflowEngine] Refiner: no batch history found", e); }

      // B. Synthesis Text
      synthesisText = await fetchHistoricalText('synthesis');

      // C. Mapping Text (striped of topology)
      const rawMapping = await fetchHistoricalText('mapping');
      if (rawMapping) {
        const { text } = this.responseProcessor.processMappingResponse(rawMapping);
        mappingText = text;
      }

    } else {
      // --- STANDARD FLOW ---
      // 1. Gather Batch Responses
      const batchStepResults = stepResults.get(sourceStepIds?.[0])?.result?.results || {};
      Object.entries(batchStepResults).forEach(([pid, res]) => {
        if (res && res.text) {
          batchResponses[pid] = { text: res.text, providerId: pid };
        }
      });

      // 2. Gather Synthesis Text
      if (synthesisStepIds && synthesisStepIds.length > 0) {
        for (const id of synthesisStepIds) {
          const res = stepResults.get(id);
          if (res?.status === "completed" && res.result?.text) {
            synthesisText = res.result.text;
            break;
          }
        }
      }

      // 3. Gather Mapping Narrative
      if (mappingStepIds && mappingStepIds.length > 0) {
        for (const id of mappingStepIds) {
          const res = stepResults.get(id);
          if (res?.status === "completed" && res.result?.text) {
            const raw = res.result.text;
            const { text } = this.responseProcessor.processMappingResponse(raw);
            mappingText = text;
            break;
          }
        }
      }
    }

    // 4. Extract mapper option titles from meta (standard flow) or raw text (recompute)
    let mapperOptionTitles = [];
    if (!sourceHistorical && mappingStepIds && mappingStepIds.length > 0) {
      // Standard flow: get from stepResults meta
      for (const id of mappingStepIds) {
        const res = stepResults.get(id);
        if (res?.status === "completed" && res.result?.meta?.allAvailableOptions) {
          mapperOptionTitles = this.responseProcessor.parseOptionTitles(res.result.meta.allAvailableOptions);
          break;
        }
      }
    } else if (sourceHistorical) {
      // Recompute flow: extract options from raw mapping text and parse titles
      try {
        const mappingPayload = { sourceHistorical: { turnId: sourceHistorical.turnId, responseType: 'mapping' } };
        const data = await this.resolveSourceData(mappingPayload, context, stepResults);
        const rawMapping = data[0]?.text || "";
        if (rawMapping) {
          const { optionTitles } = this.responseProcessor.processMappingResponse(rawMapping);
          if (optionTitles) {
            mapperOptionTitles = optionTitles;
          }
        }
      } catch (e) {
        console.warn("[WorkflowEngine] Refiner recompute: failed to extract mapper options", e);
      }

    }


    // 5. Build Prompt
    const refinerPrompt = this.promptService.buildRefinerPrompt({
      originalPrompt,
      synthesisText,
      mappingText,
      batchResponses,
      mapperOptionTitles
    });

    console.log(`[WorkflowEngine] Running Refiner Analysis (${refinerProvider})...`);

    // 6. Execute via Orchestrator (Single)
    const result = await this.orchestrator.executeSingle(
      refinerPrompt,
      refinerProvider,
      {
        sessionId: context.sessionId,
        timeout: 90000, // Slightly longer for analysis
        onPartial: (_pid, _chunk) => {
          // Optional: stream refiner delta if UI supports it
          // For now, we don't stream refiner analysis to main chat flow usually, but we could.
        }
      }
    );

    const rawRefinerText = this.responseProcessor.extractContent(result.text);
    const parsedRefiner = this.responseProcessor.parseRefinerResponse(rawRefinerText);

    if (!parsedRefiner) {
      throw new Error("Refiner analysis returned null (failed or empty)");
    }

    return {
      providerId: refinerProvider,
      output: parsedRefiner, // The parsed object for in-memory use
      text: String(rawRefinerText || ""), // Store the RAW MARKDOWN for persistence
      meta: {
        confidenceScore: parsedRefiner.confidenceScore,
        presentationStrategy: parsedRefiner.presentationStrategy,
      },
      status: "completed"
    };
  }

  /**
   * Execute Antagonist Step
   */
  async executeAntagonistStep(step, context, stepResults) {
    const {
      antagonistProvider,
      sourceStepIds,
      originalPrompt,
      synthesisStepIds,
      mappingStepIds,
      refinerStepIds,
      sourceHistorical // Present if recompute
    } = step.payload;

    let batchResponses = {};
    let synthesisText = "";
    let mappingText = "";
    let refinerOutput = null;

    // 1. Resolve Inputs (Dynamic: New or Historical)
    if (sourceHistorical) {
      // --- RECOMPUTE FLOW ---
      const { turnId } = sourceHistorical;
      console.log(`[WorkflowEngine] Antagonist recompute: resolving historical inputs from turn ${turnId}`);

      // Helper to fetch textual content from historical outputs
      const fetchHistoricalText = async (type) => {
        try {
          const historicalPayload = { sourceHistorical: { turnId, responseType: type } };
          const data = await this.resolveSourceData(historicalPayload, context, stepResults);
          return data[0]?.text || "";
        } catch (e) {
          console.warn(`[WorkflowEngine] Antagonist failed to fetch historical ${type}:`, e.message);
          return "";
        }
      };

      // A. Batch Responses
      try {
        const batchPayload = { sourceHistorical: { turnId, responseType: 'batch' } };
        const data = await this.resolveSourceData(batchPayload, context, stepResults);
        data.forEach(item => {
          if (item.text) batchResponses[item.providerId] = { text: item.text, providerId: item.providerId };
        });
      } catch (e) { console.warn("[WorkflowEngine] Antagonist: no batch history found", e); }

      // B. Synthesis Text
      synthesisText = await fetchHistoricalText('synthesis');

      // C. Mapping Text (striped of topology)
      const rawMapping = await fetchHistoricalText('mapping');
      if (rawMapping) {
        const { text } = this.responseProcessor.processMappingResponse(rawMapping);
        mappingText = text;
      }

      // D. Refiner Output
      const rawRefiner = await fetchHistoricalText('refiner');
      if (rawRefiner) {
        refinerOutput = this.responseProcessor.parseRefinerResponse(rawRefiner);
      }

    } else {
      // --- STANDARD FLOW ---
      // 1. Gather Batch Responses
      const batchStepResults = stepResults.get(sourceStepIds?.[0])?.result?.results || {};
      Object.entries(batchStepResults).forEach(([pid, res]) => {
        if (res && res.text) {
          batchResponses[pid] = { text: res.text, providerId: pid };
        }
      });

      // 2. Gather Synthesis Text
      if (synthesisStepIds && synthesisStepIds.length > 0) {
        for (const id of synthesisStepIds) {
          const res = stepResults.get(id);
          if (res?.status === "completed" && res.result?.text) {
            synthesisText = res.result.text;
            break;
          }
        }
      }

      // 3. Gather Mapping Narrative
      if (mappingStepIds && mappingStepIds.length > 0) {
        for (const id of mappingStepIds) {
          const res = stepResults.get(id);
          if (res?.status === "completed" && res.result?.text) {
            const raw = res.result.text;
            const { text } = this.responseProcessor.processMappingResponse(raw);
            mappingText = text;
            break;
          }
        }
      }

      // 4. Gather Refiner Output
      if (refinerStepIds && refinerStepIds.length > 0) {
        for (const id of refinerStepIds) {
          const res = stepResults.get(id);
          if (res?.status === "completed" && res.result?.output) {
            refinerOutput = res.result.output;
            break;
          } else if (res?.status === "completed" && res.result?.text) {
            refinerOutput = this.responseProcessor.parseRefinerResponse(res.result.text);
            break;
          }
        }
      }
    }

    // 5. Extract mapper option titles
    let mapperOptionTitles = [];
    if (!sourceHistorical && mappingStepIds && mappingStepIds.length > 0) {
      for (const id of mappingStepIds) {
        const res = stepResults.get(id);
        if (res?.status === "completed" && res.result?.meta?.allAvailableOptions) {
          mapperOptionTitles = this.responseProcessor.parseOptionTitles(res.result.meta.allAvailableOptions);
          break;
        }
      }
    } else if (sourceHistorical) {
      try {
        const mappingPayload = { sourceHistorical: { turnId: sourceHistorical.turnId, responseType: 'mapping' } };
        const data = await this.resolveSourceData(mappingPayload, context, stepResults);
        const rawMapping = data[0]?.text || "";
        if (rawMapping) {
          const { optionTitles } = this.responseProcessor.processMappingResponse(rawMapping);
          if (optionTitles) {
            mapperOptionTitles = optionTitles;
          }
        }
      } catch (e) {
        console.warn("[WorkflowEngine] Antagonist recompute: failed to extract mapper options", e);
      }
    }

    // 6. Build model outputs block
    const modelCount = Object.keys(batchResponses).length;
    const modelOutputsBlock = Object.entries(batchResponses)
      .map(([providerId, response], idx) => {
        return `<model_${idx + 1} provider="${providerId}">\n${response.text}\n</model_${idx + 1}>`;
      })
      .join('\n\n');

    // Build option titles block
    const optionTitlesBlock = mapperOptionTitles.length > 0
      ? mapperOptionTitles.map(t => `- ${t}`).join('\n')
      : '(No mapper options available)';

    // 7. Build Prompt
    const antagonistPrompt = this.promptService.buildAntagonistPrompt(
      originalPrompt,
      synthesisText,
      mappingText,
      optionTitlesBlock,
      modelOutputsBlock,
      refinerOutput,
      modelCount
    );

    console.log(`[WorkflowEngine] Running Antagonist Analysis (${antagonistProvider})...`);

    // 8. Execute via Orchestrator (Single)
    const result = await this.orchestrator.executeSingle(
      antagonistPrompt,
      antagonistProvider,
      {
        sessionId: context.sessionId,
        timeout: 90000,
        onPartial: (_pid, _chunk) => {
          // Optional: stream antagonist delta if UI supports it
        }
      }
    );

    const rawAntagonistText = this.responseProcessor.extractContent(result.text);

    return {
      providerId: antagonistProvider,
      text: String(rawAntagonistText || ""), // Store raw for persistence
      meta: {},
      status: "completed"
    };
  }

  // ==========================================================================
  // EXPLORE STEP EXECUTOR
  // ==========================================================================

  async executeExploreStep(step, context, stepResults) {
    const {
      exploreProvider,
      sourceStepIds, // usually points to a mapping step
      mappingStepIds,
      originalPrompt,
      sourceHistorical
    } = step.payload;

    let mapperArtifact = null;

    // 1. Resolve Mapper Artifact (Dynamic: New or Historical)
    if (sourceHistorical) {
      const mappingPayload = { sourceHistorical: { turnId: sourceHistorical.turnId, responseType: 'mapping' } };
      const data = await this.resolveSourceData(mappingPayload, context, stepResults);
      const rawMapping = data[0]?.text || "";
      if (rawMapping) {
        mapperArtifact = parseMapperArtifact(rawMapping);
      }
    } else {
      // Standard flow: get from stepResults
      const mapStepId = mappingStepIds?.[0] || sourceStepIds?.[0];
      if (mapStepId) {
        const res = stepResults.get(mapStepId);
        if (res?.status === "completed" && res.result?.text) {
          mapperArtifact = parseMapperArtifact(res.result.text);
        }
      }
    }

    if (!mapperArtifact) {
      console.warn("[WorkflowEngine] Explore step missing mapper artifact, using empty default.");
      mapperArtifact = { consensus: { claims: [] }, outliers: [], topology: "high_confidence", query: originalPrompt };
    }

    // 2. Build Prompt
    const explorePrompt = this.promptService.buildExplorePrompt(originalPrompt, mapperArtifact);

    console.log(`[WorkflowEngine] Running Explore Analysis (${exploreProvider})...`);

    // 3. Execute via Orchestrator
    const result = await this.orchestrator.executeSingle(
      explorePrompt,
      exploreProvider,
      {
        sessionId: context.sessionId,
        timeout: 60000,
        onPartial: (_pid, _chunk) => {
          // Optional: stream partial
        }
      }
    );

    // 4. Parse Output
    const rawText = result.text || "";
    const parsedOutput = parseExploreOutput(rawText);

    return {
      providerId: exploreProvider,
      output: parsedOutput,
      text: rawText, // Store raw
      type: "explore",
      meta: {
        container: parsedOutput.container,
        artifactId: parsedOutput.artifact_id
      },
      status: "completed"
    };
  }

  // ==========================================================================
  // STEP EXECUTORS - FIXED
  // ==========================================================================

  /**
   * Fire-and-forget persistence helper: batch update provider contexts and save session
   * without blocking the workflow's resolution path.
   */
  _persistProviderContextsAsync(sessionId, updates) {
    try {
      // Defer to next tick to ensure prompt/mapping resolution proceeds immediately
      setTimeout(() => {
        try {
          this.sessionManager.updateProviderContextsBatch(
            sessionId,
            updates,
            true,
            { skipSave: true },
          );
          this.sessionManager.saveSession(sessionId);
        } catch (e) {
          console.warn("[WorkflowEngine] Deferred persistence failed:", e);
        }
      }, 0);
    } catch (_) { }
  }

  /**
   * Execute prompt step - FIXED to return proper format
   */
  /**
   * Execute prompt step - FIXED to include synchronous in-memory update
   */
  async executePromptStep(step, context) {
    const artifactProcessor = new ArtifactProcessor();
    const {
      prompt,
      providers,
      useThinking,
      providerContexts,
      previousContext, // ← NEW
    } = step.payload;

    // Inject Council Framing if context exists
    let enhancedPrompt = prompt;
    if (previousContext) {
      enhancedPrompt = `You are part of the council.Context(backdrop only—do not summarize or re - answer):

${previousContext}

Answer the user's message directly. Use context only to disambiguate.

  < user_prompt >
  ${prompt}
</user_prompt > `;
    }

    // Provider health pre-check + initial progress emit
    const providerStatuses = [];
    const activeProviders = [];
    try {
      for (const pid of providers) {
        const check = this.healthTracker.shouldAttempt(pid);
        if (!check.allowed) {
          providerStatuses.push({
            providerId: pid,
            status: 'skipped',
            skippedReason: check.reason || 'circuit_open',
            error: {
              type: 'circuit_open',
              message: 'Provider temporarily unavailable due to recent failures',
              retryable: true,
              retryAfterMs: check.retryAfterMs,
            },
          });
        } else {
          providerStatuses.push({ providerId: pid, status: 'queued', progress: 0 });
          activeProviders.push(pid);
        }
      }
      // Emit initial status
      this.port.postMessage({
        type: 'WORKFLOW_PROGRESS',
        sessionId: context.sessionId,
        aiTurnId: context.canonicalAiTurnId || 'unknown',
        phase: 'batch',
        providerStatuses,
        completedCount: 0,
        totalCount: providers.length,
      });
    } catch (_) { }

    // Input length validation per provider
    const promptLength = enhancedPrompt.length;
    const allowedProviders = [];
    const skippedProviders = [];
    try {
      for (const pid of activeProviders) {
        const limits = PROVIDER_LIMITS[pid];
        if (limits && promptLength > limits.maxInputChars) {
          skippedProviders.push(pid);
        } else {
          allowedProviders.push(pid);
        }
      }
      if (skippedProviders.length > 0) {
        skippedProviders.forEach((pid) => {
          try {
            const entry = providerStatuses.find((s) => s.providerId === pid);
            if (entry) {
              entry.status = 'skipped';
              entry.skippedReason = 'input_too_long';
              entry.error = { type: 'input_too_long', message: `Prompt length ${promptLength} exceeds limit for ${pid}`, retryable: true };
            } else {
              providerStatuses.push({ providerId: pid, status: 'skipped', skippedReason: 'input_too_long', error: { type: 'input_too_long', message: `Prompt length ${promptLength} exceeds limit for ${pid}`, retryable: true } });
            }
          } catch (_) { }
        });
        try {
          this.port.postMessage({
            type: 'WORKFLOW_PROGRESS',
            sessionId: context.sessionId,
            aiTurnId: context.canonicalAiTurnId || 'unknown',
            phase: 'batch',
            providerStatuses,
            completedCount: providerStatuses.filter((p) => p.status === 'completed').length,
            totalCount: providerStatuses.length,
          });
        } catch (_) { }
      }
      if (allowedProviders.length === 0) {
        throw new Error(`INPUT_TOO_LONG: Prompt length ${promptLength} exceeds limits for all selected providers`);
      }
    } catch (e) {
      return Promise.reject(e);
    }

    return new Promise((resolve, reject) => {
      this.orchestrator.executeParallelFanout(enhancedPrompt, allowedProviders, {
        sessionId: context.sessionId,
        useThinking,
        providerContexts,
        providerMeta: step?.payload?.providerMeta,
        onPartial: (providerId, chunk) => {
          this._dispatchPartialDelta(
            context.sessionId,
            step.stepId,
            providerId,
            chunk.text,
            "Prompt",
          );
          try {
            const entry = providerStatuses.find((s) => s.providerId === providerId);
            if (entry) {
              entry.status = 'streaming';
              // ✅ FIX: Use undefined for indeterminate progress instead of 0, so UI shows "Generating..."
              entry.progress = undefined;
              this.port.postMessage({
                type: 'WORKFLOW_PROGRESS',
                sessionId: context.sessionId,
                aiTurnId: context.canonicalAiTurnId || 'unknown',
                phase: 'batch',
                providerStatuses,
                completedCount: providerStatuses.filter((p) => p.status === 'completed').length,
                totalCount: providers.length,
              });
            }
          } catch (_) { }
        },
        // ✅ NEW: Handle granular completion
        onProviderComplete: (providerId, _resultWrapper) => {
          try {
            this.healthTracker.recordSuccess(providerId);
            const entry = providerStatuses.find((s) => s.providerId === providerId);
            if (entry) {
              entry.status = 'completed';
              entry.progress = 100;
              if (entry.error) delete entry.error;

              // Emit immediate progress update
              this.port.postMessage({
                type: 'WORKFLOW_PROGRESS',
                sessionId: context.sessionId,
                aiTurnId: context.canonicalAiTurnId || 'unknown',
                phase: 'batch',
                providerStatuses,
                completedCount: providerStatuses.filter((p) => p.status === 'completed').length,
                totalCount: providers.length,
              });
            }
          } catch (_) { }
        },
        onError: (error) => {
          try {
            this.port.postMessage({
              type: "WORKFLOW_STEP_UPDATE",
              sessionId: context.sessionId,
              stepId: step.stepId,
              status: "partial_failure",
              error: error?.message || String(error),
            });
          } catch (_) { }
          // Don't reject yet, let Promise.all handle it
        },
        onAllComplete: (results, errors) => {
          // Build batch updates
          const batchUpdates = {};
          results.forEach((res, pid) => {
            batchUpdates[pid] = res;
          });

          // Emit a single aggregated log summarizing cached contexts produced by providers in this batch
          try {
            const contextsSummary = [];
            results.forEach((res, pid) => {
              const keys = res?.meta ? Object.keys(res.meta) : [];
              if (keys.length > 0)
                contextsSummary.push(`${pid}: ${keys.join(",")} `);
            });
            if (contextsSummary.length > 0) {
              wdbg(
                `[WorkflowEngine] Cached context for ${contextsSummary.join(
                  "; ",
                )
                }`,
              );
            }
          } catch (_) { }

          // ✅ CRITICAL: Update in-memory cache SYNCHRONOUSLY
          this.sessionManager.updateProviderContextsBatch(
            context.sessionId,
            batchUpdates,
            true, // continueThread
            { skipSave: true },
          );

          this._persistProviderContextsAsync(context.sessionId, batchUpdates);

          // Format results for workflow engine
          const formattedResults = {};
          const authErrors = [];

          results.forEach((result, providerId) => {
            const processed = artifactProcessor.process(result.text || '');
            formattedResults[providerId] = {
              providerId: providerId,
              text: processed.cleanText,
              status: "completed",
              meta: result.meta || {},
              artifacts: processed.artifacts,
              ...(result.softError ? { softError: result.softError } : {}),
            };
            try {
              this.healthTracker.recordSuccess(providerId);
              const entry = providerStatuses.find((s) => s.providerId === providerId);
              if (entry) {
                entry.status = 'completed';
                entry.progress = 100;
                if (entry.error) delete entry.error;
              }
            } catch (_) { }
          });

          errors.forEach((error, providerId) => {
            formattedResults[providerId] = {
              providerId: providerId,
              text: "",
              status: "failed",
              meta: { _rawError: error.message },
            };

            // Collect auth errors
            if (isProviderAuthError(error)) {
              authErrors.push(error);
            }
            try {
              this.healthTracker.recordFailure(providerId, error);
              const classified = classifyError(error);
              const entry = providerStatuses.find((s) => s.providerId === providerId);
              if (entry) {
                entry.status = 'failed';
                entry.error = classified;
              }
            } catch (_) { }
          });

          // Validate at least one provider succeeded
          const hasAnyValidResults = Object.values(formattedResults).some(
            (r) =>
              r.status === "completed" && r.text && r.text.trim().length > 0,
          );

          if (!hasAnyValidResults) {
            // If all failed and we have auth errors, throw MultiProviderAuthError
            if (authErrors.length > 0 && authErrors.length === errors.size) {
              const providerIds = Array.from(errors.keys());
              reject(createMultiProviderAuthError(providerIds, "Multiple authentication errors occurred."));
              return;
            }

            reject(
              new Error("All providers failed or returned empty responses"),
            );
            return;
          }

          // Emit final progress update for batch phase
          try {
            const completedCount = providerStatuses.filter((p) => p.status === 'completed').length;
            this.port.postMessage({
              type: 'WORKFLOW_PROGRESS',
              sessionId: context.sessionId,
              aiTurnId: context.canonicalAiTurnId || 'unknown',
              phase: 'batch',
              providerStatuses,
              completedCount,
              totalCount: providers.length,
            });

            const failedProviders = providerStatuses.filter((p) => p.status === 'failed');
            const successfulProviders = providerStatuses.filter((p) => p.status === 'completed');
            if (failedProviders.length > 0) {
              this.port.postMessage({
                type: 'WORKFLOW_PARTIAL_COMPLETE',
                sessionId: context.sessionId,
                aiTurnId: context.canonicalAiTurnId || 'unknown',
                successfulProviders: successfulProviders.map((p) => p.providerId),
                failedProviders: failedProviders.map((p) => ({ providerId: p.providerId, error: p.error })),
                synthesisCompleted: false,
                mappingCompleted: false,
              });
            }
          } catch (_) { }

          resolve({
            results: formattedResults,
            errors: Object.fromEntries(errors),
          });
        },
      });
    });
  }

  /**
   * Resolve source data - FIXED to handle new format
   */
  async resolveSourceData(payload, context, previousResults) {
    if (payload.sourceHistorical) {
      // Historical source
      const { turnId, responseType } = payload.sourceHistorical;
      console.log(
        `[WorkflowEngine] Resolving historical data from turn: ${turnId} `,
      );

      // Prefer adapter lookup: turnId may be a user or AI turn
      let aiTurn = null;
      try {
        const adapter = this.sessionManager?.adapter;
        if (adapter?.isReady && adapter.isReady()) {
          const turn = await adapter.get("turns", turnId);
          if (turn && (turn.type === "ai" || turn.role === "assistant")) {
            aiTurn = turn;
          } else if (turn && turn.type === "user") {
            // Need next turn (AI) from sequence
            // We can't easily jump to next turn without querying by sequence or getting all turns
            // Strategy: get all turns for session and find next
            try {
              const sessionTurns = await adapter.getTurnsBySessionId(context.sessionId);
              if (Array.isArray(sessionTurns)) {
                const userIdx = sessionTurns.findIndex(t => t.id === turnId);
                if (userIdx !== -1) {
                  const next = sessionTurns[userIdx + 1];
                  if (next && (next.type === "ai" || next.role === "assistant")) {
                    aiTurn = next;
                  }
                }
              }
            } catch (ignored) { }
          }
        }
      } catch (e) {
        console.warn("[WorkflowEngine] resolveSourceData adapter lookup failed:", e);
      }

      // Fallback: search across all sessions NOT SUPPORTED individually anymore without cache.
      // If we didn't find it via adapter, we likely won't find it.

      if (!aiTurn || aiTurn.type !== "ai") {
        // Try text matching fallback if ID lookup failed (via adapter)
        const fallbackText = context?.userMessage || this.currentUserMessage || "";
        if (fallbackText && fallbackText.trim().length > 0 && this.sessionManager?.adapter?.isReady && this.sessionManager.adapter.isReady()) {
          try {
            const sessionTurns = await this.sessionManager.adapter.getTurnsBySessionId(context.sessionId);
            if (Array.isArray(sessionTurns)) {
              for (let i = 0; i < sessionTurns.length; i++) {
                const t = sessionTurns[i];
                if (t && t.type === "user" && String(t.text || "") === String(fallbackText)) {
                  const next = sessionTurns[i + 1];
                  if (next && next.type === "ai") {
                    aiTurn = next;
                    break;
                  }
                }
              }
            }
          } catch (e) {
            throw new Error(`Could not find corresponding AI turn for ${turnId} (text fallback failed)`);
          }
        }

        if (!aiTurn) {
          console.warn(`[WorkflowEngine] Could not resolve AI turn for source ${turnId}`);
          // Return empty allows workflow to continue gracefully (maybe with partial data) rather than crash
          return [];
        }
      }

      let sourceContainer;
      switch (responseType) {
        case "synthesis":
          sourceContainer = aiTurn.synthesisResponses || {};
          break;
        case "mapping":
          sourceContainer = aiTurn.mappingResponses || {};
          break;
        case "refiner":
          sourceContainer = aiTurn.refinerResponses || {};
          break;
        case "antagonist":
          sourceContainer = aiTurn.antagonistResponses || {};
          break;
        default:
          sourceContainer = aiTurn.batchResponses || {};
          break;
      }

      // Convert to array format, keeping only the LATEST version per provider
      const latestMap = new Map();
      Object.keys(sourceContainer).forEach(pid => {
        const versions = (sourceContainer[pid] || [])
          .filter(r => r.status === "completed" && r.text?.trim())
          .sort((a, b) => (b.responseIndex || 0) - (a.responseIndex || 0)); // Descending index

        if (versions.length > 0) {
          latestMap.set(pid, {
            providerId: pid,
            text: versions[0].text
          });
        }
      });

      let sourceArray = Array.from(latestMap.values());

      // If embedded responses were not present, attempt provider_responses fallback (prefer indexed lookup)
      if (
        sourceArray.length === 0 &&
        this.sessionManager?.adapter?.isReady &&
        this.sessionManager.adapter.isReady()
      ) {
        try {
          // Use unified method
          const responses = await this.sessionManager.adapter.getResponsesByTurnId(
            aiTurn.id,
          );

          const respType = responseType || "batch";
          const dbLatestMap = new Map();

          (responses || [])
            .filter(r => r?.responseType === respType && r.text?.trim())
            .forEach(r => {
              const existing = dbLatestMap.get(r.providerId);
              // Keep the one with the higher index
              if (!existing || (r.responseIndex || 0) >= (existing.responseIndex || 0)) {
                dbLatestMap.set(r.providerId, r);
              }
            });

          sourceArray = Array.from(dbLatestMap.values()).map(r => ({
            providerId: r.providerId,
            text: r.text
          }));
          if (sourceArray.length > 0) {
            console.log(
              "[WorkflowEngine] provider_responses fallback succeeded for historical sources",
            );
          }
        } catch (e) {
          console.warn(
            "[WorkflowEngine] provider_responses fallback failed for historical sources:",
            e,
          );
        }
      }

      console.log(
        `[WorkflowEngine] Found ${sourceArray.length} historical sources`,
      );
      return sourceArray;
    } else if (payload.sourceStepIds) {
      // Current workflow source
      const sourceArray = [];

      for (const stepId of payload.sourceStepIds) {
        const stepResult = previousResults.get(stepId);

        if (!stepResult || stepResult.status !== "completed") {
          console.warn(
            `[WorkflowEngine] Step ${stepId} not found or incomplete`,
          );
          continue;
        }

        const { results } = stepResult.result;

        // Results is now an object: { claude: {...}, gemini: {...} }
        Object.entries(results).forEach(([providerId, result]) => {
          if (
            result.status === "completed" &&
            result.text &&
            result.text.trim().length > 0
          ) {
            sourceArray.push({
              providerId: providerId,
              text: result.text,
            });
          }
        });
      }

      console.log(
        `[WorkflowEngine] Found ${sourceArray.length} current workflow sources`,
      );
      return sourceArray;
    }

    throw new Error("No valid source specified for step.");
  }

  /**
   * Execute synthesis step - FIXED error messages
   */
  async executeSynthesisStep(
    step,
    context,
    previousResults,
    workflowContexts = {},
    resolvedContext,
  ) {
    const artifactProcessor = new ArtifactProcessor();
    const payload = step.payload;
    const sourceData = await this.resolveSourceData(
      payload,
      context,
      previousResults,
    );

    if (sourceData.length < 2) {
      throw new Error(
        `Synthesis requires at least 2 valid sources, but found ${sourceData.length}.`,
      );
    }

    wdbg(
      `[WorkflowEngine] Running synthesis with ${sourceData.length
      } sources: ${sourceData.map((s) => s.providerId).join(", ")} `,
    );

    // Look for mapping results from the current workflow
    let mappingResult = null;

    if (payload.mappingStepIds && payload.mappingStepIds.length > 0) {
      for (const mappingStepId of payload.mappingStepIds) {
        const mappingStepResult = previousResults.get(mappingStepId);
        wdbg(
          `[WorkflowEngine] Checking mapping step ${mappingStepId}: ${JSON.stringify(
            {
              status: mappingStepResult?.status,
              hasResult: !!mappingStepResult?.result,
            },
          )
          } `,
        );

        if (
          mappingStepResult?.status === "completed" &&
          mappingStepResult.result?.text
        ) {
          mappingResult = mappingStepResult.result;
          wdbg(
            `[WorkflowEngine] Found mapping result from step ${mappingStepId} for synthesis: providerId = ${mappingResult.providerId}, textLength = ${mappingResult.text?.length} `,
          );
          break;
        } else {
          wdbg(
            `[WorkflowEngine] Mapping step ${mappingStepId} not suitable: status = ${mappingStepResult?.status
            }, hasResult = ${!!mappingStepResult?.result}, hasText = ${!!mappingStepResult
              ?.result?.text
            } `,
          );
        }
      }
      // Prefer mapping result when declared, but continue gracefully if absent
      if (!mappingResult || !String(mappingResult.text || "").trim()) {
        console.warn(
          `[WorkflowEngine] No valid mapping result found; proceeding without Map input`,
          mappingResult,
        );



      }
    } else {
      if (
        !mappingResult &&
        resolvedContext?.type === "recompute" &&
        resolvedContext?.latestMappingOutput
      ) {
        mappingResult = resolvedContext.latestMappingOutput;
        wdbg(
          `[WorkflowEngine] Using pre - fetched historical mapping from ${mappingResult.providerId} `,
        );
      }
      if (!mappingResult) {
        try {
          previousResults.forEach((val) => {
            if (!mappingResult && val && val.result && val.result.meta && val.result.meta.allAvailableOptions) {
              mappingResult = val.result;
            }
          });
          if (mappingResult) {
            wdbg(`[WorkflowEngine] Found mapping result in previousResults(meta.allAvailableOptions present)`);
          }
        } catch (_) { }
      }
    }

    // Helper to execute synthesis with a specific provider
    const runSynthesis = async (providerId) => {
      const extractedOptions =
        mappingResult?.meta?.allAvailableOptions ||
        (payload?.mapperArtifact ? formatArtifactAsOptions(payload.mapperArtifact) : null) ||
        null;
      // 🔍 DIAGNOSTIC LOGGING
      console.log('[DEBUG] Synthesis options check:', {
        hasMappingResult: !!mappingResult,
        hasMetaOptions: !!mappingResult?.meta?.allAvailableOptions,
        optionsLength: extractedOptions?.length || 0,
        optionsPreview: extractedOptions?.substring(0, 200),
        isRecompute: resolvedContext?.type === 'recompute',
        sourceTurnId: resolvedContext?.sourceTurnId,
        metaKeys: Object.keys(mappingResult?.meta || {})
      });
      const synthPrompt = this.promptService.buildSynthesisPrompt(
        payload.originalPrompt,
        sourceData,
        providerId,
        extractedOptions
      );

      // ✅ RESTORED: Log prompt length for debugging
      const promptLength = synthPrompt.length;
      console.log(`[WorkflowEngine] Synthesis prompt length for ${providerId}: ${promptLength} chars`);

      // ✅ NEW: Input Length Validation
      const limits = PROVIDER_LIMITS[providerId];
      if (limits && promptLength > limits.maxInputChars) {
        console.warn(`[WorkflowEngine] Prompt length ${promptLength} exceeds limit ${limits.maxInputChars} for ${providerId}`);
        throw new Error(`INPUT_TOO_LONG: Prompt length ${promptLength} exceeds limit ${limits.maxInputChars} for ${providerId}`);
      }

      // Resolve provider context using three-tier resolution
      const providerContexts = this._resolveProviderContext(
        providerId,
        context,
        payload,
        workflowContexts,
        previousResults,
        resolvedContext,
        "Synthesis",
      );

      return new Promise((resolve, reject) => {
        this.orchestrator.executeParallelFanout(
          synthPrompt,
          [providerId],
          {
            sessionId: context.sessionId,
            useThinking: payload.useThinking,
            providerContexts: Object.keys(providerContexts).length
              ? providerContexts
              : undefined,
            providerMeta: step?.payload?.providerMeta,
            onPartial: (pid, chunk) => {
              this._dispatchPartialDelta(
                context.sessionId,
                step.stepId,
                pid,
                chunk.text,
                "Synthesis",
              );
            },
            onError: (error) => {
              reject(error);
            },
            onAllComplete: (results, errors) => {
              let finalResult = results.get(providerId);
              const providerError = errors?.get?.(providerId);

              if ((!finalResult || !finalResult.text) && providerError) {
                const recovered = lastStreamState.get(
                  `${context.sessionId}:${step.stepId}:${providerId}`,
                );
                if (recovered && recovered.trim().length > 0) {
                  finalResult = finalResult || { providerId, meta: {} };
                  finalResult.text = recovered;
                  finalResult.softError = finalResult.softError || {
                    message: providerError?.message || String(providerError),
                  };
                }
              }

              // ✅ Extract artifacts from synthesis response
              if (finalResult?.text) {
                const { cleanText, artifacts } = artifactProcessor.process(finalResult.text);
                finalResult.text = cleanText;
                finalResult.artifacts = artifacts;
              }

              // ✅ Ensure final emission for synthesis
              if (finalResult?.text) {
                this._dispatchPartialDelta(
                  context.sessionId,
                  step.stepId,
                  providerId,
                  finalResult.text,
                  "Synthesis",
                  true,
                );
              }

              if (!finalResult || !finalResult.text) {
                if (providerError) {
                  reject(providerError);
                } else {
                  reject(
                    new Error(
                      `Synthesis provider ${providerId} returned empty response`,
                    ),
                  );
                }
                return;
              }

              // Defer persistence to avoid blocking synthesis resolution
              this._persistProviderContextsAsync(context.sessionId, {
                [providerId]: finalResult,
              });
              // Update workflow-cached context for subsequent steps in the same workflow
              try {
                if (finalResult?.meta) {
                  workflowContexts[providerId] = finalResult.meta;
                  wdbg(
                    `[WorkflowEngine] Updated workflow context for ${providerId
                    }: ${Object.keys(finalResult.meta).join(",")} `,
                  );
                }
              } catch (_) { }

              resolve({
                providerId: providerId,
                text: finalResult.text, // ✅ Return text explicitly
                status: "completed",
                meta: finalResult.meta || {},
                artifacts: finalResult.artifacts || [],
                ...(finalResult.softError ? { softError: finalResult.softError } : {}),
              });
            },
          },
        );
      });
    };

    try {
      return await runSynthesis(payload.synthesisProvider);
    } catch (error) {
      // Check if we can recover from auth error
      if (isProviderAuthError(error)) {
        console.warn(`[WorkflowEngine] Synthesis failed with auth error for ${payload.synthesisProvider}, attempting fallback...`);

        const fallbackStrategy = errorHandler.fallbackStrategies.get('PROVIDER_AUTH_FAILED');
        if (fallbackStrategy) {
          try {
            const fallbackProvider = await fallbackStrategy(
              'synthesis',
              { failedProviderId: payload.synthesisProvider }
            );

            if (fallbackProvider) {
              console.log(`[WorkflowEngine] executing synthesis with fallback provider: ${fallbackProvider} `);
              // Retry with fallback provider
              return await runSynthesis(fallbackProvider);
            }
          } catch (fallbackError) {
            console.warn(`[WorkflowEngine] Fallback failed: `, fallbackError);
          }
        }
      }

      throw error;
    }
  }

  /**
   * Execute mapping step - FIXED
   */
  async executeMappingStep(
    step,
    context,
    previousResults,
    workflowContexts = {},
    resolvedContext,
  ) {
    const artifactProcessor = new ArtifactProcessor();
    const payload = step.payload;
    const sourceData = await this.resolveSourceData(
      payload,
      context,
      previousResults,
    );

    if (sourceData.length < 2) {
      throw new Error(
        `Mapping requires at least 2 valid sources, but found ${sourceData.length}.`,
      );
    }

    wdbg(
      `[WorkflowEngine] Running mapping with ${sourceData.length
      } sources: ${sourceData.map((s) => s.providerId).join(", ")} `,
    );

    // Compute citation order mapping number→providerId
    const providerOrder = Array.isArray(payload.providerOrder)
      ? payload.providerOrder
      : sourceData.map((s) => s.providerId);
    const citationOrder = providerOrder.filter((pid) =>
      sourceData.some((s) => s.providerId === pid),
    );

    const mappingPrompt = this.promptService.buildMappingPrompt(
      payload.originalPrompt,
      sourceData,
      citationOrder,
    );

    // Resolve provider context using three-tier resolution
    const providerContexts = this._resolveProviderContext(
      payload.mappingProvider,
      context,
      payload,
      workflowContexts,
      previousResults,
      resolvedContext,
      "Mapping",
    );

    // ✅ RESTORED: Log prompt length for debugging
    const promptLength = mappingPrompt.length;
    console.log(`[WorkflowEngine] Mapping prompt length for ${payload.mappingProvider}: ${promptLength} chars`);

    // ✅ NEW: Input Length Validation
    const limits = PROVIDER_LIMITS[payload.mappingProvider];
    if (limits && promptLength > limits.maxInputChars) {
      console.warn(`[WorkflowEngine] Mapping prompt length ${promptLength} exceeds limit ${limits.maxInputChars} for ${payload.mappingProvider}`);
      throw new Error(`INPUT_TOO_LONG: Prompt length ${promptLength} exceeds limit ${limits.maxInputChars} for ${payload.mappingProvider}`);
    }

    return new Promise((resolve, reject) => {
      this.orchestrator.executeParallelFanout(
        mappingPrompt,
        [payload.mappingProvider],
        {
          sessionId: context.sessionId,
          useThinking: payload.useThinking,
          providerContexts: Object.keys(providerContexts).length
            ? providerContexts
            : undefined,
          providerMeta: step?.payload?.providerMeta,
          onPartial: (providerId, chunk) => {
            this._dispatchPartialDelta(
              context.sessionId,
              step.stepId,
              providerId,
              chunk.text,
              "Mapping",
            );
          },
          onAllComplete: (results, errors) => {
            let finalResult = results.get(payload.mappingProvider);
            const providerError = errors?.get?.(payload.mappingProvider);

            if ((!finalResult || !finalResult.text) && providerError) {
              const recovered = lastStreamState.get(
                `${context.sessionId}:${step.stepId}:${payload.mappingProvider}`,
              );
              if (recovered && recovered.trim().length > 0) {
                finalResult = finalResult || { providerId: payload.mappingProvider, meta: {} };
                finalResult.text = recovered;
                finalResult.softError = finalResult.softError || {
                  message: providerError?.message || String(providerError),
                };
              }
            }

            let graphTopology = null;
            let allOptions = null;
            let mapperArtifact = null;

            if (finalResult?.text) {
              console.log('[WorkflowEngine] Mapping response length:', finalResult.text.length);

              // Use the new unified parser
              const unifiedResult = parseUnifiedMapperOutput(finalResult.text);

              graphTopology = unifiedResult.topology;
              allOptions = unifiedResult.options;
              mapperArtifact = unifiedResult.artifact;

              // Proceed with artifact processing on the narrative part
              const processed = artifactProcessor.process(unifiedResult.narrative || finalResult.text);
              finalResult.text = processed.cleanText;
              finalResult.artifacts = processed.artifacts;

              console.log('[WorkflowEngine] Graph topology extracted:', {
                found: !!graphTopology,
                hasNodes: graphTopology?.nodes?.length || 0,
              });
              console.log('[WorkflowEngine] Options extracted:', {
                found: !!allOptions,
                length: allOptions?.length || 0,
              });
              console.log('[WorkflowEngine] Mapper artifact extracted:', {
                found: !!mapperArtifact,
                claimCount: mapperArtifact?.consensus?.claims?.length || 0,
              });
            }

            // ✅ Ensure final emission for mapping
            if (finalResult?.text) {
              this._dispatchPartialDelta(
                context.sessionId,
                step.stepId,
                payload.mappingProvider,
                finalResult.text,
                "Mapping",
                true,
              );
            }

            if (!finalResult || !finalResult.text) {
              if (providerError) {
                reject(providerError);
              } else {
                reject(
                  new Error(
                    `Mapping provider ${payload.mappingProvider} returned empty response`,
                  ),
                );
              }
              return;
            }

            // Attach citationSourceOrder meta mapping number→providerId
            const citationSourceOrder = {};
            citationOrder.forEach((pid, idx) => {
              citationSourceOrder[idx + 1] = pid;
            });
            const finalResultWithMeta = {
              ...finalResult,
              meta: {
                ...(finalResult?.meta || {}),
                citationSourceOrder,
                ...(allOptions ? { allAvailableOptions: allOptions } : {}),
                ...(graphTopology ? { graphTopology } : {}),
              },
            };

            // Defer persistence to avoid blocking mapping resolution
            this._persistProviderContextsAsync(context.sessionId, {
              [payload.mappingProvider]: finalResultWithMeta,
            });
            // Update workflow-cached context for subsequent steps in the same workflow
            try {
              if (finalResultWithMeta?.meta) {
                workflowContexts[payload.mappingProvider] =
                  finalResultWithMeta.meta;
                wdbg(
                  `[WorkflowEngine] Updated workflow context for ${payload.mappingProvider
                  }: ${Object.keys(finalResultWithMeta.meta).join(",")} `,
                );
              }
            } catch (_) { }

            resolve({
              providerId: payload.mappingProvider,
              text: finalResultWithMeta.text, // ✅ Return text explicitly
              status: "completed",
              meta: finalResultWithMeta.meta || {},
              artifacts: finalResult.artifacts || [],
              mapperArtifact: mapperArtifact, // ✅ Return mapperArtifact for cognitive halt
              ...(finalResult.softError ? { softError: finalResult.softError } : {}),
            });
          },
        },
      );
    });
  }



  async executeUnderstandStep(step, context, _previousResults) {
    const payload = step.payload;

    const mapperArtifact =
      payload.mapperArtifact ||
      (payload.mappingText
        ? parseV1MapperToArtifact(payload.mappingText, {
          graphTopology: payload?.mappingMeta?.graphTopology,
          query: payload.originalPrompt,
        })
        : null);

    const exploreAnalysis =
      payload.exploreAnalysis ||
      (mapperArtifact ? computeExplore(payload.originalPrompt, mapperArtifact) : null);

    if (!mapperArtifact || !exploreAnalysis) {
      throw new Error("Understand mode requires a MapperArtifact and ExploreAnalysis.");
    }

    let understandPrompt = this.promptService.buildUnderstandPrompt(
      payload.originalPrompt,
      mapperArtifact,
      exploreAnalysis,
      payload.userNotes
    );


    if (Array.isArray(payload.selectedArtifacts) && payload.selectedArtifacts.length > 0) {
      const selectionLines = payload.selectedArtifacts.map((a, index) => {
        const header = `Selection ${index + 1} [${a.kind || "artifact"}]`;
        const source = a.source ? `Source: ${a.source}` : "";
        const dim = a.dimension ? `Dimension: ${a.dimension}` : "";
        const metaLines = [];
        const meta = a.meta || {};
        if (meta.applies_when) metaLines.push(`Applies when: ${meta.applies_when}`);
        if (typeof meta.support_count === "number") metaLines.push(`Support count: ${meta.support_count}`);
        return `${header}\n${source}${source && dim ? " • " : ""}${dim}\nText: ${a.text}\n${metaLines.join("\n")}`.trim();
      });
      understandPrompt += `\n\n<USER_SELECTED_ARTIFACTS>\n${selectionLines.join("\n\n")}\n</USER_SELECTED_ARTIFACTS>`;
    }

    console.log(
      `[WorkflowEngine] Understand prompt for ${payload.understandProvider}: ${understandPrompt.length} chars`,
    );

    return new Promise((resolve, reject) => {
      this.orchestrator.executeParallelFanout(
        understandPrompt,
        [payload.understandProvider],
        {
          sessionId: context.sessionId,
          useThinking: payload.useThinking || false,
          onPartial: (providerId, chunk) => {
            this._dispatchPartialDelta(
              context.sessionId,
              step.stepId,
              providerId,
              chunk.text,
              "Understand"
            );
          },
          onAllComplete: (results, errors) => {
            const finalResult = results.get(payload.understandProvider);
            const providerError = errors?.get?.(payload.understandProvider);

            if ((!finalResult || !finalResult.text) && providerError) {
              reject(providerError);
              return;
            }

            if (finalResult?.text) {
              const understandOutput = parseUnderstandOutput(finalResult.text);

              this._dispatchPartialDelta(
                context.sessionId,
                step.stepId,
                payload.understandProvider,
                finalResult.text,
                "Understand",
                true
              );

              // Defer persistence
              this._persistProviderContextsAsync(context.sessionId, {
                [payload.understandProvider]: finalResult,
              });

              resolve({
                providerId: payload.understandProvider,
                text: finalResult.text,
                status: "completed",
                meta: {
                  ...finalResult.meta,
                  understandOutput
                },
              });
            } else {
              reject(new Error("Empty response from Understand provider"));
            }
          }
        }
      );
    });
  }

  async executeGauntletStep(step, context, _previousResults) {
    const payload = step.payload;

    const mapperArtifact =
      payload.mapperArtifact ||
      (payload.mappingText
        ? parseV1MapperToArtifact(payload.mappingText, {
          graphTopology: payload?.mappingMeta?.graphTopology,
          query: payload.originalPrompt,
        })
        : null);

    const exploreAnalysis =
      payload.exploreAnalysis ||
      (mapperArtifact ? computeExplore(payload.originalPrompt, mapperArtifact) : null);

    if (!mapperArtifact) {
      throw new Error("Gauntlet requires a MapperArtifact but none was provided.");
    }

    let gauntletPrompt = this.promptService.buildGauntletPrompt(
      payload.originalPrompt,
      mapperArtifact,
      exploreAnalysis,
      payload.userNotes
    );


    if (Array.isArray(payload.selectedArtifacts) && payload.selectedArtifacts.length > 0) {
      const selectionLines = payload.selectedArtifacts.map((a, index) => {
        const header = `Selection ${index + 1} [${a.kind || "artifact"}]`;
        const source = a.source ? `Source: ${a.source}` : "";
        const dim = a.dimension ? `Dimension: ${a.dimension}` : "";
        const metaLines = [];
        const meta = a.meta || {};
        if (meta.applies_when) metaLines.push(`Applies when: ${meta.applies_when}`);
        if (typeof meta.support_count === "number") metaLines.push(`Support count: ${meta.support_count}`);
        return `${header}\n${source}${source && dim ? " • " : ""}${dim}\nText: ${a.text}\n${metaLines.join("\n")}`.trim();
      });
      gauntletPrompt += `\n\n<USER_SELECTED_ARTIFACTS>\n${selectionLines.join("\n\n")}\n</USER_SELECTED_ARTIFACTS>`;
    }

    console.log(
      `[WorkflowEngine] Gauntlet prompt for ${payload.gauntletProvider}: ${gauntletPrompt.length} chars`,
    );

    return new Promise((resolve, reject) => {
      this.orchestrator.executeParallelFanout(
        gauntletPrompt,
        [payload.gauntletProvider],
        {
          sessionId: context.sessionId,
          // Gauntlet can optionally use thinking if specified in payload or context, assumed false default
          useThinking: false,
          onPartial: (providerId, chunk) => {
            this._dispatchPartialDelta(
              context.sessionId,
              step.stepId,
              providerId,
              chunk.text,
              "Gauntlet"
            );
          },
          onAllComplete: (results, errors) => {
            const finalResult = results.get(payload.gauntletProvider);
            const providerError = errors?.get?.(payload.gauntletProvider);

            if ((!finalResult || !finalResult.text) && providerError) {
              reject(providerError);
              return;
            }

            if (finalResult?.text) {
              const gauntletOutput = parseGauntletOutput(finalResult.text);

              // Dispatch final partial with full text (optionally could dispatch parsed structure if UI supports it via a specialized message, but here we stick to text stream)
              this._dispatchPartialDelta(
                context.sessionId,
                step.stepId,
                payload.gauntletProvider,
                finalResult.text,
                "Gauntlet",
                true
              );

              // Defer persistence
              this._persistProviderContextsAsync(context.sessionId, {
                [payload.gauntletProvider]: finalResult,
              });

              resolve({
                providerId: payload.gauntletProvider,
                text: finalResult.text,
                status: "completed",
                meta: {
                  ...finalResult.meta,
                  gauntletOutput // Attach parsed object to meta for UI/Persistence
                },
              });

            } else {
              reject(new Error("Empty response from Gauntlet provider"));
            }
          }
        }
      );
    });
  }

  async handleRetryRequest(message) {
    try {
      const { sessionId, aiTurnId, providerIds, retryScope } = message || {};
      console.log(`[WorkflowEngine] Retry requested for providers = ${(providerIds || []).join(', ')} scope = ${retryScope} `);

      try {
        (providerIds || []).forEach((pid) => this.healthTracker.resetCircuit(pid));
      } catch (_) { }

      try {
        this.port.postMessage({
          type: 'WORKFLOW_PROGRESS',
          sessionId: sessionId,
          aiTurnId: aiTurnId,
          phase: retryScope || 'batch',
          providerStatuses: (providerIds || []).map((id) => ({ providerId: id, status: 'queued', progress: 0 })),
          completedCount: 0,
          totalCount: (providerIds || []).length,
        });
      } catch (_) { }
    } catch (e) {
      console.warn('[WorkflowEngine] handleRetryRequest failed:', e);
    }
  }

  async handleContinueCognitiveRequest(payload) {
    const { sessionId, aiTurnId, mode, providerId, selectedArtifacts } = payload || {};
    console.log(`[WorkflowEngine] Continuing cognitive workflow for turn ${aiTurnId} with mode ${mode}`);

    try {
      const adapter = this.sessionManager?.adapter;
      if (!adapter) throw new Error("Persistence adapter not available");

      const aiTurn = await adapter.get("turns", aiTurnId);
      if (!aiTurn) throw new Error(`AI turn ${aiTurnId} not found in persistence.`);

      const effectiveSessionId = sessionId || aiTurn.sessionId;

      const userTurnId = aiTurn.userTurnId;
      const userTurn = userTurnId ? await adapter.get("turns", userTurnId) : null;

      const originalPrompt = extractUserMessage(userTurn);

      let mapperArtifact = payload.mapperArtifact || aiTurn.mapperArtifact || null;
      let exploreAnalysis = payload.exploreAnalysis || aiTurn.exploreAnalysis || null;

      if (mode !== "understand" && mode !== "gauntlet") {
        throw new Error(`Unknown cognitive mode: ${mode}`);
      }

      const priorResponses = await adapter.getResponsesByTurnId(aiTurnId);
      const mappingResponses = (priorResponses || [])
        .filter((r) => r && r.responseType === "mapping" && r.providerId)
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      const mappingProviders = mappingResponses.map((r) => r.providerId);
      const latestMappingText = mappingResponses?.[0]?.text || "";
      const latestMappingMeta = mappingResponses?.[0]?.meta || {};

      if (!mapperArtifact && mappingResponses?.[0]) {
        mapperArtifact = parseV1MapperToArtifact(latestMappingText, {
          graphTopology: latestMappingMeta?.graphTopology,
          query: originalPrompt,
        });
      }
      if (!exploreAnalysis && mapperArtifact) {
        exploreAnalysis = computeExplore(originalPrompt, mapperArtifact);
      }

      if (!mapperArtifact) {
        throw new Error(`MapperArtifact missing for turn ${aiTurnId}. Cannot continue cognitive mode.`);
      }

      const preferredProvider = providerId ||
        mappingProviders[0] ||
        aiTurn.meta?.mapper ||
        aiTurn.meta?.mappingProvider ||
        "gemini";

      const context = {
        sessionId: effectiveSessionId,
        canonicalAiTurnId: aiTurnId,
        canonicalUserTurnId: userTurnId,
        userMessage: originalPrompt,
      };

      const stepId = `${mode}-${preferredProvider}-${Date.now()}`;
      const step =
        mode === "understand"
          ? {
            stepId,
            type: "understand",
            payload: {
              understandProvider: preferredProvider,
              mapperArtifact,
              exploreAnalysis,
              originalPrompt,
              mappingText: latestMappingText,
              mappingMeta: latestMappingMeta,
              selectedArtifacts: Array.isArray(selectedArtifacts) ? selectedArtifacts : [],
              useThinking: false,
            },
          }
          : {
            stepId,
            type: "gauntlet",
            payload: {
              gauntletProvider: preferredProvider,
              mapperArtifact,
              exploreAnalysis,
              originalPrompt,
              mappingText: latestMappingText,
              mappingMeta: latestMappingMeta,
              selectedArtifacts: Array.isArray(selectedArtifacts) ? selectedArtifacts : [],
              useThinking: false,
            },
          };

      const result =
        mode === "understand"
          ? await this.executeUnderstandStep(step, context, new Map())
          : await this.executeGauntletStep(step, context, new Map());

      try {
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: effectiveSessionId,
          stepId,
          status: "completed",
          result,
        });
      } catch (_) { }

      await this.sessionManager.upsertProviderResponse(
        effectiveSessionId,
        aiTurnId,
        preferredProvider,
        mode,
        0,
        { text: result?.text || "", status: result?.status || "completed", meta: result?.meta || {} },
      );

      const responses = await adapter.getResponsesByTurnId(aiTurnId);
      const buckets = {
        batchResponses: {},
        synthesisResponses: {},
        mappingResponses: {},
        refinerResponses: {},
        antagonistResponses: {},
        understandResponses: {},
        gauntletResponses: {},
      };

      for (const r of responses || []) {
        if (!r) continue;
        const entry = {
          providerId: r.providerId,
          text: r.text || "",
          status: r.status || "completed",
          createdAt: r.createdAt || Date.now(),
          updatedAt: r.updatedAt || r.createdAt || Date.now(),
          meta: r.meta || {},
          responseIndex: r.responseIndex ?? 0,
        };

        const target =
          r.responseType === "batch"
            ? buckets.batchResponses
            : r.responseType === "synthesis"
              ? buckets.synthesisResponses
              : r.responseType === "mapping"
                ? buckets.mappingResponses
                : r.responseType === "refiner"
                  ? buckets.refinerResponses
                  : r.responseType === "antagonist"
                    ? buckets.antagonistResponses
                    : r.responseType === "understand"
                      ? buckets.understandResponses
                      : r.responseType === "gauntlet"
                        ? buckets.gauntletResponses
                        : null;

        if (!target || !entry.providerId) continue;
        (target[entry.providerId] ||= []).push(entry);
      }

      for (const group of Object.values(buckets)) {
        for (const pid of Object.keys(group)) {
          group[pid].sort((a, b) => (a.responseIndex ?? 0) - (b.responseIndex ?? 0));
        }
      }

      const hasAny =
        Object.keys(buckets.batchResponses).length > 0 ||
        Object.keys(buckets.synthesisResponses).length > 0 ||
        Object.keys(buckets.mappingResponses).length > 0 ||
        Object.keys(buckets.refinerResponses).length > 0 ||
        Object.keys(buckets.antagonistResponses).length > 0 ||
        Object.keys(buckets.understandResponses).length > 0 ||
        Object.keys(buckets.gauntletResponses).length > 0;
      if (!hasAny) return;

      this.port?.postMessage({
        type: "TURN_FINALIZED",
        sessionId: effectiveSessionId,
        userTurnId: userTurnId,
        aiTurnId: aiTurnId,
        turn: {
          user: userTurn
            ? {
              id: userTurn.id,
              type: "user",
              text: userTurn.text || userTurn.content || "",
              createdAt: userTurn.createdAt || Date.now(),
              sessionId: effectiveSessionId,
            }
            : {
              id: userTurnId || "unknown",
              type: "user",
              text: originalPrompt || "",
              createdAt: Date.now(),
              sessionId: effectiveSessionId,
            },
          ai: {
            id: aiTurnId,
            type: "ai",
            userTurnId: userTurnId || "unknown",
            sessionId: effectiveSessionId,
            threadId: aiTurn.threadId || "default-thread",
            createdAt: aiTurn.createdAt || Date.now(),
            batchResponses: buckets.batchResponses,
            synthesisResponses: buckets.synthesisResponses,
            mappingResponses: buckets.mappingResponses,
            refinerResponses: buckets.refinerResponses,
            antagonistResponses: buckets.antagonistResponses,
            understandResponses: buckets.understandResponses,
            gauntletResponses: buckets.gauntletResponses,
            meta: aiTurn.meta || {},
          },
        },
      });

    } catch (error) {
      console.error(`[WorkflowEngine] handleContinueCognitiveRequest failed:`, error);
      try {
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: sessionId || "unknown",
          stepId: `continue-${mode}-error`,
          status: "failed",
          error: error.message || String(error),
        });
      } catch (_) { }
    }
  }
}
