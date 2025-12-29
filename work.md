You are implementing the context propagation and user curation system for Singularity v3, a multi-model reasoning orchestration platform. The system processes queries through a pipeline: Batch (multiple LLMs) → Mapper (extracts structured claims) → Cognitive Layers (Understand/Decide/Refiner/Antagonist) → Context Bridge (for next turn).

The core architectural principle: Models must weigh all claims equally. No attribution, no support counts, no consensus/outlier distinction should flow to downstream batch prompts. Only horizontal enrichment (dimensions, conditions, relationships) is permitted.

Part 1: Minimal Mapper Artifact for Context Bridging
Intent
Create a token-efficient representation of the mapper output that can be passed to Turn N+1 batch prompts. This artifact must strip ALL attribution signals (who said what, how many agreed) while preserving structural enrichment (what dimensions exist, what tensions exist, what was unaddressed).

Type Definition
Create src/types/context-bridge.ts:

TypeScript

/**
 * MinimalMapperArtifact
 * 
 * A stripped-down representation of the mapper output for context bridging.
 * Contains NO attribution signals (support counts, sources, consensus/outlier distinction).
 * Contains ONLY horizontal enrichment (dimensions, conditions, relationships).
 * 
 *
 */
export interface MinimalMapperArtifact {
  // All claims flattened - NO attribution, NO source indicators
  claims: Array<{
    text: string;
    dimension?: string;          // What axis this addresses
    applies_when?: string;       // Conditional applicability
    isFrameChallenger?: boolean; // Flags claims that reframe the problem (no source)
  }>;
  
  // All dimensions found across claims
  dimensions: string[];
  
  // Tensions as unlabeled pairs (no "consensus vs outlier" framing)
  tensions: Array<{
    pair: [string, string];  // Just the claim texts
    axis: string;            // The dimension of tension
  }>;
  
  // What no model addressed
  ghost: string | null;
  
  // Validation: count for delta detection
  claimCount: number;
}
Builder Function
Create src/utils/context-bridge.ts:

TypeScript

import type { MapperArtifact, MinimalMapperArtifact } from '../types';

/**
 * Builds a minimal mapper artifact for context bridging.
 * 
 * CRITICAL: This function strips ALL attribution signals.
 * - No support_count
 * - No supporters array
 * - No source/source_index
 * - No consensus.strength or consensus.quality
 * - No distinction between consensus claims and outliers
 * 
 * The output treats all claims as equal-weight inputs for downstream models.
 */
export function buildMinimalMapperArtifact(
  fullArtifact: MapperArtifact
): MinimalMapperArtifact {
  // Flatten ALL claims without any attribution
  const claims = [
    ...fullArtifact.consensus.claims.map(c => ({
      text: c.text,
      dimension: c.dimension || undefined,
      applies_when: c.applies_when || undefined,
      isFrameChallenger: false
    })),
    ...fullArtifact.outliers.map(o => ({
      text: o.insight,
      dimension: o.dimension || undefined,
      applies_when: o.applies_when || undefined,
      isFrameChallenger: o.type === 'frame_challenger'
    }))
  ];

  // Extract tensions as unlabeled pairs
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
Part 2: Established Facts Schema
Intent
Define what constitutes an "established fact" that should not be re-argued in subsequent turns. This comes from three sources:

Corrections (positive): User corrected a claim → the correction is ground truth
Antagonist groundings (positive): Facts established during the turn
Removals (negative): User explicitly rejected claims → don't resurrect
Type Definition
Add to src/types/context-bridge.ts:

TypeScript

/**
 * EstablishedFacts
 * 
 * Facts that should not be re-argued in subsequent turns.
 * 
 * Positive: Ground truth established by user corrections or antagonist grounding.
 * Negative: Claims explicitly rejected - models should not resurrect these.
 */
export interface EstablishedFacts {
  positive: Array<{
    text: string;
    source: 'correction' | 'grounding';
  }>;
  
  negative: Array<{
    text: string;
    source: 'removal';
  }>;
}
Extraction Function
Add to src/utils/context-bridge.ts:

TypeScript

import type { TurnState, EstablishedFacts, MapperArtifact } from '../types';

/**
 * Extracts established facts from turn state.
 * 
 * Sources:
 * - Corrections → positive establishment (ground truth)
 * - Antagonist grounding → positive establishment
 * - Removals → negative establishment (don't resurrect)
 */
export function extractEstablishedFacts(turnState: TurnState): EstablishedFacts {
  const established: EstablishedFacts = {
    positive: [],
    negative: []
  };

  // From user corrections
  if (turnState.artifactEdits?.edits.modified) {
    for (const mod of turnState.artifactEdits.edits.modified) {
      established.positive.push({
        text: mod.editedText,
        source: 'correction'
      });
    }
  }

  // From antagonist groundings
  if (turnState.antagonist?.grounding && Array.isArray(turnState.antagonist.grounding)) {
    for (const g of turnState.antagonist.grounding) {
      established.positive.push({
        text: g,
        source: 'grounding'
      });
    }
  }

  // From removals (negative establishment)
  if (turnState.artifactEdits?.edits.removed) {
    for (const removal of turnState.artifactEdits.edits.removed) {
      // Look up claim text from original artifact
      const claim = findClaimById(removal.claimId, turnState.mapper.artifact);
      if (claim) {
        established.negative.push({
          text: typeof claim === 'string' ? claim : (claim.text || claim.insight),
          source: 'removal'
        });
      }
    }
  }

  return established;
}

function findClaimById(
  claimId: string, 
  artifact: MapperArtifact
): { text?: string; insight?: string } | null {
  // Search consensus claims
  const consensusClaim = artifact.consensus.claims.find(c => 
    c.id === claimId || c.text === claimId
  );
  if (consensusClaim) return consensusClaim;
  
  // Search outliers
  const outlier = artifact.outliers.find(o => 
    o.id === claimId || o.insight === claimId
  );
  if (outlier) return outlier;
  
  return null;
}
Part 3: Complete Context Bridge
Intent
Create the complete context bridge structure that carries forward:

The original query (for self-containment and retrieval)
Established facts (what not to re-argue)
Open edges (natural follow-up territory)
Next step recommendations
The minimal landscape
Cascade effects from user edits
Type Definition
Add to src/types/context-bridge.ts:

TypeScript

export interface ContextBridge {
  // Original query for this turn (required for self-containment)
  query: string;
  
  // Established facts from corrections, groundings, removals
  established: EstablishedFacts;
  
  // Open edges for natural follow-up
  // Sources: the_echo (Understand), the_void (Decide), structured_prompt (Antagonist)
  openEdges: string[];
  
  // Recommended next action
  // Sources: the_step (Refiner), next_step (Decide)
  nextStep: string | null;
  
  // Minimal landscape (no attribution)
  landscape: MinimalMapperArtifact;
  
  // Cascade effects from user edits (if any)
  cascadeEffects?: CascadeEffects;
  
  // Metadata
  turnId: string;
}
Builder Function
Add to src/utils/context-bridge.ts:

TypeScript

/**
 * Builds a complete context bridge for Turn N+1.
 * 
 * Layer hierarchy for open edges:
 *   Antagonist (structured_prompt) > Understand (the_echo) / Decide (the_void)
 * 
 * Layer hierarchy for next step:
 *   Refiner (the_step) > Decide (next_step)
 */
export function buildContextBridge(turnState: TurnState): ContextBridge {
  const bridge: ContextBridge = {
    query: turnState.query,
    established: extractEstablishedFacts(turnState),
    openEdges: [],
    nextStep: null,
    landscape: buildMinimalMapperArtifact(turnState.mapper.artifact),
    turnId: turnState.turnId
  };

  // Compute cascade effects if removals exist
  if (turnState.artifactEdits?.edits.removed?.length > 0) {
    const removedIds = turnState.artifactEdits.edits.removed.map(r => r.claimId);
    bridge.cascadeEffects = computeCascadeEffects(
      removedIds,
      turnState.mapper.graphTopology,
      turnState.mapper.artifact
    );
  }

  // Open edges: Antagonist supersedes others
  if (turnState.antagonist?.structured_prompt) {
    bridge.openEdges = [turnState.antagonist.structured_prompt];
    if (turnState.antagonist.payoff) {
      bridge.openEdges.push(`Answering unlocks: ${turnState.antagonist.payoff}`);
    }
  } else {
    // Fall back to primary synthesis edges
    if (turnState.understand?.the_echo?.position) {
      bridge.openEdges.push(turnState.understand.the_echo.position);
    }
    if (turnState.decide?.the_void) {
      bridge.openEdges.push(turnState.decide.the_void);
    }
  }

  // Next step: Refiner supersedes Decide
  bridge.nextStep = turnState.refiner?.the_step 
                 || turnState.decide?.the_answer?.next_step 
                 || null;

  return bridge;
}
Part 4: Cascade Effects Algorithm
Intent
When a user removes a claim, compute the downstream effects on related claims based on graph topology:

Orphaned claims: Lost their prerequisite
Freed claims: Were prerequisites for the removed claim
Resolved conflicts: The removal settled a conflict
Broken complements: Lost their complementary pair
Type Definition
Add to src/types/context-bridge.ts:

TypeScript

export interface CascadeEffects {
  // Claims that lost their prerequisite
  orphanedClaims: Array<{
    claimId: string;
    claimText: string;
    lostPrerequisite: string;
    action: 'flag' | 'auto_remove';
  }>;
  
  // Claims that were prerequisites for the removed claim
  freedClaims: Array<{
    claimId: string;
    claimText: string;
  }>;
  
  // Conflicts resolved by the removal
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
Create src/utils/cascade-effects.ts:

TypeScript

import type { CascadeEffects, GraphTopology, MapperArtifact } from '../types';

/**
 * Computes cascade effects when claims are removed.
 * 
 * Uses graph topology to identify:
 * 1. Orphans: Claims whose prerequisite was removed
 * 2. Freed: Claims that were prerequisites for removed claims
 * 3. Resolved: Conflicts settled by removal
 * 4. Broken: Complements that lost their pair
 */
export function computeCascadeEffects(
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

  if (!graphTopology?.nodes || !graphTopology?.edges) {
    return effects;
  }

  // Build node lookup
  const nodeMap = new Map(graphTopology.nodes.map(n => [n.id, n]));
  
  // Identify removed node IDs
  const removedNodeIds = new Set<string>();
  for (const claimId of removedClaimIds) {
    const node = graphTopology.nodes.find(n => 
      n.label === claimId || n.id === claimId
    );
    if (node) removedNodeIds.add(node.id);
  }

  // Process each edge
  for (const edge of graphTopology.edges) {
    const sourceRemoved = removedNodeIds.has(edge.source);
    const targetRemoved = removedNodeIds.has(edge.target);
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);

    if (!sourceNode || !targetNode) continue;

    switch (edge.type) {
      case 'prerequisite':
        if (sourceRemoved && !targetRemoved) {
          // Removed claim was prerequisite for target → target is ORPHANED
          effects.orphanedClaims.push({
            claimId: edge.target,
            claimText: targetNode.label,
            lostPrerequisite: sourceNode.label,
            action: 'flag' // Don't auto-remove, let user decide
          });
        }
        if (targetRemoved && !sourceRemoved) {
          // Target was removed, source was its prerequisite → source is FREED
          effects.freedClaims.push({
            claimId: edge.source,
            claimText: sourceNode.label
          });
        }
        break;

      case 'conflicts':
        if (sourceRemoved && !targetRemoved) {
          effects.resolvedConflicts.push({
            survivingClaim: targetNode.label,
            eliminatedClaim: sourceNode.label
          });
        } else if (targetRemoved && !sourceRemoved) {
          effects.resolvedConflicts.push({
            survivingClaim: sourceNode.label,
            eliminatedClaim: targetNode.label
          });
        }
        break;

      case 'complements':
        if (sourceRemoved !== targetRemoved) {
          // One side of complement pair removed
          const orphanNode = sourceRemoved ? targetNode : sourceNode;
          const lostNode = sourceRemoved ? sourceNode : targetNode;
          effects.brokenComplements.push({
            orphanedClaim: orphanNode.label,
            lostComplement: lostNode.label
          });
        }
        break;
    }
  }

  return effects;
}
Part 5: Artifact Edit Schema & Persistence
Intent
Track user edits to the mapper artifact in a simplified structure:

Single notepad for comments (not per-claim)
Ticked as the only selection signal (no elevation/starring)
Full diff tracking for corrections, additions, removals
Type Definition
Create src/types/artifact-edits.ts:

TypeScript

export interface ArtifactEdit {
  // Identifiers
  sessionId: string;
  turnId: string;
  editedAt: number;
  
  // User's general notes (single notepad, not per-claim)
  userNotes: string | null;
  
  // Structured edits
  edits: {
    // Claims user added that mapper didn't extract
    added: Array<{
      claim: {
        id: string;
        text: string;
        dimension?: string;
      };
    }>;
    
    // Claims user removed
    removed: Array<{
      claimId: string;
    }>;
    
    // Claims user modified (corrections)
    modified: Array<{
      originalId: string;
      originalText: string;
      editedText: string;
    }>;
  };
  
  // Ticked claim IDs (implicit endorsement)
  tickedIds: string[];
  
  // Ghost override
  ghostOverride: string | null;
  
  // Computed intensity
  editIntensity: 'light' | 'moderate' | 'heavy';
}

/**
 * Computes edit intensity based on change ratio.
 * 
 * light: < 15% of claims changed
 * moderate: 15-40% of claims changed
 * heavy: > 40% of claims changed
 */
export function computeEditIntensity(
  edits: ArtifactEdit['edits'],
  originalClaimCount: number
): 'light' | 'moderate' | 'heavy' {
  const changeCount = 
    (edits.added?.length || 0) + 
    (edits.removed?.length || 0) + 
    (edits.modified?.length || 0) * 2; // Modifications count double
  
  const changeRatio = changeCount / Math.max(originalClaimCount, 1);
  
  if (changeRatio < 0.15) return 'light';
  if (changeRatio < 0.40) return 'moderate';
  return 'heavy';
}
Part 6: Signal Classification
Intent
Classify all claims by their signal type for layer-specific routing:

correction: User modified the claim (highest signal for Refiner)
addition: User injected new claim
ticked: User selected/endorsed
unticked: User didn't interact
removal: User explicitly deleted (filter out)
Implementation
Create src/utils/signal-router.ts:

TypeScript

import type { MapperArtifact, ArtifactEdit } from '../types';

export type SignalType = 'correction' | 'addition' | 'ticked' | 'unticked' | 'removal';

export interface ClassifiedClaim {
  claim: {
    id?: string;
    text?: string;
    insight?: string;
    dimension?: string;
    applies_when?: string;
  };
  signalType: SignalType;
  commentary?: string;
}

/**
 * Classifies all claims by their signal type.
 * 
 * Signal priority for different layers:
 * - Refiner: Corrections are PRIMARY DRIVER
 * - Gauntlet: All signals treated equally (blind to preference)
 * - Understand: Ticked favored in tiebreakers
 */
export function classifyClaimsWithSignals(
  originalArtifact: MapperArtifact,
  edits: ArtifactEdit | null
): ClassifiedClaim[] {
  const classified: ClassifiedClaim[] = [];
  
  if (!edits) {
    // No edits - all claims are unticked
    const allClaims = [
      ...originalArtifact.consensus.claims,
      ...originalArtifact.outliers
    ];
    return allClaims.map(claim => ({
      claim,
      signalType: 'unticked' as SignalType
    }));
  }

  // Build lookup sets
  const addedIds = new Set(edits.edits.added?.map(a => a.claim.id));
  const removedIds = new Set(edits.edits.removed?.map(r => r.claimId));
  const modifiedMap = new Map(
    edits.edits.modified?.map(m => [m.originalId, m])
  );
  const tickedIds = new Set(edits.tickedIds || []);

  // Process additions
  for (const addition of edits.edits.added || []) {
    classified.push({
      claim: addition.claim,
      signalType: 'addition'
    });
  }

  // Process modifications (corrections)
  for (const mod of edits.edits.modified || []) {
    classified.push({
      claim: { id: mod.originalId, text: mod.editedText },
      signalType: 'correction',
      commentary: `Corrected from: "${mod.originalText}"`
    });
  }

  // Process original claims
  const allOriginalClaims = [
    ...originalArtifact.consensus.claims,
    ...originalArtifact.outliers
  ];

  for (const claim of allOriginalClaims) {
    const claimId = claim.id || claim.text || claim.insight;
    
    // Skip if removed
    if (removedIds.has(claimId)) {
      classified.push({ claim, signalType: 'removal' });
      continue;
    }
    
    // Skip if modified (already processed)
    if (modifiedMap.has(claimId)) continue;
    
    // Ticked or unticked
    classified.push({
      claim,
      signalType: tickedIds.has(claimId) ? 'ticked' : 'unticked'
    });
  }

  return classified;
}
Part 7: Layer-Specific Prompt Injection
Intent
Create injection functions that format user signals appropriately for each cognitive layer:

Understand: Corrections must be addressed, additions included, ticked favored in tiebreakers
Gauntlet/Decide: All signals treated equally, no preferential treatment
Refiner: Corrections are PRIMARY DRIVER, additions secondary
Antagonist: Focus on ghost override and additions for exploration
Implementation
Add to src/core/PromptService.ts:

TypeScript

import { ClassifiedClaim, SignalType } from '../utils/signal-router';

/**
 * Signal injection for Understand layer.
 * 
 * Semantics:
 * - Corrections: MUST be addressed in frame
 * - Additions: MUST be included or explicitly excluded
 * - Ticked: Favored in tiebreakers
 * - Unticked: Deprioritized
 * - Removed: Filtered out
 */
export function buildUnderstandSignalInjection(
  classified: ClassifiedClaim[]
): string {
  const corrections = classified.filter(c => c.signalType === 'correction');
  const additions = classified.filter(c => c.signalType === 'addition');
  const ticked = classified.filter(c => c.signalType === 'ticked');
  const unticked = classified.filter(c => c.signalType === 'unticked');
  
  if (corrections.length === 0 && additions.length === 0 && ticked.length === 0) {
    return '';
  }

  let injection = `\n---\n\n## Human Curation Signal\n\n`;

  if (corrections.length > 0) {
    injection += `### Corrections (Must Address)\n`;
    injection += corrections.map(c => 
      `• **CORRECTED**: "${c.claim.text || c.claim.insight}"${c.commentary ? `\n  (${c.commentary})` : ''}`
    ).join('\n');
    injection += `\n\nYour frame MUST incorporate these corrections. They represent ground-truth knowledge.\n\n`;
  }

  if (additions.length > 0) {
    injection += `### User Additions (Must Include)\n`;
    injection += additions.map(a => 
      `• **ADDED**: "${a.claim.text || a.claim.insight}"`
    ).join('\n');
    injection += `\n\nThese are dimensions NO model saw. Include in your frame or explicitly explain exclusion.\n\n`;
  }

  if (ticked.length > 0) {
    injection += `### Endorsed (Ticked)\n`;
    injection += ticked.map(t => `• "${t.claim.text || t.claim.insight}"`).join('\n');
    injection += `\n\n`;
  }

  if (unticked.length > 0) {
    injection += `### Baseline (Unticked)\n`;
    injection += unticked.slice(0, 5).map(u => `• "${u.claim.text || u.claim.insight}"`).join('\n');
    if (unticked.length > 5) injection += `\n...and ${unticked.length - 5} more`;
    injection += `\n\n`;
  }

  injection += `**Tiebreaker Rule**: When two claims serve the frame equally, prefer ticked over unticked.\n\n---\n`;

  return injection;
}

/**
 * Signal injection for Decide/Gauntlet layer.
 * 
 * Semantics:
 * - ALL signals treated equally (blind to preference)
 * - Corrections enter as contestants (can still fail)
 * - Additions enter as contestants (no preferential treatment)
 * - Ticked/unticked is shown but DOES NOT affect judgment
 */
export function buildDecideSignalInjection(
  classified: ClassifiedClaim[]
): string {
  const contestants = classified.filter(c => c.signalType !== 'removal');
  
  if (contestants.length === 0) return '';

  let injection = `\n---\n\n## Gauntlet Contestants\n\n`;
  injection += `The following claims enter the Gauntlet. **Inclusion status is for transparency only—it does NOT affect your judgment.**\n\n`;
  injection += `Every claim faces identical kill tests: Actionability, Falsifiability, Relevance, Superiority.\n\n`;

  injection += `### All Contestants\n`;
  injection += contestants.map(c => {
    const tag = c.signalType === 'correction' ? 'CORRECTED'
              : c.signalType === 'addition' ? 'ADDED'
              : c.signalType === 'ticked' ? 'TICKED'
              : 'UNTICKED';
    return `• [${tag}] "${c.claim.text || c.claim.insight}"`;
  }).join('\n');

  injection += `\n\n**Gauntlet Principle**: An unticked claim can survive. A ticked claim can die. Only merit determines survival.\n\n---\n`;

  return injection;
}

/**
 * Signal injection for Refiner/Challenge layer.
 * 
 * Semantics:
 * - Corrections are PRIMARY DRIVER (rebuild around them)
 * - Additions are secondary material (may contain the_one)
 * - Removed items may be resurrected if valuable
 */
export function buildRefinerSignalInjection(
  classified: ClassifiedClaim[],
  inputType: 'understand' | 'decide'
): string {
  const corrections = classified.filter(c => c.signalType === 'correction');
  const additions = classified.filter(c => c.signalType === 'addition');
  const removed = classified.filter(c => c.signalType === 'removal');

  let injection = `\n---\n\n## User Curation Signal (Refiner-Specific)\n\n`;

  if (corrections.length > 0) {
    injection += `### Corrections (PRIMARY DRIVER)\n`;
    injection += `**These corrections are DEFINITIVE.** The ${inputType === 'understand' ? 'frame' : 'verdict'} incorporated assumptions the user has explicitly overridden.\n\n`;
    injection += corrections.map(c => 
      `• "${c.claim.text || c.claim.insight}"${c.commentary ? `\n  (${c.commentary})` : ''}`
    ).join('\n');
    
    if (inputType === 'understand') {
      injection += `\n\nYour task: Rebuild final_word as if this correction was the core insight all along.\n\n`;
    } else {
      injection += `\n\nYour task: Challenge the elimination criteria. Would this correction change which claims survive?\n\n`;
    }
  } else {
    injection += `### No Corrections\nProceed with standard adversarial analysis.\n\n`;
  }

  if (additions.length > 0) {
    injection += `### User Additions (Secondary Material)\n`;
    injection += additions.map(a => `• "${a.claim.text || a.claim.insight}"`).join('\n');
    if (corrections.length === 0) {
      injection += `\n\nNo corrections present. These additions may contain the_one for your alternative frame.\n\n`;
    } else {
      injection += `\n\nConsider alongside the correction.\n\n`;
    }
  }

  if (removed.length > 0) {
    injection += `### User Removals (Potential Resurrection)\n`;
    injection += removed.map(r => `• "${r.claim.text || r.claim.insight}"`).join('\n');
    injection += `\n\nThe user deprioritized these. If you find overlooked value, you MAY resurrect—but flag the disagreement.\n\n`;
  }

  injection += `**Refiner Logic**:\n`;
  injection += `1. If corrections exist → Rebuild around correction\n`;
  injection += `2. Else if additions exist → Consider additions as the_one candidates\n`;
  injection += `3. Else → Mine removed items and outliers for overlooked signal\n\n---\n`;

  return injection;
}

/**
 * Signal injection for Antagonist/Next layer.
 * 
 * Semantics:
 * - Ghost override is PRIMARY TARGET for structured_prompt
 * - Additions suggest dimensions to explore
 * - Priorities inform what to ground
 */
export function buildAntagonistSignalInjection(
  classified: ClassifiedClaim[],
  inputType: 'understand' | 'decide',
  ghostOverride: string | null
): string {
  const additions = classified.filter(c => c.signalType === 'addition');
  const ticked = classified.filter(c => c.signalType === 'ticked');

  let injection = `\n---\n\n## User Curation Signal (Antagonist-Specific)\n\n`;

  if (ghostOverride) {
    injection += `### Ghost Override (PRIMARY TARGET)\n`;
    injection += `The user explicitly specified an unaddressed concern: "${ghostOverride}"\n\n`;
    injection += `Your structured_prompt should elicit information to address this ghost.\n\n`;
  }

  if (additions.length > 0) {
    injection += `### User Additions (Dimensions to Explore)\n`;
    injection += additions.map(a => `• "${a.claim.text || a.claim.insight}"`).join('\n');
    injection += `\n\nThe user saw dimensions models missed. Target your structured_prompt toward these.\n\n`;
  }

  if (ticked.length > 0) {
    injection += `### User Priorities\n`;
    injection += ticked.map(t => `• "${t.claim.text || t.claim.insight}"`).join('\n');
    injection += `\n\nThe user cares most about these. Your grounding should acknowledge them as established.\n\n`;
  }

  if (inputType === 'decide') {
    injection += `### Decide-Specific Orientation\n\n`;
    injection += `You receive a VERDICT. Your task is to specify the action:\n\n`;
    injection += `1. **Action Parameters**: What context would change HOW to execute?\n`;
    injection += `2. **Edge Cases**: When does the verdict NOT apply?\n`;
    injection += `3. **Confidence Calibration**: What would raise or lower confidence?\n\n`;
    injection += `Your structured_prompt should help the user specify their context so the action becomes precise.\n`;
  } else {
    injection += `### Understand-Specific Orientation\n\n`;
    injection += `You receive a FRAME. Your task is to explore its limits:\n\n`;
    injection += `1. **Frame Boundaries**: What context would change the frame?\n`;
    injection += `2. **The Echo**: What does the frame not naturally accommodate?\n`;
    injection += `3. **Dimensions Unexplored**: What questions weren't asked?\n\n`;
    injection += `Your structured_prompt should help the user discover what they haven't yet specified.\n`;
  }

  injection += `\n---\n`;

  return injection;
}
Part 8: Context Bridge Prompt Injection
Intent
Create the injection function that formats the context bridge for Turn N+1 batch prompts.

Implementation
Add to src/core/PromptService.ts:

TypeScript

import type { ContextBridge } from '../types';

/**
 * Injects context bridge into batch prompts for Turn N+1.
 * 
 * The bridge contains:
 * - Original query (for context)
 * - Established facts (don't re-argue)
 * - Open edges (natural follow-up)
 * - Next step (if any)
 * - Minimal landscape (NO attribution)
 */
export function injectContextBridge(bridge: ContextBridge): string {
  let injection = `<prior_context turn="${bridge.turnId}">\n\n`;
  
  // Original query
  injection += `## Previous Query\n"${bridge.query}"\n\n`;

  // Established facts
  if (bridge.established.positive.length > 0 || bridge.established.negative.length > 0) {
    injection += `## Established Facts\n\n`;
    
    if (bridge.established.positive.length > 0) {
      injection += `**Do not re-argue** (these are settled):\n`;
      injection += bridge.established.positive.map(e => `• ${e.text}`).join('\n');
      injection += `\n\n`;
    }
    
    if (bridge.established.negative.length > 0) {
      injection += `**Do not resurrect** (these were explicitly rejected):\n`;
      injection += bridge.established.negative.map(e => `• ${e.text}`).join('\n');
      injection += `\n\n`;
    }
  }

  // Open edges
  if (bridge.openEdges.length > 0) {
    injection += `## Open Edges (natural follow-up territory)\n`;
    injection += bridge.openEdges.map(e => `• ${e}`).join('\n');
    injection += `\n\n`;
  }

  // Next step
  if (bridge.nextStep) {
    injection += `## Recommended Next Step\n${bridge.nextStep}\n\n`;
  }

  // Minimal landscape
  injection += `## Landscape Reference\n`;
  injection += `**Dimensions covered**: ${bridge.landscape.dimensions.join(', ') || 'general'}\n`;
  if (bridge.landscape.ghost) {
    injection += `**Unaddressed**: ${bridge.landscape.ghost}\n`;
  }
  injection += `\n**Claims considered** (${bridge.landscape.claimCount} total):\n`;
  injection += bridge.landscape.claims.map((c, i) => {
    let line = `${i + 1}. ${c.text}`;
    if (c.dimension) line += ` [${c.dimension}]`;
    if (c.applies_when) line += ` — applies: ${c.applies_when}`;
    if (c.isFrameChallenger) line += ` ⚡`;
    return line;
  }).join('\n');
  injection += `\n\n`;

  // Tensions
  if (bridge.landscape.tensions.length > 0) {
    injection += `**Key tensions**:\n`;
    injection += bridge.landscape.tensions.map(t => 
      `• ${t.pair[0]} ↔ ${t.pair[1]} (${t.axis})`
    ).join('\n');
    injection += `\n\n`;
  }

  // Cascade effects (if any)
  if (bridge.cascadeEffects) {
    const ce = bridge.cascadeEffects;
    if (ce.orphanedClaims.length > 0 || ce.resolvedConflicts.length > 0) {
      injection += `## Cascade Effects from Previous Edits\n`;
      
      if (ce.orphanedClaims.length > 0) {
        injection += `**Orphaned** (lost prerequisite):\n`;
        injection += ce.orphanedClaims.map(o => 
          `• "${o.claimText}" — lost: ${o.lostPrerequisite}`
        ).join('\n');
        injection += `\n`;
      }
      
      if (ce.resolvedConflicts.length > 0) {
        injection += `**Conflicts resolved**:\n`;
        injection += ce.resolvedConflicts.map(r => 
          `• "${r.survivingClaim}" survived (${r.eliminatedClaim} eliminated)`
        ).join('\n');
        injection += `\n`;
      }
      injection += `\n`;
    }
  }

  injection += `</prior_context>\n\n`;
  injection += `Use this context only if relevant to the current query. The user may be continuing this thread or pivoting to something new. Adapt accordingly.\n\n---\n\n`;
  injection += `<current_query>\n`;

  return injection;
}
Part 9: Persistence Integration
Intent
Extend SessionManager to persist artifact edits and context bridges.

Implementation
Add to src/core/SessionManager.ts:

TypeScript

import type { ArtifactEdit, ContextBridge } from '../types';

// Add to SessionManager class:

async persistArtifactEdit(
  sessionId: string,
  turnId: string,
  edit: ArtifactEdit
): Promise<void> {
  // Store in turns table as part of AI turn metadata
  const turn = await this.adapter.get('turns', turnId);
  if (!turn) {
    console.warn(`[SessionManager] Cannot persist edit: turn ${turnId} not found`);
    return;
  }
  
  await this.adapter.put('turns', turnId, {
    ...turn,
    artifactEdit: edit,
    updatedAt: Date.now()
  });
  
  console.log(`[SessionManager] Persisted artifact edit for turn ${turnId}`);
}

async persistContextBridge(
  sessionId: string,
  turnId: string,
  bridge: ContextBridge
): Promise<void> {
  // Store bridge for retrieval in future turns
  await this.adapter.put('context_bridges', turnId, {
    ...bridge,
    sessionId,
    createdAt: Date.now()
  });
  
  console.log(`[SessionManager] Persisted context bridge for turn ${turnId}`);
}

async getContextBridge(turnId: string): Promise<ContextBridge | null> {
  try {
    return await this.adapter.get('context_bridges', turnId);
  } catch {
    return null;
  }
}

async getLatestContextBridge(sessionId: string): Promise<ContextBridge | null> {
  try {
    const turns = await this.adapter.getTurnsBySessionId(sessionId);
    if (!turns || turns.length === 0) return null;
    
    // Get most recent AI turn with a context bridge
    for (let i = turns.length - 1; i >= 0; i--) {
      const turn = turns[i];
      if (turn.type === 'ai') {
        const bridge = await this.getContextBridge(turn.id);
        if (bridge) return bridge;
      }
    }
    return null;
  } catch {
    return null;
  }
}
Summary: Files to Create/Modify
File	Action	Purpose
src/types/context-bridge.ts	Create	Type definitions for MinimalMapperArtifact, EstablishedFacts, ContextBridge, CascadeEffects
src/types/artifact-edits.ts	Create	Type definitions for ArtifactEdit and related
src/utils/context-bridge.ts	Create	Builder functions for minimal artifact, established facts, and full bridge
src/utils/cascade-effects.ts	Create	Cascade effect computation algorithm
src/utils/signal-router.ts	Create	Signal classification and routing logic
src/core/PromptService.ts	Extend	Add all signal injection and context bridge injection functions
src/core/SessionManager.ts	Extend	Add persistence methods for edits and bridges
Verification Checklist
After implementation, verify:

MinimalMapperArtifact contains NO attribution signals

No supporters array
No support_count
No source / source_index
No consensus.strength or consensus.quality
No distinction between consensus and outlier in the flat list
Established facts correctly extracted

Corrections → positive
Antagonist groundings → positive
Removals → negative
Cascade effects compute correctly

Removing a prerequisite orphans its dependents
Removing a conflict participant resolves the conflict
Removing a complement breaks the pair
Signal injection respects layer semantics

Understand: ticked favored in tiebreakers
Gauntlet: blind to preference
Refiner: corrections are primary driver
Context bridge is self-contained

Includes query
Includes established facts
Includes landscape WITHOUT attribution
Token cost ≤ 300 for typical turn