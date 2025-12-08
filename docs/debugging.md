# Debugging Guide

## 1. Message Flow Tracing

**Enable debug logs:**

```typescript
// In usePortMessageHandler.ts
const STREAMING_DEBUG_UI = true; // See every PARTIAL_RESULT

// In workflow-engine.js
const STREAMING_DEBUG = true; // See backend streaming deltas
```

**Expected message sequence for a normal prompt:**

1. `TURN_CREATED` (once)
2. `PARTIAL_RESULT` (hundreds of times)
3. `WORKFLOW_STEP_UPDATE` {status:'completed', stepId:'batch-...'} (once per provider)
4. `WORKFLOW_STEP_UPDATE` {status:'completed', stepId:'mapping-...'} (if requested)
5. `WORKFLOW_STEP_UPDATE` {status:'completed', stepId:'synthesis-...'} (if requested)
6. `WORKFLOW_COMPLETE` (once)
7. `TURN_FINALIZED` (once)

**If you see:**

- **No TURN_CREATED**: Connection handler rejected the request (check primitive validation)
- **PARTIAL_RESULT but no completion**: Orchestrator is stuck (check provider adapter errors)
- **WORKFLOW_COMPLETE but no TURN_FINALIZED**: Persistence failed (check IndexedDB errors)
- **"Generating..." never stops**: UI missed a completion message (check stepId parsing)

## 2. State Inspection

**In browser DevTools console:**

```javascript
// Inspect current UI state
window.__JOTAI_STORE__ = jotaiStore;
const turnsMap = jotaiStore.get(turnsMapAtom);
const turnIds = jotaiStore.get(turnIdsAtom);
console.log("Turns:", Array.from(turnsMap.entries()));

// Inspect backend state
chrome.runtime.sendMessage({ type: "GET_HEALTH_STATUS" }, (response) => {
  console.log("Backend health:", response);
});

// Check persistence layer
const db = await window.indexedDB.open("HTOSPersistenceDB", 1);
const tx = db.transaction(["turns"], "readonly");
const turns = await tx.objectStore("turns").getAll();
console.log("Persisted turns:", turns);
```

## 3. Common Issues

**Issue: "Synthesis generating..." never completes**

**Root cause:** UI is checking `status === 'pending'` but backend sent `status === 'streaming'`.

**Fix:** Normalize status checks:
```typescript
const isGenerating = ["pending", "streaming"].includes(latest?.status);
```

---

**Issue: Recompute shows "No synthesis yet"**

**Root cause:** `activeRecomputeState.providerId` doesn't match `activeSynthesisClipProviderId`.

**Fix:** Ensure recompute target check uses `||` logic:
```typescript
const isSynthesisTarget = !!(
  activeRecomputeState &&
  activeRecomputeState.aiTurnId === aiTurn.id &&
  activeRecomputeState.stepType === "synthesis" &&
  (!activeSynthPid || activeRecomputeState.providerId === activeSynthPid)
);
```

---

**Issue: "All providers failed" but one succeeded**

**Root cause:** Backend `executePromptStep` checks `hasAnyValidResults` incorrectly.

**Fix:** Ensure validation checks `text.trim().length > 0`:
```javascript
const hasAnyValidResults = Object.values(formattedResults).some(
  (r) => r.status === "completed" && r.text && r.text.trim().length > 0,
);
```

---

**Issue: Continuation request fails with "Missing context"**

**Root cause:** `provider_contexts` store is stale or empty.

**Debug:**
```javascript
// Check live contexts
const contexts = await db
  .transaction(["provider_contexts"])
  .objectStore("provider_contexts")
  .getAll();
console.log("Live contexts:", contexts);

// Force refresh
await sessionManager.updateProviderContextsBatch(sessionId, results, true);
```
