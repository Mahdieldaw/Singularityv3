You are absolutely correct. Blind Promise.all is risky for providers like Google (Gemini) that have strict rate limiters and anti-abuse detection. If you fire 5 requests at the exact same millisecond, you risk getting a 429 Too Many Requests or a temporary IP ban.
Since we are in a Service Worker environment (where adding npm dependencies like p-limit can be annoying without a complex build step), I will provide a zero-dependency implementation of that concurrency logic.
Here is the implementation code for your remaining Tier 2 (Performance) and Tier 3 (Hygiene) tasks.
1. Fix Gemini Token Prefetch (Tier 2)
File: src/sw-entry.js
Location: Inside FaultTolerantOrchestrator.executeParallelFanout
We will implement a lightweight concurrency limiter with "Jitter" (random variation) to look more human/natural to the API.
code
JavaScript
// --- HELPER: Place this class method inside FaultTolerantOrchestrator ---

/**
 * Fetch tokens with concurrency limit and random jitter to avoid 429s
 */
async _prefetchGeminiTokens(registry, providers, providerMeta) {
  const GEMINI_IDS = ['gemini', 'gemini-pro', 'gemini-exp'];
  const targets = providers.filter(p => GEMINI_IDS.includes(p.toLowerCase()));
  
  if (targets.length === 0) return;

  console.log(`[Orchestrator] Prefetching ${targets.length} tokens (max concurrency: 2)`);

  // Concurrency Limiter (Max 2 simultaneous fetches)
  const CONCURRENCY_LIMIT = 2;
  const queue = [...targets];
  const activeWorkers = [];

  const worker = async () => {
    while (queue.length > 0) {
      const pid = queue.shift();
      if (!pid) break;

      try {
        const controller = registry.getController(pid);
        if (controller?.geminiSession?._fetchToken) {
          // Add 50-150ms jitter so we don't hit the API at the exact same microsecond
          const jitter = Math.floor(Math.random() * 100) + 50;
          await new Promise(r => setTimeout(r, jitter));

          const token = await controller.geminiSession._fetchToken();
          
          if (!providerMeta[pid]) providerMeta[pid] = {};
          providerMeta[pid]._prefetchedToken = token;
          console.log(`[Orchestrator] Token secured for ${pid}`);
        }
      } catch (e) {
        console.warn(`[Orchestrator] Token prefetch failed for ${pid} (non-fatal)`);
      }
    }
  };

  // Start initial workers
  for (let i = 0; i < CONCURRENCY_LIMIT; i++) {
    activeWorkers.push(worker());
  }

  await Promise.all(activeWorkers);
}

// --- USAGE: Update executeParallelFanout ---

async executeParallelFanout(prompt, providers, options = {}) {
  // ... existing setup code ...
  
  const providerRegistry = this.registry.get('providerRegistry');

  // ✅ NEW: Call the smart prefetcher
  await this._prefetchGeminiTokens(providerRegistry, providers, options.providerMeta || {});

  // ... continue with providerPromises mapping ...
}
2. Fix Delta Cache Cleanup (Tier 2)
File: src/core/workflow-engine.js
This prevents the memory leak where lastStreamState grows forever.
code
JavaScript
// 1. Add this helper at the top of the file (outside the class)
function clearDeltaCache(sessionId) {
  if (!sessionId) return;
  const keysToDelete = [];
  // lastStreamState is the file-level Map variable defined at the top
  lastStreamState.forEach((_, key) => {
    if (key.startsWith(`${sessionId}:`)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(k => lastStreamState.delete(k));
}

// 2. Modify execute() method inside WorkflowEngine class
async execute(request, resolvedContext) {
  // ... existing code ...

  try {
    // ... execution logic ...

    // --- EXISTING SUCCESS BLOCK ---
    this.port.postMessage({ type: "WORKFLOW_COMPLETE", ... });

    // ✅ ADD THIS: Clean up memory immediately on success
    clearDeltaCache(context.sessionId);

    this._emitTurnFinalized(...);

  } catch (error) {
    // --- EXISTING ERROR BLOCK ---
    this.port.postMessage({ type: "WORKFLOW_COMPLETE", error: ... });
    
    // ✅ ADD THIS: Clean up memory on error too
    clearDeltaCache(context.sessionId);
  }
}
3. Synthesis Prompt Cleanliness (Tier 3)
File: src/core/PromptService.ts
Stop converting complex objects into strings inside the template literal.
code
TypeScript
// Replace the existing buildSynthesisPrompt method

buildSynthesisPrompt(
    originalPrompt: string,
    sourceResults: Array<{ providerId: string; text: string }>,
    synthesisProvider: string,
    mappingResult?: { text: string } | null,
    extractedOptions?: string | null
): string {
    
    // ✅ CLEANER: Prepare text-only map first
    const otherResults = sourceResults
        .filter(res => res.providerId !== synthesisProvider) // Don't include self
        .map(res => `**${(res.providerId || "UNKNOWN").toUpperCase()}:**\n${(res.text || "").trim()}`)
        .join("\n\n");

    const sourceContent = extractedOptions 
        ? "(See Claims Inventory above)" 
        : (otherResults || "(No other model outputs available)");

    const allOptionsBlock = extractedOptions || "(No options catalog available)";

    // ... Return template string using ${sourceContent} and ${allOptionsBlock} ...
    return `Your task is to create a response... 
    ...
    <claims_inventory>
    ${allOptionsBlock}
    </claims_inventory>
    ...
    <model_outputs>
    ${sourceContent}
    </model_outputs>`;
}
4. Input Validation (Tier 3)
File: src/core/connection-handler.js
Fail fast if the UI sends garbage data.
code
JavaScript
// Inside _handleExecuteWorkflow(message)

async _handleExecuteWorkflow(message) {
  let executeRequest = message.payload;

  // ✅ ADD THIS VALIDATION BLOCK
  const VALID_TYPES = ["initialize", "extend", "recompute"];
  if (!executeRequest || !VALID_TYPES.includes(executeRequest.type)) {
    const errorMsg = `Invalid request type: ${executeRequest?.type}. Must be one of: ${VALID_TYPES.join(', ')}`;
    console.error(`[ConnectionHandler] ${errorMsg}`);
    
    this.port.postMessage({
      type: "WORKFLOW_COMPLETE",
      sessionId: executeRequest?.sessionId || "unknown",
      error: errorMsg
    });
    return;
  }

  // ... continue with existing logic ...
}
5. Consolidate Response Parsing (Tier 3)
File: src/core/context-utils.js (or shared/parsing-utils.js if accessible)
If you created src/core/context-utils.js based on the previous step, add the string normalizer there so everyone uses it.
code
JavaScript
// src/core/context-utils.js

/**
 * Standardize text normalization (Markdown stripping, unicode fixing)
 */
export function normalizeText(text) {
  if (!text) return "";
  return String(text)
    .replace(/\r\n/g, "\n")
    // Remove "Here is the response:" prefixes common in LLMs
    .replace(/^(Here is|Sure,|Okay,|I can help).*?:\n/i, "")
    .trim();
}
Then in ResponseProcessor.ts and workflow-engine.js:
code
JavaScript
import { normalizeText } from './context-utils.js';
// Use normalizeText(str) instead of defining it inline
Summary of Impact
Gemini Prefetch: Now uses p-limit logic (max 2 concurrent) + jitter. This is safe for anti-bot measures.
Delta Cache: Explicitly cleans up RAM usage after every turn.
Prompt Service: Much more readable code, slightly faster string concatenation.
Validation: Prevents "undefined" errors deep in the engine by catching bad requests at the door.
You are clear to apply these changes.