import { parseMapperArtifact } from '../../../shared/parsing-utils';
import { extractUserMessage } from '../context-utils.js';
import { DEFAULT_THREAD } from '../../../shared/messaging.js';

export class CognitivePipelineHandler {
  constructor(port, persistenceCoordinator, sessionManager) {
    this.port = port;
    this.persistenceCoordinator = persistenceCoordinator;
    this.sessionManager = sessionManager;
    this._inflightContinuations = new Map();
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

      // 1. Resolve mapperArtifact (from current results, context, or request payload)
      let mapperArtifact = mappingResult?.mapperArtifact || context?.mapperArtifact || request?.payload?.mapperArtifact || null;

      if (!mapperArtifact) {
        console.warn("[CognitiveHandler] No mapperArtifact found in results or context.");
        // According to user requirement: fail if missing.
        console.error("[CognitiveHandler] CRITICAL: Missing mapperArtifact for Singularity phase.");
        throw new Error("Singularity mode requires a valid Mapper Artifact which is missing in this context.");
      }

      // ✅ Populate context so WorkflowEngine/TurnEmitter can see it
      context.mapperArtifact = mapperArtifact;

      // ══════════════════════════════════════════════════════════════════
      // TRAVERSAL GATING CHECK (Pipeline Pause)
      // ══════════════════════════════════════════════════════════════════
      const hasTraversal = !!mapperArtifact.traversalGraph;
      const hasForcingPoints = Array.isArray(mapperArtifact.forcingPoints) && mapperArtifact.forcingPoints.length > 0;
      const isTraversalContinuation = request?.isTraversalContinuation || context?.isTraversalContinuation;

      if (hasTraversal && hasForcingPoints && !isTraversalContinuation) {
        console.log("[CognitiveHandler] Traversal detected with conflicts. Pausing pipeline for user input.");

        // 1. Update Turn Status
        const aiTurnId = context.canonicalAiTurnId;
        try {
          const safeMapperArtifact =
            this.sessionManager && typeof this.sessionManager._safeArtifact === "function"
              ? this.sessionManager._safeArtifact(mapperArtifact)
              : mapperArtifact;
          const currentAiTurn = await this.sessionManager.adapter.get("turns", aiTurnId);
          if (currentAiTurn) {
            currentAiTurn.pipelineStatus = 'awaiting_traversal';
            currentAiTurn.mapperArtifact = safeMapperArtifact;
            if (context?.pipelineArtifacts || mappingResult?.pipelineArtifacts) {
              currentAiTurn.pipelineArtifacts = context?.pipelineArtifacts || mappingResult?.pipelineArtifacts;
            }
            await this.sessionManager.adapter.put("turns", currentAiTurn);
          }

          // Safe fallback object for messaging, handling case where currentAiTurn is null
          const aiTurnForMessage = currentAiTurn
            ? { ...currentAiTurn, pipelineStatus: 'awaiting_traversal' }
            : { id: aiTurnId, pipelineStatus: 'awaiting_traversal' };

          // 2. Notify UI
          this.port.postMessage({
            type: "MAPPER_ARTIFACT_READY",
            sessionId: context.sessionId,
            aiTurnId: context.canonicalAiTurnId,
            artifact: safeMapperArtifact,
            singularityOutput: null,
            singularityProvider: null,
            pipelineStatus: 'awaiting_traversal'
          });

          // Send finalized update so usage hooks pick up the status change immediately
          this.port.postMessage({
            type: "TURN_FINALIZED",
            sessionId: context.sessionId,
            userTurnId: context.canonicalUserTurnId,
            aiTurnId: aiTurnId,
            turn: {
              user: { id: context.canonicalUserTurnId, sessionId: context.sessionId }, // Minimal user turn ref
              ai: aiTurnForMessage
            }
          });

        } catch (err) {
          console.error("[CognitiveHandler] Failed to pause pipeline:", err);
        }

        return "awaiting_traversal"; // Stop execution without finalization
      }

      // ✅ Execute Singularity step automatically
      let singularityOutput = null;
      let singularityProviderId = null;

      // Determine Singularity provider from request or context
      singularityProviderId = request?.singularity ||
        context?.singularityProvider ||
        context?.meta?.singularity;

      // Check if singularity was explicitly provided (even if null/false)
      const singularityExplicitlySet = request && Object.prototype.hasOwnProperty.call(request, 'singularity');
      let singularityDisabled = false;

      if (singularityExplicitlySet && !request.singularity) {
        // UI explicitly set singularity to null/false/undefined — skip concierge
        console.log("[CognitiveHandler] Singularity explicitly disabled - skipping concierge phase");
        singularityProviderId = null;
        singularityDisabled = true;
      }

      if (stepExecutor && streamingManager && !singularityDisabled) {
        let conciergeState = null;
        try {
          conciergeState = await this.sessionManager.getConciergePhaseState(context.sessionId);
        } catch (e) {
          console.warn("[CognitiveHandler] Failed to fetch concierge state:", e);
        }

        // Fallback: If no provider requested, try to use the last one used in this session.
        // If that fails, default to 'gemini'.
        if (!singularityProviderId) {
          singularityProviderId = conciergeState?.lastSingularityProviderId || 'gemini';
        }

        console.log(`[CognitiveHandler] Orchestrating singularity for Turn = ${context.canonicalAiTurnId}, Provider = ${singularityProviderId}`);
        let singularityStep = null;
        try {
          let structuralAnalysis = null;
          try {
            const { computeStructuralAnalysis, computeFullAnalysis } = await import('../PromptMethods');

            // Collect batch responses if available (Turn 1 transition)
            const promptStep = steps.find(s => s.type === 'prompt');
            const promptResult = promptStep ? stepResults.get(promptStep.stepId) : null;
            const batchResults = promptResult?.result?.results || null;

            if (batchResults && Object.keys(batchResults).length > 0) {
              const rawCitationOrder = mapperArtifact?.options?.citationSourceOrder || mapperArtifact?.metadata?.citationSourceOrder;
              let normalizedCitationOrder = {}; // providerId -> numericIndex

              if (rawCitationOrder && typeof rawCitationOrder === 'object') {
                const entries = Object.entries(rawCitationOrder);
                if (entries.length > 0) {
                  const [firstKey, firstVal] = entries[0];
                  // If values are numbers AND key is not numeric, treat as provider -> index
                  const isProviderToIndex = typeof firstVal === 'number' && Number.isFinite(firstVal) && isNaN(Number(firstKey));

                  if (isProviderToIndex) {
                    // Start with what we have, but filter for valid numbers
                    Object.entries(rawCitationOrder).forEach(([k, v]) => {
                      if (typeof v === 'number' && Number.isFinite(v)) {
                        normalizedCitationOrder[k] = v;
                      }
                    });
                  } else {
                    // Treat as index -> provider and invert
                    entries.forEach(([k, v]) => {
                      if (v && typeof v === 'string') {
                        const index = Number(k);
                        if (Number.isFinite(index)) {
                          normalizedCitationOrder[v] = index;
                        } else {
                          console.warn(`[CognitivePipelineHandler] Invalid citation index '${k}' for provider '${v}'. Skipping.`);
                        }
                      }
                    });
                  }
                }
              }

              const batchResponses = [];
              const providersInResults = Object.keys(batchResults);
              const processedProviders = new Set();

              // 1. Process providers that exist in our confirmed citation order
              const sortedByCitation = Object.entries(normalizedCitationOrder)
                .sort(([, a], [, b]) => (a || 0) - (b || 0));

              sortedByCitation.forEach(([providerId, index]) => {
                const resp = batchResults[providerId];
                if (resp) {
                  // Double check index is a number
                  const validIndex = Number.isFinite(Number(index)) ? Number(index) : 1;
                  batchResponses.push({
                    modelIndex: validIndex,
                    content: resp.text || ""
                  });
                  processedProviders.add(providerId);
                }
              });

              // 2. Append any providers present in batchResults but missing from citationOrder
              // Safely compute fallback index, ensuring no NaNs
              const validIndices = batchResponses.map(r => r.modelIndex).filter(n => Number.isFinite(n));
              let fallbackIndex = validIndices.length > 0
                ? Math.max(...validIndices) + 1
                : 1;

              if (!Number.isFinite(fallbackIndex)) fallbackIndex = 1;

              providersInResults.forEach(providerId => {
                if (!processedProviders.has(providerId)) {
                  batchResponses.push({
                    modelIndex: fallbackIndex++,
                    content: batchResults[providerId]?.text || ""
                  });
                }
              });

              console.log(`[CognitiveHandler] Normalized batchResponses (${batchResponses.length} models) from ${providersInResults.length} raw results`);
              structuralAnalysis = computeFullAnalysis(batchResponses, mapperArtifact, userMessageForSingularity);
            } else {
              console.log(`[CognitiveHandler] Running base structural analysis (no batch responses found)`);
              structuralAnalysis = computeStructuralAnalysis(mapperArtifact);
            }
          } catch (e) {
            console.error("[CognitiveHandler] Analysis failed:", e);
          }

          if (structuralAnalysis && Array.isArray(structuralAnalysis.claimsWithLeverage) && Array.isArray(structuralAnalysis.edges)) {
            context.storedAnalysis = structuralAnalysis; // Store full analysis
            // Also attach to mapperArtifact for the UI
            mapperArtifact.problemStructure = structuralAnalysis.shape;
            mapperArtifact.fullAnalysis = {
              ...structuralAnalysis,
              // Ensure shadow data is present on fullAnalysis for UI consumption
              shadow: mapperArtifact.shadow || structuralAnalysis.shadow || null
            };
          }


          // ══════════════════════════════════════════════════════════════════
          // HANDOFF V2: Determine if fresh instance needed
          // ══════════════════════════════════════════════════════════════════
          const lastProvider = conciergeState?.lastSingularityProviderId;
          const providerChanged = lastProvider && lastProvider !== singularityProviderId;

          // Fresh instance triggers:
          // 1. First time concierge runs
          // 2. Provider changed
          // 3. COMMIT was detected in previous turn (commitPending)
          const needsFreshInstance =
            !conciergeState?.hasRunConcierge ||
            providerChanged ||
            conciergeState?.commitPending;

          if (needsFreshInstance) {
            console.log(`[CognitiveHandler] Fresh instance needed: first=${!conciergeState?.hasRunConcierge}, providerChanged=${providerChanged}, commitPending=${conciergeState?.commitPending}`);
          }

          // ══════════════════════════════════════════════════════════════════
          // HANDOFF V2: Calculate turn number within current instance
          // ══════════════════════════════════════════════════════════════════
          // Race Condition Fix: Idempotency Check
          if (conciergeState?.lastProcessedTurnId === context.canonicalAiTurnId) {
            console.log(`[CognitivePipeline] Turn ${context.canonicalAiTurnId} already processed, skipping duplicate execution.`);
            // Return a result that indicates skipping, consistent with the function's expected output.
            // Assuming `orchestrateSingularityPhase` should return a boolean or similar to indicate completion/success.
            // If the caller expects a detailed result object, this return type might need adjustment.
            return true; // Or a specific object if the caller expects it.
          }

          let turnInCurrentInstance = conciergeState?.turnInCurrentInstance || 0;

          if (needsFreshInstance) {
            // Fresh spawn - reset to Turn 1
            turnInCurrentInstance = 1;
          } else {
            // Same instance - increment turn
            turnInCurrentInstance = (turnInCurrentInstance || 0) + 1;
          }

          console.log(`[CognitiveHandler] Turn in current instance: ${turnInCurrentInstance}`);

          // ══════════════════════════════════════════════════════════════════
          // HANDOFF V2: Build message based on turn number
          // ══════════════════════════════════════════════════════════════════
          let conciergePrompt = null;
          let conciergePromptType = "standard";
          let conciergePromptSeed = null;

          // Guarded dynamic import for resilience during partial deploys
          let ConciergeModule;
          try {
            ConciergeModule = await import('../../ConciergeService/ConciergeService');
          } catch (err) {
            console.error("[CognitiveHandler] Critical error: ConciergeService module could not be loaded", err);
          }
          const ConciergeService = ConciergeModule?.ConciergeService;

          try {
            if (!ConciergeService) {
              throw new Error("ConciergeService not found in module");
            }

            if (turnInCurrentInstance === 1) {
              // Turn 1: Full buildConciergePrompt with prior context if fresh spawn after COMMIT
              conciergePromptType = "full";
              const conciergePromptSeedBase = {
                isFirstTurn: true,
                activeWorkflow: conciergeState?.activeWorkflow || undefined,
                priorContext: undefined,
              };

              conciergePromptSeed =
                conciergeState?.commitPending && conciergeState?.pendingHandoff
                  ? {
                      ...conciergePromptSeedBase,
                      priorContext: {
                        handoff: conciergeState.pendingHandoff,
                        committed: conciergeState.pendingHandoff?.commit || null,
                      },
                    }
                  : conciergePromptSeedBase;

              if (conciergePromptSeed.priorContext) {
                console.log(
                  `[CognitiveHandler] Fresh spawn with prior context from COMMIT`,
                );
              }

              if (typeof ConciergeService.buildConciergePrompt === 'function') {
                conciergePrompt = ConciergeService.buildConciergePrompt(
                  userMessageForSingularity,
                  conciergePromptSeed,
                );
              } else {
                console.warn("[CognitiveHandler] ConciergeService.buildConciergePrompt missing");
              }
            } else if (turnInCurrentInstance === 2) {
              // Turn 2: Optimized followup (No structural analysis)
              conciergePromptType = "followup_optimized";
              if (typeof ConciergeService.buildTurn2Message === 'function') {
                conciergePrompt = ConciergeService.buildTurn2Message(userMessageForSingularity);
                console.log(`[CognitiveHandler] Turn 2: using optimized followup message`);
              } else {
                console.warn("[CognitiveHandler] ConciergeService.buildTurn2Message missing, falling back to standard prompt");
              }
            } else {
              // Turn 3+: Dynamic optimized followup
              conciergePromptType = "handoff_echo";
              const pendingHandoff = conciergeState?.pendingHandoff || null;
              if (typeof ConciergeService.buildTurn3PlusMessage === 'function') {
                conciergePrompt = ConciergeService.buildTurn3PlusMessage(userMessageForSingularity, pendingHandoff);
                console.log(`[CognitiveHandler] Turn ${turnInCurrentInstance}: using optimized handoff echo`);
              } else {
                console.warn("[CognitiveHandler] ConciergeService.buildTurn3PlusMessage missing, falling back to standard prompt");
              }
            }
          } catch (err) {
            console.error("[CognitiveHandler] Error building concierge prompt:", err);
            conciergePrompt = null; // Will trigger fallback below
          }

          if (!conciergePrompt) {
            // Fallback to standard prompt
            console.warn("[CognitiveHandler] Prompt building failed, using fallback");
            conciergePromptType = "standard_fallback";
            if (ConciergeService && typeof ConciergeService.buildConciergePrompt === 'function') {
              conciergePrompt = ConciergeService.buildConciergePrompt(
                userMessageForSingularity,
                { isFirstTurn: turnInCurrentInstance === 1 },
              );
            } else {
              console.error("[CognitiveHandler] ConciergeService.buildConciergePrompt unavailable for fallback");
            }
          }

          // ══════════════════════════════════════════════════════════════════
          // Provider context: continueThread based on fresh instance need
          // ══════════════════════════════════════════════════════════════════
          let providerContexts = undefined;

          if (needsFreshInstance && singularityProviderId) {
            // Fresh spawn: get new chatId/cursor from provider
            providerContexts = {
              [singularityProviderId]: {
                meta: {},
                continueThread: false,
              },
            };
            console.log(`[CognitiveHandler] Setting continueThread: false for fresh instance`);
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

              // ══════════════════════════════════════════════════════════════════
              // HANDOFF V2: Parse handoff from response (Turn 2+)
              // ══════════════════════════════════════════════════════════════════
              let parsedHandoff = null;
              let commitPending = false;
              let userFacingText = singularityResult?.text || "";

              if (turnInCurrentInstance >= 2) {
                try {
                  const { parseHandoffResponse, hasHandoffContent } = await import('../../../shared/parsing-utils');
                  const parsed = parseHandoffResponse(singularityResult?.text || '');

                  if (parsed.handoff && hasHandoffContent(parsed.handoff)) {
                    parsedHandoff = parsed.handoff;

                    // Check for COMMIT signal
                    if (parsed.handoff.commit) {
                      commitPending = true;
                      console.log(`[CognitiveHandler] COMMIT detected (length: ${parsed.handoff.commit.length})`);
                    }
                  }

                  // Use user-facing version (handoff stripped)
                  userFacingText = parsed.userFacing;
                } catch (e) {
                  console.warn('[CognitiveHandler] Handoff parsing failed:', e);
                }
              }

              // ══════════════════════════════════════════════════════════════════
              // HANDOFF V2: Update concierge phase state
              // ══════════════════════════════════════════════════════════════════
              const next = {
                ...(conciergeState || {}),
                lastSingularityProviderId: singularityProviderId,
                hasRunConcierge: true,
                lastProcessedTurnId: context.canonicalAiTurnId, // Idempotency guard 
                // Handoff V2 fields
                turnInCurrentInstance,
                pendingHandoff: parsedHandoff || conciergeState?.pendingHandoff || null,
                commitPending,
              };

              await this.sessionManager.setConciergePhaseState(context.sessionId, next);

              const effectiveProviderId =
                singularityResult?.providerId || singularityProviderId;
              singularityOutput = {
                text: userFacingText, // Use handoff-stripped text
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
                    text: userFacingText, // Persist handoff-stripped text
                    status: 'completed',
                    meta: {
                      ...(singularityResult.output?.meta || {}),
                      singularityOutput,
                      frozenSingularityPromptType: conciergePromptType,
                      frozenSingularityPromptSeed: conciergePromptSeed,
                      frozenSingularityPrompt: conciergePrompt,
                      // Handoff V2 metadata
                      turnInCurrentInstance,
                      handoffDetected: !!parsedHandoff,
                      commitDetected: commitPending,
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
                  result: {
                    ...singularityResult,
                    text: userFacingText, // Send handoff-stripped to UI
                  },
                });
              } catch (err) {
                console.error("port.postMessage failed in CognitivePipelineHandler (orchestrateSingularityPhase):", err);
              }
            } catch (e) {
              console.warn("[CognitiveHandler] Failed to update concierge state:", e);
            }
          }
        } catch (singularityErr) {
          console.error("[CognitiveHandler] Singularity execution failed:", singularityErr);
          try {
            if (singularityStep?.stepId) {
              const msg = singularityErr instanceof Error ? singularityErr.message : String(singularityErr);
              this.port.postMessage({
                type: "WORKFLOW_STEP_UPDATE",
                sessionId: context.sessionId,
                stepId: singularityStep.stepId,
                status: "failed",
                error: msg,
              });
            }
          } catch (err) {
            console.error("port.postMessage failed in CognitivePipelineHandler (orchestrateSingularityPhase/singularityStep):", err);
          }
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
    const { sessionId, aiTurnId, providerId, isRecompute, sourceTurnId } = payload || {};

    try {
      const adapter = this.sessionManager?.adapter;
      if (!adapter) throw new Error("Persistence adapter not available");

      const aiTurn = await adapter.get("turns", aiTurnId);
      if (!aiTurn) throw new Error(`AI turn ${aiTurnId} not found.`);

      const effectiveSessionId = sessionId || aiTurn.sessionId;
      if (sessionId && aiTurn.sessionId && sessionId !== aiTurn.sessionId) {
        try {
          this.port.postMessage({
            type: "CONTINUATION_ERROR",
            sessionId,
            aiTurnId,
            error: "Session mismatch for continuation request",
          });
        } catch (_) { }
        return;
      }

      if (payload?.isTraversalContinuation) {
        if (aiTurn.pipelineStatus !== 'awaiting_traversal') {
          try {
            this.port.postMessage({
              type: "CONTINUATION_ERROR",
              sessionId: effectiveSessionId,
              aiTurnId,
              error: `Invalid turn state: ${aiTurn.pipelineStatus || 'unknown'}`,
            });
          } catch (_) { }
          return;
        }
        try {
          this.port.postMessage({
            type: "CONTINUATION_ACK",
            sessionId: effectiveSessionId,
            aiTurnId,
          });
        } catch (_) { }
      }
      const userTurnId = aiTurn.userTurnId;
      const userTurn = userTurnId ? await adapter.get("turns", userTurnId) : null;

      // Allow overriding prompt for traversal continuation
      const originalPrompt = payload.userMessage || extractUserMessage(userTurn);

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
        mapperArtifact = parseMapperArtifact(String(latestMappingText));
        if (mapperArtifact) {
          mapperArtifact.query = originalPrompt;
        }
      }

      if (!mapperArtifact) {
        throw new Error(`MapperArtifact missing for turn ${aiTurnId}.`);
      }

      const pipelineArtifacts = aiTurn.pipelineArtifacts;
      let chewedSubstrate = null;
      if (payload?.isTraversalContinuation && payload?.traversalState) {
        try {
          const { buildChewedSubstrate, normalizeTraversalState, getSourceData } = await import('../../skeletonization');
          const sourceData = getSourceData(aiTurn, pipelineArtifacts);
          if (Array.isArray(sourceData) && sourceData.length > 0) {
            chewedSubstrate = await buildChewedSubstrate({
              statements: mapperArtifact.shadow?.statements || [],
              paragraphs: pipelineArtifacts.paragraphProjection?.paragraphs || [],
              claims: mapperArtifact.claims || [],
              traversalState: normalizeTraversalState(payload.traversalState),
              sourceData,
            });
          }
        } catch (e) {
          console.warn(
            `[CognitiveHandler] Failed to build chewedSubstrate for traversal continuation (aiTurnId=${aiTurnId}, sessionId=${effectiveSessionId}):`,
            e,
          );
          chewedSubstrate = null;
        }
      }

      const preferredProvider = providerId ||
        aiTurn.meta?.singularity ||
        aiTurn.meta?.mapper ||
        "gemini";

      const inflightKey = `${effectiveSessionId}:${aiTurnId}:${preferredProvider || 'default'}`;
      if (this._inflightContinuations.has(inflightKey)) {
        console.log(`[CognitiveHandler] Duplicate blocked: ${inflightKey}`);
        return;
      }
      this._inflightContinuations.set(inflightKey, Date.now());

      try {
      const context = {
        sessionId: effectiveSessionId,
        canonicalAiTurnId: aiTurnId,
        canonicalUserTurnId: userTurnId,
        userMessage: originalPrompt,
        // Pass flag to context for orchestration logic if needed
        isTraversalContinuation: payload.isTraversalContinuation,
        chewedSubstrate
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
          useThinking: payload.useThinking || false,
          isTraversalContinuation: payload.isTraversalContinuation,
          chewedSubstrate
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
      } catch (err) {
        console.error("port.postMessage failed in CognitivePipelineHandler (handleContinueRequest):", err);
      }

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

      // Update pipeline status if we were waiting
      if (aiTurn.pipelineStatus === 'awaiting_traversal') {
        try {
          const t = await adapter.get("turns", aiTurnId);
          if (t) {
            t.pipelineStatus = 'complete';
            await adapter.put("turns", t);
            // Update local reference for emission
            aiTurn.pipelineStatus = 'complete';
          }
        } catch (e) {
          console.warn("[CognitiveHandler] Failed to update pipeline status:", e);
        }
      }

      let finalAiTurn = aiTurn;
      try {
        const t = await adapter.get("turns", aiTurnId);
        if (t) finalAiTurn = t;
      } catch (_) { }

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
            threadId: aiTurn.threadId || DEFAULT_THREAD,
            createdAt: aiTurn.createdAt || Date.now(),
            ...(Object.keys(buckets.batchResponses).length > 0 ? { batchResponses: buckets.batchResponses } : {}),
            ...(Object.keys(buckets.mappingResponses).length > 0 ? { mappingResponses: buckets.mappingResponses } : {}),
            ...(Object.keys(buckets.singularityResponses).length > 0 ? { singularityResponses: buckets.singularityResponses } : {}),
            meta: aiTurn.meta || {},
            mapperArtifact: finalAiTurn?.mapperArtifact,
            pipelineArtifacts: finalAiTurn?.pipelineArtifacts,
            singularityOutput: finalAiTurn?.singularityOutput,
            pipelineStatus: finalAiTurn?.pipelineStatus || aiTurn.pipelineStatus
          },
        },
      });

      } finally {
        this._inflightContinuations.delete(inflightKey);
      }

    } catch (error) {
      console.error(`[CognitiveHandler] Orchestration failed:`, error);
      try {
        const msg = error instanceof Error ? error.message : String(error);
        this.port.postMessage({
          type: "WORKFLOW_STEP_UPDATE",
          sessionId: sessionId || "unknown",
          stepId: `continue-singularity-error`,
          status: "failed",
          error: msg,
          ...(isRecompute ? { isRecompute: true, sourceTurnId: sourceTurnId || aiTurnId } : {}),
        });
      } catch (err) {
        console.error("port.postMessage failed in CognitivePipelineHandler (handleContinueRequest/errorBoundary):", err);
      }
    }
  }
}
