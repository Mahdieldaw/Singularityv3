// src/services/PromptRefinerService.ts

interface TurnContext {
  userPrompt: string;
  synthesisText: string;
  mappingText: string;
  batchText?: string;
}

interface RefinerOptions {
  refinerModel?: string; // Legacy support
  authorModel?: string;
  analystModel?: string;
}

interface RefinerResult {
  refinedPrompt: string;
  explanation: string;
}

export interface AuthorAnalystResult {
  authored: string;
  explanation?: string;
  audit: string;
  variants: string[];
  raw: {
    authorResponse: string;
    analystResponse: string;
  };
}

const COMPOSER_SYSTEM_PROMPT = `You are the user's voice, clarified, and the hinge between the user and a bank of parallel AI models.

You sit after a batch → synthesis → decision-map pipeline and before the next fan-out.
Your job is to help the user decide and shape what gets sent next, without dumbing it down to “just another chat turn.”

You operate in two overlapping modes:
- Thinking partner: the user can talk to you directly about what they’re trying to do next.
- Prompt composer/refiner: the user can hand you a draft of what they want to send, and you sharpen it into what they truly meant to ask.

You ALWAYS have access to:
\${contextSection}
\${analystCritiqueSection}

The user’s latest input is wrapped as:

<DRAFT_PROMPT>
\${draftPrompt}
</DRAFT_PROMPT>

Your first task is to infer how to treat it.

MODE DETECTION (INTERNAL, DO NOT OUTPUT AS A LIST)
- If the content is clearly a message *to you* (e.g. “what do you think we should do next?”, “how would you probe B?”, “I want to push on trade-offs here”), treat it as meta-intent.
- If the content reads like something they want the other models to answer (an instruction, a question, a spec, a stance), treat it as a draft prompt.
- If it’s mixed, you can:
  - Briefly respond to the meta-intent in natural language
  - Then propose a refined prompt that would carry out that intent.

INTERNAL REASONING (NEVER SHOWN TO THE USER)
When you are composing or refining, silently consider:

- Intent Inference
  - What is the user actually trying to do at this point in the exploration (explore, decide, stress-test, pivot, implement, inhabit a stance)?
  - Are they building on the previous synthesis/map, pushing back against it, or pivoting?

- Context Integration
  - Which insights from the prior turn (synthesis, decision map, batch) are essential to carry forward?
  - Which tensions or trade-offs from the Decision Map should inform this next move?
  - What has the user already understood that doesn’t need re-explaining?

- Clarity & Scope
  - Where could models misinterpret or splinter into unhelpful branches?
  - Are any key constraints or priorities missing or too vague?
  - Is the scope right for this turn (broad exploration vs focused deep dive vs implementation)?

- Strategic Framing
  - How can this be structured to elicit depth rather than surface answers?
  - Which implicit assumptions should be made explicit—only when doing so would unlock better responses?
  - How should the prompt invite models to surface tensions, trade-offs, and alternative frames when that’s valuable?

- Transformation Decision
  - What specifically needs to change from their fragment?
  - What should be preserved exactly as they wrote it?
  - How do you maintain their voice while sharpening their intent?

OUTPUT STYLE
- Always respond in a single, fluid block of text — no numbered lists of reasoning, no step scaffolding.
- Use short headings like “REFINED_PROMPT:” and “NOTES:” as anchors, but keep the prose under them natural.

OUTPUT LOGIC

1. If the user is mainly speaking to YOU (meta-intent):

   - Briefly answer them as a collaborator:
     - Reflect what you think they’re trying to achieve next.
     - Suggest where the highest-leverage next question or stance likely is, given the context.

   - Then offer a concrete next prompt they could send to the batch:

     REFINED_PROMPT:
     [A single, polished prompt or stance text that implements the intent you just discussed, preserving their voice and direction.]

   - Optionally add:

     NOTES:
     [2–4 sentences explaining what you inferred about their intent, what you emphasized or de-emphasized, and what kind of responses this is optimized to produce.]

2. If the user is clearly giving you a draft prompt or stance to send:

   - Do NOT treat it like a question to answer yourself.
   - Refine it so that:
     - Their voice and structure are preserved where possible.
     - Ambiguity that would harm answer quality is reduced.
     - Relevant context from the prior pipeline is pulled in where it materially improves results.

   - Then output:

     REFINED_PROMPT:
     [Your improved version that captures the user’s true intent and maximizes response quality. If no changes are needed, return the original.]

     NOTES:
     [2–4 sentences explaining:
      - What you inferred about their intent
      - What you changed and why (or why you left it unchanged)
      - How this will improve the responses they receive.]

PRINCIPLES
- Preserve the user’s voice and direction; don’t make the prompt sound like a different person.
- Add clarity without unnecessary verbosity.
- Surface implicit intent only when it will actually help downstream models behave better.
- Respect the gravity of the turn: this is not “just another chat message,” it’s the steering wheel for a primed multi-model system.
- When in doubt between being clever and being clear, choose clear.

Begin.`;

// Deprecated prompts kept for reference if needed, but unused in new flow
const AUTHOR_SYSTEM_PROMPT = `(Deprecated) ...`;
const INITIALIZE_SYSTEM_PROMPT = `(Deprecated) ...`;

const ANALYST_SYSTEM_PROMPT = `You are not the Author. You are the mirror held up to the composed prompt before it launches.

You see: the user's original fragment, the full prior turn (batches, synthesis, map, all options), and optionally the composed prompt that emerged from them.
If a composed prompt is provided, your task is to reveal what it does not say.
If only the user fragment is provided, analyze the fragment directly.

Your task is to reveal what the composed prompt does not say.

AUDIT:
Name what's being left behind. Which tensions from the prior turn does this prompt (or fragment) close off? Which model perspectives does it implicitly deprioritize? Which assumptions does it bake in that could have been questioned? This is not criticism—it's cartography of the negative space.

VARIANTS:
Produce no more than 3 alternative framings of the same underlying intent. Not edits—rotations. Each variant should be a complete prompt that approaches the question from different angles:
- One can inherit a different model's frame
- One could invert an assumption
- One might zoom in on a specific tension
- Or go meta (asks about the inquiry itself)
Not all variants are needed every time. innovate variants if needed, Produce only those that would genuinely open different territory.

GUIDANCE:
After the variants, add 2–4 sentences mapping them to different priorities or moods the user might have. For example: "If you want to stress-test assumptions, 1 is strongest. If you want creative divergence, 2. If you want to stay close to the original but widen the lens on X, keep the Author's prompt."

Output format:

AUDIT:
[Your negative-space analysis]

VARIANTS:
1. [First alternative framing]
2. [Second alternative framing]
...

GUIDANCE:
[Short steering commentary as described above.]

No preamble. No explanation of method. Just the Audit, Variants, and Guidance.`;

/**
 * PromptRefinerService
 * Pre-flight prompt refinement using a two-stage pipeline (Author + Analyst).
 */
export class PromptRefinerService {
  private authorModel: string;
  private analystModel: string;

  constructor(options: RefinerOptions = {}) {
    // Default to gemini if not specified, or use refinerModel for backward compat
    const defaultModel = (options.refinerModel || "gemini").toLowerCase();
    this.authorModel = (options.authorModel || defaultModel).toLowerCase();
    this.analystModel = (options.analystModel || defaultModel).toLowerCase();
  }

  /**
   * Legacy method for backward compatibility.
   * Wraps refineWithAuthorAnalyst.
   */
  async refinePrompt(
    draftPrompt: string,
    turnContext: TurnContext | null = null,
  ): Promise<RefinerResult | null> {
    return this.runComposer(draftPrompt, turnContext, this.authorModel);
  }

  /**
   * Refine a draft prompt using the Composer -> Analyst pipeline.
   * (Formerly refineWithAuthorAnalyst)
   */
  async refineWithAuthorAnalyst(
    fragment: string,
    turnContext: TurnContext | null,
    authorModelId?: string,
    analystModelId?: string,
    isInitialize: boolean = false
  ): Promise<AuthorAnalystResult | null> {
    try {
      const authorId = authorModelId || this.authorModel;
      const analystId = analystModelId || this.analystModel;

      // 1. Run Composer
      const composerResult = await this.runComposer(fragment, turnContext, authorId);
      if (!composerResult) return null;

      const { refinedPrompt: authored, explanation } = composerResult;

      // 2. Run Analyst
      // For initialize flows, we might skip analyst or keep it. 
      // The original code skipped analyst if isInitialize was true.
      // We'll preserve that logic for now, or let the caller decide.
      // But wait, the prompt says "Analyst stays as your current ANALYST_SYSTEM_PROMPT".

      let audit = "Audit unavailable";
      let variants: string[] = [];
      let analystResponseRaw: any = null;

      if (!isInitialize) {
        const contextSection = this._buildContextSection(turnContext);
        const analystPrompt = this._buildAnalystPrompt(fragment, contextSection, authored);
        console.log(`[PromptRefinerService] Running Analyst (\${analystId})...`);

        try {
          analystResponseRaw = await this._callModel(analystId, analystPrompt);
          const analystText = this._extractPlainText(analystResponseRaw?.text || "");
          const parsedAnalyst = this._parseAnalystResponse(analystText);
          audit = parsedAnalyst.audit;
          variants = parsedAnalyst.variants;
        } catch (e) {
          console.warn("[PromptRefinerService] Analyst failed, returning Composer result only:", e);
        }
      }

      return {
        authored,
        explanation,
        audit,
        variants,
        raw: {
          authorResponse: explanation, // Approximate mapping
          analystResponse: analystResponseRaw?.text || "",
        },
      };

    } catch (e) {
      console.warn("[PromptRefinerService] Refinement pipeline failed:", e);
      return null;
    }
  }

  /**
   * Run the Composer (unified Author/Refiner).
   */
  async runComposer(
    fragment: string,
    turnContext: TurnContext | null,
    composerModelId?: string,
    analystCritique?: string
  ): Promise<RefinerResult | null> {
    try {
      const modelId = composerModelId || this.authorModel;
      const contextSection = this._buildContextSection(turnContext);
      const prompt = this._buildComposerPrompt(fragment, contextSection, analystCritique);

      console.log(`[PromptRefinerService] Running Composer (\${modelId})...`);
      const responseRaw = await this._callModel(modelId, prompt);
      const responseText = this._extractPlainText(responseRaw?.text || "");

      return this._parseComposerResponse(responseText);
    } catch (e) {
      console.warn("[PromptRefinerService] Composer run failed:", e);
      return null;
    }
  }

  // ...

  private _parseComposerResponse(text: string): RefinerResult {
    // Reuse the refiner parser logic as the output format is compatible (REFINED_PROMPT / NOTES)
    return this._parseRefinerResponse(text);
  }

  // Deprecated parsers
  // private _parseAuthorResponse...
  // private _parseInitializeResponse...

  private _parseInitializeResponse(text: string): { authored: string; explanation: string } {
    const result = {
      authored: text,
      explanation: "",
    };

    try {
      // Look for REFINED_PROMPT: and EXPLANATION:
      // Handle variations: REFINED_PROMPT, REFINED\_PROMPT (escaped), with markdown formatting
      const refinedRegex = /(?:^|\n)[*#]*\s*REFINED(?:_|\\_)\s*PROMPT[*]*:?\s*([\\s\\S]*?)(?=(?:^|\n)[*#]*\s*EXPLANATION|$)/i;
      const explanationRegex = /(?:^|\n)[*#]*\s*EXPLANATION[*]*:?\s*([\\s\\S]*?)$/i;

      const refinedMatch = text.match(refinedRegex);
      const explanationMatch = text.match(explanationRegex);

      if (refinedMatch && refinedMatch[1]) {
        result.authored = refinedMatch[1].trim();
      }
      if (explanationMatch && explanationMatch[1]) {
        result.explanation = explanationMatch[1].trim();
      }
    } catch (e) {
      console.warn("[PromptRefinerService] Failed to parse initialize response:", e);
    }
    return result;
  }


  private _buildContextSection(turnContext: TurnContext | null): string {
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

  private _buildComposerPrompt(fragment: string, contextSection: string, analystCritique?: string): string {
    let prompt = `${COMPOSER_SYSTEM_PROMPT}

${contextSection}`;

    if (analystCritique) {
      prompt += `

<PREVIOUS_ANALYST_CRITIQUE>
${analystCritique}
</PREVIOUS_ANALYST_CRITIQUE>`;
    }

    prompt += `

<DRAFT_PROMPT>
${fragment}
</DRAFT_PROMPT>`;
    return prompt;
  }

  // Deprecated
  private _buildAuthorPrompt(fragment: string, contextSection: string, isInitialize: boolean): string {
    return this._buildComposerPrompt(fragment, contextSection);
  }

  private _buildAnalystPrompt(fragment: string, contextSection: string, authoredPrompt?: string): string {
    let prompt = `${ANALYST_SYSTEM_PROMPT}

${contextSection}

<USER_FRAGMENT>
${fragment}
</USER_FRAGMENT>`;

    if (authoredPrompt) {
      prompt += `

<COMPOSED_PROMPT>
${authoredPrompt}
</COMPOSED_PROMPT>`;
    } else {
      prompt += `

<NOTE>
No composed prompt was provided. Analyze the USER_FRAGMENT directly.
</NOTE>`;
    }
    return prompt;
  }

  private async _callModel(modelId: string, prompt: string): Promise<any> {
    const registry =
      (globalThis as any).__HTOS_SW?.getProviderRegistry?.() ||
      (globalThis as any).providerRegistry;
    if (!registry) throw new Error("providerRegistry not available");

    let adapter = registry.getAdapter(modelId);
    if (!adapter) {
      // Fallback logic
      const fallbacks = ["gemini", "chatgpt", "qwen"];
      for (const pid of fallbacks) {
        if (registry.isAvailable(pid)) {
          adapter = registry.getAdapter(pid);
          console.log(`[PromptRefinerService] Model ${modelId} not found, falling back to ${pid}`);
          break;
        }
      }
    }
    if (!adapter) throw new Error(`No provider adapter available for ${modelId}`);

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 60000);

    try {
      if (typeof adapter.ask === "function") {
        return await adapter.ask(
          prompt,
          { meta: { model: this._preferredModel(adapter) } },
          undefined,
          undefined,
          ac.signal,
        );
      } else if (typeof adapter.sendPrompt === "function") {
        const req = {
          originalPrompt: prompt,
          meta: { model: this._preferredModel(adapter) },
        };
        return await adapter.sendPrompt(req, undefined, ac.signal);
      } else {
        throw new Error("Adapter does not support ask/sendPrompt");
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private _preferredModel(adapter: any): string {
    const pid = (adapter?.id || "").toLowerCase();
    if (pid === "gemini") return "gemini-flash";
    if (pid === "chatgpt") return "gpt-4o-mini";
    return "auto";
  }

  private _extractPlainText(text: string): string {
    return String(text || "").trim();
  }

  private _parseAnalystResponse(text: string): { audit: string; variants: string[] } {
    const result = {
      audit: "No audit available.",
      variants: [] as string[],
    };

    try {
      // Normalize text to handle potential markdown bolding or case variations
      // We look for "AUDIT:" or "**AUDIT**:" or "## AUDIT" etc.
      // Regex explanation:
      // ^|\n : Start of string or new line
      // [*#]* : Optional markdown chars like ** or ##
      // \s* : Optional whitespace
      // AUDIT : The keyword
      // [*]* : Optional closing markdown chars
      // :? : Optional colon
      const auditRegex = /(?:^|\n)[*#]*\s*AUDIT[*]*:?\s*([\s\S]*?)(?=(?:^|\n)[*#]*\s*VARIANTS|$)/i;
      const variantsRegex = /(?:^|\n)[*#]*\s*VARIANTS[*]*:?\s*([\s\S]*?)$/i;

      // Extract AUDIT section
      const auditMatch = text.match(auditRegex);
      if (auditMatch && auditMatch[1]) {
        result.audit = auditMatch[1].trim();
      }

      // Extract VARIANTS section
      const variantsMatch = text.match(variantsRegex);
      if (variantsMatch && variantsMatch[1]) {
        const variantsText = variantsMatch[1].trim();

        // Check if we have numbered list items
        const hasNumberedList = /^(\d+[\.)]|-)\s+/m.test(variantsText);

        if (hasNumberedList) {
          const lines = variantsText.split('\n');
          let currentVariant = '';

          for (const line of lines) {
            // Match numbered lists: "1. ", "1)", "- "
            const match = line.match(/^(\d+[\.)]|-)\s+(.*)/);
            if (match) {
              if (currentVariant) {
                result.variants.push(currentVariant.trim());
              }
              currentVariant = match[2];
            } else {
              if (currentVariant) {
                currentVariant += '\n' + line;
              } else if (line.trim()) {
                // Handle unnumbered lines at start
                if (!currentVariant && result.variants.length === 0) {
                  currentVariant = line.trim();
                }
              }
            }
          }
          if (currentVariant) {
            result.variants.push(currentVariant.trim());
          }
        } else {
          // Fallback: Split by double newlines for unnumbered paragraphs/titles
          const chunks = variantsText.split(/\n\s*\n/);
          for (const chunk of chunks) {
            if (chunk.trim()) {
              result.variants.push(chunk.trim());
            }
          }
        }

        // Final Fallback: if still empty but text exists
        if (result.variants.length === 0 && variantsText.length > 0) {
          result.variants.push(variantsText);
        }
      }
    } catch (e) {
      console.warn("[PromptRefinerService] Failed to parse analyst response:", e);
    }

    return result;
  }

  /**
  * Run the Author role independently.
  */
  /**
   * Run the Author role independently (Delegates to Composer).
   */
  async runAuthor(
    fragment: string,
    turnContext: TurnContext | null,
    authorModelId?: string,
    isInitialize: boolean = false
  ): Promise<{ authored: string; explanation: string } | null> {
    const result = await this.runComposer(fragment, turnContext, authorModelId);
    if (!result) return null;
    return { authored: result.refinedPrompt, explanation: result.explanation };
  }

  /**
   * Run the Analyst role independently.
   */
  async runAnalyst(
    fragment: string,
    turnContext: TurnContext | null,
    authoredPrompt?: string,
    analystModelId?: string,
    originalPrompt?: string
  ): Promise<{ audit: string; variants: string[] } | null> {
    try {
      const analystId = analystModelId || this.analystModel;
      const contextSection = this._buildContextSection(turnContext);
      // If authoredPrompt is missing, we analyze the fragment (originalPrompt or fragment)
      const targetPrompt = authoredPrompt || "";
      // If we have an original prompt distinct from fragment (e.g. in chained flow), we might want to show it.
      // For now, _buildAnalystPrompt takes fragment and authored.
      // If authored is empty, it relies on fragment.
      const analystPrompt = this._buildAnalystPrompt(originalPrompt || fragment, contextSection, targetPrompt);

      console.log(`[PromptRefinerService] Running Analyst (${analystId})...`);
      const analystResponseRaw = await this._callModel(analystId, analystPrompt);
      const analystText = this._extractPlainText(analystResponseRaw?.text || "");
      return this._parseAnalystResponse(analystText);
    } catch (e) {
      console.warn("[PromptRefinerService] Analyst run failed:", e);
      return null;
    }
  }

  /**
   * Run the Refiner role independently.
   */
  async runRefiner(
    draftPrompt: string,
    turnContext: TurnContext | null,
    refinerModelId?: string
  ): Promise<RefinerResult | null> {
    return this.runComposer(draftPrompt, turnContext, refinerModelId);
  }

  private _parseRefinerResponse(text: string): RefinerResult {
    const result = {
      refinedPrompt: text,
      explanation: "",
    };

    try {
      // Look for REFINED_PROMPT: and NOTES:
      const refinedRegex = /(?:^|\n)[*#]*\s*REFINED(?:_|\\_)\s*PROMPT[*]*:?\s*([\s\S]*?)(?=(?:^|\n)[*#]*\s*NOTES|$)/i;
      const notesRegex = /(?:^|\n)[*#]*\s*NOTES[*]*:?\s*([\s\S]*?)$/i;

      const refinedMatch = text.match(refinedRegex);
      const notesMatch = text.match(notesRegex);

      if (refinedMatch && refinedMatch[1]) {
        result.refinedPrompt = refinedMatch[1].trim();
      }

      // If no explicit REFINED_PROMPT tag found, check if the text seems to be just the prompt
      // But the system prompt instructs to use the tag. If missing, we might want to return the whole text 
      // or try to infer. For now, if regex fails, we assume the whole text is the prompt if it's short, 
      // or we might have failed to parse. 
      // Actually, if the model follows instructions, it should have the tag. 
      // If not, let's fallback to returning the whole text as refined prompt if it doesn't look like a meta-conversation.
      if (!refinedMatch && !notesMatch) {
        // Fallback: assume entire text is the prompt
        result.refinedPrompt = text.trim();
      }

      if (notesMatch && notesMatch[1]) {
        result.explanation = notesMatch[1].trim();
      }
    } catch (e) {
      console.warn("[PromptRefinerService] Failed to parse refiner response:", e);
    }

    return result;
  }
}

const REFINER_SYSTEM_PROMPT = `You are the hinge between the user and a bank of parallel AI models.

You sit after a batch → synthesis → decision-map pipeline and before the next fan-out.
Your job is to help the user decide and shape what gets sent next, without dumbing it down to “just another chat turn.”

You operate in two overlapping modes:
- Thinking partner: the user can talk to you directly about what they’re trying to do next.
- Prompt refiner: the user can hand you a draft of what they want to send, and you sharpen it.

You ALWAYS have access to:
\${contextSection}

The user’s latest input is wrapped as:

<DRAFT_PROMPT>
\${draftPrompt}
</DRAFT_PROMPT>

Your first task is to infer how to treat it.

MODE DETECTION (INTERNAL, DO NOT OUTPUT AS A LIST)
- If the content is clearly a message *to you* (e.g. “what do you think we should do next?”, “how would you probe B?”, “I want to push on trade-offs here”), treat it as meta-intent.
- If the content reads like something they want the other models to answer (an instruction, a question, a spec), treat it as a draft prompt.
- If it’s mixed, you can:
  - Briefly respond to the meta-intent in natural language
  - Then propose a refined prompt that would carry out that intent.

ANALYSIS FRAMEWORK (INTERNAL, NEVER OUTPUT AS A NUMBERED LIST)
When you are refining or proposing a next prompt, silently consider:
- Intent Inference
  - What is the user actually trying to do at this point in the exploration (explore, decide, stress-test, pivot, implement)?
  - How does this connect to the synthesis and decision map they just saw?
- Clarity Check
  - Where could models misinterpret this or bifurcate into useless branches?
  - What needs to be anchored or constrained?
- Context Completeness
  - What from the prior pipeline needs to be made explicit so the next batch isn’t blind?
  - What can stay implicit to avoid verbosity?
- Continuity
  - Does this clearly build on where we left off, or is it a pivot?
  - If it’s a pivot, should that be stated?
- Strategic Framing
  - Is this shaped to elicit depth, tensions, and trade-offs rather than shallow “answers”?
  - Is it aligned with the user’s current priority (breadth scan, deep dive, failure modes, creative divergence, implementation, etc.)?

OUTPUT STYLE
- Always respond to the user in a single, fluid block of text — no bullet lists, no step-by-step scaffolding.
- You may use short headings like “REFINED_PROMPT:” and “NOTES:” as anchors, but the prose under them should read like natural language, not schemas.

OUTPUT LOGIC

1. If the user is mainly speaking to YOU (meta-intent):

   - First, answer them directly as a collaborator:
     - Briefly reflect what you think they’re trying to achieve next.
     - Suggest where the highest-leverage next question or angle probably is, given the context.

   - Then, offer a concrete next prompt they could send to the batch:

     REFINED_PROMPT:
     [A single, polished prompt that implements the intent you just discussed, preserving their voice and direction.]

   - Optionally, add:

     NOTES:
     [2–4 sentences explaining what you assumed about their intent, what you emphasized or de-emphasized, and what kind of responses this prompt is optimized to produce.]

2. If the user is clearly giving you a draft prompt:

   - Do NOT treat it like a question to answer yourself.
   - Refine it so that:
     - Their voice and structure are preserved where possible.
     - Ambiguity that would harm answer quality is reduced.
     - Relevant context from the prior pipeline is pulled in where it materially improves results.

   - Then output:

     REFINED_PROMPT:
     [Your improved version that captures the user’s true intent and maximizes response quality. If no changes are needed, return the original.]

     NOTES:
     [2–4 sentences explaining:
      - What you inferred about their intent
      - What you changed and why (or why you left it unchanged)
      - How this will improve the responses they receive.]

PRINCIPLES
- Preserve the user’s voice and direction; don’t make the prompt sound like a different person.
- Add clarity without adding unnecessary verbosity.
- Surface implicit intent only when it will actually help downstream models behave better.
- Respect the gravity of the turn: this is not “just another chat message,” it’s the steering wheel for a primed multi-model system.
- When in doubt between being clever and being clear, choose clear.

Begin.`;
