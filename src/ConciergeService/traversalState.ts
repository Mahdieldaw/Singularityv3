// ═══════════════════════════════════════════════════════════════════════════
// TRAVERSAL STATE - TRAVERSAL ANALYSIS LAYER
// ═══════════════════════════════════════════════════════════════════════════

import { TraversalGraph, getCascade, updateTensionLiveness } from './traversal';
import { ForcingPoint, getLiveForcingPoints } from './forcingPoints';
import { AssembledClaim } from './claimAssembly';
import { ShadowStatement } from '../shadow';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type GateAnswer = 'yes' | 'no' | 'uncertain';
export type ConflictAnswer = string;  // Chosen claim ID

export interface Resolution {
    forcingPointId: string;
    type: ForcingPoint['type'];
    answer: GateAnswer | ConflictAnswer;
    timestamp: number;
}

/**
 * TraversalState tracks the "collapsed" state of the decision space.
 */
export interface TraversalState {
    // Resolutions
    resolved: Map<string, Resolution>;
    resolvedGates: Map<string, boolean>;  // gateId -> satisfied

    // Claim status
    active: Set<string>;
    pruned: Set<string>;
    selected: Set<string>;

    // Evidence collection
    collectedEvidence: Map<string, ShadowStatement[]>;

    // Progress
    currentTier: number;
    isComplete: boolean;

    // Path (for synthesis)
    pathSummary: string[];
}

export interface StateResult {
    state: TraversalState;
    liveForcingPoints: ForcingPoint[];
    nextForcingPoint: ForcingPoint | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

export function initTraversalState(
    graph: TraversalGraph,
    forcingPoints: ForcingPoint[]
): StateResult {

    const state: TraversalState = {
        resolved: new Map(),
        resolvedGates: new Map(),
        active: new Set(graph.claims.map(c => c.id)),
        pruned: new Set(),
        selected: new Set(),
        collectedEvidence: new Map(),
        currentTier: 0,
        isComplete: forcingPoints.length === 0,
        pathSummary: [],
    };

    const liveForcingPoints = getLiveForcingPoints(
        forcingPoints,
        new Set(),
        state.pruned
    );

    return {
        state,
        liveForcingPoints,
        nextForcingPoint: liveForcingPoints[0] || null,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════

export function applyAnswer(
    state: TraversalState,
    graph: TraversalGraph,
    forcingPoints: ForcingPoint[],
    fpId: string,
    answer: GateAnswer | ConflictAnswer
): StateResult {

    const fp = forcingPoints.find(f => f.id === fpId);
    if (!fp) throw new Error(`Unknown forcing point: ${fpId}`);

    // Clone state
    const newState: TraversalState = {
        resolved: new Map(state.resolved),
        resolvedGates: new Map(state.resolvedGates),
        active: new Set(state.active),
        pruned: new Set(state.pruned),
        selected: new Set(state.selected),
        collectedEvidence: new Map(state.collectedEvidence),
        currentTier: state.currentTier,
        isComplete: false,
        pathSummary: [...state.pathSummary],
    };

    // Record resolution
    newState.resolved.set(fpId, {
        forcingPointId: fpId,
        type: fp.type,
        answer,
        timestamp: Date.now(),
    });

    // Apply effects
    if (fp.type === 'conditional' || fp.type === 'prerequisite') {
        applyGateAnswer(newState, graph, fp, answer as GateAnswer);
    } else if (fp.type === 'conflict') {
        applyConflictAnswer(newState, graph, fp, answer as ConflictAnswer);
    }

    // Update tension liveness (for filtering future conflicts)
    const updatedTensions = updateTensionLiveness(
        graph.tensions,
        newState.resolvedGates,
        newState.pruned
    );

    // Find live forcing points
    const resolvedIds = new Set(newState.resolved.keys());
    const liveForcingPoints = getLiveForcingPoints(
        forcingPoints,
        resolvedIds,
        newState.pruned
    ).filter(fp => {
        // Additional filter: for conflicts, check tension is still live
        if (fp.type === 'conflict' && fp.options) {
            const tensionKey = [fp.options[0].claimId, fp.options[1].claimId].sort().join('::');
            const tension = updatedTensions.find(t =>
                [t.claimAId, t.claimBId].sort().join('::') === tensionKey
            );
            return tension?.isLive ?? false;
        }
        return true;
    });

    const nextForcingPoint = liveForcingPoints[0] || null;

    if (nextForcingPoint) {
        newState.currentTier = nextForcingPoint.tier;
    }

    // Robust completion check: Are there any live forcing points left?
    newState.isComplete = liveForcingPoints.length === 0;

    return {
        state: newState,
        liveForcingPoints,
        nextForcingPoint,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ANSWER HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

function applyGateAnswer(
    state: TraversalState,
    graph: TraversalGraph,
    fp: ForcingPoint,
    answer: GateAnswer
): void {

    if (!fp.gateId) return;

    // In our simplified model, fp.claimId is the claim that has the gate/prereq
    const claim = graph.claims.find(c => c.id === fp.claimId);

    if (answer === 'yes') {
        state.resolvedGates.set(fp.gateId, true);

        if (claim) {
            // Collecting evidence from the claim that was just unlocked
            state.collectedEvidence.set(claim.id, claim.sourceStatements);
            state.pathSummary.push(`✓ "${fp.condition}"`);
        }

    } else if (answer === 'no') {
        state.resolvedGates.set(fp.gateId, false);

        // Prune affected claims (the claim itself and all children)
        for (const claimId of fp.prunes) {
            state.pruned.add(claimId);
            state.active.delete(claimId);

            // Cascade
            const cascade = getCascade(claimId, graph);
            for (const cascadeId of cascade) {
                state.pruned.add(cascadeId);
                state.active.delete(cascadeId);
            }
        }

        state.pathSummary.push(`✗ "${fp.condition}" — does not apply`);

    } else {
        // Uncertain - proceed but flag
        state.pathSummary.push(`? "${fp.condition}" — uncertain`);
    }
}

function applyConflictAnswer(
    state: TraversalState,
    graph: TraversalGraph,
    fp: ForcingPoint,
    chosenId: ConflictAnswer
): void {

    if (!fp.options) return;

    const chosen = fp.options.find(o => o.claimId === chosenId);
    const rejected = fp.options.filter(o => o.claimId !== chosenId);

    if (!chosen) throw new Error(`Invalid choice: ${chosenId}`);

    const chosenClaim = graph.claims.find(c => c.id === chosenId);

    // Mark chosen
    state.selected.add(chosenId);

    if (chosenClaim) {
        state.collectedEvidence.set(chosenId, chosenClaim.sourceStatements);
    }

    // Prune rejected alternatives
    for (const r of rejected) {
        state.pruned.add(r.claimId);
        state.active.delete(r.claimId);

        const cascade = getCascade(r.claimId, graph);
        for (const cascadeId of cascade) {
            state.pruned.add(cascadeId);
            state.active.delete(cascadeId);
        }
    }

    const rejectedLabels = rejected.map(r => r.label).join(', ');
    state.pathSummary.push(`→ Chose "${chosen.label}" over "${rejectedLabels}"`);
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════

export function getActiveClaims(
    state: TraversalState,
    graph: TraversalGraph
): AssembledClaim[] {
    return graph.claims.filter(c => state.active.has(c.id));
}

export function getPrunedClaims(
    state: TraversalState,
    graph: TraversalGraph
): AssembledClaim[] {
    return graph.claims.filter(c => state.pruned.has(c.id));
}

export function getCollectedEvidence(state: TraversalState): ShadowStatement[] {
    return Array.from(state.collectedEvidence.values()).flat();
}

export function formatPathSummary(state: TraversalState): string {
    if (state.pathSummary.length === 0) return 'No constraints applied.';
    return state.pathSummary.join('\n');
}
