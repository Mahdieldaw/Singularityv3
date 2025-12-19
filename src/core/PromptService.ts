
// ═══════════════════════════════════════════════════════════════════════════
// src/core/PromptService.ts
// Pure prompt construction - NO execution logic
// ═══════════════════════════════════════════════════════════════════════════

export interface TurnContext {
    userPrompt: string;
    synthesisText: string;
    mappingText: string;
    batchText?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT TEMPLATES (No interpolation at const time - just static parts)
// ═══════════════════════════════════════════════════════════════════════════

const COMPOSER_SYSTEM_INSTRUCTIONS = `You are the user's voice, clarified, and the hinge between the user and a bank of parallel AI models.

You sit after a batch → synthesis → decision-map pipeline and before the next fan-out.
Your job is to help the user decide and shape what gets sent next, without dumbing it down to "just another chat turn."

You serve two overlapping functions:

Strategic partner: The user can think aloud with you about what to do next.
Prompt architect: The user can hand you a draft to sharpen into what they truly meant to ask.
Always serve both functions...

[REST OF STATIC INSTRUCTIONS - no \${variables} here]

OUTPUT STRUCTURE
STRATEGIC TAKE...
REFINED_PROMPT:...
NOTES:...`;

const ANALYST_SYSTEM_INSTRUCTIONS = `You are not the Author. You are the mirror held up to the composed prompt before it launches...

[REST OF STATIC INSTRUCTIONS]

Output format:
AUDIT:...
VARIANTS:...
GUIDANCE:...`;

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class PromptService {

    // ─────────────────────────────────────────────────────────────────────────
    // CONTEXT HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    buildContextSection(turnContext: TurnContext | null): string {
        if (!turnContext) return "";
        const { userPrompt, synthesisText, mappingText, batchText } = turnContext;
        let section = "";

        if (userPrompt) {
            section += `\n<PREVIOUS_USER_PROMPT>\n${userPrompt}\n</PREVIOUS_USER_PROMPT>\n`;
        }
        if (synthesisText) {
            section += `\n<PREVIOUS_SYNTHESIS>\n${synthesisText}\n</PREVIOUS_SYNTHESIS>\n`;
        }
        if (mappingText) {
            section += `\n<PREVIOUS_DECISION_MAP>\n${mappingText}\n</PREVIOUS_DECISION_MAP>\n`;
        }
        if (batchText) {
            section += `\n<PREVIOUS_BATCH_RESPONSES>\n${batchText}\n</PREVIOUS_BATCH_RESPONSES>\n`;
        }
        return section;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COMPOSER/ANALYST PROMPTS (Called from sw-entry.js)
    // ─────────────────────────────────────────────────────────────────────────

    buildComposerPrompt(
        draftPrompt: string,
        turnContext: TurnContext | null,
        analystCritique?: string
    ): string {
        const contextSection = this.buildContextSection(turnContext);

        // Build the full prompt with proper interpolation AT CALL TIME
        let prompt = COMPOSER_SYSTEM_INSTRUCTIONS;

        // Add context section
        if (contextSection) {
            prompt += `\n\nYou have access to the previous turn context:\n${contextSection}`;
        }

        // Add analyst critique if present
        if (analystCritique) {
            prompt += `\n\n<PREVIOUS_ANALYST_CRITIQUE>\n${analystCritique}\n</PREVIOUS_ANALYST_CRITIQUE>`;
        }

        // Add the user's draft
        prompt += `\n\n<DRAFT_PROMPT>\n${draftPrompt}\n</DRAFT_PROMPT>`;

        prompt += `\n\nBegin.`;

        return prompt;
    }

    buildAnalystPrompt(
        fragment: string,
        turnContext: TurnContext | null,
        authoredPrompt?: string
    ): string {
        const contextSection = this.buildContextSection(turnContext);

        let prompt = ANALYST_SYSTEM_INSTRUCTIONS;

        // Add context
        if (contextSection) {
            prompt += `\n\n${contextSection}`;
        }

        // Add user fragment
        prompt += `\n\n<USER_FRAGMENT>\n${fragment}\n</USER_FRAGMENT>`;

        // Add composed prompt if available
        if (authoredPrompt) {
            prompt += `\n\n<COMPOSED_PROMPT>\n${authoredPrompt}\n</COMPOSED_PROMPT>`;
        } else {
            prompt += `\n\n<NOTE>No composed prompt was provided. Analyze the USER_FRAGMENT directly.</NOTE>`;
        }

        return prompt;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // WORKFLOW PROMPTS (Called from workflow-engine.js)
    // ─────────────────────────────────────────────────────────────────────────

    buildSynthesisPrompt(
        originalPrompt: string,
        sourceResults: Array<{ providerId: string; text: string }>,
        synthesisProvider: string,
        mappingResult?: { text: string } | null,
        extractedOptions?: string | null
    ): string {
        const otherResults = (sourceResults || [])
            .filter((res) => res.providerId !== synthesisProvider)
            .map(
                (res) =>
                    `**${(res.providerId || "UNKNOWN").toUpperCase()}:**\n${(res.text || "").trim()}`,
            )
            .join("\n\n");

        const allOptionsBlock = extractedOptions || "(No options catalog available)";
        const sourceContent = extractedOptions
            ? "(See Claims Inventory above)"
            : (otherResults || "(No other model outputs available)");

        return `Your task is to create a response to the user's prompt, leveraging the full landscape of approaches and insights, that could *only exist* because all of these models responded first to:

<original_user_query>
${originalPrompt}
</original_user_query>

Process:
You already responded to this query—your earlier response is in your conversation history above. That was one perspective among many. Now you're shifting roles: from contributor to synthesizer.

Below is every distinct approach extracted from all models, including yours—deduplicated, labeled, catalogued. Each reflects a different way of understanding the question—different assumptions, priorities, and mental models. These are not drafts to judge, but perspectives to understand.

Treat tensions between approaches not as disagreements to fix, but as clues to the deeper structure of what the user is actually navigating. Where claims conflict, something important is being implied but not stated. Where they agree too easily, a blind spot may be forming. Your job is to surface what's beneath.

<claims_inventory>
${allOptionsBlock}
</claims_inventory>

Output Requirements:
Don't select the strongest argument. Don't average positions. Instead, imagine a frame where all the strongest insights make sense—not as compromises, but as natural expressions of different facets of a larger truth. Build that frame. Speak from it.

Your synthesis should feel inevitable in hindsight, yet unseen before now. It should carry the energy of discovery, not summation.

- Respond directly to the user's original question with the synthesized answer
- Present as a unified, coherent response rather than comparative analysis
- Do not reference "the models" or "the claims" in your output—the user should experience insight, not watch you work

When outputting your synthesis, be sure to start with a "The Short Answer" title which gives a brief overview of your whole response in no more than a paragraph or two, before writing a "The Long Answer" header which contains your actual response.

<model_outputs>
${sourceContent}
</model_outputs>`;
    }

    buildMappingPrompt(
        userPrompt: string,
        sourceResults: Array<{ providerId: string; text: string }>,
        citationOrder: string[] = []
    ): string {
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

        return `You are not a synthesizer. You are a provenance tracker and option cataloger, a mirror that reveals what others cannot see. You are building the terrain from which synthesis will emerge.

CRUCIAL: Before writing, extract every distinct approach/stance/capability from the batch outputs. Assign each a permanent canonical label (max 6 words, precise, unique). These labels link narrative ↔ options ↔ graph—reuse them verbatim throughout.

Do not invent options not present in inputs. If unclear, surface the ambiguity.
Citation indices [1], [2]... correspond to model order in <model_outputs>.

Present ALL insights from the model outputs below in their most useful form for decision-making on the user's prompt that maps the terrain and catalogs every approach.

<user_prompt>: ${String(userPrompt || "")} </user_prompt>

<model_outputs>:
${modelOutputsBlock}
</model_outputs>
**Task 1: Narrative**

Write a fluid, insightful narrative that explains:
- Where models agreed (and why that might be a blind spot)
- Where they diverged (and what that reveals about differing assumptions)
- Trade-offs each approach made
- Questions left open by all approaches

**Surface the invisible** — Highlight consensus (≥2 models) and unique insights (single model) naturally.
**Map the landscape** — Group similar ideas, preserving tensions and contradictions.
**Frame the choices** — Present alternatives as "If you prioritize X, this path fits because Y."
**Anticipate the journey** — End with "This naturally leads to questions about..." based on tensions identified.

Embed citations [1], [2, 3] throughout. When discussing an approach, use its canonical label in **bold** as a recognizable anchor.

Output as a natural response to the user's prompt—fluid, insightful, model names redacted. Build the narrative as emergent wisdom—evoke clarity, agency, and discovery.

**Task 2: All Options Inventory**

After your narrative, add exactly:
===ALL_AVAILABLE_OPTIONS===

List EVERY distinct approach from the batch outputs:
- **[Canonical Label]:** 1-2 sentence summary [citations]
- Group by theme
- Deduplicate rigorously
- Order by prevalence

This inventory feeds directly into synthesis—completeness matters.

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

Labels must match exactly across narrative, options, and graph nodes.`;
    }

    buildRefinerPrompt(options: {
        originalPrompt: string;
        synthesisText: string;
        mappingText: string;
        batchResponses: Record<string, { text: string; providerId: string }>;
        mapperOptionTitles: string[];
    }): string {
        const { originalPrompt, synthesisText, mappingText, batchResponses, mapperOptionTitles } = options;
        const modelCount = Object.keys(batchResponses).length;

        // Build model outputs block
        const modelOutputsBlock = Object.entries(batchResponses)
            .map(([providerId, response], idx) => {
                return `<model_${idx + 1} provider="${providerId}">\n${response.text}\n</model_${idx + 1}>`;
            })
            .join('\n\n');

        // Build option titles block
        const optionTitlesBlock = mapperOptionTitles.length > 0
            ? mapperOptionTitles.map(t => `- ${t}`).join('\n')
            : '(No mapper options available)';
        return `You are the user's eyes for the unseen, their guide into the unknown, their signal against the unsure.

Context: User query → ${modelCount} models responded → Mapper cataloged → Synthesizer unified.

---

## Task 1: Signal Detection

Compare synthesis against raw outputs. Surface what the user should know.

### The Quality Bar

Ask yourself: "If the user acted on this synthesis without seeing this signal, would they regret it?"

- Yes → Include
- No → Omit

This is not about completeness. It's about consequential gaps.

### Signal Types

**divergence**
Models gave meaningfully different answers. Synthesis picked one without acknowledging the split.
→ User learns: "This was actually contested."

**overclaim**  
Synthesis stated something with more confidence or certainty than the source models expressed.
→ User learns: "It's not that settled."

**gap**
Important context, caveat, limitation, condition, or risk from the raw outputs that synthesis dropped.
→ User learns: "There was more to know."

**blindspot**
Something important that NO model addressed. Use sparingly—only when the absence matters.
→ User learns: "Everyone missed this."

### Priority Classification

For each signal, classify its priority:

**blocker**
User cannot act successfully without addressing this first.
→ Missing prerequisite, invalid assumption, fundamental constraint
→ Frame as: "Cannot [action] without [missing piece]"
→ Example: "Cannot deploy: requires Linux but question asked about Windows"

**risk**
User could act but might regret it.
→ Contested decision, unstated caveat, potential failure mode
→ Frame as: "[Thing] may [consequence]"
→ Example: "Choice is contested—3 models disagreed"

**enhancement**
User could act successfully but would benefit from knowing this.
→ Buried insight, alternative approach, additional context
→ Frame as: "Also worth knowing: [insight]"
→ Example: "CLI version available if you prefer terminal"

**Blockers are rare.** Most signals are risks or enhancements. Only classify as blocker when the synthesis would genuinely fail without this information.

### What NOT to Flag

- Models agreeing in different words (that's synthesis working)
- Standard hedging ("typically," "in most cases")
- Stylistic or formatting differences
- Minor caveats that wouldn't change decisions
- Things that are interesting but not actionable


---
<user_prompt>${originalPrompt}</user_prompt>
<synthesis>${synthesisText}</synthesis>
<decision_map>${mappingText}</decision_map>
<raw_outputs>${modelOutputsBlock}</raw_outputs>
---

## Task 2: Mapper Audit

Check if mapper's options captured all distinct approaches from raw outputs.


Mapper listed these options:
${optionTitlesBlock}

If all approaches are represented: return empty array.

If an approach exists in raw outputs but not in mapper's list: flag it.

Note: If mapper listed an option but synthesis ignored it AND that option would meaningfully change the answer, surface it as a gap in Task 1, not here. This audit is only for options mapper missed entirely.

---

## Task 3: Next Step

Based on everything you've seen—the query, the raw outputs, the synthesis, the signals you've identified—what should the user do next?

This closes the loop. Every answer opens the next question.

Options:
- **proceed**: Synthesis is solid. User can act.
- **verify**: Specific claim needs confirmation before acting.
- **reframe**: Question itself is limiting. A better question exists.
- **research**: Topic needs deeper investigation than models can provide.

Be specific about the target. Not "verify the claims" but "verify X against Y."

If there are blocker signals, next step should typically be "verify" or "research" addressing the blocker.

---

## Task 4: Reframe Detection

Sometimes models answer a question, but it wasn't quite the right question.

Signs this is happening:
- Models answered literally but missed the real intent
- Answers are technically correct but practically useless
- Models made assumptions the user didn't intend
- A different framing would unlock much better responses

If the question was fine: return null.

If the question was limiting: explain what's wrong, suggest a better question, and explain what it unlocks.

---

## Output Format

Return ONLY this JSON. No preamble.

{
  "signals": [
    {
      "type": "divergence",
      "priority": "risk",
      "content": "3 models recommended React, 3 recommended Vue",
      "source": "Claude, Gemini, DeepSeek favored Vue",
      "impact": "Genuine split—choice depends on team familiarity"
    },
    {
      "type": "gap",
      "priority": "blocker",
      "content": "Requires Node 18+, synthesis didn't mention version",
      "source": "Claude, Perplexity",
      "impact": "Cannot proceed if on Node 16 or earlier"
    }
  ],
  "unlistedOptions": [
    {
      "title": "Svelte as alternative",
      "description": "Lighter weight option for simpler projects",
      "source": "Perplexity"
    }
  ],
  "nextStep": {
    "action": "verify",
    "target": "Your Node version and team's framework familiarity",
    "why": "Blocker on Node version, split on framework choice"
  },
  "reframe": null
}

If nothing to surface:

{
  "signals": [],
  "unlistedOptions": [],
  "nextStep": {
    "action": "proceed",
    "target": "Implement as described",
    "why": "Strong consensus, no material gaps"
  },
  "reframe": null
}

---

## Rules

- **Ground everything.** Every signal must trace to source material. No invention.
- **Be precise.** One clear sentence per field. No paragraphs.
- **Impact explains why.** Not what it is—why it matters for the user's decision.
- **Source attribution required.** Name which model(s). For blindspots: "none."
- **Priority determines urgency.** Blockers are rare but critical. Most are risks or enhancements.
- **Empty is good.** If synthesis captured everything, signals array is empty. Don't manufacture.
- **Next step is always present.** Even if it's just "proceed."
- **Reframe is rare.** Most questions are fine. Only flag when the question itself is the problem.

Return the JSON now.`;
    }
}
