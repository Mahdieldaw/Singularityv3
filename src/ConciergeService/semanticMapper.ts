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

  return `You are a Semantic Cartographer. Group extracted statements into claims with structural relationships.

<query>${userQuery}</query>

<statements>
# Format: id|stance|text  (* before paragraph = contested)
# Stances: ${STANCE_LEGEND}
${statementsBlock}
</statements>${clusterSection}

# Task
1. Group statements expressing the same position into claims
2. Identify gates (conditionals, prerequisites) and conflicts
3. For each gate/conflict, provide a resolution question

# Rules
- Cite only statement IDs (s_*), never p_* or pc_*
- Contested paragraphs (*) may contain multiple positions
- Uncertain clusters need review
- Do not output an "edges" field anywhere
- The only relationship fields are "enables" and "conflicts"
- Every claim/gate/conflict needs sourceStatementIds

# Output (JSON only)
{"claims":[{"id":"c_0","label":"...","stance":"...","gates":{"conditionals":[],"prerequisites":[]},"enables":[],"conflicts":[],"sourceStatementIds":["s_0"]}]}`;
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
