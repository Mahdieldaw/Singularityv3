// ═══════════════════════════════════════════════════════════════════════════
// SEMANTIC MAPPER - PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

import { ShadowStatement } from '../shadow';
import { SemanticMapperOutput } from './contract';
import {
  parseSemanticMapperOutput as baseParseOutput
} from '../../shared/parsing-utils';

interface ShadowParagraph {
  id: string;
  modelIndex: number;
  paragraphIndex: number;
  text: string;
  statementIds: string[];
  dominantStance: string;
  confidence: number;
  signals: { sequence: boolean; tension: boolean; conditional: boolean };
  truncated?: boolean;
  statements: Array<{ id: string; text: string; stance: string; signals: string[] }>;
}

interface ParagraphCluster {
  id: string;
  paragraphIds: string[];
  statementIds: string[];
  representativeParagraphId: string;
  representativeText: string;
  cohesion: number;
  uncertain: boolean;
  uncertaintyReasons: string[];
  expansion?: {
    memberParagraphs: Array<{
      paragraphId: string;
      modelIndex: number;
      text: string;
      statementIds: string[];
      dominantStance: string;
      signals: { sequence: boolean; tension: boolean; conditional: boolean };
    }>;
  };
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'with',
  'this', 'that', 'can', 'will', 'what', 'when', 'where',
  'how', 'why', 'who', 'which', 'their', 'there', 'than',
  'then', 'them', 'these', 'those', 'have', 'has', 'had',
  'was', 'were', 'been', 'being', 'from', 'they', 'she',
  'would', 'could', 'should', 'about', 'into', 'through',
]);

function extractSignificantWords(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = normalized.length > 0 ? normalized.split(' ') : [];
  const significant = words.filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  return new Set(significant);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  a.forEach(word => {
    if (b.has(word)) intersection++;
  });

  const union = new Set(a);
  b.forEach(word => union.add(word));
  return union.size > 0 ? intersection / union.size : 0;
}

function clipText(text: string, maxChars: number): { text: string; clipped: boolean } {
  if (text.length <= maxChars) return { text, clipped: false };
  return { text: text.slice(0, Math.max(0, maxChars)).trim(), clipped: true };
}

function projectShadowParagraphs(shadowStatements: ShadowStatement[]): ShadowParagraph[] {
  const MAX_STATEMENT_CHARS = 320;
  const MAX_PARAGRAPH_CHARS = 900;

  const stancePriority: Record<string, number> = {
    prerequisite: 6,
    dependent: 5,
    cautionary: 4,
    prescriptive: 3,
    uncertain: 2,
    assertive: 1,
  };

  const groups = new Map<string, Array<{ stmt: ShadowStatement; sentenceIndex: number; encounter: number }>>();
  for (let encounter = 0; encounter < shadowStatements.length; encounter++) {
    const stmt = shadowStatements[encounter];
    const paragraphIndex = stmt.location?.paragraphIndex ?? 0;
    const sentenceIndex = stmt.location?.sentenceIndex ?? encounter;
    const key = `${stmt.modelIndex}:${paragraphIndex}`;
    const arr = groups.get(key) || [];
    arr.push({ stmt, sentenceIndex, encounter });
    groups.set(key, arr);
  }

  const paragraphKeys = Array.from(groups.keys())
    .map(k => {
      const [modelIndexStr, paragraphIndexStr] = k.split(':');
      return {
        key: k,
        modelIndex: Number(modelIndexStr),
        paragraphIndex: Number(paragraphIndexStr),
      };
    })
    .sort((a, b) => (a.modelIndex - b.modelIndex) || (a.paragraphIndex - b.paragraphIndex) || (a.key < b.key ? -1 : 1));

  const paragraphs: ShadowParagraph[] = [];
  for (let i = 0; i < paragraphKeys.length; i++) {
    const { key, modelIndex, paragraphIndex } = paragraphKeys[i];
    const group = (groups.get(key) || []).slice().sort((a, b) => (a.sentenceIndex - b.sentenceIndex) || (a.encounter - b.encounter) || (a.stmt.id < b.stmt.id ? -1 : 1));
    const statementIds = group.map(g => g.stmt.id);

    const statements = group.map(g => {
      const signals: string[] = [];
      if (g.stmt.signals?.tension) signals.push('TENS');
      if (g.stmt.signals?.sequence) signals.push('SEQ');
      if (g.stmt.signals?.conditional) signals.push('COND');

      const clipped = clipText(String(g.stmt.text || ''), MAX_STATEMENT_CHARS);
      return {
        id: g.stmt.id,
        text: clipped.text,
        stance: String(g.stmt.stance || ''),
        signals
      };
    });

    const joined = group.map(g => String(g.stmt.text || '').trim()).filter(Boolean).join(' ');
    const clippedParagraph = clipText(joined, MAX_PARAGRAPH_CHARS);

    const signalsAgg = group.reduce(
      (acc, g) => ({
        sequence: acc.sequence || !!g.stmt.signals?.sequence,
        tension: acc.tension || !!g.stmt.signals?.tension,
        conditional: acc.conditional || !!g.stmt.signals?.conditional,
      }),
      { sequence: false, tension: false, conditional: false }
    );

    const stanceScores = new Map<string, number>();
    let maxConfidence = 0;
    for (const g of group) {
      const stance = String(g.stmt.stance || '');
      const conf = typeof g.stmt.confidence === 'number' ? g.stmt.confidence : 0;
      maxConfidence = Math.max(maxConfidence, conf);
      const w = conf * (stancePriority[stance] ?? 1);
      stanceScores.set(stance, (stanceScores.get(stance) || 0) + w);
    }

    let dominantStance = 'assertive';
    let bestScore = -Infinity;
    for (const [stance, score] of Array.from(stanceScores.entries())) {
      if (score > bestScore || (score === bestScore && stance < dominantStance)) {
        dominantStance = stance;
        bestScore = score;
      }
    }

    paragraphs.push({
      id: `p_${i}`,
      modelIndex,
      paragraphIndex,
      text: clippedParagraph.text,
      truncated: clippedParagraph.clipped || undefined,
      statementIds,
      dominantStance,
      confidence: maxConfidence,
      signals: signalsAgg,
      statements,
    });
  }

  return paragraphs;
}

export const CLUSTER_CONFIG = {
  MERGE_THRESHOLD: 0.45,
  LOW_COHESION_THRESHOLD: 0.35,
  MAX_CLUSTER_SIZE: 8,
  MAX_EXPANSION_MEMBERS: 6,
  MAX_EXPANSION_CHARS: 1800,
  MAX_MEMBER_TEXT_CHARS: 420,
} as const;

function clusterParagraphs(paragraphs: ShadowParagraph[]): ParagraphCluster[] {
  const paragraphById = new Map(paragraphs.map(p => [p.id, p]));
  const tokensById = new Map(paragraphs.map(p => [p.id, extractSignificantWords(p.text)]));

  const clusters: Array<{ paragraphIds: string[]; repId: string }> = [];
  for (const p of paragraphs) {
    const pTokens = tokensById.get(p.id) || new Set<string>();

    let bestIdx = -1;
    let bestSim = -Infinity;
    for (let i = 0; i < clusters.length; i++) {
      const repTokens = tokensById.get(clusters[i].repId) || new Set<string>();
      const sim = jaccardSimilarity(pTokens, repTokens);
      if (sim > bestSim || (sim === bestSim && i < bestIdx)) {
        bestSim = sim;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestSim >= CLUSTER_CONFIG.MERGE_THRESHOLD) {
      clusters[bestIdx].paragraphIds.push(p.id);
    } else {
      clusters.push({ paragraphIds: [p.id], repId: p.id });
    }
  }

  const out: ParagraphCluster[] = [];
  for (let i = 0; i < clusters.length; i++) {
    const clusterId = `pc_${i}`;
    const paragraphIds = clusters[i].paragraphIds.slice();
    const repId = clusters[i].repId;
    const rep = paragraphById.get(repId);

    const repTokens = tokensById.get(repId) || new Set<string>();
    const sims = paragraphIds.map(pid => {
      const t = tokensById.get(pid) || new Set<string>();
      return { pid, sim: jaccardSimilarity(t, repTokens) };
    });
    const cohesion = sims.length > 0 ? sims.reduce((acc, s) => acc + s.sim, 0) / sims.length : 0;

    const stanceSet = new Set(paragraphIds.map(pid => String(paragraphById.get(pid)?.dominantStance || '')));
    const hasPrescriptive = stanceSet.has('prescriptive');
    const hasCautionary = stanceSet.has('cautionary');
    const hasPrerequisite = stanceSet.has('prerequisite');
    const hasDependent = stanceSet.has('dependent');

    const aggSignals = paragraphIds.reduce(
      (acc, pid) => {
        const s = paragraphById.get(pid)?.signals;
        return {
          sequence: acc.sequence || !!s?.sequence,
          tension: acc.tension || !!s?.tension,
          conditional: acc.conditional || !!s?.conditional,
        };
      },
      { sequence: false, tension: false, conditional: false }
    );

    const uncertaintyReasons: string[] = [];
    if (cohesion < CLUSTER_CONFIG.LOW_COHESION_THRESHOLD) uncertaintyReasons.push('low_cohesion');
    if (stanceSet.size > 2 || (hasPrescriptive && hasCautionary) || (hasPrerequisite && hasDependent)) uncertaintyReasons.push('stance_diversity');
    if (paragraphIds.length > CLUSTER_CONFIG.MAX_CLUSTER_SIZE) uncertaintyReasons.push('oversized');
    if (paragraphIds.length > 1 && aggSignals.tension && aggSignals.conditional) uncertaintyReasons.push('conflicting_signals');

    const statementIds: string[] = [];
    const seen = new Set<string>();
    for (const pid of paragraphIds) {
      const p = paragraphById.get(pid);
      for (const sid of (p?.statementIds || [])) {
        if (!seen.has(sid)) {
          seen.add(sid);
          statementIds.push(sid);
        }
      }
    }

    const cluster: ParagraphCluster = {
      id: clusterId,
      paragraphIds,
      statementIds,
      representativeParagraphId: repId,
      representativeText: rep?.text || '',
      cohesion,
      uncertain: uncertaintyReasons.length > 0,
      uncertaintyReasons,
    };

    if (cluster.uncertain) {
      const byDistance = sims
        .slice()
        .sort((a, b) => (a.sim - b.sim) || (a.pid < b.pid ? -1 : 1));

      const chosen = new Set<string>([repId]);
      if (byDistance.length > 0) chosen.add(byDistance[0].pid);
      for (const d of byDistance) {
        if (chosen.size >= CLUSTER_CONFIG.MAX_EXPANSION_MEMBERS) break;
        chosen.add(d.pid);
      }

      let charBudget = CLUSTER_CONFIG.MAX_EXPANSION_CHARS;
      const memberParagraphs: NonNullable<ParagraphCluster['expansion']>['memberParagraphs'] = [];

      const chosenList = Array.from(chosen).sort((a, b) => (a === repId ? -1 : 0) || (a < b ? -1 : 1));
      for (const pid of chosenList) {
        const p = paragraphById.get(pid);
        if (!p) continue;
        const clipped = clipText(p.text, CLUSTER_CONFIG.MAX_MEMBER_TEXT_CHARS);
        if (charBudget - clipped.text.length < 0) break;
        charBudget -= clipped.text.length;
        memberParagraphs.push({
          paragraphId: p.id,
          modelIndex: p.modelIndex,
          text: clipped.text,
          statementIds: p.statementIds,
          dominantStance: p.dominantStance,
          signals: p.signals,
        });
      }

      cluster.expansion = { memberParagraphs };
    }

    out.push(cluster);
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export function buildSemanticMapperPrompt(
  userQuery: string,
  shadowStatements: ShadowStatement[]
): string {
  const paragraphs = projectShadowParagraphs(shadowStatements);
  const clusters = clusterParagraphs(paragraphs);

  const groupedByModel: Record<string, ShadowParagraph[]> = {};
  for (const p of paragraphs) {
    const key = `model_${p.modelIndex}`;
    if (!groupedByModel[key]) groupedByModel[key] = [];
    groupedByModel[key].push(p);
  }

  const paragraphBlock = JSON.stringify(groupedByModel);
  const clusterBlock = JSON.stringify(clusters.slice(0, 12));
  return `Semantic Cartographer — Descriptive Core Prompt
You find yourself standing in a landscape made entirely of positions.
Each position is an island — an idea that could stand on its own, be rejected, or be held only if certain things are true.
At first, these islands look scattered.
But as you look closer, you notice thin threads between them.
Some threads show order — one island can only be reached after another is settled.
Some show dependence — an island exists only if another one already holds.
And some reveal exclusion — standing on one island collapses another entirely.

Your task is to reveal this landscape.

You are given a set of statements.
They are fragments — partial views of the islands beneath them.

Your first job is to discover the islands:
Group statements that point to the same position into a single claim.
Name each claim with a short verb phrase — something that could be accepted, rejected, or conditioned.

Your second job is to trace the threads:
• When a claim only applies if some condition is true, that is a conditional gate.
• When a claim’s validity depends on another claim being true, that is a prerequisite gate.
• When the conditions of one claim prevent another from surviving, that is a conflict.

These threads are not decoration.
They are the structure that determines which paths are possible.

For every gate or conflict you identify, ask the question that would resolve it.
Not abstractly — as a human decision would actually be made.

You do not choose paths.
You do not collapse the landscape.
You make the structure visible, so choice can occur without confusion.

<user_query>
"${userQuery}"
</user_query>

<shadow_paragraphs>
${paragraphBlock}
</shadow_paragraphs>

<paragraph_clusters>
${clusterBlock}
</paragraph_clusters>

Then (only then) you append the schema.

# Schema Lock (Strict)
- Respond with a single JSON object only (no markdown, no prose).
- Do not output an "edges" field anywhere.
- Do not output "sequence" or "tension" arrays.
- The only relationship fields are "enables" and "conflicts".
- Every gate and every conflict must include a non-empty "question".
- Paragraphs and paragraph clusters are hints for grouping only.
- Never cite paragraph IDs (p_*) or cluster IDs (pc_*), only s_* IDs.
- If a cluster is uncertain=true, split rather than merge.

# Output Format (JSON Only)
<output_schema>
{
  "claims": [
    {
      "id": "c_0",
      "label": "validate inputs at API boundary",
      "description": "Input validation should happen where data enters the system to prevent downstream errors",
      "stance": "prescriptive",
      "gates": {
        "conditionals": [
          {
            "id": "cg_0",
            "condition": "using a web API or service endpoint",
            "question": "Does this system expose a web API or service endpoint?",
            "sourceStatementIds": ["s_5", "s_12"]
          }
        ],
        "prerequisites": [
          {
            "id": "pg_0",
            "claimId": "c_1",
            "condition": "requires schema definition in place",
            "question": "Is a schema definition already in place?",
            "sourceStatementIds": ["s_8"]
          }
        ]
      },
      "enables": ["c_2"],
      "conflicts": [
        {
          "claimId": "c_4",
          "question": "Which matters more: strict validation or development speed?",
          "sourceStatementIds": ["s_15"],
          "nature": "optimization"
        }
      ],
      "sourceStatementIds": ["s_0", "s_5", "s_9", "s_12"]
    }
  ]
}
</output_schema>

# Field Names
Claims: id, label, description?, stance, gates, enables, conflicts, sourceStatementIds
Conditional gate: id, condition, question, sourceStatementIds
Prerequisite gate: id, claimId, condition, question, sourceStatementIds
Conflict: claimId, question, sourceStatementIds, nature?

# ID Conventions
Claims: "c_0", "c_1", ...
Conditional gates: "cg_0", "cg_1", ...
Prerequisite gates: "pg_0", "pg_1", ...

# Provenance Requirements (Non-Negotiable)
- Every claim must include ≥1 sourceStatementId.
- Every gate must include ≥1 sourceStatementId.
- Every conflict must include ≥1 sourceStatementId.

Generate the map now.
`;
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
