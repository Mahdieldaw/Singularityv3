errors

src/core/execution/CognitivePipelineHandler.js:3:41 - error TS2307: Cannot find module '../../shared/parsing-utils' or its corresponding type declarations.

3 import { parseV1MapperToArtifact } from '../../shared/parsing-utils';
                                          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/core/execution/StepExecutor.js:2:35 - error TS2307: Cannot find module '../../shared/artifact-processor' or its corresponding type declarations.

2 import { ArtifactProcessor } from '../../shared/artifact-processor';
                                    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/core/execution/StepExecutor.js:3:33 - error TS2307: Cannot find module '../../shared/provider-limits' or its corresponding type declarations.

3 import { PROVIDER_LIMITS } from '../../shared/provider-limits';
                                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/core/execution/StepExecutor.js:4:177 - error TS2307: Cannot find module '../../shared/parsing-utils' or its corresponding type declarations.

4 import { formatArtifactAsOptions, parseMapperArtifact, parseExploreOutput, parseGauntletOutput, parseUnderstandOutput, parseUnifiedMapperOutput, parseV1MapperToArtifact } from '../../shared/parsing-utils';
                                                                                                                                                                                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/core/execution/StepExecutor.js:5:25 - error TS2305: Module '"../error-classifier.js"' has no exported member 'isProviderAuthError'.

5 import { classifyError, isProviderAuthError, createMultiProviderAuthError } from '../error-classifier.js';
                          ~~~~~~~~~~~~~~~~~~~

src/core/execution/StepExecutor.js:5:46 - error TS2305: Module '"../error-classifier.js"' has no exported member 'createMultiProviderAuthError'.       

5 import { classifyError, isProviderAuthError, createMultiProviderAuthError } from '../error-classifier.js';
                                               ~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/core/execution/StreamingManager.js:3:12 - error TS6133: 'msg' is declared but its value is never read.

3   stream: (msg, meta) => {
             ~~~

src/core/execution/StreamingManager.js:3:17 - error TS6133: 'meta' is declared but its value is never read.

3   stream: (msg, meta) => {
                  ~~~~

src/core/workflow-engine.js:177:11 - error TS6133: 'batchSuccess' is declared but its value is never read.

177       let batchSuccess = true;
              ~~~~~~~~~~~~



phase 2

No, That Optimization Was NOT Implemented
Looking at the proposed WorkflowEngine, it still has 7 separate phase methods:

JavaScript

await this._executeBatchPhase(...)
await this._executeMappingPhase(...)
await this._executeSynthesisPhase(...)
await this._executeRefinerPhase(...)
await this._executeAntagonistPhase(...)
await this._executeUnderstandPhase(...)
await this._executeGauntletPhase(...)
Each one follows the same pattern:

JavaScript

async _execute[Type]Phase(steps, context, stepResults, resolvedContext) {
    const typeSteps = steps.filter(s => s.type === "[type]");
    for (const step of typeSteps) {
      try {
        const result = await this.stepExecutor.execute[Type]Step(...);
        stepResults.set(step.stepId, { status: "completed", result });
        this._emitStepUpdate(...);
        // Upsert...
      } catch (error) {
        this._handleStepError(...);
      }
    }
}
This is ~200 lines of repetitive code that could be ~50 lines.

Here's the Optimized Version
JavaScript

export class WorkflowEngine {
  constructor(orchestrator, sessionManager, port, options = {}) {
    // ... existing constructor code ...

    // Executor mapping
    this._executors = {
      prompt: (step, ctx, opts) => this.stepExecutor.executePromptStep(step, ctx, opts),
      mapping: (step, ctx, results, wfCtx, resolved, opts) => 
        this.stepExecutor.executeMappingStep(step, ctx, results, wfCtx, resolved, opts),
      synthesis: (step, ctx, results, wfCtx, resolved, opts) => 
        this.stepExecutor.executeSynthesisStep(step, ctx, results, wfCtx, resolved, opts),
      refiner: (step, ctx, results, opts) => 
        this.stepExecutor.executeRefinerStep(step, ctx, results, opts),
      antagonist: (step, ctx, results, opts) => 
        this.stepExecutor.executeAntagonistStep(step, ctx, results, opts),
      understand: (step, ctx, results, opts) => 
        this.stepExecutor.executeUnderstandStep(step, ctx, results, opts),
      gauntlet: (step, ctx, results, opts) => 
        this.stepExecutor.executeGauntletStep(step, ctx, results, opts),
    };

    // Provider key mapping for upsert
    this._providerKeys = {
      prompt: null, // Batch has multiple providers, handled specially
      mapping: 'mappingProvider',
      synthesis: 'synthesisProvider',
      refiner: 'refinerProvider',
      antagonist: 'antagonistProvider',
      understand: 'understandProvider',
      gauntlet: 'gauntletProvider',
    };
  }

  async execute(request, resolvedContext) {
    const { context, steps } = request;
    const stepResults = new Map();
    const workflowContexts = {};

    // ... existing validation and setup ...

    try {
      const mode = request.mode || "auto";
      const useCognitivePipeline = ["auto", "understand", "decide"].includes(mode);
      context.useCognitivePipeline = useCognitivePipeline;
      context.mode = mode;

      this._seedContexts(resolvedContext, stepResults, workflowContexts);
      this._hydrateV1Artifacts(context, resolvedContext);

      // ✅ SINGLE LOOP - Steps are already ordered by WorkflowCompiler
      for (const step of steps) {
        // Skip check for consensus-gated steps
        if (this._shouldSkipStep(step, context)) {
          console.log(`[WorkflowEngine] Skipping ${step.type} step (consensus gate)`);
          continue;
        }

        // Execute the step
        const result = await this._executeStep(
          step, context, stepResults, workflowContexts, resolvedContext
        );

        // Check for halt conditions
        const haltReason = await this._checkHaltConditions(
          step, result, request, context, steps, stepResults, resolvedContext, useCognitivePipeline
        );
        
        if (haltReason) {
          await this._haltWorkflow(request, context, steps, stepResults, resolvedContext, haltReason);
          return;
        }

        // Post-step hooks (consensus gate after mapping)
        this._postStepHooks(step, context, stepResults);
      }

      // All steps completed successfully
      await this._persistAndFinalize(request, context, steps, stepResults, resolvedContext);

    } catch (error) {
      console.error(`[WorkflowEngine] Critical workflow execution error:`, error);
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

  // ═══════════════════════════════════════════════════════════════════════════
  // UNIFIED STEP EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  async _executeStep(step, context, stepResults, workflowContexts, resolvedContext) {
    const executor = this._executors[step.type];
    if (!executor) {
      throw new Error(`Unknown step type: ${step.type}`);
    }

    const options = this._buildOptionsForStep(step.type);

    try {
      // Execute
      const result = await executor(step, context, stepResults, workflowContexts, resolvedContext, options);

      // Update state
      stepResults.set(step.stepId, { status: "completed", result });
      this._emitStepUpdate(step, context, result, resolvedContext, "completed");

      // Cache workflow contexts from batch results
      if (step.type === 'prompt' && result?.results) {
        Object.entries(result.results).forEach(([pid, data]) => {
          if (data?.meta && Object.keys(data.meta).length > 0) {
            workflowContexts[pid] = data.meta;
          }
        });
      }

      // Persist response (non-recompute)
      await this._persistStepResponse(step, context, result, resolvedContext);

      return result;

    } catch (error) {
      stepResults.set(step.stepId, { status: "failed", error: error.message });
      this._emitStepUpdate(step, context, { error: error.message }, resolvedContext, "failed");
      throw error; // Re-throw for halt handling
    }
  }

  _buildOptionsForStep(stepType) {
    const baseOptions = {
      streamingManager: this.streamingManager,
      persistenceCoordinator: this.persistenceCoordinator,
      sessionManager: this.sessionManager,
    };

    if (['mapping', 'synthesis'].includes(stepType)) {
      baseOptions.contextManager = this.contextManager;
    }
    if (['refiner', 'antagonist'].includes(stepType)) {
      baseOptions.responseProcessor = this.responseProcessor;
    }

    return baseOptions;
  }

  async _persistStepResponse(step, context, result, resolvedContext) {
    if (resolvedContext?.type === "recompute") return;
    if (step.type === 'prompt') return; // Batch handled differently

    const providerKey = this._providerKeys[step.type];
    if (!providerKey) return;

    const aiTurnId = context?.canonicalAiTurnId;
    const providerId = step?.payload?.[providerKey];

    if (aiTurnId && providerId) {
      try {
        await this.persistenceCoordinator.upsertProviderResponse(
          context.sessionId,
          aiTurnId,
          providerId,
          step.type === 'prompt' ? 'batch' : step.type,
          0,
          {
            text: result?.text || "",
            status: result?.status || "completed",
            meta: result?.meta || {},
          }
        );
      } catch (_) {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL FLOW
  // ═══════════════════════════════════════════════════════════════════════════

  _shouldSkipStep(step, context) {
    const consensusOnly = !!context?.workflowControl?.consensusOnly;
    if (consensusOnly && ['refiner', 'antagonist'].includes(step.type)) {
      return true;
    }
    return false;
  }

  async _checkHaltConditions(step, result, request, context, steps, stepResults, resolvedContext, useCognitivePipeline) {
    // After batch: check for insufficient witnesses
    if (step.type === 'prompt') {
      const resultsObj = result?.results || {};
      const successfulCount = Object.values(resultsObj).filter(r => r.status === 'completed').length;
      if (resolvedContext?.type !== 'recompute' && successfulCount < 2) {
        return "insufficient_witnesses";
      }
    }

    // After mapping: check for cognitive halt
    if (step.type === 'mapping' && useCognitivePipeline) {
      const shouldHalt = await this.cognitiveHandler.handleCognitiveHalt(
        request, context, steps, stepResults, resolvedContext, this.currentUserMessage
      );
      if (shouldHalt) {
        this.turnEmitter.emitTurnFinalized(context, steps, stepResults, resolvedContext, this.currentUserMessage);
        return "cognitive_halt"; // Special: already finalized
      }
    }

    return null; // No halt
  }

  _postStepHooks(step, context, stepResults) {
    // Compute consensus gate after mapping
    if (step.type === 'mapping') {
      const mappingSteps = [step]; // Current step
      const consensusGate = computeConsensusGateFromMapping({ stepResults, mappingSteps });
      if (consensusGate) {
        context.workflowControl = consensusGate;
      }
    }
  }

  async _haltWorkflow(request, context, steps, stepResults, resolvedContext, haltReason) {
    if (haltReason === "cognitive_halt") {
      // Already handled by cognitiveHandler
      return;
    }

    await this._persistAndFinalize(request, context, steps, stepResults, resolvedContext);
    
    this.port.postMessage({
      type: "WORKFLOW_COMPLETE",
      sessionId: context.sessionId,
      workflowId: request.workflowId,
      finalResults: Object.fromEntries(stepResults),
      haltReason,
    });
  }

  // ... keep existing helpers: _seedContexts, _hydrateV1Artifacts, _persistAndFinalize, 
  //     handleRetryRequest, handleContinueCognitiveRequest ...
}