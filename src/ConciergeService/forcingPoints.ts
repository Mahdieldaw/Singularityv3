// ═══════════════════════════════════════════════════════════════════════════
// FORCING POINTS - TRAVERSAL ANALYSIS LAYER
// ═══════════════════════════════════════════════════════════════════════════

import { TraversalGraph } from './traversal';


// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ForcingPointType = 'conditional' | 'prerequisite' | 'conflict';

export interface ConflictOption {
    claimId: string;
    label: string;
}

/**
 * A Forcing Point represents a user-facing interaction that 
 * collapses the decision graph.
 */
export interface ForcingPoint {
    id: string;
    type: ForcingPointType;
    tier: number;

    question: string;
    condition: string;           // Flat field

    // Type-specific (flat fields)
    gateId?: string;             // For conditional/prerequisite
    claimId?: string;            // For conditional/prerequisite/conflict (context)
    options?: ConflictOption[];  // For conflicts
    tensionSourceIds?: string[]; // For conflicts

    // Effects
    unlocks: string[];
    prunes: string[];

    // Dependencies
    blockedBy: string[];         // FP IDs that must resolve first

    // Provenance
    sourceStatementIds: string[];
}

export interface ForcingPointResult {
    forcingPoints: ForcingPoint[];

    meta: {
        conditionalCount: number;
        prerequisiteCount: number;
        conflictCount: number;
        maxTier: number;
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

export function extractForcingPoints(
    graph: TraversalGraph
): ForcingPointResult {

    const forcingPoints: ForcingPoint[] = [];
    const claimMap = new Map(graph.claims.map(c => [c.id, c]));
    let fpCounter = 0;

    // Track gate -> forcing point mapping for blockedBy resolution
    const gateToFp = new Map<string, string>();

    // 1. CONDITIONAL GATES (Tier 0)
    for (const claim of graph.claims) {
        for (const gate of claim.gates.conditionals) {
            const fpId = `fp_cond_${fpCounter++}`;
            gateToFp.set(gate.id, fpId);

            forcingPoints.push({
                id: fpId,
                type: 'conditional',
                tier: 0,

                question: 'Does this apply to your situation?',
                condition: gate.condition,

                gateId: gate.id,
                claimId: claim.id,

                unlocks: [claim.id],  // Fixed: [claim.id] not all claims with that gate
                prunes: [claim.id],   // Fixed: [claim.id]

                blockedBy: [],
                sourceStatementIds: gate.sourceStatementIds,
            });
        }
    }

    // 2. PREREQUISITE GATES
    for (const claim of graph.claims) {
        for (const gate of claim.gates.prerequisites) {
            const fpId = `fp_prereq_${fpCounter++}`;
            gateToFp.set(gate.id, fpId);

            const requiredClaim = claimMap.get(gate.claimId);
            if (!requiredClaim) continue;

            const tier = requiredClaim.tier;

            const blockedBy: string[] = [];
            for (const condGate of requiredClaim.gates.conditionals) {
                const blockingFpId = gateToFp.get(condGate.id);
                if (blockingFpId) blockedBy.push(blockingFpId);
            }
            for (const prereqGate of requiredClaim.gates.prerequisites) {
                const blockingFpId = gateToFp.get(prereqGate.id);
                if (blockingFpId) blockedBy.push(blockingFpId);
            }

            forcingPoints.push({
                id: fpId,
                type: 'prerequisite',
                tier,

                question: 'Do you have this in place?',
                condition: gate.condition,

                gateId: gate.id,
                claimId: gate.claimId, // The claim that HAS the prerequisite

                unlocks: [claim.id], // Fixed: [claim.id] not [claim.id, ...claim.enables]
                prunes: [claim.id],  // Fixed: [claim.id]

                blockedBy,
                sourceStatementIds: gate.sourceStatementIds,
            });
        }
    }

    // 3. CONFLICTS
    for (const tension of graph.tensions) {
        const claimA = claimMap.get(tension.claimAId);
        const claimB = claimMap.get(tension.claimBId);
        if (!claimA || !claimB) continue;

        const tier = Math.max(claimA.tier, claimB.tier) + 1;

        const blockedBy: string[] = [];
        for (const gateId of tension.blockedByGates) {
            const blockingFpId = gateToFp.get(gateId);
            if (blockingFpId) blockedBy.push(blockingFpId);
        }

        forcingPoints.push({
            id: `fp_conflict_${fpCounter++}`,
            type: 'conflict',
            tier,

            question: 'Which matters more to you?',
            condition: `${claimA.label} vs ${claimB.label}`,

            options: [
                { claimId: claimA.id, label: claimA.label },
                { claimId: claimB.id, label: claimB.label },
            ],
            tensionSourceIds: tension.sourceStatementIds,

            unlocks: [],
            prunes: [],

            blockedBy,
            sourceStatementIds: tension.sourceStatementIds,
        });
    }

    // 4. Sort
    const typePriority: Record<ForcingPointType, number> = {
        conditional: 0,
        prerequisite: 1,
        conflict: 2,
    };

    forcingPoints.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        return typePriority[a.type] - typePriority[b.type];
    });

    return {
        forcingPoints,
        meta: {
            conditionalCount: forcingPoints.filter(fp => fp.type === 'conditional').length,
            prerequisiteCount: forcingPoints.filter(fp => fp.type === 'prerequisite').length,
            conflictCount: forcingPoints.filter(fp => fp.type === 'conflict').length,
            maxTier: forcingPoints.length > 0 ? Math.max(...forcingPoints.map(fp => fp.tier)) : 0
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function getLiveForcingPoints(
    forcingPoints: ForcingPoint[],
    resolvedIds: Set<string>,
    prunedClaims: Set<string>
): ForcingPoint[] {
    return forcingPoints.filter(fp => {
        if (resolvedIds.has(fp.id)) return false;

        if (fp.type === 'conflict' && fp.options) {
            if (fp.options.some(o => prunedClaims.has(o.claimId))) return false;
        }

        if (fp.claimId && prunedClaims.has(fp.claimId)) return false;

        return fp.blockedBy.every(blockerId => resolvedIds.has(blockerId));
    });
}

export function getNextForcingPoint(
    forcingPoints: ForcingPoint[],
    resolvedIds: Set<string>,
    prunedClaims: Set<string>
): ForcingPoint | null {
    const live = getLiveForcingPoints(forcingPoints, resolvedIds, prunedClaims);
    return live[0] || null;
}
