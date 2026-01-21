import { DEFAULT_THREAD } from '../../../shared/messaging.js';

export class TurnEmitter {
  constructor(port) {
    this.port = port;
    this.lastFinalizedTurn = null;
  }

  _generateId(prefix = "turn") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Emit TURN_FINALIZED message with canonical turn data
   * This allows UI to replace optimistic placeholders with backend-confirmed data
   * 
   * Post-refactor: Only handles batch, mapping, and singularity responses.
   * Deprecated persona steps (refiner, antagonist, understand, gauntlet) have been removed.
   */
  emitTurnFinalized(context, steps, stepResults, resolvedContext, currentUserMessage) {
    // Skip TURN_FINALIZED for recompute operations (they don't create new turns)
    if (resolvedContext?.type === "recompute") {
      console.log(
        "[TurnEmitter] Skipping TURN_FINALIZED for recompute operation",
      );
      return;
    }

    const userMessage = context?.userMessage || currentUserMessage || "";
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
      const mappingResponses = {};
      const singularityResponses = {};
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
            case "singularity": {
              const providerId = result?.providerId || step?.payload?.singularityProvider;
              if (!providerId) return;
              if (!singularityResponses[providerId])
                singularityResponses[providerId] = [];
              singularityResponses[providerId].push({
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
              break;
            }
            case "singularity": {
              const providerId = step?.payload?.singularityProvider;
              if (!providerId) return;
              if (!singularityResponses[providerId])
                singularityResponses[providerId] = [];
              singularityResponses[providerId].push({
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
        Object.keys(mappingResponses).length > 0 ||
        Object.keys(singularityResponses).length > 0;

      if (!hasData) {
        console.log("[TurnEmitter] No AI responses to finalize");
        return;
      }

      const aiTurn = {
        id: aiTurnId,
        type: "ai",
        userTurnId: userTurn.id,
        sessionId: context.sessionId,
        threadId: DEFAULT_THREAD,
        createdAt: timestamp,
        pipelineStatus: context?.pipelineStatus || "complete",
        batchResponses,
        mappingResponses,
        singularityResponses,
        meta: {
          mapper: primaryMapper,
          requestedFeatures: {
            mapping: steps.some((s) => s.type === "mapping"),
            singularity: steps.some((s) => s.type === "singularity"),
          },
          ...(context?.workflowControl ? { workflowControl: context.workflowControl } : {}),
        },
        // Cognitive artifacts
        mapperArtifact: context?.mapperArtifact || undefined,
        singularityOutput: context?.singularityOutput || undefined,
      };

      console.log("[TurnEmitter] Emitting TURN_FINALIZED", {
        userTurnId: userTurn.id,
        aiTurnId: aiTurn.id,
        batchCount: Object.keys(batchResponses).length,
        mappingCount: Object.keys(mappingResponses).length,
        singularityCount: Object.keys(singularityResponses).length,
      });

      this.port.postMessage({
        type: "TURN_FINALIZED",
        sessionId: context.sessionId,
        userTurnId: userTurn.id,
        aiTurnId: aiTurnId,
        turn: {
          user: userTurn,
          ai: aiTurn,
        },
      });

      // Store for persistence alignment
      this.lastFinalizedTurn = {
        sessionId: context.sessionId,
        user: userTurn,
        ai: aiTurn,
      };
    } catch (error) {
      console.error("[TurnEmitter] Failed to emit TURN_FINALIZED:", error);
    }
  }
}
