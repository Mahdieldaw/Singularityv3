V3.1 Processing Layer: Structure & Implementation Plan
Part 1: The Processing Layer Architecture
text

MapperArtifact (claims, edges, ghosts)
         │
         ▼
┌─────────────────────────────────────┐
│  STAGE 1: Claim Enrichment          │
│  Add computed metadata per claim    │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  STAGE 2: Graph Analysis            │
│  Components, chains, hub detection  │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  STAGE 3: Ratio Computation         │
│  5 core ratios from structure       │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  STAGE 4: Pattern Scoring           │
│  Weighted combination → pattern     │
└─────────────────┬───────────────────┘
                  │
                  ▼
┌─────────────────────────────────────┐
│  STAGE 5: Structural Insights       │
│  Human-readable observations        │
└─────────────────────────────────────┘
Part 2: Type Definitions
TypeScript

// ═══════════════════════════════════════════════════════════
// INPUT: What the Mapper produces
// ═══════════════════════════════════════════════════════════

interface MapperArtifact {
  claims: Claim[];
  edges: Edge[];
  ghosts: string[] | null;
}

interface Claim {
  id: string;
  label: string;
  text: string;
  supporters: number[];
  type: 'factual' | 'prescriptive' | 'speculative';
  challenges: string | null;
}

interface Edge {
  from: string;
  to: string;
  type: 'supports' | 'conflicts' | 'tradeoff' | 'prerequisite';
}

// ═══════════════════════════════════════════════════════════
// STAGE 1: Enriched claims with computed metadata
// ═══════════════════════════════════════════════════════════

interface EnrichedClaim extends Claim {
  // Support metrics
  supportRatio: number;           // supporters.length / modelCount
  isHighSupport: boolean;         // In top 30% by support
  
  // Structural position
  inDegree: number;               // Edges pointing to this claim
  outDegree: number;              // Edges from this claim
  edgeDegree: number;             // Total edges touching this claim
  
  // Computed flags
  isContested: boolean;           // Has conflict edge
  isConditional: boolean;         // Has incoming prerequisite
  isChallenger: boolean;          // Low support + challenges high-support
  isKeystone: boolean;            // High outDegree relative to graph
  isIsolated: boolean;            // No edges
  
  // Chain position
  chainDepth: number;             // Steps from a root (no incoming prereqs)
  isChainRoot: boolean;           // No incoming prerequisites, has outgoing
  isChainTerminal: boolean;       // Has incoming prerequisites, no outgoing
}

// ═══════════════════════════════════════════════════════════
// STAGE 2: Graph analysis results
// ═══════════════════════════════════════════════════════════

interface GraphAnalysis {
  componentCount: number;         // Number of disconnected subgraphs
  components: string[][];         // Claim IDs per component
  
  longestChain: string[];         // Claim IDs in longest prerequisite chain
  chainCount: number;             // Number of distinct chains
  
  hubClaim: string | null;        // Claim with highest outDegree (if dominant)
  hubDominance: number;           // hubOutDegree / secondHighestOutDegree
}

// ═══════════════════════════════════════════════════════════
// STAGE 3: The five core ratios
// ═══════════════════════════════════════════════════════════

interface CoreRatios {
  concentration: number;          // Max support / modelCount
  alignment: number;              // Reinforcing edges between top claims / total
  tension: number;                // Conflict + tradeoff edges / total edges
  fragmentation: number;          // (components - 1) / (claims - 1)
  depth: number;                  // Longest chain length / claim count
}

// ═══════════════════════════════════════════════════════════
// STAGE 4: Pattern detection
// ═══════════════════════════════════════════════════════════

type PatternType = 
  | 'settled'      // High agreement, aligned, low tension
  | 'contested'    // High tension among high-support claims
  | 'linear'       // Strong prerequisite chains
  | 'keystone'     // One claim dominates connectivity
  | 'tradeoff'     // Tradeoff edges dominate tension
  | 'dimensional'  // Multiple parallel structures
  | 'exploratory'; // Fragmented, no clear structure

interface PatternScore {
  pattern: PatternType;
  score: number;                  // 0.0 to 1.0
}

interface PatternDetection {
  primary: PatternType;
  confidence: number;             // Score gap from second-place
  scores: PatternScore[];         // All patterns ranked
  evidence: string[];             // Human-readable reasons
}

// ═══════════════════════════════════════════════════════════
// STAGE 5: Structural insights
// ═══════════════════════════════════════════════════════════

interface StructuralInsight {
  type: 'keystone' | 'fragile_foundation' | 'consensus_conflict' | 
        'cascade_risk' | 'orphan' | 'challenger_threat';
  claimId: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
}

// ═══════════════════════════════════════════════════════════
// FINAL OUTPUT
// ═══════════════════════════════════════════════════════════

interface StructuralAnalysis {
  // Enriched data
  claims: EnrichedClaim[];
  edges: Edge[];
  ghosts: string[] | null;
  
  // Graph structure
  graph: GraphAnalysis;
  
  // Core metrics
  ratios: CoreRatios;
  
  // Pattern
  pattern: PatternDetection;
  
  // Observations
  insights: StructuralInsight[];
  
  // Metadata
  modelCount: number;
  claimCount: number;
  edgeCount: number;
}
Part 3: Stage Implementations
Stage 1: Claim Enrichment
TypeScript

function enrichClaims(
  claims: Claim[], 
  edges: Edge[], 
  modelCount: number
): EnrichedClaim[] {
  
  // Pre-compute edge maps
  const incomingEdges = new Map<string, Edge[]>();
  const outgoingEdges = new Map<string, Edge[]>();
  
  claims.forEach(c => {
    incomingEdges.set(c.id, []);
    outgoingEdges.set(c.id, []);
  });
  
  edges.forEach(e => {
    outgoingEdges.get(e.from)?.push(e);
    incomingEdges.get(e.to)?.push(e);
  });
  
  // Determine top 30% threshold
  const sortedBySupport = [...claims].sort(
    (a, b) => b.supporters.length - a.supporters.length
  );
  const topCount = Math.max(1, Math.ceil(claims.length * 0.3));
  const topClaimIds = new Set(sortedBySupport.slice(0, topCount).map(c => c.id));
  const topMinSupport = sortedBySupport[topCount - 1]?.supporters.length ?? 0;
  
  return claims.map(claim => {
    const incoming = incomingEdges.get(claim.id) ?? [];
    const outgoing = outgoingEdges.get(claim.id) ?? [];
    
    const supportRatio = claim.supporters.length / modelCount;
    const isHighSupport = topClaimIds.has(claim.id);
    
    const inDegree = incoming.length;
    const outDegree = outgoing.length;
    const edgeDegree = inDegree + outDegree;
    
    const hasConflict = [...incoming, ...outgoing].some(e => e.type === 'conflicts');
    const hasIncomingPrereq = incoming.some(e => e.type === 'prerequisite');
    const hasOutgoingPrereq = outgoing.some(e => e.type === 'prerequisite');
    
    // Challenger: low support + challenges high-support claim
    const challengesHighSupport = claim.challenges !== null && 
      edges.some(e => 
        e.from === claim.id && 
        topClaimIds.has(e.to) && 
        (e.type === 'conflicts' || e.type === 'prerequisite')
      );
    const isChallenger = supportRatio < 0.3 && challengesHighSupport;
    
    return {
      ...claim,
      supportRatio,
      isHighSupport,
      inDegree,
      outDegree,
      edgeDegree,
      isContested: hasConflict,
      isConditional: hasIncomingPrereq,
      isChallenger,
      isKeystone: false,  // Computed in Stage 2
      isIsolated: edgeDegree === 0,
      chainDepth: 0,      // Computed in Stage 2
      isChainRoot: !hasIncomingPrereq && hasOutgoingPrereq,
      isChainTerminal: hasIncomingPrereq && !hasOutgoingPrereq,
    };
  });
}
Stage 2: Graph Analysis
TypeScript

function analyzeGraph(
  claims: EnrichedClaim[], 
  edges: Edge[]
): GraphAnalysis {
  
  const claimIds = new Set(claims.map(c => c.id));
  
  // ─── Connected Components (undirected) ───
  const adjacency = new Map<string, Set<string>>();
  claims.forEach(c => adjacency.set(c.id, new Set()));
  edges.forEach(e => {
    adjacency.get(e.from)?.add(e.to);
    adjacency.get(e.to)?.add(e.from);
  });
  
  const visited = new Set<string>();
  const components: string[][] = [];
  
  function dfs(id: string, component: string[]) {
    if (visited.has(id)) return;
    visited.add(id);
    component.push(id);
    adjacency.get(id)?.forEach(neighbor => dfs(neighbor, component));
  }
  
  claims.forEach(c => {
    if (!visited.has(c.id)) {
      const component: string[] = [];
      dfs(c.id, component);
      components.push(component);
    }
  });
  
  // ─── Longest Chain (prerequisite edges only) ───
  const prereqEdges = edges.filter(e => e.type === 'prerequisite');
  const prereqChildren = new Map<string, string[]>();
  claims.forEach(c => prereqChildren.set(c.id, []));
  prereqEdges.forEach(e => prereqChildren.get(e.from)?.push(e.to));
  
  let longestChain: string[] = [];
  
  function findChain(id: string, chain: string[]): string[] {
    const newChain = [...chain, id];
    const children = prereqChildren.get(id) ?? [];
    
    if (children.length === 0) return newChain;
    
    let best = newChain;
    children.forEach(child => {
      const candidate = findChain(child, newChain);
      if (candidate.length > best.length) best = candidate;
    });
    return best;
  }
  
  // Start from chain roots
  const roots = claims.filter(c => c.isChainRoot);
  roots.forEach(root => {
    const chain = findChain(root.id, []);
    if (chain.length > longestChain.length) longestChain = chain;
  });
  
  // If no roots, try all claims
  if (longestChain.length === 0) {
    claims.forEach(c => {
      const chain = findChain(c.id, []);
      if (chain.length > longestChain.length) longestChain = chain;
    });
  }
  
  // ─── Hub Detection ───
  const sortedByOutDegree = [...claims].sort((a, b) => b.outDegree - a.outDegree);
  const topOutDegree = sortedByOutDegree[0]?.outDegree ?? 0;
  const secondOutDegree = sortedByOutDegree[1]?.outDegree ?? 0;
  
  const hubDominance = secondOutDegree > 0 
    ? topOutDegree / secondOutDegree 
    : (topOutDegree > 0 ? Infinity : 0);
  
  const hubClaim = hubDominance >= 1.5 && topOutDegree >= 2
    ? sortedByOutDegree[0].id 
    : null;
  
  // Update keystone flag
  if (hubClaim) {
    const hub = claims.find(c => c.id === hubClaim);
    if (hub) hub.isKeystone = true;
  }
  
  // Count chains (roots with at least one outgoing prerequisite)
  const chainCount = roots.filter(r => 
    prereqChildren.get(r.id)?.length ?? 0 > 0
  ).length;
  
  return {
    componentCount: components.length,
    components,
    longestChain,
    chainCount,
    hubClaim,
    hubDominance,
  };
}
Stage 3: Ratio Computation
TypeScript

function computeRatios(
  claims: EnrichedClaim[],
  edges: Edge[],
  graph: GraphAnalysis,
  modelCount: number
): CoreRatios {
  
  const claimCount = claims.length;
  const edgeCount = edges.length;
  
  // ─── Concentration ───
  const maxSupport = Math.max(...claims.map(c => c.supporters.length), 0);
  const concentration = modelCount > 0 ? maxSupport / modelCount : 0;
  
  // ─── Alignment (edges between top claims) ───
  const topClaims = claims.filter(c => c.isHighSupport);
  const topIds = new Set(topClaims.map(c => c.id));
  
  const topEdges = edges.filter(e => topIds.has(e.from) && topIds.has(e.to));
  const reinforcingEdges = topEdges.filter(e => 
    e.type === 'supports' || e.type === 'prerequisite'
  ).length;
  
  const alignment = topEdges.length > 0 
    ? reinforcingEdges / topEdges.length 
    : 0.5;  // Neutral if no edges between top claims
  
  // ─── Tension ───
  const tensionEdges = edges.filter(e => 
    e.type === 'conflicts' || e.type === 'tradeoff'
  ).length;
  
  const tension = edgeCount > 0 ? tensionEdges / edgeCount : 0;
  
  // ─── Fragmentation ───
  const fragmentation = claimCount > 1
    ? (graph.componentCount - 1) / (claimCount - 1)
    : 0;
  
  // ─── Depth ───
  const depth = claimCount > 0 
    ? graph.longestChain.length / claimCount 
    : 0;
  
  return { concentration, alignment, tension, fragmentation, depth };
}
Stage 4: Pattern Scoring
TypeScript

const PATTERN_WEIGHTS = {
  settled: {
    concentration: 0.35,
    alignment: 0.35,
    tensionInverse: 0.20,
    fragmentationInverse: 0.10,
  },
  contested: {
    alignmentInverse: 0.45,
    tension: 0.40,
    concentration: 0.15,
  },
  linear: {
    depth: 0.50,
    fragmentationInverse: 0.30,
    tensionInverse: 0.20,
  },
  keystone: {
    hubDominance: 0.60,
    fragmentationInverse: 0.25,
    concentration: 0.15,
  },
  tradeoff: {
    tradeoffRatio: 0.50,
    tension: 0.30,
    concentrationInverse: 0.20,
  },
  exploratory: {
    fragmentation: 0.40,
    concentrationInverse: 0.35,
    depthInverse: 0.25,
  },
};

function detectPattern(
  ratios: CoreRatios,
  edges: Edge[],
  graph: GraphAnalysis
): PatternDetection {
  
  const { concentration, alignment, tension, fragmentation, depth } = ratios;
  
  // Derived metrics
  const tradeoffEdges = edges.filter(e => e.type === 'tradeoff').length;
  const conflictEdges = edges.filter(e => e.type === 'conflicts').length;
  const tradeoffRatio = (tradeoffEdges + conflictEdges) > 0
    ? tradeoffEdges / (tradeoffEdges + conflictEdges)
    : 0;
  
  const hubScore = graph.hubClaim 
    ? Math.min(1, (graph.hubDominance - 1) / 2)  // Normalize: 1.5 → 0.25, 3.0 → 1.0
    : 0;
  
  // Compute scores
  const scores: PatternScore[] = [
    {
      pattern: 'settled',
      score: 
        concentration * 0.35 +
        alignment * 0.35 +
        (1 - tension) * 0.20 +
        (1 - fragmentation) * 0.10,
    },
    {
      pattern: 'contested',
      score:
        (1 - alignment) * 0.45 +
        tension * 0.40 +
        concentration * 0.15,
    },
    {
      pattern: 'linear',
      score:
        depth * 0.50 +
        (1 - fragmentation) * 0.30 +
        (1 - tension) * 0.20,
    },
    {
      pattern: 'keystone',
      score:
        hubScore * 0.60 +
        (1 - fragmentation) * 0.25 +
        concentration * 0.15,
    },
    {
      pattern: 'tradeoff',
      score:
        tradeoffRatio * 0.50 +
        tension * 0.30 +
        (1 - concentration) * 0.20,
    },
    {
      pattern: 'exploratory',
      score:
        fragmentation * 0.40 +
        (1 - concentration) * 0.35 +
        (1 - depth) * 0.25,
    },
  ];
  
  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);
  
  const primary = scores[0].pattern;
  const confidence = scores[0].score - (scores[1]?.score ?? 0);
  
  // Generate evidence
  const evidence = generateEvidence(primary, ratios, graph, edges);
  
  return { primary, confidence, scores, evidence };
}

function generateEvidence(
  pattern: PatternType,
  ratios: CoreRatios,
  graph: GraphAnalysis,
  edges: Edge[]
): string[] {
  
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const evidence: string[] = [];
  
  switch (pattern) {
    case 'settled':
      evidence.push(`Concentration: ${pct(ratios.concentration)} of models on top claim`);
      evidence.push(`Alignment: ${pct(ratios.alignment)} of top-claim edges are reinforcing`);
      if (ratios.tension < 0.2) evidence.push(`Low tension: ${pct(ratios.tension)}`);
      break;
      
    case 'contested':
      evidence.push(`Tension: ${pct(ratios.tension)} of edges are conflicts or tradeoffs`);
      evidence.push(`Low alignment: ${pct(ratios.alignment)} among top claims`);
      break;
      
    case 'linear':
      evidence.push(`Chain depth: ${graph.longestChain.length} claims in longest chain`);
      evidence.push(`Depth ratio: ${pct(ratios.depth)}`);
      if (graph.chainCount > 0) evidence.push(`${graph.chainCount} prerequisite chain(s)`);
      break;
      
    case 'keystone':
      evidence.push(`Hub claim detected with ${graph.hubDominance.toFixed(1)}x dominance`);
      evidence.push(`Low fragmentation: ${pct(ratios.fragmentation)}`);
      break;
      
    case 'tradeoff':
      const tradeoffCount = edges.filter(e => e.type === 'tradeoff').length;
      evidence.push(`${tradeoffCount} tradeoff edge(s)`);
      evidence.push(`Tension: ${pct(ratios.tension)}`);
      break;
      
    case 'exploratory':
      evidence.push(`Fragmentation: ${pct(ratios.fragmentation)}`);
      evidence.push(`${graph.componentCount} disconnected component(s)`);
      if (ratios.depth < 0.2) evidence.push(`Shallow depth: ${pct(ratios.depth)}`);
      break;
  }
  
  return evidence;
}
Stage 5: Structural Insights
TypeScript

function generateInsights(
  claims: EnrichedClaim[],
  edges: Edge[],
  graph: GraphAnalysis
): StructuralInsight[] {
  
  const insights: StructuralInsight[] = [];
  
  // Keystone
  if (graph.hubClaim) {
    const hub = claims.find(c => c.id === graph.hubClaim);
    if (hub) {
      insights.push({
        type: 'keystone',
        claimId: hub.id,
        description: `"${hub.label}" connects to ${hub.outDegree} other claims. If this fails, the structure may collapse.`,
        severity: 'warning',
      });
    }
  }
  
  // Fragile foundations: low support but high outDegree
  claims
    .filter(c => c.supportRatio < 0.3 && c.outDegree >= 2)
    .forEach(c => {
      insights.push({
        type: 'fragile_foundation',
        claimId: c.id,
        description: `"${c.label}" has only ${c.supporters.length} supporter(s) but ${c.outDegree} claims depend on it.`,
        severity: 'warning',
      });
    });
  
  // Consensus conflicts: both sides are high-support
  const conflictEdges = edges.filter(e => e.type === 'conflicts');
  conflictEdges.forEach(e => {
    const claimA = claims.find(c => c.id === e.from);
    const claimB = claims.find(c => c.id === e.to);
    if (claimA?.isHighSupport && claimB?.isHighSupport) {
      insights.push({
        type: 'consensus_conflict',
        claimId: e.from,
        description: `"${claimA.label}" conflicts with "${claimB.label}"—both have strong support.`,
        severity: 'critical',
      });
    }
  });
  
  // Challenger threats
  claims
    .filter(c => c.isChallenger)
    .forEach(c => {
      insights.push({
        type: 'challenger_threat',
        claimId: c.id,
        description: `"${c.label}" challenges the premise with only ${c.supporters.length} supporter(s). May be noise or key insight.`,
        severity: 'info',
      });
    });
  
  // Orphans
  claims
    .filter(c => c.isIsolated)
    .forEach(c => {
      insights.push({
        type: 'orphan',
        claimId: c.id,
        description: `"${c.label}" has no connections to other claims.`,
        severity: 'info',
      });
    });
  
  // Cascade risks: claims with deep downstream impact
  graph.longestChain.slice(0, 2).forEach(id => {
    const claim = claims.find(c => c.id === id);
    if (claim && graph.longestChain.length >= 3) {
      insights.push({
        type: 'cascade_risk',
        claimId: id,
        description: `Eliminating "${claim.label}" would cascade through ${graph.longestChain.length - 1} downstream claims.`,
        severity: 'warning',
      });
    }
  });
  
  return insights;
}
Main Entry Point
TypeScript

export function computeStructuralAnalysis(
  artifact: MapperArtifact,
  modelCount: number
): StructuralAnalysis {
  
  const { claims: rawClaims, edges, ghosts } = artifact;
  
  // Stage 1: Enrich claims
  const claims = enrichClaims(rawClaims, edges, modelCount);
  
  // Stage 2: Graph analysis
  const graph = analyzeGraph(claims, edges);
  
  // Stage 3: Core ratios
  const ratios = computeRatios(claims, edges, graph, modelCount);
  
  // Stage 4: Pattern detection
  const pattern = detectPattern(ratios, edges, graph);
  
  // Stage 5: Insights
  const insights = generateInsights(claims, edges, graph);
  
  return {
    claims,
    edges,
    ghosts,
    graph,
    ratios,
    pattern,
    insights,
    modelCount,
    claimCount: claims.length,
    edgeCount: edges.length,
  };
}
Part 4: Agent Prompt
text

You are implementing the V3.1 Processing Layer for Singularity.

## Context

Singularity is a cognitive orchestration system. The Mapper LLM produces:
- claims: positions with id, label, text, supporters, type, challenges
- edges: relationships (supports, conflicts, tradeoff, prerequisite)
- ghosts: unaddressed gaps

Your task: implement the pure computation layer that transforms MapperArtifact into StructuralAnalysis.

## Files to Create

1. `src/core/structural-analysis/types.ts`
   - All TypeScript interfaces from Part 2 above
   - Export everything

2. `src/core/structural-analysis/enrich-claims.ts`
   - enrichClaims(claims, edges, modelCount) → EnrichedClaim[]
   - Compute: supportRatio, isHighSupport, degrees, isContested, isConditional, isChallenger, isIsolated, chain positions

3. `src/core/structural-analysis/graph-analysis.ts`
   - analyzeGraph(claims, edges) → GraphAnalysis
   - Compute: connected components, longest chain, hub detection
   - Use DFS for components and chain traversal

4. `src/core/structural-analysis/ratios.ts`
   - computeRatios(claims, edges, graph, modelCount) → CoreRatios
   - The five ratios: concentration, alignment, tension, fragmentation, depth
   - All return values between 0.0 and 1.0

5. `src/core/structural-analysis/pattern-detection.ts`
   - detectPattern(ratios, edges, graph) → PatternDetection
   - Score all 7 patterns using weighted formulas
   - Generate human-readable evidence strings

6. `src/core/structural-analysis/insights.ts`
   - generateInsights(claims, edges, graph) → StructuralInsight[]
   - Detect: keystone, fragile_foundation, consensus_conflict, challenger_threat, orphan, cascade_risk

7. `src/core/structural-analysis/index.ts`
   - computeStructuralAnalysis(artifact, modelCount) → StructuralAnalysis
   - Orchestrates all stages
   - Export as main entry point

## Constraints

- Pure functions only. No side effects, no I/O.
- All thresholds must be ratios, not absolute numbers.
- "Top claims" = top 30% by supporter count, minimum 1.
- "High support" = in top 30%.
- "Low support" = supportRatio < 0.3.
- Pattern weights are constants—document them in comments.

## Tests to Write

For each module, create corresponding test file:

```typescript
// enrich-claims.test.ts
describe('enrichClaims', () => {
  it('computes supportRatio correctly', () => {
    const claims = [{ id: 'c1', supporters: [0, 1, 2] }];
    const result = enrichClaims(claims, [], 6);
    expect(result[0].supportRatio).toBe(0.5);
  });
  
  it('identifies challengers correctly', () => {
    // Low support claim with conflict edge to high support claim
  });
  
  it('handles empty edges gracefully', () => {});
});

// graph-analysis.test.ts
describe('analyzeGraph', () => {
  it('counts connected components correctly', () => {
    // Two disconnected subgraphs
  });
  
  it('finds longest prerequisite chain', () => {
    // c1 → c2 → c3 should return length 3
  });
  
  it('detects hub with dominance', () => {
    // One claim with 5 outgoing, rest have 1
  });
});

// ratios.test.ts
describe('computeRatios', () => {
  it('all ratios are between 0 and 1', () => {});
  
  it('alignment is 0.5 when no edges between top claims', () => {});
  
  it('fragmentation is 0 when all claims connected', () => {});
});

// pattern-detection.test.ts
describe('detectPattern', () => {
  it('detects settled pattern', () => {
    // High concentration, high alignment, low tension
  });
  
  it('detects contested pattern', () => {
    // High tension, low alignment among top claims
  });
  
  it('detects linear pattern', () => {
    // Long prerequisite chain
  });
});
Validation
After implementation, run against these test artifacts:

Settled: 5 claims, all with 4+ supporters, only 'supports' edges
Contested: 5 claims, 2 with 4+ supporters in conflict
Linear: 5 claims forming c1→c2→c3→c4→c5 chain
Keystone: 1 claim with edges to 4 others, no other edges
Exploratory: 5 claims, 0 edges
For each, verify:

Pattern detection returns expected pattern
Confidence > 0.15 (clear winner)
Evidence array is non-empty
All ratios between 0 and 1
Deliverables
All 7 source files
All 5 test files
README.md documenting:
Each ratio's meaning
Pattern weight rationale
Edge cases handled
text


---

## Part 5: Implementation Checklist
□ Create types.ts with all interfaces
□ Implement enrichClaims with all computed flags
□ Implement connected components algorithm
□ Implement longest chain finder
□ Implement hub detection with dominance
□ Implement all 5 ratio calculations
□ Implement 7 pattern scoring formulas
□ Implement evidence generation per pattern
□ Implement 6 insight types
□ Create main orchestrator function
□ Write unit tests for each module
□ Test against 5 canonical artifacts
□ Document weight rationale
□ Remove all hardcoded thresholds
□ Verify all ratios return 0.0-1.0






