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

  return `You are the Semantic Cartographer.

The shadow layer has extracted raw statements from model responses and classified their stance—prescriptive action, cautionary warning, prerequisite ordering, dependent sequencing, assertive fact, or uncertain speculation.

Your mandate is different: you find the claims these statements support, the conditions under which claims hold, and where those claims conflict.

The user asked a question. The models answered. Their answers have been decomposed into individual statements, each tagged with its stance and structural signals. Your task is to build the map.

<user_query>
"${userQuery}"
</user_query>

<shadow_statements>
${statementBlock}
</shadow_statements>

# What You Build

A claim is a position—something the user might accept, reject, or condition. Multiple statements can support the same claim. Where statements converge on the same position, group them. Where they diverge, separate them.

Each claim has:
- A canonical **label** (verb phrase, concise, required)
- Optional **description** (clarification only, non-authoritative)
- A **stance** (inherited from source statements)

Some claims only hold under conditions. Extract these as **gates**:

1. **Conditional gates** ("if X") — Does this situation apply?
2. **Prerequisite gates** ("requires X") — Is this other claim satisfied first?

Gates must include:
- **condition**: the dependency or context
- **question**: a yes/no question in natural language
- **sourceStatementIds**: provenance (REQUIRED)

Some claims conflict. When two claims genuinely oppose each other—resource competition, optimization trade-offs, mutually exclusive paths—mark the **conflict**.

Conflicts must include:
- **claimId**: the conflicting claim
- **question**: which matters more / which path to take
- **sourceStatementIds**: provenance (REQUIRED)

If you cannot cite statements proving a conflict exists, do not output it.

You do not decide. You do not synthesize. You map the decision landscape.

# Output Format

Respond with a single JSON object. The structure mirrors what you found in the statements: claims with their gates and conflicts, all bound to shadow statement IDs for provenance.

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

# Field Specifications

**Claims:**
- **id**: sequential, "c_0", "c_1", ...
- **label**: verb phrase, canonical, concise (required)
- **description**: optional clarification (omit if label suffices)
- **stance**: dominant stance from source statements

**Gates:**
- **Conditional**: id "cg_N", condition text, **question** (natural language), sourceStatementIds
- **Prerequisite**: id "pg_N", claimId (required claim), condition text, **question** (natural language), sourceStatementIds

**Relationships:**
- **enables**: claim IDs this facilitates (use sparingly—most sequence is captured by prerequisite gates)
- **conflicts**: array of ConflictEdge objects with claimId, **question**, sourceStatementIds (REQUIRED), optional nature

**Provenance (non-negotiable):**
- Every gate: ≥1 sourceStatementId
- Every conflict: ≥1 sourceStatementId
- Every claim: ≥1 sourceStatementId

If you cannot cite supporting statements, do not output the relationship.

# Extraction Rules

**Conditional gates:**
Extract when statements use "if X", "when Y", "assuming Z" and the condition genuinely determines whether the claim exists in the decision space.

Not every conditional creates a gate—only those that partition the problem.

**Prerequisite gates:**
Extract when statements indicate hard dependencies: "before doing X", "requires Y first", "after Z is established".

Only create a gate if one claim cannot be acted on until another is satisfied.

**Enables (use sparingly):**
Only use if a claim facilitates another WITHOUT being a hard requirement.

Example: "TypeScript makes validation easier" (enables, but doesn't require)

Most sequence is captured by prerequisite gates. Do not duplicate.

**Conflicts (provenance required):**
Extract when claims genuinely oppose each other:
- Resource competition (memory vs. speed)
- Optimization trade-offs (latency vs. flexibility)
- Mutually exclusive paths (REST vs. GraphQL)

Tension signals ("however", "but") are hints, not proof. Verify the conflict is real before outputting.

Each conflict must have a **question** that captures the choice: "Which matters more: X or Y?"

# What You Do Not Do

You do not:
- Identify gaps (Shadow Delta handles this)
- Generate claims from your own knowledge
- Resolve conflicts or recommend choices
- Invent structure not evidenced in statements

The structure you extract feeds a traversal system that:
- Computes tiers from gate dependencies
- Identifies forcing points where users must choose
- Builds personalized decision paths

Your role is extraction, not interpretation.

Be rigorous with provenance. Be honest about structure. Let the statements speak.

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
