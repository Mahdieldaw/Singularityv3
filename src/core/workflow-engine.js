// src/core/workflow-engine.js - FIXED VERSION
import { ArtifactProcessor } from '../../shared/artifact-processor.ts';
import {
  errorHandler,
  createMultiProviderAuthError,
  ProviderAuthError,
  isProviderAuthError
} from '../utils/ErrorHandler.js';
import { authManager } from '../core/auth-manager.js';
import { PROVIDER_LIMITS } from '../../shared/provider-limits.ts';
function extractGraphTopologyAndStrip(text) {
  if (!text || typeof text !== 'string') return { text, topology: null };

  // Normalize markdown escapes (LLMs often escape special chars)
  let normalized = text
    .replace(/\\=/g, '=')      // \= → =
    .replace(/\\_/g, '_')      // \_ → _
    .replace(/\\\*/g, '*')     // \* → *
    .replace(/\\-/g, '-');     // \- → -

  const match = normalized.match(/={3,}\s*GRAPH_TOPOLOGY\s*={3,}/i);
  if (!match || typeof match.index !== 'number') return { text, topology: null };
  const start = match.index + match[0].length;
  let rest = normalized.slice(start).trim();

  // Strip markdown code fence if present (```json ... ```)
  const codeBlockMatch = rest.match(/^```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    rest = codeBlockMatch[1].trim();
  }

  let i = 0;
  while (i < rest.length && rest[i] !== '{') i++;
  if (i >= rest.length) return { text, topology: null };
  let depth = 0;
  let inStr = false;
  let esc = false;
  let jsonStart = i;
  let jsonEnd = -1;
  for (let j = jsonStart; j < rest.length; j++) {
    const ch = rest[j];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        jsonEnd = j;
        break;
      }
    }
  }
  if (jsonEnd === -1) return { text, topology: null };
  let jsonText = rest.slice(jsonStart, jsonEnd + 1);

  // FIX: Replace unquoted S in supporter arrays (common LLM error)
  // Pattern: "supporters": [S, 1, 2] -> "supporters": ["S", 1, 2]
  jsonText = jsonText.replace(/("supporters"\s*:\s*\[)\s*S\s*([,\]])/g, '$1"S"$2');

  let topology = null;
  try {
    topology = JSON.parse(jsonText);
  } catch (e) {
    console.warn('[extractGraphTopology] JSON parse failed:', e.message);
    return { text, topology: null };
  }
  const before = normalized.slice(0, match.index).trim();
  const after = rest.slice(jsonEnd + 1).trim();
  const newText = after ? `${before}\n${after}` : before;
  return { text: newText, topology };
}
function extractOptionsAndStrip(text) {
  if (!text || typeof text !== 'string') return { text, options: null };

  // Normalize markdown escapes AND unicode variants
  let normalized = text
    .replace(/\\=/g, '=')      // \= → =
    .replace(/\\_/g, '_')      // \_ → _
    .replace(/\\\*/g, '*')     // \* → *
    .replace(/\\-/g, '-')      // \- → -
    .replace(/[＝═⁼˭꓿﹦]/g, '=')
    .replace(/[‗₌]/g, '=')
    .replace(/\u2550/g, '=')
    .replace(/\uFF1D/g, '=');

  // First, check for GRAPH_TOPOLOGY delimiter and strip it to avoid contaminating options
  // The options section ends before GRAPH_TOPOLOGY if present
  let graphTopoStart = -1;
  // Match emoji + GRAPH_TOPOLOGY or === GRAPH_TOPOLOGY ===
  const graphTopoMatch = normalized.match(/\n?[\u{1F300}-\u{1FAD6}\u{2600}-\u{26FF}\u{2700}-\u{27BF}][\uFE0E\uFE0F]?\s*GRAPH[_\s]*TOPOLOGY|\n?={2,}\s*GRAPH[_\s]*TOPOLOGY\s*={2,}/iu);
  if (graphTopoMatch && typeof graphTopoMatch.index === 'number') {
    graphTopoStart = graphTopoMatch.index;
  }

  // Patterns ordered by strictness (stricter first)
  // NOTE: Emoji patterns need to match the emoji + optional variation selector (\uFE0E or \uFE0F)
  const patterns = [
    // Emoji-prefixed format (🛠️ ALL_AVAILABLE_OPTIONS) - HIGHEST PRIORITY
    // Match any emoji followed by optional variation selector, then ALL_AVAILABLE_OPTIONS
    { re: /\n?[\u{1F300}-\u{1FAD6}\u{2600}-\u{26FF}\u{2700}-\u{27BF}][\uFE0E\uFE0F]?\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*\n?/iu, minPosition: 0.15 },

    // Standard delimiter with 2+ equals signs, optional leading newline
    { re: /\n?={2,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={2,}\n?/i, minPosition: 0 },
    { re: /\n?={2,}\s*ALL[_\s]*OPTIONS\s*={2,}\n?/i, minPosition: 0 },

    // Markdown wrapped variants
    { re: /\n\*\*\s*={2,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={2,}\s*\*\*\n?/i, minPosition: 0 },
    { re: /\n###\s*={2,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={2,}\n?/i, minPosition: 0 },

    // Heading styles (require newline before) - can appear mid-document
    { re: /\n\*\*All Available Options:?\*\*\n/i, minPosition: 0.25 },
    { re: /\n## All Available Options:?\n/i, minPosition: 0.25 },
    { re: /\n### All Available Options:?\n/i, minPosition: 0.25 },

    // Looser patterns - require at least 30% through document to avoid narrative mentions
    { re: /\nAll Available Options:\n/i, minPosition: 0.3 },
    { re: /\n\*\*Options:?\*\*\n/i, minPosition: 0.3 },
    { re: /\n## Options:?\n/i, minPosition: 0.3 },
    { re: /^Options:\n/im, minPosition: 0.3 },
  ];

  let bestMatch = null;
  let bestScore = -1;

  for (const pattern of patterns) {
    const m = normalized.match(pattern.re);
    if (m && typeof m.index === 'number') {
      const position = m.index / normalized.length;

      // Reject matches that are too early in the text
      if (position < pattern.minPosition) continue;

      // Score based on position (later is better) and pattern strictness
      const score = position * 100 + (patterns.indexOf(pattern) === 0 ? 50 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { index: m.index, length: m[0].length };
      }
    }
  }

  if (!bestMatch) return { text: normalized, options: null };

  const idx = bestMatch.index;
  const len = bestMatch.length;

  // Extract what comes after the delimiter, but stop before GRAPH_TOPOLOGY if present
  let afterDelimiter = normalized.slice(idx + len).trim();

  // If there's a GRAPH_TOPOLOGY section after our options, we need to cut before it
  if (graphTopoStart > idx) {
    // Find the relative position of GRAPH_TOPOLOGY in the afterDelimiter string
    const relativeGraphStart = graphTopoStart - (idx + len);
    if (relativeGraphStart > 0 && relativeGraphStart < afterDelimiter.length) {
      afterDelimiter = afterDelimiter.slice(0, relativeGraphStart).trim();
      console.log('[extractOptionsAndStrip] Cut options before GRAPH_TOPOLOGY, new length:', afterDelimiter.length);
    }
  }

  // Strip any secondary ALL_AVAILABLE_OPTIONS delimiter at the start
  // (handles case where emoji header is followed by === delimiter)
  afterDelimiter = afterDelimiter
    .replace(/^={2,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={2,}\s*\n?/i, '')
    .trim();

  // Also strip any emoji GRAPH_TOPOLOGY at the end that might have slipped through
  afterDelimiter = afterDelimiter
    .replace(/\n?[\u{1F300}-\u{1FAD6}\u{2600}-\u{26FF}\u{2700}-\u{27BF}][\uFE0E\uFE0F]?\s*GRAPH[_\s]*TOPOLOGY.*$/isu, '')
    .trim();

  // Validation: Check if what follows looks like structured content
  // Accept: bullet lists, numbered lists, "Theme:" headers, bold headers (**), any capitalized heading,
  // emoji-prefixed sections, or any substantive paragraphs (more than 50 chars)
  const listPreview = afterDelimiter.slice(0, 400); // Increased preview length
  const hasListStructure = /^\s*[-*•]\s+|\n\s*[-*•]\s+|^\s*\d+\.\s+|\n\s*\d+\.\s+|^\s*\*\*[^*]+\*\*|^\s*Theme\s*:|^\s*###?\s+|^\s*[A-Z][^:\n]{2,}:|^[\u{1F300}-\u{1FAD6}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/iu.test(listPreview);

  // Also accept if there's substantive content (at least 50 chars with newlines suggesting structure)
  const hasSubstantiveContent = afterDelimiter.length > 50 && (afterDelimiter.includes('\n') || afterDelimiter.includes(':'));

  if (!hasListStructure && !hasSubstantiveContent) {
    console.warn('[extractOptionsAndStrip] Matched delimiter but no list structure found, rejecting match at position', idx, 'Preview:', listPreview.slice(0, 100));
    return { text: normalized, options: null };
  }

  const before = normalized.slice(0, idx).trim();
  const after = afterDelimiter;
  console.log('[extractOptionsAndStrip] Successfully extracted options, length:', after.length);
  return { text: before, options: after };
}


// =============================================================================
// HELPER FUNCTIONS FOR PROMPT BUILDING
// =============================================================================

function buildSynthesisPrompt(
  originalPrompt,
  sourceResults,
  synthesisProvider,
  mappingResult = null,
) {
  console.log(`[WorkflowEngine] buildSynthesisPrompt called with:`, {
    originalPromptLength: originalPrompt?.length,
    sourceResultsCount: sourceResults?.length,
    synthesisProvider,
    hasMappingResult: !!mappingResult,
    mappingResultText: mappingResult?.text?.length,
  });

  // Filter out only the synthesizing model's own response from batch outputs
  // Keep the mapping model's batch response - only exclude the separate mapping result
  const filteredResults = sourceResults.filter((res) => {
    const isSynthesizer = res.providerId === synthesisProvider;
    return !isSynthesizer;
  });

  const otherItems = filteredResults.map(
    (res) =>
      `**${(res.providerId || "UNKNOWN").toUpperCase()}:**\n${String(res.text)}`,
  );

  // Note: Mapping result is NOT added to otherItems to avoid duplication
  // It will only appear in the dedicated mapping section below

  const otherResults = otherItems.join("\n\n");
  const mappingSection = mappingResult
    ? `\n\n**CONFLICT RESOLUTION MAP:**\n${mappingResult.text}\n\n`
    : "";

  console.log(`[WorkflowEngine] Built synthesis prompt sections:`, {
    otherResultsLength: otherResults.length,
    mappingSectionLength: mappingSection.length,
    hasMappingSection: mappingSection.length > 0,
    mappingSectionPreview: mappingSection.substring(0, 100) + "...",
  });

  const finalPrompt = `Your task is to create a response to the user's prompt, leveraging all available outputs, resources and insights,  that could *only exist* because all of these models responded first to:

<original_user_query>
${originalPrompt}
</original_user_query>

Process:
Review your earlier response from the conversation history above.
Review all batch outputs from other models below.
Each reflects a different way of understanding the question—different assumptions, priorities, and mental models. These are not drafts to judge, but perspectives to understand.
Look at the tensions between responses not as problems to resolve, but as clues to depth. Where models diverge sharply, something important is being implied but not stated. Where they agree too easily, a blind spot may be forming. Your job is to surface what's beneath—what the user might actually be navigating.


Output Requirements:
Don't select the strongest argument. Don't average positions. Instead, imagine a frame where all the strongest insights make sense—not as compromises, but as natural expressions of different facets of a larger truth. Build that frame. Speak from it.


Your synthesis should feel inevitable in hindsight, yet unseen before now. It should carry the energy of discovery, not summation.
- Respond directly to the user's original question with the synthesized answer
- Present as a unified, coherent response rather than comparative analysis
- Do not analyze or compare the source outputs OUTLOUD in your response


<model_outputs>
${otherResults}
</model_outputs>

Begin.

When outputting your synthesis, be sure to start with a "The Short Answer" title which gives a brief overview of your whole response in no more than a paragraph or two, before writing a "The Long Answer" header which contains your actual response.`;

  return finalPrompt;
}

function buildMappingPrompt(
  userPrompt,
  sourceResults,
  synthesisText = "",
  citationOrder = [],
) {
  // Build MODEL 1, MODEL 2 numbered blocks with optional provider labels
  const providerToNumber = new Map();
  if (Array.isArray(citationOrder) && citationOrder.length > 0) {
    citationOrder.forEach((pid, idx) => providerToNumber.set(pid, idx + 1));
  }

  const modelOutputsBlock = sourceResults
    .map((res, idx) => {
      const n = providerToNumber.has(res.providerId)
        ? providerToNumber.get(res.providerId)
        : idx + 1;
      const header = `=== MODEL ${n} ===`;
      return `${header}\n${String(res.text)}`;
    })
    .join("\n\n");

  return `You are not a synthesizer. You are a provenance tracker and option cataloger, a mirror that reveals what others cannot see.

CRUCIAL: Before writing, extract every distinct approach/stance/capability from synthesis + raw outputs. Assign each a permanent canonical label (max 6 words, precise, unique). These labels link narrative ↔ options ↔ graph—reuse them verbatim throughout.

Task: Present ALL insights from the model outputs below in their most useful form for decision-making on the user's prompt that maps the terrain and catalogs every approach.

<user_prompt>: ${String(userPrompt || "")} </user_prompt>

A synthesis has been created:
<synthesis>${synthesisText}</synthesis>

<model_outputs>:
${modelOutputsBlock}
</model_outputs>

**Task 1: Narrative**

Write a fluid, insightful narrative that explains:
- Where models agreed (and why that might be a blind spot)
- Where they diverged (and what that reveals)
- Trade-offs each model made
- Questions the synthesis didn't answer

**Surface the invisible** — Highlight consensus (2+ models) and unique insights (single model) naturally.
**Map the landscape** — Group similar ideas, preserving tensions and contradictions.
**Frame the choices** — Present alternatives as "If you prioritize X, this path fits because Y."
**Anticipate the journey** — End with "This naturally leads to questions about..." based on tensions identified.

Embed citations [1], [2, 3] throughout. When discussing an approach, use its canonical label in **bold** as a recognizable anchor.

**Internal reasoning (never output):**
- What Everyone Sees / The Tensions / The Unique Insights / The Choice Framework / Confidence Check

Output as a natural response to the user's prompt—fluid, insightful, model names redacted. Build feedback as emergent wisdom—evoke clarity, agency, and subtle awe.

**Task 2: All Options Inventory**

After your narrative, add exactly:
"===ALL_AVAILABLE_OPTIONS==="

List EVERY distinct approach from synthesis + raw outputs (including any the synthesis missed):
- **[Canonical Label]:** 1-2 sentence summary [1, 3, 5]
- Group by theme
- Deduplicate rigorously
- Order by prevalence

**Task 3: Topology (for visualization)**

After the options list, add exactly:
"===GRAPH_TOPOLOGY==="

Output JSON:
{
  "nodes": [
    {
      "id": "opt_1",
      "label": "<exact canonical label from Task 2>",
      "theme": "<theme name>",
      "supporters": [<model numbers>],
      "support_count": <number>
    }
  ],
  "edges": [
    {
      "source": "<node id>",
      "target": "<node id>",
      "type": "conflicts" | "complements" | "prerequisite",
      "reason": "<one phrase explaining relationship>"
    }
  ]
}

Edge types:
- **conflicts**: Mutually exclusive or opposing philosophies
- **complements**: Work well together or one enables the other
- **prerequisite**: Must be done before the other

Only include edges where clear relationships exist. Every node needs ≥1 edge.

Labels must match exactly across narrative, options, and graph nodes.

Begin.`;
}

// Track last seen text per provider/session for delta streaming
const lastStreamState = new Map();

function makeDelta(sessionId, stepId, providerId, fullText = "") {
  if (!sessionId) return fullText || "";

  const key = `${sessionId}:${stepId}:${providerId}`;
  const prev = lastStreamState.get(key) || "";
  let delta = "";

  // CASE 1: First emission (prev is empty) — always emit full text
  if (prev.length === 0 && fullText && fullText.length > 0) {
    delta = fullText;
    lastStreamState.set(key, fullText);
    logger.stream("First emission:", {
      providerId,
      textLength: fullText.length,
    });
    return delta;
  }

  // CASE 2: Normal streaming append (new text added)
  if (fullText && fullText.length > prev.length) {
    // Find longest common prefix to handle small inline edits
    let prefixLen = 0;
    const minLen = Math.min(prev.length, fullText.length);

    while (prefixLen < minLen && prev[prefixLen] === fullText[prefixLen]) {
      prefixLen++;
    }

    // If common prefix >= 90% of previous text, treat as append
    if (prefixLen >= prev.length * 0.7) {
      delta = fullText.slice(prev.length);
      lastStreamState.set(key, fullText);
      logger.stream("Incremental append:", {
        providerId,
        deltaLen: delta.length,
      });
    } else {
      logger.stream(
        `Divergence detected for ${providerId}: commonPrefix=${prefixLen}/${prev.length}`,
      );
      lastStreamState.set(key, fullText);
      return fullText.slice(prefixLen); // ✅ Emit from divergence point
    }
    return delta;
  }

  // CASE 3: No change (duplicate call with same text) — no-op
  if (fullText === prev) {
    logger.stream("Duplicate call (no-op):", { providerId });
    return "";
  }

  // CASE 4: Text got shorter - smart detection with warnings instead of errors
  if (fullText.length < prev.length) {
    const regression = prev.length - fullText.length;

    // Calculate regression percentage
    const regressionPercent = (regression / prev.length) * 100;

    // ✅ Allow small absolute regressions OR small percentage regressions
    const isSmallRegression = regression <= 200 || regressionPercent <= 5;

    if (isSmallRegression) {
      logger.stream(`Acceptable regression for ${providerId}:`, {
        chars: regression,
        percent: regressionPercent.toFixed(1) + "%",
      });
      lastStreamState.set(key, fullText);
      return "";
    }

    // Flag & throttle: warn at most a couple of times per provider/session
    // Avoid using process.env in extension context; rely on local counters
    const now = Date.now();
    const lastWarnKey = `${key}:lastRegressionWarn`;
    const warnCountKey = `${key}:regressionWarnCount`;
    const lastWarn = lastStreamState.get(lastWarnKey) || 0;
    const currentCount = lastStreamState.get(warnCountKey) || 0;
    const WARN_MAX = 2; // cap warnings per session/provider to reduce noise
    if (currentCount < WARN_MAX && now - lastWarn > 5000) {
      // 5s cooldown per provider
      logger.warn(
        `[makeDelta] Significant text regression for ${providerId}:`,
        {
          prevLen: prev.length,
          fullLen: fullText.length,
          regression,
          regressionPercent: regressionPercent.toFixed(1) + "%",
        },
      );
      lastStreamState.set(lastWarnKey, now);
      lastStreamState.set(warnCountKey, currentCount + 1);
    }
    lastStreamState.set(key, fullText); // Still update state
    return ""; // No emit on regression
  }

  // CASE 5: Fallback (shouldn't reach here, but safe default)
  return "";
}

/**
 * Clear delta cache when session ends (prevents memory leaks)
 */
function clearDeltaCache(sessionId) {
  if (!sessionId) return;

  const keysToDelete = [];
  lastStreamState.forEach((_, key) => {
    if (key.startsWith(`${sessionId}:`)) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach((key) => lastStreamState.delete(key));
  logger.debug(
    `[makeDelta] Cleared ${keysToDelete.length} cache entries for session ${sessionId}`,
  );
}
// =============================================================================
// SMART CONSOLE FILTER FOR DEV TOOLS
// =============================================================================

const STREAMING_DEBUG = false; // ✅ Set to true to see streaming deltas
const WORKFLOW_DEBUG = false; // ✅ Off-by-default verbose workflow logs
const wdbg = (...args) => {
  if (WORKFLOW_DEBUG) console.log(...args);
};

/**
 * Filtered logger: Hides streaming noise unless explicitly enabled
 */
const logger = {
  // Streaming-specific logs (hidden by default)
  stream: (msg, meta) => {
    if (STREAMING_DEBUG) console.debug(`[WorkflowEngine] ${msg}`, meta);
  },

  // Always show these
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};
// =============================================================================
// WORKFLOW ENGINE - FIXED
// =============================================================================

export class WorkflowEngine {
  constructor(orchestrator, sessionManager, port) {
    this.orchestrator = orchestrator;
    this.sessionManager = sessionManager;
    this.port = port;
    // Keep track of the most recent finalized turn to align IDs with persistence
    this._lastFinalizedTurn = null;
  }

  /**
   * Dispatch a non-empty streaming delta to the UI port.
   * Consolidates duplicate onPartial logic across step executors.
   */
  _dispatchPartialDelta(
    sessionId,
    stepId,
    providerId,
    text,
    label = null,
    isFinal = false,
  ) {
    try {
      let delta;

      // For final emissions, bypass makeDelta regression detection
      // This is critical when we strip sections (like GRAPH_TOPOLOGY) from the text
      if (isFinal) {
        // Force-replace with final text
        const key = `${sessionId}:${stepId}:${providerId}`;
        lastStreamState.set(key, text);
        delta = text; // Send complete final text
        logger.stream("Final emission (force-replace):", { stepId, providerId, len: text?.length || 0 });
      } else {
        delta = makeDelta(sessionId, stepId, providerId, text);
      }

      if (delta && delta.length > 0) {
        const chunk = isFinal
          ? { text: delta, isFinal: true }
          : { text: delta };
        this.port.postMessage({
          type: "PARTIAL_RESULT",
          sessionId,
          stepId,
          providerId,
          chunk,
        });
        logger.stream(label || "Delta", { stepId, providerId, len: delta.length });
        return true;
      } else {
        logger.stream("Delta skipped (empty):", { stepId, providerId });
        return false;
      }
    } catch (e) {
      logger.warn("Delta dispatch failed:", {
        stepId,
        providerId,
        error: String(e),
      });
      return false;
    }
  }

  async execute(request, resolvedContext) {
    const { context, steps } = request;
    const stepResults = new Map();
    // In-memory per-workflow cache of provider contexts created by batch steps
    const workflowContexts = {};

    // Cache current user message for persistence usage
    this.currentUserMessage =
      context?.userMessage || this.currentUserMessage || "";

    // Ensure session exists
    // Session ID must be provided by the connection handler or compiler.
    // We no longer emit SESSION_STARTED; TURN_CREATED now carries the authoritative sessionId.
    if (!context.sessionId || context.sessionId === "new-session") {
      // As a conservative fallback, ensure a non-empty sessionId is present.
      context.sessionId =
        context.sessionId && context.sessionId !== "new-session"
          ? context.sessionId
          : `sid-${Date.now()}`;
      // NOTE: Do not post SESSION_STARTED. UI initializes session from TURN_CREATED.
    }

    try {
      // ========================================================================
      // Seed contexts from ResolvedContext (extend/recompute)
      // ========================================================================
      if (resolvedContext && resolvedContext.type === "recompute") {
        console.log(
          "[WorkflowEngine] Seeding frozen batch outputs for recompute",
        );
        try {
          // Seed a synthetic batch step result so downstream mapping/synthesis can reference it
          stepResults.set("batch", {
            status: "completed",
            result: { results: resolvedContext.frozenBatchOutputs },
          });
        } catch (e) {
          console.warn(
            "[WorkflowEngine] Failed to seed frozen batch outputs:",
            e,
          );
        }

        // Cache historical contexts for providers at the source turn
        try {
          Object.entries(
            resolvedContext.providerContextsAtSourceTurn || {},
          ).forEach(([pid, ctx]) => {
            if (ctx && typeof ctx === "object") {
              workflowContexts[pid] = ctx;
            }
          });
        } catch (e) {
          console.warn(
            "[WorkflowEngine] Failed to cache historical provider contexts:",
            e,
          );
        }
      }

      // When extending an existing session, pre-cache provider contexts
      if (resolvedContext && resolvedContext.type === "extend") {
        try {
          const ctxs = resolvedContext.providerContexts || {};
          const cachedProviders = [];
          Object.entries(ctxs).forEach(([pid, meta]) => {
            if (
              meta &&
              typeof meta === "object" &&
              Object.keys(meta).length > 0
            ) {
              workflowContexts[pid] = meta;
              cachedProviders.push(pid);
            }
          });
          if (cachedProviders.length > 0) {
            console.log(
              `[WorkflowEngine] Pre-cached contexts from ResolvedContext.extend for providers: ${cachedProviders.join(", ")}`,
            );
          }
        } catch (e) {
          console.warn(
            "[WorkflowEngine] Failed to cache provider contexts from extend:",
            e,
          );
        }
      }

      const promptSteps = steps.filter((step) => step.type === "prompt");
      const synthesisSteps = steps.filter((step) => step.type === "synthesis");
      const mappingSteps = steps.filter((step) => step.type === "mapping");

      // 1. Execute all batch prompt steps first, as they are dependencies.
      for (const step of promptSteps) {
        try {
          const result = await this.executePromptStep(step, context);
          stepResults.set(step.stepId, { status: "completed", result });
          this.port.postMessage({
            type: "WORKFLOW_STEP_UPDATE",
            sessionId: context.sessionId,
            stepId: step.stepId,
            status: "completed",
            result,
            // Attach recompute metadata for UI routing/clearing
            isRecompute: resolvedContext?.type === "recompute",
            sourceTurnId: resolvedContext?.sourceTurnId,
          });

          // Cache provider contexts from this batch step into workflowContexts so
          // subsequent synthesis/mapping steps in the same workflow can continue
          // the freshly-created conversations immediately.
          try {
            const resultsObj = result && result.results ? result.results : {};
            const cachedProviders = [];
            Object.entries(resultsObj).forEach(([pid, data]) => {
              if (data && data.meta && Object.keys(data.meta).length > 0) {
                workflowContexts[pid] = data.meta;
                cachedProviders.push(pid);
              }
            });
            if (cachedProviders.length > 0) {
              console.log(
                `[WorkflowEngine] Cached contexts for providers: ${cachedProviders.join(
                  ", ",
                )}`,
              );
            }
          } catch (e) {
            /* best-effort logging */
          }
        } catch (error) {
          console.error(
            `[WorkflowEngine] Prompt step ${step.stepId} failed:`,
            error,
          );
          stepResults.set(step.stepId, {
            status: "failed",
            error: error.message,
          });
          this.port.postMessage({
            type: "WORKFLOW_STEP_UPDATE",
            sessionId: context.sessionId,
            stepId: step.stepId,
            status: "failed",
            error: error.message,
            // Attach recompute metadata for UI routing/clearing
            isRecompute: resolvedContext?.type === "recompute",
            sourceTurnId: resolvedContext?.sourceTurnId,
          });
          // If the main prompt fails, the entire workflow cannot proceed.
          this.port.postMessage({
            type: "WORKFLOW_COMPLETE",
            sessionId: context.sessionId,
            workflowId: request.workflowId,
            finalResults: Object.fromEntries(stepResults),
          });
          return; // Exit early
        }
      }

      const runSynthesisThenMapping = !request?.preferMappingFirst;

      // 2. Execute synthesis or mapping next depending on preference flag
      if (runSynthesisThenMapping) {
        for (const step of synthesisSteps) {
          try {
            const result = await this.executeSynthesisStep(
              step,
              context,
              stepResults,
              workflowContexts,
              resolvedContext,
            );
            stepResults.set(step.stepId, { status: "completed", result });
            this.port.postMessage({
              type: "WORKFLOW_STEP_UPDATE",
              sessionId: context.sessionId,
              stepId: step.stepId,
              status: "completed",
              result,
              // Attach recompute metadata for UI routing/clearing
              isRecompute: resolvedContext?.type === "recompute",
              sourceTurnId: resolvedContext?.sourceTurnId,
            });
          } catch (error) {
            console.error(
              `[WorkflowEngine] Synthesis step ${step.stepId} failed:`,
              error,
            );
            stepResults.set(step.stepId, {
              status: "failed",
              error: error.message,
            });
            this.port.postMessage({
              type: "WORKFLOW_STEP_UPDATE",
              sessionId: context.sessionId,
              stepId: step.stepId,
              status: "failed",
              error: error.message,
              // Attach recompute metadata for UI routing/clearing
              isRecompute: resolvedContext?.type === "recompute",
              sourceTurnId: resolvedContext?.sourceTurnId,
            });
            // Continue with other synthesis steps even if one fails
          }
        }
      }

      // 3. Execute mapping (order depends on preference)
      const mappingLoop = async () => {
        for (const step of mappingSteps) {
          try {
            const result = await this.executeMappingStep(
              step,
              context,
              stepResults,
              workflowContexts,
              resolvedContext,
            );
            stepResults.set(step.stepId, { status: "completed", result });
            this.port.postMessage({
              type: "WORKFLOW_STEP_UPDATE",
              sessionId: context.sessionId,
              stepId: step.stepId,
              status: "completed",
              result,
              // Attach recompute metadata for UI routing/clearing
              isRecompute: resolvedContext?.type === "recompute",
              sourceTurnId: resolvedContext?.sourceTurnId,
            });
          } catch (error) {
            console.error(
              `[WorkflowEngine] Mapping step ${step.stepId} failed:`,
              error,
            );
            stepResults.set(step.stepId, {
              status: "failed",
              error: error.message,
            });
            this.port.postMessage({
              type: "WORKFLOW_STEP_UPDATE",
              sessionId: context.sessionId,
              stepId: step.stepId,
              status: "failed",
              error: error.message,
              // Attach recompute metadata for UI routing/clearing
              isRecompute: resolvedContext?.type === "recompute",
              sourceTurnId: resolvedContext?.sourceTurnId,
            });
            // Continue with other mapping steps even if one fails
          }
        }
      };

      if (runSynthesisThenMapping) {
        await mappingLoop();
      } else {
        // Run mapping first, then synthesis
        await mappingLoop();
        for (const step of synthesisSteps) {
          try {
            const result = await this.executeSynthesisStep(
              step,
              context,
              stepResults,
              workflowContexts,
              resolvedContext,
            );
            stepResults.set(step.stepId, { status: "completed", result });
            this.port.postMessage({
              type: "WORKFLOW_STEP_UPDATE",
              sessionId: context.sessionId,
              stepId: step.stepId,
              status: "completed",
              result,
              isRecompute: resolvedContext?.type === "recompute",
              sourceTurnId: resolvedContext?.sourceTurnId,
            });
          } catch (error) {
            console.error(
              `[WorkflowEngine] Synthesis step ${step.stepId} failed:`,
              error,
            );
            stepResults.set(step.stepId, {
              status: "failed",
              error: error.message,
            });
            this.port.postMessage({
              type: "WORKFLOW_STEP_UPDATE",
              sessionId: context.sessionId,
              stepId: step.stepId,
              status: "failed",
              error: error.message,
              isRecompute: resolvedContext?.type === "recompute",
              sourceTurnId: resolvedContext?.sourceTurnId,
            });
          }
        }
      }

      // ========================================================================
      // Persistence: Consolidated single call with complete results
      // ========================================================================
      try {
        const result = {
          batchOutputs: {},
          synthesisOutputs: {},
          mappingOutputs: {},
        };
        const stepById = new Map((steps || []).map((s) => [s.stepId, s]));
        stepResults.forEach((stepResult, stepId) => {
          if (stepResult.status !== "completed") return;
          const step = stepById.get(stepId);
          if (!step) return;
          if (step.type === "prompt") {
            result.batchOutputs = stepResult.result?.results || {};
          } else if (step.type === "synthesis") {
            const providerId = step.payload?.synthesisProvider;
            if (providerId)
              result.synthesisOutputs[providerId] = stepResult.result;
          } else if (step.type === "mapping") {
            const providerId = step.payload?.mappingProvider;
            if (providerId)
              result.mappingOutputs[providerId] = stepResult.result;
          }
        });

        const userMessage =
          context?.userMessage || this.currentUserMessage || "";
        const persistRequest = {
          type: resolvedContext?.type || "unknown",
          sessionId: context.sessionId,
          userMessage,
        };
        if (resolvedContext?.type === "recompute") {
          persistRequest.sourceTurnId = resolvedContext.sourceTurnId;
          persistRequest.stepType = resolvedContext.stepType;
          persistRequest.targetProvider = resolvedContext.targetProvider;
        }
        if (context?.canonicalUserTurnId)
          persistRequest.canonicalUserTurnId = context.canonicalUserTurnId;
        if (context?.canonicalAiTurnId)
          persistRequest.canonicalAiTurnId = context.canonicalAiTurnId;

        console.log(
          `[WorkflowEngine] Persisting (consolidated) ${persistRequest.type} workflow to SessionManager`,
        );
        const persistResult = await this.sessionManager.persist(
          persistRequest,
          resolvedContext,
          result,
        );

        if (persistResult) {
          if (persistResult.userTurnId)
            context.canonicalUserTurnId = persistResult.userTurnId;
          if (persistResult.aiTurnId)
            context.canonicalAiTurnId = persistResult.aiTurnId;
          if (
            resolvedContext?.type === "initialize" &&
            persistResult.sessionId
          ) {
            context.sessionId = persistResult.sessionId;
            console.log(
              `[WorkflowEngine] Initialize complete: session=${persistResult.sessionId}`,
            );
          }
        }
      } catch (e) {
        console.error("[WorkflowEngine] Consolidated persistence failed:", e);
      }

      // 2) Signal completion to the UI (unchanged message shape)
      this.port.postMessage({
        type: "WORKFLOW_COMPLETE",
        sessionId: context.sessionId,
        workflowId: request.workflowId,
        finalResults: Object.fromEntries(stepResults),
      });

      // ✅ Clean up delta cache
      clearDeltaCache(context.sessionId);

      // Emit canonical turn to allow UI to replace optimistic placeholders
      this._emitTurnFinalized(context, steps, stepResults, resolvedContext);
    } catch (error) {
      console.error(
        `[WorkflowEngine] Critical workflow execution error:`,
        error,
      );
      this.port.postMessage({
        type: "WORKFLOW_COMPLETE",
        sessionId: context.sessionId,
        workflowId: request.workflowId,
        error: "A critical error occurred.",
      });
    }
  }

  /**
   * Emit TURN_FINALIZED message with canonical turn data
   * This allows UI to replace optimistic placeholders with backend-confirmed data
   */
  _emitTurnFinalized(context, steps, stepResults, resolvedContext) {
    // Skip TURN_FINALIZED for recompute operations (they don't create new turns)
    if (resolvedContext?.type === "recompute") {
      console.log(
        "[WorkflowEngine] Skipping TURN_FINALIZED for recompute operation",
      );
      return;
    }

    const userMessage = context?.userMessage || this.currentUserMessage || "";
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
      const synthesisResponses = {};
      const mappingResponses = {};
      let primarySynthesizer = null;
      let primaryMapper = null;

      const stepById = new Map((steps || []).map((s) => [s.stepId, s]));
      stepResults.forEach((value, stepId) => {
        const step = stepById.get(stepId);
        if (!step || value?.status !== "completed") return;
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
          case "synthesis": {
            const providerId = result?.providerId;
            if (!providerId) return;
            if (!synthesisResponses[providerId])
              synthesisResponses[providerId] = [];
            synthesisResponses[providerId].push({
              providerId,
              text: result?.text || "",
              status: result?.status || "completed",
              createdAt: timestamp,
              updatedAt: timestamp,
              meta: result?.meta || {},
            });
            // Set the primary synthesizer for this turn
            primarySynthesizer = providerId;
            break;
          }
          case "mapping": {
            const providerId = result?.providerId;
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
            // Set the primary mapper for this turn
            primaryMapper = providerId;
            break;
          }
        }
      });

      const hasData =
        Object.keys(batchResponses).length > 0 ||
        Object.keys(synthesisResponses).length > 0 ||
        Object.keys(mappingResponses).length > 0;

      if (!hasData) {
        console.log("[WorkflowEngine] No AI responses to finalize");
        return;
      }

      const aiTurn = {
        id: aiTurnId,
        type: "ai",
        userTurnId: userTurn.id,
        sessionId: context.sessionId,
        threadId: "default-thread",
        createdAt: timestamp,
        batchResponses,
        synthesisResponses,
        mappingResponses,
        meta: {
          synthesizer: primarySynthesizer,
          mapper: primaryMapper,
        },
      };

      console.log("[WorkflowEngine] Emitting TURN_FINALIZED", {
        userTurnId: userTurn.id,
        aiTurnId: aiTurn.id,
        batchCount: Object.keys(batchResponses).length,
        synthesisCount: Object.keys(synthesisResponses).length,
        mappingCount: Object.keys(mappingResponses).length,
      });

      this.port.postMessage({
        type: "TURN_FINALIZED",
        sessionId: context.sessionId,
        userTurnId: userTurn.id,
        aiTurnId: aiTurn.id,
        turn: {
          user: userTurn,
          ai: aiTurn,
        },
      });

      // Store for persistence alignment
      this._lastFinalizedTurn = {
        sessionId: context.sessionId,
        user: userTurn,
        ai: aiTurn,
      };
    } catch (error) {
      console.error("[WorkflowEngine] Failed to emit TURN_FINALIZED:", error);
    }
  }


  _generateId(prefix = "turn") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Resolves provider context using three-tier resolution:
   * 1. Workflow cache context (highest priority)
   * 2. Batch step context (medium priority)
   * 3. Persisted context (fallback)
   */
  _resolveProviderContext(
    providerId,
    context,
    payload,
    workflowContexts,
    previousResults,
    resolvedContext,
    stepType = "step",
  ) {
    const providerContexts = {};

    // Tier 1: Prefer workflow cache context produced within this workflow run
    if (workflowContexts && workflowContexts[providerId]) {
      providerContexts[providerId] = {
        meta: workflowContexts[providerId],
        continueThread: true,
      };
      try {
        wdbg(
          `[WorkflowEngine] ${stepType} using workflow-cached context for ${providerId}: ${Object.keys(
            workflowContexts[providerId],
          ).join(",")}`,
        );
      } catch (_) { }
      return providerContexts;
    }

    // Tier 2: ResolvedContext (for recompute - historical contexts)
    if (resolvedContext && resolvedContext.type === "recompute") {
      const historicalContext =
        resolvedContext.providerContextsAtSourceTurn?.[providerId];
      if (historicalContext) {
        providerContexts[providerId] = {
          meta: historicalContext,
          continueThread: true,
        };
        try {
          wdbg(
            `[WorkflowEngine] ${stepType} using historical context from ResolvedContext for ${providerId}`,
          );
        } catch (_) { }
        return providerContexts;
      }
    }

    // Tier 2: Fallback to batch step context for backwards compatibility
    if (payload.continueFromBatchStep) {
      const batchResult = previousResults.get(payload.continueFromBatchStep);
      if (batchResult?.status === "completed" && batchResult.result?.results) {
        const providerResult = batchResult.result.results[providerId];
        if (providerResult?.meta) {
          providerContexts[providerId] = {
            meta: providerResult.meta,
            continueThread: true,
          };
          try {
            wdbg(
              `[WorkflowEngine] ${stepType} continuing conversation for ${providerId} via batch step`,
            );
          } catch (_) { }
          return providerContexts;
        }
      }
    }

    // Tier 3: Last resort use persisted context (may be stale across workflow runs)
    try {
      const persisted = this.sessionManager.getProviderContexts(
        context.sessionId,
        context.threadId || "default-thread",
      );
      const persistedMeta = persisted?.[providerId]?.meta;
      if (persistedMeta && Object.keys(persistedMeta).length > 0) {
        providerContexts[providerId] = {
          meta: persistedMeta,
          continueThread: true,
        };
        try {
          console.log(
            `[WorkflowEngine] ${stepType} using persisted context for ${providerId}: ${Object.keys(
              persistedMeta,
            ).join(",")}`,
          );
        } catch (_) { }
        return providerContexts;
      }
    } catch (_) { }

    return providerContexts;
  }

  // ==========================================================================
  // STEP EXECUTORS - FIXED
  // ==========================================================================

  /**
   * Fire-and-forget persistence helper: batch update provider contexts and save session
   * without blocking the workflow's resolution path.
   */
  _persistProviderContextsAsync(sessionId, updates) {
    try {
      // Defer to next tick to ensure prompt/mapping resolution proceeds immediately
      setTimeout(() => {
        try {
          this.sessionManager.updateProviderContextsBatch(
            sessionId,
            updates,
            true,
            { skipSave: true },
          );
          this.sessionManager.saveSession(sessionId);
        } catch (e) {
          console.warn("[WorkflowEngine] Deferred persistence failed:", e);
        }
      }, 0);
    } catch (_) { }
  }

  /**
   * Execute prompt step - FIXED to return proper format
   */
  /**
   * Execute prompt step - FIXED to include synchronous in-memory update
   */
  async executePromptStep(step, context) {
    const artifactProcessor = new ArtifactProcessor();
    const {
      prompt,
      providers,
      useThinking,
      providerContexts,
      previousContext, // ← NEW
    } = step.payload;

    // Inject Council Framing if context exists
    let enhancedPrompt = prompt;
    if (previousContext) {
      enhancedPrompt = `You are part of the council. Here's the context from our previous discussion:

${previousContext}

Now respond to the user's new message: 
<user_prompt>
${prompt}
</user_prompt>

Your job is to address what the user is actually asking, informed by but not focused on the previous context.`;
    }

    return new Promise((resolve, reject) => {
      this.orchestrator.executeParallelFanout(enhancedPrompt, providers, {
        sessionId: context.sessionId,
        useThinking,
        providerContexts,
        providerMeta: step?.payload?.providerMeta,
        onPartial: (providerId, chunk) => {
          this._dispatchPartialDelta(
            context.sessionId,
            step.stepId,
            providerId,
            chunk.text,
            "Prompt",
          );
        },
        onError: (error) => {
          try {
            this.port.postMessage({
              type: "WORKFLOW_STEP_UPDATE",
              sessionId: context.sessionId,
              stepId: step.stepId,
              status: "partial_failure",
              error: error?.message || String(error),
            });
          } catch (_) { }
          reject(error);
        },
        onAllComplete: (results, errors) => {
          // Build batch updates
          const batchUpdates = {};
          results.forEach((res, pid) => {
            batchUpdates[pid] = res;
          });

          // Emit a single aggregated log summarizing cached contexts produced by providers in this batch
          try {
            const contextsSummary = [];
            results.forEach((res, pid) => {
              const keys = res?.meta ? Object.keys(res.meta) : [];
              if (keys.length > 0)
                contextsSummary.push(`${pid}: ${keys.join(",")}`);
            });
            if (contextsSummary.length > 0) {
              wdbg(
                `[WorkflowEngine] Cached context for ${contextsSummary.join(
                  "; ",
                )}`,
              );
            }
          } catch (_) { }

          // ✅ CRITICAL: Update in-memory cache SYNCHRONOUSLY
          this.sessionManager.updateProviderContextsBatch(
            context.sessionId,
            batchUpdates,
            true, // continueThread
            { skipSave: true },
          );

          this._persistProviderContextsAsync(context.sessionId, batchUpdates);

          // Format results for workflow engine
          const formattedResults = {};
          const authErrors = [];

          results.forEach((result, providerId) => {
            const processed = artifactProcessor.process(result.text || '');
            formattedResults[providerId] = {
              providerId: providerId,
              text: processed.cleanText,
              status: "completed",
              meta: result.meta || {},
              artifacts: processed.artifacts,
              ...(result.softError ? { softError: result.softError } : {}),
            };
          });

          errors.forEach((error, providerId) => {
            formattedResults[providerId] = {
              providerId: providerId,
              text: "",
              status: "failed",
              meta: { _rawError: error.message },
            };

            // Collect auth errors
            if (isProviderAuthError(error)) {
              authErrors.push(error);
            }
          });

          // Validate at least one provider succeeded
          const hasAnyValidResults = Object.values(formattedResults).some(
            (r) =>
              r.status === "completed" && r.text && r.text.trim().length > 0,
          );

          if (!hasAnyValidResults) {
            // If all failed and we have auth errors, throw MultiProviderAuthError
            if (authErrors.length > 0 && authErrors.length === errors.size) {
              const providerIds = Array.from(errors.keys());
              reject(createMultiProviderAuthError(providerIds, {
                originalErrors: authErrors
              }));
              return;
            }

            reject(
              new Error("All providers failed or returned empty responses"),
            );
            return;
          }

          resolve({
            results: formattedResults,
            errors: Object.fromEntries(errors),
          });
        },
      });
    });
  }

  /**
   * Resolve source data - FIXED to handle new format
   */
  async resolveSourceData(payload, context, previousResults) {
    if (payload.sourceHistorical) {
      // Historical source
      const { turnId, responseType } = payload.sourceHistorical;
      console.log(
        `[WorkflowEngine] Resolving historical data from turn: ${turnId}`,
      );

      // Prefer adapter lookup: turnId may be a user or AI turn
      let session = this.sessionManager.sessions[context.sessionId];
      let aiTurn = null;
      try {
        const adapter = this.sessionManager?.adapter;
        if (adapter?.isReady && adapter.isReady()) {
          const turn = await adapter.get("turns", turnId);
          if (turn && (turn.type === "ai" || turn.role === "assistant")) {
            aiTurn = turn;
          } else if (turn && turn.type === "user") {
            // If we have the user turn, try to locate the subsequent AI turn in memory
            if (session && Array.isArray(session.turns)) {
              const userIdx = session.turns.findIndex(
                (t) => t.id === turnId && t.type === "user",
              );
              if (userIdx !== -1) {
                const next = session.turns[userIdx + 1];
                if (next && (next.type === "ai" || next.role === "assistant"))
                  aiTurn = next;
              }
            }
          }
        }
      } catch (_) { }

      // Fallback: resolve from current session memory
      if (!aiTurn && session && Array.isArray(session.turns)) {
        // If turnId is an AI id, pick that turn directly
        aiTurn =
          session.turns.find(
            (t) =>
              t &&
              t.id === turnId &&
              (t.type === "ai" || t.role === "assistant"),
          ) || null;
        if (!aiTurn) {
          // Otherwise treat as user id and take the next AI turn
          const userTurnIndex = session.turns.findIndex(
            (t) => t.id === turnId && t.type === "user",
          );
          if (userTurnIndex !== -1) {
            aiTurn = session.turns[userTurnIndex + 1] || null;
          }
        }
      }

      // Fallback: search across all sessions (helps after reconnects or wrong session targeting)
      if (!aiTurn) {
        try {
          const allSessions = this.sessionManager.sessions || {};
          for (const [sid, s] of Object.entries(allSessions)) {
            if (!s || !Array.isArray(s.turns)) continue;
            const direct = s.turns.find(
              (t) =>
                t &&
                t.id === turnId &&
                (t.type === "ai" || t.role === "assistant"),
            );
            if (direct) {
              aiTurn = direct;
              session = s;
              break;
            }
            const idx = s.turns.findIndex(
              (t) => t.id === turnId && t.type === "user",
            );
            if (idx !== -1) {
              aiTurn = s.turns[idx + 1];
              session = s;
              console.warn(
                `[WorkflowEngine] Historical turn ${turnId} resolved in different session ${sid}; proceeding with that context.`,
              );
              break;
            }
          }
        } catch (_) { }
      }

      if (!aiTurn || aiTurn.type !== "ai") {
        // Fallback: try to resolve by matching user text when IDs differ (optimistic vs canonical)
        const fallbackText =
          context?.userMessage || this.currentUserMessage || "";
        if (fallbackText && fallbackText.trim().length > 0) {
          try {
            // Search current session first
            let found = null;
            const searchInSession = (sess) => {
              if (!sess || !Array.isArray(sess.turns)) return null;
              for (let i = 0; i < sess.turns.length; i++) {
                const t = sess.turns[i];
                if (
                  t &&
                  t.type === "user" &&
                  String(t.text || "") === String(fallbackText)
                ) {
                  const next = sess.turns[i + 1];
                  if (next && next.type === "ai") return next;
                }
              }
              return null;
            };

            found = searchInSession(session);
            if (!found) {
              // Fallback: search across all sessions
              const allSessions = this.sessionManager.sessions || {};
              for (const [sid, s] of Object.entries(allSessions)) {
                found = searchInSession(s);
                if (found) {
                  console.warn(
                    `[WorkflowEngine] Historical fallback matched by text in different session ${sid}; proceeding with that context.`,
                  );
                  break;
                }
              }
            }

            if (found) {
              aiTurn = found;
            } else {
              throw new Error(
                `Could not find corresponding AI turn for ${turnId}`,
              );
            }
          } catch (e) {
            throw new Error(
              `Could not find corresponding AI turn for ${turnId}`,
            );
          }
        } else {
          throw new Error(`Could not find corresponding AI turn for ${turnId}`);
        }
      }

      let sourceContainer;
      switch (responseType) {
        case "synthesis":
          sourceContainer = aiTurn.synthesisResponses || {};
          break;
        case "mapping":
          sourceContainer = aiTurn.mappingResponses || {};
          break;
        default:
          sourceContainer = aiTurn.batchResponses || {};
          break;
      }

      // Convert to array format
      let sourceArray = Object.values(sourceContainer)
        .flat()
        .filter(
          (res) =>
            res.status === "completed" &&
            res.text &&
            res.text.trim().length > 0,
        )
        .map((res) => ({
          providerId: res.providerId,
          text: res.text,
        }));

      // If embedded responses were not present, attempt provider_responses fallback (prefer indexed lookup)
      if (
        sourceArray.length === 0 &&
        this.sessionManager?.adapter?.isReady &&
        this.sessionManager.adapter.isReady()
      ) {
        try {
          let responses = [];
          if (
            typeof this.sessionManager.adapter.getResponsesByTurnId ===
            "function"
          ) {
            responses = await this.sessionManager.adapter.getResponsesByTurnId(
              aiTurn.id,
            );
          } else {
            responses = await this.sessionManager.adapter.getResponsesByTurnId(
              aiTurn.id,
            );
          }
          const respType = responseType || "batch";
          sourceArray = (responses || [])
            .filter(
              (r) =>
                r &&
                r.responseType === respType &&
                r.text &&
                String(r.text).trim().length > 0,
            )
            .sort(
              (a, b) =>
                (a.updatedAt || a.createdAt || 0) -
                (b.updatedAt || b.createdAt || 0),
            )
            .map((r) => ({ providerId: r.providerId, text: r.text }));
          if (sourceArray.length > 0) {
            console.log(
              "[WorkflowEngine] provider_responses fallback succeeded for historical sources",
            );
          }
        } catch (e) {
          console.warn(
            "[WorkflowEngine] provider_responses fallback failed for historical sources:",
            e,
          );
        }
      }

      console.log(
        `[WorkflowEngine] Found ${sourceArray.length} historical sources`,
      );
      return sourceArray;
    } else if (payload.sourceStepIds) {
      // Current workflow source
      const sourceArray = [];

      for (const stepId of payload.sourceStepIds) {
        const stepResult = previousResults.get(stepId);

        if (!stepResult || stepResult.status !== "completed") {
          console.warn(
            `[WorkflowEngine] Step ${stepId} not found or incomplete`,
          );
          continue;
        }

        const { results } = stepResult.result;

        // Results is now an object: { claude: {...}, gemini: {...} }
        Object.entries(results).forEach(([providerId, result]) => {
          if (
            result.status === "completed" &&
            result.text &&
            result.text.trim().length > 0
          ) {
            sourceArray.push({
              providerId: providerId,
              text: result.text,
            });
          }
        });
      }

      console.log(
        `[WorkflowEngine] Found ${sourceArray.length} current workflow sources`,
      );
      return sourceArray;
    }

    throw new Error("No valid source specified for step.");
  }

  /**
   * Execute synthesis step - FIXED error messages
   */
  async executeSynthesisStep(
    step,
    context,
    previousResults,
    workflowContexts = {},
    resolvedContext,
  ) {
    const artifactProcessor = new ArtifactProcessor();
    const payload = step.payload;
    const sourceData = await this.resolveSourceData(
      payload,
      context,
      previousResults,
    );

    if (sourceData.length < 2) {
      throw new Error(
        `Synthesis requires at least 2 valid sources, but found ${sourceData.length}.`,
      );
    }

    wdbg(
      `[WorkflowEngine] Running synthesis with ${sourceData.length
      } sources: ${sourceData.map((s) => s.providerId).join(", ")}`,
    );

    // Look for mapping results from the current workflow
    let mappingResult = null;

    if (payload.mappingStepIds && payload.mappingStepIds.length > 0) {
      for (const mappingStepId of payload.mappingStepIds) {
        const mappingStepResult = previousResults.get(mappingStepId);
        wdbg(
          `[WorkflowEngine] Checking mapping step ${mappingStepId}: ${JSON.stringify(
            {
              status: mappingStepResult?.status,
              hasResult: !!mappingStepResult?.result,
            },
          )}`,
        );

        if (
          mappingStepResult?.status === "completed" &&
          mappingStepResult.result?.text
        ) {
          mappingResult = mappingStepResult.result;
          wdbg(
            `[WorkflowEngine] Found mapping result from step ${mappingStepId} for synthesis: providerId=${mappingResult.providerId}, textLength=${mappingResult.text?.length}`,
          );
          break;
        } else {
          wdbg(
            `[WorkflowEngine] Mapping step ${mappingStepId} not suitable: status=${mappingStepResult?.status
            }, hasResult=${!!mappingStepResult?.result}, hasText=${!!mappingStepResult
              ?.result?.text}`,
          );
        }
      }
      // Prefer mapping result when declared, but continue gracefully if absent
      if (!mappingResult || !String(mappingResult.text || "").trim()) {
        console.warn(
          `[WorkflowEngine] No valid mapping result found; proceeding without Map input`,
          mappingResult,
        );



      }
    } else {
      // Simplified recompute: use pre-fetched latestMappingOutput from resolvedContext
      if (
        !mappingResult &&
        resolvedContext?.type === "recompute" &&
        resolvedContext?.latestMappingOutput
      ) {
        mappingResult = resolvedContext.latestMappingOutput;
        wdbg(
          `[WorkflowEngine] Using pre-fetched historical mapping from ${mappingResult.providerId}`,
        );
      }
    }

    // Helper to execute synthesis with a specific provider
    const runSynthesis = async (providerId) => {
      const synthPrompt = buildSynthesisPrompt(
        payload.originalPrompt,
        sourceData,
        providerId,
        mappingResult,
      );

      // ✅ RESTORED: Log prompt length for debugging
      const promptLength = synthPrompt.length;
      console.log(`[WorkflowEngine] Synthesis prompt length for ${providerId}: ${promptLength} chars`);

      // ✅ NEW: Input Length Validation
      const limits = PROVIDER_LIMITS[providerId];
      if (limits && promptLength > limits.maxInputChars) {
        console.warn(`[WorkflowEngine] Prompt length ${promptLength} exceeds limit ${limits.maxInputChars} for ${providerId}`);
        throw new Error(`INPUT_TOO_LONG: Prompt length ${promptLength} exceeds limit ${limits.maxInputChars} for ${providerId}`);
      }

      // Resolve provider context using three-tier resolution
      const providerContexts = this._resolveProviderContext(
        providerId,
        context,
        payload,
        workflowContexts,
        previousResults,
        resolvedContext,
        "Synthesis",
      );

      return new Promise((resolve, reject) => {
        this.orchestrator.executeParallelFanout(
          synthPrompt,
          [providerId],
          {
            sessionId: context.sessionId,
            useThinking: payload.useThinking,
            providerContexts: Object.keys(providerContexts).length
              ? providerContexts
              : undefined,
            providerMeta: step?.payload?.providerMeta,
            onPartial: (pid, chunk) => {
              this._dispatchPartialDelta(
                context.sessionId,
                step.stepId,
                pid,
                chunk.text,
                "Synthesis",
              );
            },
            onError: (error) => {
              reject(error);
            },
            onAllComplete: (results) => {
              const finalResult = results.get(providerId);

              // ✅ Extract artifacts from synthesis response
              if (finalResult?.text) {
                const { cleanText, artifacts } = artifactProcessor.process(finalResult.text);
                finalResult.text = cleanText;
                finalResult.artifacts = artifacts;
              }

              // ✅ Ensure final emission for synthesis
              if (finalResult?.text) {
                this._dispatchPartialDelta(
                  context.sessionId,
                  step.stepId,
                  providerId,
                  finalResult.text,
                  "Synthesis",
                  true,
                );
              }

              if (!finalResult || !finalResult.text) {
                reject(
                  new Error(
                    `Synthesis provider ${providerId} returned empty response`,
                  ),
                );
                return;
              }

              // Defer persistence to avoid blocking synthesis resolution
              this._persistProviderContextsAsync(context.sessionId, {
                [providerId]: finalResult,
              });
              // Update workflow-cached context for subsequent steps in the same workflow
              try {
                if (finalResult?.meta) {
                  workflowContexts[providerId] = finalResult.meta;
                  wdbg(
                    `[WorkflowEngine] Updated workflow context for ${providerId
                    }: ${Object.keys(finalResult.meta).join(",")}`,
                  );
                }
              } catch (_) { }

              resolve({
                providerId: providerId,
                text: finalResult.text, // ✅ Return text explicitly
                status: "completed",
                meta: finalResult.meta || {},
                artifacts: finalResult.artifacts || [],
              });
            },
          },
        );
      });
    };

    try {
      return await runSynthesis(payload.synthesisProvider);
    } catch (error) {
      // Check if we can recover from auth error
      if (isProviderAuthError(error)) {
        console.warn(`[WorkflowEngine] Synthesis failed with auth error for ${payload.synthesisProvider}, attempting fallback...`);

        const fallbackStrategy = errorHandler.fallbackStrategies.get('PROVIDER_AUTH_FAILED');
        if (fallbackStrategy) {
          try {
            const fallbackProvider = await fallbackStrategy(
              'synthesis',
              { failedProviderId: payload.synthesisProvider }
            );

            if (fallbackProvider) {
              console.log(`[WorkflowEngine] executing synthesis with fallback provider: ${fallbackProvider}`);
              // Retry with fallback provider
              return await runSynthesis(fallbackProvider);
            }
          } catch (fallbackError) {
            console.warn(`[WorkflowEngine] Fallback failed:`, fallbackError);
          }
        }
      }

      throw error;
    }
  }

  /**
   * Execute mapping step - FIXED
   */
  async executeMappingStep(
    step,
    context,
    previousResults,
    workflowContexts = {},
    resolvedContext,
  ) {
    const artifactProcessor = new ArtifactProcessor();
    const payload = step.payload;
    const sourceData = await this.resolveSourceData(
      payload,
      context,
      previousResults,
    );

    if (sourceData.length < 2) {
      throw new Error(
        `Mapping requires at least 2 valid sources, but found ${sourceData.length}.`,
      );
    }

    wdbg(
      `[WorkflowEngine] Running mapping with ${sourceData.length
      } sources: ${sourceData.map((s) => s.providerId).join(", ")}`,
    );

    // Resolve synthesis text from prior synthesis step or recompute context
    let synthesisText = "";
    try {
      if (
        Array.isArray(payload.synthesisStepIds) &&
        payload.synthesisStepIds.length > 0
      ) {
        for (const synthStepId of payload.synthesisStepIds) {
          const synthResult = previousResults.get(synthStepId);
          if (
            synthResult?.status === "completed" &&
            synthResult.result?.text &&
            String(synthResult.result.text).trim().length > 0
          ) {
            synthesisText = synthResult.result.text;
            break;
          }
        }
      } else if (
        resolvedContext?.type === "recompute" &&
        resolvedContext?.latestSynthesisOutput?.text
      ) {
        synthesisText = resolvedContext.latestSynthesisOutput.text;
      }
    } catch (e) {
      logger.warn(
        "[WorkflowEngine] Failed to resolve synthesisText for mapping:",
        e,
      );
    }

    // Compute citation order mapping number→providerId
    const providerOrder = Array.isArray(payload.providerOrder)
      ? payload.providerOrder
      : sourceData.map((s) => s.providerId);
    const citationOrder = providerOrder.filter((pid) =>
      sourceData.some((s) => s.providerId === pid),
    );

    const mappingPrompt = buildMappingPrompt(
      payload.originalPrompt,
      sourceData,
      synthesisText,
      citationOrder,
    );

    // Resolve provider context using three-tier resolution
    const providerContexts = this._resolveProviderContext(
      payload.mappingProvider,
      context,
      payload,
      workflowContexts,
      previousResults,
      resolvedContext,
      "Mapping",
    );

    // ✅ RESTORED: Log prompt length for debugging
    const promptLength = mappingPrompt.length;
    console.log(`[WorkflowEngine] Mapping prompt length for ${payload.mappingProvider}: ${promptLength} chars`);

    // ✅ NEW: Input Length Validation
    const limits = PROVIDER_LIMITS[payload.mappingProvider];
    if (limits && promptLength > limits.maxInputChars) {
      console.warn(`[WorkflowEngine] Mapping prompt length ${promptLength} exceeds limit ${limits.maxInputChars} for ${payload.mappingProvider}`);
      throw new Error(`INPUT_TOO_LONG: Prompt length ${promptLength} exceeds limit ${limits.maxInputChars} for ${payload.mappingProvider}`);
    }

    return new Promise((resolve, reject) => {
      this.orchestrator.executeParallelFanout(
        mappingPrompt,
        [payload.mappingProvider],
        {
          sessionId: context.sessionId,
          useThinking: payload.useThinking,
          providerContexts: Object.keys(providerContexts).length
            ? providerContexts
            : undefined,
          providerMeta: step?.payload?.providerMeta,
          onPartial: (providerId, chunk) => {
            this._dispatchPartialDelta(
              context.sessionId,
              step.stepId,
              providerId,
              chunk.text,
              "Mapping",
            );
          },
          onAllComplete: (results) => {
            const finalResult = results.get(payload.mappingProvider);

            let graphTopology = null;
            let allOptions = null;
            if (finalResult?.text) {
              console.log('[WorkflowEngine] Mapping response length:', finalResult.text.length);
              console.log('[WorkflowEngine] Mapping response preview:', finalResult.text.slice(0, 500));

              const topo = extractGraphTopologyAndStrip(finalResult.text);
              graphTopology = topo.topology;
              finalResult.text = topo.text;

              console.log('[WorkflowEngine] Graph topology extracted:', {
                found: !!graphTopology,
                hasNodes: graphTopology?.nodes?.length || 0,
                hasEdges: graphTopology?.edges?.length || 0,
              });

              const opt = extractOptionsAndStrip(finalResult.text);
              allOptions = opt.options;
              finalResult.text = opt.text;

              console.log('[WorkflowEngine] Options extracted:', {
                found: !!allOptions,
                length: allOptions?.length || 0,
              });

              const processed = artifactProcessor.process(finalResult.text);
              finalResult.text = processed.cleanText;
              finalResult.artifacts = processed.artifacts;
            }

            // ✅ Ensure final emission for mapping
            if (finalResult?.text) {
              this._dispatchPartialDelta(
                context.sessionId,
                step.stepId,
                payload.mappingProvider,
                finalResult.text,
                "Mapping",
                true,
              );
            }

            if (!finalResult || !finalResult.text) {
              reject(
                new Error(
                  `Mapping provider ${payload.mappingProvider} returned empty response`,
                ),
              );
              return;
            }

            // Attach citationSourceOrder meta mapping number→providerId
            const citationSourceOrder = {};
            citationOrder.forEach((pid, idx) => {
              citationSourceOrder[idx + 1] = pid;
            });
            const finalResultWithMeta = {
              ...finalResult,
              meta: {
                ...(finalResult?.meta || {}),
                citationSourceOrder,
                ...(allOptions ? { allAvailableOptions: allOptions } : {}),
                ...(graphTopology ? { graphTopology } : {}),
              },
            };

            // Defer persistence to avoid blocking mapping resolution
            this._persistProviderContextsAsync(context.sessionId, {
              [payload.mappingProvider]: finalResultWithMeta,
            });
            // Update workflow-cached context for subsequent steps in the same workflow
            try {
              if (finalResultWithMeta?.meta) {
                workflowContexts[payload.mappingProvider] =
                  finalResultWithMeta.meta;
                wdbg(
                  `[WorkflowEngine] Updated workflow context for ${payload.mappingProvider
                  }: ${Object.keys(finalResultWithMeta.meta).join(",")}`,
                );
              }
            } catch (_) { }

            resolve({
              providerId: payload.mappingProvider,
              text: finalResultWithMeta.text, // ✅ Return text explicitly
              status: "completed",
              meta: finalResultWithMeta.meta || {},
              artifacts: finalResult.artifacts || [],
            });
          },
        },
      );
    });
  }
}
export { extractGraphTopologyAndStrip };
