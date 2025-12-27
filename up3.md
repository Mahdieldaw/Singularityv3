The problem is that your flag check happens too late—after shared setup code has already run. Here's what's likely happening:

JavaScript

// PROBLEMATIC PATTERN
async execute(workflowRequest, resolvedContext) {
  // Batch executes (shared, fine)
  await this.executeBatchSteps(...);
  
  // ❌ Context summary building runs for BOTH flows
  const contextSummary = this._buildContextForNextTurn(...);
  
  // ❌ MapperV1 step might run even in V2 flow
  await this.executeMappingStep(...);
  
  // Flag check happens too late
  if (context.useCognitivePipeline) {
    // By now, wrong things have already happened
  }
}
Recommended Architecture: Clean Fork After Batch
text

                    ┌─────────────────────┐
                    │   Batch Fan-Out     │  ← Shared
                    │   (Parallel Query)  │
                    └──────────┬──────────┘
                               │
                   ┌───────────┴───────────┐
                   │  useCognitivePipeline │
                   └───────────┬───────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │ FALSE            │                  │ TRUE
            ▼                  │                  ▼
    ┌───────────────┐          │          ┌───────────────┐
    │   MapperV1    │          │          │   MapperV2    │
    │ (narrative +  │          │          │ (artifact:    │
    │  options +    │          │          │  consensus,   │
    │  graph)       │          │          │  outliers,    │
    └───────┬───────┘          │          │  topology)    │
            │                  │          └───────┬───────┘
            ▼                  │                  │
    ┌───────────────┐          │                  ▼
    │   Synthesis   │          │          ┌───────────────┐
    │ (frame-find)  │          │          │ computeExplore│
    └───────┬───────┘          │          │ (no LLM call) │
            │                  │          └───────┬───────┘
            ▼                  │                  │
    ┌───────────────┐          │                  ▼
    │    Refiner    │          │          ┌───────────────┐
    │ (outlier      │          │          │     HALT      │
    │  extraction)  │          │          │ (emit artifact│
    └───────┬───────┘          │          │  + analysis)  │
            │                  │          └───────┬───────┘
            ▼                  │                  │
    ┌───────────────┐          │          ┌───────┴───────┐
    │  Antagonist   │          │          │ User Chooses  │
    │ (non-blocking │          │          └───────┬───────┘
    │  context      │          │                  │
    │  elicitation) │          │     ┌────────────┼────────────┐
    └───────┬───────┘          │     │            │            │
            │                  │  Explore    Understand    Decide
            ▼                  │  (already    (LLM call)  (LLM call)
    ┌───────────────┐          │  computed)
    │ Build Context │          │
    │ Bridge for    │          │
    │ Next Turn     │          │
    └───────────────┘          │
Implementation: Workflow Engine Restructure
JavaScript

// src/core/workflow-engine.js

async execute(workflowRequest, resolvedContext) {
  const { context, steps } = workflowRequest;
  const stepResults = new Map();

  // ═══════════════════════════════════════════════════════════
  // PHASE 1: BATCH (Shared between both pipelines)
  // ═══════════════════════════════════════════════════════════
  for (const step of steps.filter(s => s.type === 'prompt')) {
    const result = await this.executePromptStep(step, context);
    stepResults.set(step.stepId, { status: 'completed', result });
    
    this.port.postMessage({
      type: 'WORKFLOW_STEP_UPDATE',
      sessionId: context.sessionId,
      stepId: step.stepId,
      status: 'completed',
      result
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PHASE 2: FORK - Pipeline diverges here
  // ═══════════════════════════════════════════════════════════
  if (context.useCognitivePipeline) {
    return this._executeCognitivePipeline(context, steps, stepResults, resolvedContext);
  } else {
    return this._executeLegacyPipeline(context, steps, stepResults, resolvedContext);
  }
}

// ═══════════════════════════════════════════════════════════════
// COGNITIVE PIPELINE (V3): MapperV2 → Halt → User Choice
// ═══════════════════════════════════════════════════════════════
async _executeCognitivePipeline(context, steps, stepResults, resolvedContext) {
  
  // Step 1: MapperV2 (structured artifact extraction)
  const mapperStep = steps.find(s => s.type === 'mapping');
  if (mapperStep) {
    const mapperResult = await this._executeMapperV2Step(mapperStep, context, stepResults);
    stepResults.set(mapperStep.stepId, { status: 'completed', result: mapperResult });
    
    // Parse into structured artifact
    const mapperArtifact = mapperResult.mapperArtifact;
    
    if (mapperArtifact) {
      // Step 2: Compute Explore analysis (pure compute, no LLM)
      const exploreAnalysis = computeExplore(context.userMessage || '', mapperArtifact);
      
      // Step 3: HALT - Emit artifact ready, let user choose lens
      this.port.postMessage({
        type: 'MAPPER_ARTIFACT_READY',
        sessionId: context.sessionId,
        aiTurnId: context.canonicalAiTurnId,
        artifact: mapperArtifact,
        analysis: exploreAnalysis,
      });
    }
  }

  // Persist turn (without context bridge - that's legacy only)
  await this._persistTurn(context, stepResults, resolvedContext);
  
  // Emit finalized
  this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
  this.port.postMessage({ type: 'WORKFLOW_COMPLETE', sessionId: context.sessionId });
  
  // HALT: Do not proceed further. Wait for CONTINUE_COGNITIVE_WORKFLOW message.
  return;
}

// ═══════════════════════════════════════════════════════════════
// LEGACY PIPELINE (V1/V2): MapperV1 → Synthesis → Refiner → Antagonist
// ═══════════════════════════════════════════════════════════════
async _executeLegacyPipeline(context, steps, stepResults, resolvedContext) {
  
  // Step 1: MapperV1 (narrative + options + graph topology)
  for (const step of steps.filter(s => s.type === 'mapping')) {
    const result = await this._executeMapperV1Step(step, context, stepResults);
    stepResults.set(step.stepId, { status: 'completed', result });
    
    this.port.postMessage({
      type: 'WORKFLOW_STEP_UPDATE',
      sessionId: context.sessionId,
      stepId: step.stepId,
      status: 'completed',
      result
    });
  }

  // Step 2: Synthesis (frame-finding)
  for (const step of steps.filter(s => s.type === 'synthesis')) {
    const result = await this.executeSynthesisStep(step, context, stepResults);
    stepResults.set(step.stepId, { status: 'completed', result });
    
    this.port.postMessage({
      type: 'WORKFLOW_STEP_UPDATE',
      sessionId: context.sessionId,
      stepId: step.stepId,
      status: 'completed',
      result
    });
  }

  // Step 3: Refiner (outlier extraction) - if enabled
  for (const step of steps.filter(s => s.type === 'refiner')) {
    const result = await this.executeRefinerStep(step, context, stepResults);
    stepResults.set(step.stepId, { status: 'completed', result });
    
    this.port.postMessage({
      type: 'WORKFLOW_STEP_UPDATE',
      sessionId: context.sessionId,
      stepId: step.stepId,
      status: 'completed',
      result
    });
  }

  // Step 4: Antagonist (non-blocking context elicitation) - if enabled
  const antagonistSteps = steps.filter(s => s.type === 'antagonist');
  if (antagonistSteps.length > 0) {
    // Fire and forget - don't await
    this._executeAntagonistStepNonBlocking(antagonistSteps[0], context, stepResults);
  }

  // Step 5: Build context bridge for next turn (LEGACY ONLY)
  const contextBridge = this._buildContextBridge(stepResults);
  
  // Persist with context bridge
  await this._persistTurn(context, stepResults, resolvedContext, contextBridge);
  
  // Emit finalized
  this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
  this.port.postMessage({ type: 'WORKFLOW_COMPLETE', sessionId: context.sessionId });
}

// ═══════════════════════════════════════════════════════════════
// HELPER: MapperV2 (Cognitive Pipeline)
// ═══════════════════════════════════════════════════════════════
async _executeMapperV2Step(step, context, stepResults) {
  const batchResults = this._extractBatchResults(stepResults);
  
  const prompt = this.promptService.buildMapperV2Prompt(
    context.userMessage,
    batchResults
  );
  
  const response = await this._executeProviderCall(
    step.payload.mappingProvider,
    prompt,
    context,
    step.stepId
  );
  
  // Parse structured MapperArtifact from response
  const mapperArtifact = parseMapperArtifact(response.text);
  
  return {
    providerId: step.payload.mappingProvider,
    text: response.text,
    status: 'completed',
    meta: response.meta,
    mapperArtifact
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPER: MapperV1 (Legacy Pipeline)
// ═══════════════════════════════════════════════════════════════
async _executeMapperV1Step(step, context, stepResults) {
  // Uses buildMappingPrompt - the legacy prompt with narrative + options + graph
  return this.executeMappingStep(step, context, stepResults);
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Build context bridge (LEGACY ONLY)
// ═══════════════════════════════════════════════════════════════
_buildContextBridge(stepResults) {
  let synthesisShortAnswer = null;
  let mapperNarrative = null;
  
  for (const [stepId, data] of stepResults) {
    if (stepId.startsWith('synthesis-') && data.result?.text) {
      synthesisShortAnswer = extractShortAnswer(data.result.text);
    }
    if (stepId.startsWith('mapping-') && data.result?.text) {
      mapperNarrative = extractNarrative(data.result.text);
    }
  }
  
  return { synthesisShortAnswer, mapperNarrative };
}
Connection Handler: Continuation for Cognitive Pipeline
JavaScript

// src/core/connection-handler.js

async _handleContinueCognitiveWorkflow(message) {
  const { sessionId, aiTurnId, mode, artifact, analysis } = message.payload;
  
  // Validate we're in cognitive pipeline mode
  if (!this.cognitivePipelineState?.get(sessionId)) {
    throw new Error('No cognitive pipeline in progress for this session');
  }
  
  const context = {
    sessionId,
    canonicalAiTurnId: aiTurnId,
  };
  
  if (mode === 'explore') {
    // Explore is already computed - just acknowledge
    // The UI already has the analysis from MAPPER_ARTIFACT_READY
    this.port.postMessage({
      type: 'COGNITIVE_MODE_COMPLETE',
      sessionId,
      aiTurnId,
      mode: 'explore',
      // No additional data needed - UI already has it
    });
    
  } else if (mode === 'understand') {
    // Execute Understand step (frame-finding synthesis)
    const understandResult = await this.workflowEngine.executeUnderstandStep(
      context,
      artifact,
      analysis
    );
    
    this.port.postMessage({
      type: 'WORKFLOW_STEP_UPDATE',
      sessionId,
      stepId: `understand-${aiTurnId}`,
      status: 'completed',
      result: {
        providerId: understandResult.providerId,
        text: understandResult.text,
        meta: { understandOutput: understandResult.understandOutput }
      }
    });
    
  } else if (mode === 'decide') {
    // Execute Gauntlet step (stress-test and elimination)
    const gauntletResult = await this.workflowEngine.executeGauntletStep(
      context,
      artifact
    );
    
    this.port.postMessage({
      type: 'WORKFLOW_STEP_UPDATE',
      sessionId,
      stepId: `gauntlet-${aiTurnId}`,
      status: 'completed',
      result: {
        providerId: gauntletResult.providerId,
        text: gauntletResult.text,
        meta: { gauntletOutput: gauntletResult.gauntletOutput }
      }
    });
  }
}
Compiler: Generate Different Steps Based on Mode
JavaScript

// src/core/workflow-compiler.js

compile(request, resolvedContext) {
  const steps = [];
  
  // Batch step (always)
  steps.push({
    stepId: `batch-${Date.now()}`,
    type: 'prompt',
    payload: {
      prompt: request.userMessage,
      providers: request.providers,
      providerContexts: resolvedContext.providerContexts,
      useThinking: request.useThinking
    }
  });
  
  if (request.mode && ['explore', 'understand', 'decide'].includes(request.mode)) {
    // ═══════════════════════════════════════════════════════════
    // COGNITIVE PIPELINE: Only MapperV2 step
    // ═══════════════════════════════════════════════════════════
    if (request.mapper) {
      steps.push({
        stepId: `mapping-v2-${request.mapper}-${Date.now()}`,
        type: 'mapping',
        payload: {
          mappingProvider: request.mapper,
          version: 2,  // Flag for V2 mapper prompt
          sourceStepIds: [steps[0].stepId],
          originalPrompt: request.userMessage,
          useThinking: request.useThinking
        }
      });
    }
    
  } else {
    // ═══════════════════════════════════════════════════════════
    // LEGACY PIPELINE: MapperV1 → Synthesis → Refiner → Antagonist
    // ═══════════════════════════════════════════════════════════
    
    // MapperV1
    if (request.includeMapping && request.mapper) {
      steps.push({
        stepId: `mapping-${request.mapper}-${Date.now()}`,
        type: 'mapping',
        payload: {
          mappingProvider: request.mapper,
          version: 1,  // Flag for V1 mapper prompt
          sourceStepIds: [steps[0].stepId],
          originalPrompt: request.userMessage,
          useThinking: request.useThinking
        }
      });
    }
    
    // Synthesis
    if (request.includeSynthesis && request.synthesizer) {
      steps.push({
        stepId: `synthesis-${request.synthesizer}-${Date.now()}`,
        type: 'synthesis',
        payload: { /* ... */ }
      });
    }
    
    // Refiner
    if (request.includeRefiner && request.refiner) {
      steps.push({
        stepId: `refiner-${request.refiner}-${Date.now()}`,
        type: 'refiner',
        payload: { /* ... */ }
      });
    }
    
    // Antagonist
    if (request.includeAntagonist && request.antagonist) {
      steps.push({
        stepId: `antagonist-${request.antagonist}-${Date.now()}`,
        type: 'antagonist',
        payload: { /* ... */ }
      });
    }
  }
  
  return {
    workflowId: `wf-${Date.now()}`,
    context: {
      sessionId: request.sessionId,
      useCognitivePipeline: !!request.mode && ['explore', 'understand', 'decide'].includes(request.mode),
      // ... other context
    },
    steps
  };
}
UI State: Per-Turn Cognitive Mode Tracking
Your current atoms look correct, but ensure they're used properly:

TypeScript

// ui/state/atoms.ts

// Global flag: which pipeline to use for NEW turns
export const useCognitivePipelineAtom = atomWithStorage<boolean>(
  "htos_cognitive_pipeline",
  true  // Default to V3
);

// Per-turn view state: what lens is being viewed for a specific turn
export const cognitiveModeMapAtom = atomWithImmer<Record<string, CognitiveViewMode>>({});

// atom family for individual turn access
export const turnCognitiveModeFamily = atomFamily(
  (turnId: string) =>
    atom(
      (get) => get(cognitiveModeMapAtom)[turnId] || "artifact",  // Default to artifact showcase
      (get, set, newMode: CognitiveViewMode) => {
        set(cognitiveModeMapAtom, (draft) => {
          draft[turnId] = newMode;
        });
      }
    ),
  (a, b) => a === b
);
