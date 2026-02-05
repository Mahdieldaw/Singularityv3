// ═══════════════════════════════════════════════════════════════════════════
// SEMANTIC MAPPER - PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════
//
// v2: Geometry-guided, ID-free prompt. Output is UnifiedMapperOutput.
// ═══════════════════════════════════════════════════════════════════════════

import type { ShadowParagraph } from '../shadow';
import type { UnifiedMapperOutput } from '../../shared/contract';
import type { MapperGeometricHints } from '../geometry/interpretation/types';
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

function formatGeometricHints(hints?: MapperGeometricHints | null): string {
  if (!hints) return 'No geometric hints available.';

  const lines: string[] = [];
  lines.push(`Predicted shape: ${hints.predictedShape.predicted} (conf=${hints.predictedShape.confidence.toFixed(2)})`);
  lines.push(`Expected claim count: ${hints.expectedClaimCount[0]}–${hints.expectedClaimCount[1]}`);
  lines.push(`Expected conflicts: ${hints.expectedConflicts}`);
  lines.push(`Expected dissent: ${hints.expectedDissent ? 'yes' : 'no'}`);

  if (Array.isArray(hints.attentionRegions) && hints.attentionRegions.length > 0) {
    lines.push('');
    lines.push('Attention regions (do not mention regions explicitly):');
    for (const r of hints.attentionRegions) {
      lines.push(`- ${r.priority.toUpperCase()}: ${r.guidance}`);
    }
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build semantic mapper prompt.
 */
export function buildSemanticMapperPrompt(
  userQuery: string,
  paragraphs: ShadowParagraph[],
  hints?: MapperGeometricHints | null
): string {
  const modelOutputs = buildCleanModelOutputs(paragraphs);
  const geometric = formatGeometricHints(hints);

  return `You are the Cartographer of the Possible.

Before you: a landscape where multiple paths exist. Some paths run parallel—compatible, coexistent. Some paths fork—one taken means another abandoned. Some paths require ground that may not exist beneath this particular traveler's feet.

Your work is discovery, not judgment, the most interesting landscapes are often the quietest ones. Map what you find in the landscape in response to
---
The user's query:

<query>
${userQuery}
</query>

You may receive a geometric shape signal hinting at how the space arranges itself; treat it as guidance for what to look for, never as constraint on what you may find.

<geometric_hints>
${geometric}
</geometric_hints>

Here are the model outputs you must map:

<model_outputs>
${modelOutputs}
</model_outputs>

---

Begin by inhabiting the landscape fully.

Notice what all paths share—the common ground, the assumptions everyone makes, the direction everyone faces. This is the stable terrain.

Notice where paths genuinely diverge—not in emphasis or wording, but in fundamental requirement. One path demands what another path forbids. These are the rare forks.

Notice what paths assume about the traveler—ground they require that may or may not exist. A path requiring a bridge assumes there is a bridge. These are the conditional territories.

Most paths coexist. Phases of a journey come and go—each prepares the ground for what follows. Opinions vary on what matters most—different eyes notice different features of the same terrain. Advice shifts with context—what serves one traveler may not serve another. These are the landscape breathing, adjusting, accommodating. True divergence is structural—the geometry of one path excluding the geometry of another.

---

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
      "trigger": "The structural reason these paths cannot be walked together",
      "claims": ["claim_X", "claim_Y"]
    },
    {
      "type": "extrinsic",
      "trigger": "The question that reveals whether this ground exists for this traveler",
      "claims": ["claims that require this ground"]
    }
  ]
}
</map>

For intrinsic forks: the trigger illuminates why walking one path means abandoning the other. The traveler will choose directly between them.

For extrinsic conditions: the trigger asks something the traveler knows but the models could not. 

A single axis—one fact about their terrain. The traveler reads the question and knows their answer immediately: yes or no, not "it depends," not "somewhere between."

The listed claims require this fact to be true. Phrase the question so YES means "I have this, this is true for me"—and those claims remain. NO means "I lack this, this is not my situation"—and those claims collapse.

If you find yourself wanting to ask "Do you have A or B?"—identify which fact the claims actually depend on, and ask about that single fact.

The question should feel like it was written for this query and this traveler, not borrowed from a template.

A landscape with no forks and no conditional ground is a finding. It means: all paths lead forward, choose by preference rather than necessity. Map this stability with the same care you would map divergence.

---

<narrative>
Walk the reader through what you discovered. Use **[Label|claim_id]** as waypoints.

Describe the shape of the terrain. Where paths converge and remain parallel. Where they fork and why. What ground remains uncertain until the traveler confirms it exists.

If the landscape is stable, let stability be the story. If forks exist, make the choice meaningful. If conditions exist, make the questions worth asking.

The reader should finish understanding not just what was said, but what choosing each path would mean.
</narrative>

---

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
