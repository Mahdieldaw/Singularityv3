## Oh. You're migrating TO cognitive pipeline, not FROM it.

Let me re-trace what's actually happening:

---

## Current State (What You've Actually Built)

### Active Pipeline: Cognitive (Mapper V2 → Understand/Decide → Refiner → Antagonist)
```
execute()
  → _executeStep('batch')
  → _executeStep('mapping')  // Mapper V2 produces artifact
  → _checkHaltConditions()
    → cognitiveHandler.handleCognitiveHalt()
      → Emits MAPPER_ARTIFACT_READY
      → PAUSES for user mode selection
      
[User selects Understand or Decide]

handleContinueCognitiveRequest(mode: 'understand' | 'gauntlet')
  → cognitiveHandler.handleContinueRequest()
    → executeUnderstandStep() OR executeGauntletStep()
    → [Optional] executeRefinerStep()
    → [Optional] executeAntagonistStep()
    → Emits TURN_FINALIZED
```

### Legacy Pipeline: Non-Cognitive (Mapper V1 → Synthesis → Refiner → Antagonist)
```
execute()
  → _executeStep('batch')
  → _executeStep('mapping')  // Still generates V1 text
  → _executeStep('synthesis')  // DEPRECATED
  → _executeStep('refiner')   // DEPRECATED (runs on synthesis output)
  → _executeStep('antagonist') // DEPRECATED (runs on synthesis output)
  → _persistAndFinalize()
```

---

## So the Redundancy Is...

**You have a legacy pipeline still executable but functionally deprecated.**

The redundancy isn't between cognitive/non-cognitive **anymore** - it's between:
1. **The new system** (cognitive pipeline with proper artifact flow)
2. **Ghost code** (old synthesis-based flow that shouldn't run)

---

## What Needs To Happen

### 1. Remove Legacy Steps from WorkflowCompiler

**In WorkflowCompiler (wherever it generates steps):**

```javascript
// OLD (generates both paths)
if (mode === 'auto') {
  steps.push(
    { type: 'batch', ... },
    { type: 'mapping', ... },
    { type: 'synthesis', ... },  // ❌ DELETE
    { type: 'refiner', ... },    // ❌ DELETE (synthesis-based)
    { type: 'antagonist', ... }  // ❌ DELETE (synthesis-based)
  );
}

// NEW (cognitive only)
if (mode === 'auto') {
  steps.push(
    { type: 'batch', ... },
    { type: 'mapping', ... }
    // Stop here - cognitive pipeline takes over after mapping
  );
}
```

**Cognitive continuation happens via `handleContinueCognitiveRequest`, not main loop.**

---

### 2. The Actual Architecture (What You Meant To Build)

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 1: Foundation (Automatic)                             │
├─────────────────────────────────────────────────────────────┤
│ execute()                                                   │
│   → Batch (6 models in parallel)                            │
│   → Mapping (Mapper V2 → artifact)                          │
│   → PAUSE (emit MAPPER_ARTIFACT_READY)                      │
└─────────────────────────────────────────────────────────────┘
                           ↓
              [User Reviews Artifact in UI]
              [User Selects: Understand or Decide]
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ PHASE 2: Synthesis (User-Driven)                            │
├─────────────────────────────────────────────────────────────┤
│ handleContinueCognitiveRequest(mode)                        │
│   → Understand OR Decide (consumes artifact)                │
│   → [Optional] Refiner (challenges synthesis)               │
│   → [Optional] Antagonist (stress-tests synthesis)          │
│   → FINALIZE (emit TURN_FINALIZED)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Why Redundancy Still Exists

**Because the main `execute()` loop still has synthesis/refiner/antagonist step executors registered:**

```javascript
// In WorkflowEngine constructor
this._executors = {
  prompt: ...,
  mapping: ...,
  synthesis: ...,     // ❌ LEGACY - Never called in cognitive flow
  refiner: ...,       // ❌ LEGACY - handleContinueRequest calls this directly
  antagonist: ...,    // ❌ LEGACY - handleContinueRequest calls this directly
  understand: ...,    // ❌ Never called from main loop
  gauntlet: ...,      // ❌ Never called from main loop
};
```

**These executors exist in the registry but:**
- `synthesis` is never in the steps array anymore (deprecated)
- `understand/gauntlet` are never in the steps array (called via handleContinueRequest)
- `refiner/antagonist` ARE in steps array for legacy mode, but also called directly in cognitive mode

---

## The Clean Architecture

### Remove Dead Code

```javascript
// WorkflowEngine._executors - COGNITIVE ONLY
this._executors = {
  prompt: (step, ctx, _results, _wfCtx, _resolved, opts) => 
    this.stepExecutor.executePromptStep(step, ctx, opts),
  
  mapping: (step, ctx, results, wfCtx, resolved, opts) => 
    this.stepExecutor.executeMappingStep(step, ctx, results, wfCtx, resolved, opts),
  
  // ❌ DELETE: synthesis, understand, gauntlet, refiner, antagonist
  // These run via handleContinueCognitiveRequest, not main loop
};
```

### Clarify Step Execution Paths

```javascript
// Phase 1: Foundation (execute() handles)
const FOUNDATION_STEPS = ['prompt', 'mapping'];

// Phase 2: Cognitive (handleContinueRequest handles)
const COGNITIVE_STEPS = ['understand', 'gauntlet', 'refiner', 'antagonist'];
```

---

## Refactored Flow

### WorkflowEngine.execute() - Foundation Only

```javascript
async execute(request, resolvedContext) {
  const { context, steps } = request;
  const stepResults = new Map();

  // Validate we're only running foundation
  const invalidSteps = steps.filter(s => !['prompt', 'mapping'].includes(s.type));
  if (invalidSteps.length > 0) {
    throw new Error(`Foundation phase received cognitive steps: ${invalidSteps.map(s => s.type).join(', ')}`);
  }

  // Execute foundation
  for (const step of steps) {
    const result = await this._executeStep(step, context, stepResults, ...);
    
    // After mapping, halt for cognitive selection
    if (step.type === 'mapping' && context.useCognitivePipeline) {
      await this.cognitiveHandler.handleCognitiveHalt(...);
      return; // Actual halt
    }
  }
  
  // If we got here, no cognitive pipeline - just finalize
  await this._persistAndFinalize(...);
}
```

### CognitivePipelineHandler.handleContinueRequest() - Cognitive Only

```javascript
async handleContinueRequest(payload, stepExecutor, streamingManager, contextManager) {
  const { mode, aiTurnId } = payload;
  
  // Load context
  const context = await this._loadContext(aiTurnId);
  
  // Build cognitive steps
  const steps = this._buildCognitiveSteps(mode, context);
  
  // Execute sequentially
  for (const step of steps) {
    const result = await this._executeCognitiveStep(step, context, stepExecutor, streamingManager);
    
    // Persist immediately
    await this._persistCognitiveStep(step, context, result);
  }
  
  // Finalize
  await this._finalizeCognitiveTurn(context, steps);
}

_buildCognitiveSteps(mode, context) {
  const steps = [];
  
  // Primary synthesis
  steps.push({
    type: mode === 'understand' ? 'understand' : 'gauntlet',
    stepId: `${mode}-${Date.now()}`,
    payload: { /* ... */ }
  });
  
  // Optional enhancement
  if (context.enableRefiner) {
    steps.push({
      type: 'refiner',
      stepId: `refiner-${Date.now()}`,
      payload: { /* ... */ }
    });
  }
  
  if (context.enableAntagonist) {
    steps.push({
      type: 'antagonist',
      stepId: `antagonist-${Date.now()}`,
      payload: { /* ... */ }
    });
  }
  
  return steps;
}
```

---

