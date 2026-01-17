// ═══════════════════════════════════════════════════════════════════════════
// TRAVERSAL GRAPH - TRAVERSAL ANALYSIS LAYER
// ═══════════════════════════════════════════════════════════════════════════

import { AssembledClaim, ClaimAssemblyResult } from './claimAssembly';
import { TraversalTier, TraversalGate } from '../../shared/contract';


// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface LiveTension {
    claimAId: string;
    claimBId: string;
    question: string;
    sourceStatementIds: string[];  // Provenance for this tension

    // Status
    isLive: boolean;              // Both claims currently survive gating
    blockedByGates: string[];     // Gate IDs that block this tension
}

export interface TraversalGraph {
    claims: AssembledClaim[];

    // All tensions extracted from claims
    tensions: LiveTension[];

    // Tier assignments
    tiers: TraversalTier[];
    maxTier: number;

    // Root claims (no gates)
    roots: string[];

    // Cycle warnings
    cycles: string[][];
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN GRAPH BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export function buildTraversalGraph(
    assemblyResult: ClaimAssemblyResult
): TraversalGraph {

    const { claims } = assemblyResult;
    const claimMap = new Map(claims.map(c => [c.id, c]));

    // ─────────────────────────────────────────────────────────────────────
    // 1. Compute tiers via topological sort on gates
    // ─────────────────────────────────────────────────────────────────────

    const { tiers, maxTier, cycles } = computeTiers(claims);

    // Update claim tiers
    for (const tier of tiers) {
        for (const claimId of tier.claimIds) {
            const claim = claimMap.get(claimId);
            if (claim) claim.tier = tier.tierIndex;
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. Identify root claims (no gates at all)
    // ─────────────────────────────────────────────────────────────────────

    const roots = claims
        .filter(c =>
            c.gates.conditionals.length === 0 &&
            c.gates.prerequisites.length === 0
        )
        .map(c => c.id);

    // ─────────────────────────────────────────────────────────────────────
    // 3. Extract all tensions from claim conflicts
    // ─────────────────────────────────────────────────────────────────────

    const tensions: LiveTension[] = [];
    const seenTensions = new Set<string>();

    for (const claim of claims) {
        for (const conflict of claim.conflicts) {
            const targetClaim = claimMap.get(conflict.claimId);
            if (!targetClaim) continue;

            // Dedupe (A↔B same as B↔A)
            const key = [claim.id, conflict.claimId].sort().join('::');
            if (seenTensions.has(key)) continue;
            seenTensions.add(key);

            // Check if both claims have gates
            const aGateIds = [
                ...claim.gates.conditionals.map(g => g.id),
                ...claim.gates.prerequisites.map(g => g.id),
            ];
            const bGateIds = [
                ...targetClaim.gates.conditionals.map(g => g.id),
                ...targetClaim.gates.prerequisites.map(g => g.id),
            ];

            const blockedByGates = [...aGateIds, ...bGateIds];
            const isLive = blockedByGates.length === 0;

            tensions.push({
                claimAId: claim.id,
                claimBId: conflict.claimId,
                question: conflict.question,
                sourceStatementIds: conflict.sourceStatementIds,
                isLive,
                blockedByGates,
            });
        }
    }

    return {
        claims,
        tensions,
        tiers,
        maxTier,
        roots,
        cycles,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// TIER COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

function computeTiers(
    claims: AssembledClaim[]
): { tiers: TraversalTier[]; maxTier: number; cycles: string[][] } {

    const tierAssignment = new Map<string, number>();
    const cycles: string[][] = [];

    // Build dependency graph from prerequisite gates
    const dependsOn = new Map<string, string[]>();

    for (const claim of claims) {
        const deps: string[] = [];

        for (const prereq of claim.gates.prerequisites) {
            deps.push(prereq.claimId);
        }

        dependsOn.set(claim.id, deps);
    }

    // Topological sort with cycle detection
    function computeClaimTier(claimId: string, path: string[] = []): number {
        if (tierAssignment.has(claimId)) {
            return tierAssignment.get(claimId)!;
        }

        // Cycle detection
        if (path.includes(claimId)) {
            const cycleStart = path.indexOf(claimId);
            cycles.push([...path.slice(cycleStart), claimId]);
            return 0;
        }

        const deps = dependsOn.get(claimId) || [];

        const newPath = [...path, claimId];
        const maxDepTier = deps.length > 0
            ? Math.max(...deps.map(d => computeClaimTier(d, newPath)))
            : -1;
        const tier = maxDepTier + 1;

        tierAssignment.set(claimId, tier);
        return tier;
    }

    // Compute all tiers
    for (const claim of claims) {
        computeClaimTier(claim.id);
    }

    // Group by tier - use temp map
    const tempTiers = new Map<number, string[]>();
    let maxTier = 0;

    for (const [claimId, tier] of Array.from(tierAssignment.entries())) {
        maxTier = Math.max(maxTier, tier);
        const existing = tempTiers.get(tier) || [];
        existing.push(claimId);
        tempTiers.set(tier, existing);
    }

    // Convert to serializable object structure with gate mapping
    const tiers: TraversalTier[] = [];
    const claimMap = new Map(claims.map(c => [c.id, c]));

    for (const [tierIndex, claimIds] of Array.from(tempTiers.entries())) {
        // Find gates belonging to this tier's claims
        const gates: TraversalGate[] = [];

        for (const claimId of claimIds) {
            const claim = claimMap.get(claimId);
            if (claim) {
                if (claim.gates.conditionals) {
                    claim.gates.conditionals.forEach(g => {
                        gates.push({
                            ...g,
                            type: 'conditional',
                            blockedClaims: [claim.id]
                        });
                    });
                }
                if (claim.gates.prerequisites) {
                    claim.gates.prerequisites.forEach(g => {
                        gates.push({
                            ...g,
                            type: 'prerequisite',
                            blockedClaims: [claim.id]
                        });
                    });
                }
            }
        }

        tiers.push({
            tierIndex,
            claimIds,
            gates
        });
    }

    // Sort by tier index
    tiers.sort((a, b) => a.tierIndex - b.tierIndex);

    return { tiers, maxTier, cycles };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get cascade of claims affected if a gate is rejected
 */
export function getCascade(
    claimId: string,
    graph: TraversalGraph
): string[] {
    const affected = new Set<string>();
    const claimMap = new Map(graph.claims.map(c => [c.id, c]));
    const queue = [claimId];

    while (queue.length > 0) {
        const current = queue.shift()!;

        const claim = claimMap.get(current);
        if (!claim) continue;

        for (const enabledId of claim.enables) {
            if (!affected.has(enabledId)) {
                affected.add(enabledId);
                queue.push(enabledId);
            }
        }
    }

    return Array.from(affected);
}

/**
 * Update tension liveness based on resolved gates
 */
export function updateTensionLiveness(
    tensions: LiveTension[],
    resolvedGates: Map<string, boolean>,  // gateId -> satisfied
    prunedClaims: Set<string>
): LiveTension[] {
    return tensions.map(tension => {
        // If either claim is pruned, tension is dead
        if (prunedClaims.has(tension.claimAId) || prunedClaims.has(tension.claimBId)) {
            return { ...tension, isLive: false };
        }

        // Check if all blocking gates are resolved with 'yes'
        const allGatesSatisfied = tension.blockedByGates.every(gateId =>
            resolvedGates.get(gateId) === true
        );

        return { ...tension, isLive: allGatesSatisfied };
    });
}
