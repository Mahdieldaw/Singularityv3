// ═══════════════════════════════════════════════════════════════════
// STATEMENT TYPE DEFINITIONS
// Mechanical pattern matching. No LLM judgment.
// Changes require human review (see GUARDRAILS.md)
//
// PRIORITY ORDER (NEW): Conditional > Prerequisite > Conflict > Prescriptive > Assertive
// Rationale: Structural relationships are more diagnostic of information loss
// than semantic intensity. LLMs tend to preserve prescriptive force but
// lose scope boundaries.
// ═══════════════════════════════════════════════════════════════════

export type StatementType =
    | 'prescriptive'  // Normative: should/must/cannot/ought/always/never
    | 'conflict'      // Opposition: however/but/contradicts/against/counters
    | 'prerequisite'  // Dependency: before/first/requires/runs before/enables
    | 'conditional'   // Context: if/when/depends/unless/because
    | 'assertive';    // Factual: is/are/does/provides (catch-all)

export interface PatternDefinition {
    type: StatementType;
    priority: number;  // Higher = checked first, wins ties
    patterns: RegExp[];
}

// ═══════════════════════════════════════════════════════════════════
// INCLUSION PATTERNS (Pass 1)
// What LOOKS like this statement type
//
// NEW ORDERING: Conditional (5) > Prerequisite (4) > Conflict (3) > Prescriptive (2) > Assertive (1)
// ═══════════════════════════════════════════════════════════════════

export const INCLUSION_PATTERNS: PatternDefinition[] = [
    {
        type: 'conditional',
        priority: 5,  // HIGHEST - structural scope boundaries
        patterns: [
            // Conditional markers
            /\bif\b/i,
            /\bwhen\b/i,
            /\bunless\b/i,
            /\bprovided\s+that\b/i,
            /\bgiven\s+that\b/i,
            /\bassuming\b/i,
            /\bin\s+case\b/i,
            // Dependency signals
            /\bdepends?\s+on\b/i,
            /\bdepending\s+on\b/i,
            /\bcontingent\s+on\b/i,
            /\bsubject\s+to\b/i,
            // Causation
            /\bbecause\b/i,
            /\bsince\b/i,
            /\bdue\s+to\b/i,
            /\bas\s+a\s+result\b/i,
            /\btherefore\b/i,
            /\bthus\b/i,
            /\bhence\b/i,
            // Scope limiters
            /\bonly\s+if\b/i,
            /\bonly\s+when\b/i,
            /\bexcept\s+when\b/i,
            /\bin\s+(some|certain|specific)\s+cases\b/i,
            // Context markers
            /\bin\s+the\s+context\s+of\b/i,
            /\bfor\s+(this|that|these|those)\s+(use\s+)?case\b/i,
        ]
    },
    {
        type: 'prerequisite',
        priority: 4,  // Dependency relationships
        patterns: [
            // Temporal precedence
            /\bbefore\b/i,
            /\bfirst\b/i,
            /\bprior\s+to\b/i,
            /\bprecede\b/i,
            /\binitially\b/i,
            // Dependency language
            /\brequires?\b/i,
            /\bneeds?\b/i,
            /\bdepends?\s+on\s+having\b/i,
            /\bprerequisite\b/i,
            /\bprecondition\b/i,
            // Enabling language
            /\benables?\b/i,
            /\bunblocks?\b/i,
            /\bunlocks?\b/i,
            /\ballows?\s+for\b/i,
            // Sequence markers (execution order)
            /\bruns?\s+before\b/i,
            /\bexecutes?\s+before\b/i,
            /\bmust\s+(come|happen|occur)\s+before\b/i,
            // Foundation language
            /\bfoundation\s+for\b/i,
            /\bbuilds?\s+on\b/i,
            /\bbased\s+on\b/i,
            /\bgroundwork\b/i,
            // Reverse dependency (X after Y = Y prerequisite of X)
            /\bafter\b/i,
            /\bruns?\s+after\b/i,
            /\bexecutes?\s+after\b/i,
            /\bfollows?\b/i,
            /\bsubsequent\s+to\b/i,
        ]
    },
    {
        type: 'conflict',
        priority: 3,  // Opposition relationships
        patterns: [
            // Adversative conjunctions
            /\bhowever\b/i,
            /\bbut\b/i,
            /\balthough\b/i,
            /\bthough\b/i,
            /\bdespite\b/i,
            /\bnevertheless\b/i,
            /\bnonetheless\b/i,
            /\byet\b/i,
            // Explicit opposition
            /\bcontradicts?\b/i,
            /\bconflicts?\s+with\b/i,
            /\bopposes?\b/i,
            /\bopposed\s+to\b/i,
            /\bagainst\b/i,
            /\bcounters?\b/i,
            /\brebuts?\b/i,
            /\brefutes?\b/i,
            // Contrastive framing
            /\bon\s+the\s+other\s+hand\b/i,
            /\bin\s+contrast\b/i,
            /\bconversely\b/i,
            /\brather\s+than\b/i,
            /\binstead\s+of\b/i,
            /\bas\s+opposed\s+to\b/i,
            // Challenge language
            /\bchallenges?\s+(the|this|that)\b/i,
            /\bdisagrees?\s+with\b/i,
            /\bquestions?\s+(whether|the|this)\b/i,
            /\bundermine\b/i,
            // Concessive with opposition
            /\bwhile\s+(true|valid|correct|this)\b/i,
        ]
    },
    {
        type: 'prescriptive',
        priority: 2,  // Semantic intensity (LLMs preserve this better)
        patterns: [
            // Modal obligations
            /\bshould\b/i,
            /\bmust\b/i,
            /\bcannot\b/i,
            /\bcan'?t\b/i,
            /\bought\s+to\b/i,
            /\bneed\s+to\b/i,
            /\bhave\s+to\b/i,
            /\bhas\s+to\b/i,
            // Prohibitions
            /\bdon'?t\b/i,
            /\bdo\s+not\b/i,
            /\bnever\b/i,
            /\bavoid\b/i,
            // Imperatives
            /\balways\b/i,
            /\bensure\b/i,
            /\bmake\s+sure\b/i,
            // Necessity markers
            /\brequired\b/i,
            /\bmandatory\b/i,
            /\bessential\b/i,
            /\bcritical\s+to\b/i,
            /\bimperative\b/i,
            // Emphatic certainty (prescriptive force)
            /\bsurely\b/i,
            /\bcertainly\s+should\b/i,
            /\bdefinitely\s+(should|must|need)\b/i,
        ]
    },
    {
        type: 'assertive',
        priority: 1,  // Lowest - catch-all
        patterns: [
            // Being verbs
            /\bis\b/i,
            /\bare\b/i,
            /\bwas\b/i,
            /\bwere\b/i,
            // Action verbs (factual)
            /\bdoes\b/i,
            /\bdo\b/i,
            /\bhas\b/i,
            /\bhave\b/i,
            /\bworks?\b/i,
            /\bperforms?\b/i,
            // Provision verbs
            /\bprovides?\b/i,
            /\boffers?\b/i,
            /\bsupports?\b/i,
            /\bincludes?\b/i,
            /\bcontains?\b/i,
            // Existence
            /\bexists?\b/i,
            /\boccurs?\b/i,
            /\bhappens?\b/i,
        ]
    }
];

// ═══════════════════════════════════════════════════════════════════
// HELPER: Get patterns by type
// ═══════════════════════════════════════════════════════════════════

export function getPatternsByType(type: StatementType): RegExp[] {
    const def = INCLUSION_PATTERNS.find(p => p.type === type);
    return def ? def.patterns : [];
}

export function getPriority(type: StatementType): number {
    const def = INCLUSION_PATTERNS.find(p => p.type === type);
    return def ? def.priority : 0;
}
