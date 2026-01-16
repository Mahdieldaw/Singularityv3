// ═══════════════════════════════════════════════════════════════════════════
// SYNTHESIS PROMPT BUILDER - V4
// ═══════════════════════════════════════════════════════════════════════════

import { TraversalState, formatPathSummary } from './traversalState';
import { TraversalGraph } from './traversal';
import { ForcingPoint } from './forcingPoints';
import { AssembledClaim, formatClaimEvidence } from './claimAssembly';

export interface SynthesisContext {
    userQuery: string;
    traversalState: TraversalState;
    graph: TraversalGraph;
    forcingPoints: ForcingPoint[];
    ghosts: string[];
}

/**
 * Build the final prompt for the synthesis model.
 * This prompt includes the "collapsed" decision space based on user choices.
 */
export function buildSynthesisPrompt(ctx: SynthesisContext): string {
    const { userQuery, traversalState, graph, ghosts } = ctx;

    // 1. Get active and pruned claims
    const activeClaims = graph.claims.filter(c => traversalState.active.has(c.id));
    const prunedClaims = graph.claims.filter(c => traversalState.pruned.has(c.id));

    // 2. Format user path (audit of choices)
    const userPath = formatPathSummary(traversalState);

    // 3. Format active claims with evidence
    const activeWithEvidence = formatActiveClaims(activeClaims);

    // 4. Format pruned claims as brief notes (to acknowledge what was given up)
    const prunedNotes = prunedClaims.map(c => `- ${c.label}`).join('\n');

    // 5. Format ghosts (unaddressed gaps)
    const ghostNotes = ghosts.map(g => `? ${g}`).join('\n');

    return `<CONTEXT>
The user asked: "${userQuery}"

Based on a multi-model analysis and a recursive traversal of the decision space, we have identified the following definitive path for the user.
</CONTEXT>

<USER_PATH_CHOICES>
${userPath || 'No specific choices were necessary.'}
</USER_PATH_CHOICES>

<ACTIVE_CLAIMS_AND_EVIDENCE>
${activeWithEvidence}
</ACTIVE_CLAIMS_AND_EVIDENCE>

<PRUNED_ALTERNATIVES_NOT_CHOSEN>
${prunedNotes || 'None'}
</PRUNED_ALTERNATIVES_NOT_CHOSEN>

<IDENTIFIED_GAPS_AND_GHOSTS>
${ghostNotes || 'None identified'}
</IDENTIFIED_GAPS_AND_GHOSTS>

<INSTRUCTIONS>
Synthesize a definitive recommendation for this user given their specific path.

- Directly address the user's query using the evidence from the ACTIVE_CLAIMS.
- Use a confident, authoritative tone. Do not hedge.
- Reference the user's specific choices/confirmations from USER_PATH_CHOICES to show you are listening.
- If relevant, briefly acknowledge why the PRUNED_ALTERNATIVES were set aside.
- If the IDENTIFIED_GAPS pose a risk, mention them as a boundary.
- End with a concrete, actionable next step.

Be direct. They have navigated the complexity; now give them the answer.
</INSTRUCTIONS>`;
}

function formatActiveClaims(claims: AssembledClaim[]): string {
    return claims.map(claim => {
        let section = `## ${claim.label}\n${claim.description || claim.label}\n`;

        const evidence = formatClaimEvidence(claim);
        if (evidence) {
            section += `\nSupporting Evidence:\n${evidence}\n`;
        }

        return section;
    }).join('\n');
}
