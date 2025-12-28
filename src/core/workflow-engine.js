import { PromptService } from './PromptService';
import { ResponseProcessor } from './ResponseProcessor';
import { getHealthTracker } from './provider-health-tracker.js';
import { StepExecutor } from './execution/StepExecutor';
import { StreamingManager } from './execution/StreamingManager';
import { ContextManager } from './execution/ContextManager';
import { PersistenceCoordinator } from './execution/PersistenceCoordinator';
import { TurnEmitter } from './execution/TurnEmitter';
import { CognitivePipelineHandler } from './execution/CognitivePipelineHandler';
import { formatArtifactAsOptions, parseV1MapperToArtifact } from '../../shared/parsing-utils';

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

export class WorkflowEngine {
  constructor(orchestrator, sessionManager, port, options = {}) {
    this.orchestrator = orchestrator;
    this.sessionManager = sessionManager;
    this.port = port;

    // Services
    this.promptService = options.promptService || new PromptService();
    this.responseProcessor = options.responseProcessor || new ResponseProcessor();
    this.healthTracker = getHealthTracker();

    // Components
    this.stepExecutor = new StepExecutor(
      orchestrator,
      this.promptService,
      this.responseProcessor,
      this.healthTracker
    );
    this.streamingManager = new StreamingManager(port);
    this.contextManager = new ContextManager(sessionManager);
    this.persistenceCoordinator = new PersistenceCoordinator(sessionManager);
    this.turnEmitter = new TurnEmitter(port);
    this.cognitiveHandler = new CognitivePipelineHandler(port, this.persistenceCoordinator, sessionManager);
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
      const mode = request.mode || "auto";
      const useCognitivePipeline = ["auto", "understand", "decide"].includes(mode);
      context.useCognitivePipeline = useCognitivePipeline;
      context.mode = mode;

      // Seed Contexts
      this._seedContexts(resolvedContext, stepResults, workflowContexts);

      // Hydrate V1 artifacts if needed
      this._hydrateV1Artifacts(context, resolvedContext);

      // --- BATCH PHASE ---
      await this._executeBatchPhase(steps, context, stepResults, resolvedContext);

      // Validate Batch
      const batchSteps = steps.filter(s => s.type === 'prompt');
      let batchSuccess = true;
      for (const step of batchSteps) {
          const res = stepResults.get(step.stepId);
          if (res?.status === 'completed') {
             const resultsObj = res.result?.results || {};
             const successfulCount = Object.values(resultsObj).filter(r => r.status === 'completed').length;
             if (resolvedContext?.type !== 'recompute' && successfulCount < 2) {
                 batchSuccess = false;
                 console.warn(`[WorkflowEngine] Pipeline halted: only ${successfulCount} models responded (need 2).`);
                 await this._persistAndFinalize(request, context, steps, stepResults, resolvedContext); // Save what we have
                 this.port.postMessage({
                    type: "WORKFLOW_COMPLETE",
                    sessionId: context.sessionId,
                    workflowId: request.workflowId,
                    finalResults: Object.fromEntries(stepResults),
                    haltReason: "insufficient_witnesses",
                  });
                  return;
             }
             // Cache contexts
             Object.entries(resultsObj).forEach(([pid, data]) => {
                if (data && data.meta && Object.keys(data.meta).length > 0) {
                  workflowContexts[pid] = data.meta;
                }
             });
          }
      }

      // --- MAPPING PHASE ---
      await this._executeMappingPhase(steps, context, stepResults, workflowContexts, resolvedContext);
      
      // Check for Mapping Failures
      const mappingSteps = steps.filter(s => s.type === 'mapping');
      for (const step of mappingSteps) {
           const res = stepResults.get(step.stepId);
           if (res?.status === 'failed') {
                console.error(`[WorkflowEngine] Mapping failed (HALTING)`);
                await this._persistAndFinalize(request, context, steps, stepResults, resolvedContext);
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

      // --- COGNITIVE HALT CHECK ---
      if (useCognitivePipeline) {
        const shouldHalt = await this.cognitiveHandler.handleCognitiveHalt(
          request,
          context,
          steps,
          stepResults,
          resolvedContext,
          this.currentUserMessage
        );
        if (shouldHalt) {
            this.turnEmitter.emitTurnFinalized(context, steps, stepResults, resolvedContext, this.currentUserMessage);
            return;
        }
      }

      // --- CONSENSUS GATE ---
      const consensusGate =
      resolvedContext?.type === "recompute"
        ? null
        : computeConsensusGateFromMapping({ stepResults, mappingSteps });
      if (consensusGate) {
        context.workflowControl = consensusGate;
      }

      // --- SYNTHESIS PHASE ---
      await this._executeSynthesisPhase(steps, context, stepResults, workflowContexts, resolvedContext);
      // Check Synthesis Failures
      const synthesisSteps = steps.filter(s => s.type === 'synthesis');
      for (const step of synthesisSteps) {
            const res = stepResults.get(step.stepId);
            if (res?.status === 'failed') {
                await this._persistAndFinalize(request, context, steps, stepResults, resolvedContext);
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


      // --- REFINER & ANTAGONIST (if not skipped) ---
      const consensusOnly = !!context?.workflowControl?.consensusOnly;
      if (!consensusOnly) {
          await this._executeRefinerPhase(steps, context, stepResults, resolvedContext);
          await this._executeAntagonistPhase(steps, context, stepResults, resolvedContext);
      }

      // --- UNDERSTAND & GAUNTLET (Non-Halted or Recompute) ---
      await this._executeUnderstandPhase(steps, context, stepResults, resolvedContext);
      await this._executeGauntletPhase(steps, context, stepResults, resolvedContext);

      // --- PERSIST & FINALIZE ---
      await this._persistAndFinalize(request, context, steps, stepResults, resolvedContext);

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
      this.streamingManager.clearCache(context?.sessionId);
    }
  }

  // --- PHASE EXECUTORS ---

  async _executeBatchPhase(steps, context, stepResults, resolvedContext) {
    const promptSteps = steps.filter(s => s.type === "prompt");
    for (const step of promptSteps) {
      try {
        const result = await this.stepExecutor.executePromptStep(step, context, {
          streamingManager: this.streamingManager,
          persistenceCoordinator: this.persistenceCoordinator,
          sessionManager: this.sessionManager,
        });
        stepResults.set(step.stepId, { status: "completed", result });
        this._emitStepUpdate(step, context, result, resolvedContext, "completed");
      } catch (error) {
        this._handleStepError(step, error, context, stepResults, resolvedContext);
      }
    }
  }

  async _executeMappingPhase(steps, context, stepResults, workflowContexts, resolvedContext) {
    const mappingSteps = steps.filter(s => s.type === "mapping");
    for (const step of mappingSteps) {
      try {
        const result = await this.stepExecutor.executeMappingStep(
          step,
          context,
          stepResults,
          workflowContexts,
          resolvedContext,
          {
            streamingManager: this.streamingManager,
            contextManager: this.contextManager,
            persistenceCoordinator: this.persistenceCoordinator,
            sessionManager: this.sessionManager
          }
        );
        stepResults.set(step.stepId, { status: "completed", result });
        this._emitStepUpdate(step, context, result, resolvedContext, "completed");
        
        // Upsert immediately for mapping
        try {
            if (resolvedContext?.type !== "recompute") {
                const aiTurnId = context?.canonicalAiTurnId;
                const providerId = step?.payload?.mappingProvider;
                if (aiTurnId && providerId) {
                  this.persistenceCoordinator.upsertProviderResponse(
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
                  ).catch(() => { });
                }
              }
        } catch (_) {}

      } catch (error) {
        this._handleStepError(step, error, context, stepResults, resolvedContext);
      }
    }
  }

  async _executeSynthesisPhase(steps, context, stepResults, workflowContexts, resolvedContext) {
    const synthesisSteps = steps.filter(s => s.type === "synthesis");
    for (const step of synthesisSteps) {
      try {
        const result = await this.stepExecutor.executeSynthesisStep(
          step,
          context,
          stepResults,
          workflowContexts,
          resolvedContext,
          {
            streamingManager: this.streamingManager,
            contextManager: this.contextManager,
            persistenceCoordinator: this.persistenceCoordinator,
            sessionManager: this.sessionManager
          }
        );
        stepResults.set(step.stepId, { status: "completed", result });
        this._emitStepUpdate(step, context, result, resolvedContext, "completed");

        // Upsert
        try {
            if (resolvedContext?.type !== "recompute") {
                const aiTurnId = context?.canonicalAiTurnId;
                const providerId = step?.payload?.synthesisProvider;
                if (aiTurnId && providerId) {
                  this.persistenceCoordinator.upsertProviderResponse(
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
                  ).catch(() => { });
                }
              }
        } catch (_) {}

      } catch (error) {
        this._handleStepError(step, error, context, stepResults, resolvedContext);
      }
    }
  }

  async _executeRefinerPhase(steps, context, stepResults, resolvedContext) {
      const refinerSteps = steps.filter(s => s.type === 'refiner');
      for (const step of refinerSteps) {
        try {
            const result = await this.stepExecutor.executeRefinerStep(step, context, stepResults, {
                 sessionManager: this.sessionManager,
                 responseProcessor: this.responseProcessor
            });
            stepResults.set(step.stepId, { status: "completed", result });
            this._emitStepUpdate(step, context, result, resolvedContext, "completed");

            // Upsert
            try {
                if (resolvedContext?.type !== "recompute") {
                    const aiTurnId = context?.canonicalAiTurnId;
                    const providerId = step?.payload?.refinerProvider;
                    if (aiTurnId && providerId) {
                    this.persistenceCoordinator.upsertProviderResponse(
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
                    ).catch(() => { });
                    }
                }
            } catch (_) {}

        } catch (error) {
            this._handleStepError(step, error, context, stepResults, resolvedContext);
        }
      }
  }

  async _executeAntagonistPhase(steps, context, stepResults, resolvedContext) {
    const antagonistSteps = steps.filter(s => s.type === 'antagonist');
    for (const step of antagonistSteps) {
      try {
          const result = await this.stepExecutor.executeAntagonistStep(step, context, stepResults, {
               sessionManager: this.sessionManager,
               responseProcessor: this.responseProcessor
          });
          stepResults.set(step.stepId, { status: "completed", result });
          this._emitStepUpdate(step, context, result, resolvedContext, "completed");
          // Upsert
          try {
            if (resolvedContext?.type !== "recompute") {
                const aiTurnId = context?.canonicalAiTurnId;
                const providerId = step?.payload?.antagonistProvider;
                if (aiTurnId && providerId) {
                this.persistenceCoordinator.upsertProviderResponse(
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
                ).catch(() => { });
                }
            }
        } catch (_) {}
      } catch (error) {
          this._handleStepError(step, error, context, stepResults, resolvedContext);
      }
    }
}

  async _executeUnderstandPhase(steps, context, stepResults, resolvedContext) {
      const understandSteps = steps.filter(s => s.type === 'understand');
      for (const step of understandSteps) {
        try {
            const result = await this.stepExecutor.executeUnderstandStep(step, context, stepResults, {
                 streamingManager: this.streamingManager,
                 persistenceCoordinator: this.persistenceCoordinator
            });
            stepResults.set(step.stepId, { status: "completed", result });
            this._emitStepUpdate(step, context, result, resolvedContext, "completed");

            // Upsert
            try {
                if (resolvedContext?.type !== "recompute") {
                    const aiTurnId = context?.canonicalAiTurnId;
                    const providerId = step?.payload?.understandProvider;
                    if (aiTurnId && providerId) {
                    this.persistenceCoordinator.upsertProviderResponse(
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
                    ).catch(() => { });
                    }
                }
            } catch (_) {}

        } catch (error) {
             this._handleStepError(step, error, context, stepResults, resolvedContext);
        }
      }
  }

  async _executeGauntletPhase(steps, context, stepResults, resolvedContext) {
    const gauntletSteps = steps.filter(s => s.type === 'gauntlet');
    for (const step of gauntletSteps) {
      try {
          const result = await this.stepExecutor.executeGauntletStep(step, context, stepResults, {
               streamingManager: this.streamingManager,
               persistenceCoordinator: this.persistenceCoordinator
          });
          stepResults.set(step.stepId, { status: "completed", result });
          this._emitStepUpdate(step, context, result, resolvedContext, "completed");

           // Upsert
           try {
            if (resolvedContext?.type !== "recompute") {
                const aiTurnId = context?.canonicalAiTurnId;
                const providerId = step?.payload?.gauntletProvider;
                if (aiTurnId && providerId) {
                this.persistenceCoordinator.upsertProviderResponse(
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
                ).catch(() => { });
                }
            }
        } catch (_) {}

      } catch (error) {
           this._handleStepError(step, error, context, stepResults, resolvedContext);
      }
    }
}

  // --- HELPERS ---

  _seedContexts(resolvedContext, stepResults, workflowContexts) {
    if (resolvedContext && resolvedContext.type === "recompute") {
        console.log("[WorkflowEngine] Seeding frozen batch outputs for recompute");
        try {
          stepResults.set("batch", {
            status: "completed",
            result: { results: resolvedContext.frozenBatchOutputs },
          });
        } catch (e) {
          console.warn("[WorkflowEngine] Failed to seed frozen batch outputs:", e);
        }

        try {
          Object.entries(resolvedContext.providerContextsAtSourceTurn || {}).forEach(([pid, ctx]) => {
            if (ctx && typeof ctx === "object") {
              workflowContexts[pid] = ctx;
            }
          });
        } catch (e) {
          console.warn("[WorkflowEngine] Failed to cache historical provider contexts:", e);
        }
      }

      if (resolvedContext && resolvedContext.type === "extend") {
        try {
          const ctxs = resolvedContext.providerContexts || {};
          const cachedProviders = [];
          Object.entries(ctxs).forEach(([pid, meta]) => {
            if (meta && typeof meta === "object" && Object.keys(meta).length > 0) {
              workflowContexts[pid] = meta;
              cachedProviders.push(pid);
            }
          });
          if (cachedProviders.length > 0) {
            console.log(`[WorkflowEngine] Pre-cached contexts from ResolvedContext.extend for providers: ${cachedProviders.join(", ")}`);
          }
        } catch (e) {
          console.warn("[WorkflowEngine] Failed to cache provider contexts from extend:", e);
        }
      }
  }

  _hydrateV1Artifacts(context, resolvedContext) {
    if (!context.mapperArtifact && ["understand", "decide"].includes(context.mode)) {
        try {
          const previousOutputs = resolvedContext?.providerContexts || {};
          const v1MappingText = Object.values(previousOutputs)
            .map(ctx => ctx?.text || "")
            .find(text => text.includes("<mapping_output>") || text.includes("<decision_map>")); 
  
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
    // Flatten MapperArtifact for V1 compatibility (if needed by prompts)
    if (context.mapperArtifact && !context.extractedOptions) {
        try {
          console.log("[WorkflowEngine] Flattening V2 MapperArtifact for V1 pipeline...");
          context.extractedOptions = formatArtifactAsOptions(context.mapperArtifact);
        } catch (err) {
          console.warn("[WorkflowEngine] Failed to flatten V2 artifact:", err);
        }
    }
  }

  _emitStepUpdate(step, context, result, resolvedContext, status) {
    this.port.postMessage({
        type: "WORKFLOW_STEP_UPDATE",
        sessionId: context.sessionId,
        stepId: step.stepId,
        status: status,
        result: status === 'completed' ? result : undefined,
        error: status === 'failed' ? result.error : undefined,
        isRecompute: resolvedContext?.type === "recompute",
        sourceTurnId: resolvedContext?.sourceTurnId,
      });
  }

  _handleStepError(step, error, context, stepResults, resolvedContext) {
    console.error(`[WorkflowEngine] Step ${step.stepId} failed:`, error);
    stepResults.set(step.stepId, { status: "failed", error: error.message });
    this._emitStepUpdate(step, context, { error: error.message }, resolvedContext, "failed");
  }

  async _persistAndFinalize(request, context, steps, stepResults, resolvedContext) {
      const result = {
        batchOutputs: {},
        synthesisOutputs: {},
        mappingOutputs: {},
        refinerOutputs: {},
        antagonistOutputs: {},
        gauntletOutputs: {},
      };
      // Re-construct result object for persistence
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

      const persistRequest = {
        type: resolvedContext?.type || "unknown",
        sessionId: context.sessionId,
        userMessage: this.currentUserMessage,
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

      const persistResult = await this.persistenceCoordinator.persistWorkflowResult(
          persistRequest,
          resolvedContext,
          result
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

      this.port.postMessage({
        type: "WORKFLOW_COMPLETE",
        sessionId: context.sessionId,
        workflowId: request.workflowId,
        finalResults: Object.fromEntries(stepResults),
        ...(context?.workflowControl?.consensusOnly ? { haltReason: "consensus_only" } : {}),
      });

      this.turnEmitter.emitTurnFinalized(context, steps, stepResults, resolvedContext, this.currentUserMessage);
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
    return this.cognitiveHandler.handleContinueRequest(
        payload, 
        this.stepExecutor, 
        this.streamingManager, 
        this.contextManager
    );
  }
}