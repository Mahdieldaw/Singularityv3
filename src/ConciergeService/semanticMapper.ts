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

  const groupedByModel: Record<string, Array<{ id: string; text: string; stance: string; signals: string[] }>> = {};
  for (const stmt of shadowStatements) {
    const key = `model_${stmt.modelIndex}`;
    const signals: string[] = [];
    if (stmt.signals.tension) signals.push('TENS');
    if (stmt.signals.sequence) signals.push('SEQ');
    if (stmt.signals.conditional) signals.push('COND');

    if (!groupedByModel[key]) groupedByModel[key] = [];
    groupedByModel[key].push({
      id: stmt.id,
      text: stmt.text,
      stance: stmt.stance,
      signals
    });
  }

  const statementBlock = JSON.stringify(groupedByModel, null, 2);

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

<shadow_statements>
${statementBlock}
</shadow_statements>

Then (only then) you append the schema.

# Schema Lock (Strict)
- Respond with a single JSON object only (no markdown, no prose).
- Do not output an "edges" field anywhere.
- Do not output "sequence" or "tension" arrays.
- The only relationship fields are "enables" and "conflicts".
- Every gate and every conflict must include a non-empty "question".

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
