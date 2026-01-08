
import { parseV1MapperToArtifact } from '../../../shared/parsing-utils';
import { extractUserMessage } from '../context-utils.js';
import { PROVIDER_PRIORITIES } from '../../../shared/provider-config.js';

export class CognitivePipelineHandler {
  constructor(port, persistenceCoordinator, sessionManager) {
    this.port = port;
    this.persistenceCoordinator = persistenceCoordinator;
    this.sessionManager = sessionManager;
  }

  async _resolveBatchProviders(request, sessionId) {
    if (Array.isArray(request?.providers) && request.providers.length > 0) {
      return request.providers.slice();
    }

    try {
      const ctxs = await this.sessionManager.getProviderContexts(sessionId);
      const keys = ctxs && typeof ctxs === "object" ? Object.keys(ctxs) : [];
      if (keys.length > 0) return keys;
    } catch (_) { }

    return PROVIDER_PRIORITIES.batch.slice(0, 3);
  }

  async _resolveProviderContextsForPrompt(sessionId, providers) {
    try {
      const ctxs = await this.sessionManager.getProviderContexts(sessionId);
      const out = {};
      (providers || []).forEach((pid) => {
        const meta = ctxs?.[pid]?.meta;
        if (meta) out[pid] = { meta, continueThread: true };
      });
      return Object.keys(out).length > 0 ? out : undefined;
    } catch (_) {
      return undefined;
    }
  }

  async _runBatchAndMap({
    batchPrompt,
    providers,
    mappingProvider,
    context,
    stepExecutor,
    streamingManager,
  }) {
    const providerContexts = await this._resolveProviderContextsForPrompt(
      context.sessionId,
      providers,
    );

    const batchStep = {
      stepId: `concierge-batch-${Date.now()}`,
      type: "prompt",
      payload: {
        prompt: batchPrompt,
        providers,
        providerContexts,
        useThinking: false,
      },
    };

    const batchResult = await stepExecutor.executePromptStep(batchStep, context, {
      streamingManager,
      persistenceCoordinator: this.persistenceCoordinator,
      sessionManager: this.sessionManager,
    });

    const mappingStep = {
      stepId: `concierge-mapping-${mappingProvider}-${Date.now()}`,
      type: "mapping",
      payload: {
        mappingProvider,
        sourceStepIds: [batchStep.stepId],
        providerOrder: providers.slice(),
        originalPrompt: batchPrompt,
        useThinking: false,
        attemptNumber: 1,
      },
    };

    const stepResults = new Map();
    stepResults.set(batchStep.stepId, { status: "completed", result: batchResult });

    const mappingResult = await stepExecutor.executeMappingStep(
      mappingStep,
      context,
      stepResults,
      {},
      null,
      {
        streamingManager,
        persistenceCoordinator: this.persistenceCoordinator,
        sessionManager: this.sessionManager,
      },
    );

    const mapperArtifact = mappingResult?.mapperArtifact || null;
    if (!mapperArtifact) {
      throw new Error("Concierge batch mapping did not return a MapperArtifact.");
    }

    let analysis = null;
    try {
      const { computeStructuralAnalysis } = await import('../PromptMethods');
      analysis = computeStructuralAnalysis(mapperArtifact);
    } catch (e) {
      throw new Error(`Concierge batch structural analysis failed: ${e?.message || String(e)}`);
    }

    return { batchStep, batchResult, mappingStep, mappingResult, mapperArtifact, analysis };
  }

  async _handleConciergeBatchSignal({
    batchSignal,
    request,
    context,
    stepExecutor,
    streamingManager,
    singularityProviderId,
    mapperArtifact,
    structuralAnalysis,
    userMessageForSingularity,
  }) {
    if (!batchSignal?.type || !batchSignal?.batchPrompt) return null;

    const providers = await this._resolveBatchProviders(request, context.sessionId);
    const mappingProvider = request?.mapper || singularityProviderId || providers?.[0] || "gemini";

    if (batchSignal.type === "WORKFLOW") {
      const workflow = await this._runBatchAndMap({
        batchPrompt: batchSignal.batchPrompt,
        providers,
        mappingProvider,
        context,
        stepExecutor,
        streamingManager,
      });

      const mod = await import('../../services/concierge/executor.prompt');
      const synthesisPrompt = mod.buildExecutorSynthesisPrompt(
        batchSignal.handover,
        workflow.analysis,
      );

      const synthesisStep = {
        stepId: `singularity-${singularityProviderId}-${Date.now()}`,
        type: "singularity",
        payload: {
          singularityProvider: singularityProviderId,
          mapperArtifact,
          originalPrompt: userMessageForSingularity,
          structuralAnalysis,
          conciergePrompt: synthesisPrompt,
          conciergePromptType: "executor_1",
          conciergePromptSeed: { executionHandover: batchSignal.handover },
          useThinking: false,
        },
      };

      const synthesized = await stepExecutor.executeSingularityStep(
        synthesisStep,
        context,
        new Map(),
        {
          streamingManager,
          persistenceCoordinator: this.persistenceCoordinator,
          sessionManager: this.sessionManager,
        },
      );

      // Persist prompt type and seed for recomputes
      if (synthesized?.output) {
        await this.sessionManager.upsertProviderResponse(
          context.sessionId,
          context.canonicalAiTurnId,
          singularityProviderId,
          'singularity',
          0,
          {
            ...synthesized.output,
            meta: {
              ...(synthesized.output.meta || {}),
              frozenSingularityPromptType: "executor_1",
              frozenSingularityPromptSeed: { executionHandover: batchSignal.handover },
            },
          }
        );
      }

      const stepHelpSignal = synthesized?.output?.parsed?.batchSignal || null;
      if (stepHelpSignal?.type === "STEP_HELP" && stepHelpSignal?.batchPrompt) {
        const stepHelp = await this._runBatchAndMap({
          batchPrompt: stepHelpSignal.batchPrompt,
          providers,
          mappingProvider,
          context,
          stepExecutor,
          streamingManager,
        });

        const presentationPrompt = mod.buildExecutorPresentationPrompt(stepHelp.analysis);

        const presentationStep = {
          stepId: `singularity-${singularityProviderId}-${Date.now()}`,
          type: "singularity",
          payload: {
            singularityProvider: singularityProviderId,
            mapperArtifact,
            originalPrompt: userMessageForSingularity,
            structuralAnalysis,
            conciergePrompt: presentationPrompt,
            conciergePromptType: "executor_2",
            conciergePromptSeed: { analysis: stepHelp.analysis },
            useThinking: false,
          },
        };

        const presented = await stepExecutor.executeSingularityStep(
          presentationStep,
          context,
          new Map(),
          {
            streamingManager,
            persistenceCoordinator: this.persistenceCoordinator,
            sessionManager: this.sessionManager,
          },
        );

        // Persist prompt type and seed for recomputes
        if (presented?.output) {
          await this.sessionManager.upsertProviderResponse(
            context.sessionId,
            context.canonicalAiTurnId,
            singularityProviderId,
            'singularity',
            0,
            {
              ...presented.output,
              meta: {
                ...(presented.output.meta || {}),
                frozenSingularityPromptType: "executor_2",
                frozenSingularityPromptSeed: { analysis: stepHelp.analysis },
              },
            }
          );
        }

        return { finalResult: presented, workflow, synthesized, stepHelp, phasePatch: { currentPhase: "executor", turnInPhase: 0, executionHandover: batchSignal.handover || null } };
      }

      return { finalResult: synthesized, workflow, synthesized, stepHelp: null, phasePatch: { currentPhase: "executor", turnInPhase: 0, executionHandover: batchSignal.handover || null } };
    }

    if (batchSignal.type === "STEP_HELP") {
      const stepHelp = await this._runBatchAndMap({
        batchPrompt: batchSignal.batchPrompt,
        providers,
        mappingProvider,
        context,
        stepExecutor,
        streamingManager,
      });

      const mod = await import('../../services/concierge/executor.prompt');
      const wrapper = mod.buildStepHelpResultWrapper(stepHelp.analysis, userMessageForSingularity);

      const responseStep = {
        stepId: `singularity-${singularityProviderId}-${Date.now()}`,
        type: "singularity",
        payload: {
          singularityProvider: singularityProviderId,
          mapperArtifact,
          originalPrompt: userMessageForSingularity,
          structuralAnalysis,
          conciergePrompt: wrapper,
          conciergePromptType: "step_help_response",
          conciergePromptSeed: { analysis: stepHelp.analysis, userMessage: userMessageForSingularity },
          useThinking: false,
        },
      };

      const answered = await stepExecutor.executeSingularityStep(
        responseStep,
        context,
        new Map(),
        {
          streamingManager,
          persistenceCoordinator: this.persistenceCoordinator,
          sessionManager: this.sessionManager,
        },
      );

      // Persist prompt type and seed for recomputes
      if (answered?.output) {
        await this.sessionManager.upsertProviderResponse(
          context.sessionId,
          context.canonicalAiTurnId,
          singularityProviderId,
          'singularity',
          0,
          {
            ...answered.output,
            meta: {
              ...(answered.output.meta || {}),
              frozenSingularityPromptType: "step_help_response",
              frozenSingularityPromptSeed: { analysis: stepHelp.analysis, userMessage: userMessageForSingularity },
            },
          }
        );
      }

      return { finalResult: answered, workflow: null, synthesized: null, stepHelp, phasePatch: { currentPhase: "executor" } };
    }

    return null;
  }

  /**
   * Orchestrates the transition to the Singularity (Concierge) phase.
   * Executes Singularity step, persists state, and notifies UI that artifacts are ready.
   */
  async orchestrateSingularityPhase(request, context, steps, stepResults, _resolvedContext, currentUserMessage, stepExecutor, streamingManager) {
    try {
      const mappingResult = Array.from(stepResults.entries()).find(([_, v]) =>
        v.status === "completed" && v.result?.mapperArtifact,
      )?.[1]?.result;

      const userMessageForSingularity =
        context?.userMessage || currentUserMessage || "";

      let mapperArtifact = mappingResult?.mapperArtifact || null;
      let artifactSource = mappingResult?.mapperArtifact ? 'direct_from_stepResults' : 'none';

      if (!mapperArtifact) {
        try {
          const mappingSteps = Array.isArray(steps)
            ? steps.filter((s) => s && s.type === "mapping")
            : [];
          for (const step of mappingSteps) {
            const take = stepResults.get(step.stepId);
            const result = take?.status === "completed" ? take.result : null;
            if (!result) continue;
            const text = String(
              (result.meta && result.meta.rawMappingText) ||
              result.text ||
              "",
            );

            // Allow V3 <map> or legacy tags
            const hasStructuralTags =
              text.includes("<map>") ||
              text.includes("<mapper_artifact>") ||
              text.includes("<mapping_output>") ||
              text.includes("<decision_map>");

            if (!hasStructuralTags) {
              continue;
            }

            mapperArtifact = parseV1MapperToArtifact(text, {
              graphTopology: result?.meta?.graphTopology,
              query: userMessageForSingularity,
            });
            if (mapperArtifact) {
              artifactSource = 'parsed_from_text';

              // ⚠️ CRITICAL FIX: model_count is not set by parseV1MapperToArtifact
              // Calculate it from citationSourceOrder or fallback to supporters count
              if (!mapperArtifact.model_count || mapperArtifact.model_count === 0) {
                const citationOrder = result?.meta?.citationSourceOrder;
                if (citationOrder && typeof citationOrder === 'object') {
                  mapperArtifact.model_count = Object.keys(citationOrder).length;
                } else {
                  // Fallback: count unique supporters across claims
                  const supporterSet = new Set();
                  (mapperArtifact.claims || []).forEach(c => {
                    (c.supporters || []).forEach(s => {
                      if (typeof s === 'number') supporterSet.add(s);
                    });
                  });
                  mapperArtifact.model_count = supporterSet.size > 0 ? supporterSet.size : 1;
                }
              }
              break;
            }
          }
        } catch (e) {
          console.error('[CognitiveHandler] Fallback parsing failed:', e);
        }
      }

      if (!mapperArtifact) {
        console.warn("[CognitiveHandler] Missing mapperArtifact - forcing end of loop");
        return true;
      }

      // ✅ Populate context so WorkflowEngine/TurnEmitter can see it
      context.mapperArtifact = mapperArtifact;

      // ✅ Execute Singularity step automatically
      let singularityOutput = null;
      let singularityProviderId = null;

      // Determine Singularity provider from request or context
      singularityProviderId = request?.singularity ||
        context?.singularityProvider ||
        context?.meta?.singularity ||
        request?.mapper ||
        'gemini';

      if (stepExecutor && streamingManager) {
        let singularityStep = null;
        try {
          const phaseState = await this.sessionManager.getConciergePhaseState(context.sessionId);
          let structuralAnalysis = null;
          try {
            const { computeStructuralAnalysis } = await import('../PromptMethods');
            structuralAnalysis = computeStructuralAnalysis(mapperArtifact);
          } catch (e) {
            console.warn("[CognitiveHandler] computeStructuralAnalysis failed:", e);
          }

          let stanceSelection = null;
          try {
            const mod = await import('../ConciergeService');
            const ConciergeService = mod.ConciergeService;
            if (ConciergeService?.selectStance && structuralAnalysis?.shape) {
              stanceSelection = ConciergeService.selectStance(userMessageForSingularity, structuralAnalysis.shape);
            }
          } catch (_) { }

          let conciergePrompt = null;
          let conciergePromptType = "standard";
          let conciergePromptSeed = null;

          try {
            if (phaseState?.currentPhase === "starter" && (phaseState?.turnInPhase || 0) === 0) {
              const mod = await import('../../services/concierge/starter.prompt');
              conciergePromptType = "starter_1";
              conciergePromptSeed = { stance: stanceSelection?.stance || "default" };
              conciergePrompt = mod.buildStarterInitialPrompt(
                userMessageForSingularity,
                structuralAnalysis,
                conciergePromptSeed.stance,
              );
            } else if (phaseState?.currentPhase === "starter") {
              const mod = await import('../../services/concierge/starter.prompt');
              conciergePromptType = "starter_2";
              conciergePromptSeed = {
                shape: phaseState?.conciergeContextMeta?.shape || structuralAnalysis?.shape?.primaryPattern || "",
                userQuery: phaseState?.conciergeContextMeta?.userQuery || "",
                starterResponse: phaseState?.conciergeContextMeta?.starterResponse || "",
              };
              conciergePrompt = mod.buildStarterContinueWrapperWithSeed(
                userMessageForSingularity,
                conciergePromptSeed,
              );
            } else if (phaseState?.currentPhase === "explorer" && (phaseState?.turnInPhase || 0) === 0 && phaseState?.intentHandover) {
              const mod = await import('../../services/concierge/explorer.prompt');
              conciergePromptType = "explorer_1";
              conciergePromptSeed = { intentHandover: phaseState.intentHandover };
              conciergePrompt = mod.buildExplorerInitialPrompt(conciergePromptSeed.intentHandover, userMessageForSingularity);
            } else if (phaseState?.currentPhase === "explorer") {
              const mod = await import('../../services/concierge/explorer.prompt');
              conciergePromptType = "explorer_2";
              conciergePrompt = mod.buildExplorerContinueWrapper(userMessageForSingularity);
            } else {
              const mod = await import('../ConciergeService');
              const ConciergeService = mod.ConciergeService;
              conciergePromptType = "standard";
              conciergePromptSeed = { isFirstTurn: false, activeWorkflow: phaseState?.activeWorkflow || undefined };
              conciergePrompt = ConciergeService.buildConciergePrompt(
                userMessageForSingularity,
                structuralAnalysis,
                conciergePromptSeed,
              );
            }
          } catch (e) {
            console.warn("[CognitiveHandler] Failed to build concierge prompt:", e);
          }

          if (!conciergePrompt) {
            const mod = await import('../ConciergeService');
            const ConciergeService = mod.ConciergeService;
            conciergePromptType = "standard";
            conciergePrompt = ConciergeService.buildConciergePrompt(userMessageForSingularity, structuralAnalysis);
          }

          const phaseName = String(phaseState?.currentPhase || "starter");
          const phaseTurn = typeof phaseState?.turnInPhase === "number" ? phaseState.turnInPhase : 0;

          // ══════════════════════════════════════════════════════════════════
          // FEATURE 2: Detect provider change and reset context (preserve batch data)
          // ══════════════════════════════════════════════════════════════════
          const lastProvider = phaseState?.lastSingularityProviderId;
          const providerChanged = lastProvider && lastProvider !== singularityProviderId;

          let providerContexts = undefined;
          let isPhaseInitializeTurn =
            (phaseName === "starter" && phaseTurn === 0) ||
            (phaseName === "explorer" && phaseTurn === 0 && !!phaseState?.intentHandover) ||
            (phaseName === "executor" && phaseTurn === 0);

          // Force fresh context when provider changes (preserves handovers)
          if (providerChanged) {
            console.log(`[CognitiveHandler] Provider changed ${lastProvider} -> ${singularityProviderId}, resetting context`);
            isPhaseInitializeTurn = true; // Force re-initialization
            // Note: intentHandover/executionHandover remain in phaseState (batch data preserved)
          }

          if (isPhaseInitializeTurn && singularityProviderId) {
            providerContexts = {
              [singularityProviderId]: {
                meta: {},
                continueThread: false,
              },
            };
          }

          singularityStep = {
            stepId: `singularity-${singularityProviderId}-${Date.now()}`,
            type: 'singularity',
            payload: {
              singularityProvider: singularityProviderId,
              mapperArtifact,
              originalPrompt: userMessageForSingularity,
              mappingText: mappingResult?.text || "",
              mappingMeta: mappingResult?.meta || {},
              structuralAnalysis,
              stance: stanceSelection?.stance || null,
              conciergePrompt,
              conciergePromptType,
              conciergePromptSeed,
              useThinking: request?.useThinking || false,
              providerContexts,
            },
          };

          const executorOptions = {
            streamingManager,
            persistenceCoordinator: this.persistenceCoordinator,
            sessionManager: this.sessionManager,
          };

          const singularityResult = await stepExecutor.executeSingularityStep(
            singularityStep,
            context,
            new Map(),
            executorOptions
          );

          // ══════════════════════════════════════════════════════════════════
          // FEATURE 3: Recompute with Historical Singularity Prompts
          // Logic: Persist the prompt type and seed so recomputes can rebuild it exactly.
          // ══════════════════════════════════════════════════════════════════
          if (singularityResult?.output) {
            await this.sessionManager.upsertProviderResponse(
              context.sessionId,
              context.canonicalAiTurnId,
              singularityProviderId,
              'singularity',
              0,
              {
                ...singularityResult.output,
                meta: {
                  ...(singularityResult.output.meta || {}),
                  frozenSingularityPromptType: conciergePromptType,
                  frozenSingularityPromptSeed: conciergePromptSeed,
                },
              }
            );
          }

          if (singularityResult) {
            try {
              singularityProviderId = singularityResult?.providerId || singularityProviderId;
              const parsed = singularityResult.output?.parsed || null;
              const batchSignal = parsed?.batchSignal || null;
              const priorPhase = await this.sessionManager.getConciergePhaseState(context.sessionId);
              const next = { ...(priorPhase || {}) };
              const currentPhase = String(next.currentPhase || "starter");
              const turnInPhase = typeof next.turnInPhase === "number" ? next.turnInPhase : 0;

              if (currentPhase === "starter" && turnInPhase === 0) {
                next.currentPhase = "starter";
                next.turnInPhase = 1;
                next.conciergeContextMeta = {
                  ...(next.conciergeContextMeta || {}),
                  shape: structuralAnalysis?.shape?.primaryPattern || next?.conciergeContextMeta?.shape || "",
                  userQuery: userMessageForSingularity,
                  starterResponse: singularityResult.text || "",
                };
              } else if (currentPhase === "starter") {
                const handover = parsed?.intentHandover || null;
                if (handover) {
                  next.currentPhase = "explorer";
                  next.turnInPhase = 0;
                  next.intentHandover = handover;
                  next.conciergeContextMeta = {
                    ...(next.conciergeContextMeta || {}),
                    shape: handover.shape || next?.conciergeContextMeta?.shape || "",
                  };
                } else {
                  next.currentPhase = "starter";
                  next.turnInPhase = turnInPhase + 1;
                }
              } else if (currentPhase === "explorer") {
                next.currentPhase = "explorer";
                next.turnInPhase = turnInPhase + 1;
              } else if (currentPhase === "executor") {
                next.currentPhase = "executor";
                next.turnInPhase = turnInPhase + 1;
              }

              let finalSingularityResult = singularityResult;

              // ══════════════════════════════════════════════════════════════════
              // FEATURE 1: Gate batch execution after turn 1
              // ══════════════════════════════════════════════════════════════════
              const isAfterTurn1 = phaseTurn > 0 || (phaseName !== "starter" && phaseTurn >= 0);
              const batchAutoRunEnabled = request?.batchAutoRunEnabled ?? false;

              if (batchSignal?.type && batchSignal?.batchPrompt) {
                // Gate batch: after turn 1, only run if explicitly enabled
                if (isAfterTurn1 && !batchAutoRunEnabled) {
                  console.log("[CognitiveHandler] Batch signal gated (turn > 1, auto-run disabled)");
                  // Skip batch handling, use Singularity-only response
                } else {
                  try {
                    const handled = await this._handleConciergeBatchSignal({
                      batchSignal,
                      request,
                      context,
                      stepExecutor,
                      streamingManager,
                      singularityProviderId,
                      mapperArtifact,
                      structuralAnalysis,
                      userMessageForSingularity,
                    });
                    if (handled?.finalResult) {
                      finalSingularityResult = handled.finalResult;
                      Object.assign(next, handled.phasePatch || {});
                      if (handled?.phasePatch?.currentPhase === "executor" && handled?.phasePatch?.executionHandover) {
                        next.executionHandover = handled.phasePatch.executionHandover;
                      }
                    }
                  } catch (e) {
                    console.warn("[CognitiveHandler] Failed to handle concierge batch signal:", e);
                  }
                }
              }

              // ══════════════════════════════════════════════════════════════════
              // FEATURE 2: Track last provider for change detection on next turn
              // ══════════════════════════════════════════════════════════════════
              next.lastSingularityProviderId = singularityProviderId;

              await this.sessionManager.setConciergePhaseState(context.sessionId, next);
              const effectiveProviderId =
                finalSingularityResult?.providerId || singularityProviderId;
              singularityOutput = {
                text: finalSingularityResult?.text || "",
                providerId: effectiveProviderId,
                timestamp: Date.now(),
                leakageDetected: finalSingularityResult?.output?.leakageDetected || false,
                leakageViolations: finalSingularityResult?.output?.leakageViolations || [],
                pipeline: finalSingularityResult?.output?.pipeline || null,
              };

              context.singularityOutput = singularityOutput;

              try {
                // ══════════════════════════════════════════════════════════════════
                // FEATURE 3: Persist frozen Singularity prompt for historical recompute
                // ══════════════════════════════════════════════════════════════════
                await this.sessionManager.upsertProviderResponse(
                  context.sessionId,
                  context.canonicalAiTurnId,
                  effectiveProviderId,
                  'singularity',
                  0,
                  {
                    text: singularityOutput.text,
                    status: 'completed',
                    meta: {
                      singularityOutput,
                      frozenSingularityPrompt: conciergePrompt, // FEATURE 3: store for recompute
                    }
                  }
                );
              } catch (persistErr) {
                console.warn("[CognitiveHandler] Persistence failed:", persistErr);
              }

              try {
                this.port.postMessage({
                  type: "WORKFLOW_STEP_UPDATE",
                  sessionId: context.sessionId,
                  stepId: singularityStep.stepId,
                  status: "completed",
                  result: finalSingularityResult,
                });
              } catch (_) { }
            } catch (e) {
              console.warn("[CognitiveHandler] Failed to update concierge phase state:", e);
            }
          }
        } catch (singularityErr) {
          console.error("[CognitiveHandler] Singularity execution failed:", singularityErr);
          try {
            if (singularityStep?.stepId) {
              this.port.postMessage({
                type: "WORKFLOW_STEP_UPDATE",
                sessionId: context.sessionId,
                stepId: singularityStep.stepId,
                status: "failed",
                error: singularityErr?.message || String(singularityErr),
              });
            }
          } catch (_) { }
        }
      }

      this.port.postMessage({
        type: "MAPPER_ARTIFACT_READY",
        sessionId: context.sessionId,
        aiTurnId: context.canonicalAiTurnId,
        artifact: mapperArtifact,
        singularityOutput,
        singularityProvider: singularityOutput?.providerId || singularityProviderId,
      });

      // ✅ Return false to let workflow continue to natural completion
      // Singularity step has already executed above, no need to halt early
      return false;
    } catch (e) {
      console.error("[CognitiveHandler] Orchestration failed:", e);
      return false;
    }
  }


  async handleContinueRequest(payload, stepExecutor, streamingManager, contextManager) {
    const { sessionId, aiTurnId, providerId, selectedArtifacts, isRecompute, sourceTurnId } = payload || {};

    try {
      const adapter = this.sessionManager?.adapter;
      if (!adapter) throw new Error("Persistence adapter not available");

      const aiTurn = await adapter.get("turns", aiTurnId);
      if (!aiTurn) throw new Error(`AI turn ${aiTurnId} not found.`);

      const effectiveSessionId = sessionId || aiTurn.sessionId;
      const userTurnId = aiTurn.userTurnId;
      const userTurn = userTurnId ? await adapter.get("turns", userTurnId) : null;
      const originalPrompt = extractUserMessage(userTurn);

      let mapperArtifact = payload.mapperArtifact || aiTurn.mapperArtifact || null;

      const priorResponses = await adapter.getResponsesByTurnId(aiTurnId);
      const mappingResponses = (priorResponses || [])
        .filter((r) => r && r.responseType === "mapping" && r.providerId)
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
      const latestMappingText = mappingResponses?.[0]?.text || "";
      const latestMappingMeta = mappingResponses?.[0]?.meta || {};

      if (!mapperArtifact && mappingResponses?.[0]) {
        mapperArtifact = parseV1MapperToArtifact(String(latestMappingText), {
          graphTopology: latestMappingMeta?.graphTopology,
          query: originalPrompt,
        });
      }

      if (!mapperArtifact) {
        throw new Error(`MapperArtifact missing for turn ${aiTurnId}.`);
      }

      const preferredProvider = providerId ||
        aiTurn.meta?.singularity ||
        aiTurn.meta?.mapper ||
        "gemini";

      const context = {
        sessionId: effectiveSessionId,
        canonicalAiTurnId: aiTurnId,
        canonicalUserTurnId: userTurnId,
        userMessage: originalPrompt,
      };

      const executorOptions = {
        streamingManager,
        persistenceCoordinator: this.persistenceCoordinator,
        contextManager,
        sessionManager: this.sessionManager
      };

      const stepId = `singularity-${preferredProvider}-${Date.now()}`;
      const step = {
        stepId,
        type: 'singularity',
        payload: {
          singularityProvider: preferredProvider,
          mapperArtifact,
          originalPrompt,
          mappingText: latestMappingText,
          mappingMeta: latestMappingMeta,
          selectedArtifacts: Array.isArray(selectedArtifacts) ? selectedArtifacts : [],
          stance: payload.stance || null,
          useThinking: payload.useThinking || false,
        },
      };

      const result = await stepExecutor.executeSingularityStep(step, context, new Map(), executorOptions);
      const effectiveProviderId = result?.providerId || preferredProvider;

      try {
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: effectiveSessionId,
          stepId,
          status: "completed",
          result,
          ...(isRecompute ? { isRecompute: true, sourceTurnId: sourceTurnId || aiTurnId } : {}),
        });
      } catch (_) { }

      await this.sessionManager.upsertProviderResponse(
        effectiveSessionId,
        aiTurnId,
        effectiveProviderId,
        'singularity',
        0,
        { text: result?.text || "", status: result?.status || "completed", meta: result?.meta || {} },
      );

      // Re-fetch and emit final turn
      const responses = await adapter.getResponsesByTurnId(aiTurnId);
      const buckets = {
        batchResponses: {},
        mappingResponses: {},
        singularityResponses: {},
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
            : r.responseType === "mapping"
              ? buckets.mappingResponses
              : r.responseType === "singularity"
                ? buckets.singularityResponses
                : null;

        if (!target || !entry.providerId) continue;
        (target[entry.providerId] ||= []).push(entry);
      }

      for (const group of Object.values(buckets)) {
        for (const pid of Object.keys(group)) {
          group[pid].sort((a, b) => (a.responseIndex ?? 0) - (b.responseIndex ?? 0));
        }
      }

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
            mappingResponses: buckets.mappingResponses,
            singularityResponses: buckets.singularityResponses,
            meta: aiTurn.meta || {},
          },
        },
      });

    } catch (error) {
      console.error(`[CognitiveHandler] Orchestration failed:`, error);
      try {
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: sessionId || "unknown",
          stepId: `continue-singularity-error`,
          status: "failed",
          error: error.message || String(error),
          ...(isRecompute ? { isRecompute: true, sourceTurnId: sourceTurnId || aiTurnId } : {}),
        });
      } catch (_) { }
    }
  }
}
