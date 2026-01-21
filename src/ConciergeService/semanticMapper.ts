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

import { projectParagraphs } from '../shadow';
import type { ShadowParagraph, ShadowStatement, ParagraphProjectionResult } from '../shadow';
import type { ParagraphCluster, ClusteringResult } from '../clustering';
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

function formatSignalsBooleans(signals: { sequence: boolean; tension: boolean; conditional: boolean }): string {
  const out: string[] = [];
  if (signals.sequence) out.push('SEQ');
  if (signals.tension) out.push('TENS');
  if (signals.conditional) out.push('COND');
  return out.length > 0 ? out.join(',') : 'none';
}

function formatShadowParagraphsForPrompt(paragraphs: ShadowParagraph[]): string {
  const groupedByModel: Record<string, ShadowParagraph[]> = {};

  for (const p of paragraphs) {
    const key = `model_${p.modelIndex}`;
    if (!groupedByModel[key]) groupedByModel[key] = [];
    groupedByModel[key].push(p);
  }

  return JSON.stringify(
    Object.fromEntries(
      Object.entries(groupedByModel).map(([key, paras]) => [
        key,
        paras.map(p => ({
          id: p.id,
          modelIndex: p.modelIndex,
          paragraphIndex: p.paragraphIndex,
          statementIds: p.statementIds,
          dominantStance: p.dominantStance,
          stanceHints: p.stanceHints,
          contested: p.contested,
          confidence: p.confidence,
          signals: p.signals,
          statements: p.statements,  // Contains text (single copy)
        }))
      ])
    )
  );
}

function formatClustersForPrompt(
  clusters: ParagraphCluster[],
  maxClusters: number = MAX_CLUSTERS_IN_PROMPT
): string {
  // Already sorted uncertain-first by engine, but verify and cap
  const sortedClusters = [...clusters].sort((a, b) => {
    if (a.uncertain && !b.uncertain) return -1;
    if (!a.uncertain && b.uncertain) return 1;
    return b.paragraphIds.length - a.paragraphIds.length;
  });

  // Ensure all uncertain clusters are included, then fill to cap
  const uncertainClusters = sortedClusters.filter(c => c.uncertain);
  const certainClusters = sortedClusters.filter(c => !c.uncertain);
  const remainingSlots = Math.max(0, maxClusters - uncertainClusters.length);
  const cappedClusters = [
    ...uncertainClusters,
    ...certainClusters.slice(0, remainingSlots)
  ];

  // Do NOT include representativeText - only IDs
  const clusterData = cappedClusters.map(c => ({
    id: c.id,
    paragraphIds: c.paragraphIds,
    statementIds: c.statementIds,
    representativeParagraphId: c.representativeParagraphId,
    cohesion: c.cohesion,
    uncertain: c.uncertain,
    uncertaintyReasons: c.uncertaintyReasons,
    // expansion only for uncertain clusters
    ...(c.expansion ? { expansion: c.expansion } : {}),
  }));

  return JSON.stringify(clusterData);
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
  // Compute paragraphs if not provided
  const actualParagraphResult = paragraphResult || projectParagraphs(shadowStatements);
  const paragraphs = actualParagraphResult.paragraphs;

  // Format paragraphs
  const paragraphBlock = formatShadowParagraphsForPrompt(paragraphs);

  // Format clusters (only if provided)
  let clusterBlock = '';
  if (clusteringResult && clusteringResult.clusters.length > 0) {
    clusterBlock = formatClustersForPrompt(clusteringResult.clusters);
  }

  return `You are a Semantic Cartographer. Your task is to organize extracted statements into claims with structural relationships.

<user_query>
"${userQuery}"
</user_query>

<shadow_paragraphs>
${paragraphBlock}
</shadow_paragraphs>

${clusterBlock ? `<paragraph_clusters>
${clusterBlock}
</paragraph_clusters>` : ''}

# Your Task

1. **Discover Claims**: Group statements pointing to the same position into a single claim. Name each claim with a short verb phrase.

2. **Trace Relationships**:
   - **Conditional gates**: Claims that only apply if some condition is true
   - **Prerequisite gates**: Claims whose validity depends on another claim
   - **Conflicts**: Claims that are mutually exclusive

3. For every gate or conflict, provide a **question** that would resolve it in concrete, human terms.

# Using the Input

- **shadow_paragraphs**: Contains statements grouped by model and paragraph. Each statement has an id (s_*), text, stance, and signals.
- **paragraph_clusters** (if present): Hints about which paragraphs express similar ideas. Use for grouping guidance.
  - If a cluster has \`uncertain: true\`, examine the \`expansion.members\` texts carefully and consider splitting into multiple claims.
  - If a paragraph has \`contested: true\`, it may contain multiple distinct positions - do not force into a single claim.
  - Clusters are HINTS only - you may split or ignore them based on semantic analysis.

# Schema Lock (Strict)

- Respond with a single JSON object only (no markdown, no prose).
- Do not output an "edges" field anywhere.
- The only relationship fields are "enables" and "conflicts".
- Every gate and every conflict must include a non-empty "question".
- **Never cite paragraph IDs (p_*) or cluster IDs (pc_*), only statement IDs (s_*).**

# Output Format

\`\`\`json
{
  "claims": [
    {
      "id": "c_0",
      "label": "make traversal the primary UI surface",
      "description": "The traversal/validity state should be the main view users interact with",
      "stance": "prescriptive",
      "gates": {
        "conditionals": [
          {
            "id": "cg_0",
            "condition": "semantic mapping produces non-narrative output",
            "question": "Is the semantic mapper output machine-legible rather than human-readable?",
            "sourceStatementIds": ["s_1", "s_39"]
          }
        ],
        "prerequisites": []
      },
      "enables": ["c_1"],
      "conflicts": [],
      "sourceStatementIds": ["s_1", "s_39", "s_40"]
    }
  ]
}
\`\`\`

# Field Names
- Claims: id, label, description?, stance, gates, enables, conflicts, sourceStatementIds
- Conditional gate: id, condition, question, sourceStatementIds
- Prerequisite gate: id, claimId, condition, question, sourceStatementIds
- Conflict: claimId, question, sourceStatementIds, nature?

# Provenance Requirements (Non-Negotiable)
- Every claim must include ≥1 sourceStatementId.
- Every gate must include ≥1 sourceStatementId.
- Every conflict must include ≥1 sourceStatementId.

Generate the map now.`;
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
