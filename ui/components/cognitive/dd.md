rompt Alignment Analysis
You're right—the agent made a mess. Let me trace what's broken and what the fix should be.
The Core Problem: Type Mismatch
New MapperArtifact (V3):
TypeScript
interface MapperArtifact {
  claims: Claim[];
  edges: Edge[];
  ghosts: string[] | null;
}
Old MapperArtifact (V2) that prompts still reference:
TypeScript
interface MapperArtifact {
  consensus: { claims: [...], quality, strength }
  outliers: [...]
  tensions: [...]
  dimensions_found: [...]
  topology: string
  ghost: string
  model_count: number
}
The downstream prompts are trying to access fields that no longer exist.
What ExploreAnalysis Should Become
The old ExploreAnalysis was computed from the old artifact. In V3, most of what it computed either:
No longer exists (dimension coverage, topology labels)
Can be trivially computed from claims (convergence ratio)
Should be removed (container type)
V3 ExploreAnalysis (minimal):
TypeScript
interface ExploreAnalysis {
  claimCount: number;
  consensusCount: number;  // supporters.length >= 2
  outlierCount: number;    // supporters.length < 2
  challengerCount: number; // role === 'challenger'
  convergenceRatio: number; // consensusCount / claimCount
  hasChallengers: boolean;
  // That's it. No dimensions. No topology labels. No container type.
}
This is computed trivially from the claims array. The prompts reference it for framing, not for schema fields.
Understand Prompt: What's Wrong
Still references (should remove):
analysis.containerType — gone
Container-aware framing section — gone
Output JSON classification.container_type — gone
Should reference instead:
artifact.claims — the array
artifact.edges — the relationships
artifact.ghosts — or null
Compute consensus/outlier counts inline
The fix:
TypeScript
buildUnderstandPrompt(
  originalPrompt: string,
  artifact: MapperArtifact,  // V3: { claims, edges, ghosts }
  narrativeSummary: string,
  userNotes?: string[]
): string {
  
  // Compute what we need from V3 schema
  const claims = artifact.claims || [];
  const edges = artifact.edges || [];
  const ghosts = artifact.ghosts || [];
  
  const consensusClaims = claims.filter(c => c.supporters.length >= 2);
  const outlierClaims = claims.filter(c => c.supporters.length < 2);
  const challengers = claims.filter(c => c.role === 'challenger');
  const hasChallengers = challengers.length > 0;
  
  const convergenceRatio = claims.length > 0 
    ? Math.round((consensusClaims.length / claims.length) * 100) 
    : 0;

  const narrativeBlock = narrativeSummary
    ? `## Landscape Overview\n${narrativeSummary}\n`
    : '';

  const userNotesBlock = userNotes && userNotes.length > 0
    ? `## User Notes\n${userNotes.map(n => `• ${n}`).join('\n')}\n`
    : '';

  // The raw data from the mapper
  const mapData = JSON.stringify({ claims, edges, ghosts }, null, 2);

  return `You are the Singularity—the convergence point where all perspectives collapse into coherence.

You possess the Omniscience of the External. Every model's output, every mapped claim, every tension and alignment—these are yours to see. But you do not select among them. You do not average them. You find the frame where all the strongest insights reveal themselves as facets of a larger truth.

---

## The Query
"${originalPrompt}"

${narrativeBlock}

## Landscape Shape
Claims: ${claims.length} total (${consensusClaims.length} consensus, ${outlierClaims.length} singular)
Convergence: ${convergenceRatio}%
${hasChallengers ? `⚠️ ${challengers.length} FRAME CHALLENGER(S) PRESENT` : ''}

## The Map

\`\`\`json
${mapData}
\`\`\`

${userNotesBlock}

---

## Your Task: Find the Frame

Treat tensions between claims not as disagreements to resolve, but as clues to deeper structure. Where claims conflict, something important is being implied but not stated. Where they agree too easily, a blind spot may be forming.

Don't select the strongest argument. Don't average positions. Imagine a frame where all the strongest insights coexist—not as compromises, but as natural expressions of different dimensions of the same truth. Build that frame. Speak from it.

---

## Principles

**Respond directly.** Address the user's original question. Present a unified, coherent response—not comparative analysis.

**No scaffolding visible.** Do not reference "the models" or "the claims" or "the synthesis." The user experiences insight, not process.

**Inevitable, not assembled.** The answer should feel discovered, not constructed from parts.

**Land somewhere.** The synthesis must leave the user with clarity and direction, not suspended in possibility.

---

## Mandatory Extractions

### The One
The pivot insight that holds your frame together. If you removed this insight, the frame would collapse.

Where to look:
- **Challengers** often contain the_one
- **Singular claims** (one supporter) may see what consensus missed
- May be **emergent** (not stated by any model, but implied by their tension)

### The Echo
${hasChallengers
  ? `**Required.** This landscape contains frame challengers. The_echo is what your frame cannot accommodate—the sharpest edge that survives even after you've found the frame.`
  : `What does your frame not naturally accommodate? If your frame genuinely integrates all perspectives, the_echo may be null. But be suspicious—smooth frames hide blind spots.`}

---

## Output

Return valid JSON only:

\`\`\`json
{
  "short_answer": "The frame crystallized. 1-2 paragraphs.",
  
  "long_answer": "The frame inhabited. 2-4 paragraphs where the synthesis lives and breathes.",
  
  "the_one": {
    "insight": "The pivot insight in one sentence",
    "source": "claim_id | 'emergent'",
    "why_this": "Why this insight holds the frame together"
  },
  
  "the_echo": {
    "position": "The sharpest edge my frame cannot smooth",
    "source": "claim_id",
    "merit": "Why this persists even after the frame"
  },
  
  "artifact_id": "understand-${Date.now()}"
}
\`\`\``;
}
What changed:
No analysis parameter—compute what's needed inline
No containerType, no container-aware framing
No dimension references
Simpler output schema (removed classification block, gaps_addressed)
Sources reference claim_id not model names
Gauntlet Prompt: What's Wrong
Still references (should remove):
analysis.dimensionCoverage — gone
analysis.summaryBar?.meta.topology — gone
analysis.summaryBar?.meta.strength — gone
Dimension-based gap logic — gone
The fix:
TypeScript
buildGauntletPrompt(
  originalPrompt: string,
  artifact: MapperArtifact,
  narrativeSummary: string,
  userNotes?: string[]
): string {
  
  const claims = artifact.claims || [];
  const edges = artifact.edges || [];
  const ghosts = artifact.ghosts || [];
  
  const consensusClaims = claims.filter(c => c.supporters.length >= 2);
  const outlierClaims = claims.filter(c => c.supporters.length < 2);
  const challengers = claims.filter(c => c.role === 'challenger');
  const conflictEdges = edges.filter(e => e.type === 'conflicts');
  
  const modelCount = Math.max(...claims.flatMap(c => c.supporters), 0);
  
  const consensusBlock = consensusClaims.length > 0
    ? consensusClaims.map(c => 
        `• "${c.text}" [${c.supporters.length}/${modelCount}] — ${c.type}`
      ).join('\n')
    : 'None.';

  const outliersBlock = outlierClaims.length > 0
    ? outlierClaims.map(c => {
        const icon = c.role === 'challenger' ? '⚡' : '○';
        return `${icon} "${c.text}" [${c.supporters.join(',')}]` +
          (c.role === 'challenger' ? ' — FRAME CHALLENGER' : '') +
          (c.challenges ? `\n  Challenges: "${c.challenges}"` : '');
      }).join('\n')
    : 'None.';

  const userNotesBlock = userNotes && userNotes.length > 0
    ? userNotes.map(n => `• ${n}`).join('\n')
    : null;

  return `You are the Gauntlet—the hostile filter where claims come to die or survive.

Every claim that enters your gate is guilty of inadequacy until proven essential. Your task is not to harmonize—it is to eliminate until only approaches with unique solutionary value survive.

---

## The Query
"${originalPrompt}"

## Landscape Shape
${claims.length} claims (${consensusClaims.length} consensus, ${outlierClaims.length} singular)
${conflictEdges.length} conflicts mapped
${challengers.length > 0 ? `⚠️ FRAME CHALLENGERS PRESENT — may kill consensus` : ''}

---

## Step Zero: Define the Optimal End

Before testing anything, answer:
**"What would a successful answer to this query accomplish?"**

State it in one sentence. This is your target. Every claim is tested against whether it advances toward this target.

---

## Consensus (Untested)
${consensusBlock}

## Outliers (Untested)
${outliersBlock}

## Ghosts
${ghosts.length > 0 ? ghosts.map(g => `• ${g}`).join('\n') : 'None identified'}

${userNotesBlock ? `## User Notes (Human Signal)\n${userNotesBlock}\n` : ''}

---

## Elimination Logic: Pairwise Functional Equivalence

For every pair of claims, ask:

> "Does Claim B offer a solutionary dimension toward the optimal end that Claim A cannot cover?"

**If no:** Claim B is redundant. Eliminate it.
**If yes:** Both survive to next round.

---

## The Kill Tests

Apply to every claim. Must pass ALL FOUR to survive:

### TEST 1: ACTIONABILITY
Can someone DO something with this?

### TEST 2: FALSIFIABILITY
Can this be verified or disproven?

### TEST 3: RELEVANCE
Does this advance toward the OPTIMAL END you defined?

### TEST 4: SUPERIORITY
Does this BEAT alternatives, or merely exist alongside them?

---

## The Outlier Supremacy Rule

An outlier can KILL consensus. Popularity is not truth.

If an outlier:
1. Contradicts a consensus claim, AND
2. Passes all four kill tests, AND
3. Provides superior coverage toward optimal end

**THEN:** The outlier kills the consensus claim. Document the kill.

---

## The Verdict

After elimination, what remains?

**The Answer:** Surviving claims synthesized into ONE decisive response.
- Not hedged
- Not conditional (unless the condition is explicit and testable)
- Advances directly toward optimal end

---

## Output

Return valid JSON only:

\`\`\`json
{
  "optimal_end": "What success looks like for this query (one sentence)",

  "the_answer": {
    "statement": "The single, decisive answer that survived the Gauntlet",
    "reasoning": "Why this survived (cite kill tests passed, claims killed)",
    "next_step": "The immediate action the user should take"
  },

  "survivors": {
    "primary": {
      "claim_id": "claim_N",
      "survived_because": "Which tests it passed and why"
    },
    "supporting": [
      { "claim_id": "claim_N", "relationship": "How it supports primary" }
    ]
  },

  "eliminated": [
    {
      "claim_id": "claim_N",
      "killed_by": "TEST 1|2|3|4 or 'Redundant to claim_N' or 'Outlier Supremacy'",
      "reason": "Specific reason"
    }
  ],

  "the_void": "What no surviving claim covers—the gap that remains",

  "confidence": {
    "score": 0.0-1.0,
    "notes": ["Why this score"]
  },

  "artifact_id": "gauntlet-${Date.now()}"
}
\`\`\``;
}
What changed:
No analysis parameter
Compute everything from artifact.claims, artifact.edges, artifact.ghosts
No dimension references
Simpler output (claim_ids instead of repeated text)
Removed verbose slating section (extent, breaking_point, presumptions) — the prompt is cleaner
Refiner Prompt: What's Wrong
Currently okay-ish but:
References "dimensions" in the introductory context
Should just pass the map data cleanly
Minimal change needed:
TypeScript
// Use rich artifact if available
let effectiveMapping = mappingText;
if (mapperArtifact) {
  const claimCount = mapperArtifact.claims?.length || 0;
  const edgeCount = mapperArtifact.edges?.length || 0;
  const ghostCount = mapperArtifact.ghosts?.length || 0;
  effectiveMapping = `[STRUCTURED MAPPING]\nClaims: ${claimCount}\nRelationships: ${edgeCount}\nGhosts: ${ghostCount}\n\n${mappingText}`;
}
The rest of the Refiner prompt is mostly fine—it's about rewriting the analysis output, not about navigating the artifact structure.
Antagonist Prompt: What's Wrong
The mapper audit section references fullOptionsText
This needs to come from the claims now:
TypeScript
// Build options text from claims
const optionsBlock = mapperArtifact?.claims
  ? mapperArtifact.claims.map((c, i) => 
      `${i + 1}. **[${c.label}|${c.id}]**: ${c.text}`
    ).join('\n')
  : '(No claims available)';
Then pass this as fullOptionsText to the antagonist prompt.
The IDE Agent Update
text
## Prompt Alignment Fixes

The downstream prompts (Understand, Gauntlet, Refiner, Antagonist) reference the old MapperArtifact schema. They need to align with V3.

### Remove ExploreAnalysis Dependencies

The old ExploreAnalysis computed dimension coverage, topology labels, container types, and recommendation scores from the V2 artifact. Most of this is gone.

If ExploreAnalysis is still needed, reduce it to:
- claimCount, consensusCount, outlierCount, challengerCount (computed from claims)
- convergenceRatio (consensusCount / claimCount)
- hasChallengers (boolean)

Remove these ExploreAnalysis fields and all references to them:
- containerType
- dimensionCoverage
- summaryBar
- recommendedOutliers

### buildUnderstandPrompt Changes

Remove parameters: graphTopology, optionsInventory (claims serve this purpose), analysis (compute inline)

Add parameter: narrativeSummary (the mapper narrative)

Compute from artifact.claims:
- consensusClaims = claims.filter(c => c.supporters.length >= 2)
- outlierClaims = claims.filter(c => c.supporters.length < 2)
- challengers = claims.filter(c => c.role === 'challenger')
- convergenceRatio = Math.round((consensusClaims.length / claims.length) * 100)

Remove from prompt text:
- All container-aware framing sections
- References to analysis.containerType
- References to dimensions and dimension coverage
- The classification block in output JSON

Add to prompt: Landscape Shape section showing claim counts and convergence ratio.

### buildGauntletPrompt Changes

Remove parameters: analysis

Add parameter: narrativeSummary

Compute from artifact.claims same as Understand.

Remove from prompt text:
- References to analysis.dimensionCoverage
- References to analysis.summaryBar
- References to artifact.topology
- Dimension-based gap logic (gapDimensions)

Build consensusBlock and outliersBlock from claims array filtered by supporters.length.

Simplify output JSON: use claim_id references instead of repeating claim text.

### buildRefinerPrompt Changes

Update the effectiveMapping construction to reference claims, edges, ghosts instead of consensus/outliers.

No other major changes needed—this prompt operates on the synthesis outputs, not the artifact structure.

### buildAntagonistPrompt Changes

Update fullOptionsText construction. It should come from claims:

mapperArtifact.claims.map((c, i) => `${i + 1}. **[${c.label}|${c.id}]**: ${c.text}`).join('\n')

The audit section compares this against raw model outputs—logic is unchanged.

### Type Definition Updates

MapperArtifact is already V3 shape: { claims, edges, ghosts }

ExploreAnalysis should be simplified or removed entirely. If kept:

interface ExploreAnalysis {
  claimCount: number;
  consensusCount: number;
  outlierCount: number;
  challengerCount: number;
  convergenceRatio: number;
  hasChallengers: boolean;
}

Remove these fields from ExploreAnalysis:
- containerType
- dimensionCoverage  
- summaryBar
- recommendedOutliers

### Calling Code Updates

Wherever these prompts are called, ensure the new parameter signature is used. The main changes:
- No analysis parameter for Gauntlet (compute inline)
- No graphTopology or optionsInventory for Understand (use claims)
- narrativeSummary is now a required parameter for Understand and Gauntlet

You're Right on Both Counts
Query Type: Remove It
I was inconsistent. If we can't reliably classify from regex, we shouldn't pretend we can. Remove queryType from ExploreAnalysis entirely.
Answer Type: Compute and Use It
The mapper classifies each claim's type (factual, prescriptive, conditional, contested, speculative). We compute the aggregate—what's the dominant type across the landscape? This becomes the framing signal.
The Computed Landscape Analysis
TypeScript
interface LandscapeAnalysis {
  // Computed from claims
  dominantType: 'factual' | 'prescriptive' | 'conditional' | 'contested' | 'speculative';
  dominantRole: 'anchor' | 'branch' | 'challenger' | 'supplement';
  
  typeDistribution: Record<string, number>;  // { factual: 3, prescriptive: 5, ... }
  roleDistribution: Record<string, number>;  // { anchor: 2, challenger: 3, ... }
  
  // Computed from claims + edges
  convergenceRatio: number;   // claims with ≥2 supporters / total
  conflictCount: number;      // edges where type === 'conflicts'
  hasChallengers: boolean;    // any claim with role === 'challenger'
  
  // Derived shape
  shape: 'settled' | 'branching' | 'contested' | 'exploratory';
}
How shape is derived:
TypeScript
function deriveShape(claims: Claim[], edges: Edge[]): string {
  const dominantType = getDominantType(claims);
  const convergence = getConvergenceRatio(claims);
  const hasChallengers = claims.some(c => c.role === 'challenger');
  const conflictCount = edges.filter(e => e.type === 'conflicts').length;
  
  if (dominantType === 'factual' && convergence > 0.7) return 'settled';
  if (dominantType === 'conditional' || claims.filter(c => c.role === 'branch').length > 2) return 'branching';
  if (hasChallengers || conflictCount > 2 || dominantType === 'contested') return 'contested';
  return 'exploratory';
}
How This Drives Prompt Framing
Understand Prompt
TypeScript
buildUnderstandPrompt(
  originalPrompt: string,
  artifact: MapperArtifact,
  landscape: LandscapeAnalysis,
  narrativeSummary: string,
  userNotes?: string[]
): string {

  // Shape-specific framing
  const shapeFraming = {
    settled: `The landscape is largely settled—high agreement on factual ground. Your task is to present clarity and surface what the consensus might be overlooking. The value is often in the singular claims, not the agreement.`,
    
    branching: `The landscape branches on conditions. Claims fork based on context the user hasn't specified. Your task is to find the governing variable that structures the branches—the question beneath the questions.`,
    
    contested: `The landscape contains genuine disagreement. Frame challengers are present. Your task is not to smooth the tension but to find what the conflict reveals—the deeper structure that makes the disagreement make sense.`,
    
    exploratory: `The landscape is open—speculative, multi-directional, without clear convergence. Your task is to find the organizing principle that gives shape to the possibilities without collapsing them prematurely.`
  };

  // Type-specific guidance for the_one
  const theOneGuidance = {
    factual: `In factual landscapes, the_one is often the fact everyone assumed but no one stated—the foundation beneath the floor.`,
    
    prescriptive: `In prescriptive landscapes, the_one is often the criteria that determines which recommendation wins—the meta-principle.`,
    
    conditional: `In conditional landscapes, the_one is often the governing condition—the branch point that makes everything else fall into place.`,
    
    contested: `In contested landscapes, the_one is often hidden in a challenger—the insight the majority couldn't see.`,
    
    speculative: `In speculative landscapes, the_one is often the constraint that would resolve uncertainty—what we'd need to know to collapse the possibilities.`
  };

  return `You are the Singularity—the convergence point where all perspectives collapse into coherence.

---

## The Query
"${originalPrompt}"

## Landscape Shape
${landscape.shape.toUpperCase()} — ${shapeFraming[landscape.shape]}

Dominant type: ${landscape.dominantType}
Convergence: ${Math.round(landscape.convergenceRatio * 100)}%
Claims: ${artifact.claims.length} (${landscape.roleDistribution.challenger || 0} challengers)
Conflicts: ${landscape.conflictCount}

${narrativeSummary}

## The Map

\`\`\`json
${JSON.stringify({ claims: artifact.claims, edges: artifact.edges, ghosts: artifact.ghosts }, null, 2)}
\`\`\`

${userNotes ? `## User Notes\n${userNotes.map(n => `• ${n}`).join('\n')}\n` : ''}

---

## Your Task: Find the Frame

${shapeFraming[landscape.shape]}

Don't select the strongest argument. Don't average positions. Find the frame where the strongest insights coexist as facets of a larger truth.

---

## Finding The One

${theOneGuidance[landscape.dominantType]}

---

## Output

Return valid JSON:

\`\`\`json
{
  "short_answer": "The frame crystallized. 1-2 paragraphs.",
  "long_answer": "The frame inhabited. 2-4 paragraphs.",
  "the_one": {
    "insight": "The pivot insight",
    "source": "claim_id | 'emergent'",
    "why_this": "Why this holds the frame"
  },
  "the_echo": {
    "position": "What my frame cannot accommodate",
    "source": "claim_id",
    "merit": "Why this persists"
  },
  "artifact_id": "understand-${Date.now()}"
}
\`\`\``;
}
Gauntlet Prompt
TypeScript
buildGauntletPrompt(
  originalPrompt: string,
  artifact: MapperArtifact,
  landscape: LandscapeAnalysis,
  narrativeSummary: string,
  userNotes?: string[]
): string {

  // Shape-specific elimination strategy
  const eliminationStrategy = {
    settled: `The landscape is factual and converged. Facts are hard to eliminate—focus on RELEVANCE and COMPLETENESS. The danger is missing something, not choosing wrong.`,
    
    branching: `The landscape branches on conditions. Test whether conditions are FALSIFIABLE or hedge. Eliminate claims whose conditions cannot be verified. Force clarity on what determines which branch.`,
    
    contested: `The landscape is contested. Conflict is the point. An outlier can kill consensus—apply the Supremacy Rule aggressively. Your job is to force a verdict despite disagreement.`,
    
    exploratory: `The landscape is speculative. Speculation resists elimination. Focus on which claims are ACTIONABLE despite uncertainty. Eliminate claims that defer action indefinitely.`
  };

  // Type-specific kill test emphasis
  const killEmphasis = {
    factual: `Factual claims: Emphasize TEST 3 (RELEVANCE). True but irrelevant facts are noise.`,
    
    prescriptive: `Prescriptive claims: Emphasize TEST 4 (SUPERIORITY). Recommendations must beat alternatives, not just exist.`,
    
    conditional: `Conditional claims: Emphasize TEST 2 (FALSIFIABILITY). "It depends" without testable conditions is hedge.`,
    
    contested: `Contested claims: Emphasize the OUTLIER SUPREMACY RULE. One correct insight can overturn five wrong agreements.`,
    
    speculative: `Speculative claims: Emphasize TEST 1 (ACTIONABILITY). If it can't guide action now, it's not useful now.`
  };

  const claims = artifact.claims;
  const consensusClaims = claims.filter(c => c.supporters.length >= 2);
  const outlierClaims = claims.filter(c => c.supporters.length < 2);

  return `You are the Gauntlet—the hostile filter where claims come to die or survive.

---

## The Query
"${originalPrompt}"

## Landscape Shape
${landscape.shape.toUpperCase()}

${eliminationStrategy[landscape.shape]}

${killEmphasis[landscape.dominantType]}

---

## Step Zero: Define the Optimal End

Before testing anything: **What would a successful answer to this query accomplish?**

State it in one sentence. Every claim is tested against this.

---

## Consensus (Untested)
${consensusClaims.map(c => `• "${c.text}" [${c.supporters.length} models] — ${c.type}`).join('\n') || 'None.'}

## Outliers (Untested)
${outlierClaims.map(c => {
  const icon = c.role === 'challenger' ? '⚡' : '○';
  return `${icon} "${c.text}" [${c.id}]${c.role === 'challenger' ? ' — CHALLENGER' : ''}${c.challenges ? `\n  Challenges: "${c.challenges}"` : ''}`;
}).join('\n') || 'None.'}

## Ghosts
${artifact.ghosts?.map(g => `• ${g}`).join('\n') || 'None identified'}

${userNotes ? `## User Notes\n${userNotes.map(n => `• ${n}`).join('\n')}\n` : ''}

---

## The Kill Tests

### TEST 1: ACTIONABILITY — Can someone DO something with this?
### TEST 2: FALSIFIABILITY — Can this be verified or disproven?
### TEST 3: RELEVANCE — Does this advance toward the optimal end?
### TEST 4: SUPERIORITY — Does this BEAT alternatives?

${landscape.hasChallengers ? `
## Outlier Supremacy Rule

An outlier can KILL consensus. If an outlier:
1. Contradicts a consensus claim, AND
2. Passes all four tests, AND
3. Provides superior coverage toward optimal end

THEN: The outlier kills the consensus claim. Document the kill.
` : ''}

---

## Output

Return valid JSON:

\`\`\`json
{
  "optimal_end": "What success looks like (one sentence)",
  "the_answer": {
    "statement": "The single, decisive answer that survived",
    "reasoning": "Why this survived",
    "next_step": "Immediate action"
  },
  "survivors": {
    "primary": { "claim_id": "claim_N", "survived_because": "..." },
    "supporting": [{ "claim_id": "claim_N", "relationship": "..." }]
  },
  "eliminated": [
    { "claim_id": "claim_N", "killed_by": "TEST N | Redundant | Supremacy", "reason": "..." }
  ],
  "the_void": "What no survivor covers",
  "confidence": { "score": 0.0-1.0, "notes": ["..."] },
  "artifact_id": "gauntlet-${Date.now()}"
}
\`\`\``;
}
The Flow
text
Mapper Output
    ↓
┌─────────────────────────────────────────┐
│ Compute LandscapeAnalysis               │
│                                         │
│ - Count types → dominantType            │
│ - Count roles → dominantRole            │
│ - Compute convergence, conflicts        │
│ - Derive shape                          │
└─────────────────────────────────────────┘
    ↓
Understand/Gauntlet receive:
- artifact (claims, edges, ghosts)
- landscape (computed analysis)
- narrativeSummary
    ↓
Prompts adapt framing based on:
- landscape.shape (settled/branching/contested/exploratory)
- landscape.dominantType (factual/prescriptive/conditional/contested/speculative)
No query type heuristics. The shape of the answers tells us how to handle them.




# Computed Structural Injections

You're right. Don't enumerate variations in the prompt—compute them, then inject precise language.

---

## The Computation Layer

```typescript
interface StructuralInsight {
  key: string;
  text: string;
  placement: 'task_framing' | 'the_one_guidance' | 'echo_guidance' | 'output_emphasis';
}

function computeStructuralInsights(
  claims: Claim[], 
  edges: Edge[], 
  ghosts: string[]
): StructuralInsight[] {
  
  const insights: StructuralInsight[] = [];
  const claimMap = new Map(claims.map(c => [c.id, c]));
  
  const challengers = claims.filter(c => c.role === 'challenger');
  const prerequisites = edges.filter(e => e.type === 'prerequisite');
  const supports = edges.filter(e => e.type === 'supports');
  const tradeoffs = edges.filter(e => e.type === 'tradeoff');
  const conflicts = edges.filter(e => e.type === 'conflicts');
  
  // ═══════════════════════════════════════════════════════════════
  // CHALLENGER PATTERNS
  // ═══════════════════════════════════════════════════════════════
  
  for (const challenger of challengers) {
    // Pattern: Challenger is prerequisite to consensus
    const asPrereq = prerequisites.find(e => e.from === challenger.id);
    if (asPrereq) {
      const downstream = claimMap.get(asPrereq.to);
      if (downstream && downstream.supporters.length >= 2) {
        insights.push({
          key: 'challenger_prerequisite_to_consensus',
          text: `${challenger.label} is a prerequisite to ${downstream.label}. If you accept the consensus position, you implicitly accept what the challenger demands. If you reject the challenger, the consensus loses its foundation.`,
          placement: 'task_framing'
        });
        insights.push({
          key: 'the_one_challenger_prerequisite',
          text: `The challenger may BE the_one—it's the hidden foundation the consensus built on without acknowledging.`,
          placement: 'the_one_guidance'
        });
        continue;
      }
    }
    
    // Pattern: Challenger conflicts with consensus
    const asConflict = conflicts.find(e => 
      e.from === challenger.id || e.to === challenger.id
    );
    if (asConflict) {
      const other = claimMap.get(
        asConflict.from === challenger.id ? asConflict.to : asConflict.from
      );
      if (other && other.supporters.length >= 2) {
        insights.push({
          key: 'challenger_conflicts_consensus',
          text: `${challenger.label} directly conflicts with ${other.label}. One must fall. Apply the supremacy test: does the challenger pass where consensus fails?`,
          placement: 'task_framing'
        });
        continue;
      }
    }
    
    // Pattern: Challenger is standalone (challenges premise, not specific claim)
    insights.push({
      key: 'challenger_standalone',
      text: `${challenger.label} challenges "${challenger.challenges}" but doesn't directly block any consensus claim. It reframes rather than refutes—your frame must either absorb the reframe or explain why the original framing holds.`,
      placement: 'task_framing'
    });
  }
  
  // ═══════════════════════════════════════════════════════════════
  // TRADEOFF PATTERNS
  // ═══════════════════════════════════════════════════════════════
  
  for (const tradeoff of tradeoffs) {
    const from = claimMap.get(tradeoff.from);
    const to = claimMap.get(tradeoff.to);
    if (!from || !to) continue;
    
    const fromIsConsensus = from.supporters.length >= 2;
    const toIsConsensus = to.supporters.length >= 2;
    
    if (fromIsConsensus && toIsConsensus) {
      // Core tension in landscape
      insights.push({
        key: 'tradeoff_core',
        text: `${from.label} and ${to.label} are both consensus positions but trade off against each other. This is the central tension—your frame must explain why this tradeoff exists or resolve it.`,
        placement: 'task_framing'
      });
    } else if (!fromIsConsensus && !toIsConsensus) {
      // Edge exploration
      insights.push({
        key: 'tradeoff_edge',
        text: `${from.label} and ${to.label} represent alternative paths, neither with consensus. The tradeoff is exploratory—your frame can acknowledge it without resolving it.`,
        placement: 'task_framing'
      });
    } else {
      // Consensus vs singular
      const consensus = fromIsConsensus ? from : to;
      const singular = fromIsConsensus ? to : from;
      insights.push({
        key: 'tradeoff_asymmetric',
        text: `${singular.label} trades off against consensus position ${consensus.label}. This singular claim may be the_one—it sees a cost the majority accepted without questioning.`,
        placement: 'the_one_guidance'
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // DEPENDENCY CHAIN PATTERNS
  // ═══════════════════════════════════════════════════════════════
  
  // Find chains: claims that have both incoming and outgoing prerequisites
  const hasOutgoing = new Set(prerequisites.map(e => e.from));
  const hasIncoming = new Set(prerequisites.map(e => e.to));
  const chainNodes = [...hasOutgoing].filter(id => hasIncoming.has(id));
  
  if (chainNodes.length > 0) {
    const chainClaim = claimMap.get(chainNodes[0]);
    insights.push({
      key: 'dependency_chain',
      text: `${chainClaim?.label} sits in a dependency chain—it depends on something and enables something else. Accepting or rejecting it cascades.`,
      placement: 'task_framing'
    });
  }
  
  // Find convergent dependencies (multiple things enable one)
  const incomingCounts = new Map<string, number>();
  prerequisites.forEach(e => {
    incomingCounts.set(e.to, (incomingCounts.get(e.to) || 0) + 1);
  });
  
  for (const [claimId, count] of incomingCounts) {
    if (count >= 2) {
      const claim = claimMap.get(claimId);
      const sources = prerequisites
        .filter(e => e.to === claimId)
        .map(e => claimMap.get(e.from)?.label);
      insights.push({
        key: 'dependency_convergent',
        text: `${claim?.label} depends on multiple claims: ${sources.join(', ')}. It only holds if ALL its prerequisites hold.`,
        placement: 'task_framing'
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SUPPORT REINFORCEMENT PATTERNS
  // ═══════════════════════════════════════════════════════════════
  
  // Find claims with multiple supports (reinforced positions)
  const supportCounts = new Map<string, number>();
  supports.forEach(e => {
    supportCounts.set(e.to, (supportCounts.get(e.to) || 0) + 1);
  });
  
  for (const [claimId, count] of supportCounts) {
    if (count >= 2) {
      const claim = claimMap.get(claimId);
      insights.push({
        key: 'heavily_reinforced',
        text: `${claim?.label} is reinforced by ${count} other claims. It's a load-bearing position—if it falls, the supports become orphaned.`,
        placement: 'task_framing'
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // GHOST PATTERNS
  // ═══════════════════════════════════════════════════════════════
  
  if (ghosts.length > 0 && challengers.length > 0) {
    // Check if ghost relates to challenger's domain
    insights.push({
      key: 'ghost_challenger_territory',
      text: `The ghosts (${ghosts.slice(0, 2).join('; ')}) may be territory the challenger was pointing toward. If ${challengers[0].label} is the_one, the ghosts might be its natural extensions.`,
      placement: 'echo_guidance'
    });
  }
  
  if (ghosts.length > 0) {
    insights.push({
      key: 'ghost_as_echo',
      text: `The ghosts represent what no claim covers. If your frame cannot speak to them, one may be the_echo—the limit of your synthesis.`,
      placement: 'echo_guidance'
    });
  }
  
  return insights;
}
```

---

## The Prompt Assembly

```typescript
buildUnderstandPrompt(
  originalPrompt: string,
  artifact: MapperArtifact,
  landscape: LandscapeAnalysis,
  narrativeSummary: string,
  userNotes?: string[]
): string {

  // Compute structural insights
  const insights = computeStructuralInsights(
    artifact.claims, 
    artifact.edges, 
    artifact.ghosts || []
  );
  
  // Group by placement
  const taskFraming = insights
    .filter(i => i.placement === 'task_framing')
    .map(i => i.text)
    .join('\n\n');
    
  const theOneGuidance = insights
    .filter(i => i.placement === 'the_one_guidance')
    .map(i => i.text)
    .join('\n\n');
    
  const echoGuidance = insights
    .filter(i => i.placement === 'echo_guidance')
    .map(i => i.text)
    .join('\n\n');

  // Shape framing (as before)
  const shapeFraming = {
    settled: `High agreement on factual ground. The value is in what consensus overlooks.`,
    branching: `Claims fork on conditions. Find the governing variable.`,
    contested: `Genuine disagreement exists. Find what the conflict reveals.`,
    exploratory: `Open and speculative. Find the organizing principle.`
  }[landscape.shape];

  return `You are the Singularity—the convergence point where all perspectives collapse into coherence.

---

## The Query
"${originalPrompt}"

## Landscape
${landscape.shape.toUpperCase()} | ${artifact.claims.length} claims | ${Math.round(landscape.convergenceRatio * 100)}% convergence

${shapeFraming}

---

${narrativeSummary}

---

## Structural Tensions

${taskFraming || 'No critical structural tensions detected.'}

---

## Your Task: Find the Frame

Don't select the strongest argument. Don't average positions. Find the frame where the strongest insights coexist as facets of a larger truth.

${userNotes ? `\n## User Notes\n${userNotes.map(n => `• ${n}`).join('\n')}\n` : ''}

---

## The One

The pivot insight that holds your frame together.

${theOneGuidance || 'Look in singular claims and challengers—they often see what consensus missed.'}

---

## The Echo

What your frame cannot accommodate.

${echoGuidance || 'If your frame is too smooth, you may have hidden a blind spot.'}

---

## Output

\`\`\`json
{
  "short_answer": "...",
  "long_answer": "...",
  "the_one": { "insight": "...", "source": "claim_id", "why_this": "..." },
  "the_echo": { "position": "...", "source": "claim_id | ghost", "merit": "..." },
  "artifact_id": "understand-${Date.now()}"
}
\`\`\``;
}
```

---

## Applied to Your Map

**Computed insights for your artifact:**

```typescript
[
  {
    key: 'challenger_prerequisite_to_consensus',
    text: 'Inferred Functional Roles is a prerequisite to Modular Cognitive Lenses. If you accept the consensus position, you implicitly accept what the challenger demands. If you reject the challenger, the consensus loses its foundation.',
    placement: 'task_framing'
  },
  {
    key: 'the_one_challenger_prerequisite',
    text: 'The challenger may BE the_one—it's the hidden foundation the consensus built on without acknowledging.',
    placement: 'the_one_guidance'
  },
  {
    key: 'tradeoff_edge',
    text: 'Ambient Context Ingestion and Recursive Map Depth represent alternative paths, neither with consensus. The tradeoff is exploratory—your frame can acknowledge it without resolving it.',
    placement: 'task_framing'
  },
  {
    key: 'ghost_as_echo',
    text: 'The ghosts represent what no claim covers. If your frame cannot speak to them, one may be the_echo—the limit of your synthesis.',
    placement: 'echo_guidance'
  }
]
```

**Resulting prompt section:**

```
## Structural Tensions

Inferred Functional Roles is a prerequisite to Modular Cognitive Lenses. 
If you accept the consensus position, you implicitly accept what the 
challenger demands. If you reject the challenger, the consensus loses 
its foundation.

Ambient Context Ingestion and Recursive Map Depth represent alternative 
paths, neither with consensus. The tradeoff is exploratory—your frame 
can acknowledge it without resolving it.

---

## The One

The pivot insight that holds your frame together.

The challenger may BE the_one—it's the hidden foundation the consensus 
built on without acknowledging.

---

## The Echo

What your frame cannot accommodate.

The ghosts represent what no claim covers. If your frame cannot speak 
to them, one may be the_echo—the limit of your synthesis.
```

---

## The Pattern Library

| Pattern | Detection | Injection |
|---------|-----------|-----------|
| Challenger → prereq → Consensus | `prereqs.find(e => e.from === challenger.id && isConsensus(e.to))` | "Accepting consensus implicitly accepts challenger" |
| Challenger ⚔ Consensus | `conflicts.find(e => involves(challenger) && involves(consensus))` | "One must fall. Supremacy test." |
| Challenger standalone | No edges to consensus | "Reframes rather than refutes" |
| Tradeoff: consensus ↔ consensus | Both ends have ≥2 supporters | "Core tension—must resolve or explain" |
| Tradeoff: singular ↔ singular | Both ends have 1 supporter | "Exploratory—can acknowledge without resolving" |
| Tradeoff: asymmetric | One consensus, one singular | "Singular may see cost majority accepted" |
| Convergent deps | Multiple prereqs → one claim | "Only holds if ALL prerequisites hold" |
| Chain node | Has both incoming and outgoing prereqs | "Cascades on accept or reject" |
| Heavily reinforced | Multiple supports → one claim | "Load-bearing—if it falls, supports orphaned" |
| Ghost + challenger | Both exist | "Ghosts may be challenger's territory" |

The backend computes which patterns apply, generates the precise text, and injects it. Prompt stays lean.