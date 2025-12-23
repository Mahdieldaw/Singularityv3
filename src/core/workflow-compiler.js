// src/core/workflow-compiler.js - PHASE 3 COMPLETE
/**
 * WorkflowCompiler - PURE FUNCTION
 *
 * Phase 3 completion: Zero database access, fully synchronous.
 * All data comes from ResolvedContext parameter.
 */

export class WorkflowCompiler {
  constructor(sessionManager, config = {}) {
    // Kept only for dependency injection - NEVER USED
    this.sessionManager = sessionManager;

    // Store defaults in memory from injected config
    this.defaults = {
      mapper: config.htos_mapping_provider || "Gemini",
      synthesizer: config.htos_last_synthesis_model || "claude",
      refiner: config.htos_last_refiner_model || "claude",
      antagonist: config.htos_last_antagonist_model || "claude"
    };
  }

  /**
   * PURE COMPILE: Primitive + Context → Workflow Steps
   *
   * @param {Object} request - Initialize/Extend/Recompute primitive
   * @param {Object} resolvedContext - REQUIRED from ContextResolver
   * @returns {Object} Executable workflow
   */
  compile(request, resolvedContext) {
    if (!resolvedContext) {
      throw new Error("[Compiler] resolvedContext required");
    }

    this._validateRequest(request);
    this._validateContext(resolvedContext);

    const workflowId = this._generateWorkflowId(resolvedContext.type);
    const steps = [];
    // Track created step IDs to ensure correct linkage
    let batchStepId = null;

    console.log(`[Compiler] Compiling ${resolvedContext.type} workflow`);

    // ========================================================================
    // STEP GENERATION: Based on primitive request
    // ========================================================================
    switch (resolvedContext.type) {
      case "initialize":
      case "extend":
        // Batch step if providers specified
        if (request.providers && request.providers.length > 0) {
          const batchStep = this._createBatchStep(request, resolvedContext);
          steps.push(batchStep);
          batchStepId = batchStep.stepId;
        }
        break;

      case "recompute":
        if (resolvedContext.stepType === "batch") {
          // Generate a single-provider prompt step targeting the provider being retried
          const provider = resolvedContext.targetProvider;
          const stepId = `batch-retry-${Date.now()}`;
          // Normalize provider context shape
          const rawCtx = resolvedContext.providerContextsAtSourceTurn
            ? resolvedContext.providerContextsAtSourceTurn[provider]
            : undefined;
          const meta = rawCtx && rawCtx.meta ? rawCtx.meta : rawCtx;
          const providerContexts = meta
            ? { [provider]: { meta, continueThread: true } }
            : undefined;
          const batchStep = {
            stepId,
            type: "prompt",
            payload: {
              prompt: resolvedContext.sourceUserMessage,
              providers: [provider],
              providerContexts,
              useThinking: !!request.useThinking,
            },
          };
          steps.push(batchStep);
          batchStepId = stepId;
        } else {
          console.log("[Compiler] Recompute: Skipping batch (frozen outputs)");
        }
        break;
    }

    // Synthesis step first
    if (this._needsSynthesisStep(request, resolvedContext)) {
      const synthesisStep = this._createSynthesisStep(
        request,
        resolvedContext,
        { batchStepId },
      );
      steps.push(synthesisStep);
      // Track for potential future linkage or diagnostics
      synthesisStepId = synthesisStep.stepId;
    }

    // Mapping step after synthesis (so it can reference synthesis step IDs)
    if (this._needsMappingStep(request, resolvedContext)) {
      const lastSynthesisStep =
        steps.filter((s) => s.type === "synthesis").slice(-1)[0] || null;
      const mappingStep = this._createMappingStep(request, resolvedContext, {
        batchStepId,
        synthesisStepId: lastSynthesisStep?.stepId,
      });
      steps.push(mappingStep);
      mappingStepId = mappingStep.stepId;
    }

    // Refiner step (if requested and dependencies exist)
    if (this._needsRefinerStep(request, resolvedContext)) {
      const lastSynthesisStep =
        steps.filter((s) => s.type === "synthesis").slice(-1)[0] || null;
      const lastMappingStep =
        steps.filter((s) => s.type === "mapping").slice(-1)[0] || null;

      const refinerStep = this._createRefinerStep(request, resolvedContext, {
        batchStepId,
        synthesisStepId: lastSynthesisStep?.stepId,
        mappingStepId: lastMappingStep?.stepId,
      });
      steps.push(refinerStep);
    }

    // Antagonist step (if requested and dependencies exist)
    if (this._needsAntagonistStep(request, resolvedContext)) {
      const lastSynthesisStep =
        steps.filter((s) => s.type === "synthesis").slice(-1)[0] || null;
      const lastMappingStep =
        steps.filter((s) => s.type === "mapping").slice(-1)[0] || null;
      const lastRefinerStep =
        steps.filter((s) => s.type === "refiner").slice(-1)[0] || null;

      const antagonistStep = this._createAntagonistStep(request, resolvedContext, {
        batchStepId,
        synthesisStepId: lastSynthesisStep?.stepId,
        mappingStepId: lastMappingStep?.stepId,
        refinerStepId: lastRefinerStep?.stepId,
      });
      steps.push(antagonistStep);
    }

    const workflowContext = this._buildWorkflowContext(
      request,
      resolvedContext,
    );

    console.log(`[Compiler] Generated ${steps.length} steps`);

    return {
      workflowId,
      context: workflowContext,
      steps,
    };
  }

  // ============================================================================
  // STEP CREATORS (Pure)
  // ============================================================================

  _createBatchStep(request, context) {
    return {
      stepId: `batch-${Date.now()}`,
      type: "prompt",
      payload: {
        prompt: request.userMessage,
        providers: request.providers,
        providerContexts:
          context.type === "extend" ? context.providerContexts : undefined,
        previousContext: context.previousContext || null,
        providerMeta: request.providerMeta || {},
        useThinking: !!request.useThinking,
      },
    };
  }

  _createMappingStep(request, context, linkIds = {}) {
    // Include provider in stepId so UI can derive provider on failure without result payload
    const mappingProviderId =
      context.type === "recompute"
        ? context.targetProvider
        : request.mapper || this._getDefaultMapper(request);
    const mappingStepId = `mapping-${mappingProviderId}-${Date.now()}`;

    if (context.type === "recompute") {
      return {
        stepId: mappingStepId,
        type: "mapping",
        payload: {
          mappingProvider: context.targetProvider,
          sourceHistorical: {
            turnId: context.sourceTurnId,
            responseType: "batch",
          },
          originalPrompt: context.sourceUserMessage,
          useThinking: !!request.useThinking,
          attemptNumber: 1,
        },
      };
    }

    // Use mapper from primitive
    const mapper = mappingProviderId;

    return {
      stepId: mappingStepId,
      type: "mapping",
      payload: {
        mappingProvider: mapper,
        // Explicitly allow mapper to continue thread from the batch step when available
        continueFromBatchStep: linkIds.batchStepId || undefined,
        sourceStepIds: linkIds.batchStepId ? [linkIds.batchStepId] : undefined,
        synthesisStepIds: linkIds.synthesisStepId
          ? [linkIds.synthesisStepId]
          : undefined,
        providerOrder: Array.isArray(request.providers)
          ? request.providers.slice()
          : undefined,
        originalPrompt: request.userMessage,
        useThinking: !!request.useThinking && mapper === "chatgpt",
        attemptNumber: 1,
      },
    };
  }

  _createSynthesisStep(request, context, linkIds = {}) {
    // Include provider in stepId so UI can derive provider on failure without result payload
    const synthesisProviderId =
      context.type === "recompute"
        ? context.targetProvider
        : request.synthesizer || this._getDefaultSynthesizer(request);
    const synthStepId = `synthesis-${synthesisProviderId}-${Date.now()}`;

    if (context.type === "recompute") {
      return {
        stepId: synthStepId,
        type: "synthesis",
        payload: {
          synthesisProvider: context.targetProvider,
          sourceHistorical: {
            turnId: context.sourceTurnId,
            responseType: "batch",
          },
          originalPrompt: context.sourceUserMessage,
          useThinking: !!request.useThinking,
          attemptNumber: 1,
          strategy: "continuation",
          // For recompute, mapping results are fetched historically via resolvedContext
        },
      };
    }

    // Use synthesizer from primitive
    const synthesizer = synthesisProviderId;

    return {
      stepId: synthStepId,
      type: "synthesis",
      payload: {
        synthesisProvider: synthesizer,
        sourceStepIds: linkIds.batchStepId ? [linkIds.batchStepId] : undefined,
        // mappingStepIds deliberately omitted; mapping will run after synthesis now
        originalPrompt: request.userMessage,
        useThinking: !!request.useThinking && synthesizer === "chatgpt",
        attemptNumber: 1,
        strategy: "continuation",
      },
    };
  }

  _createRefinerStep(request, context, linkIds = {}) {
    // defaults to synthesizer if not specified
    const refinerProvider =
      context.type === "recompute"
        ? context.targetProvider
        : request.refiner || this._getDefaultRefiner(request);

    const stepId = `refiner-${refinerProvider}-${Date.now()}`;

    if (context.type === "recompute") {
      return {
        stepId,
        type: "refiner",
        payload: {
          refinerProvider,
          sourceHistorical: {
            turnId: context.sourceTurnId,
            responseType: "batch",
          },
          originalPrompt: context.sourceUserMessage,
        },
      };
    }

    return {
      stepId,
      type: "refiner",
      payload: {
        refinerProvider,
        sourceStepIds: linkIds.batchStepId ? [linkIds.batchStepId] : undefined,
        synthesisStepIds: linkIds.synthesisStepId
          ? [linkIds.synthesisStepId]
          : undefined,
        mappingStepIds: linkIds.mappingStepId ? [linkIds.mappingStepId] : undefined,
        originalPrompt: request.userMessage,
      },
    };
  }

  _createAntagonistStep(request, context, linkIds = {}) {
    const antagonistProvider =
      context.type === "recompute"
        ? context.targetProvider
        : request.antagonist || this._getDefaultAntagonist(request);

    const stepId = `antagonist-${antagonistProvider}-${Date.now()}`;

    if (context.type === "recompute") {
      return {
        stepId,
        type: "antagonist",
        payload: {
          antagonistProvider,
          sourceHistorical: {
            turnId: context.sourceTurnId,
            responseType: "batch",
          },
          originalPrompt: context.sourceUserMessage,
        },
      };
    }

    return {
      stepId,
      type: "antagonist",
      payload: {
        antagonistProvider,
        sourceStepIds: linkIds.batchStepId ? [linkIds.batchStepId] : undefined,
        synthesisStepIds: linkIds.synthesisStepId
          ? [linkIds.synthesisStepId]
          : undefined,
        mappingStepIds: linkIds.mappingStepId ? [linkIds.mappingStepId] : undefined,
        refinerStepIds: linkIds.refinerStepId ? [linkIds.refinerStepId] : undefined,
        originalPrompt: request.userMessage,
      },
    };
  }

  // ============================================================================
  // DECISION LOGIC (Pure)
  // ============================================================================

  _needsMappingStep(request, context) {
    if (context.type === "recompute") {
      return context.stepType === "mapping";
    }
    // Check primitive property
    return !!request.includeMapping;
  }

  _needsSynthesisStep(request, context) {
    if (context.type === "recompute") {
      return context.stepType === "synthesis";
    }
    // Check primitive property
    return !!request.includeSynthesis;
  }

  _needsRefinerStep(request, context) {
    if (context.type === "recompute") {
      return context.stepType === "refiner";
    }
    // Check primitive property: Refiner requires synthesis
    return (
      !!request.includeSynthesis &&
      !!request.includeRefiner
    );
  }

  _needsAntagonistStep(request, context) {
    if (context.type === "recompute") {
      return context.stepType === "antagonist";
    }
    // Antagonist requires refiner to be present
    return (
      !!request.includeRefiner &&
      !!request.includeAntagonist
    );
  }

  // ============================================================================
  // CONTEXT BUILDER (Pure)
  // ============================================================================

  _buildWorkflowContext(request, context) {
    let sessionId;
    let sessionCreated = false;

    switch (context.type) {
      case "initialize":
        // Prefer sessionId passed in the primitive (set by ConnectionHandler); fallback to generate
        sessionId =
          request.sessionId ||
          `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        sessionCreated = true;
        break;

      case "extend":
      case "recompute":
        sessionId = context.sessionId;
        break;

      default:
        sessionId = "unknown-session";
    }

    const userMessage =
      context.type === "recompute"
        ? context.sourceUserMessage
        : request.userMessage;

    return {
      sessionId,
      threadId: "default-thread",
      targetUserTurnId:
        context.type === "recompute" ? context.sourceTurnId : "",
      sessionCreated,
      userMessage,
    };
  }

  // ============================================================================
  // UTILITIES (Pure)
  // ============================================================================

  _getDefaultMapper(request) {
    return request.providers?.[0] || this.defaults.mapper;
  }

  _getDefaultSynthesizer(request) {
    return request.providers?.[0] || this.defaults.synthesizer;
  }

  _getDefaultRefiner(request) {
    return request.providers?.[0] || this.defaults.refiner;
  }

  _getDefaultAntagonist(request) {
    return request.providers?.[0] || this.defaults.antagonist;
  }

  _generateWorkflowId(contextType) {
    return `wf-${contextType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  _validateRequest(request) {
    if (!request?.type) throw new Error("[Compiler] Request type required");

    const validTypes = ["initialize", "extend", "recompute"];
    if (!validTypes.includes(request.type)) {
      throw new Error(`[Compiler] Invalid type: ${request.type}`);
    }

    // Type-specific validation
    switch (request.type) {
      case "initialize":
        if (!request.userMessage?.trim())
          throw new Error("[Compiler] Initialize: userMessage required");
        if (!request.providers?.length)
          throw new Error("[Compiler] Initialize: providers required");
        break;

      case "extend":
        if (!request.sessionId)
          throw new Error("[Compiler] Extend: sessionId required");
        if (!request.userMessage?.trim())
          throw new Error("[Compiler] Extend: userMessage required");
        if (!request.providers?.length)
          throw new Error("[Compiler] Extend: providers required");
        break;

      case "recompute":
        if (!request.sessionId)
          throw new Error("[Compiler] Recompute: sessionId required");
        if (!request.sourceTurnId)
          throw new Error("[Compiler] Recompute: sourceTurnId required");
        if (!request.stepType)
          throw new Error("[Compiler] Recompute: stepType required");
        if (!request.targetProvider)
          throw new Error("[Compiler] Recompute: targetProvider required");
        break;
    }
  }

  _validateContext(context) {
    if (!context?.type) throw new Error("[Compiler] Context type required");

    const validTypes = ["initialize", "extend", "recompute"];
    if (!validTypes.includes(context.type)) {
      throw new Error(`[Compiler] Invalid context type: ${context.type}`);
    }

    switch (context.type) {
      case "initialize": {
        // initialize has no additional required fields in context
        break;
      }
      case "extend": {
        if (!context.sessionId)
          throw new Error("[Compiler] Extend: sessionId required");
        if (!context.lastTurnId)
          throw new Error("[Compiler] Extend: lastTurnId required");
        if (!context.providerContexts)
          throw new Error("[Compiler] Extend: providerContexts required");
        break;
      }
      case "recompute": {
        if (!context.sessionId)
          throw new Error("[Compiler] Recompute: sessionId required");
        if (!context.sourceTurnId)
          throw new Error("[Compiler] Recompute: sourceTurnId required");
        if (!context.stepType)
          throw new Error("[Compiler] Recompute: stepType required");
        if (!context.targetProvider)
          throw new Error("[Compiler] Recompute: targetProvider required");
        // Only require frozenBatchOutputs for synthesis/mapping historical recomputes
        if (context.stepType !== "batch" && !context.frozenBatchOutputs) {
          throw new Error(
            "[Compiler] Recompute: frozenBatchOutputs required for synthesis/mapping",
          );
        }
        break;
      }
    }
  }
}
