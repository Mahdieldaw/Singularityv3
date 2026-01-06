# Complete Shape-Specific Implementation

## Part 1: Type Definitions (Add to shared/contract.ts)

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// SHAPE-SPECIFIC DATA TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface FloorClaim {
  id: string;
  label: string;
  text: string;
  supportCount: number;
  supportRatio: number;
  isContested: boolean;
  contestedBy: string[];
}

export interface ChallengerInfo {
  id: string;
  label: string;
  text: string;
  supportCount: number;
  challenges: string | null;
  targetsClaim: string | null;
}

export interface ChainStep {
  id: string;
  label: string;
  text: string;
  supportCount: number;
  supportRatio: number;
  position: number;
  enables: string[];
  isWeakLink: boolean;
  weakReason: string | null;
}

export interface TradeoffOption {
  id: string;
  label: string;
  text: string;
  supportCount: number;
  supportRatio: number;
}

export interface DimensionCluster {
  id: string;
  theme: string;
  claims: Array<{
    id: string;
    label: string;
    text: string;
    supportCount: number;
  }>;
  cohesion: number;
  avgSupport: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHAPE DATA INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface SettledShapeData {
  pattern: 'settled';
  floor: FloorClaim[];
  floorStrength: 'strong' | 'moderate' | 'weak';
  challengers: ChallengerInfo[];
  blindSpots: string[];
  confidence: number;
}

export interface LinearShapeData {
  pattern: 'linear';
  chain: ChainStep[];
  chainLength: number;
  weakLinks: Array<{
    step: ChainStep;
    cascadeSize: number;
  }>;
  alternativeChains: ChainStep[][];
  terminalClaim: ChainStep | null;
}

export interface KeystoneShapeData {
  pattern: 'keystone';
  keystone: {
    id: string;
    label: string;
    text: string;
    supportCount: number;
    supportRatio: number;
    dominance: number;
    isFragile: boolean;
  };
  dependencies: Array<{
    id: string;
    label: string;
    relationship: 'prerequisite' | 'supports';
  }>;
  cascadeSize: number;
  challengers: ChallengerInfo[];
}

export interface ContestedShapeData {
  pattern: 'contested';
  centralConflict: CentralConflict;
  secondaryConflicts: ConflictInfo[];
  floor: {
    exists: boolean;
    claims: FloorClaim[];
    strength: 'strong' | 'weak' | 'absent';
    isContradictory: boolean;
  };
  fragilities: {
    leverageInversions: LeverageInversion[];
    articulationPoints: string[];
  };
  collapsingQuestion: string | null;
}

export interface TradeoffShapeData {
  pattern: 'tradeoff';
  tradeoffs: Array<{
    id: string;
    optionA: TradeoffOption;
    optionB: TradeoffOption;
    symmetry: 'both_high' | 'both_low' | 'asymmetric';
    governingFactor: string | null;
  }>;
  dominatedOptions: Array<{
    dominated: string;
    dominatedBy: string;
    reason: string;
  }>;
  floor: FloorClaim[];
}

export interface DimensionalShapeData {
  pattern: 'dimensional';
  dimensions: DimensionCluster[];
  interactions: Array<{
    dimensionA: string;
    dimensionB: string;
    relationship: 'independent' | 'overlapping' | 'conflicting';
  }>;
  gaps: string[];
  governingConditions: string[];
}

export interface ExploratoryShapeData {
  pattern: 'exploratory';
  strongestSignals: Array<{
    id: string;
    label: string;
    text: string;
    supportCount: number;
    reason: string;
  }>;
  looseClusters: DimensionCluster[];
  isolatedClaims: Array<{
    id: string;
    label: string;
    text: string;
  }>;
  clarifyingQuestions: string[];
  signalStrength: number;
}

export interface ContextualShapeData {
  pattern: 'contextual';
  governingCondition: string;
  branches: Array<{
    condition: string;
    claims: FloorClaim[];
  }>;
  defaultPath: {
    exists: boolean;
    claims: FloorClaim[];
  } | null;
  missingContext: string[];
}

export type ShapeData = 
  | SettledShapeData 
  | LinearShapeData 
  | KeystoneShapeData 
  | ContestedShapeData 
  | TradeoffShapeData 
  | DimensionalShapeData 
  | ExploratoryShapeData
  | ContextualShapeData;
```

---

## Part 2: Shape Data Builders (Add to PromptMethods.ts)

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// LAYER 8: SHAPE DATA BUILDERS (Complete)
// ═══════════════════════════════════════════════════════════════════════════

const buildSettledShapeData = (
  claims: EnrichedClaim[],
  edges: Edge[],
  ghosts: string[],
  patterns: StructuralAnalysis['patterns']
): SettledShapeData => {
  
  const floorClaims = claims.filter(c => c.isHighSupport);
  const challengers = claims.filter(c => c.role === 'challenger' || c.isChallenger);
  
  // Check if floor claims are contested
  const conflictEdges = edges.filter(e => e.type === 'conflicts');
  
  const floor: FloorClaim[] = floorClaims.map(c => {
    const contestedBy = conflictEdges
      .filter(e => e.from === c.id || e.to === c.id)
      .map(e => e.from === c.id ? e.to : e.from);
    
    return {
      id: c.id,
      label: c.label,
      text: c.text,
      supportCount: c.supporters.length,
      supportRatio: c.supportRatio,
      isContested: contestedBy.length > 0,
      contestedBy
    };
  });
  
  // Determine floor strength
  const avgSupport = floor.length > 0 
    ? floor.reduce((sum, c) => sum + c.supportRatio, 0) / floor.length 
    : 0;
  const floorStrength: 'strong' | 'moderate' | 'weak' = 
    avgSupport > 0.6 ? 'strong' : avgSupport > 0.4 ? 'moderate' : 'weak';
  
  const challengerInfos: ChallengerInfo[] = challengers.map(c => ({
    id: c.id,
    label: c.label,
    text: c.text,
    supportCount: c.supporters.length,
    challenges: c.challenges,
    targetsClaim: c.challenges // Could be enhanced to resolve to actual claim ID
  }));
  
  return {
    pattern: 'settled',
    floor,
    floorStrength,
    challengers: challengerInfos,
    blindSpots: ghosts,
    confidence: avgSupport
  };
};

const buildLinearShapeData = (
  claims: EnrichedClaim[],
  edges: Edge[],
  graph: GraphAnalysis,
  cascadeRisks: CascadeRisk[]
): LinearShapeData => {
  
  const prereqEdges = edges.filter(e => e.type === 'prerequisite');
  const chainIds = graph.longestChain;
  
  // Build chain with position info
  const chain: ChainStep[] = chainIds.map((id, idx) => {
    const claim = claims.find(c => c.id === id);
    if (!claim) return null;
    
    const enables = prereqEdges
      .filter(e => e.from === id)
      .map(e => e.to);
    
    // Determine if weak link
    const isWeakLink = claim.supporters.length === 1;
    const cascade = cascadeRisks.find(r => r.sourceId === id);
    
    return {
      id: claim.id,
      label: claim.label,
      text: claim.text,
      supportCount: claim.supporters.length,
      supportRatio: claim.supportRatio,
      position: idx,
      enables,
      isWeakLink,
      weakReason: isWeakLink ? `Only 1 supporter - cascade affects ${cascade?.dependentIds.length || 0} claims` : null
    };
  }).filter(Boolean) as ChainStep[];
  
  // Identify weak links with cascade info
  const weakLinks = chain
    .filter(step => step.isWeakLink)
    .map(step => {
      const cascade = cascadeRisks.find(r => r.sourceId === step.id);
      return {
        step,
        cascadeSize: cascade?.dependentIds.length || 0
      };
    });
  
  // Terminal claim
  const terminalClaim = chain.length > 0 ? chain[chain.length - 1] : null;
  
  return {
    pattern: 'linear',
    chain,
    chainLength: chain.length,
    weakLinks,
    alternativeChains: [], // Could be computed if multiple roots exist
    terminalClaim
  };
};

const buildKeystoneShapeData = (
  claims: EnrichedClaim[],
  edges: Edge[],
  graph: GraphAnalysis,
  patterns: StructuralAnalysis['patterns']
): KeystoneShapeData => {
  
  const keystoneId = graph.hubClaim;
  const keystoneClaim = claims.find(c => c.id === keystoneId);
  
  if (!keystoneClaim) {
    throw new Error("Keystone shape requires a hub claim");
  }
  
  // Find dependencies
  const dependencies = edges
    .filter(e => e.from === keystoneId && (e.type === 'prerequisite' || e.type === 'supports'))
    .map(e => {
      const dep = claims.find(c => c.id === e.to);
      return {
        id: e.to,
        label: dep?.label || e.to,
        relationship: e.type as 'prerequisite' | 'supports'
      };
    });
  
  // Find challengers targeting keystone
  const challengers = claims
    .filter(c => c.role === 'challenger')
    .filter(c => {
      // Check if this challenger conflicts with keystone
      return edges.some(e => 
        e.type === 'conflicts' && 
        ((e.from === c.id && e.to === keystoneId) || (e.to === c.id && e.from === keystoneId))
      );
    })
    .map(c => ({
      id: c.id,
      label: c.label,
      text: c.text,
      supportCount: c.supporters.length,
      challenges: c.challenges,
      targetsClaim: keystoneId
    }));
  
  // Cascade from keystone
  const cascade = patterns.cascadeRisks.find(r => r.sourceId === keystoneId);
  
  return {
    pattern: 'keystone',
    keystone: {
      id: keystoneClaim.id,
      label: keystoneClaim.label,
      text: keystoneClaim.text,
      supportCount: keystoneClaim.supporters.length,
      supportRatio: keystoneClaim.supportRatio,
      dominance: graph.hubDominance,
      isFragile: keystoneClaim.supporters.length <= 1
    },
    dependencies,
    cascadeSize: cascade?.dependentIds.length || dependencies.length,
    challengers
  };
};

const buildContestedShapeData = (
  claims: EnrichedClaim[],
  edges: Edge[],
  patterns: StructuralAnalysis['patterns'],
  conflictInfos: ConflictInfo[],
  conflictClusters: ConflictCluster[]
): ContestedShapeData => {
  
  // Identify central conflict
  let centralConflict: CentralConflict;
  
  if (conflictClusters.length > 0) {
    // Sort by number of challengers
    const topCluster = conflictClusters.sort((a, b) => 
      b.challengerIds.length - a.challengerIds.length
    )[0];
    
    const target = claims.find(c => c.id === topCluster.targetId)!;
    const challengerClaims = claims.filter(c => topCluster.challengerIds.includes(c.id));
    
    centralConflict = {
      type: 'cluster',
      axis: topCluster.axis,
      target: {
        claim: {
          id: target.id,
          label: target.label,
          text: target.text,
          supportCount: target.supporters.length,
          supportRatio: target.supportRatio,
          role: target.role,
          isHighSupport: target.isHighSupport,
          challenges: target.challenges
        },
        supportingClaims: [],
        supportRationale: target.text
      },
      challengers: {
        claims: challengerClaims.map(c => ({
          id: c.id,
          label: c.label,
          text: c.text,
          supportCount: c.supporters.length,
          supportRatio: c.supportRatio,
          role: c.role,
          isHighSupport: c.isHighSupport,
          challenges: c.challenges
        })),
        commonTheme: topCluster.theme,
        supportingClaims: []
      },
      dynamics: 'one_vs_many',
      stakes: {
        acceptingTarget: `Accepting ${target.label} means accepting the established position`,
        acceptingChallengers: `Accepting challengers means reconsidering the established position`
      }
    };
  } else if (conflictInfos.length > 0) {
    // Use highest significance conflict
    const topConflict = conflictInfos.sort((a, b) => b.significance - a.significance)[0];
    
    centralConflict = {
      type: 'individual',
      axis: topConflict.axis.resolved,
      positionA: {
        claim: topConflict.claimA,
        supportingClaims: [],
        supportRationale: topConflict.claimA.text
      },
      positionB: {
        claim: topConflict.claimB,
        supportingClaims: [],
        supportRationale: topConflict.claimB.text
      },
      dynamics: topConflict.dynamics,
      stakes: topConflict.stakes
    };
  } else {
    throw new Error("Contested shape requires at least one conflict");
  }
  
  // Collect IDs used in central conflict
  const usedIds = new Set<string>();
  if (centralConflict.type === 'individual') {
    usedIds.add(centralConflict.positionA.claim.id);
    usedIds.add(centralConflict.positionB.claim.id);
  } else {
    usedIds.add(centralConflict.target.claim.id);
    centralConflict.challengers.claims.forEach(c => usedIds.add(c.id));
  }
  
  // Secondary conflicts
  const secondaryConflicts = conflictInfos.filter(c => 
    !usedIds.has(c.claimA.id) || !usedIds.has(c.claimB.id)
  );
  
  // Floor (high support claims not in conflict)
  const floorClaims = claims.filter(c => c.isHighSupport && !usedIds.has(c.id));
  
  return {
    pattern: 'contested',
    centralConflict,
    secondaryConflicts,
    floor: {
      exists: floorClaims.length > 0,
      claims: floorClaims.map(c => ({
        id: c.id,
        label: c.label,
        text: c.text,
        supportCount: c.supporters.length,
        supportRatio: c.supportRatio,
        isContested: false,
        contestedBy: []
      })),
      strength: floorClaims.length > 2 ? 'strong' : floorClaims.length > 0 ? 'weak' : 'absent',
      isContradictory: false
    },
    fragilities: {
      leverageInversions: patterns.leverageInversions,
      articulationPoints: []
    },
    collapsingQuestion: `What matters more: ${centralConflict.axis}?`
  };
};

const buildTradeoffShapeData = (
  claims: EnrichedClaim[],
  edges: Edge[],
  tradeoffPairs: TradeoffPair[]
): TradeoffShapeData => {
  
  const tradeoffs = tradeoffPairs.map((t, idx) => {
    const claimA = claims.find(c => c.id === t.claimA.id);
    const claimB = claims.find(c => c.id === t.claimB.id);
    
    return {
      id: `tradeoff_${idx}`,
      optionA: {
        id: t.claimA.id,
        label: t.claimA.label,
        text: claimA?.text || '',
        supportCount: t.claimA.supporterCount,
        supportRatio: claimA?.supportRatio || 0
      },
      optionB: {
        id: t.claimB.id,
        label: t.claimB.label,
        text: claimB?.text || '',
        supportCount: t.claimB.supporterCount,
        supportRatio: claimB?.supportRatio || 0
      },
      symmetry: t.symmetry as 'both_high' | 'both_low' | 'asymmetric',
      governingFactor: null // Could be inferred from claim texts
    };
  });
  
  // Find dominated options (where one tradeoff partner is strictly better)
  const dominatedOptions: Array<{ dominated: string; dominatedBy: string; reason: string }> = [];
  
  for (const t of tradeoffs) {
    // Simple heuristic: if one has much higher support and same connectivity, it dominates
    const supportDiff = Math.abs(t.optionA.supportRatio - t.optionB.supportRatio);
    if (supportDiff > 0.3) {
      const [higher, lower] = t.optionA.supportRatio > t.optionB.supportRatio 
        ? [t.optionA, t.optionB] 
        : [t.optionB, t.optionA];
      
      // Check if lower has any unique advantage (conflicts or prerequisites)
      const lowerHasUniqueValue = edges.some(e => 
        (e.from === lower.id || e.to === lower.id) && 
        e.type === 'prerequisite'
      );
      
      if (!lowerHasUniqueValue) {
        dominatedOptions.push({
          dominated: lower.id,
          dominatedBy: higher.id,
          reason: `${higher.label} has significantly higher support with no unique tradeoff benefit`
        });
      }
    }
  }
  
  // Floor: high support claims not in tradeoffs
  const tradeoffIds = new Set(tradeoffs.flatMap(t => [t.optionA.id, t.optionB.id]));
  const floorClaims = claims
    .filter(c => c.isHighSupport && !tradeoffIds.has(c.id))
    .map(c => ({
      id: c.id,
      label: c.label,
      text: c.text,
      supportCount: c.supporters.length,
      supportRatio: c.supportRatio,
      isContested: false,
      contestedBy: []
    }));
  
  return {
    pattern: 'tradeoff',
    tradeoffs,
    dominatedOptions,
    floor: floorClaims
  };
};

const buildDimensionalShapeData = (
  claims: EnrichedClaim[],
  edges: Edge[],
  graph: GraphAnalysis,
  ghosts: string[]
): DimensionalShapeData => {
  
  // Use graph components as dimensions
  const dimensions: DimensionCluster[] = graph.components
    .filter(comp => comp.length >= 2) // Only meaningful clusters
    .map((componentIds, idx) => {
      const componentClaims = claims.filter(c => componentIds.includes(c.id));
      
      // Infer theme from claim labels (simple heuristic)
      const theme = `Dimension ${idx + 1}`; // Could use NLP to extract common theme
      
      const avgSupport = componentClaims.reduce((sum, c) => sum + c.supportRatio, 0) / componentClaims.length;
      
      // Compute cohesion (internal edge density)
      const internalEdges = edges.filter(e => 
        componentIds.includes(e.from) && componentIds.includes(e.to)
      ).length;
      const possibleEdges = componentClaims.length * (componentClaims.length - 1);
      const cohesion = possibleEdges > 0 ? internalEdges / possibleEdges : 0;
      
      return {
        id: `dim_${idx}`,
        theme,
        claims: componentClaims.map(c => ({
          id: c.id,
          label: c.label,
          text: c.text,
          supportCount: c.supporters.length
        })),
        cohesion,
        avgSupport
      };
    });
  
  // Detect interactions between dimensions
  const interactions: Array<{
    dimensionA: string;
    dimensionB: string;
    relationship: 'independent' | 'overlapping' | 'conflicting';
  }> = [];
  
  for (let i = 0; i < dimensions.length; i++) {
    for (let j = i + 1; j < dimensions.length; j++) {
      const dimA = dimensions[i];
      const dimB = dimensions[j];
      
      // Check for edges between dimensions
      const crossEdges = edges.filter(e => 
        (dimA.claims.some(c => c.id === e.from) && dimB.claims.some(c => c.id === e.to)) ||
        (dimB.claims.some(c => c.id === e.from) && dimA.claims.some(c => c.id === e.to))
      );
      
      const hasConflict = crossEdges.some(e => e.type === 'conflicts');
      const hasSupport = crossEdges.some(e => e.type === 'supports' || e.type === 'prerequisite');
      
      let relationship: 'independent' | 'overlapping' | 'conflicting';
      if (hasConflict) {
        relationship = 'conflicting';
      } else if (hasSupport) {
        relationship = 'overlapping';
      } else {
        relationship = 'independent';
      }
      
      interactions.push({
        dimensionA: dimA.id,
        dimensionB: dimB.id,
        relationship
      });
    }
  }
  
  // Governing conditions (extracted from conditional claims)
  const governingConditions = claims
    .filter(c => c.type === 'conditional')
    .map(c => c.text);
  
  return {
    pattern: 'dimensional',
    dimensions,
    interactions,
    gaps: ghosts,
    governingConditions
  };
};

const buildExploratoryShapeData = (
  claims: EnrichedClaim[],
  edges: Edge[],
  graph: GraphAnalysis,
  ghosts: string[],
  signalStrength: number
): ExploratoryShapeData => {
  
  // Strongest signals: highest support + most connected
  const sortedBySupport = [...claims].sort((a, b) => b.supporters.length - a.supporters.length);
  const sortedByDegree = [...claims].sort((a, b) => (b.inDegree + b.outDegree) - (a.inDegree + a.outDegree));
  
  const strongestSignals: Array<{
    id: string;
    label: string;
    text: string;
    supportCount: number;
    reason: string;
  }> = [];
  
  // Top by support
  if (sortedBySupport[0]) {
    strongestSignals.push({
      id: sortedBySupport[0].id,
      label: sortedBySupport[0].label,
      text: sortedBySupport[0].text,
      supportCount: sortedBySupport[0].supporters.length,
      reason: 'Highest support'
    });
  }
  
  // Top by connectivity (if different)
  if (sortedByDegree[0] && sortedByDegree[0].id !== sortedBySupport[0]?.id) {
    strongestSignals.push({
      id: sortedByDegree[0].id,
      label: sortedByDegree[0].label,
      text: sortedByDegree[0].text,
      supportCount: sortedByDegree[0].supporters.length,
      reason: 'Most connected'
    });
  }
  
  // Loose clusters (small components)
  const looseClusters: DimensionCluster[] = graph.components
    .filter(comp => comp.length >= 2 && comp.length <= 4)
    .map((componentIds, idx) => {
      const componentClaims = claims.filter(c => componentIds.includes(c.id));
      const avgSupport = componentClaims.reduce((sum, c) => sum + c.supportRatio, 0) / componentClaims.length;
      
      return {
        id: `cluster_${idx}`,
        theme: `Cluster ${idx + 1}`,
        claims: componentClaims.map(c => ({
          id: c.id,
          label: c.label,
          text: c.text,
          supportCount: c.supporters.length
        })),
        cohesion: 0,
        avgSupport
      };
    });
  
  // Isolated claims
  const isolatedClaims = claims
    .filter(c => c.isIsolated)
    .map(c => ({
      id: c.id,
      label: c.label,
      text: c.text
    }));
  
  // Generate clarifying questions based on gaps
  const clarifyingQuestions: string[] = [];
  
  if (ghosts.length > 0) {
    clarifyingQuestions.push(`What about: ${ghosts[0]}?`);
  }
  
  if (isolatedClaims.length > 0) {
    clarifyingQuestions.push(`How does "${isolatedClaims[0].label}" relate to the other perspectives?`);
  }
  
  if (claims.some(c => c.type === 'conditional')) {
    clarifyingQuestions.push(`What is your specific context or constraints?`);
  }
  
  if (clarifyingQuestions.length === 0) {
    clarifyingQuestions.push(`What outcome are you optimizing for?`);
  }
  
  return {
    pattern: 'exploratory',
    strongestSignals,
    looseClusters,
    isolatedClaims,
    clarifyingQuestions,
    signalStrength
  };
};

const buildContextualShapeData = (
  claims: EnrichedClaim[],
  edges: Edge[],
  ghosts: string[]
): ContextualShapeData => {
  
  // Find conditional claims that create branches
  const conditionalClaims = claims.filter(c => c.type === 'conditional');
  const branchClaims = claims.filter(c => c.role === 'branch');
  
  // Try to identify the governing condition
  let governingCondition = "User's specific situation";
  
  if (conditionalClaims.length > 0) {
    // Extract condition from first conditional claim
    governingCondition = conditionalClaims[0].text;
  }
  
  // Group claims into branches based on prerequisites
  const branches: Array<{
    condition: string;
    claims: FloorClaim[];
  }> = [];
  
  // Simple heuristic: use components as branches
  const prereqEdges = edges.filter(e => e.type === 'prerequisite');
  const roots = claims.filter(c => 
    !prereqEdges.some(e => e.to === c.id) && 
    prereqEdges.some(e => e.from === c.id)
  );
  
  roots.forEach((root, idx) => {
    const branchClaims: FloorClaim[] = [{
      id: root.id,
      label: root.label,
      text: root.text,
      supportCount: root.supporters.length,
      supportRatio: root.supportRatio,
      isContested: false,
      contestedBy: []
    }];
    
    // Add claims that depend on this root
    const dependents = prereqEdges
      .filter(e => e.from === root.id)
      .map(e => claims.find(c => c.id === e.to))
      .filter(Boolean) as EnrichedClaim[];
    
    dependents.forEach(d => {
      branchClaims.push({
        id: d.id,
        label: d.label,
        text: d.text,
        supportCount: d.supporters.length,
        supportRatio: d.supportRatio,
        isContested: false,
        contestedBy: []
      });
    });
    
    branches.push({
      condition: `If ${root.label}`,
      claims: branchClaims
    });
  });
  
  // Default path: highest support branch
  const defaultPath = branches.length > 0
    ? {
        exists: true,
        claims: branches.sort((a, b) => 
          b.claims.reduce((s, c) => s + c.supportCount, 0) - 
          a.claims.reduce((s, c) => s + c.supportCount, 0)
        )[0].claims
      }
    : null;
  
  // Missing context from ghosts
  const missingContext = ghosts.filter(g => 
    g.toLowerCase().includes('context') || 
    g.toLowerCase().includes('depend') ||
    g.toLowerCase().includes('situation')
  );
  
  return {
    pattern: 'contextual',
    governingCondition,
    branches,
    defaultPath,
    missingContext: missingContext.length > 0 ? missingContext : ghosts.slice(0, 2)
  };
};
```

---

## Part 3: Update computeStructuralAnalysis to build all shape data

```typescript
// In computeStructuralAnalysis(), replace the shape.data building section:

// Layer 8: Shape Data Builders
const signalStrength = computeSignalStrength(
  claimsWithLeverage.length,
  edges.length,
  landscape.modelCount,
  claimsWithLeverage.map(c => c.supporters)
);

try {
  switch (shape.primaryPattern) {
    case 'settled':
      shape.data = buildSettledShapeData(claimsWithLeverage, edges, ghosts, patterns);
      break;
    case 'linear':
      shape.data = buildLinearShapeData(claimsWithLeverage, edges, graph, patterns.cascadeRisks);
      break;
    case 'keystone':
      if (graph.hubClaim) {
        shape.data = buildKeystoneShapeData(claimsWithLeverage, edges, graph, patterns);
      }
      break;
    case 'contested':
      shape.data = buildContestedShapeData(
        claimsWithLeverage, 
        edges, 
        patterns, 
        enrichedConflicts, 
        conflictClusters
      );
      break;
    case 'tradeoff':
      shape.data = buildTradeoffShapeData(claimsWithLeverage, edges, patterns.tradeoffs);
      break;
    case 'dimensional':
      shape.data = buildDimensionalShapeData(claimsWithLeverage, edges, graph, ghosts);
      break;
    case 'contextual':
      shape.data = buildContextualShapeData(claimsWithLeverage, edges, ghosts);
      break;
    case 'exploratory':
    default:
      shape.data = buildExploratoryShapeData(claimsWithLeverage, edges, graph, ghosts, signalStrength);
      break;
  }
} catch (e) {
  console.warn("Failed to build shape data:", e);
  // Fallback to exploratory if shape-specific builder fails
  shape.data = buildExploratoryShapeData(claimsWithLeverage, edges, graph, ghosts, signalStrength);
}
```

---

## Part 4: Shape-Specific Brief Builders (Add to PromptService_v2.ts)

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// SHAPE-SPECIFIC BRIEF BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildSettledBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, ratios, ghostAnalysis } = analysis;
  const data = shape.data as SettledShapeData;
  
  if (!data || data.pattern !== 'settled') {
    return buildGenericBrief(analysis);
  }
  
  let brief = '';
  
  // Header
  brief += `## Shape: SETTLED (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Strong agreement exists. The floor is established.\n\n`;
  
  // Floor strength indicator
  brief += `**Floor Strength**: ${data.floorStrength.toUpperCase()}\n`;
  brief += `**Claims**: ${landscape.claimCount} from ${landscape.modelCount} sources\n`;
  brief += `**Concentration**: ${Math.round(ratios.concentration * 100)}%\n\n`;
  
  // The Floor
  brief += `## The Floor\n\n`;
  if (data.floor.length > 0) {
    data.floor.forEach(c => {
      const contested = c.isContested ? ' ⚠️ CONTESTED' : '';
      brief += `**${c.label}** [${c.supportCount}/${landscape.modelCount}]${contested}\n`;
      brief += `${c.text}\n\n`;
    });
  } else {
    brief += `No strong consensus claims.\n\n`;
  }
  
  // Challengers
  if (data.challengers.length > 0) {
    brief += `## Challengers\n\n`;
    data.challengers.forEach(c => {
      brief += `⚡ **${c.label}** [${c.supportCount}/${landscape.modelCount}]\n`;
      brief += `${c.text}\n`;
      if (c.challenges) {
        brief += `*Challenges: ${c.challenges}*\n`;
      }
      brief += `\n`;
    });
  }
  
  // Blind Spots
  if (data.blindSpots.length > 0) {
    brief += `## Blind Spots\n\n`;
    data.blindSpots.forEach(g => {
      brief += `• ${g}\n`;
    });
    brief += `\n`;
  }
  
  // Warning if floor is contested
  const contestedFloor = data.floor.filter(c => c.isContested);
  if (contestedFloor.length > 0) {
    brief += `## ⚠️ Warning\n\n`;
    brief += `${contestedFloor.length} floor claim(s) are under challenge. Settlement may be fragile.\n`;
  }
  
  return brief;
}

function buildLinearBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, ratios } = analysis;
  const data = shape.data as LinearShapeData;
  
  if (!data || data.pattern !== 'linear') {
    return buildGenericBrief(analysis);
  }
  
  let brief = '';
  
  // Header
  brief += `## Shape: LINEAR (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `There's a sequence of ${data.chainLength} steps. Order matters.\n\n`;
  
  // Metrics
  brief += `**Chain Length**: ${data.chainLength} steps\n`;
  brief += `**Weak Links**: ${data.weakLinks.length}\n`;
  brief += `**Depth**: ${Math.round(ratios.depth * 100)}%\n\n`;
  
  // The Chain
  brief += `## The Chain\n\n`;
  data.chain.forEach((step, idx) => {
    const weakIcon = step.isWeakLink ? ' ⚠️ WEAK' : '';
    const arrow = idx < data.chain.length - 1 ? ' →' : ' (terminal)';
    
    brief += `### Step ${idx + 1}: ${step.label}${weakIcon}\n`;
    brief += `[${step.supportCount}/${landscape.modelCount}]${arrow}\n\n`;
    brief += `${step.text}\n\n`;
    
    if (step.isWeakLink && step.weakReason) {
      brief += `*⚠️ ${step.weakReason}*\n\n`;
    }
  });
  
  // Weak Links Summary
  if (data.weakLinks.length > 0) {
    brief += `## Cascade Risks\n\n`;
    data.weakLinks.forEach(wl => {
      brief += `• **${wl.step.label}** — If this fails, ${wl.cascadeSize} downstream step(s) fail\n`;
    });
    brief += `\n`;
  }
  
  return brief;
}

function buildKeystoneBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, ratios } = analysis;
  const data = shape.data as KeystoneShapeData;
  
  if (!data || data.pattern !== 'keystone') {
    return buildGenericBrief(analysis);
  }
  
  let brief = '';
  
  // Header
  brief += `## Shape: KEYSTONE (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Everything hinges on one critical claim.\n\n`;
  
  // The Keystone
  const fragileIcon = data.keystone.isFragile ? ' ⚠️ FRAGILE' : ' ✓ SOLID';
  brief += `## The Keystone${fragileIcon}\n\n`;
  brief += `**${data.keystone.label}** [${data.keystone.supportCount}/${landscape.modelCount}]\n`;
  brief += `${data.keystone.text}\n\n`;
  brief += `**Dominance**: ${data.keystone.dominance.toFixed(1)}x more connected than next claim\n`;
  brief += `**Cascade Size**: ${data.cascadeSize} dependent claims\n\n`;
  
  // Dependencies
  if (data.dependencies.length > 0) {
    brief += `## Dependencies\n\n`;
    brief += `These claims require the keystone to hold:\n\n`;
    data.dependencies.forEach(d => {
      brief += `• **${d.label}** (${d.relationship})\n`;
    });
    brief += `\n`;
  }
  
  // If Keystone Fails
  brief += `## If Keystone Fails\n\n`;
  if (data.keystone.isFragile) {
    brief += `⚠️ **HIGH RISK**: The keystone has only ${data.keystone.supportCount} supporter(s).\n`;
    brief += `If it falls, ${data.cascadeSize} claims collapse with it.\n\n`;
  } else {
    brief += `The keystone has solid support, but still carries ${data.cascadeSize} dependents.\n\n`;
  }
  
  // Challengers to Keystone
  if (data.challengers.length > 0) {
    brief += `## Challengers to Keystone\n\n`;
    data.challengers.forEach(c => {
      brief += `⚡ **${c.label}** [${c.supportCount}/${landscape.modelCount}]\n`;
      brief += `${c.text}\n\n`;
    });
  }
  
  return brief;
}

function buildContestedBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, ratios, patterns } = analysis;
  const data = shape.data as ContestedShapeData;
  
  if (!data || data.pattern !== 'contested') {
    return buildGenericBrief(analysis);
  }
  
  let brief = '';
  
  // Header
  brief += `## Shape: CONTESTED (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `There is genuine disagreement. The axis is: **${data.centralConflict.axis}**\n\n`;
  
  // Metrics
  brief += `**Tension**: ${Math.round(ratios.tension * 100)}%\n`;
  brief += `**Conflicts**: ${patterns.conflicts.length}\n\n`;
  
  // Central Conflict
  brief += `## The Central Conflict\n\n`;
  
  if (data.centralConflict.type === 'cluster') {
    const cc = data.centralConflict;
    
    brief += `### Target Position\n`;
    brief += `**${cc.target.claim.label}** [${cc.target.claim.supportCount}/${landscape.modelCount}]\n`;
    brief += `${cc.target.claim.text}\n\n`;
    
    brief += `### Challenger Positions (${cc.challengers.claims.length})\n`;
    cc.challengers.claims.forEach(c => {
      brief += `⚡ **${c.label}** [${c.supportCount}/${landscape.modelCount}]\n`;
      brief += `${c.text}\n\n`;
    });
    
    brief += `**Common Theme**: ${cc.challengers.commonTheme}\n\n`;
    
  } else {
    const cc = data.centralConflict;
    
    brief += `### Position A\n`;
    brief += `**${cc.positionA.claim.label}** [${cc.positionA.claim.supportCount}/${landscape.modelCount}]\n`;
    brief += `${cc.positionA.claim.text}\n\n`;
    
    brief += `### Position B\n`;
    brief += `**${cc.positionB.claim.label}** [${cc.positionB.claim.supportCount}/${landscape.modelCount}]\n`;
    brief += `${cc.positionB.claim.text}\n\n`;
    
    brief += `**Dynamics**: ${cc.dynamics}\n`;
  }
  
  // Stakes
  brief += `\n## Stakes\n\n`;
  brief += `• ${data.centralConflict.stakes.acceptingTarget || data.centralConflict.stakes.choosingA}\n`;
  brief += `• ${data.centralConflict.stakes.acceptingChallengers || data.centralConflict.stakes.choosingB}\n\n`;
  
  // Secondary Conflicts
  if (data.secondaryConflicts.length > 0) {
    brief += `## Secondary Conflicts\n\n`;
    data.secondaryConflicts.slice(0, 3).forEach(c => {
      brief += `• ${c.claimA.label} vs ${c.claimB.label}\n`;
    });
    brief += `\n`;
  }
  
  // Weak Floor
  if (data.floor.exists) {
    brief += `## Weak Floor (Outside Conflict)\n\n`;
    data.floor.claims.forEach(c => {
      brief += `• **${c.label}** [${c.supportCount}]\n`;
    });
    brief += `\n`;
  }
  
  // Collapsing Question
  if (data.collapsingQuestion) {
    brief += `## The Question\n\n`;
    brief += `${data.collapsingQuestion}\n`;
  }
  
  return brief;
}

function buildTradeoffBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, ratios } = analysis;
  const data = shape.data as TradeoffShapeData;
  
  if (!data || data.pattern !== 'tradeoff') {
    return buildGenericBrief(analysis);
  }
  
  let brief = '';
  
  // Header
  brief += `## Shape: TRADEOFF (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Explicit tradeoffs exist. No universal best.\n\n`;
  
  // Metrics
  brief += `**Tradeoffs**: ${data.tradeoffs.length}\n`;
  brief += `**Tension**: ${Math.round(ratios.tension * 100)}%\n\n`;
  
  // Each Tradeoff
  data.tradeoffs.forEach((t, idx) => {
    brief += `## Tradeoff ${idx + 1}\n\n`;
    
    brief += `### Option A: ${t.optionA.label}\n`;
    brief += `[${t.optionA.supportCount}/${landscape.modelCount}]\n`;
    brief += `${t.optionA.text}\n\n`;
    
    brief += `### Option B: ${t.optionB.label}\n`;
    brief += `[${t.optionB.supportCount}/${landscape.modelCount}]\n`;
    brief += `${t.optionB.text}\n\n`;
    
    brief += `**Symmetry**: ${t.symmetry.replace('_', ' ')}\n`;
    if (t.governingFactor) {
      brief += `**Governing Factor**: ${t.governingFactor}\n`;
    }
    brief += `\n`;
  });
  
  // Dominated Options
  if (data.dominatedOptions.length > 0) {
    brief += `## Dominated Options\n\n`;
    data.dominatedOptions.forEach(d => {
      brief += `• ${d.dominated} is dominated by ${d.dominatedBy}\n`;
      brief += `  *${d.reason}*\n`;
    });
    brief += `\n`;
  }
  
  // Floor
  if (data.floor.length > 0) {
    brief += `## Agreed Ground (Not In Tradeoff)\n\n`;
    data.floor.forEach(c => {
      brief += `• **${c.label}** [${c.supportCount}]\n`;
    });
    brief += `\n`;
  }
  
  return brief;
}

function buildDimensionalBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, ratios, graph } = analysis;
  const data = shape.data as DimensionalShapeData;
  
  if (!data || data.pattern !== 'dimensional') {
    return buildGenericBrief(analysis);
  }
  
  let brief = '';
  
  // Header
  brief += `## Shape: DIMENSIONAL (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Multiple independent factors determine the answer.\n\n`;
  
  // Metrics
  brief += `**Dimensions**: ${data.dimensions.length}\n`;
  brief += `**Components**: ${graph.componentCount}\n`;
  brief += `**Local Coherence**: ${Math.round(graph.localCoherence * 100)}%\n\n`;
  
  // Each Dimension
  data.dimensions.forEach((dim, idx) => {
    brief += `## ${dim.theme}\n\n`;
    dim.claims.forEach(c => {
      brief += `• **${c.label}** [${c.supportCount}/${landscape.modelCount}]\n`;
      brief += `  ${c.text}\n\n`;
    });
  });
  
  // Interactions
  if (data.interactions.length > 0) {
    brief += `## Dimension Interactions\n\n`;
    data.interactions.forEach(i => {
      const icon = i.relationship === 'conflicting' ? '⚡' : i.relationship === 'overlapping' ? '↔' : '○';
      brief += `${icon} ${i.dimensionA} — ${i.dimensionB}: ${i.relationship}\n`;
    });
    brief += `\n`;
  }
  
  // Governing Conditions
  if (data.governingConditions.length > 0) {
    brief += `## Governing Conditions\n\n`;
    data.governingConditions.forEach(c => {
      brief += `• ${c}\n`;
    });
    brief += `\n`;
  }
  
  // Gaps
  if (data.gaps.length > 0) {
    brief += `## Unexplored Combinations\n\n`;
    data.gaps.forEach(g => {
      brief += `• ${g}\n`;
    });
    brief += `\n`;
  }
  
  return brief;
}

function buildExploratoryBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, ratios, patterns, graph, ghostAnalysis } = analysis;
  const data = shape.data as ExploratoryShapeData;
  
  if (!data || data.pattern !== 'exploratory') {
    return buildGenericBrief(analysis);
  }
  
  let brief = '';
  
  // Header
  brief += `## Shape: EXPLORATORY (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Structure is sparse. Low confidence. Be honest about uncertainty.\n\n`;
  
  // Metrics
  brief += `**Signal Strength**: ${Math.round(data.signalStrength * 100)}%\n`;
  brief += `**Claims**: ${landscape.claimCount} (${patterns.isolatedClaims.length} isolated)\n`;
  brief += `**Fragmentation**: ${Math.round(ratios.fragmentation * 100)}%\n\n`;
  
  // Strongest Signals
  if (data.strongestSignals.length > 0) {
    brief += `## Strongest Signals\n\n`;
    data.strongestSignals.forEach(s => {
      brief += `**${s.label}** [${s.supportCount}/${landscape.modelCount}] — ${s.reason}\n`;
      brief += `${s.text}\n\n`;
    });
  }
  
  // Loose Clusters
  if (data.looseClusters.length > 0) {
    brief += `## Loose Clusters\n\n`;
    data.looseClusters.forEach(c => {
      const labels = c.claims.map(cl => cl.label).join(', ');
      brief += `• **${c.theme}**: ${labels}\n`;
    });
    brief += `\n`;
  }
  
  // Isolated Claims
  if (data.isolatedClaims.length > 0) {
    brief += `## Isolated Claims\n\n`;
    data.isolatedClaims.forEach(c => {
      brief += `○ **${c.label}**\n`;
      brief += `  ${c.text}\n\n`;
    });
  }
  
  // Clarifying Questions
  if (data.clarifyingQuestions.length > 0) {
    brief += `## To Collapse Ambiguity\n\n`;
    data.clarifyingQuestions.forEach(q => {
      brief += `• ${q}\n`;
    });
    brief += `\n`;
  }
  
  // Ghosts
  if (ghostAnalysis.count > 0) {
    brief += `## Gaps\n\n`;
    brief += `${ghostAnalysis.count} unaddressed area(s).\n`;
  }
  
  return brief;
}

function buildContextualBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape } = analysis;
  const data = shape.data as ContextualShapeData;
  
  if (!data || data.pattern !== 'contextual') {
    return buildGenericBrief(analysis);
  }
  
  let brief = '';
  
  // Header
  brief += `## Shape: CONTEXTUAL (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `The answer depends on specific external factors.\n\n`;
  
  // Governing Condition
  brief += `## The Fork\n\n`;
  brief += `**Governing Condition**: ${data.governingCondition}\n\n`;
  
  // Branches
  if (data.branches.length > 0) {
    brief += `## Branches\n\n`;
    data.branches.forEach((branch, idx) => {
      brief += `### ${branch.condition}\n\n`;
      branch.claims.forEach(c => {
        brief += `• **${c.label}** [${c.supportCount}/${landscape.modelCount}]\n`;
        brief += `  ${c.text}\n\n`;
      });
    });
  }
  
  // Default Path
  if (data.defaultPath?.exists) {
    brief += `## Default Path (Highest Support)\n\n`;
    data.defaultPath.claims.forEach(c => {
      brief += `• **${c.label}** [${c.supportCount}]\n`;
    });
    brief += `\n`;
  }
  
  // Missing Context
  if (data.missingContext.length > 0) {
    brief += `## Missing Context\n\n`;
    brief += `To give a specific answer, I need to know:\n\n`;
    data.missingContext.forEach(m => {
      brief += `• ${m}\n`;
    });
    brief += `\n`;
  }
  
  return brief;
}

// Generic fallback
function buildGenericBrief(analysis: StructuralAnalysis): string {
  const { shape, claimsWithLeverage: claims, landscape, ratios, patterns, graph, ghostAnalysis } = analysis;
  
  let brief = '';
  
  brief += `## Shape: ${shape.primaryPattern.toUpperCase()} (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `${shape.implications.understand}\n\n`;
  
  // Metrics
  brief += `## Metrics\n\n`;
  brief += `• Claims: ${landscape.claimCount} from ${landscape.modelCount} sources\n`;
  brief += `• Concentration: ${Math.round(ratios.concentration * 100)}%\n`;
  brief += `• Tension: ${Math.round(ratios.tension * 100)}%\n\n`;
  
  // Floor
  const floor = claims.filter(c => c.isHighSupport);
  if (floor.length > 0) {
    brief += `## Floor (${floor.length})\n\n`;
    floor.forEach(c => {
      brief += `**${c.label}** [${c.supporters.length}/${landscape.modelCount}]\n`;
      brief += `${c.text}\n\n`;
    });
  }
  
  // Low support
  const lowSupport = claims.filter(c => !c.isHighSupport);
  if (lowSupport.length > 0) {
    brief += `## Other Claims (${lowSupport.length})\n\n`;
    lowSupport.slice(0, 5).forEach(c => {
      const icon = c.role === 'challenger' ? '⚡' : '○';
      brief += `${icon} **${c.label}** [${c.supporters.length}]\n`;
    });
    if (lowSupport.length > 5) {
      brief += `... and ${lowSupport.length - 5} more\n`;
    }
    brief += `\n`;
  }
  
  // Ghosts
  if (ghostAnalysis.count > 0) {
    brief += `## Gaps\n\n`;
    brief += `${ghostAnalysis.count} unaddressed area(s).\n`;
  }
  
  return brief;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════

function buildStructuralBrief(analysis: StructuralAnalysis): string {
  const { shape } = analysis;
  
  // If no shape data, use generic
  if (!shape.data) {
    return buildGenericBrief(analysis);
  }
  
  switch (shape.primaryPattern) {
    case 'settled':
      return buildSettledBrief(analysis);
    case 'linear':
      return buildLinearBrief(analysis);
    case 'keystone':
      return buildKeystoneBrief(analysis);
    case 'contested':
      return buildContestedBrief(analysis);
    case 'tradeoff':
      return buildTradeoffBrief(analysis);
    case 'dimensional':
      return buildDimensionalBrief(analysis);
    case 'contextual':
      return buildContextualBrief(analysis);
    case 'exploratory':
    default:
      return buildExploratoryBrief(analysis);
  }
}
```

---

## Part 5: Update Imports in PromptService_v2.ts

```typescript
import {
  ProblemStructure,
  StructuralAnalysis,
  SettledShapeData,
  LinearShapeData,
  KeystoneShapeData,
  ContestedShapeData,
  TradeoffShapeData,
  DimensionalShapeData,
  ExploratoryShapeData,
  ContextualShapeData,
} from "../../shared/contract";
```

---

## Summary

You now have:

1. **Type definitions** for all 8 shape data structures
2. **Shape data builders** for all 8 patterns in PromptMethods.ts
3. **Shape-specific brief builders** for all 8 patterns in PromptService_v2.ts
4. **Dispatcher** that routes to the correct brief builder based on shape

Each brief is tailored to what the Concierge needs for that specific shape:
- **SETTLED**: Floor + challengers + blind spots
- **LINEAR**: Chain steps + weak links + cascade risks
- **KEYSTONE**: Central claim + dependencies + fragility
- **CONTESTED**: Central conflict with full texts + axis + stakes
- **TRADEOFF**: Options + gains/losses + dominated options
- **DIMENSIONAL**: Clusters + interactions + governing conditions
- **CONTEXTUAL**: Branches + governing condition + missing context
- **EXPLORATORY**: Strongest signals + clarifying questions

Want me to generate the test cases or show you how this would render for your example map?