import { useState, useCallback, useMemo } from 'react';

interface GateResolution {
  gateId: string;
  satisfied: boolean;
  userInput?: string;  // Optional user-provided context
}

interface ForcingPointResolution {
  forcingPointId: string;
  selectedClaimId: string;
  selectedLabel: string;
}

interface TraversalState {
  gateResolutions: Map<string, GateResolution>;
  forcingPointResolutions: Map<string, ForcingPointResolution>;
}

export function useTraversalState(traversalGraph: any, forcingPoints: any[]) {
  const [state, setState] = useState<TraversalState>({
    gateResolutions: new Map(),
    forcingPointResolutions: new Map(),

  });

  // Resolve a gate
  const resolveGate = useCallback((gateId: string, satisfied: boolean, userInput?: string) => {
    setState(prev => {
      const newResolutions = new Map(prev.gateResolutions);
      newResolutions.set(gateId, { gateId, satisfied, userInput });
      return { ...prev, gateResolutions: newResolutions };
    });
  }, []);

  // Resolve a forcing point
  const resolveForcingPoint = useCallback((
    forcingPointId: string,
    selectedClaimId: string,
    selectedLabel: string
  ) => {
    setState(prev => {
      const newResolutions = new Map(prev.forcingPointResolutions);
      newResolutions.set(forcingPointId, { forcingPointId, selectedClaimId, selectedLabel });
      return { ...prev, forcingPointResolutions: newResolutions };
    });
  }, []);

  // Check if all forcing points are resolved
  const isComplete = useMemo(() => {
    const tiers = Array.isArray(traversalGraph?.tiers) ? traversalGraph.tiers : [];
    const allGates = tiers.flatMap((t: any) => Array.isArray(t?.gates) ? t.gates : []);
    const gateIds = allGates.map((g: any) => g?.id).filter(Boolean);
    const allGatesResolved = gateIds.every((id: string) => state.gateResolutions.has(id));

    const fps = Array.isArray(forcingPoints) ? forcingPoints : [];
    const allForcingPointsResolved = fps.every((fp: any) => state.forcingPointResolutions.has(fp.id));

    return allGatesResolved && allForcingPointsResolved;
  }, [forcingPoints, state.forcingPointResolutions, traversalGraph, state.gateResolutions]);

  // Get unlocked tiers based on gate resolutions
  const unlockedTiers = useMemo(() => {
    const unlocked = new Set<number>([0]); // Tier 0 always unlocked

    if (!traversalGraph?.tiers || !Array.isArray(traversalGraph.tiers)) return unlocked;

    traversalGraph.tiers.forEach((tier: any) => {
      // Check if all gates blocking this tier are satisfied
      const blockingGates = tier.gates || [];
      const allGatesSatisfied = blockingGates.every((gate: any) => {
        const resolution = state.gateResolutions.get(gate.id);
        return resolution?.satisfied === true;
      });

      if (allGatesSatisfied || blockingGates.length === 0) {
        unlocked.add(tier.tierIndex);
      }
    });

    return unlocked;
  }, [traversalGraph, state.gateResolutions]);

  // Reset state
  const reset = useCallback(() => {
    setState({
      gateResolutions: new Map(),
      forcingPointResolutions: new Map(),
    });
  }, []);

  return {
    state,
    resolveGate,
    resolveForcingPoint,
    unlockedTiers,
    isComplete,
    reset
  };
}
