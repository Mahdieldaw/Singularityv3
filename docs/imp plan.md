TypeScript
interface MinimalMapperArtifact {
  // All claims as flat list - NO attribution
  claims: Array<{
    text: string;
    dimension?: string;
    applies_when?: string;
    isFrameChallenger?: boolean;  // Flag only, no source
  }>;
  
  // Horizontal enrichment
  dimensions: string[];
  
  // Tensions as unlabeled pairs
  tensions: Array<{
    pair: [string, string];  // Just the claim texts
    axis: string;
  }>;
  
  // What was unaddressed
  ghost: string | null;
  
  // Validation only: count for delta detection
  claimCount: number;
}

Implementation
TypeScript
function buildMinimalMapperArtifact(fullArtifact: MapperArtifact): MinimalMapperArtifact {
  // Flatten all claims without attribution
  const claims = [
    ...fullArtifact.consensus.claims.map(c => ({
      text: c.text,
      dimension: c.dimension,
      applies_when: c.applies_when,
      isFrameChallenger: false
    })),
    ...fullArtifact.outliers.map(o => ({
      text: o.insight,
      dimension: o.dimension,
      applies_when: o.applies_when,
      isFrameChallenger: o.type === 'frame_challenger'
    }))
  ];

  // Tensions as unlabeled pairs
  const tensions = (fullArtifact.tensions || []).map(t => ({
    pair: [t.between[0], t.between[1]] as [string, string],
    axis: t.axis
  }));

  return {
    claims,
    dimensions: fullArtifact.dimensions_found || [],
    tensions,
    ghost: fullArtifact.ghost || null,
    claimCount: claims.length
  };
}
Part 2: Composite Context Bridge
Bridge Schema
TypeScript

interface ContextBridge {
  // Core conclusion from the turn
  conclusion: {
    text: string;
    source: 'understand' | 'decide' | 'refiner' | 'mapper_only';
  };
  
  // Facts that should not be re-argued
  established: string[];
  
  // Open edges for natural follow-up
  openEdges: string[];
  
  // Recommended next action (if any)
  nextStep: string | null;
  
  // The landscape reference
  landscape: MinimalMapperArtifact;
  
  // User curation signal (if artifact was edited)
  userSignal: {
    additions: string[];      // What user added
    priorities: string[];     // What user elevated
    ghostOverride: string | null;
    intensity: 'light' | 'moderate' | 'heavy';
  } | null;
  
  // Metadata
  turnId: string;
  query: string;  // Original query for this turn
}
Implementation: Build Context Bridge (Composite/Hierarchical)
TypeScript

function buildContextBridge(turnState: TurnState): ContextBridge {
  const bridge: ContextBridge = {
    conclusion: { text: '', source: 'mapper_only' },
    established: [],
    openEdges: [],
    nextStep: null,
    landscape: buildMinimalMapperArtifact(turnState.mapper.artifact, turnState.mapper.graphTopology),
    userSignal: null,
    turnId: turnState.turnId,
    query: turnState.query
  };

  // ═══════════════════════════════════════════════════════════════
  // LAYER HIERARCHY: Latest layer supersedes, earlier layers contribute
  // Order: Antagonist > Refiner > Understand/Decide > Mapper
  // ═══════════════════════════════════════════════════════════════

  // Base: Mapper only (fallback if no cognitive layers ran)
  if (!turnState.understand && !turnState.decide && !turnState.refiner && !turnState.antagonist) {
    bridge.conclusion = {
      text: turnState.mapper.narrative?.slice(0, 500) || 'Landscape mapped. No synthesis performed.',
      source: 'mapper_only'
    };
    bridge.openEdges = turnState.mapper.artifact.ghost ? [turnState.mapper.artifact.ghost] : [];
    return addUserSignal(bridge, turnState);
  }

  // Layer 1: Primary Synthesis (Understand or Decide)
  if (turnState.understand) {
    bridge.conclusion = {
      text: turnState.understand.short_answer,
      source: 'understand'
    };
    if (turnState.understand.the_one?.insight) {
      bridge.established.push(`Pivot: ${turnState.understand.the_one.insight}`);
    }
    if (turnState.understand.the_echo?.position) {
      bridge.openEdges.push(`Unresolved edge: ${turnState.understand.the_echo.position}`);
    }
    if (turnState.understand.gaps_addressed?.length > 0) {
      bridge.established.push(`Gaps filled: ${turnState.understand.gaps_addressed.join(', ')}`);
    }
  } else if (turnState.decide) {
    bridge.conclusion = {
      text: turnState.decide.the_answer.statement,
      source: 'decide'
    };
    if (turnState.decide.survivors?.primary) {
      bridge.established.push(`Survivors: ${turnState.decide.survivors.primary}`);
    }
    if (turnState.decide.the_void) {
      bridge.openEdges.push(`Gap (the_void): ${turnState.decide.the_void}`);
    }
    if (turnState.decide.confidence?.notes) {
      bridge.established.push(`Confidence: ${turnState.decide.confidence.score} - ${turnState.decide.confidence.notes}`);
    }
    bridge.nextStep = turnState.decide.the_answer.next_step || null;
  }

  // Layer 2: Refiner (if ran - supersedes conclusion)
  if (turnState.refiner?.final_word) {
    // Refiner supersedes the primary synthesis conclusion
    bridge.conclusion = {
      text: turnState.refiner.final_word,
      source: 'refiner'
    };
    if (turnState.refiner.the_one?.insight) {
      bridge.established.push(`Refiner pivot: ${turnState.refiner.the_one.insight}`);
    }
    if (turnState.refiner.the_echo?.position) {
      bridge.openEdges.push(`Refiner edge: ${turnState.refiner.the_echo.position}`);
    }
    if (turnState.refiner.the_step) {
      bridge.nextStep = turnState.refiner.the_step;
    }
  }

  // Layer 3: Antagonist (if ran - restructures openEdges)
  if (turnState.antagonist) {
    // Antagonist's structured_prompt becomes THE primary open edge
    if (turnState.antagonist.structured_prompt) {
      bridge.openEdges = [turnState.antagonist.structured_prompt];
    }
    // Grounding adds to established facts
    if (turnState.antagonist.grounding && Array.isArray(turnState.antagonist.grounding)) {
      bridge.established.push(...turnState.antagonist.grounding.map((g: string) => `Established: ${g}`));
    }
    // Payoff suggests what answering the prompt unlocks
    if (turnState.antagonist.payoff) {
      bridge.openEdges.push(`Answering unlocks: ${turnState.antagonist.payoff}`);
    }
  }

  return addUserSignal(bridge, turnState);
}

function addUserSignal(bridge: ContextBridge, turnState: TurnState): ContextBridge {
  if (!turnState.artifactEdits) return bridge;

  const edits = turnState.artifactEdits;
  bridge.userSignal = {
    additions: edits.edits.added?.map(a => a.claim.text || a.claim.insight) || [],
    priorities: edits.edits.elevated?.map(e => e.claim.text || e.claim.insight) || [],
    ghostOverride: edits.edits.ghostOverride || null,
    intensity: edits.editIntensity
  };

  return bridge;
}
Part 3: Batch Prompt Injection for Turn N+1
TypeScript

function injectContextBridge(bridge: ContextBridge): string {
  return `
<prior_context turn="${bridge.turnId}">

## Previous Query
"${bridge.query}"

## Conclusion (from ${bridge.source})
${bridge.conclusion.text}

${bridge.established.length > 0 ? `
## Established (do not re-argue)
${bridge.established.map(e => `• ${e}`).join('\n')}
` : ''}

${bridge.openEdges.length > 0 ? `
## Open Edges (natural follow-up territory)
${bridge.openEdges.map(e => `• ${e}`).join('\n')}
` : ''}

${bridge.nextStep ? `
## Recommended Next Step
${bridge.nextStep}
` : ''}

## Landscape Reference
**Topology**: ${bridge.landscape.meta.topology} | **Strength**: ${Math.round(bridge.landscape.meta.strength * 100)}%
**Dimensions covered**: ${bridge.landscape.meta.dimensions.join(', ') || 'general'}
${bridge.landscape.meta.ghost ? `**Unaddressed**: ${bridge.landscape.meta.ghost}` : ''}

**Options considered**:
${bridge.landscape.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}

${bridge.landscape.tensions && bridge.landscape.tensions.length > 0 ? `
**Key tensions**:
${bridge.landscape.tensions.map(t => `• ${t.claims[0]} ↔ ${t.claims[1]} (${t.axis})`).join('\n')}
` : ''}

${bridge.userSignal ? `
## User Priorities (from curation)
${bridge.userSignal.priorities.length > 0 ? `Elevated: ${bridge.userSignal.priorities.join('; ')}` : ''}
${bridge.userSignal.additions.length > 0 ? `Added: ${bridge.userSignal.additions.join('; ')}` : ''}
${bridge.userSignal.ghostOverride ? `User focus: "${bridge.userSignal.ghostOverride}"` : ''}
` : ''}

</prior_context>

Use this context only if relevant to the current query. The user may be continuing this thread or pivoting to something new. Adapt accordingly.

---

<current_query>
`;
}
Part 4: Signal-to-Layer Routing Implementation
Signal Classification
TypeScript

type SignalType = 'correction' | 'addition' | 'elevation' | 'ticked' | 'untouched' | 'removal';

interface ClassifiedClaim {
  claim: ConsensusClaim | Outlier;
  signalType: SignalType;
  commentary?: string;
  userRationale?: string;
}

function classifyClaimsWithSignals(
  originalArtifact: MapperArtifact,
  edits: ArtifactEdit
): ClassifiedClaim[] {
  const classified: ClassifiedClaim[] = [];
  
  // Build lookup sets
  const addedIds = new Set(edits.edits.added?.map(a => a.claim.id || a.claim.text));
  const removedIds = new Set(edits.edits.removed?.map(r => r.claim.id || r.claim.text));
  const modifiedMap = new Map(edits.edits.modified?.map(m => [m.original.id || m.original.text, m]));
  const elevatedIds = new Set(edits.edits.elevated?.map(e => e.claim.id || e.claim.text));
  const tickedIds = new Set(edits.tickedIds || []);

  // Process additions (highest signal for new claims)
  edits.edits.added?.forEach(addition => {
    classified.push({
      claim: addition.claim,
      signalType: 'addition',
      userRationale: addition.userRationale
    });
  });

  // Process modifications (corrections)
  edits.edits.modified?.forEach(mod => {
    classified.push({
      claim: mod.edited,
      signalType: 'correction',
      commentary: `Corrected from: "${mod.original.text || mod.original.insight}"`
    });
  });

  // Process original claims (minus removed/modified)
  const allOriginalClaims = [
    ...originalArtifact.consensus.claims,
    ...originalArtifact.outliers
  ];

  allOriginalClaims.forEach(claim => {
    const claimId = claim.id || claim.text || claim.insight;
    
    // Skip if removed
    if (removedIds.has(claimId)) {
      classified.push({
        claim,
        signalType: 'removal'
      });
      return;
    }
    
    // Skip if modified (already processed above)
    if (modifiedMap.has(claimId)) return;
    
    // Check elevation
    if (elevatedIds.has(claimId)) {
      classified.push({
        claim,
        signalType: 'elevation'
      });
      return;
    }
    
    // Check ticked
    if (tickedIds.has(claimId)) {
      classified.push({
        claim,
        signalType: 'ticked'
      });
      return;
    }
    
    // Default: untouched
    classified.push({
      claim,
      signalType: 'untouched'
    });
  });

  return classified;
}
Layer-Specific Injection Builders
For Understand
TypeScript

function buildUnderstandSignalInjection(classified: ClassifiedClaim[]): string {
  const corrections = classified.filter(c => c.signalType === 'correction');
  const additions = classified.filter(c => c.signalType === 'addition');
  const elevated = classified.filter(c => c.signalType === 'elevation');
  const ticked = classified.filter(c => c.signalType === 'ticked');
  const untouched = classified.filter(c => c.signalType === 'untouched');
  
  // Remove 'removal' - they're filtered out
  
  if (corrections.length === 0 && additions.length === 0 && elevated.length === 0) {
    return ''; // No curation signal
  }

  return `
---

## Human Curation Signal

${corrections.length > 0 ? `
### Corrections (Must Address)
${corrections.map(c => `• **CORRECTED**: "${c.claim.text || c.claim.insight}"
  ${c.commentary ? `  (${c.commentary})` : ''}`).join('\n')}

Your frame MUST incorporate these corrections. They represent ground-truth knowledge.
` : ''}

${additions.length > 0 ? `
### User Additions (Must Include)
${additions.map(a => `• **ADDED**: "${a.claim.text || a.claim.insight}"
  ${a.userRationale ? `  User note: "${a.userRationale}"` : ''}`).join('\n')}

These are dimensions NO model saw. Include in your frame or explicitly explain the exclusion.
` : ''}

${elevated.length > 0 ? `
### Elevated (High Priority)
${elevated.map(e => `• "${e.claim.text || e.claim.insight}"`).join('\n')}

User considers these most relevant. Weight heavily in frame construction.
` : ''}

${ticked.length > 0 ? `
### Endorsed (Ticked)
${ticked.map(t => `• "${t.claim.text || t.claim.insight}"`).join('\n')}
` : ''}

${untouched.length > 0 ? `
### Baseline (Untouched)
${untouched.slice(0, 5).map(u => `• "${u.claim.text || u.claim.insight}"`).join('\n')}
${untouched.length > 5 ? `...and ${untouched.length - 5} more` : ''}
` : ''}

**Tiebreaker Rule**: When two claims serve the frame equally, prefer ticked/elevated over untouched.

---
`;
}
For Decide/Gauntlet
TypeScript

function buildDecideSignalInjection(classified: ClassifiedClaim[]): string {
  const corrections = classified.filter(c => c.signalType === 'correction');
  const additions = classified.filter(c => c.signalType === 'addition');
  const contestants = classified.filter(c => c.signalType !== 'removal');
  
  if (contestants.length === 0) return '';

  return `
---

## Gauntlet Contestants

The following claims enter the Gauntlet. **Inclusion status is for transparency only—it does NOT affect your judgment.**

Every claim faces identical kill tests: Actionability, Falsifiability, Relevance, Superiority.

${corrections.length > 0 ? `
### Corrections (Entered as Contestants)
${corrections.map(c => `• [CORRECTED] "${c.claim.text || c.claim.insight}"`).join('\n')}
These may still fail scrutiny despite user correction.
` : ''}

${additions.length > 0 ? `
### User Additions (Entered as Contestants)
${additions.map(a => `• [ADDED] "${a.claim.text || a.claim.insight}"`).join('\n')}
No preferential treatment. Must pass all kill tests.
` : ''}

### All Contestants
${contestants.map(c => {
  const tag = c.signalType === 'ticked' ? 'TICKED' 
            : c.signalType === 'elevation' ? 'ELEVATED'
            : c.signalType === 'correction' ? 'CORRECTED'
            : c.signalType === 'addition' ? 'ADDED'
            : 'UNTICKED';
  return `• [${tag}] "${c.claim.text || c.claim.insight}"`;
}).join('\n')}

**Gauntlet Principle**: An unticked claim can survive. A ticked claim can die. Only merit determines survival.

---
`;
}
For Refiner
TypeScript

function buildRefinerSignalInjection(
  classified: ClassifiedClaim[], 
  inputType: 'understand' | 'decide'
): string {
  const corrections = classified.filter(c => c.signalType === 'correction');
  const additions = classified.filter(c => c.signalType === 'addition');
  const removed = classified.filter(c => c.signalType === 'removal');

  return `
---

## User Curation Signal (Refiner-Specific)

${corrections.length > 0 ? `
### Corrections (PRIMARY DRIVER)
**These corrections are DEFINITIVE.** The ${inputType === 'understand' ? 'frame' : 'verdict'} incorporated assumptions the user has explicitly overridden.

${corrections.map(c => `• "${c.claim.text || c.claim.insight}"
  ${c.commentary ? `  (${c.commentary})` : ''}`).join('\n')}

${inputType === 'understand' 
  ? `Your task: Rebuild final_word as if this correction was the core insight all along.`
  : `Your task: Challenge the elimination criteria. Would this correction change which claims survive?`}
` : `
### No Corrections
Proceed with standard adversarial analysis.
`}

${additions.length > 0 ? `
### User Additions (Secondary Material)
${additions.map(a => `• "${a.claim.text || a.claim.insight}"`).join('\n')}

${corrections.length === 0 
  ? `No corrections present. These additions may contain the_one for your alternative frame.`
  : `Consider alongside the correction.`}
` : ''}

${removed.length > 0 ? `
### User Removals (Potential Resurrection)
${removed.map(r => `• "${r.claim.text || r.claim.insight}"`).join('\n')}

The user deprioritized these. If you find overlooked value, you MAY resurrect—but flag the disagreement.
` : ''}

**Refiner Logic**:
1. If corrections exist → Rebuild around correction
2. Else if additions exist → Consider additions as the_one candidates  
3. Else → Mine removed items and outliers for overlooked signal

---
`;
}
For Antagonist
TypeScript

function buildAntagonistSignalInjection(
  classified: ClassifiedClaim[],
  inputType: 'understand' | 'decide',
  ghostOverride: string | null
): string {
  const additions = classified.filter(c => c.signalType === 'addition');
  const elevated = classified.filter(c => c.signalType === 'elevation');

  return `
---

## User Curation Signal (Antagonist-Specific)

${ghostOverride ? `
### Ghost Override (PRIMARY TARGET)
The user explicitly specified an unaddressed concern: "${ghostOverride}"

Your structured_prompt should elicit information to address this ghost.
` : ''}

${additions.length > 0 ? `
### User Additions (Dimensions to Explore)
${additions.map(a => `• "${a.claim.text || a.claim.insight}"`).join('\n')}

The user saw dimensions models missed. Target your structured_prompt toward specifying context for these.
` : ''}

${elevated.length > 0 ? `
### User Priorities
${elevated.map(e => `• "${e.claim.text || e.claim.insight}"`).join('\n')}

The user cares most about these. Your grounding should acknowledge them as established.
` : ''}

${inputType === 'decide' ? `
### Decide-Specific Orientation

You receive a VERDICT. Your task is to specify the action:

1. **Action Parameters**: What context would change HOW to execute?
2. **Edge Cases**: When does the verdict NOT apply?
3. **Confidence Calibration**: What would raise or lower confidence?

Your structured_prompt should help the user specify their context so the action becomes precise.
` : `
### Understand-Specific Orientation

You receive a FRAME. Your task is to explore its limits:

1. **Frame Boundaries**: What context would change the frame?
2. **The Echo**: What does the frame not naturally accommodate?
3. **Dimensions Unexplored**: What questions weren't asked?

Your structured_prompt should help the user discover what they haven't yet specified.
`}

---
`;
}
Part 5: Artifact Edit Tracking Schema
TypeScript

interface ArtifactEdit {
  // Identifiers
  sessionId: string;
  turnId: string;
  editedAt: number;
  
  // The artifacts (for diff computation and persistence)
  originalArtifact: MapperArtifact;
  editedArtifact: MapperArtifact;
  
  // Structured diff
  edits: {
    added: Array<{
      claim: ConsensusClaim | Outlier;
      userRationale?: string;
    }>;
    
    removed: Array<{
      claim: ConsensusClaim | Outlier;
      removalType: 'noise' | 'duplicate' | 'incorrect' | 'irrelevant';
    }>;
    
    modified: Array<{
      original: ConsensusClaim | Outlier;
      edited: ConsensusClaim | Outlier;
      changeType: 'text' | 'dimension' | 'supporters' | 'type';
      commentary?: string;
    }>;
    
    elevated: Array<{
      claim: ConsensusClaim | Outlier;
      elevationType: 'starred' | 'pinned' | 'priority';
    }>;
    
    ghostOverride?: string | null;
    topologyOverride?: 'high_confidence' | 'dimensional' | 'contested';
  };
  
  // Ticked items (implicit endorsement)
  tickedIds: string[];
  
  // Statistics
  editIntensity: 'light' | 'moderate' | 'heavy';
}

function computeEditIntensity(edits: ArtifactEdit['edits'], originalCount: number): 'light' | 'moderate' | 'heavy' {
  const changeCount = 
    (edits.added?.length || 0) + 
    (edits.removed?.length || 0) + 
    (edits.modified?.length || 0) * 2; // Modifications count double
  
  const changeRatio = changeCount / Math.max(originalCount, 1);
  
  if (changeRatio < 0.15) return 'light';
  if (changeRatio < 0.40) return 'moderate';
  return 'heavy';
}
Part 6: Complete Type Definitions
TypeScript

// ═══════════════════════════════════════════════════════════════
// MAPPER TYPES
// ═══════════════════════════════════════════════════════════════

interface ConsensusClaim {
  id?: string;
  text: string;
  supporters: number[];
  support_count: number;
  dimension?: string;
  applies_when?: string;
  equifinal_with?: string;
}

interface Outlier {
  id?: string;
  insight: string;
  source: string;
  source_index: number;
  type: 'supplemental' | 'frame_challenger';
  dimension?: string;
  applies_when?: string;
  challenges?: string;
  bifurcates_toward?: string;
}

interface MapperArtifact {
  consensus: {
    claims: ConsensusClaim[];
    quality: 'resolved' | 'conventional' | 'deflected';
    strength: number;
  };
  outliers: Outlier[];
  tensions: Array<{
    between: [string, string];
    type: 'conflicts' | 'tradeoff' | 'bifurcation';
    axis: string;
  }>;
  dimensions_found: string[];
  topology: 'high_confidence' | 'dimensional' | 'contested';
  ghost: string | null;
  query: string;
  model_count: number;
  timestamp: string;
  options_inventory?: Array<{
    label: string;
    summary: string;
    citations: number[];
  }>;
}

interface GraphTopology {
  nodes: Array<{
    id: string;
    label: string;
    theme: string;
    supporters: number[];
    support_count: number;
    source?: 'consensus' | 'outlier';
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: 'conflicts' | 'complements' | 'prerequisite' | 'bifurcation';
    reason: string;
  }>;
}

// ═══════════════════════════════════════════════════════════════
// COGNITIVE LAYER OUTPUT TYPES
// ═══════════════════════════════════════════════════════════════

interface UnderstandOutput {
  short_answer: string;
  long_answer: string;
  the_one: {
    insight: string;
    source: string;
    why_this: string;
  };
  the_echo: {
    position: string;
    source: string;
    merit: string;
  } | null;
  gaps_addressed: string[];
  classification: {
    query_type: string;
    container_type: string;
  };
  artifact_id: string;
}

interface DecideOutput {
  optimal_end: string;
  the_answer: {
    statement: string;
    reasoning: string;
    next_step: string;
  };
  survivors: {
    primary: string;
    supporting: string[];
    conditional: string[];
  };
  eliminated: {
    from_consensus: string[];
    from_outliers: string[];
  };
  the_void: string;
  confidence: {
    score: number;
    notes: string;
  };
  artifact_id: string;
}

interface RefinerOutput {
  final_word: string | null;  // null = synthesis was sufficient
  the_one: {
    insight: string;
    source: string;
    why_overlooked: string;
  } | null;
  the_echo: {
    position: string;
    source: string;
    merit: string;
  } | null;
  the_step: string | null;
}

interface AntagonistOutput {
  structured_prompt: string;
  dimensions: Array<{
    name: string;
    options: string[];
    impact: string;
  }>;
  grounding: string[];
  payoff: string;
  audit: {
    missed_approaches: string[];
    confidence_gaps: string[];
  };
}

// ═══════════════════════════════════════════════════════════════
// TURN STATE (for bridge building)
// ═══════════════════════════════════════════════════════════════

interface TurnState {
  turnId: string;
  sessionId: string;
  query: string;
  
  // Layers (present if ran)
  mapper: {
    artifact: MapperArtifact;
    graphTopology: GraphTopology;
    narrative: string;
    options_inventory: Array<{ label: string; summary: string; citations: number[] }>;
  };
  
  understand?: UnderstandOutput;
  decide?: DecideOutput;
  refiner?: RefinerOutput;
  antagonist?: AntagonistOutput;
  
  // User curation
  artifactEdits?: ArtifactEdit;
}
Summary: Implementation Checklist
Component	File	Status
MinimalMapperArtifact type	types/context.ts	Define
buildMinimalMapperArtifact()	utils/context-bridge.ts	Implement
ContextBridge type	types/context.ts	Define
buildContextBridge()	utils/context-bridge.ts	Implement
injectContextBridge()	services/PromptService.ts	Implement
classifyClaimsWithSignals()	utils/signal-router.ts	Implement
buildUnderstandSignalInjection()	services/PromptService.ts	Implement
buildDecideSignalInjection()	services/PromptService.ts	Implement
buildRefinerSignalInjection()	services/PromptService.ts	Implement
buildAntagonistSignalInjection()	services/PromptService.ts	Implement
ArtifactEdit type	types/artifacts.ts	Define
computeEditIntensity()	utils/artifact-edits.ts	Implement
Persist ArtifactEdit	services/SessionManager.ts	Extend






Part 2: Simplified Signal Types
Collapse Elevated into Ticked
You're right—"elevated" was unnecessary complexity. Simplest model:
TypeScript
type SignalType = 
  | 'correction'   // User modified the claim text
  | 'addition'     // User injected new claim
  | 'ticked'       // User selected/endorsed
  | 'unticked'     // User didn't interact (baseline)
  | 'removal';     // User explicitly deleted
No starring, no pinning, no priority levels. Tick or don't tick.
Part 3: Comments as Single Notepad
Implementation
One shared notepad per artifact, not per-claim:
TypeScript
interface ArtifactEdit {
  sessionId: string;
  turnId: string;
  editedAt: number;
  
  // User's general notes on the artifact
  userNotes: string | null;  // Single notepad
  
  // Structured edits
  edits: {
    added: Array<{ claim: Claim }>;
    removed: Array<{ claimId: string }>;
    modified: Array<{ 
      originalId: string; 
      editedText: string;
    }>;
  };
  
  // Ticked claim IDs
  tickedIds: string[];
  
  // Ghost override
  ghostOverride: string | null;
  
  // Intensity
  editIntensity: 'light' | 'moderate' | 'heavy';
}
If you want click-to-claim attribution later, you can parse the notepad content against claim texts. But the UI is just one text area.
Part 4: Established (Proper Definition)
Where "Established" Actually Comes From
You're right—I was hand-waving. Let's define it precisely:
SourceTypeMeaning
Corrections
Positive
"This is ground truth"
Antagonist grounding[]
Positive
"This round determined these facts"
Removals
Negative
"This was rejected—don't resurrect"
Schema
TypeScript
interface EstablishedFacts {
  // Positive establishments (don't re-argue)
  positive: Array<{
    text: string;
    source: 'correction' | 'grounding';
  }>;
  
  // Negative establishments (don't bring back)
  negative: Array<{
    text: string;
    source: 'removal';
  }>;
}

function extractEstablished(turnState: TurnState): EstablishedFacts {
  const established: EstablishedFacts = {
    positive: [],
    negative: []
  };
  
  // From corrections
  if (turnState.artifactEdits?.edits.modified) {
    turnState.artifactEdits.edits.modified.forEach(m => {
      established.positive.push({
        text: m.editedText,
        source: 'correction'
      });
    });
  }
  
  // From antagonist groundings
  if (turnState.antagonist?.grounding) {
    turnState.antagonist.grounding.forEach(g => {
      established.positive.push({
        text: g,
        source: 'grounding'
      });
    });
  }
  
  // From removals (negative establishment)
  if (turnState.artifactEdits?.edits.removed) {
    // Need to look up claim text from original artifact
    turnState.artifactEdits.edits.removed.forEach(r => {
      const claim = findClaimById(r.claimId, turnState.mapper.artifact);
      if (claim) {
        established.negative.push({
          text: claim.text || claim.insight,
          source: 'removal'
        });
      }
    });
  }
  
  return established;
}
Prompt Injection
JavaScript
${established.positive.length > 0 || established.negative.length > 0 ? `
## Established Facts

${established.positive.length > 0 ? `
**Do not re-argue** (these are settled):
${established.positive.map(e => `• ${e.text}`).join('\n')}
` : ''}

${established.negative.length > 0 ? `
**Do not resurrect** (these were explicitly rejected):
${established.negative.map(e => `• ${e.text}`).join('\n')}
` : ''}
` : ''}


Part 5: Query in Bridge
You're Right—Keep It
Advantages of including query in bridge:

Self-contained: Bridge can be understood without external lookup
History retrieval: Semantic search becomes trivial
Context disambiguation: Turn 2 model can see what Turn 1 was actually asking
Persistence: Stored bridges remain meaningful independently
Schema Update
TypeScript

interface ContextBridge {
  // The original query for this turn
  query: string;  // KEEP
  
  // Established facts (not "conclusion")
  established: EstablishedFacts;
  
  // Open edges for follow-up
  openEdges: string[];
  
  // Recommended next action
  nextStep: string | null;
  
  // The minimal landscape
  landscape: MinimalMapperArtifact;
  
  // Turn metadata
  turnId: string;
}
Part 6: Cascade Logic on Corrections/Removals
The Insight
If user removes Claim A, and the graph shows:

text

A → B (prerequisite)
Then B is now orphaned—its prerequisite was eliminated.

Cascade Effects Schema
TypeScript

interface CascadeEffects {
  // Claims that lost their prerequisites
  orphanedClaims: Array<{
    claimId: string;
    claimText: string;
    lostPrerequisite: string;
    action: 'flag' | 'auto_remove';
  }>;
  
  // Claims that were prerequisites for the removed claim
  // (now potentially less relevant)
  freedClaims: Array<{
    claimId: string;
    claimText: string;
  }>;
  
  // Conflicts that were resolved by removal
  resolvedConflicts: Array<{
    survivingClaim: string;
    eliminatedClaim: string;
  }>;
  
  // Complements that lost their pair
  brokenComplements: Array<{
    orphanedClaim: string;
    lostComplement: string;
  }>;
}
Implementation
TypeScript

function computeCascadeEffects(
  removedClaimIds: string[],
  graphTopology: GraphTopology,
  artifact: MapperArtifact
): CascadeEffects {
  const effects: CascadeEffects = {
    orphanedClaims: [],
    freedClaims: [],
    resolvedConflicts: [],
    brokenComplements: []
  };
  
  const removedNodeIds = new Set<string>();
  
  // Map claim IDs to node IDs
  for (const claimId of removedClaimIds) {
    const node = graphTopology.nodes.find(n => 
      n.label === claimId || n.id === claimId
    );
    if (node) removedNodeIds.add(node.id);
  }
  
  // Process edges
  for (const edge of graphTopology.edges) {
    const sourceRemoved = removedNodeIds.has(edge.source);
    const targetRemoved = removedNodeIds.has(edge.target);
    
    if (edge.type === 'prerequisite') {
      if (sourceRemoved && !targetRemoved) {
        // The removed claim was a prerequisite for the target
        // Target is now ORPHANED
        const targetNode = graphTopology.nodes.find(n => n.id === edge.target);
        const sourceNode = graphTopology.nodes.find(n => n.id === edge.source);
        if (targetNode) {
          effects.orphanedClaims.push({
            claimId: edge.target,
            claimText: targetNode.label,
            lostPrerequisite: sourceNode?.label || edge.source,
            action: 'flag'  // Don't auto-remove, just flag for user
          });
        }
      }
      if (targetRemoved && !sourceRemoved) {
        // The removed claim depended on the source
        // Source is now FREED (may be less relevant)
        const sourceNode = graphTopology.nodes.find(n => n.id === edge.source);
        if (sourceNode) {
          effects.freedClaims.push({
            claimId: edge.source,
            claimText: sourceNode.label
          });
        }
      }
    }
    
    if (edge.type === 'conflicts') {
      if (sourceRemoved && !targetRemoved) {
        // Conflict resolved in favor of target
        const targetNode = graphTopology.nodes.find(n => n.id === edge.target);
        const sourceNode = graphTopology.nodes.find(n => n.id === edge.source);
        if (targetNode && sourceNode) {
          effects.resolvedConflicts.push({
            survivingClaim: targetNode.label,
            eliminatedClaim: sourceNode.label
          });
        }
      }
    }
    
    if (edge.type === 'complements') {
      if ((sourceRemoved && !targetRemoved) || (!sourceRemoved && targetRemoved)) {
        // Complement pair broken
        const orphanId = sourceRemoved ? edge.target : edge.source;
        const lostId = sourceRemoved ? edge.source : edge.target;
        const orphanNode = graphTopology.nodes.find(n => n.id === orphanId);
        const lostNode = graphTopology.nodes.find(n => n.id === lostId);
        if (orphanNode && lostNode) {
          effects.brokenComplements.push({
            orphanedClaim: orphanNode.label,
            lostComplement: lostNode.label
          });
        }
      }
    }
  }
  
  return effects;
}
UI Surfacing
When cascade effects are detected, show the user:

text

⚠️ Cascade Effects Detected

Removing "[DOM-based approach]" affects related claims:

ORPHANED (lost prerequisite):
• "Client-side rendering optimization" — depended on DOM approach
  [Auto-remove?] [Keep anyway]

RESOLVED CONFLICTS:
• "API approach" now has no competing claim
  This conflict is resolved.

BROKEN COMPLEMENTS:
• "Browser caching strategy" — was complementary to DOM approach
  May be less relevant without its pair.
Auto-Apply vs Flag
TypeScript

// Configuration
const cascadeConfig = {
  autoRemoveOrphans: false,    // Flag for user decision
  autoResolveConflicts: true,  // Just informational
  flagBrokenComplements: true  // Show but don't auto-remove
};



Revised Context Bridge (Final)
TypeScript

interface ContextBridge {
  // Original query
  query: string;
  
  // Established facts (from corrections, groundings, removals)
  established: EstablishedFacts;
  
  // Open edges (from the_echo, the_void, structured_prompt)
  openEdges: string[];
  
  // Next step (from refiner.the_step or decide.next_step)
  nextStep: string | null;
  
  // Minimal landscape (no attribution)
  landscape: MinimalMapperArtifact;
  
  // Cascade effects from user edits
  cascadeEffects?: CascadeEffects;
  
  // Metadata
  turnId: string;
}

function buildContextBridge(turnState: TurnState): ContextBridge {
  const bridge: ContextBridge = {
    query: turnState.query,
    established: extractEstablished(turnState),
    openEdges: [],
    nextStep: null,
    landscape: buildMinimalMapperArtifact(turnState.mapper.artifact),
    turnId: turnState.turnId
  };

  // Compute cascade if edits exist
  if (turnState.artifactEdits?.edits.removed?.length > 0) {
    const removedIds = turnState.artifactEdits.edits.removed.map(r => r.claimId);
    bridge.cascadeEffects = computeCascadeEffects(
      removedIds,
      turnState.mapper.graphTopology,
      turnState.mapper.artifact
    );
  }

  // Open edges from cognitive layers
  if (turnState.antagonist?.structured_prompt) {
    bridge.openEdges = [turnState.antagonist.structured_prompt];
  } else {
    if (turnState.understand?.the_echo?.position) {
      bridge.openEdges.push(turnState.understand.the_echo.position);
    }
    if (turnState.decide?.the_void) {
      bridge.openEdges.push(turnState.decide.the_void);
    }
  }

  // Next step from refiner or decide
  bridge.nextStep = turnState.refiner?.the_step 
                 || turnState.decide?.the_answer?.next_step 
                 || null;

  return bridge;
}

Summary: What Changed
Original Design	Corrected Design
Support counts in minimal artifact	Removed—no attribution
Consensus/outlier distinction visible	Removed—all claims equal
Elevated as separate signal	Collapsed into ticked
Per-claim comments	Single notepad
"Established" from conclusion	From corrections + groundings + removals (with negative)
Query optional	Required—keeps bridge self-contained
No cascade logic	Cascade effects on removal/correction
This is cleaner, simpler, and correctly enforces equal-weight claim processing for downstream models.