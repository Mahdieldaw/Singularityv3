Refactored WorkflowEngine.execute()
javascriptasync execute(request, resolvedContext) {
  const { context, steps } = request;
  const stepResults = new Map();
  const workflowContexts = {};

  // Cache user message with validation
  this.currentUserMessage = context?.userMessage || request?.context?.userMessage || "";
  if (!this.currentUserMessage?.trim()) {
    console.error('[WorkflowEngine] CRITICAL: execute() with empty userMessage!');
    return;
  }

  try {
    // Check which pipeline to use
    const useCognitivePipeline = await this._checkCognitivePipeline();
    context.useCognitivePipeline = useCognitivePipeline;

    // Seed contexts for extend/recompute
    this._seedContexts(resolvedContext, stepResults, workflowContexts);

    // === PIPELINE FORK ===
    if (useCognitivePipeline) {
      await this._executeCognitivePipeline(context, steps, stepResults, workflowContexts, resolvedContext);
    } else {
      await this._executeClassicPipeline(context, steps, stepResults, workflowContexts, resolvedContext);
    }

  } catch (error) {
    console.error('[WorkflowEngine] Workflow failed:', error);
    this._handleWorkflowError(error, context, resolvedContext);
  } finally {
    this.streamingManager.clearCache(context.sessionId);
  }
}

// ============================================================================
// CLASSIC PIPELINE (Original)
// ============================================================================
async _executeClassicPipeline(context, steps, stepResults, workflowContexts, resolvedContext) {
  console.log('[WorkflowEngine] Running CLASSIC pipeline');

  // 1. Batch Phase
  await this._executeBatchPhase(steps, context, stepResults, resolvedContext);
  
  // Validate batch success (need 2+ models)
  const batchSuccess = this._validateBatchPhase(stepResults, resolvedContext);
  if (!batchSuccess) {
    await this._persistAndExit(context, steps, stepResults, resolvedContext, "insufficient_witnesses");
    return;
  }

  // 2. Mapping Phase (old mapper)
  await this._executeMappingPhase(steps, context, stepResults, workflowContexts, resolvedContext);
  
  if (this._hasMappingError(stepResults)) {
    await this._persistAndExit(context, steps, stepResults, resolvedContext, "mapping_failed");
    return;
  }

  // 3. Consensus Gate Check (skip refiner/antagonist if monoculture)
  const consensusGate = this._computeConsensusGate(stepResults, steps);
  if (consensusGate) {
    context.workflowControl = consensusGate;
  }

  // 4. Synthesis Phase
  await this._executeSynthesisPhase(steps, context, stepResults, workflowContexts, resolvedContext);
  
  if (this._hasSynthesisError(stepResults)) {
    await this._persistAndExit(context, steps, stepResults, resolvedContext, "synthesis_failed");
    return;
  }

  // 5. Refiner Phase (if not consensus-only)
  if (!context.workflowControl?.consensusOnly) {
    await this._executeRefinerPhase(steps, context, stepResults, resolvedContext);
  }

  // 6. Antagonist Phase (if not consensus-only)
  if (!context.workflowControl?.consensusOnly) {
    await this._executeAntagonistPhase(steps, context, stepResults, resolvedContext);
  }

  // 7. Persist and Finalize
  await this._persistAndFinalize(context, steps, stepResults, resolvedContext);
}

// ============================================================================
// COGNITIVE PIPELINE (New)
// ============================================================================
async _executeCognitivePipeline(context, steps, stepResults, workflowContexts, resolvedContext) {
  console.log('[WorkflowEngine] Running COGNITIVE pipeline');

  // 1. Batch Phase (same as classic)
  await this._executeBatchPhase(steps, context, stepResults, resolvedContext);
  
  const batchSuccess = this._validateBatchPhase(stepResults, resolvedContext);
  if (!batchSuccess) {
    await this._persistAndExit(context, steps, stepResults, resolvedContext, "insufficient_witnesses");
    return;
  }

  // 2. MapperV2 Phase (cognitive-specific mapper)
  await this._executeMappingV2Phase(steps, context, stepResults, workflowContexts, resolvedContext);
  
  if (this._hasMappingError(stepResults)) {
    await this._persistAndExit(context, steps, stepResults, resolvedContext, "mapping_failed");
    return;
  }

  // 3. Extract MapperArtifact and Compute Explore Analysis
  const mappingResult = Array.from(stepResults.entries()).find(([_, v]) =>
    v.status === 'completed' && v.result?.mapperArtifact
  )?.[1]?.result;

  if (!mappingResult?.mapperArtifact) {
    console.error('[WorkflowEngine] Cognitive pipeline missing mapperArtifact');
    await this._persistAndExit(context, steps, stepResults, resolvedContext, "mapping_artifact_missing");
    return;
  }

  const mapperArtifact = mappingResult.mapperArtifact;
  const exploreAnalysis = computeExplore(context.userMessage, mapperArtifact);

  // 4. Emit Mapper Artifact Ready (UI displays options)
  this.port.postMessage({
    type: 'MAPPER_ARTIFACT_READY',
    sessionId: context.sessionId,
    aiTurnId: context.canonicalAiTurnId,
    artifact: mapperArtifact,
    analysis: exploreAnalysis,
  });

  console.log('[WorkflowEngine] Cognitive Explore complete:', {
    queryType: exploreAnalysis.queryType,
    container: exploreAnalysis.containerType,
    escapeVelocity: exploreAnalysis.escapeVelocity,
  });

  // 5. Persist State Before Halt
  await this._persistCognitiveHalt(context, steps, stepResults, resolvedContext);

  // 6. Emit Workflow Complete with Halt Reason
  this.turnEmitter.emitTurnFinalized(context, steps, stepResults, resolvedContext);
  this.port.postMessage({
    type: "WORKFLOW_COMPLETE",
    sessionId: context.sessionId,
    workflowId: request.workflowId,
    finalResults: Object.fromEntries(stepResults),
    haltReason: "cognitive_exploration_ready"
  });

  console.log('[WorkflowEngine] Cognitive HALT: Waiting for user mode selection (Understand or Decide).');
}

// ============================================================================
// COGNITIVE CONTINUATION (User picks Understand or Decide)
// ============================================================================
async handleContinueCognitiveRequest(payload) {
  const { sessionId, aiTurnId, mode } = payload;
  console.log(`[WorkflowEngine] Continuing cognitive workflow: ${mode} mode`);

  try {
    // 1. Rehydrate turn from persistence
    const adapter = this.sessionManager.adapter;
    const aiTurn = await adapter.get("turns", aiTurnId);
    if (!aiTurn) throw new Error(`AI turn ${aiTurnId} not found`);

    const mapperArtifact = aiTurn.mapperArtifact;
    const exploreAnalysis = aiTurn.exploreAnalysis;

    if (!mapperArtifact) {
      throw new Error(`MapperArtifact missing for turn ${aiTurnId}`);
    }

    const context = {
      sessionId,
      canonicalAiTurnId: aiTurnId,
      canonicalUserTurnId: aiTurn.userTurnId
    };

    // Use mapper provider as default for continuation
    const preferredProvider = aiTurn.meta?.mapper || "gemini";

    let result;

    // === MODE FORK ===
    if (mode === 'understand') {
      // Understand Mode: Synthesis-like with new prompt
      const step = {
        stepId: `understand-${preferredProvider}-${Date.now()}`,
        type: 'understand',
        payload: {
          understandProvider: preferredProvider,
          mapperArtifact,
          exploreAnalysis,
          originalPrompt: aiTurn.meta?.originalPrompt || "...",
          useThinking: false
        }
      };
      result = await this.executeUnderstandStep(step, context, {});

    } else if (mode === 'gauntlet') {
      // Decide Mode: Gauntlet for decision-ready output
      const step = {
        stepId: `gauntlet-${preferredProvider}-${Date.now()}`,
        type: 'gauntlet',
        payload: {
          gauntletProvider: preferredProvider,
          mapperArtifact,
          originalPrompt: aiTurn.meta?.originalPrompt || "...",
          useThinking: false
        }
      };
      result = await this.executeGauntletStep(step, context, {});

    } else {
      throw new Error(`Unknown cognitive mode: ${mode}`);
    }

    // 2. Persist the new response
    await this.sessionManager.upsertProviderResponse(
      sessionId,
      aiTurnId,
      preferredProvider,
      mode, // 'understand' or 'gauntlet' as responseType
      0,
      {
        text: result.text,
        status: "completed",
        meta: result.meta,
      }
    );

    // 3. Emit completion (UI updates with new response)
    this.port.postMessage({
      type: "COGNITIVE_CONTINUATION_COMPLETE",
      sessionId,
      aiTurnId,
      mode,
      providerId: preferredProvider,
      result,
    });

  } catch (error) {
    console.error('[WorkflowEngine] Cognitive continuation failed:', error);
    this.port.postMessage({
      type: "WORKFLOW_STEP_UPDATE",
      sessionId: sessionId || "unknown",
      stepId: `continue-${mode}-error`,
      status: "failed",
      error: error.message,
    });
  }
}

// ============================================================================
// HELPER: Persist Cognitive Halt State
// ============================================================================
async _persistCognitiveHalt(context, steps, stepResults, resolvedContext) {
  if (resolvedContext?.type === "recompute") return; // No persist for recomputes

  const persistResult = this._buildPersistenceResultFromStepResults(steps, stepResults);
  
  const userMessage = context?.userMessage || this.currentUserMessage || "";
  
  // VALIDATION: Refuse to persist empty userMessage
  if (!userMessage || userMessage.trim() === "") {
    console.error('[WorkflowEngine] HALT: Cannot persist with empty userMessage!', {
      contextUserMessage: context?.userMessage,
      cachedUserMessage: this.currentUserMessage,
      sessionId: context.sessionId,
    });
    throw new Error("Cannot persist cognitive halt with empty user message");
  }

  const persistRequest = {
    type: resolvedContext?.type || "initialize",
    sessionId: context.sessionId,
    userMessage,
    canonicalUserTurnId: context?.canonicalUserTurnId,
    canonicalAiTurnId: context?.canonicalAiTurnId,
  };

  console.log('[WorkflowEngine] Persisting cognitive halt state:', {
    sessionId: persistRequest.sessionId,
    userMessageLength: persistRequest.userMessage.length,
  });

  await this.sessionManager.persist(persistRequest, resolvedContext, persistResult);
}

// ============================================================================
// HELPER: MapperV2 Phase (Cognitive-specific)
// ============================================================================
async _executeMappingV2Phase(steps, context, stepResults, workflowContexts, resolvedContext) {
  const mappingSteps = steps.filter(s => s.type === "mapping"); // Compiler should create MapperV2 step
  
  for (const step of mappingSteps) {
    try {
      const result = await this.executeMappingV2Step(
        step,
        context,
        stepResults,
        workflowContexts,
        resolvedContext
      );
      stepResults.set(step.stepId, { status: "completed", result });
      
      this.port.postMessage({
        type: "WORKFLOW_STEP_UPDATE",
        sessionId: context.sessionId,
        stepId: step.stepId,
        status: "completed",
        result,
      });
      
      // Immediate persistence
      await this._persistMappingResult(context, step, result, resolvedContext);
      
    } catch (error) {
      console.error('[WorkflowEngine] MapperV2 failed:', error);
      stepResults.set(step.stepId, { status: "failed", error: error.message });
      
      this.port.postMessage({
        type: "WORKFLOW_STEP_UPDATE",
        sessionId: context.sessionId,
        stepId: step.stepId,
        status: "failed",
        error: error.message,
      });
      
      throw error; // Halt pipeline on mapping failure
    }
  }
}
Key Changes

Separate Pipeline Methods: _executeClassicPipeline() vs _executeCognitivePipeline()
No Mixing: Classic pipeline never sees MapperV2, cognitive never sees old synthesis/refiner/antagonist
Clear Continuation: handleContinueCognitiveRequest() only runs Understand OR Gauntlet, not both
Explicit Halt: Cognitive pipeline always halts after MapperV2, never continues automatically
Mode Fork: User picks Understand or Decide after halt, these are separate execution paths

This makes it crystal clear that these are two different workflows, not feature flags on one workflow.




Proposed Architecture: Extract Specialized Services
1. StepExecutor (handles individual step execution)
javascript// src/core/execution/StepExecutor.js
export class StepExecutor {
  constructor(orchestrator, promptService, responseProcessor) {
    this.orchestrator = orchestrator;
    this.promptService = promptService;
    this.responseProcessor = responseProcessor;
  }

  async executePromptStep(step, context, options) {
    // Extract all batch execution logic here
  }

  async executeSynthesisStep(step, context, previousResults, options) {
    // Extract synthesis logic
  }

  async executeMappingStep(step, context, previousResults, options) {
    // Extract mapping logic
  }

  async executeRefinerStep(step, context, stepResults) {
    // Extract refiner logic
  }

  async executeAntagonistStep(step, context, stepResults) {
    // Extract antagonist logic
  }

  async executeUnderstandStep(step, context, previousResults) {
    // Cognitive mode
  }

  async executeGauntletStep(step, context, previousResults) {
    // Cognitive mode
  }
}
2. StreamingManager (handles delta streaming)
javascript// src/core/execution/StreamingManager.js
export class StreamingManager {
  constructor(port) {
    this.port = port;
    this.lastStreamState = new Map();
  }

  makeDelta(sessionId, stepId, providerId, fullText) {
    // Extract makeDelta logic
  }

  dispatchPartialDelta(sessionId, stepId, providerId, text, label, isFinal) {
    // Extract _dispatchPartialDelta logic
  }

  clearCache(sessionId) {
    // Extract clearDeltaCache logic
  }
}
3. ContextManager (handles provider context resolution)
javascript// src/core/execution/ContextManager.js
export class ContextManager {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
  }

  resolveProviderContext(providerId, context, payload, workflowContexts, previousResults, resolvedContext, stepType) {
    // Extract _resolveProviderContext logic
  }

  extractContextsFromResult(result) {
    // Extract from SessionManager
  }

  buildContextSummary(result) {
    // Extract from SessionManager
  }
}
4. PersistenceCoordinator (handles persistence operations)
javascript// src/core/execution/PersistenceCoordinator.js
export class PersistenceCoordinator {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
  }

  buildPersistenceResult(steps, stepResults) {
    // Extract _buildPersistenceResultFromStepResults
  }

  async persistWorkflowResult(request, resolvedContext, result) {
    // Wrapper for sessionManager.persist with validation
  }

  async upsertProviderResponse(sessionId, aiTurnId, providerId, responseType, responseIndex, payload) {
    // Delegate to sessionManager
  }
}
5. TurnEmitter (handles turn finalization messages)
javascript// src/core/execution/TurnEmitter.js
export class TurnEmitter {
  constructor(port) {
    this.port = port;
  }

  emitTurnCreated(sessionId, userTurnId, aiTurnId, providers, synthesisProvider, mappingProvider) {
    // Extract TURN_CREATED logic
  }

  emitTurnFinalized(context, steps, stepResults, resolvedContext) {
    // Extract _emitTurnFinalized logic
  }

  emitWorkflowProgress(sessionId, aiTurnId, phase, providerStatuses) {
    // Extract progress emission
  }
}
6. CognitivePipelineHandler (handles cognitive mode logic)
javascript// src/core/execution/CognitivePipelineHandler.js
export class CognitivePipelineHandler {
  constructor(port, persistenceCoordinator) {
    this.port = port;
    this.persistenceCoordinator = persistenceCoordinator;
  }

  async handleCognitiveHalt(context, stepResults, steps, resolvedContext) {
    // Extract cognitive halt logic (lines 808-840)
  }

  async handleContinueRequest(payload, stepExecutor) {
    // Extract handleContinueCognitiveRequest
  }

  computeExplore(userMessage, mapperArtifact) {
    // Wrapper for computeExplore
  }
}
7. Refactored WorkflowEngine (orchestration only)
javascript// src/core/workflow-engine.js - REFACTORED
export class WorkflowEngine {
  constructor(orchestrator, sessionManager, port, options = {}) {
    this.orchestrator = orchestrator;
    this.sessionManager = sessionManager;
    this.port = port;

    // Inject specialized services
    this.stepExecutor = new StepExecutor(
      orchestrator,
      options.promptService || new PromptService(),
      options.responseProcessor || new ResponseProcessor()
    );
    
    this.streamingManager = new StreamingManager(port);
    this.contextManager = new ContextManager(sessionManager);
    this.persistenceCoordinator = new PersistenceCoordinator(sessionManager);
    this.turnEmitter = new TurnEmitter(port);
    this.cognitiveHandler = new CognitivePipelineHandler(port, this.persistenceCoordinator);
    
    this.healthTracker = getHealthTracker();
  }

  async execute(request, resolvedContext) {
    const { context, steps } = request;
    const stepResults = new Map();
    const workflowContexts = {};

    // Cache user message
    this.currentUserMessage = context?.userMessage || request?.context?.userMessage || "";

    // Validate user message
    if (!this.currentUserMessage || this.currentUserMessage.trim() === "") {
      console.error('[WorkflowEngine] CRITICAL: execute() with empty userMessage!');
      return;
    }

    try {
      // Check cognitive pipeline feature flag
      context.useCognitivePipeline = await this._checkCognitivePipeline();

      // Seed contexts for extend/recompute
      this._seedContexts(resolvedContext, stepResults, workflowContexts);

      // Execute steps in phases
      await this._executeBatchPhase(steps, context, stepResults, resolvedContext);
      await this._executeMappingPhase(steps, context, stepResults, workflowContexts, resolvedContext);

      // Check for cognitive halt
      if (context.useCognitivePipeline) {
        const shouldHalt = await this.cognitiveHandler.handleCognitiveHalt(
          context,
          stepResults,
          steps,
          resolvedContext
        );
        if (shouldHalt) return;
      }

      // Continue with remaining phases
      await this._executeSynthesisPhase(steps, context, stepResults, workflowContexts, resolvedContext);
      await this._executeRefinerPhase(steps, context, stepResults, resolvedContext);
      await this._executeAntagonistPhase(steps, context, stepResults, resolvedContext);

      // Persist and finalize
      await this._persistAndFinalize(request, context, steps, stepResults, resolvedContext);

    } catch (error) {
      console.error('[WorkflowEngine] Workflow failed:', error);
      this._handleWorkflowError(error, context, resolvedContext);
    } finally {
      this.streamingManager.clearCache(context.sessionId);
    }
  }

  async _executeBatchPhase(steps, context, stepResults, resolvedContext) {
    const promptSteps = steps.filter(s => s.type === "prompt");
    for (const step of promptSteps) {
      try {
        const result = await this.stepExecutor.executePromptStep(step, context, {
          sessionManager: this.sessionManager,
          streamingManager: this.streamingManager,
          turnEmitter: this.turnEmitter,
        });
        stepResults.set(step.stepId, { status: "completed", result });
        this._emitStepUpdate(step, context, result, resolvedContext);
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
          }
        );
        stepResults.set(step.stepId, { status: "completed", result });
        this._emitStepUpdate(step, context, result, resolvedContext);
      } catch (error) {
        this._handleStepError(step, error, context, stepResults, resolvedContext);
      }
    }
  }

  // ... similar phase methods for synthesis, refiner, antagonist

  async _persistAndFinalize(request, context, steps, stepResults, resolvedContext) {
    const persistResult = this.persistenceCoordinator.buildPersistenceResult(steps, stepResults);
    
    await this.persistenceCoordinator.persistWorkflowResult(
      {
        type: resolvedContext?.type || "initialize",
        sessionId: context.sessionId,
        userMessage: this.currentUserMessage,
        canonicalUserTurnId: context?.canonicalUserTurnId,
        canonicalAiTurnId: context?.canonicalAiTurnId,
      },
      resolvedContext,
      persistResult
    );

    this.turnEmitter.emitTurnFinalized(context, steps, stepResults, resolvedContext);
    this.port.postMessage({
      type: "WORKFLOW_COMPLETE",
      sessionId: context.sessionId,
      finalResults: Object.fromEntries(stepResults),
    });
  }

  _handleStepError(step, error, context, stepResults, resolvedContext) {
    console.error(`[WorkflowEngine] Step ${step.stepId} failed:`, error);
    stepResults.set(step.stepId, { status: "failed", error: error.message });
    this._emitStepUpdate(step, context, { error: error.message }, resolvedContext, "failed");
  }

  async handleRetryRequest(message) {
    // Delegate to healthTracker
  }

  async handleContinueCognitiveRequest(payload) {
    return this.cognitiveHandler.handleContinueRequest(payload, this.stepExecutor);
  }
}
Benefits of This Refactoring

Single Responsibility: Each class has one clear purpose
Testability: Easy to unit test individual components
Maintainability: Changes to streaming logic don't affect persistence
Reusability: Components can be used independently
Readability: ~200 lines per file instead of 1500+
Dependency Injection: Easy to swap implementations
Parallel Development: Multiple devs can work on different services

Migration Strategy

Start with StreamingManager (low risk, self-contained)
Extract StepExecutor next (most code volume reduction)
Move ContextManager (medium complexity)
Extract PersistenceCoordinator (touches SessionManager)
Create CognitivePipelineHandler (newest feature, easiest to isolate)
Refactor TurnEmitter last (touches UI contract)