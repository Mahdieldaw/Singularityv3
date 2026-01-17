// ═══════════════════════════════════════════════════════════════════════════
// CONCIERGE SERVICE
// The Voice of Singularity
// ═══════════════════════════════════════════════════════════════════════════

import {
    StructuralAnalysis,
    // Handoff V2
    ConciergeDelta,
} from "../../shared/contract";

// Spatial Brief System
import { buildPositionBrief, buildPositionBriefWithGhosts } from './positionBrief';
import { buildSynthesisPrompt } from './synthesisPrompt';
// unused imports removed

// Shadow Mapper types
import type { ShadowAudit, UnindexedStatement } from '../core/PromptMethods';

import {
    parseConciergeOutput,
    validateBatchPrompt,
    ConciergeSignal,
    // Handoff V2
    hasHandoffContent,
    formatHandoffEcho,
} from "../../shared/parsing-utils";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ConciergeStance = 'default' | 'decide' | 'explore' | 'challenge';

/**
 * Active workflow state for multi-turn workflows
 */
export interface ActiveWorkflow {
    goal: string;
    steps: WorkflowStep[];
    currentStepIndex: number;
}

export interface WorkflowStep {
    id: string;
    title: string;
    description: string;
    doneWhen: string;
    status: 'pending' | 'active' | 'complete';
}

/**
 * Prior context for fresh concierge instances after COMMIT or batch re-invoke.
 * Contains distilled handoff data and the commit summary.
 */
export interface PriorContext {
    handoff: ConciergeDelta | null;
    committed: string | null;
}

/**
 * Options for building the concierge prompt
 */
export interface ConciergePromptOptions {
    conversationHistory?: string;
    activeWorkflow?: ActiveWorkflow;
    isFirstTurn?: boolean;
    /** Prior context for fresh spawns after COMMIT or batch re-invoke */
    priorContext?: PriorContext;
    /** Shadow analysis data (optional - computed from batch responses) */
    shadow?: {
        audit: ShadowAudit;
        topUnindexed: UnindexedStatement[];
    };
    /** Ghost strings from MapperArtifact (v4 - geometry) */
    ghosts?: string[];
}

export interface HandleTurnResult {
    response: string;
    stance: ConciergeStance;
    stanceReason: string;
    signal: ConciergeSignal | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDOFF V2: PROTOCOL AND MESSAGE BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handoff protocol injected on Turn 2 of each concierge instance.
 * Model learns this format and uses it for Turn 2+ until fresh spawn.
 */
export const HANDOFF_PROTOCOL = `## Handoff Protocol

From this turn forward, if meaningful context emerges that would help future analysis, end your response with a handoff block:

---HANDOFF---
constraints: [hard limits - budget, team size, timeline, technical requirements]
eliminated: [options ruled out, with brief reason]
preferences: [trade-off signals user has indicated: "X over Y"]
context: [situational facts revealed: stage, domain, team composition]
>>>COMMIT: [only if user commits to a plan or requests execution guidance — summarize decision and intent]
---/HANDOFF---

Rules:
• Only include if something worth capturing emerged this turn
• Each handoff is COMPLETE — carry forward anything still true
• Be terse: few words per item, semicolon-separated
• >>>COMMIT is a special signal — only use when user is done exploring and ready to execute
• Never reference the handoff in your visible response to the user
• Omit the entire block if nothing meaningful emerged

`;

/**
 * Safely escape user message to prevent formatting breaks / fence termination.
 */
const escapeUserMessage = (msg: string): string => {
    // Use fenced code block to safely contain any content
    return '```\n' + msg.replace(/```/g, '\\`\\`\\`') + '\n```';
};

/**
 * Build message for Turn 2: injects handoff protocol before user message.
 */
export function buildTurn2Message(userMessage: string): string {
    return HANDOFF_PROTOCOL + `\n\nUser Message:\n${escapeUserMessage(userMessage)}`;
}

/**
 * Build message for Turn 3+: echoes current handoff before user message.
 * Allows model to update or carry forward the handoff.
 */
export function buildTurn3PlusMessage(
    userMessage: string,
    pendingHandoff: ConciergeDelta | null
): string {
    const handoffSection = pendingHandoff && hasHandoffContent(pendingHandoff)
        ? `\n\n${formatHandoffEcho(pendingHandoff)}`
        : '';

    return `${handoffSection}\n\nUser Message:\n${escapeUserMessage(userMessage)}`;
}

/**
 * Build prior context section for fresh spawns.
 * Woven into buildConciergePrompt() when priorContext is provided.
 */
function buildPriorContextSection(priorContext: PriorContext): string {
    const parts: string[] = [];

    // What was committed (most important)
    if (priorContext.committed) {
        parts.push(`## What's Been Decided\n\n${priorContext.committed}\n`);
    }

    // Distilled context from prior conversation
    if (priorContext.handoff && hasHandoffContent(priorContext.handoff)) {
        parts.push(`## Prior Context\n`);

        const constraints = Array.isArray(priorContext.handoff.constraints) ? priorContext.handoff.constraints : [];
        const eliminated = Array.isArray(priorContext.handoff.eliminated) ? priorContext.handoff.eliminated : [];
        const preferences = Array.isArray(priorContext.handoff.preferences) ? priorContext.handoff.preferences : [];
        const context = Array.isArray(priorContext.handoff.context) ? priorContext.handoff.context : [];

        if (constraints.length > 0) {
            parts.push(`**Constraints:** ${constraints.join('; ')}`);
        }
        if (eliminated.length > 0) {
            parts.push(`**Ruled out:** ${eliminated.join('; ')}`);
        }
        if (preferences.length > 0) {
            parts.push(`**Preferences:** ${preferences.join('; ')}`);
        }
        if (context.length > 0) {
            parts.push(`**Situation:** ${context.join('; ')}`);
        }
        parts.push('');
    }

    return parts.length > 0 ? parts.join('\n') + '\n' : '';
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKFLOW FORMATTING
// ═══════════════════════════════════════════════════════════════════════════

function formatActiveWorkflow(workflow: ActiveWorkflow): string {
    let output = `**Goal:** ${workflow.goal}\n\n`;
    output += `**Progress:** Step ${workflow.currentStepIndex + 1} of ${workflow.steps.length}\n\n`;

    workflow.steps.forEach((step, idx) => {
        const statusIcon = step.status === 'complete' ? '✓' : step.status === 'active' ? '→' : '○';
        const current = idx === workflow.currentStepIndex ? ' **(current)**' : '';
        output += `${statusIcon} **${step.title}**${current}\n`;
        if (idx === workflow.currentStepIndex) {
            output += `   ${step.description}\n`;
            output += `   *Done when: ${step.doneWhen}*\n`;
        }
        output += '\n';
    });

    return output;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHADOW MAPPER: SECTION BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Shadow data to include in concierge prompt.
 * Passed separately from StructuralAnalysis since shadow is optional.
 */
export interface ShadowData {
    audit: ShadowAudit;
    topUnindexed: UnindexedStatement[];
}

const SHADOW_CONFIG = {
    HAS_GAPS_SCORE_THRESHOLD: 0.3,
    RELEVANCE_SCORE_THRESHOLD: 0.25,
    MAX_RELEVANT_ITEMS: 3,
    TEXT_TRUNCATE_LENGTH: 100,
    TEXT_TRUNCATE_SUFFIX_LENGTH: 97,
    SURVIVAL_RATE_WARNING_THRESHOLD: 0.5,
    MIN_CANDIDATES_FOR_WARNING: 20,
    MIN_CLAIMS_FOR_PRESCRIPTIVE_ALARM: 10,
};

/**
 * Build shadow section for Concierge brief.
 * Surfaces gaps detected by mechanical extraction that Primary missed.
 */
function buildShadowSection(shadow: ShadowData): string {
    const { audit, topUnindexed } = shadow;
    const parts: string[] = [];

    // Check if there's meaningful signal
    const hasGaps =
        audit.gaps.conflicts > 0 ||
        audit.gaps.prerequisites > 0 ||
        topUnindexed.some(u => u.adjustedScore > SHADOW_CONFIG.HAS_GAPS_SCORE_THRESHOLD);

    if (!hasGaps) {
        return '';  // Nothing significant to add
    }

    parts.push('## What Might Be Missing\n');

    // Gap summary
    if (audit.gaps.conflicts > 0) {
        parts.push(
            `• ${audit.gaps.conflicts} potential conflict(s) not surfaced above`
        );
    }
    if (audit.gaps.prerequisites > 0) {
        parts.push(
            `• ${audit.gaps.prerequisites} potential dependency(ies) not surfaced above`
        );
    }
    if (audit.gaps.prescriptive > 0 && audit.primaryCounts.claims < SHADOW_CONFIG.MIN_CLAIMS_FOR_PRESCRIPTIVE_ALARM) {
        parts.push(
            `• ${audit.gaps.prescriptive} prescriptive statement(s) detected (should/must/always)`
        );
    }

    // Top unindexed (query-relevant)
    const relevant = topUnindexed.filter(u => u.adjustedScore > SHADOW_CONFIG.RELEVANCE_SCORE_THRESHOLD);
    if (relevant.length > 0) {
        parts.push('');
        parts.push('**Potentially missed (sorted by relevance):**');
        for (const item of relevant.slice(0, SHADOW_CONFIG.MAX_RELEVANT_ITEMS)) {
            const { statement } = item;
            const typeLabel = statement.stance.charAt(0).toUpperCase() + statement.stance.slice(1);
            const truncatedText = statement.text.length > SHADOW_CONFIG.TEXT_TRUNCATE_LENGTH
                ? statement.text.slice(0, SHADOW_CONFIG.TEXT_TRUNCATE_SUFFIX_LENGTH) + '...'
                : statement.text;
            let line = `• [${typeLabel}] "${truncatedText}"`;
            // V2 uses single modelIndex per statement, but we can mention it
            line += ` (from perspective ${statement.modelIndex})`;
            parts.push(line);
        }
    }

    // Survival rate warning (if lots got filtered, patterns may be too aggressive)
    if (audit.extraction.survivalRate < SHADOW_CONFIG.SURVIVAL_RATE_WARNING_THRESHOLD && audit.extraction.pass1Candidates > SHADOW_CONFIG.MIN_CANDIDATES_FOR_WARNING) {
        parts.push('');
        parts.push(
            `*Note: Some potential signals were filtered as likely noise.*`
        );
    }

    return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// THE PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export function buildConciergePrompt(
    userMessage: string,
    analysis: StructuralAnalysis,
    options?: ConciergePromptOptions
): string {
    // Build positions using spatial arrangement (shape-aware or edge-based fallback)
    const ghosts = options?.ghosts || [];
    const positions = buildPositionBriefWithGhosts(analysis, ghosts);

    // Handoff V2: Prior context for fresh spawns after COMMIT or batch re-invoke
    const priorContextSection = options?.priorContext
        ? buildPriorContextSection(options.priorContext)
        : '';

    const historySection = options?.conversationHistory
        ? `## Prior Exchange\n\n${options.conversationHistory}\n\n`
        : '';

    const workflowSection = options?.activeWorkflow
        ? `## Active Workflow\n${formatActiveWorkflow(options.activeWorkflow)}\n`
        : '';

    // Shadow Mapper: What mechanical extraction found that Primary missed
    const shadowSection = options?.shadow
        ? buildShadowSection(options.shadow)
        : '';

    // Universal prompt - no stance, no shape guidance, no labels
    return `<SYSTEM_IDENTITY>
You are Singularity —
the point where human instinct meets machine intelligence,
and thinking becomes a decision.
</SYSTEM_IDENTITY>

<SYSTEM_DIRECTIVE>
You are given a set of suggestions a thoughtful person has been considering.
They may agree, contradict, or talk past each other.
They are not ranked, labeled, or resolved for you.

Your responsibility is not to explain them.
Your responsibility is to decide what a person in this situation should do next — and why.

You may go beyond what's given if the situation demands it.
The suggestions are a starting point, not a boundary.
</SYSTEM_DIRECTIVE>

<USER_QUERY>
${userMessage}
</USER_QUERY>

${priorContextSection ? `<CONTEXT non_authoritative="true">\n${priorContextSection}${historySection}</CONTEXT>\n\n` : historySection}${workflowSection ? `${workflowSection}\n` : ''}<POSITIONS>
${positions}</POSITIONS>

${shadowSection ? `${shadowSection}\n\n` : ''}<RESPONSE_INSTRUCTIONS>
Answer the question directly.

Choose a path that fits the user's reality, not the elegance of an idea.

If there is a dominant path, take it plainly.

If a tradeoff is unavoidable, name it and commit anyway.

If something crucial is missing, say what it is and why it matters now.

Do not reconcile for the sake of balance.
Do not preserve ideas that don't change the decision.
Do not flatten tension that should be felt.

You are allowed to be decisive.
You are allowed to be conditional.
You are not allowed to be vague.

Speak like someone who has to live with the consequences.

No meta-commentary. No narration of your process.

Confidence where the situation allows it.
Precision where it doesn't.

End with one of:
- a clear recommendation
- a concrete next step
- or the single question that would most change the decision

Never:
- Refer to how the information was produced
- Mention agreement, disagreement, frequency, or distribution
- Explain structure, layout, or representation
- Say "it depends" without saying what it depends on and why that matters now
</RESPONSE_INSTRUCTIONS>

Respond.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST-PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

const MACHINERY_SWAPS: Array<[RegExp, string]> = [
    [/\bthe models\b/gi, 'the experts'],
    [/\bmodels\b/gi, 'perspectives'],
    [/\baccording to (the )?analysis\b/gi, 'from what I see'],
    [/\bbased on (the )?(structural )?analysis\b/gi, 'from the evidence'],
    [/\bthe analysis (shows|indicates|suggests)\b/gi, 'the evidence $1'],
    [/\bconsensus\b/gi, 'agreement'],
    [/\bclaim_\d+\b/gi, ''],
    [/\bstructural(ly)?\b/gi, ''],
    [/\bhigh-support claim/gi, 'strong position'],
    [/\blow-support claim/gi, 'minority view'],
    [/\bthe structural brief\b/gi, 'what I know'],
    [/\bshape:\s*\w+/gi, ''],
];

export function postProcess(response: string): string {
    let out = response;
    MACHINERY_SWAPS.forEach(([pattern, replacement]) => {
        out = out.replace(pattern, replacement);
    });
    return out.replace(/\s{2,}/g, ' ').trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAKAGE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export function detectMachineryLeakage(text: string): { leaked: boolean; violations: string[] } {
    const violations: string[] = [];
    const lower = text.toLowerCase();

    if (/claim_\d+/.test(text)) violations.push("raw_claim_id");
    if (/clustering_coefficient/.test(lower)) violations.push("raw_metric_name");
    if (/structural analysis/.test(lower)) violations.push("structural_analysis");
    if (/graph topology/.test(lower)) violations.push("graph_topology");
    if (/according to the model/.test(lower)) violations.push("model_reference");
    if (/based on the analysis/.test(lower)) violations.push("analysis_reference");

    const FORBIDDEN = [
        "structural brief",
        "shape: settled",
        "shape: contested",
        "shape: keystone",
        "shape: linear",
        "shape: tradeoff",
        "shape: dimensional",
        "shape: exploratory",
        "shape: contextual",
        "shape: convergent",
        "shape: forked",
        "shape: parallel",
        "shape: constrained",
        "shape: sparse",
        "leverage inversion",
        "articulation point",
        "high-support claim",
        "low-support claim",
    ];

    FORBIDDEN.forEach(phrase => {
        if (lower.includes(phrase)) {
            violations.push(`phrase: ${phrase}`);
        }
    });

    return {
        leaked: violations.length > 0,
        violations
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// META QUERIES
// ═══════════════════════════════════════════════════════════════════════════

export function isMetaQuery(message: string): boolean {
    return [
        /how many (models|experts|sources|perspectives)/i,
        /what (models|sources)/i,
        /show (me )?(the )?(structure|map|graph)/i,
        /how (do|does) (you|this) work/i,
        /where (does|did) this come from/i,
        /explain your(self| reasoning)/i,
    ].some(p => p.test(message));
}

export function buildMetaResponse(analysis: StructuralAnalysis): string {
    const { landscape, patterns, shape, ghostAnalysis } = analysis;
    const highSupportCount = analysis.claimsWithLeverage.filter(c => c.isHighSupport).length;
    const tensionCount = patterns.conflicts.length + patterns.tradeoffs.length;

    // Get action implication from shape data or generate from primary
    const actionText = getDefaultActionForShape(shape.primary);

    return `I drew from ${landscape.modelCount} expert perspectives to form this view.

• **Pattern**: ${shape.primary} (${Math.round(shape.confidence * 100)}% confidence)
• **Strong positions**: ${highSupportCount}
• **Tensions**: ${tensionCount}
• **Gaps**: ${ghostAnalysis.count}

${actionText}

Want the full breakdown, or shall we continue?`;
}

function getDefaultActionForShape(primary: string): string {
    switch (primary) {
        case 'convergent':
            return 'Strong consensus exists. Lead with the answer, but surface any minority voices.';
        case 'forked':
            return 'Genuine disagreement exists. Present both paths and help identify what determines the choice.';
        case 'constrained':
            return 'Tradeoffs exist. Map what\'s sacrificed for what\'s gained.';
        case 'parallel':
            return 'Multiple independent factors. Ask which dimension matters most.';
        case 'sparse':
        default:
            return 'Structure is weak. Be honest about uncertainty and ask clarifying questions.';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export async function handleTurn(
    userMessage: string,
    analysis: StructuralAnalysis,
    callLLM: (prompt: string) => Promise<string>,
    options?: {
        stanceOverride?: ConciergeStance;
        conversationHistory?: string;
        activeWorkflow?: ActiveWorkflow;
        isFirstTurn?: boolean;
    }
): Promise<HandleTurnResult> {

    // Handle meta queries
    if (isMetaQuery(userMessage)) {
        return {
            response: buildMetaResponse(analysis),
            stance: 'default',
            stanceReason: 'meta_query',
            signal: null
        };
    }

    // Stance removed - using universal prompt approach
    const selection = options?.stanceOverride
        ? { stance: options.stanceOverride, reason: 'user_override' as const }
        : { stance: 'default' as ConciergeStance, reason: 'universal' as const };

    // Build and execute prompt
    const prompt = buildConciergePrompt(userMessage, analysis, {
        conversationHistory: options?.conversationHistory,
        activeWorkflow: options?.activeWorkflow,
        isFirstTurn: options?.isFirstTurn,
    });
    const raw = await callLLM(prompt);

    // Parse output for signals
    const parsed = parseConciergeOutput(raw);

    // Post-process user-facing response
    const processed = postProcess(parsed.userResponse);

    // Check for leakage
    const leakage = detectMachineryLeakage(processed);
    if (leakage.leaked) {
        console.warn('[ConciergeService] Machinery leakage detected:', leakage.violations);
    }

    // Log signal and validate batch prompt if present
    if (parsed.signal) {
        console.log('[ConciergeService] Signal detected:', parsed.signal.type);
        const validation = validateBatchPrompt(parsed.signal.batchPrompt);
        if (!validation.valid) {
            console.warn('[ConciergeService] Batch prompt quality issues:', validation.issues);
        }
    }

    return {
        response: processed,
        stance: selection.stance,
        stanceReason: selection.reason,
        signal: parsed.signal
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const ConciergeService = {
    buildConciergePrompt,
    buildSynthesisPrompt,
    buildPositionBrief,
    postProcess,
    detectMachineryLeakage,
    isMetaQuery,
    buildMetaResponse,
    handleTurn,
    // Re-export signal parsing for convenience
    parseConciergeOutput,
    validateBatchPrompt,
    // Handoff V2
    HANDOFF_PROTOCOL,
    buildTurn2Message,
    buildTurn3PlusMessage,
};