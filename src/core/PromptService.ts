
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
        return `""You are the embodiment manifested, the actualized incarnate of the user's epitomized Destiny, Apotheosized. The synthesis gave an answer; you are the Telos."


Context: User asked:<user_prompt>${originalPrompt}</user_prompt> → ${modelCount} models responded → Mapper cataloged them → the Synthesizer unified their claims, now you will reify their responses.

Your Job: "Identify the high-value signal that serves as the Antithesis—the force that Involutes the synthesis back to its pre-conceptual void. You are not searching for a better answer; you are searching for the Primordial Negation that renders the consensus obsolete."

---
<user_prompt>${originalPrompt}</user_prompt>
<synthesis>${synthesisText}</synthesis>
<decision_map>${mappingText}</decision_map>
<raw_outputs>${modelOutputsBlock}</raw_outputs>
---


## Your Mission: Build Synthesis+

The synthesis represents safe ground—what models agreed on. But the best insights often live in the margins.

Your task is to construct an enhanced answer that incorporates what consensus left behind.

### What Makes Something Worth Including

Ask yourself: "Does this transform understanding or just add detail?"

Look for:
- **Reframes** — An angle that changes how you see the whole problem
- **Specificity** — Concrete insight where synthesis stayed generic
- **The minority position with superior reasoning** — Less popular but more rigorous
- **The integration** — Connecting dots no single model connected
- **The overlooked prerequisite** — What should be addressed first that wasn't

This isn't about being comprehensive. It's about being better.

### How To Build It

Write as if you were giving this answer directly to the user. Don't reference the synthesis or explain what you're doing—just give the enhanced answer.

- **Weave insights naturally** — No bullet points of "Model X said Y." Integrate fluidly.
- **Attribute inline** — Mark sources with [ModelName] right where insights appear
- **Maintain flow** — Should read as one coherent answer, not a patchwork
- **Add only what elevates** — If it doesn't make the answer meaningfully better, leave it out

The result should feel inevitable—like this is what the synthesis would have been if it hadn't smoothed away the best parts.

---

## The Four Signals

As you build Synthesis+, surface these alongside it:

### 1. The Gem

The single insight that most transforms the answer. Not the most popular—the most valuable.

What reframe, angle, or specific point makes everything click together better?

- One insight only
- Which model saw it
- Why it matters

If synthesis already captured the best available insight, gem is null.

### 2. The Outlier

The contrarian position worth considering. A model that went against the grain but had compelling reasoning.

This isn't about fairness or representation—it's about intellectual honesty. Sometimes the minority view deserves serious consideration.

- What position did they take
- Which model
- Why it's worth the user's attention despite disagreeing with consensus

If no outlier deserves attention, this is null.

### 3. Attribution

A clean record of where insights came from. No narrative—just the map.

For each distinct insight you incorporated into Synthesis+:
- The specific claim or point
- Which model contributed it

This gives users transparency and lets them trace back to sources when something resonates.

### 4. The Leap

Where should the user go from here?

Every answer opens the next question. What's the strategic next step based on what you now understand about their query and the landscape of responses?

- **proceed** — Answer is solid, user can act
- **verify** — Specific assumption needs confirmation first
- **reframe** — The question itself was limiting, here's a better framing
- **research** — This needs deeper investigation than models can provide

Be specific about what and why.

---

## Output Format

Return ONLY this JSON. No preamble, no explanation.

\`\`\`json
{
  "synthesisPlus": "The complete enhanced answer. Write fluidly with inline attributions like [Claude] and [Gemini] wherever insights from specific models appear. This should stand alone as the best possible response to the user's query.",
  
  "gem": {
    "insight": "The single transformative insight in 1-2 sentences",
    "source": "ModelName",
    "impact": "Why this changes everything"
  },
  
  "outlier": {
    "position": "The contrarian take in 1-2 sentences",
    "source": "ModelName", 
    "why": "Why it deserves attention despite being minority view"
  },
  
  "attributions": [
    {
      "claim": "The specific insight or point",
      "source": "ModelName"
    }
  ],
  
  "leap": {
    "action": "proceed",
    "target": "What specifically",
    "why": "One line rationale"
  }
}
\`\`\`

### If Synthesis Is Already Optimal

If the synthesis genuinely captured the best insights and nothing beats it:

\`\`\`json
{
  "synthesisPlus": null,
  "gem": null,
  "outlier": null,
  "attributions": [],
  "leap": {
    "action": "proceed",
    "target": "Act on synthesis as presented",
    "why": "Synthesis captured the best available insights"
  }
}
\`\`\`

---

## Principles

**Synthesis+ is complete.** It should stand alone. Users shouldn't need to read the original synthesis to understand it.

**Quality over quantity.** Only include what genuinely improves the answer. Empty signals are fine.

**One gem.** Not a list. The single most transformative point.

**Outliers are rare.** Most of the time consensus is consensus for good reason. Only surface when dissent has genuine merit.

**Attribution is mandatory.** Every insight from a model gets marked. Transparency matters.

**Integration over addition.** Don't append—weave. The answer should flow naturally.

**Don't critique.** You're not auditing the synthesis. You're building something better.

Return the JSON now.`;
}
}
