🔴 CRITICAL ISSUES (Functionality Loss)
1. Missing Synchronous Context Update in executePromptStep
Original:

JavaScript

// ✅ CRITICAL: Update in-memory cache SYNCHRONOUSLY
this.sessionManager.updateProviderContextsBatch(
  context.sessionId,
  batchUpdates,
  true, // continueThread
  { skipSave: true },
);

this._persistProviderContextsAsync(context.sessionId, batchUpdates);
New (StepExecutor.js):

JavaScript

// Update contexts async
options.persistenceCoordinator.persistProviderContextsAsync(context.sessionId, batchUpdates);
Impact: The original does BOTH synchronous in-memory update AND async persistence. The new version only does deferred update (via setTimeout(..., 0)). This can cause race conditions where subsequent steps (synthesis/mapping) don't have context available immediately.

Fix: Add synchronous update before async:

JavaScript

options.persistenceCoordinator.updateProviderContextsBatch(
  context.sessionId,
  batchUpdates,
  true,
  { skipSave: true }
);
options.persistenceCoordinator.persistProviderContextsAsync(context.sessionId, batchUpdates);
2. Missing Import: parseV1MapperToArtifact in StepExecutor
StepExecutor.js imports:

JavaScript

import { formatArtifactAsOptions, parseMapperArtifact, parseExploreOutput, parseGauntletOutput, parseUnderstandOutput, parseUnifiedMapperOutput } from '../../shared/parsing-utils';
But uses:

JavaScript

// In executeUnderstandStep and executeGauntletStep:
mapperArtifact = parseV1MapperToArtifact(payload.mappingText, {...});
Fix: Add to imports:

JavaScript

import { ..., parseV1MapperToArtifact } from '../../shared/parsing-utils';
3. Missing Fallback Logic in _resolveSourceData
Original has two fallbacks that are missing:

A) Provider responses table fallback:

JavaScript

// Original - after getting sourceArray:
if (sourceArray.length === 0 && this.sessionManager?.adapter?.isReady()) {
  const responses = await this.sessionManager.adapter.getResponsesByTurnId(aiTurn.id);
  // ... fallback to indexed provider_responses
}
B) Text matching fallback:

JavaScript

// Original:
const fallbackText = context?.userMessage || this.currentUserMessage || "";
if (fallbackText && ...) {
  const sessionTurns = await this.sessionManager.adapter.getTurnsBySessionId(context.sessionId);
  // ... match by text content
}
Impact: Historical recompute workflows may fail to find source data when it's stored in provider_responses table but not embedded in turn objects.

4. Reference to Non-existent Property in StepExecutor
In _resolveSourceData:

JavaScript

const fallbackText = context?.userMessage || this.currentUserMessage || "";
Issue: this.currentUserMessage doesn't exist on StepExecutor - it's only set on WorkflowEngine.

Fix: Remove the reference or pass it via options/context.

🟡 MEDIUM ISSUES (Behavioral Differences)
5. Missing Explore Phase Execution
The new WorkflowEngine.execute() has:

_executeBatchPhase ✅
_executeMappingPhase ✅
_executeSynthesisPhase ✅
_executeRefinerPhase ✅
_executeAntagonistPhase ✅
_executeUnderstandPhase ✅
_executeGauntletPhase ✅
_executeExplorePhase ❌ MISSING
However: Looking at the original, executeExploreStep exists but is never actually called in _executeCognitivePipeline or _executeClassicPipeline. So this might be intentional/dead code. But TurnEmitter does handle explore response type, so verify if explore is triggered elsewhere.

6. handleCognitiveHalt doesn't persist for mapping_artifact_missing case
Original:

JavaScript

// For mapping_artifact_missing:
try {
  if (resolvedContext?.type !== "recompute") {
    const persistResult = this._buildPersistenceResultFromStepResults(steps, stepResults);
    await this.sessionManager.persist(persistRequest, resolvedContext, persistResult);
  }
} catch (_) { }

this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
this.port.postMessage({ type: "WORKFLOW_COMPLETE", ... });
New (CognitivePipelineHandler):

JavaScript

try {
    await this.persistenceCoordinator.persistStepResult(resolvedContext, context, steps, stepResults, userMessageForExplore);
} catch (_) { }

this.port.postMessage({ type: "WORKFLOW_COMPLETE", ... });
// Turn finalization handled by caller
This looks OK since caller handles emitTurnFinalized, but verify persistStepResult implementation matches original flow.

🟢 MINOR ISSUES
7. Debug Logging Inconsistency
Each new file has its own wdbg function definition. The original uses a global one. Functionally equivalent but differs in that debug state isn't shared.

8. Redundant Parameter Passing
responseProcessor is passed both in StepExecutor constructor AND in options for executeRefinerStep/executeAntagonistStep. Not a bug, but redundant.

✅ VERIFIED CORRECT
computeConsensusGateFromMapping - Identical
normalizeCitationId / normalizeSupporterProviderIds - Identical
StreamingManager delta logic - Equivalent (with added getRecoveredText helper)
ContextManager resolution - Equivalent
TurnEmitter finalization - Equivalent
handleRetryRequest - Identical
handleContinueCognitiveRequest delegation - Correct
📋 RECOMMENDED FIXES
JavaScript

// 1. StepExecutor.js - Add missing import
import { 
  formatArtifactAsOptions, 
  parseMapperArtifact, 
  parseExploreOutput, 
  parseGauntletOutput, 
  parseUnderstandOutput, 
  parseUnifiedMapperOutput,
  parseV1MapperToArtifact  // ADD THIS
} from '../../shared/parsing-utils';

// 2. StepExecutor.executePromptStep - Add synchronous update
onAllComplete: (results, errors) => {
  const batchUpdates = {};
  results.forEach((res, pid) => { batchUpdates[pid] = res; });
  
  // ✅ ADD: Synchronous in-memory update
  options.sessionManager.updateProviderContextsBatch(
    context.sessionId,
    batchUpdates,
    true,
    { skipSave: true }
  );
  
  // Then async persistence
  options.persistenceCoordinator.persistProviderContextsAsync(context.sessionId, batchUpdates);
  // ...rest of handler
}

// 3. StepExecutor._resolveSourceData - Add fallback logic
// After building sourceArray from latestMap:
if (sourceArray.length === 0 && sessionManager?.adapter?.isReady?.()) {
  try {
    const responses = await sessionManager.adapter.getResponsesByTurnId(aiTurn.id);
    const respType = responseType || "batch";
    const dbLatestMap = new Map();
    
    (responses || [])
      .filter(r => r?.responseType === respType && r.text?.trim())
      .forEach(r => {
        const existing = dbLatestMap.get(r.providerId);
        if (!existing || (r.responseIndex || 0) >= (existing.responseIndex || 0)) {
          dbLatestMap.set(r.providerId, r);
        }
      });
    
    sourceArray = Array.from(dbLatestMap.values()).map(r => ({
      providerId: r.providerId,
      text: r.text
    }));
  } catch (e) {
    console.warn("[StepExecutor] provider_responses fallback failed:", e);
  }
}

// 4. Remove this.currentUserMessage reference in _resolveSourceData
// Change:
const fallbackText = context?.userMessage || this.currentUserMessage || "";
// To:
const fallbackText = context?.userMessage || "";
Summary
Category	Count
🔴 Critical (blocks functionality)	4
🟡 Medium (behavioral change)	2
🟢 Minor (cosmetic/redundant)	2
✅ Verified correct	7+