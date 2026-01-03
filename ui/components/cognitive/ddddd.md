## Overview

We are implementing a backend structural analysis layer that sits between the Mapper output and the downstream mode prompts (Understand, Gauntlet, Refiner, Antagonist). This layer computes derived insights from the Mapper's claims and edges, then generates mode-specific framing to inject into prompts.

The core principle: The Mapper catalogs. The backend analyzes. The modes receive computed insights.

We are NOT modifying the Mapper prompt or schema. We are NOT adding new fields to claims. We are computing everything from existing data.

---

## Architecture
MapperArtifact (existing)
↓
computeStructuralAnalysis() ← NEW
↓
StructuralAnalysis object ← NEW
↓
generateModeContext() ← NEW
↓
Mode Prompts (Understand, Gauntlet, etc.)

text


---

## Part 1: Type Definitions

Create a new file: `src/core/structural-analysis.ts`

### StructuralAnalysis Interface

```typescript
interface StructuralAnalysis {
  // Landscape-level classification
  landscape: {
    dominantType: 'factual' | 'prescriptive' | 'conditional' | 'contested' | 'speculative';
    typeDistribution: Record<string, number>;
    dominantRole: 'anchor' | 'branch' | 'challenger' | 'supplement';
    roleDistribution: Record<string, number>;
    claimCount: number;
    modelCount: number;
    convergenceRatio: number;  // claims with ≥2 supporters / total
  };

  // Claim-level computed properties
  claimsWithLeverage: ClaimWithLeverage[];

  // Structural patterns detected
  patterns: {
    leverageInversions: LeverageInversion[];
    cascadeRisks: CascadeRisk[];
    conflicts: ConflictPair[];
    tradeoffs: TradeoffPair[];
    convergencePoints: ConvergencePoint[];
    isolatedClaims: string[];  // claim IDs with no edges
  };

  // Ghost analysis
  ghostAnalysis: {
    count: number;
    mayExtendChallenger: boolean;
    challengerIds: string[];
  };
}

interface ClaimWithLeverage {
  id: string;
  label: string;
  supporters: number[];
  type: string;
  role: string;
  leverage: number;
  leverageFactors: {
    supportWeight: number;
    roleWeight: number;
    connectivityWeight: number;
    positionWeight: number;
  };
  isLeverageInversion: boolean;
}

interface LeverageInversion {
  claimId: string;
  claimLabel: string;
  supporterCount: number;
  reason: 'challenger_prerequisite_to_consensus' | 'singular_foundation' | 'high_connectivity_low_support';
  affectedClaims: string[];  // claim IDs that depend on or are affected by this
}

interface CascadeRisk {
  sourceId: string;
  sourceLabel: string;
  dependentIds: string[];
  dependentLabels: string[];
  depth: number;  // how many levels of cascade
}

interface ConflictPair {
  claimA: { id: string; label: string; supporterCount: number };
  claimB: { id: string; label: string; supporterCount: number };
  isBothConsensus: boolean;
}

interface TradeoffPair {
  claimA: { id: string; label: string; supporterCount: number };
  claimB: { id: string; label: string; supporterCount: number };
  symmetry: 'both_consensus' | 'both_singular' | 'asymmetric';
}

interface ConvergencePoint {
  targetId: string;
  targetLabel: string;
  sourceIds: string[];
  sourceLabels: string[];
  edgeType: 'prerequisite' | 'supports';
}
Part 2: Compute Functions
Main Analysis Function
TypeScript

function computeStructuralAnalysis(artifact: MapperArtifact): StructuralAnalysis {
  const claims = artifact.claims || [];
  const edges = artifact.edges || [];
  const ghosts = artifact.ghosts || [];

  // Step 1: Compute landscape metrics
  const landscape = computeLandscapeMetrics(claims);

  // Step 2: Compute leverage for each claim
  const claimsWithLeverage = claims.map(c => computeClaimLeverage(c, edges, claims));

  // Step 3: Detect patterns
  const patterns = detectAllPatterns(claimsWithLeverage, edges);

  // Step 4: Analyze ghosts
  const ghostAnalysis = analyzeGhosts(ghosts, claimsWithLeverage);

  return {
    landscape,
    claimsWithLeverage,
    patterns,
    ghostAnalysis
  };
}
Landscape Metrics
TypeScript

function computeLandscapeMetrics(claims: Claim[]): StructuralAnalysis['landscape'] {
  const typeDistribution: Record<string, number> = {};
  const roleDistribution: Record<string, number> = {};
  
  claims.forEach(c => {
    typeDistribution[c.type] = (typeDistribution[c.type] || 0) + 1;
    roleDistribution[c.role] = (roleDistribution[c.role] || 0) + 1;
  });

  const dominantType = Object.entries(typeDistribution)
    .sort((a, b) => b[1] - a[1])[0]?.[0] as any || 'prescriptive';

  const dominantRole = Object.entries(roleDistribution)
    .sort((a, b) => b[1] - a[1])[0]?.[0] as any || 'anchor';

  const consensusClaims = claims.filter(c => c.supporters.length >= 2);
  const modelCount = Math.max(...claims.flatMap(c => c.supporters), 0);

  return {
    dominantType,
    typeDistribution,
    dominantRole,
    roleDistribution,
    claimCount: claims.length,
    modelCount,
    convergenceRatio: claims.length > 0 ? consensusClaims.length / claims.length : 0
  };
}
Claim Leverage
TypeScript

function computeClaimLeverage(
  claim: Claim,
  edges: Edge[],
  allClaims: Claim[]
): ClaimWithLeverage {
  const modelCount = Math.max(...allClaims.flatMap(c => c.supporters), 1);

  // Support weight: normalized by model count
  const supportWeight = (claim.supporters.length / modelCount) * 2;

  // Role weight: challengers and anchors matter more
  const roleWeights: Record<string, number> = {
    'challenger': 4,
    'anchor': 2,
    'branch': 1,
    'supplement': 0.5
  };
  const roleWeight = roleWeights[claim.role] || 1;

  // Connectivity weight: count edges involving this claim
  const outgoing = edges.filter(e => e.from === claim.id);
  const incoming = edges.filter(e => e.to === claim.id);
  
  // Prerequisite edges are more important
  const prereqOut = outgoing.filter(e => e.type === 'prerequisite').length * 2;
  const prereqIn = incoming.filter(e => e.type === 'prerequisite').length;
  const conflictEdges = edges.filter(e => 
    e.type === 'conflicts' && (e.from === claim.id || e.to === claim.id)
  ).length * 1.5;
  
  const connectivityWeight = prereqOut + prereqIn + conflictEdges + 
    (outgoing.length + incoming.length) * 0.25;

  // Position weight: pure sources (no incoming prereqs, has outgoing prereqs) are foundational
  const hasIncomingPrereq = incoming.some(e => e.type === 'prerequisite');
  const hasOutgoingPrereq = outgoing.some(e => e.type === 'prerequisite');
  const positionWeight = (!hasIncomingPrereq && hasOutgoingPrereq) ? 2 : 0;

  const leverage = supportWeight + roleWeight + connectivityWeight + positionWeight;

  // Leverage inversion: low support but high structural importance
  const isLeverageInversion = claim.supporters.length < 2 && leverage > 4;

  return {
    id: claim.id,
    label: claim.label,
    supporters: claim.supporters,
    type: claim.type,
    role: claim.role,
    leverage,
    leverageFactors: {
      supportWeight,
      roleWeight,
      connectivityWeight,
      positionWeight
    },
    isLeverageInversion
  };
}
Pattern Detection
TypeScript

function detectAllPatterns(
  claimsWithLeverage: ClaimWithLeverage[],
  edges: Edge[]
): StructuralAnalysis['patterns'] {
  const claimMap = new Map(claimsWithLeverage.map(c => [c.id, c]));

  return {
    leverageInversions: detectLeverageInversions(claimsWithLeverage, edges, claimMap),
    cascadeRisks: detectCascadeRisks(edges, claimMap),
    conflicts: detectConflicts(edges, claimMap),
    tradeoffs: detectTradeoffs(edges, claimMap),
    convergencePoints: detectConvergencePoints(edges, claimMap),
    isolatedClaims: detectIsolatedClaims(claimsWithLeverage, edges)
  };
}
Individual Pattern Detectors
TypeScript

function detectLeverageInversions(
  claims: ClaimWithLeverage[],
  edges: Edge[],
  claimMap: Map<string, ClaimWithLeverage>
): LeverageInversion[] {
  const inversions: LeverageInversion[] = [];
  const prerequisites = edges.filter(e => e.type === 'prerequisite');

  for (const claim of claims) {
    if (!claim.isLeverageInversion) continue;

    // Check if this claim is prerequisite to consensus claims
    const prereqTo = prerequisites.filter(e => e.from === claim.id);
    const consensusTargets = prereqTo
      .map(e => claimMap.get(e.to))
      .filter(c => c && c.supporters.length >= 2);

    if (claim.role === 'challenger' && consensusTargets.length > 0) {
      inversions.push({
        claimId: claim.id,
        claimLabel: claim.label,
        supporterCount: claim.supporters.length,
        reason: 'challenger_prerequisite_to_consensus',
        affectedClaims: consensusTargets.map(c => c!.id)
      });
    } else if (prereqTo.length > 0) {
      inversions.push({
        claimId: claim.id,
        claimLabel: claim.label,
        supporterCount: claim.supporters.length,
        reason: 'singular_foundation',
        affectedClaims: prereqTo.map(e => e.to)
      });
    } else if (claim.leverageFactors.connectivityWeight > 2) {
      inversions.push({
        claimId: claim.id,
        claimLabel: claim.label,
        supporterCount: claim.supporters.length,
        reason: 'high_connectivity_low_support',
        affectedClaims: []
      });
    }
  }

  return inversions;
}

function detectCascadeRisks(
  edges: Edge[],
  claimMap: Map<string, ClaimWithLeverage>
): CascadeRisk[] {
  const risks: CascadeRisk[] = [];
  const prerequisites = edges.filter(e => e.type === 'prerequisite');

  // Group by source
  const bySource = new Map<string, string[]>();
  prerequisites.forEach(e => {
    const existing = bySource.get(e.from) || [];
    bySource.set(e.from, [...existing, e.to]);
  });

  for (const [sourceId, directDependents] of bySource) {
    if (directDependents.length === 0) continue;

    // Compute full cascade (recursive dependents)
    const allDependents = new Set<string>();
    const queue = [...directDependents];
    
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (allDependents.has(current)) continue;
      allDependents.add(current);
      
      const nextLevel = bySource.get(current) || [];
      queue.push(...nextLevel);
    }

    const source = claimMap.get(sourceId);
    const dependentClaims = Array.from(allDependents)
      .map(id => claimMap.get(id))
      .filter(Boolean);

    if (allDependents.size >= 1) {
      risks.push({
        sourceId,
        sourceLabel: source?.label || sourceId,
        dependentIds: Array.from(allDependents),
        dependentLabels: dependentClaims.map(c => c!.label),
        depth: computeCascadeDepth(sourceId, prerequisites)
      });
    }
  }

  return risks;
}

function detectConflicts(
  edges: Edge[],
  claimMap: Map<string, ClaimWithLeverage>
): ConflictPair[] {
  return edges
    .filter(e => e.type === 'conflicts')
    .map(e => {
      const a = claimMap.get(e.from);
      const b = claimMap.get(e.to);
      if (!a || !b) return null;

      return {
        claimA: { id: a.id, label: a.label, supporterCount: a.supporters.length },
        claimB: { id: b.id, label: b.label, supporterCount: b.supporters.length },
        isBothConsensus: a.supporters.length >= 2 && b.supporters.length >= 2
      };
    })
    .filter(Boolean) as ConflictPair[];
}

function detectTradeoffs(
  edges: Edge[],
  claimMap: Map<string, ClaimWithLeverage>
): TradeoffPair[] {
  return edges
    .filter(e => e.type === 'tradeoff')
    .map(e => {
      const a = claimMap.get(e.from);
      const b = claimMap.get(e.to);
      if (!a || !b) return null;

      const aConsensus = a.supporters.length >= 2;
      const bConsensus = b.supporters.length >= 2;

      let symmetry: TradeoffPair['symmetry'];
      if (aConsensus && bConsensus) symmetry = 'both_consensus';
      else if (!aConsensus && !bConsensus) symmetry = 'both_singular';
      else symmetry = 'asymmetric';

      return {
        claimA: { id: a.id, label: a.label, supporterCount: a.supporters.length },
        claimB: { id: b.id, label: b.label, supporterCount: b.supporters.length },
        symmetry
      };
    })
    .filter(Boolean) as TradeoffPair[];
}

function detectConvergencePoints(
  edges: Edge[],
  claimMap: Map<string, ClaimWithLeverage>
): ConvergencePoint[] {
  const points: ConvergencePoint[] = [];
  const relevantEdges = edges.filter(e => e.type === 'prerequisite' || e.type === 'supports');

  // Group by target
  const byTarget = new Map<string, { sources: string[]; type: string }>();
  relevantEdges.forEach(e => {
    const existing = byTarget.get(e.to);
    if (existing) {
      existing.sources.push(e.from);
    } else {
      byTarget.set(e.to, { sources: [e.from], type: e.type });
    }
  });

  for (const [targetId, { sources, type }] of byTarget) {
    if (sources.length >= 2) {
      const target = claimMap.get(targetId);
      const sourceClaims = sources.map(s => claimMap.get(s)).filter(Boolean);

      points.push({
        targetId,
        targetLabel: target?.label || targetId,
        sourceIds: sources,
        sourceLabels: sourceClaims.map(c => c!.label),
        edgeType: type as 'prerequisite' | 'supports'
      });
    }
  }

  return points;
}

function detectIsolatedClaims(
  claims: ClaimWithLeverage[],
  edges: Edge[]
): string[] {
  const connectedIds = new Set<string>();
  edges.forEach(e => {
    connectedIds.add(e.from);
    connectedIds.add(e.to);
  });

  return claims
    .filter(c => !connectedIds.has(c.id))
    .map(c => c.id);
}

function computeCascadeDepth(sourceId: string, prerequisites: Edge[]): number {
  const visited = new Set<string>();
  let maxDepth = 0;

  function dfs(id: string, depth: number) {
    if (visited.has(id)) return;
    visited.add(id);
    maxDepth = Math.max(maxDepth, depth);

    const next = prerequisites.filter(e => e.from === id);
    next.forEach(e => dfs(e.to, depth + 1));
  }

  dfs(sourceId, 0);
  return maxDepth;
}

function analyzeGhosts(
  ghosts: string[],
  claims: ClaimWithLeverage[]
): StructuralAnalysis['ghostAnalysis'] {
  const challengers = claims.filter(c => c.role === 'challenger');

  return {
    count: ghosts.length,
    mayExtendChallenger: ghosts.length > 0 && challengers.length > 0,
    challengerIds: challengers.map(c => c.id)
  };
}
Part 3: Context Generation for Modes
Type-Specific Framing
TypeScript

interface TypeFraming {
  understand: string;
  gauntlet: string;
}

const TYPE_FRAMINGS: Record<string, TypeFraming> = {
  'factual': {
    understand: 'Factual landscape. Consensus reflects common knowledge. Value lies in specific, verifiable claims that others assumed without stating.',
    gauntlet: 'Factual landscape. Test specificity and verifiability. Vague claims fail regardless of support count. Popular does not mean true.'
  },
  'prescriptive': {
    understand: 'Prescriptive landscape. Consensus reflects conventional wisdom the user likely knows. Value lies in claims with clear conditions and boundaries.',
    gauntlet: 'Prescriptive landscape. Test actionability and conditional coverage. Advice without context is noise. Claims must specify when they apply.'
  },
  'conditional': {
    understand: 'Conditional landscape. Claims branch on context. The key insight is often the governing condition that structures the branches.',
    gauntlet: 'Conditional landscape. Both branches may survive if they cover non-overlapping conditions. Eliminate claims with vague or unfalsifiable conditions.'
  },
  'contested': {
    understand: 'Contested landscape. Disagreement is the signal. The key insight is often the dimension on which claims disagree—that reveals the real question.',
    gauntlet: 'Contested landscape. Conflict forces choice. Apply supremacy test: which claim passes where the other fails? Or find conditions that differentiate them.'
  },
  'speculative': {
    understand: 'Speculative landscape. Agreement is weak signal for predictions. Value lies in claims with grounded mechanisms, not confident predictions.',
    gauntlet: 'Speculative landscape. Test mechanism and grounding. Predictions without causal explanation are eliminated. Future claims must explain how.'
  }
};

function getTypeFraming(dominantType: string, mode: 'understand' | 'gauntlet'): string {
  const framing = TYPE_FRAMINGS[dominantType] || TYPE_FRAMINGS['prescriptive'];
  return framing[mode];
}
Structural Observations Generator
TypeScript

interface ModeContext {
  typeFraming: string;
  structuralObservations: string[];
  leverageNotes: string | null;
  cascadeWarnings: string | null;
  conflictNotes: string | null;
  tradeoffNotes: string | null;
  ghostNotes: string | null;
}

function generateModeContext(
  analysis: StructuralAnalysis,
  mode: 'understand' | 'gauntlet'
): ModeContext {
  const { landscape, patterns, ghostAnalysis } = analysis;

  // Type framing
  const typeFraming = getTypeFraming(landscape.dominantType, mode);

  // Structural observations (factual, not advisory)
  const structuralObservations: string[] = [];

  // Leverage inversions
  for (const inv of patterns.leverageInversions) {
    if (inv.reason === 'challenger_prerequisite_to_consensus') {
      structuralObservations.push(
        `${inv.claimLabel} (${inv.supporterCount} supporter, challenger) is prerequisite to ${inv.affectedClaims.length} consensus claim(s).`
      );
    } else if (inv.reason === 'singular_foundation') {
      structuralObservations.push(
        `${inv.claimLabel} (${inv.supporterCount} supporter) enables ${inv.affectedClaims.length} downstream claim(s).`
      );
    }
  }

  // Cascade risks
  for (const risk of patterns.cascadeRisks) {
    if (risk.dependentIds.length >= 2) {
      structuralObservations.push(
        `${risk.sourceLabel} is prerequisite to ${risk.dependentIds.length} claims (cascade depth: ${risk.depth}).`
      );
    }
  }

  // Conflicts
  for (const conflict of patterns.conflicts) {
    const qualifier = conflict.isBothConsensus ? ' (both consensus)' : '';
    structuralObservations.push(
      `${conflict.claimA.label} conflicts with ${conflict.claimB.label}${qualifier}.`
    );
  }

  // Tradeoffs
  for (const tradeoff of patterns.tradeoffs) {
    structuralObservations.push(
      `${tradeoff.claimA.label} ↔ ${tradeoff.claimB.label} (tradeoff, ${tradeoff.symmetry.replace('_', ' ')}).`
    );
  }

  // Convergence points
  for (const conv of patterns.convergencePoints) {
    if (conv.edgeType === 'prerequisite') {
      structuralObservations.push(
        `${conv.targetLabel} requires all of: ${conv.sourceLabels.join(', ')}.`
      );
    }
  }

  // Mode-specific notes
  let leverageNotes: string | null = null;
  let cascadeWarnings: string | null = null;
  let conflictNotes: string | null = null;
  let tradeoffNotes: string | null = null;
  let ghostNotes: string | null = null;

  if (mode === 'understand') {
    // Leverage notes for The One
    if (patterns.leverageInversions.length > 0) {
      const candidates = patterns.leverageInversions.map(i => i.claimLabel);
      leverageNotes = `High-leverage claims with low support: ${candidates.join(', ')}. These may contain overlooked insights.`;
    }

    // Ghost notes for The Echo
    if (ghostAnalysis.mayExtendChallenger) {
      ghostNotes = `${ghostAnalysis.count} ghost(s) detected. May represent territory challengers were pointing toward.`;
    }
  }

  if (mode === 'gauntlet') {
    // Cascade warnings
    if (patterns.cascadeRisks.length > 0) {
      const warnings = patterns.cascadeRisks
        .filter(r => r.dependentIds.length >= 1)
        .map(r => `Eliminating ${r.sourceLabel} cascades to: ${r.dependentLabels.join(', ')}.`);
      if (warnings.length > 0) {
        cascadeWarnings = warnings.join('\n');
      }
    }

    // Conflict notes
    if (patterns.conflicts.length > 0) {
      conflictNotes = `${patterns.conflicts.length} conflict(s) require resolution. One claim per conflict must be eliminated or conditions must differentiate them.`;
    }

    // Tradeoff notes
    const asymmetricTradeoffs = patterns.tradeoffs.filter(t => t.symmetry === 'asymmetric');
    if (asymmetricTradeoffs.length > 0) {
      tradeoffNotes = `${asymmetricTradeoffs.length} asymmetric tradeoff(s): singular claims challenging consensus positions. Test if singular survives superiority.`;
    }
  }

  return {
    typeFraming,
    structuralObservations,
    leverageNotes,
    cascadeWarnings,
    conflictNotes,
    tradeoffNotes,
    ghostNotes
  };
}
Prompt Section Builder
TypeScript

function buildStructuralSection(context: ModeContext, mode: 'understand' | 'gauntlet'): string {
  const sections: string[] = [];

  // Type framing
  sections.push(`## Landscape Type\n\n${context.typeFraming}`);

  // Structural observations
  if (context.structuralObservations.length > 0) {
    sections.push(`## Structural Observations\n\n${context.structuralObservations.map(o => `• ${o}`).join('\n')}`);
  }

  if (mode === 'understand') {
    if (context.leverageNotes) {
      sections.push(`## High-Leverage Claims\n\n${context.leverageNotes}`);
    }
    if (context.ghostNotes) {
      sections.push(`## Gaps\n\n${context.ghostNotes}`);
    }
  }

  if (mode === 'gauntlet') {
    if (context.cascadeWarnings) {
      sections.push(`## Cascade Warnings\n\n${context.cascadeWarnings}`);
    }
    if (context.conflictNotes) {
      sections.push(`## Conflicts\n\n${context.conflictNotes}`);
    }
    if (context.tradeoffNotes) {
      sections.push(`## Asymmetric Tradeoffs\n\n${context.tradeoffNotes}`);
    }
  }

  return sections.join('\n\n---\n\n');
}
Part 4: Integration with Prompt Builders
Update buildUnderstandPrompt
In src/core/PromptService.ts, modify the buildUnderstandPrompt method:

TypeScript

buildUnderstandPrompt(
  originalPrompt: string,
  artifact: MapperArtifact,
  narrativeSummary: string,
  userNotes?: string[]
): string {
  // Compute structural analysis
  const analysis = computeStructuralAnalysis(artifact);
  const context = generateModeContext(analysis, 'understand');
  const structuralSection = buildStructuralSection(context, 'understand');

  // Build claims section from artifact
  const claims = artifact.claims || [];
  const consensusClaims = claims.filter(c => c.supporters.length >= 2);
  const singularClaims = claims.filter(c => c.supporters.length < 2);

  const userNotesBlock = userNotes && userNotes.length > 0
    ? `## User Notes\n${userNotes.map(n => `• ${n}`).join('\n')}\n`
    : '';

  return `You are the Singularity—the convergence point where all perspectives collapse into coherence.

---

## The Query
"${originalPrompt}"

${structuralSection}

---

${narrativeSummary}

---

## Claims

### Consensus (≥2 supporters)
${consensusClaims.map(c => `• **[${c.label}|${c.id}]** [${c.supporters.length}] — ${c.type}, ${c.role}`).join('\n') || 'None.'}

### Singular (1 supporter)
${singularClaims.map(c => `• **[${c.label}|${c.id}]** — ${c.type}, ${c.role}${c.role === 'challenger' ? ` (challenges: "${c.challenges}")` : ''}`).join('\n') || 'None.'}

${userNotesBlock}

---

## Your Task: Find the Frame

Find the frame where the strongest insights coexist as facets of a larger truth. Don't average positions. Don't select by support count. Find the perspective that makes the landscape make sense.

---

## The One

The pivot insight that holds your frame together.

---

## The Echo

What your frame cannot accommodate. If your frame is too smooth, you may have hidden a blind spot.

---

## Output

\`\`\`json
{
  "short_answer": "...",
  "long_answer": "...",
  "the_one": { "insight": "...", "source": "claim_id | emergent", "why_this": "..." },
  "the_echo": { "position": "...", "source": "claim_id | ghost | none", "merit": "..." },
  "artifact_id": "understand-${Date.now()}"
}
\`\`\``;
}
Update buildGauntletPrompt
Similarly modify buildGauntletPrompt:

TypeScript

buildGauntletPrompt(
  originalPrompt: string,
  artifact: MapperArtifact,
  narrativeSummary: string,
  userNotes?: string[]
): string {
  // Compute structural analysis
  const analysis = computeStructuralAnalysis(artifact);
  const context = generateModeContext(analysis, 'gauntlet');
  const structuralSection = buildStructuralSection(context, 'gauntlet');

  const claims = artifact.claims || [];
  const consensusClaims = claims.filter(c => c.supporters.length >= 2);
  const singularClaims = claims.filter(c => c.supporters.length < 2);

  const userNotesBlock = userNotes && userNotes.length > 0
    ? `## User Notes\n${userNotes.map(n => `• ${n}`).join('\n')}\n`
    : '';

  return `You are the Gauntlet—the hostile filter where claims come to die or survive.

---

## The Query
"${originalPrompt}"

${structuralSection}

---

## Step Zero: Define the Optimal End

Before testing anything: **What would a successful answer to this query accomplish?**

---

## Consensus (Untested)
${consensusClaims.map(c => `• "${c.text}" [${c.id}] — ${c.supporters.length} supporters, ${c.type}`).join('\n') || 'None.'}

## Singular (Untested)
${singularClaims.map(c => {
  const icon = c.role === 'challenger' ? '⚡' : '○';
  return `${icon} "${c.text}" [${c.id}]${c.role === 'challenger' ? ` — challenges: "${c.challenges}"` : ''}`;
}).join('\n') || 'None.'}

## Ghosts
${artifact.ghosts?.map(g => `• ${g}`).join('\n') || 'None.'}

${userNotesBlock}

---

## Kill Tests

**TEST 1: ACTIONABILITY** — Can someone DO something with this?
**TEST 2: FALSIFIABILITY** — Can this be verified or disproven?
**TEST 3: RELEVANCE** — Does this advance toward the optimal end?
**TEST 4: SUPERIORITY** — Does this BEAT alternatives?

---

## Output

\`\`\`json
{
  "optimal_end": "...",
  "the_answer": { "statement": "...", "reasoning": "...", "next_step": "..." },
  "survivors": { "primary": { "claim_id": "...", "survived_because": "..." }, "supporting": [...] },
  "eliminated": [{ "claim_id": "...", "killed_by": "...", "reason": "..." }],
  "the_void": "...",
  "confidence": { "score": 0.0, "notes": [...] },
  "artifact_id": "gauntlet-${Date.now()}"
}
\`\`\``;
}
Part 5: File Structure
Create or modify these files:

text

src/
  core/
    structural-analysis.ts    ← NEW: All analysis logic
    PromptService.ts          ← MODIFY: Import and use analysis
  shared/
    contract.ts               ← MODIFY: Add StructuralAnalysis types if needed
Part 6: Testing
Create basic tests for the structural analysis:

TypeScript

// src/core/__tests__/structural-analysis.test.ts

describe('computeStructuralAnalysis', () => {
  it('detects leverage inversion when challenger is prerequisite to consensus', () => {
    const artifact = {
      claims: [
        { id: 'c1', label: 'Consensus Claim', supporters: [1, 2], type: 'prescriptive', role: 'anchor', challenges: null },
        { id: 'c2', label: 'Challenger', supporters: [3], type: 'prescriptive', role: 'challenger', challenges: 'Some premise' }
      ],
      edges: [
        { from: 'c2', to: 'c1', type: 'prerequisite' }
      ],
      ghosts: []
    };

    const analysis = computeStructuralAnalysis(artifact);

    expect(analysis.patterns.leverageInversions).toHaveLength(1);
    expect(analysis.patterns.leverageInversions[0].reason).toBe('challenger_prerequisite_to_consensus');
  });

  it('computes correct landscape metrics', () => {
    const artifact = {
      claims: [
        { id: 'c1', supporters: [1, 2], type: 'prescriptive', role: 'anchor' },
        { id: 'c2', supporters: [1, 2], type: 'prescriptive', role: 'branch' },
        { id: 'c3', supporters: [3], type: 'speculative', role: 'challenger' }
      ],
      edges: [],
      ghosts: []
    };

    const analysis = computeStructuralAnalysis(artifact);

    expect(analysis.landscape.dominantType).toBe('prescriptive');
    expect(analysis.landscape.convergenceRatio).toBeCloseTo(0.67, 1);
  });
});
Summary
This implementation:

Does not modify the Mapper — keeps existing schema and prompt
Computes everything in backend — all analysis is derived from claims + edges
Generates neutral observations — factual statements about structure, not advisory
Provides type-specific framing — different guidance based on dominant claim type
Is testable — pure functions with deterministic output
Is tunable — weights and thresholds can be adjusted based on empirical results
The mode prompts receive computed structural context that primes them to reason appropriately without being told what to conclude.