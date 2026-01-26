// ═══════════════════════════════════════════════════════════════════════════
// TRAVERSAL ENGINE - Single Source of Truth
// ═══════════════════════════════════════════════════════════════════════════

import type { EnrichedClaim, MapperEdge, ConditionalPruner } from '../../../shared/contract';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ClaimStatus = 'active' | 'pruned';

export interface ConflictOption {
  claimId: string;
  label: string;
  text?: string;
  prerequisites: PrerequisiteInfo[];  // Advisory only
}

export interface PrerequisiteInfo {
  claimId: string;
  label: string;
  text?: string;
}

export interface ForcingPoint {
  id: string;
  type: 'conditional' | 'conflict';
  tier: number;
  
  // Universal
  question: string;
  condition: string;
  
  // Type-specific
  affectedClaims?: string[];           // For conditionals
  options?: ConflictOption[];          // For conflicts
  
  // Provenance
  sourceStatementIds: string[];
}

export interface Resolution {
  forcingPointId: string;
  type: 'conditional' | 'conflict';
  
  // Conditional resolution
  satisfied?: boolean;
  userInput?: string;
  
  // Conflict resolution
  selectedClaimId?: string;
  selectedLabel?: string;
}

export interface TraversalState {
  // Claim status tracking
  claimStatuses: Map<string, ClaimStatus>;
  
  // Resolution tracking
  resolutions: Map<string, Resolution>;
  
  // Path summary for synthesis
  pathSteps: string[];
}

export interface TraversalGraph {
  claims: EnrichedClaim[];
  edges: MapperEdge[];
  conditionals: ConditionalPruner[];
}

// ═══════════════════════════════════════════════════════════════════════════
// FORCING POINT EXTRACTION
// ═══════════════════════════════════════════════════════════════════════════

export function extractForcingPoints(
  graph: TraversalGraph
): ForcingPoint[] {
  const forcingPoints: ForcingPoint[] = [];
  const claimMap = new Map(graph.claims.map(c => [c.id, c]));
  let fpCounter = 0;

  // ─────────────────────────────────────────────────────────────────────────
  // TIER 0: Conditionals (Pruners)
  // ─────────────────────────────────────────────────────────────────────────
  
  for (const cond of graph.conditionals || []) {
    const normalizedAffected = (Array.isArray((cond as any)?.affectedClaims) ? (cond as any).affectedClaims : [])
      .map((cid: any) => String(cid || '').trim())
      .filter((cid: string) => cid.length > 0);
    const affectedClaims: string[] = Array.from(new Set<string>(normalizedAffected));
    if (affectedClaims.length === 0) continue;
    
    const sourceStatementIds = Array.from(
      new Set(
        affectedClaims
          .map((cid: string) => claimMap.get(cid)?.sourceStatementIds || [])
          .flat()
      )
    ).sort();

    const rawCondId = String((cond as any)?.id || '').trim();
    const fallbackId = `fp_cond_${fpCounter++}`;
    const id = rawCondId
      ? (rawCondId.startsWith('fp_cond_') ? rawCondId : `fp_cond_${rawCondId}`)
      : fallbackId;

    const rawQuestion = String(
      ((cond as any)?.question ?? (cond as any)?.condition ?? (cond as any)?.prompt ?? '') || ''
    ).trim();

    const isPlaceholder =
      !rawQuestion ||
      rawQuestion === id ||
      rawQuestion === `Condition: ${id}` ||
      (rawCondId && rawQuestion === `Condition: ${rawCondId}`);

    const affectedLabels = affectedClaims
      .map((cid: string) => String(claimMap.get(cid)?.label || cid).trim())
      .filter(Boolean);
    const affectedSummary = affectedLabels.slice(0, 3).join(', ') + (affectedLabels.length > 3 ? ` +${affectedLabels.length - 3} more` : '');

    const question = isPlaceholder ? 'Is this applicable to your situation?' : rawQuestion;
    const condition = isPlaceholder
      ? (affectedSummary ? `Affects: ${affectedSummary}` : `Affects ${affectedClaims.length} claim(s)`)
      : rawQuestion;

    forcingPoints.push({
      id,
      type: 'conditional',
      tier: 0,
      question,
      condition,
      affectedClaims,
      sourceStatementIds,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TIER 1+: Conflicts (Crucibles)
  // ─────────────────────────────────────────────────────────────────────────
  
  const conflictPairs = new Set<string>();
  
  for (const edge of graph.edges || []) {
    if (edge.type !== 'conflict') continue;
    
    const aId = edge.from;
    const bId = edge.to;
    const pairKey = [aId, bId].sort().join('::');
    
    if (conflictPairs.has(pairKey)) continue;
    conflictPairs.add(pairKey);
    
    const a = claimMap.get(aId);
    const b = claimMap.get(bId);
    if (!a || !b) continue;
    
    // Find prerequisites for each option (advisory context)
    const aPrereqs = findPrerequisites(aId, graph.edges, claimMap);
    const bPrereqs = findPrerequisites(bId, graph.edges, claimMap);
    
    const sourceStatementIds = Array.from(
      new Set([
        ...(a.sourceStatementIds || []),
        ...(b.sourceStatementIds || [])
      ])
    ).sort();
    
    const id = `fp_conflict_${pairKey}`;
    const question = String((edge as any).question || '').trim() 
      || `Choose between: ${a.label} vs ${b.label}`;

    forcingPoints.push({
      id,
      type: 'conflict',
      tier: 1,  // All conflicts are tier 1+
      question,
      condition: `${a.label} vs ${b.label}`,
      options: [
        {
          claimId: a.id,
          label: a.label,
          text: a.text,
          prerequisites: aPrereqs,
        },
        {
          claimId: b.id,
          label: b.label,
          text: b.text,
          prerequisites: bPrereqs,
        },
      ],
      sourceStatementIds,
    });
  }

  // Sort: conditionals first (tier 0), then conflicts
  forcingPoints.sort((a, b) => a.tier - b.tier);
  
  return forcingPoints;
}

function findPrerequisites(
  claimId: string,
  edges: MapperEdge[],
  claimMap: Map<string, EnrichedClaim>
): PrerequisiteInfo[] {
  return edges
    .filter(e => e.type === 'prerequisite' && e.to === claimId)
    .map(e => {
      const prereqClaim = claimMap.get(e.from);
      return {
        claimId: e.from,
        label: prereqClaim?.label || e.from,
        text: prereqClaim?.text,
      };
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

export function initTraversalState(claims: EnrichedClaim[]): TraversalState {
  const claimStatuses = new Map<string, ClaimStatus>();
  for (const c of claims) {
    claimStatuses.set(c.id, 'active');
  }

  return {
    claimStatuses,
    resolutions: new Map(),
    pathSteps: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE TRANSITIONS
// ═══════════════════════════════════════════════════════════════════════════

export function resolveConditional(
  state: TraversalState,
  graph: TraversalGraph,
  forcingPointId: string,
  forcingPoint: ForcingPoint,
  satisfied: boolean,
  userInput?: string
): TraversalState {
  const nextState: TraversalState = {
    claimStatuses: new Map(state.claimStatuses),
    resolutions: new Map(state.resolutions),
    pathSteps: [...state.pathSteps],
  };

  // Record resolution
  nextState.resolutions.set(forcingPointId, {
    forcingPointId,
    type: 'conditional',
    satisfied,
    userInput,
  });

  // Apply pruning if not satisfied
  if (!satisfied && forcingPoint.affectedClaims) {
    const prunedIds: string[] = [];
    
    for (const claimId of forcingPoint.affectedClaims) {
      prunedIds.push(claimId);
      nextState.claimStatuses.set(claimId, 'pruned');
    }
    
    // Cascade pruning to dependent claims
    cascadePruning(nextState, graph.edges, prunedIds);
    
    nextState.pathSteps.push(
      `✗ "${forcingPoint.condition}" — ${forcingPoint.affectedClaims.length} claim(s) pruned`
    );
  } else {
    nextState.pathSteps.push(
      `✓ "${forcingPoint.condition}"${userInput ? ` — ${userInput}` : ''}`
    );
  }

  return nextState;
}

export function resolveConflict(
  state: TraversalState,
  graph: TraversalGraph,
  forcingPointId: string,
  forcingPoint: ForcingPoint,
  selectedClaimId: string,
  selectedLabel: string
): TraversalState {
  const nextState: TraversalState = {
    claimStatuses: new Map(state.claimStatuses),
    resolutions: new Map(state.resolutions),
    pathSteps: [...state.pathSteps],
  };

  // Record resolution
  nextState.resolutions.set(forcingPointId, {
    forcingPointId,
    type: 'conflict',
    selectedClaimId,
    selectedLabel,
  });

  // Prune rejected option(s) and cascade
  if (forcingPoint.options) {
    const rejected = forcingPoint.options.filter(
      opt => opt.claimId !== selectedClaimId
    );
    
    const prunedIds: string[] = [];
    for (const opt of rejected) {
      prunedIds.push(opt.claimId);
      nextState.claimStatuses.set(opt.claimId, 'pruned');
    }
    
    // Cascade pruning to dependent claims
    cascadePruning(nextState, graph.edges, prunedIds);
    
    const rejectedLabels = rejected.map(r => r.label).join(', ');
    nextState.pathSteps.push(
      `→ Chose "${selectedLabel}" over "${rejectedLabels}"`
    );
  }

  return nextState;
}

// ═══════════════════════════════════════════════════════════════════════════
// LIVE FORCING POINTS
// ═══════════════════════════════════════════════════════════════════════════

export function getLiveForcingPoints(
  forcingPoints: ForcingPoint[],
  state: TraversalState
): ForcingPoint[] {
  return forcingPoints.filter(fp => {
    // Already resolved?
    if (state.resolutions.has(fp.id)) return false;

    // For conditionals: are any affected claims still active?
    if (fp.type === 'conditional' && fp.affectedClaims) {
      const hasActive = fp.affectedClaims.some(
        cid => state.claimStatuses.get(cid) === 'active'
      );
      if (!hasActive) return false;
    }

    // For conflicts: are both options still active?
    if (fp.type === 'conflict' && fp.options) {
      const activeOptions = fp.options.filter(
        opt => state.claimStatuses.get(opt.claimId) === 'active'
      );
      if (activeOptions.length < 2) return false;
    }

    return true;
  });
}

export function isTraversalComplete(
  forcingPoints: ForcingPoint[],
  state: TraversalState
): boolean {
  return getLiveForcingPoints(forcingPoints, state).length === 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════════

export function getActiveClaims(
  claims: EnrichedClaim[],
  state: TraversalState
): EnrichedClaim[] {
  return claims.filter(c => state.claimStatuses.get(c.id) === 'active');
}

export function getPrunedClaims(
  claims: EnrichedClaim[],
  state: TraversalState
): EnrichedClaim[] {
  return claims.filter(c => state.claimStatuses.get(c.id) === 'pruned');
}

export function getPathSummary(state: TraversalState): string {
  if (state.pathSteps.length === 0) {
    return 'No constraints applied.';
  }
  return state.pathSteps.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// CASCADING PRUNING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * When a claim is pruned, cascade the pruning to all claims that depend on it.
 * Uses prerequisite edges to determine dependency relationships.
 * Follows the entire dependency chain to the end.
 */
function cascadePruning(
  state: TraversalState,
  edges: MapperEdge[],
  initialPrunedIds: string[]
): void {
  const queue = [...initialPrunedIds];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const prunedId = queue.shift()!;
    
    // Skip if we've already processed this claim's dependents
    if (processed.has(prunedId)) continue;
    processed.add(prunedId);

    // Find all claims that have this as a prerequisite
    for (const edge of edges) {
      if (edge.type !== 'prerequisite') continue;
      if (edge.from !== prunedId) continue;

      const dependentId = edge.to;
      const currentStatus = state.claimStatuses.get(dependentId);

      // Only prune if still active
      if (currentStatus === 'active') {
        state.claimStatuses.set(dependentId, 'pruned');
        // Add to queue to cascade further - this is the key fix
        queue.push(dependentId);
      }
    }
  }
}
