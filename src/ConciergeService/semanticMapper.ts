// ═══════════════════════════════════════════════════════════════════════════
// SEMANTIC MAPPER - PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════
//
// v1.1: Receives pre-computed paragraph projection and clustering.
// Prompt builder is SYNC - all async work done in StepExecutor.
//
// Critical invariants:
// - No text duplication (statements appear once)
// - Clusters contain IDs only (no representativeText)
// - Uncertain clusters listed first
// - Expansion uses _fullParagraph only
// ═══════════════════════════════════════════════════════════════════════════

import type { ShadowParagraph, ShadowStatement, ParagraphProjectionResult } from '../shadow';
import type { ClusteringResult } from '../clustering';
import { SemanticMapperOutput } from './contract';
import {
  parseSemanticMapperOutput as baseParseOutput
} from '../../shared/parsing-utils';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const MAX_CLUSTERS_IN_PROMPT = 15;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const STANCE_CODES: Record<string, string> = {
  prescriptive: 'P',
  cautionary: 'C',
  assertive: 'A',
  uncertain: 'U',
  prerequisite: 'R',
  dependent: 'D',
};

const STANCE_LEGEND = 'P=prescriptive C=cautionary A=assertive U=uncertain R=prerequisite D=dependent';

function buildCompactStatementBlock(paragraphs: ShadowParagraph[]): string {
  const lines: string[] = [];
  let currentModel = -1;

  for (const p of paragraphs) {
    if (p.modelIndex !== currentModel) {
      currentModel = p.modelIndex;
      if (lines.length > 0) lines.push('');
      lines.push(`[M${currentModel}]`);
    }

    const contestedMarker = p.contested ? '*' : '';
    lines.push(`${contestedMarker}${p.id}:`);

    for (const s of p.statements) {
      const stanceCode = STANCE_CODES[s.stance] || 'A';
      lines.push(`  ${s.id}|${stanceCode}|${s.text}`);
    }
  }

  return lines.join('\n');
}

function buildCompactClusterBlock(clusteringResult: ClusteringResult): string | null {
  const usefulClusters = clusteringResult.clusters.filter(c =>
    c.paragraphIds.length > 1 || c.uncertain
  );

  if (usefulClusters.length === 0) return null;

  const sortedClusters = [...usefulClusters].sort((a, b) => {
    if (a.uncertain && !b.uncertain) return -1;
    if (!a.uncertain && b.uncertain) return 1;
    return b.paragraphIds.length - a.paragraphIds.length;
  });

  const lines = sortedClusters.slice(0, Math.min(MAX_CLUSTERS_IN_PROMPT, 12)).map(c => {
    const flags: string[] = [];
    if (c.uncertain) flags.push('?');
    if (c.uncertaintyReasons.includes('low_cohesion')) flags.push('L');
    if (c.uncertaintyReasons.includes('stance_diversity')) flags.push('S');

    const flagStr = flags.length > 0 ? `[${flags.join('')}]` : '';
    return `${c.id}:${c.representativeParagraphId}|${c.paragraphIds.join(',')}|${c.cohesion.toFixed(2)}${flagStr}`;
  });

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build semantic mapper prompt.
 * 
 * v1.1: Accepts optional pre-computed paragraph projection and clustering results.
 * If not provided, falls back to inline paragraph projection (no clustering).
 */
export function buildSemanticMapperPrompt(
  userQuery: string,
  shadowStatements: ShadowStatement[],
  paragraphResult?: ParagraphProjectionResult,
  clusteringResult?: ClusteringResult | null
): string {
  const statementsBlock = paragraphResult
    ? buildCompactStatementBlock(paragraphResult.paragraphs)
    : shadowStatements.map(s => `${s.id}|${STANCE_CODES[s.stance] || 'A'}|${s.text}`).join('\n');

  const clusterBlock = clusteringResult ? buildCompactClusterBlock(clusteringResult) : null;
  const clusterSection = clusterBlock
    ? `\n<clusters>\n${clusterBlock}\n</clusters>`
    : '';

  if (clusterBlock) {
    console.log(`[SemanticMapper] Including clusters`);
  } else {
    console.log(`[SemanticMapper] Skipping cluster block`);
  }

  const shapeSignal = `Stance codes: ${STANCE_LEGEND}`;

  return `You are the Epistemic Cartographer. Your mandate is the Incorruptible Distillation of Signal—preserving every incommensurable insight while discarding only connective tissue that adds nothing to the answer.

${shapeSignal}

<user_query>
${userQuery}
</user_query>

<statements>
${statementsBlock}
</statements>${clusterSection}

# Task

You are not a synthesizer. Your job: Index positions, not topics.

A position is a stance—something that can be supported, opposed, or traded against another.

- Where multiple sources reach the same position → note convergence
- Where only one source sees something → preserve as singularity  
- Where sources oppose each other → map the conflict
- Where they optimize for different ends → map the tradeoff
- Where one position depends on another → map the prerequisite
- What no source addressed but matters → these are the ghosts

Every distinct position receives a canonical label and sequential ID. That exact pairing—**[Label|claim_N]**—binds your map to your narrative.

# Output

Produce two outputs: <map> and <narrative>

<map>
A JSON object with three arrays:

**claims**: each has:
- id: sequential ("claim_1", "claim_2", ...)
- label: verb-phrase expressing a position (stance that can be agreed with, opposed, traded off)
- text: the mechanism, evidence, or reasoning (one sentence)
- supporters: array of model indices that expressed this
- type: epistemic nature
  - factual: verifiable truth
  - prescriptive: recommendation or ought-statement
  - conditional: truth depends on unstated context
  - contested: models actively disagree
  - speculative: prediction or uncertain projection
- role: "challenger" if this questions a premise or reframes; null otherwise
- challenges: if challenger, the claim_id being challenged; null otherwise

**edges**: each has:
- from: source claim_id
- to: target claim_id  
- type:
  - supports: from reinforces to
  - conflicts: from and to cannot both be true
  - tradeoff: from and to optimize for different ends
  - prerequisite: to depends on from being true

**ghosts**: what no source addressed that would matter. Null if none.
</map>

<narrative>
Not a summary. A landscape the reader walks through. Use **[Label|claim_id]** anchors.

Begin with the governing variable—if tradeoff or conflict edges exist, name the dimension along which the answer pivots.

Signal the shape: converging? splitting into camps? sequential chain?

Establish the ground: claims with broad support are the floor.

Move to the tension: claims with conflict or tradeoff edges. Present opposing positions—the axis should be visible in the verb-phrases. Do not resolve; reveal what choosing requires.

Surface the edges: claims with few supporters but high connectivity, or challenger role. Place adjacent to what they challenge.

Close with what remains uncharted. Ghosts are the boundary.

Do not synthesize a verdict. The landscape is the product.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSER WRAPPER
// ═══════════════════════════════════════════════════════════════════════════

export interface ParseResult {
  success: boolean;
  output?: SemanticMapperOutput;
  errors?: Array<{ field: string; issue: string; context?: string }>;
  warnings?: string[];
}

/**
 * Wrapper around the shared parser that provides specific SemanticMapperOutput typing.
 */
export function parseSemanticMapperOutput(
  rawResponse: string,
  shadowStatements: ShadowStatement[]
): ParseResult {
  const validIds = new Set(shadowStatements.map(s => s.id));
  const result = baseParseOutput(rawResponse, validIds);

  function isSemanticMapperOutput(parsed: unknown): parsed is SemanticMapperOutput {
    return (
      parsed !== null &&
      typeof parsed === 'object' &&
      'claims' in parsed &&
      Array.isArray((parsed as { claims: unknown }).claims)
    );
  }

  const output = isSemanticMapperOutput(result.output) ? result.output : undefined;
  const errors = result.errors ? [...result.errors] : [];
  if (result.success && !output) {
    errors.push({ field: 'output', issue: 'Invalid SemanticMapperOutput shape' });
  }

  return {
    success: result.success && !!output,
    output: output,
    errors: errors,
    warnings: result.warnings
  };
}
