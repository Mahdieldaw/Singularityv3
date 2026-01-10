
import { parseV1MapperToArtifact } from '../../../shared/parsing-utils';
import { extractUserMessage } from '../context-utils.js';

export class CognitivePipelineHandler {
  constructor(port, persistenceCoordinator, sessionManager) {
    this.port = port;
    this.persistenceCoordinator = persistenceCoordinator;
    this.sessionManager = sessionManager;
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
          const conciergeState = await this.sessionManager.getConciergePhaseState(context.sessionId);
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
            const mod = await import('../ConciergeService');
            const ConciergeService = mod.ConciergeService;
            conciergePromptType = "standard";
            conciergePromptSeed = {
              stance: stanceSelection?.stance || undefined,
              isFirstTurn: !conciergeState?.hasRunConcierge,
              activeWorkflow: conciergeState?.activeWorkflow || undefined,
            };
            conciergePrompt = ConciergeService.buildConciergePrompt(
              userMessageForSingularity,
              structuralAnalysis,
              conciergePromptSeed,
            );
          } catch (e) {
            console.warn("[CognitiveHandler] Failed to build concierge prompt:", e);
          }

          if (!conciergePrompt) {
            try {
              const mod = await import('../ConciergeService');
              const ConciergeService = mod.ConciergeService;
              conciergePromptType = "standard";
              conciergePrompt = ConciergeService.buildConciergePrompt(userMessageForSingularity, structuralAnalysis);
            } catch (e) {
              console.error("[CognitiveHandler] Fallback concierge prompt build failed:", e);
              conciergePrompt = null;
            }
          }

          // ══════════════════════════════════════════════════════════════════
          // FEATURE 2: Detect provider change and reset context (preserve batch data)
          // ══════════════════════════════════════════════════════════════════
          const lastProvider = conciergeState?.lastSingularityProviderId;
          const providerChanged = lastProvider && lastProvider !== singularityProviderId;

          let providerContexts = undefined;
          let shouldInitialize = !conciergeState?.hasRunConcierge;

          // Force fresh context when provider changes
          if (providerChanged) {
            console.log(`[CognitiveHandler] Provider changed ${lastProvider} -> ${singularityProviderId}, resetting context`);
            shouldInitialize = true;
          }

          if (shouldInitialize && singularityProviderId) {
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

          if (singularityResult) {
            try {
              singularityProviderId = singularityResult?.providerId || singularityProviderId;
              const next = {
                ...(conciergeState || {}),
                lastSingularityProviderId: singularityProviderId,
                hasRunConcierge: true,
              };

              // ══════════════════════════════════════════════════════════════════
              // FEATURE 2: Track last provider for change detection on next turn
              // ══════════════════════════════════════════════════════════════════
              await this.sessionManager.setConciergePhaseState(context.sessionId, next);
              const effectiveProviderId =
                singularityResult?.providerId || singularityProviderId;
              singularityOutput = {
                text: singularityResult?.text || "",
                providerId: effectiveProviderId,
                timestamp: Date.now(),
                leakageDetected: singularityResult?.output?.leakageDetected || false,
                leakageViolations: singularityResult?.output?.leakageViolations || [],
                pipeline: singularityResult?.output?.pipeline || null,
              };

              context.singularityOutput = singularityOutput;

              try {
                // ══════════════════════════════════════════════════════════════════
                // FEATURE 3: Persist frozen Singularity prompt and metadata
                // ══════════════════════════════════════════════════════════════════
                await this.sessionManager.upsertProviderResponse(
                  context.sessionId,
                  context.canonicalAiTurnId,
                  effectiveProviderId,
                  'singularity',
                  0,
                  {
                    ...(singularityResult.output || {}),
                    text: singularityOutput.text,
                    status: 'completed',
                    meta: {
                      ...(singularityResult.output?.meta || {}),
                      singularityOutput,
                      frozenSingularityPromptType: conciergePromptType,
                      frozenSingularityPromptSeed: conciergePromptSeed,
                      frozenSingularityPrompt: conciergePrompt,
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
                  result: singularityResult,
                });
              } catch (_) { }
            } catch (e) {
              console.warn("[CognitiveHandler] Failed to update concierge state:", e);
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
      const latestSingularityResponse = (priorResponses || [])
        .filter((r) => r && r.responseType === "singularity")
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))?.[0];
      const frozenSingularityPromptType = latestSingularityResponse?.meta?.frozenSingularityPromptType;
      const frozenSingularityPromptSeed = latestSingularityResponse?.meta?.frozenSingularityPromptSeed;
      const frozenSingularityPrompt = latestSingularityResponse?.meta?.frozenSingularityPrompt;
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
      if (isRecompute) {
        executorOptions.frozenSingularityPromptType = frozenSingularityPromptType;
        executorOptions.frozenSingularityPromptSeed = frozenSingularityPromptSeed;
        executorOptions.frozenSingularityPrompt = frozenSingularityPrompt;
      }

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
