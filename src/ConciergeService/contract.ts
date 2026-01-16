// ═══════════════════════════════════════════════════════════════════════════
// SEMANTIC MAPPER OUTPUT CONTRACT
// ═══════════════════════════════════════════════════════════════════════════

import { Stance } from '../shadow';

// ═══════════════════════════════════════════════════════════════════════════
// GATE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Conditional Gate (Tier 0)
 * "If X" - a condition that must hold for this claim to exist in the decision space
 */
export interface ConditionalGate {
    id: string;                    // "cg_0", "cg_1"
    condition: string;             // The condition text
    sourceStatementIds: string[];  // Provenance
}

/**
 * Prerequisite Gate (Tier 1)
 * "Requires X" - another claim that must be satisfied first
 */
export interface PrerequisiteGate {
    id: string;                    // "pg_0", "pg_1"
    claimId: string;               // The required claim
    condition: string;             // Human-readable description of dependency
    sourceStatementIds: string[];  // Provenance
}

// ═══════════════════════════════════════════════════════════════════════════
// EDGE TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sequence Edge
 * This claim enables/comes-before the target claim
 */
export interface SequenceEdge {
    targetClaimId: string;
    sourceStatementIds: string[];  // Provenance
}

/**
 * Tension Edge
 * This claim conflicts/trades-off with the target claim
 */
export interface TensionEdge {
    targetClaimId: string;
    sourceStatementIds: string[];  // Provenance
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAIM TYPE
// ═══════════════════════════════════════════════════════════════════════════

export interface Claim {
    id: string;                    // "c_0", "c_1"

    // Human-legible abstraction
    label: string;                 // Short canonical form (required)
    description?: string;          // Optional clarification (non-authoritative)

    // Classification
    stance: Stance;                // Inherited from dominant source statements

    // Gating (Tier structure)
    gates: {
        conditionals: ConditionalGate[];   // Tier 0
        prerequisites: PrerequisiteGate[]; // Tier 1
    };

    // Relationships
    edges: {
        sequence: SequenceEdge[];  // This claim enables these
        tension: TensionEdge[];    // This claim conflicts with these
    };

    // Provenance (non-negotiable)
    sourceStatementIds: string[];  // ShadowStatement.id[]
}

// ═══════════════════════════════════════════════════════════════════════════
// MAPPER OUTPUT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Semantic Mapper produces claims only.
 * No excluded (Shadow Delta handles audit).
 * No ghosts (Traversal/Concierge handles gaps).
 */
export interface SemanticMapperOutput {
    claims: Claim[];
}
