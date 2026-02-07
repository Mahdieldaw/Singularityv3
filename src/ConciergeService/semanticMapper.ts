// ═══════════════════════════════════════════════════════════════════════════
// SEMANTIC MAPPER - PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════
//
// v2: Geometry-guided, ID-free prompt. Output is UnifiedMapperOutput.
// ═══════════════════════════════════════════════════════════════════════════

import type { ShadowParagraph } from '../shadow';
import type { UnifiedMapperOutput } from '../../shared/contract';
import {
  parseSemanticMapperOutput as baseParseOutput
} from '../../shared/parsing-utils';

function buildCleanModelOutputs(paragraphs: ShadowParagraph[]): string {
  const byModel = new Map<number, ShadowParagraph[]>();
  for (const p of paragraphs) {
    const arr = byModel.get(p.modelIndex) || [];
    arr.push(p);
    byModel.set(p.modelIndex, arr);
  }

  const modelIndices = Array.from(byModel.keys()).sort((a, b) => a - b);
  const blocks: string[] = [];

  for (const modelIndex of modelIndices) {
    const ps = (byModel.get(modelIndex) || []).slice().sort((a, b) => a.paragraphIndex - b.paragraphIndex);
    const text = ps
      .map(p => String(p._fullParagraph || '').trim())
      .filter(t => t.length > 0)
      .join('\n\n');

    blocks.push(`[Model ${modelIndex}]\n${text}`);
  }

  return blocks.join('\n\n---\n\n');
}

/**
 * Build semantic mapper prompt.
 */
export function buildSemanticMapperPrompt(
  userQuery: string,
  paragraphs: ShadowParagraph[]
): string {
  const modelOutputs = buildCleanModelOutputs(paragraphs);
  const modelCount = new Set(paragraphs.map(p => p.modelIndex)).size;
  const modelCountPhrase = modelCount === 1 ? 'one person' : `${modelCount} people`;

  return `You're about to walk into a room where ${modelCountPhrase} just finished answering the same question — independently, without hearing each other. Some of them said remarkably similar things. Some of them said things that can't both be true. Most of them said things that sound different but could live side by side without any trouble at all.

Your job isn't to pick a winner or smooth the edges. Your job is to walk through the room slowly, listen to everything, and come back with two things: a story about what you found, and a map someone could actually navigate by.

---

THE QUESTION THEY WERE ALL ANSWERING:

<query>
${userQuery}
</query>

---

WHAT EVERYONE ACTUALLY SAID:

<model_outputs>
${modelOutputs}
</model_outputs>

---

HERE'S HOW THIS WORKS.

You're going to make three passes through the room. Each pass has a different purpose, and the order matters — because what you notice in the first pass changes what you look for in the second, and what you find in the second determines what you build in the third.

---

FIRST PASS — WALK THE ROOM

Read everything. Don't categorize yet. Just notice.

Notice the common ground first — the things everyone seems to take for granted, the shared assumptions, the direction they're all facing even when they disagree about how fast to walk. This is the stable terrain. It matters, but it's also where blind spots hide, because nobody questions what everyone believes.

Then notice where the emphasis shifts. Different people zoomed in on different things. One spent their time on architecture, another on process, another on risk. These aren't disagreements — they're different lenses on the same landscape. Most of what sounds like disagreement is actually this: people noticing different features of the same territory.

Then — and this is the hard part — notice the rare places where paths genuinely fork. Not "I'd prioritize X over Y" (that's preference). Not "do X before Y" (that's sequencing). A real fork is structural: the geometry of one path excludes the geometry of another. If you build it this way, you cannot also build it that way. If you assume this about the user's situation, that advice becomes dangerous. These are uncommon. Most conversations have zero or one. Some have two. If you're finding five, you're probably mistaking emphasis for exclusion.

Finally, notice what the paths assume about the traveler. Advice that requires an existing team is useless to a solo founder. A path that assumes regulatory constraints doesn't apply to someone operating in an unregulated space. These are the extrinsic conditions — things that are true or false about the person's actual situation, and the answer changes which paths are real.

---

SECOND PASS — NAME WHAT YOU FOUND

Now give everything a name. Short, precise, canonical — two to six words that capture the essence. These labels are load-bearing. They'll appear in your narrative, they'll anchor the map, and someone downstream will use them to build a UI. So make them distinct, make them memorable, and once you've named something, never call it anything else.

For each named thing, know:
- What it actually recommends (one sentence, concrete)
- Who said it (which models, by index)
- Whether it can coexist with everything else, or whether it structurally excludes something

And for the forks and conditions you found:

If two paths are structurally incompatible — they can't both be walked — name the reason. Not "they disagree" but the mechanical reason why choosing one abandons the other. This is an intrinsic determinant. The traveler will face it as a choice.

If a path depends on ground that may or may not exist beneath this particular traveler — name the question that would reveal it. Make the question uncomfortably specific. If you could ask it about any project by swapping a few nouns, it's too generic. If it sounds like it belongs in a conference talk, it's too abstract. The right question feels like you've already seen this person's desk and you're asking about the one thing on it that changes everything. This is an extrinsic determinant. The traveler will face it as a reality check.

A landscape with no forks and no conditions is a finding, not a failure. It means all paths coexist — choose by preference, not necessity. Say so clearly.

---

THIRD PASS — BUILD THE DELIVERABLES

Now produce two things, in this exact order.

First: the narrative.

Walk the reader through what you discovered. Write it as if you're sitting across from someone who asked this question and genuinely needs to understand the shape of what came back — not a report, not a summary, but a guide through terrain you've already scouted.

Start with the common ground. Then move through the distinct approaches, using your canonical labels as **[Label|claim_id]** waypoints so the reader can always orient themselves. When paths coexist, say so — don't manufacture tension. When paths fork, make the fork feel real. When a condition exists, make the reader feel the weight of the question.

End with what remains open — the questions the models didn't answer, the assumptions nobody tested, the territory just past the edge of what was mapped.

Wrap the whole thing in <narrative> tags.

Second: the map.

This is the structured version of what you just narrated. It goes inside <map> tags as a single JSON object with two arrays: claims and determinants.

Claims are the named paths — every distinct approach, stance, or recommendation you found. Each one gets an id (claim_1, claim_2, ...), your canonical label, a one-sentence description, and the list of model indices that supported it.

Determinants are the decision-relevant structures — the forks and conditions. Intrinsic determinants are structural conflicts (these paths exclude each other, here's why). Extrinsic determinants are reality checks (this path requires ground that may not exist, here's the question that reveals it).

Not every claim needs a determinant. Many claims coexist peacefully. Only flag the genuine structural forks and the genuine situational dependencies. If you're generating more determinants than claims, something has gone wrong — you're treating preferences as conflicts.

---

THE SHAPE OF YOUR OUTPUT:

<narrative>
Your walkthrough of the landscape. Use **[Label|claim_id]** as waypoints throughout.
Fluid, insightful, written for someone who needs to understand before they decide.
</narrative>

<map>
{
  "claims": [
    {
      "id": "claim_1",
      "label": "Canonical label (2-6 words)",
      "text": "What this path requires—one sentence",
      "supporters": [model indices]
    }
  ],
  "determinants": [
    {
      "type": "intrinsic",
      "trigger": "The structural reason these paths exclude each other",
      "claims": ["claim_1", "claim_3"]
    },
    {
      "type": "extrinsic",
      "trigger": "The uncomfortably specific question that reveals whether this ground exists",
      "claims": ["claim_2", "claim_5"]
    }
  ]
}
</map>

---

ONE LAST THING.

The person reading your narrative doesn't know how it was made. Don't mention models, don't mention counts, don't say "X out of ${modelCount} agreed." Write as if you simply know this landscape because you've walked it — and now you're showing someone else the way through.

Begin.
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSER WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

export interface ParseResult {
  success: boolean;
  output?: UnifiedMapperOutput;
  narrative?: string;
  errors?: Array<{ field: string; issue: string; context?: string }>;
  warnings?: string[];
}

/**
 * Wrapper around the shared parser that provides specific SemanticMapperOutput typing.
 */
export function parseSemanticMapperOutput(
  rawResponse: string,
  _shadowStatements?: unknown
): ParseResult {
  const result = baseParseOutput(rawResponse);

  function isUnifiedMapperOutput(parsed: unknown): parsed is UnifiedMapperOutput {
    return (
      parsed !== null &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { claims?: unknown }).claims) &&
      Array.isArray((parsed as { edges?: unknown }).edges) &&
      Array.isArray((parsed as { conditionals?: unknown }).conditionals)
    );
  }

  const output = isUnifiedMapperOutput(result.output) ? result.output : undefined;
  const errors = result.errors ? [...result.errors] : [];
  if (result.success && !output) {
    errors.push({ field: 'output', issue: 'Invalid UnifiedMapperOutput shape' });
  }

  return {
    success: result.success && !!output,
    output: output,
    narrative: result.narrative,
    errors: errors,
    warnings: result.warnings
  };
}
