// ═══════════════════════════════════════════════════════════════════════════
// CLAIM ASSEMBLY - TRAVERSAL ANALYSIS LAYER
// ═══════════════════════════════════════════════════════════════════════════

import { Stance, ShadowStatement } from '../shadow';
import {
    Claim,
    ConditionalGate,
    PrerequisiteGate,
    ConflictEdge,
    SemanticMapperOutput
} from './contract';

// ═══════════════════════════════════════════════════════════════════════════
// ASSEMBLED CLAIM (enriched with provenance)
// ═══════════════════════════════════════════════════════════════════════════

export interface AssembledClaim {
    id: string;
    label: string;
    description?: string;
    stance: Stance;

    // Gates (from mapper)
    gates: {
        conditionals: ConditionalGate[];
        prerequisites: PrerequisiteGate[];
    };

    // Relationships (from mapper)
    enables: string[];
    conflicts: ConflictEdge[];

    // Provenance (enriched)
    sourceStatementIds: string[];
    sourceStatements: ShadowStatement[];  // Resolved from IDs

    // Support metrics (computed)
    supporterModels: number[];
    supportRatio: number;

    // Signals (aggregated from sources)
    hasConditionalSignal: boolean;
    hasSequenceSignal: boolean;
    hasTensionSignal: boolean;

    // Computed during traversal graph building
    tier: number;
}

export interface ClaimAssemblyResult {
    claims: AssembledClaim[];

    meta: {
        totalClaims: number;
        conditionalGateCount: number;
        prerequisiteGateCount: number;
        conflictCount: number;
        modelCount: number;
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ASSEMBLY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function assembleClaims(
    mapperOutput: SemanticMapperOutput,
    shadowStatements: ShadowStatement[],
    modelCount: number
): ClaimAssemblyResult {

    const statementMap = new Map(shadowStatements.map(s => [s.id, s]));

    // First pass: assemble claims
    const claims: AssembledClaim[] = mapperOutput.claims.map(claim => {
        // Resolve source statements
        const sourceStatements = claim.sourceStatementIds
            .map(id => statementMap.get(id))
            .filter((s): s is ShadowStatement => s !== undefined);

        // Compute support
        const supporterModels = Array.from(new Set(sourceStatements.map(s => s.modelIndex)));
        const supportRatio = modelCount > 0 ? supporterModels.length / modelCount : 0;

        // Aggregate signals from sources
        const hasConditionalSignal = sourceStatements.some(s => s.signals.conditional);
        const hasSequenceSignal = sourceStatements.some(s => s.signals.sequence);
        const hasTensionSignal = sourceStatements.some(s => s.signals.tension);

        return {
            id: claim.id,
            label: claim.label,
            description: claim.description,
            stance: claim.stance,

            gates: claim.gates,
            enables: claim.enables || [],
            conflicts: claim.conflicts || [],

            sourceStatementIds: claim.sourceStatementIds,
            sourceStatements,

            supporterModels,
            supportRatio,

            hasConditionalSignal,
            hasSequenceSignal,
            hasTensionSignal,

            tier: 0,     // Computed in traversal
        };
    });

    // Second pass: compute inverse relationships (enables)
    const claimMap = new Map(claims.map(c => [c.id, c]));

    for (const claim of claims) {
        // For each prerequisite gate, the required claim "enables" this claim
        for (const prereq of claim.gates.prerequisites) {
            const requiredClaim = claimMap.get(prereq.claimId);
            if (requiredClaim && !requiredClaim.enables.includes(claim.id)) {
                requiredClaim.enables.push(claim.id);
            }
        }
        // Explicit enables from mapper are already on claim.enables
    }

    // Deduplicate enables for all claims
    for (const claim of claims) {
        claim.enables = Array.from(new Set(claim.enables));
    }

    // Compute meta
    const conditionalGateCount = claims.reduce(
        (sum, c) => sum + c.gates.conditionals.length, 0
    );
    const prerequisiteGateCount = claims.reduce(
        (sum, c) => sum + c.gates.prerequisites.length, 0
    );
    const conflictCount = claims.reduce(
        (sum, c) => sum + c.conflicts.length, 0
    );

    return {
        claims,
        meta: {
            totalClaims: claims.length,
            conditionalGateCount,
            prerequisiteGateCount,
            conflictCount,
            modelCount,
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVENANCE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get provenance for a specific gate
 */
export function getGateProvenance(
    gate: ConditionalGate | PrerequisiteGate,
    statementMap: Map<string, ShadowStatement>
): ShadowStatement[] {
    return gate.sourceStatementIds
        .map(id => statementMap.get(id))
        .filter((s): s is ShadowStatement => s !== undefined);
}

/**
 * Get provenance for a specific edge
 */
export function getConflictProvenance(
    conflict: ConflictEdge,
    statementMap: Map<string, ShadowStatement>
): ShadowStatement[] {
    return conflict.sourceStatementIds
        .map(id => statementMap.get(id))
        .filter((s): s is ShadowStatement => s !== undefined);
}

/**
 * Validate all provenance references exist
 */
export function validateProvenance(
    claims: Claim[],
    statementMap: Map<string, ShadowStatement>
): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const claim of claims) {
        // Check claim source statements
        for (const id of claim.sourceStatementIds) {
            if (!statementMap.has(id)) missing.push(id);
        }

        // Check gate provenance
        for (const gate of claim.gates.conditionals) {
            for (const id of gate.sourceStatementIds) {
                if (!statementMap.has(id)) missing.push(id);
            }
        }
        for (const gate of claim.gates.prerequisites) {
            for (const id of gate.sourceStatementIds) {
                if (!statementMap.has(id)) missing.push(id);
            }
        }

        // Check conflict provenance
        for (const conflict of (claim.conflicts || [])) {
            for (const id of conflict.sourceStatementIds) {
                if (!statementMap.has(id)) missing.push(id);
            }
        }
    }

    return {
        valid: missing.length === 0,
        missing: Array.from(new Set(missing)),
    };
}

/**
 * Format claim evidence for synthesis (from source statements)
 */
export function formatClaimEvidence(
    claim: AssembledClaim,
    maxStatements: number = 3
): string {
    return claim.sourceStatements
        .slice(0, maxStatements)
        .map(s => `> "${s.text}"`)
        .join('\n');
}
