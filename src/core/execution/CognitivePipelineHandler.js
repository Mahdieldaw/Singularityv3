
import { computeExplore } from '../cognitive/explore-computer';
import { parseV1MapperToArtifact } from '../../../shared/parsing-utils';
import { extractUserMessage } from '../context-utils.js';

export class CognitivePipelineHandler {
  constructor(port, persistenceCoordinator, sessionManager) {
    this.port = port;
    this.persistenceCoordinator = persistenceCoordinator;
    this.sessionManager = sessionManager;
  }

  /**
   * Checks if the workflow should halt for cognitive decision-making.
   * If yes, persists state, emits halt message, and returns true.
   */
  async handleCognitiveHalt(request, context, steps, stepResults, resolvedContext, currentUserMessage) {
    try {
      const mappingResult = Array.from(stepResults.entries()).find(([_, v]) =>
        v.status === "completed" && v.result?.mapperArtifact,
      )?.[1]?.result;

      const userMessageForExplore =
        context?.userMessage || currentUserMessage || "";

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
        console.error("[CognitiveHandler] Cognitive pipeline missing mapperArtifact");
        try {
            await this.persistenceCoordinator.persistStepResult(resolvedContext, context, steps, stepResults, userMessageForExplore);
        } catch (_) { }

        // We emit finalizer elsewhere, just notify engine to stop?
        // Actually, halt logic usually emits turn finalization too.
        
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
          const persistResult = this.persistenceCoordinator.buildPersistenceResultFromStepResults(
            steps,
            stepResults,
          );
          const persistRequest = {
            type: resolvedContext?.type || "initialize",
            sessionId: context.sessionId,
            userMessage: userMessageForExplore,
            canonicalUserTurnId: context?.canonicalUserTurnId,
            canonicalAiTurnId: context?.canonicalAiTurnId,
            mapperArtifact,
            exploreAnalysis,
          };

          await this.persistenceCoordinator.persistWorkflowResult(
            persistRequest,
            resolvedContext,
            persistResult,
          );
        }
      } catch (err) {
        console.error(
          "[CognitiveHandler] Failed to persist cognitive halt state:",
          err,
        );
      }

      // We need to trigger the engine to finalize the turn
      this.port.postMessage({
        type: "WORKFLOW_COMPLETE",
        sessionId: context.sessionId,
        workflowId: request.workflowId,
        finalResults: Object.fromEntries(stepResults),
        haltReason: "cognitive_exploration_ready",
      });
      return true;
    } catch (e) {
      console.error("[CognitiveHandler] computeExplore failed:", e);
      return false;
    }
  }

  async handleContinueRequest(payload, stepExecutor, streamingManager, contextManager) {
    const { sessionId, aiTurnId, mode, providerId, selectedArtifacts } = payload || {};
    console.log(`[CognitiveHandler] Continuing cognitive workflow for turn ${aiTurnId} with mode ${mode}`);

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

      const executorOptions = {
          streamingManager, 
          persistenceCoordinator: this.persistenceCoordinator, 
          contextManager, // Passed but likely not used heavily for simple continuation
          sessionManager: this.sessionManager
      };

      const result =
        mode === "understand"
          ? await stepExecutor.executeUnderstandStep(step, context, new Map(), executorOptions)
          : await stepExecutor.executeGauntletStep(step, context, new Map(), executorOptions);

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

      // Re-fetch and emit final turn
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
      console.error(`[CognitiveHandler] handleContinueCognitiveRequest failed:`, error);
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
