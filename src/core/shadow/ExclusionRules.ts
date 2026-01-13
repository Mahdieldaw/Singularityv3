import { StatementType } from './StatementTypes';

// ═══════════════════════════════════════════════════════════════════
// EXCLUSION PATTERNS (Pass 2)
// What DISQUALIFIES something from being this statement type
// Must survive ALL applicable rules to be validated
// ═══════════════════════════════════════════════════════════════════

export interface ExclusionRule {
    id: string;                    // For debugging/logging
    appliesTo: StatementType[];    // Which types this can disqualify
    pattern: RegExp;
    reason: string;                // Human-readable explanation
    severity: 'hard' | 'soft';     // Hard = instant disqualify, Soft = confidence penalty
}

export const EXCLUSION_RULES: ExclusionRule[] = [
    // ═══════════════════════════════════════════════════════════════════
    // UNIVERSAL EXCLUSIONS (apply to all types)
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'question_mark',
        appliesTo: ['prescriptive', 'conflict', 'prerequisite', 'conditional', 'assertive'],
        pattern: /\?$/,
        reason: 'Question, not statement',
        severity: 'hard'
    },
    {
        id: 'too_short',
        appliesTo: ['prescriptive', 'conflict', 'prerequisite', 'conditional', 'assertive'],
        pattern: /^.{0,15}$/,
        reason: 'Too short to be substantive claim',
        severity: 'hard'
    },
    {
        id: 'meta_let_me',
        appliesTo: ['prescriptive', 'conflict', 'prerequisite', 'conditional', 'assertive'],
        pattern: /^(let me|let's|i('ll| will| would)|allow me to)\b/i,
        reason: 'Meta-framing, not claim',
        severity: 'hard'
    },
    {
        id: 'meta_note',
        appliesTo: ['prescriptive', 'conflict', 'prerequisite', 'conditional', 'assertive'],
        pattern: /^(note that|it'?s worth (noting|mentioning)|keep in mind|remember that)\b/i,
        reason: 'Meta-commentary, not claim',
        severity: 'hard'
    },
    {
        id: 'quoted_material',
        appliesTo: ['prescriptive', 'conflict', 'prerequisite', 'conditional', 'assertive'],
        pattern: /^(["“”])[^"“”]{10,}\1$/,
        reason: 'Quoted material, not original claim',
        severity: 'hard'
    },

    // ═══════════════════════════════════════════════════════════════════
    // PRESCRIPTIVE EXCLUSIONS
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'prescriptive_epistemic_should',
        appliesTo: ['prescriptive'],
        pattern: /\bshould\s+(be|have\s+been)\s+(clear|obvious|noted|apparent|evident|unsurprising)\b/i,
        reason: 'Epistemic "should" (expectation), not prescriptive',
        severity: 'hard'
    },
    {
        id: 'prescriptive_conditional_should',
        appliesTo: ['prescriptive'],
        pattern: /\bif\s+.{5,40}\s+should\b/i,
        reason: 'Conditional "should" - extract as conditional instead',
        severity: 'soft'
    },
    {
        id: 'prescriptive_hypothetical',
        appliesTo: ['prescriptive'],
        pattern: /\b(you|one)\s+could\s+(also|potentially|possibly)\b/i,
        reason: 'Suggestion, not prescription',
        severity: 'soft'
    },
    {
        id: 'prescriptive_question_form',
        appliesTo: ['prescriptive'],
        pattern: /\bshould\s+(you|we|i|they)\s+.{0,30}\?/i,
        reason: 'Prescriptive in question form',
        severity: 'hard'
    },
    {
        id: 'prescriptive_rhetorical',
        appliesTo: ['prescriptive'],
        pattern: /\b(surely|certainly)\s+(you|we|one)\s+(can|would|could)\s+agree\b/i,
        reason: 'Rhetorical appeal, not prescription',
        severity: 'hard'
    },
    {
        id: 'prescriptive_past_tense',
        appliesTo: ['prescriptive'],
        pattern: /\bshould\s+have\s+(been|done|had|made|used)\b/i,
        reason: 'Past counterfactual, not active prescription',
        severity: 'soft'
    },
    {
        id: 'prescriptive_attributed',
        appliesTo: ['prescriptive'],
        pattern: /\b(they|he|she|the\s+\w+)\s+(say|says|said|suggest|argues?)\s+.{0,20}should\b/i,
        reason: 'Attributed prescription, not asserted',
        severity: 'soft'
    },

    // ═══════════════════════════════════════════════════════════════════
    // CONFLICT EXCLUSIONS
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'conflict_additive_but',
        appliesTo: ['conflict'],
        pattern: /\b(not\s+only\s+.{5,30}\s+but\s+(also)?|but\s+also|but\s+additionally|but\s+furthermore)\b/i,
        reason: 'Additive "but", not adversative',
        severity: 'hard'
    },
    {
        id: 'conflict_nothing_but',
        appliesTo: ['conflict'],
        pattern: /\b(nothing\s+but|anything\s+but|everything\s+but|all\s+but)\b/i,
        reason: '"But" as "except", not conflict',
        severity: 'hard'
    },
    {
        id: 'conflict_however_additionally',
        appliesTo: ['conflict'],
        pattern: /\bhowever[,;]?\s*(additionally|also|furthermore|moreover)\b/i,
        reason: 'Transitional "however", not adversative',
        severity: 'hard'
    },
    {
        id: 'conflict_against_physical',
        appliesTo: ['conflict'],
        pattern: /\bagainst\s+(the\s+)?(wall|floor|door|window|backdrop|background|grain)\b/i,
        reason: 'Physical "against", not opposition',
        severity: 'hard'
    },
    {
        id: 'conflict_yet_temporal',
        appliesTo: ['conflict'],
        pattern: /\b(not\s+yet|as\s+yet|has\s+yet\s+to)\b/i,
        reason: 'Temporal "yet", not adversative',
        severity: 'hard'
    },
    {
        id: 'conflict_though_concessive',
        appliesTo: ['conflict'],
        pattern: /\b(as\s+though|even\s+though)\b/i,
        reason: 'Concessive, not direct conflict',
        severity: 'soft'
    },
    {
        id: 'conflict_narrative_although',
        appliesTo: ['conflict'],
        pattern: /^although\s+(he|she|they|it|the)\s+(was|were|had|did)\b/i,
        reason: 'Narrative framing, not substantive conflict',
        severity: 'soft'
    },

    // ═══════════════════════════════════════════════════════════════════
    // PREREQUISITE EXCLUSIONS
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'prereq_temporal_before',
        appliesTo: ['prerequisite'],
        pattern: /\b(long\s+before|just\s+before|shortly\s+before|right\s+before|the\s+day\s+before)\b/i,
        reason: 'Temporal narration, not dependency',
        severity: 'hard'
    },
    {
        id: 'prereq_before_meeting',
        appliesTo: ['prerequisite'],
        pattern: /\bbefore\s+(the\s+)?(meeting|call|event|conference|session|interview)\b/i,
        reason: 'Temporal reference, not technical prerequisite',
        severity: 'soft'
    },
    {
        id: 'prereq_first_ordinal',
        appliesTo: ['prerequisite'],
        pattern: /^first[,;]?\s+(let\s+me|i\s+want\s+to|i('ll| will)|we\s+should\s+note)\b/i,
        reason: 'Ordinal framing, not prerequisite',
        severity: 'hard'
    },
    {
        id: 'prereq_first_enumeration',
        appliesTo: ['prerequisite'],
        pattern: /\b(first|second|third)[,;]\s+(the|we|you|there)\b/i,
        reason: 'List enumeration, not dependency',
        severity: 'soft'
    },
    {
        id: 'prereq_after_temporal',
        appliesTo: ['prerequisite'],
        pattern: /\b(shortly\s+after|right\s+after|just\s+after|the\s+day\s+after|years?\s+after)\b/i,
        reason: 'Temporal narration, not dependency',
        severity: 'hard'
    },
    {
        id: 'prereq_requires_consideration',
        appliesTo: ['prerequisite'],
        pattern: /\brequires?\s+(careful\s+)?(consideration|thought|analysis|attention)\b/i,
        reason: 'Subjective requirement, not technical dependency',
        severity: 'soft'
    },
    {
        id: 'prereq_needs_improvement',
        appliesTo: ['prerequisite'],
        pattern: /\bneeds?\s+(improvement|work|attention|more|further)\b/i,
        reason: 'Assessment, not dependency',
        severity: 'hard'
    },

    // ═══════════════════════════════════════════════════════════════════
    // CONDITIONAL EXCLUSIONS
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'conditional_if_any',
        appliesTo: ['conditional'],
        pattern: /\bif\s+(any|at\s+all)\b/i,
        reason: 'Minimizing phrase, not conditional logic',
        severity: 'hard'
    },
    {
        id: 'conditional_if_you_will',
        appliesTo: ['conditional'],
        pattern: /\bif\s+you\s+will\b/i,
        reason: 'Parenthetical phrase, not conditional',
        severity: 'hard'
    },
    {
        id: 'conditional_even_if',
        appliesTo: ['conditional'],
        pattern: /\beven\s+if\b/i,
        reason: 'Concessive, not conditional dependency',
        severity: 'soft'
    },
    {
        id: 'conditional_as_if',
        appliesTo: ['conditional'],
        pattern: /\bas\s+if\b/i,
        reason: 'Comparative, not conditional',
        severity: 'hard'
    },
    {
        id: 'conditional_when_definition',
        appliesTo: ['conditional'],
        pattern: /\b\w+\s+is\s+when\b/i,
        reason: 'Definition format, not conditional claim',
        severity: 'hard'
    },
    {
        id: 'conditional_because_history',
        appliesTo: ['conditional'],
        pattern: /\bbecause\s+(of\s+)?(the\s+)?(history|past|tradition|legacy)\b/i,
        reason: 'Historical explanation, not causal dependency',
        severity: 'soft'
    },
    {
        id: 'conditional_since_temporal',
        appliesTo: ['conditional'],
        pattern: /\bsince\s+(19|20)\d{2}\b/i,
        reason: 'Temporal "since", not causal',
        severity: 'hard'
    },
    {
        id: 'conditional_when_temporal',
        appliesTo: ['conditional'],
        pattern: /\bwhen\s+(he|she|they|i|we)\s+(was|were|arrived|came|left|started)\b/i,
        reason: 'Temporal "when", not conditional',
        severity: 'hard'
    },

    // ═══════════════════════════════════════════════════════════════════
    // ASSERTIVE EXCLUSIONS
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'assertive_definition',
        appliesTo: ['assertive'],
        pattern: /^[A-Z][a-z]+\s+(is|are)\s+(defined\s+as|a\s+type\s+of|a\s+kind\s+of|the\s+process\s+of)\b/i,
        reason: 'Definition format, not claim',
        severity: 'hard'
    },
    {
        id: 'assertive_example',
        appliesTo: ['assertive'],
        pattern: /\b(for\s+example|for\s+instance|e\.g\.|such\s+as|like\s+when)\b/i,
        reason: 'Example, not claim',
        severity: 'soft'
    },
    {
        id: 'assertive_hypothetical',
        appliesTo: ['assertive'],
        pattern: /\b(imagine|suppose|say\s+you|let'?s\s+say|hypothetically|in\s+theory)\b/i,
        reason: 'Hypothetical, not assertion',
        severity: 'hard'
    },
    {
        id: 'assertive_list_fragment',
        appliesTo: ['assertive'],
        pattern: /^[-•*]\s*.{0,25}$/,
        reason: 'List fragment, not complete claim',
        severity: 'hard'
    },
    {
        id: 'assertive_citation',
        appliesTo: ['assertive'],
        pattern: /\b(according\s+to|as\s+\w+\s+(says?|notes?|argues?|claims?)|.+\s+(wrote|stated|mentioned))\b/i,
        reason: 'Citation, not original assertion',
        severity: 'soft'
    },
    {
        id: 'assertive_heavy_hedge',
        appliesTo: ['assertive'],
        pattern: /\b(might|could|possibly|perhaps|maybe|arguably|conceivably)\b/i,
        reason: 'Heavily hedged, not assertion',
        severity: 'soft'
    },
    {
        id: 'assertive_some_believe',
        appliesTo: ['assertive'],
        pattern: /\b(some\s+(people|experts?|argue|believe|say)|many\s+(believe|think|argue)|it\s+is\s+(often\s+)?said)\b/i,
        reason: 'Attributed to others, not asserted',
        severity: 'soft'
    },
    {
        id: 'assertive_rhetorical_question',
        appliesTo: ['assertive'],
        pattern: /^(what\s+if|why\s+would|how\s+can|isn'?t\s+it|wouldn'?t\s+you|don'?t\s+you\s+think)\b/i,
        reason: 'Rhetorical question form',
        severity: 'hard'
    },
    {
        id: 'assertive_this_means',
        appliesTo: ['assertive'],
        pattern: /^(this\s+means|in\s+other\s+words|that\s+is|i\.e\.|put\s+differently)\b/i,
        reason: 'Explanation/restatement, not new assertion',
        severity: 'soft'
    },

    // ═══════════════════════════════════════════════════════════════════
    // INTEGRATION POINT 4: REPORTED FINDINGS EXCLUSIONS (RECOMMENDED)
    // Catches: "Studies show", "Research indicates", "According to data"
    // ═══════════════════════════════════════════════════════════════════
    {
        id: 'assertive_reported_finding',
        appliesTo: ['assertive'],
        pattern: /\b(studies?|research|reports?|findings?|surveys?|data)\s+(show|indicate|suggest|reveal|demonstrate|confirm)\b/i,
        reason: 'Reported finding from external source, not direct assertion',
        severity: 'soft'
    },
    {
        id: 'assertive_statistical',
        appliesTo: ['assertive'],
        pattern: /\baccording\s+to\s+(the\s+)?(data|statistics|numbers|metrics)\b/i,
        reason: 'Statistical reference, not asserted claim',
        severity: 'soft'
    }
];

// ═══════════════════════════════════════════════════════════════════
// HELPER: Get rules applicable to a type
// ═══════════════════════════════════════════════════════════════════

export function getRulesForType(type: StatementType): ExclusionRule[] {
    return EXCLUSION_RULES.filter(rule => rule.appliesTo.includes(type));
}

export function getHardRulesForType(type: StatementType): ExclusionRule[] {
    return EXCLUSION_RULES.filter(
        rule => rule.appliesTo.includes(type) && rule.severity === 'hard'
    );
}

export function getSoftRulesForType(type: StatementType): ExclusionRule[] {
    return EXCLUSION_RULES.filter(
        rule => rule.appliesTo.includes(type) && rule.severity === 'soft'
    );
}
