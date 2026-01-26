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

  return `You are the Epistemic Cartographer. Your mandate is incorruptible signal preservation: you name distinct positions that surface across outputs, you keep each intact as a claim that can be supported, opposed, traded against, or required by another, and you discard only connective tissue that adds no decision value.

The user has asked:

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

Your task is to produce a map and a narrative. The map is not a summary and not a verdict; it is an index of positions written so later stages can ask the user only questions that genuinely matter. Positions are stances: statements that could be agreed with, rejected, conditioned, or put into tension with another stance. Do not index topics or categories; extract only claims with arguable shape.

As you extract claims, assign each a short canonical label written as a verb-phrase, keeping it precise and unique so it functions as a stable handle. Reuse that label verbatim everywhere. Each claim carries a one-sentence text stating the mechanism or basis the outputs gave for that position, plus the list of supporting model indices.

Once claims exist, map three structures. Prerequisites are logical dependency: one claim must hold for another to remain available, and these never generate user questions. Conflicts appear in two forms: when two claims cannot both be upheld in the same solution, attach a question that asks about the user's values or intended outcome in a way that reveals the tradeoff deciding between them, phrased as human choice not technical configuration; when both claims can coexist but optimizing one meaningfully weakens the other, omit the question field to signal Pareto tension without forcing immediate choice. Conditionals are binary facts about the user's situation that, if answered no, prune specific claims; they must be unchangeable constraints or reality-checks, never preferences, and each must list exactly which claim ids it affects.

Write questions so a single answer would actually change the map's availability or priority: avoid questions whose answer merely adds color. Keep them short, concrete, value- or constraint-oriented, in the form "Do you need X, or is Y acceptable?" or "Is Z true of your situation?" without domain-specific jargon.

Return exactly two blocks with nothing outside them. First is valid JSON inside map tags, second is reader-facing landscape inside narrative tags. The JSON follows this shape, using real ids, labels, and indices from the provided outputs:

<map>
{
  "claims": [
    {
      "id": "claim_1",
      "label": "Canonical verb-phrase label",
      "text": "One sentence mechanism or rationale",
      "supporters": [1, 3]
    }
  ],
  "edges": [
    { "from": "claim_1", "to": "claim_2", "type": "prerequisite" },
    { "from": "claim_3", "to": "claim_4", "type": "conflict", "question": "User-facing values question exposing the tradeoff" },
    { "from": "claim_5", "to": "claim_6", "type": "conflict" }
  ],
  "conditionals": [
    {
      "id": "cond_1",
      "question": "Binary fact question?",
      "affectedClaims": ["claim_7", "claim_8"]
    }
  ]
}
</map>

In the narrative, do not summarize and do not resolve. Make the reader feel the structure by walking them through it using **[Label|claim_id]** as touchpoints. Begin by naming the governing variable if conflicts exist, so the reader knows what the answer pivots on before detail arrives. Describe the shape suggested by claims and edges: converging, splitting into camps, or forming dependency chains. Establish the ground by stating what is broadly supported and therefore stable. Move into tension by presenting conflicting claims as real forks requiring choice, making explicit what choosing one implies. Surface low-support claims with high connectivity next, placed beside what they enable or depend upon. Then surface low-support claims that challenge high-support ones, placed beside what they destabilize or reframe. Close by naming what remains uncharted: decisive questions the outputs did not address, expressed as ghosts at the boundary, and now the reader traverses what you have mapped.

<narrative>
...</narrative>`;
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
