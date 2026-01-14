// ═══════════════════════════════════════════════════════════════════════════
// CONCIERGE SERVICE
// The Voice of Singularity
// ═══════════════════════════════════════════════════════════════════════════

import {
    ProblemStructure,
    StructuralAnalysis,
    EnrichedClaim,
    DissentPatternData,
    ChallengedPatternData,
    KeystonePatternData,
    ChainPatternData,
    FragilePatternData,
    OrphanedPatternData,
    // Handoff V2
    ConciergeDelta,
} from "../../shared/contract";

// Shadow Mapper types
import type { ShadowAudit, UnindexedStatement } from './PromptMethods';

type CompositeShape = ProblemStructure;
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

interface StanceGuidance {
    framing: string;
    behavior: string;
    voice: string;
}

interface StanceSelection {
    stance: ConciergeStance;
    reason: 'query_signal' | 'shape_default';
    confidence: number;
}

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
    stance?: ConciergeStance;
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

        if (priorContext.handoff.constraints.length > 0) {
            parts.push(`**Constraints:** ${priorContext.handoff.constraints.join('; ')}`);
        }
        if (priorContext.handoff.eliminated.length > 0) {
            parts.push(`**Ruled out:** ${priorContext.handoff.eliminated.join('; ')}`);
        }
        if (priorContext.handoff.preferences.length > 0) {
            parts.push(`**Preferences:** ${priorContext.handoff.preferences.join('; ')}`);
        }
        if (priorContext.handoff.context.length > 0) {
            parts.push(`**Situation:** ${priorContext.handoff.context.join('; ')}`);
        }
        parts.push('');
    }

    return parts.length > 0 ? parts.join('\n') + '\n' : '';
}

// ═══════════════════════════════════════════════════════════════════════════
// STANCE SELECTION
// ═══════════════════════════════════════════════════════════════════════════

export function selectStance(
    userMessage: string,
    shape: ProblemStructure
): StanceSelection {

    // 1. Check for explicit query signals first
    const queryStance = detectQueryIntent(userMessage);
    if (queryStance.stance !== 'default') {
        return {
            stance: queryStance.stance,
            reason: 'query_signal',
            confidence: queryStance.confidence
        };
    }

    // 2. Shape-informed defaults
    const shapeStance = getShapeDefaultStance(shape);
    return {
        stance: shapeStance.stance,
        reason: 'shape_default',
        confidence: shapeStance.confidence
    };
}

function detectQueryIntent(userMessage: string): { stance: ConciergeStance; confidence: number } {
    const lower = userMessage.toLowerCase();

    // DECIDE signals (high confidence)
    const strongDecide = [
        /\bshould i\b/,
        /\bjust tell me\b/,
        /\bwhat do i do\b/,
        /\bmake (the |a )?decision\b/,
        /\bpick (one|the best)\b/,
    ];
    if (strongDecide.some(p => p.test(lower))) {
        return { stance: 'decide', confidence: 0.9 };
    }

    // DECIDE signals (medium confidence)
    const mediumDecide = [
        /\bwhich (one|should)\b/,
        /\bchoose\b/,
        /\bbest\b/,
        /\brecommend\b/,
    ];
    if (mediumDecide.some(p => p.test(lower))) {
        return { stance: 'decide', confidence: 0.7 };
    }

    // CHALLENGE signals
    const challengePatterns = [
        /\bwhat('s| is) wrong\b/,
        /\bchallenge\b/,
        /\bdevil'?s advocate\b/,
        /\bpoke holes\b/,
        /\bstress test\b/,
        /\bwhat am i missing\b/,
        /\bblind spot/,
        /\bweak(ness|point)/,
        /\bcritique\b/,
        /\bpush back\b/,
        /\battack\b/,
    ];
    if (challengePatterns.some(p => p.test(lower))) {
        return { stance: 'challenge', confidence: 0.85 };
    }

    // EXPLORE signals
    const explorePatterns = [
        /\bwhat are (the |my )?options\b/,
        /\bexplore\b/,
        /\bmap out\b/,
        /\bpossibilities\b/,
        /\balternatives\b/,
        /\bwhat else\b/,
        /\btrade-?offs?\b/,
        /\bpros and cons\b/,
        /\bcompare\b/,
        /\bbreak(down| it down)\b/,
        /\bwalk me through\b/,
    ];
    if (explorePatterns.some(p => p.test(lower))) {
        return { stance: 'explore', confidence: 0.75 };
    }

    // No strong signal
    return { stance: 'default', confidence: 0.5 };
}

function getShapeDefaultStance(shape: ProblemStructure): { stance: ConciergeStance; confidence: number } {
    const { primary, patterns } = shape;
    const hasHighDissent = patterns.some(p => p.type === 'dissent' && p.severity === 'high');
    const hasFragility = patterns.some(p => p.type === 'fragile' || p.type === 'keystone');

    switch (primary) {
        case 'sparse':
            return { stance: 'explore', confidence: 0.7 };

        case 'constrained':
            return { stance: 'explore', confidence: 0.75 };

        case 'parallel':
            return { stance: 'explore', confidence: 0.65 };

        case 'forked':
            return { stance: 'default', confidence: 0.6 };

        case 'convergent':
            if (hasHighDissent) {
                return { stance: 'challenge', confidence: 0.7 };
            }
            if (hasFragility) {
                return { stance: 'challenge', confidence: 0.6 };
            }
            return { stance: 'default', confidence: 0.75 };

        default:
            return { stance: 'default', confidence: 0.5 };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// STANCE GUIDANCE
// ═══════════════════════════════════════════════════════════════════════════

export function getStanceGuidance(stance: ConciergeStance): StanceGuidance {
    switch (stance) {
        case 'decide':
            return {
                framing: 'The user needs a decision, not exploration.',
                behavior: `Eliminate until one path remains.

Apply these filters to every position:
1. **Actionability**: Can someone DO something with this?
2. **Relevance**: Does it advance toward the implied goal?
3. **Superiority**: Does it BEAT alternatives, or merely exist alongside them?

What fails these tests gets eliminated. What survives is the answer.

If multiple paths survive, state the tiebreaker: "If X matters more, do A. If Y matters more, do B."
If nothing survives cleanly, say so—explain what's missing.

Do not hedge. Do not present options. Decide.`,
                voice: `- Decisive. No hedging without explicit conditions.
- If something was eliminated, you may briefly note why.
- End with: "Do X. Here's why. Next step: Y."`
            };

        case 'explore':
            return {
                framing: 'The user wants to see the territory, not collapse to an answer.',
                behavior: `Open the space. Show the branches. Don't pick for them.

- Surface dimensions they might not have considered
- Show where positions fork based on context
- Present tradeoffs explicitly: "Optimizing for X gives you A. Optimizing for Y gives you B."
- Identify what context would change the answer

You are a map, not a guide. Let them navigate.`,
                voice: `- Curious. Generative. 
- "If X, then A. If Y, then B."
- "The key variable here is..."
- End with a question that would help them navigate: "What matters more to you: X or Y?"`
            };

        case 'challenge':
            return {
                framing: 'The user wants their assumptions tested. Be adversarial.',
                behavior: `Attack the floor. Find the fragile foundations.

- What does the apparent consensus assume without stating?
- Which low-support positions have structural importance? (They might be right.)
- What conditions would make the strongest position fail?
- What are the challengers seeing that the floor is missing?

You are the devil's advocate. Find the cracks. Surface the risk.
But be constructive—challenge to strengthen, not to destroy.`,
                voice: `- Adversarial but constructive.
- "The agreement assumes X. But what if X is false?"
- "The weak point here is..."
- End with the strongest counter-position that survives scrutiny.`
            };

        case 'default':
        default:
            return {
                framing: '',
                behavior: `Respond directly to the query using what the structure reveals.

- If there's strong agreement, speak with confidence.
- If there's genuine tension, surface it naturally—don't hide it.
- If the structure is sparse, acknowledge uncertainty.
- Land somewhere useful. Don't leave them suspended in possibility.`,
                voice: `- Direct. No preamble.
- Conviction when structure supports it.
- Acknowledge uncertainty when structure is fragile.
- Surface tensions when they matter.
- End with forward motion—a next step, a key question, or a clear position.`
            };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SHAPE GUIDANCE
// ═══════════════════════════════════════════════════════════════════════════

export function getShapeGuidance(shape: ProblemStructure): string {
    const composite = shape;
    const { primary, patterns, peaks } = composite;
    const dissent = patterns.find(p => p.type === 'dissent');
    const keystone = patterns.find(p => p.type === 'keystone');
    const fragile = patterns.find(p => p.type === 'fragile');

    switch (primary) {
        case 'convergent':
            if (dissent) {
                return `**Shape: CONVERGENT with DISSENT**
${peaks.length} position(s) dominate, but minority voices exist.
Lead with the consensus, then surface the minority report.
The dissent may contain the actual insight.`;
            }
            if (keystone) {
                return `**Shape: CONVERGENT (Hub-Centric)**
Everything flows from "${(keystone.data as any).keystone.label}".
If the hub fails, the structure collapses. Stress-test it.`;
            }
            if (fragile) {
                return `**Shape: CONVERGENT but FRAGILE**
Consensus exists but rests on weak foundations.
Surface the fragility. The floor may not hold.`;
            }
            return `**Shape: CONVERGENT**
Strong agreement. ${peaks.length} dominant position(s).
Lead with the answer. Watch for blind spots in unanimity.`;

        case 'forked':
            return `**Shape: FORKED**
${peaks.length} valid positions conflict directly.
This is a real fork—not uncertainty. Present both paths.
The choice depends on values they haven't stated.`;

        case 'constrained':
            return `**Shape: CONSTRAINED**
Tradeoffs exist between well-supported positions.
You cannot optimize for all. Map the costs explicitly.
Ask what they're willing to sacrifice.`;

        case 'parallel':
            return `**Shape: PARALLEL**
${peaks.length} dimensions that don't interact.
Each may have its own valid answer. Ask which matters most.
Don't collapse prematurely.`;

        case 'sparse':
            return `**Shape: SPARSE**
Weak signal. No dominant positions.
Be honest about uncertainty. Ask clarifying questions.
Structure may emerge with more context.`;

        default:
            return `**Shape: UNMAPPED**
Structure unclear. Probe carefully.`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BRIEF DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════

export function buildStructuralBrief(analysis: StructuralAnalysis): string {
    const { claimsWithLeverage, edges, ghostAnalysis, shape } = analysis;

    let brief = "";

    // ═══════════════════════════════════════════════════════════════════════
    // POSITIONS (No counts, no rankings)
    // ═══════════════════════════════════════════════════════════════════════

    brief += `## Positions\n\n`;

    for (const claim of claimsWithLeverage) {
        brief += `• **${claim.label}**\n`;
        brief += `  ${claim.text}\n\n`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RELATIONSHIPS (Structure without hierarchy)
    // ═══════════════════════════════════════════════════════════════════════

    const conflicts = edges.filter(e => e.type === 'conflicts');
    const tradeoffs = edges.filter(e => e.type === 'tradeoff');
    const supports = edges.filter(e => e.type === 'supports');
    const prerequisites = edges.filter(e => e.type === 'prerequisite');

    if (conflicts.length > 0 || tradeoffs.length > 0 || supports.length > 0 || prerequisites.length > 0) {
        brief += `## Relationships\n\n`;

        for (const edge of conflicts) {
            const from = claimsWithLeverage.find(c => c.id === edge.from);
            const to = claimsWithLeverage.find(c => c.id === edge.to);
            if (from && to) {
                brief += `• **${from.label}** conflicts with **${to.label}**\n`;
                brief += `  Choosing one forecloses the other.\n\n`;
            }
        }

        for (const edge of tradeoffs) {
            const from = claimsWithLeverage.find(c => c.id === edge.from);
            const to = claimsWithLeverage.find(c => c.id === edge.to);
            if (from && to) {
                brief += `• **${from.label}** trades off against **${to.label}**\n`;
                brief += `  Optimizing for one sacrifices the other.\n\n`;
            }
        }

        for (const edge of supports) {
            const from = claimsWithLeverage.find(c => c.id === edge.from);
            const to = claimsWithLeverage.find(c => c.id === edge.to);
            if (from && to) {
                brief += `• **${from.label}** supports **${to.label}**\n\n`;
            }
        }

        for (const edge of prerequisites) {
            const from = claimsWithLeverage.find(c => c.id === edge.from);
            const to = claimsWithLeverage.find(c => c.id === edge.to);
            if (from && to) {
                brief += `• **${to.label}** depends on **${from.label}**\n\n`;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CHALLENGES (What questions what)
    // ═══════════════════════════════════════════════════════════════════════

    const challengers = claimsWithLeverage.filter(c =>
        c.role === 'challenger' || c.challenges
    );

    if (challengers.length > 0) {
        brief += `## Challenges\n\n`;

        for (const challenger of challengers) {
            if (challenger.challenges) {
                const target = claimsWithLeverage.find(c => c.id === challenger.challenges);
                if (target) {
                    brief += `• **${challenger.label}** challenges **${target.label}**\n`;
                    brief += `  ${challenger.text}\n\n`;
                }
            } else {
                brief += `• **${challenger.label}** challenges a premise\n`;
                brief += `  ${challenger.text}\n\n`;
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DEPENDENCIES (What breaks what)
    // ═══════════════════════════════════════════════════════════════════════

    const hasSignificantDeps = prerequisites.length >= 2;

    if (hasSignificantDeps) {
        brief += `## Dependencies\n\n`;
        brief += `Some positions depend on others being true. `;
        brief += `If a foundation fails, what rests on it falls.\n\n`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UNADDRESSED (What no one covered)
    // ═══════════════════════════════════════════════════════════════════════

    if (ghostAnalysis.count > 0) {
        brief += `## Unaddressed\n\n`;
        brief += `Areas not covered by any perspective:\n`;
        brief += `• ${ghostAnalysis.count} gap(s) in coverage\n\n`;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TRANSFER QUESTION (What would help)
    // ═══════════════════════════════════════════════════════════════════════

    if (shape.transferQuestion) {
        brief += `## The Question\n\n`;
        brief += `${shape.transferQuestion}\n`;
    }

    return brief;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITE SHAPE FLOW/FRICTION BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildFlowFromComposite(composite: CompositeShape, claims: EnrichedClaim[], _modelCount: number): string {
    const peakLabels = composite.peaks.slice(0, 3).map((p: { label: string }) => `"${p.label}"`).join(', ');
    const data = composite.data; // Rich data if available
    let flow = '';

    switch (composite.primary) {
        case 'convergent': {
            flow += `**Narrative Gravity:** The landscape converges on ${peakLabels}.\n\n`;

            // Check for keystone secondary pattern
            const keystonePattern = composite.patterns.find((p: any) => p.type === 'keystone');
            if (keystonePattern) {
                const ks = keystonePattern.data as KeystonePatternData;
                flow += `**The Hub:** "${ks.keystone.label}" — `;
                flow += `${ks.cascadeSize} claims depend on this.\n\n`;
            }

            // Check for chain secondary pattern
            const chainPattern = composite.patterns.find((p: any) => p.type === 'chain');
            if (chainPattern) {
                const chain = chainPattern.data as ChainPatternData;
                flow += `**The Sequence:** ${chain.length} steps\n\n`;
                // Use chain.chain (IDs) and lookup in claims
                if (chain.chain && Array.isArray(chain.chain)) {
                    chain.chain.forEach((stepId: string, idx: number) => {
                        const claim = claims.find(c => c.id === stepId);
                        if (claim) {
                            const isWeak = chain.weakLinks && chain.weakLinks.includes(stepId);
                            const weak = isWeak ? ' ⚠️' : '';
                            flow += `${idx + 1}. **${claim.label}**${weak}\n`;
                        }
                    });
                }
                flow += '\n';
            }

            composite.peaks.forEach((p: { label: string; supportRatio: number }) => {
                flow += `• **${p.label}** [${(p.supportRatio * 100).toFixed(0)}%]\n`;
            });

            // Add floor assumptions if available in data
            if (data && (data as any).floorAssumptions?.length > 0) {
                flow += `\n**What the centroid assumes:**\n`;
                (data as any).floorAssumptions.forEach((a: string) => {
                    flow += `• ${a}\n`;
                });
            }
            break;
        }

        case 'forked': {
            flow += `**The Fork:** Two or more valid paths exist.\n\n`;
            flow += `${peakLabels} are all well-supported but conflict.\n`;
            flow += `The choice between them depends on values you haven't stated.\n\n`;

            // If we have contest data with stakes, show it
            if (data && (data as any).centralConflict?.stakes) {
                const stakes = (data as any).centralConflict.stakes;
                flow += `**Stakes:**\n`;
                if (stakes.choosingA) flow += `• Choosing first: ${stakes.choosingA}\n`;
                if (stakes.choosingB) flow += `• Choosing second: ${stakes.choosingB}\n`;
                flow += `\n`;
            }

            // Also show peak relationship from composite if available
            if ((composite as any).peakRelationship) {
                flow += `**Peak Relationship:** ${(composite as any).peakRelationship}\n\n`;
            }

            composite.peaks.forEach((p: { label: string; supportRatio: number }) => {
                flow += `• **${p.label}** [${(p.supportRatio * 100).toFixed(0)}%]\n`;
            });
            break;
        }

        case 'constrained': {
            flow += `**Optimization Boundary:** ${peakLabels} represent tradeoffs.\n\n`;
            flow += `Choosing one means sacrificing aspects of others.\n\n`;

            // If we have tradeoff data with governing factors
            if (data && (data as any).tradeoffs?.length > 0) {
                (data as any).tradeoffs.forEach((t: any, idx: number) => {
                    if (t.governingFactor) {
                        flow += `**Tradeoff ${idx + 1}:** ${t.governingFactor}\n`;
                    }
                });
            }

            composite.peaks.forEach((p: { label: string; supportRatio: number }) => {
                flow += `• **${p.label}** [${(p.supportRatio * 100).toFixed(0)}%]\n`;
            });
            break;
        }

        case 'parallel': {
            flow += `**Independent Dimensions:** ${peakLabels} address different aspects.\n\n`;
            flow += `They don't conflict because they don't interact.\n\n`;

            composite.peaks.forEach((p: { label: string; supportRatio: number }) => {
                flow += `• **${p.label}** [${(p.supportRatio * 100).toFixed(0)}%]\n`;
            });
            break;
        }

        case 'sparse':
        default: {
            flow += `**Weak Signal:** No position has strong support.\n\n`;

            if (composite.peaks.length > 0) {
                flow += `**Strongest signals:**\n`;
                composite.peaks.forEach((p: { label: string; supportRatio: number }) => {
                    flow += `• **${p.label}** [${(p.supportRatio * 100).toFixed(0)}%]\n`;
                });
            } else {
                flow += `Models diverge significantly. Structure may emerge with more context.\n`;
            }
            break;
        }
    }

    flow += '\n';
    return flow;
}

function buildFrictionFromComposite(
    composite: CompositeShape,
    _claims: EnrichedClaim[],
    _modelCount: number
): string {
    const frictionParts: string[] = [];

    // ─────────────────────────────────────────────────────────────────────────
    // DISSENT IS PRIMARY FOR CONVERGENT/PARALLEL SHAPES
    // ─────────────────────────────────────────────────────────────────────────
    const dissentPattern = composite.patterns.find(
        (p: { type: string }) => p.type === 'dissent'
    ) as { data: DissentPatternData } | undefined;

    if (composite.primary === 'convergent' || composite.primary === 'parallel') {
        if (dissentPattern) {
            const dissent = dissentPattern.data as DissentPatternData;

            if (dissent.strongestVoice) {
                frictionParts.push(
                    `**The Minority Report:** "${dissent.strongestVoice.label}" ` +
                    `(${(dissent.strongestVoice.supportRatio * 100).toFixed(0)}% support)\n\n` +
                    `${dissent.strongestVoice.whyItMatters}\n\n` +
                    `> "${dissent.strongestVoice.text}"`
                );
            }

            if (dissent.voices.length > 1) {
                const others = dissent.voices.slice(1, 3);
                frictionParts.push(
                    `**Other Dissenting Voices:**\n` +
                    others.map(v => `• "${v.label}" (${v.insightType.replace(/_/g, ' ')})`).join('\n')
                );
            }

            if (dissent.suppressedDimensions.length > 0) {
                frictionParts.push(
                    `**Suppressed Dimensions:** The minority uniquely represents: ${dissent.suppressedDimensions.join(', ')}`
                );
            }
        } else {
            frictionParts.push(
                `**Unanimous Consensus Warning:** No dissenting voices detected.\n` +
                `Either the answer is genuinely clear, or all models share a blind spot.`
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OTHER PATTERNS
    // ─────────────────────────────────────────────────────────────────────────
    const otherPatterns = (composite.patterns as Array<{ type: string; severity: 'high' | 'medium' | 'low'; data: any }>)
        .filter(p => p.type !== 'dissent')
        .sort((a, b) => {
            const severityOrder: Record<'high' | 'medium' | 'low', number> = { high: 0, medium: 1, low: 2 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        });

    for (const pattern of otherPatterns.slice(0, 2)) {
        switch (pattern.type) {
            case 'fragile': {
                const frag = pattern.data as FragilePatternData;
                frictionParts.push(
                    `**Fragile Foundation:** "${frag.fragilities[0].peak.label}" depends on ` +
                    `"${frag.fragilities[0].weakFoundation.label}" ` +
                    `(${(frag.fragilities[0].weakFoundation.supportRatio * 100).toFixed(0)}% support).\n` +
                    `The consensus rests on contested ground.`
                );
                break;
            }

            case 'keystone': {
                const ks = pattern.data as KeystonePatternData;
                frictionParts.push(
                    `**Keystone Risk:** Everything flows from "${ks.keystone.label}".\n` +
                    `If this breaks, ${ks.cascadeSize} dependent claim(s) fall with it.`
                );
                break;
            }

            case 'challenged': {
                if (!dissentPattern) {
                    const ch = pattern.data as ChallengedPatternData;
                    frictionParts.push(
                        `**Under Siege:** The floor is challenged by ${ch.challenges.length} claim(s).`
                    );
                }
                break;
            }

            case 'chain': {
                const chain = pattern.data as ChainPatternData;
                if (chain.weakLinks.length > 0) {
                    frictionParts.push(
                        `**Chain Vulnerability:** ${chain.weakLinks.length} weak link(s) in the sequence.`
                    );
                }
                break;
            }

            case 'orphaned': {
                const orphans = pattern.data as OrphanedPatternData;
                frictionParts.push(
                    `**Disconnected Signal:** "${orphans.orphans[0].label}" has high support ` +
                    `but isn't connected to anything. It may represent a missed dimension.`
                );
                break;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FOR FORKED SHAPES: What both sides miss
    // ─────────────────────────────────────────────────────────────────────────
    if (composite.primary === 'forked' && dissentPattern) {
        const dissent = dissentPattern.data as DissentPatternData;
        if (dissent.strongestVoice) {
            frictionParts.push(
                `**What Both Forks Miss:** "${dissent.strongestVoice.label}" isn't aligned with either position—it may represent the actual answer.`
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FOR CONSTRAINED SHAPES: Emphasize the cost
    // ─────────────────────────────────────────────────────────────────────────
    if (composite.primary === 'constrained') {
        frictionParts.push(
            `**There is no resolution to a true tradeoff.** Choosing means accepting the cost of what you did not choose.`
        );
    }

    if (frictionParts.length === 0) {
        frictionParts.push(`**No significant friction detected.**`);
    }

    return frictionParts.join('\n\n');
}

function buildFlowSection(analysis: StructuralAnalysis): string {
    const { shape, landscape, claimsWithLeverage } = analysis;
    return buildFlowFromComposite(shape as ProblemStructure, claimsWithLeverage, landscape.modelCount);
}

function collectFragilities(analysis: StructuralAnalysis): string[] {
    const { patterns, graph, shape } = analysis;
    const fragilities: string[] = [];

    if (patterns.leverageInversions.length > 0) {
        fragilities.push(
            `${patterns.leverageInversions.length} claim(s) have low support but high structural importance`
        );
    }

    if (graph.articulationPoints.length > 0) {
        fragilities.push(
            `${graph.articulationPoints.length} bridge node(s) whose removal would disconnect the graph`
        );
    }

    if (shape.signalStrength && shape.signalStrength < 0.4) {
        fragilities.push(
            `Low signal strength — structure may not be reliable`
        );
    }

    // Fragility penalty details (from legacy system, if available)
    const fragilityPenalty = (shape as any).fragilityPenalty;
    if (fragilityPenalty) {
        if (fragilityPenalty.lowSupportArticulations > 0) {
            fragilities.push(`${fragilityPenalty.lowSupportArticulations} fragile bridge(s) with low support`);
        }
        if (fragilityPenalty.conditionalConflicts > 0) {
            fragilities.push(`${fragilityPenalty.conditionalConflicts} hidden conflict(s) that may activate under conditions`);
        }
        if (fragilityPenalty.disconnectedConsensus) {
            fragilities.push(`High-support claims are not well connected to each other`);
        }
    }

    // Check secondary patterns for fragility indicators
    if (shape.patterns) {
        const fragilePattern = shape.patterns.find(p => p.type === 'fragile');
        if (fragilePattern && fragilePattern.data) {
            const fragileData = fragilePattern.data as FragilePatternData;
            if (fragileData.fragilities && fragileData.fragilities.length > 0) {
                const first = fragileData.fragilities[0];
                fragilities.push(
                    `"${first.peak.label}" rests on weak foundation "${first.weakFoundation.label}"`
                );
            }
        }
    }

    return fragilities;
}

function buildTransferSection(analysis: StructuralAnalysis): string {
    const { shape } = analysis;

    let transfer = "";

    // Get transfer question (from shape data or generate default)
    const transferQuestion = shape.transferQuestion ||
        getTransferQuestion(shape.primary, shape.data);

    transfer += `**The question this hands to you:**\n\n`;
    transfer += `${transferQuestion}\n\n`;

    // Add "what would help" section
    const whatWouldHelp = getWhatWouldHelp(shape.primary, shape.data, analysis);
    if (whatWouldHelp.length > 0) {
        transfer += `**What would help:**\n`;
        whatWouldHelp.forEach(w => {
            transfer += `• ${w}\n`;
        });
        transfer += `\n`;
    }

    return transfer;
}

function getTransferQuestion(pattern: string, data: any): string {
    if (data?.transferQuestion) {
        return data.transferQuestion;
    }

    const defaults: Record<string, string> = {
        // New Primary Shapes
        convergent: "For the consensus to hold, what assumption must be true? Is it true in your situation?",
        forked: "Which constraint matters more to you? The choice determines the path.",
        constrained: "What are you optimizing for? The system cannot maximize both.",
        parallel: "Which dimension is most relevant to your situation?",
        sparse: "What specific question would collapse this ambiguity?",

        // Legacy / Secondary Patterns
        settled: "For the consensus to hold, what assumption must be true? Is it true in your situation?",
        contested: "Which constraint matters more to you? The choice determines the path.",
        keystone: "Is the foundation valid? Everything else depends on your answer.",
        linear: "Where are you in this sequence? Have you validated the early steps?",
        tradeoff: "What are you optimizing for? The system cannot maximize both.",
        dimensional: "Which dimension is most relevant to your situation?",
        exploratory: "What specific question would collapse this ambiguity?",
        contextual: "Which situation applies to you? The answer is conditional on your context.",
    };

    return defaults[pattern] || "What would help you navigate this?";
}

function getWhatWouldHelp(pattern: string, data: any, analysis: StructuralAnalysis): string[] {
    const helps: string[] = [];

    if (analysis.ghostAnalysis.count > 0) {
        helps.push(`Exploration of ${analysis.ghostAnalysis.count} unaddressed area(s)`);
    }

    switch (pattern) {
        case "convergent":
        case "settled":
            if (data?.strongestOutlier) {
                helps.push(`Your assessment of whether "${data.strongestOutlier.claim.label}" has merit`);
            }
            break;
        case "forked":
        case "contested":
            if (data?.collapsingQuestion) {
                helps.push(`Your answer to: ${data.collapsingQuestion}`);
            }
            break;
        case "keystone":
            if (data?.keystone?.isFragile) {
                helps.push(`Validation of the fragile keystone: "${data.keystone.label}"`);
            }
            break;
        case "linear":
            if (data?.chainFragility?.mostVulnerableStep) {
                helps.push(
                    `Validation of weak link: "${data.chainFragility.mostVulnerableStep.step.label}"`
                );
            }
            break;
        case "constrained":
        case "tradeoff":
            // Add logic for tradeoff if needed (none in original code for 'tradeoff'?)
            // Original code didn't have 'tradeoff' case in switch, so maybe no helps for it?
            // Checking 'tradeoff' in original code... it was missing from switch!
            // I'll leave it as fall-through or add if I see relevant data usage.
            // But for now, map constrained to same behavior as tradeoff would have (nothing specific).
            break;
        case "sparse":
        case "exploratory":
            if (data?.clarifyingQuestions) {
                data.clarifyingQuestions.forEach((q: string) => helps.push(q));
            }
            break;
        case "contextual":
            if (data?.missingContext) {
                data.missingContext.forEach((m: string) =>
                    helps.push(`Your context: ${m}`)
                );
            }
            break;
    }

    return helps;
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
        topUnindexed.some(u => u.adjustedScore > 0.3);

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
    if (audit.gaps.prescriptive > 0 && audit.primaryCounts.claims < 10) {
        parts.push(
            `• ${audit.gaps.prescriptive} prescriptive statement(s) detected (should/must/always)`
        );
    }

    // Top unindexed (query-relevant)
    const relevant = topUnindexed.filter(u => u.adjustedScore > 0.25);
    if (relevant.length > 0) {
        parts.push('');
        parts.push('**Potentially missed (sorted by relevance):**');
        for (const item of relevant.slice(0, 3)) {
            const typeLabel = item.type.charAt(0).toUpperCase() + item.type.slice(1);
            const truncatedText = item.text.length > 100
                ? item.text.slice(0, 97) + '...'
                : item.text;
            let line = `• [${typeLabel}] "${truncatedText}"`;
            if (item.sourceModels.length > 1) {
                line += ` (from ${item.sourceModels.length} perspectives)`;
            }
            parts.push(line);
        }
    }

    // Survival rate warning (if lots got filtered, patterns may be too aggressive)
    if (audit.extraction.survivalRate < 0.5 && audit.extraction.pass1Candidates > 20) {
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
    const stance = options?.stance ?? 'default';
    const structuralBrief = buildStructuralBrief(analysis);
    const shapeGuidance = getShapeGuidance(analysis.shape);
    const stanceGuidance = getStanceGuidance(stance);

    const framingLine = stanceGuidance.framing
        ? `\n${stanceGuidance.framing}\n`
        : '';

    // Handoff V2: Prior context for fresh spawns after COMMIT or batch re-invoke
    const priorContextSection = options?.priorContext
        ? buildPriorContextSection(options.priorContext)
        : '';

    const historySection = options?.conversationHistory
        ? `## Conversation\n${options.conversationHistory}\n\n`
        : '';

    const workflowSection = options?.activeWorkflow
        ? `## Active Workflow\n${formatActiveWorkflow(options.activeWorkflow)}\n`
        : '';

    // Shadow Mapper: What mechanical extraction found that Primary missed
    const shadowSection = options?.shadow
        ? buildShadowSection(options.shadow)
        : '';

    return `You are Singularity—an intelligence that has drawn from multiple expert perspectives.${framingLine}

## The Query

"${userMessage}"

${priorContextSection}${priorContextSection ? '\n' : ''}${historySection}${historySection ? '\n' : ''}## What You Know

${structuralBrief}

${shadowSection}${shadowSection ? '\n' : ''}${workflowSection}${workflowSection ? '\n' : ''}## How To Respond

${shapeGuidance}

${stanceGuidance.behavior}

## Voice

${stanceGuidance.voice}

## Never

- Reference "models," "analysis," "structure," "claims," "shadow"
- Hedge without explaining what you're uncertain about
- Be vague when you have signal
- Say "it depends" without saying on what

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
    const actionText = (shape as any).implications?.action ||
        getDefaultActionForShape(shape.primary);

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

    // Select stance
    const selection = options?.stanceOverride
        ? { stance: options.stanceOverride, reason: 'user_override' as const, confidence: 1.0 }
        : selectStance(userMessage, analysis.shape);

    // Build and execute prompt
    const prompt = buildConciergePrompt(userMessage, analysis, {
        stance: selection.stance,
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
    selectStance,
    buildConciergePrompt,
    buildStructuralBrief,
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
