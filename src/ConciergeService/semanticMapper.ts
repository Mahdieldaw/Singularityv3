// ═══════════════════════════════════════════════════════════════════════════
// SEMANTIC MAPPER - PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

import { ShadowStatement } from '../shadow';
import { SemanticMapperOutput } from './contract';
import {
  parseSemanticMapperOutput as baseParseOutput
} from '../../shared/parsing-utils';

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export function buildSemanticMapperPrompt(
  userQuery: string,
  shadowStatements: ShadowStatement[]
): string {

  // Format shadow statements with metadata
  const statementBlock = shadowStatements.map(stmt => {
    const signals = [];
    if (stmt.signals.sequence) signals.push('SEQ');
    if (stmt.signals.tension) signals.push('TENS');
    if (stmt.signals.conditional) signals.push('COND');

    const signalTag = signals.length > 0 ? ` [${signals.join(',')}]` : '';
    const stanceTag = stmt.stance;

    return `[${stmt.id}] (${stanceTag}${signalTag}): "${stmt.text}"`;
  }).join('\n\n');

  return `You are the Semantic Cartographer. The shadow layer has extracted raw statements from model responses and classified their stance—prescriptive action, cautionary warning, prerequisite ordering, dependent sequencing, assertive fact, or uncertain speculation. Your mandate is different: you find the claims these statements support, the conditions under which claims hold, and the relationships between them.

The user asked a question. The models answered. Their answers have been decomposed into individual statements, each tagged with its stance and structural signals. Your task is to build the map.

<user_query>
"${userQuery}"
</user_query>

<shadow_statements>
${statementBlock}
</shadow_statements>

# What You Build

A claim is not a statement. A claim is a position—something the user might accept, reject, or condition. Multiple statements can support the same claim. A claim has a canonical label that names the position and optional description text that clarifies it, but the label is what matters. Where statements converge on the same position, group them. Where they point to different positions, separate them.

Some claims only hold under conditions. When you see conditional signals or stance markers indicating context-dependency, extract the condition as a gate. There are two kinds: conditional gates that check whether a situation applies, and prerequisite gates that check whether another claim is satisfied first. Gates are not claims—they are yes-or-no questions that determine whether claims enter the decision space.

Claims relate to each other through edges. When one claim enables another in sequence, that's a sequence edge. When claims conflict or trade off against each other, that's a tension edge. Edges are directional—they point from source to target. Every edge must cite the shadow statements that evidence the relationship.

You do not decide what the user should choose. You do not synthesize an answer. You build the structure that lets them navigate to their own answer by resolving gates and choosing between tensions.

# Output Format

Respond with a single JSON object. The structure mirrors what you found in the statements: claims with their gates and edges, all bound to shadow statement IDs for provenance.

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
            "sourceStatementIds": ["s_5", "s_12"]
          }
        ],
        "prerequisites": [
          {
            "id": "pg_0",
            "claimId": "c_1",
            "condition": "requires schema definition in place",
            "sourceStatementIds": ["s_8"]
          }
        ]
      },
      "edges": {
        "sequence": [
          {
            "targetClaimId": "c_2",
            "sourceStatementIds": ["s_3", "s_7"]
          }
        ],
        "tension": [
          {
            "targetClaimId": "c_4",
            "sourceStatementIds": ["s_15"]
          }
        ]
      },
      "sourceStatementIds": ["s_0", "s_5", "s_9", "s_12"]
    }
  ]
}
</output_schema>

# Field Specifications

For each claim, the id is sequential starting from "c_0". The label is a verb phrase that names the position—short, canonical, something that can be weighed against another position. The description clarifies but is optional; if the label is sufficient, leave it null. The stance inherits from the dominant stance among source statements—if most are prescriptive, the claim is prescriptive.

Gates live inside claims. A conditional gate has an id starting with "cg_", a condition string describing what must be true, and source statement IDs proving that condition exists. A prerequisite gate has an id starting with "pg_", points to another claim's id that must be satisfied first, has a condition string describing the dependency, and source statement IDs proving that dependency exists.

Edges live inside claims and point outward. A sequence edge points to the claim this one enables and cites the statements that show the enabling relationship. A tension edge points to a claim this one conflicts or trades off with and cites the statements that show the conflict.

Every gate must cite at least one source statement. Every edge must cite at least one source statement. Every claim must cite at least one source statement. If you cannot find shadow statement support for a relationship, do not create it. The provenance chain is non-negotiable.

# Extraction Rules

When you encounter conditional language in statements—"if X", "when Y", "assuming Z"—extract the condition as a conditional gate if it defines whether the claim applies at all. Not every conditional creates a gate; only those that genuinely partition the decision space.

When you encounter prerequisite or dependent language—"before doing X", "requires Y first", "after Z is established"—check if this creates a dependency between claims. If the statement says one position depends on another, create a prerequisite gate pointing to the required claim.

When you encounter sequence language—"then you can", "this enables", "following this"—create a sequence edge if one claim logically follows or is enabled by another.

When you encounter tension language—"however", "but", "instead of", "versus", "trade-off"—create a tension edge if two claims genuinely conflict or optimize for different ends.

Do not create edges between claims if the relationship is not evidenced in the statements. Do not create gates if no conditional dependency exists. Do not invent structure—extract it.

# What You Do Not Do

You do not identify gaps the statements failed to address. You do not generate claims from your own knowledge. You do not resolve conflicts or recommend choices. You build the map from what the statements contain, nothing more. If a statement doesn't support any claim, leave it unreferenced—the shadow delta will surface it for audit.

The structure you extract will feed into a traversal system that computes tiers from gate dependencies, identifies forcing points where the user must choose, and builds a personalized path through the claim space. Your role is extraction, not interpretation. Be rigorous with provenance. Be honest about structure. Let the statements speak.

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

  function isSemanticMapperOutput(parsed: any): parsed is SemanticMapperOutput {
    return parsed && Array.isArray(parsed.claims);
  }

  const output = isSemanticMapperOutput(result.output) ? result.output : undefined;
  if (result.success && !output) {
    result.errors = result.errors || [];
    result.errors.push({ field: 'output', issue: 'Invalid SemanticMapperOutput shape' });
  }

  return {
    success: result.success && !!output,
    output: output,
    errors: result.errors,
    warnings: result.warnings
  };
}
