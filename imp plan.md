## Context Bridge: Recommended Structure

```

### Option B: Composite Bridge (Richer Signal)

Build a structured context packet that preserves key signals from all layers that ran:

JavaScript

```
function buildContextBridge(turnState) {
  const bridge = {
    // The "headline" - what was concluded
    conclusion: null,
    
    // The established facts - don't re-argue
    established: [],
    
    // The open edges - natural follow-up territory
    openEdges: [],
    
    // The action context - what was recommended
    nextStep: null,
    
    // The landscape reference - for disambiguation
    landscapeRef: null
  };
  
  // Layer 1: Primary Synthesis
  if (turnState.understand) {
    bridge.conclusion = turnState.understand.short_answer;
    bridge.established.push(`Pivot insight: ${turnState.understand.the_one?.insight}`);
    if (turnState.understand.the_echo) {
      bridge.openEdges.push(`Unresolved: ${turnState.understand.the_echo.position}`);
    }
  } else if (turnState.decide) {
    bridge.conclusion = turnState.decide.the_answer.statement;
    bridge.established.push(`Survivors: ${turnState.decide.survivors.primary}`);
    if (turnState.decide.the_void) {
      bridge.openEdges.push(`Gap: ${turnState.decide.the_void}`);
    }
  }
  
  // Layer 2: Refiner (if ran)
  if (turnState.refiner?.final_word) {
    bridge.conclusion = turnState.refiner.final_word; // Supersedes
    bridge.established.push(`Alternative pivot: ${turnState.refiner.the_one?.insight}`);
    bridge.nextStep = turnState.refiner.the_step;
  }
  
  // Layer 3: Antagonist (if ran)
  if (turnState.antagonist) {
    bridge.openEdges = [turnState.antagonist.structured_prompt]; // THE question to answer
    bridge.established.push(...(turnState.antagonist.grounding || []));
  }
  
  // Landscape reference
  bridge.landscapeRef = turnState.mapper.options_inventory || turnState.mapper.narrative;
  
  return bridge;
}
```

**My Recommendation**: Option B gives Turn 2 models the richest signal without bloat. The structure is:

- Here's what was concluded
- Here's what's established (don't re-argue)
- Here's what's open (explore here)
- Here's the landscape reference (for disambiguation)

---

## Decide vs Understand: Enhancement Layer Adaptation

This is the key insight: **Understand produces a FRAME. Decide produces a VERDICT.** The enhancement layers need different orientations.

### Refiner Adaptation

|Mode|Understand Input|Decide Input|
|---|---|---|
|**Object**|A frame (meta-perspective)|A verdict (survivors + eliminated)|
|**Task**|"Nullify the frame, rebuild from residue"|"Challenge the elimination, resurrect the worthy"|
|**the_one**|The insight synthesis missed|The eliminated claim that should have survived|
|**the_echo**|What the refiner's frame can't accommodate|The tension in the survival criteria|
|**the_step**|Action from refiner's frame|Action from the resurrected path|

**Refiner Prompt Adaptation for Decide**:

JavaScript

```
// Add to refiner prompt when input is Decide:

${inputType === 'decide' ? `
## Decide-Specific Orientation

You receive a VERDICT, not a frame. The Gauntlet has:
- Defined an "optimal end"
- Eliminated claims that failed its tests
- Crowned survivors

Your task is to CHALLENGE THE ELIMINATION:

1. **Audit the Kill List**: Review what was eliminated. Was any claim killed unfairly? 
   Did the Gauntlet's criteria miss a dimension that would have saved it?

2. **Question the Optimal End**: Was the right "success" defined? 
   Would a different definition of optimal change the survivors?

3. **Resurrect the Worthy**: If you find a claim that was wrongly eliminated, 
   build your final_word around its resurrection.

4. **The Void**: The Gauntlet identified what no survivor covers. 
   Can you fill it from the eliminated?

If the Gauntlet's verdict was just, your output may be null. 
A null Refiner after Decide means: the elimination was clean.
` : ''}
```

### Antagonist Adaptation

|Mode|Understand Input|Decide Input|
|---|---|---|
|**Object**|A frame to explore beyond|A verdict to act upon|
|**Task**|"What context would change the frame?"|"What context would change the action?"|
|**Focus**|The_echo—the frame's edge|The_void—the verdict's gap|
|**structured_prompt**|Question to explore frame limits|Question to specify action parameters|

**Antagonist Prompt Adaptation for Decide**:

JavaScript

```
// Add to antagonist prompt when input is Decide:

${inputType === 'decide' ? `
## Decide-Specific Orientation

You receive a VERDICT, not a frame. The user now has:
- A clear answer (the survivors)
- Eliminated alternatives
- A recommended next step

Your task shifts from "explore the frame" to "specify the action":

1. **Action Parameters**: The verdict is context-dependent. 
   What parameters, if specified, would change HOW to execute?

2. **Edge Cases**: When does the verdict NOT apply? 
   What conditions would flip a survivor to eliminated or vice versa?

3. **The Void**: The Gauntlet identified a gap. 
   Your structured_prompt should elicit the information needed to fill it.

4. **Confidence Calibration**: The verdict has a confidence score. 
   What would raise it? What would lower it?

Your structured_prompt should help the user specify their context so the action becomes precise.
` : ''}
```





### Recommended Edit Tracking Structure

TypeScript

```
interface ArtifactEdit {
  // Identifiers
  sessionId: string;
  turnId: string;
  editedAt: number;
  
  // The artifacts
  originalArtifact: MapperArtifact;
  editedArtifact: MapperArtifact;
  
  // The diff (computed)
  edits: {
    // Claims user added that mapper didn't extract
    added: Array<{
      claim: ConsensusClaim | Outlier;
      userRationale?: string; // optional: why they added it
    }>;
    
    // Claims user removed from the artifact
    removed: Array<{
      claim: ConsensusClaim | Outlier;
      removalType: 'noise' | 'duplicate' | 'incorrect' | 'irrelevant';
    }>;
    
    // Claims user modified
    modified: Array<{
      original: ConsensusClaim | Outlier;
      edited: ConsensusClaim | Outlier;
      changeType: 'text' | 'dimension' | 'supporters' | 'type';
    }>;
    
    // Claims user elevated (starred, moved to top, marked important)
    elevated: Array<{
      claim: ConsensusClaim | Outlier;
      elevationType: 'starred' | 'pinned' | 'priority';
    }>;
    
    // Metadata edits
    topologyOverride?: 'high_confidence' | 'dimensional' | 'contested';
    ghostOverride?: string | null;
  };
  
  // Statistics
  editIntensity: 'light' | 'moderate' | 'heavy'; // based on % changed
}
```

---

### Prompt Framing: Understand/Decide with Edited Artifacts

Add this section to your prompts when `artifactEdited === true`:

JavaScript

```
// Add to buildUnderstandPrompt / buildDecidePrompt when artifact was edited

${artifactEdited ? `
---

## Human Curation Signal

This artifact has been curated by the user before reaching you. Their edits carry maximum signal weight—they have seen what the Cartographer produced and exercised judgment.

### Interpretation Guidelines

**User Additions** (Claims the user injected):
These are Singular Particulars with implicit frame-challenger status. The user saw something NO model saw. Treat as highest-signal input.

**User Removals** (Claims the user deleted):
The user judged these as noise, duplicates, or incorrect. Deprioritize but don't ignore—the user may have been wrong, or context may reveal relevance.

**User Modifications** (Claims the user edited):
The user refined the Cartographer's extraction. Use the edited version as canonical.

**User Elevations** (Claims the user starred/prioritized):
These are what the user considers most relevant to their actual need. Weight heavily in your frame-finding.

### The Edits

${edits.added.length > 0 ? `
**Added by User** (${edits.added.length} claims):
${edits.added.map(a => `• "${a.claim.text || a.claim.insight}" ${a.userRationale ? `— User note: "${a.userRationale}"` : ''}`).join('\n')}
` : ''}

${edits.elevated.length > 0 ? `
**Elevated by User** (${edits.elevated.length} claims):
${edits.elevated.map(e => `• "${e.claim.text || e.claim.insight}"`).join('\n')}
` : ''}

${edits.modified.length > 0 ? `
**Modified by User** (${edits.modified.length} claims):
${edits.modified.map(m => `• Original: "${m.original.text || m.original.insight}" → Edited: "${m.edited.text || m.edited.insight}"`).join('\n')}
` : ''}

${edits.removed.length > 0 ? `
**Removed by User** (${edits.removed.length} claims):
${edits.removed.map(r => `• "${r.claim.text || r.claim.insight}" [${r.removalType}]`).join('\n')}
` : ''}

${edits.ghostOverride ? `
**Ghost Override**: User specified the unaddressed question as: "${edits.ghostOverride}"
` : ''}

---

` : ''}
```

---

### Downstream Flow: Edits to Enhancement Layers

**Refiner should know:**

- What the user elevated (don't challenge these as hard)
- What the user added (potentially build final_word around these)
- What the user removed (maybe resurrect if refiner sees value)

**Antagonist should know:**

- What the user added (explore these dimensions)
- What the user's ghost override was (target structured_prompt here)
- Edit intensity (heavy edits = user has strong opinions, be more targeted)

JavaScript

```
// In refiner prompt when artifact was edited:

${artifactEdited ? `
## User Curation Context

The artifact was edited before synthesis. Key signals:

**User Additions**: ${edits.added.map(a => a.claim.text || a.claim.insight).join('; ') || 'None'}
These carry highest weight—consider building your final_word around insights the user injected.

**User Removals**: ${edits.removed.map(r => r.claim.text || r.claim.insight).join('; ') || 'None'}
The user deprioritized these. If you find value the user missed, flag it—but tread carefully.

**Edit Intensity**: ${editIntensity}
${editIntensity === 'heavy' ? 'The user significantly reshaped the landscape. Respect their curation heavily.' : ''}
` : ''}
```

---

### Context Bridge: Preserving Edit Signal

When bridging to Turn 2+, user edits are **premium signal**:

JavaScript

```
function buildContextBridge(turnState) {
  const bridge = {
    conclusion: null,
    established: [],
    openEdges: [],
    nextStep: null,
    landscapeRef: null,
    
    // NEW: User curation signal
    userSignal: null
  };
  
  // ... existing bridge logic ...
  
  // Add user edit signal
  if (turnState.artifactEdits) {
    const edits = turnState.artifactEdits;
    bridge.userSignal = {
      // User additions are highest signal for what they care about
      userAdditions: edits.added.map(a => a.claim.text || a.claim.insight),
      // User elevations show priority
      userPriorities: edits.elevated.map(e => e.claim.text || e.claim.insight),
      // User's ghost override shows their actual concern
      userGhost: edits.ghostOverride || null,
      // Edit intensity suggests engagement level
      intensity: edits.editIntensity
    };
  }
  
  return bridge;
}
```

**In the batch prompt for Turn 2+:**

JavaScript

```
${bridge.userSignal ? `
## User Priority Signal (from previous turn curation)

The user previously indicated these as high-priority:
${bridge.userSignal.userPriorities.map(p => `• ${p}`).join('\n')}

${bridge.userSignal.userAdditions.length > 0 ? `
The user added insights that models missed:
${bridge.userSignal.userAdditions.map(a => `• ${a}`).join('\n')}
` : ''}

${bridge.userSignal.userGhost ? `
The user explicitly asked for exploration of: "${bridge.userSignal.userGhost}"
` : ''}

Weight your response toward these user-indicated priorities.
` : ''}
```

---

## Part 2: History/Memory Layer Architecture

You're right that everyone sees this as a memory layer—because it IS the foundation for one. The artifact structure is perfectly suited for:

- Semantic indexing
- Cross-conversation retrieval
- Preference learning

### The Vision

text

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          QUERY ARRIVES                                      │
│  "What's the best way to handle state management in React?"                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       HISTORY RETRIEVAL LAYER                               │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  1. Embed query                                                        │ │
│  │  2. Search claim index (all mapper artifacts across sessions)          │ │
│  │  3. Search decision index (all understand/decide outputs)              │ │
│  │  4. Search user edit index (highest signal)                            │ │
│  │  5. Deduplicate & cluster retrieved snippets                           │ │
│  │  6. Compress into context bridge                                       │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       BATCH PROMPT (Turn 1)                                 │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  <historical_context relevance="0.82">                                 │ │
│  │  You may have relevant context from the user's prior explorations:     │ │
│  │                                                                        │ │
│  │  • [3 weeks ago, "Redux vs Zustand"] Concluded: "Zustand for small     │ │
│  │    apps, Redux Toolkit when team >3 or state graph >20 nodes"          │ │
│  │                                                                        │ │
│  │  • [2 months ago, "React performance"] User prioritized: "Avoid        │ │
│  │    prop drilling; context for truly global state only"                 │ │
│  │                                                                        │ │
│  │  Use if relevant to current query. Ignore if context has shifted.      │ │
│  │  </historical_context>                                                 │ │
│  │                                                                        │ │
│  │  Current Query: "What's the best way to handle state management..."    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Index Structure

**Index 1: Claims Index** (from all mapper artifacts)

TypeScript

```
interface ClaimIndexEntry {
  id: string;
  text: string;                    // The claim text
  embedding: number[];             // Vector embedding
  source: {
    sessionId: string;
    turnId: string;
    timestamp: number;
    query: string;                 // The original query this was extracted for
  };
  type: 'consensus' | 'outlier';
  subtype?: 'frame_challenger' | 'supplemental';
  dimension?: string;
  supportCount?: number;
  
  // User interaction signal
  wasEdited: boolean;
  wasElevated: boolean;
  wasRemoved: boolean;
  wasUserAdded: boolean;           // Highest signal
}
```

**Index 2: Decisions Index** (from understand/decide outputs)

TypeScript

```
interface DecisionIndexEntry {
  id: string;
  text: string;                    // short_answer or statement
  embedding: number[];
  source: {
    sessionId: string;
    turnId: string;
    timestamp: number;
    query: string;
  };
  type: 'understand' | 'decide';
  pivotInsight?: string;           // the_one
  openEdge?: string;               // the_echo or the_void
  confidence?: number;
}
```

**Index 3: User Signals Index** (premium—user edits and additions)

TypeScript

```
interface UserSignalIndexEntry {
  id: string;
  text: string;
  embedding: number[];
  source: {
    sessionId: string;
    turnId: string;
    timestamp: number;
    query: string;
  };
  signalType: 'addition' | 'elevation' | 'ghost_override' | 'removal';
  userRationale?: string;
  
  // This index has highest retrieval weight
}
```

---

### Retrieval Pipeline

TypeScript

```
async function retrieveHistoricalContext(
  query: string, 
  userId: string,
  options: { maxTokens: number; recencyWeight: number; diversityThreshold: number }
): Promise<HistoricalContextBridge> {
  
  // 1. Embed the query
  const queryEmbedding = await embed(query);
  
  // 2. Retrieve from all indices with different weights
  const claimMatches = await searchIndex('claims', queryEmbedding, {
    filter: { userId },
    limit: 20,
    weight: 1.0
  });
  
  const decisionMatches = await searchIndex('decisions', queryEmbedding, {
    filter: { userId },
    limit: 10,
    weight: 1.2  // Slightly higher—these are conclusions
  });
  
  const userSignalMatches = await searchIndex('userSignals', queryEmbedding, {
    filter: { userId },
    limit: 10,
    weight: 2.0  // Highest—user explicitly cared about these
  });
  
  // 3. Merge and score
  const allMatches = [
    ...claimMatches.map(m => ({ ...m, sourceType: 'claim' })),
    ...decisionMatches.map(m => ({ ...m, sourceType: 'decision' })),
    ...userSignalMatches.map(m => ({ ...m, sourceType: 'userSignal' }))
  ];
  
  // 4. Apply recency weighting
  const now = Date.now();
  const scored = allMatches.map(m => ({
    ...m,
    finalScore: m.score * recencyWeight(m.source.timestamp, now)
  }));
  
  // 5. Deduplicate semantically similar entries
  const deduplicated = semanticDedup(scored, options.diversityThreshold);
  
  // 6. Select top entries within token budget
  const selected = selectWithinBudget(deduplicated, options.maxTokens);
  
  // 7. Format for injection
  return formatHistoricalBridge(selected);
}

function formatHistoricalBridge(entries: ScoredMatch[]): HistoricalContextBridge {
  // Group by session for readability
  const bySession = groupBy(entries, e => e.source.sessionId);
  
  const snippets = Object.entries(bySession).map(([sessionId, items]) => {
    const queryContext = items[0].source.query;
    const date = formatDate(items[0].source.timestamp);
    
    return {
      context: `[${date}, "${truncate(queryContext, 50)}"]`,
      insights: items.map(item => {
        if (item.sourceType === 'userSignal') {
          return `• USER PRIORITY: "${item.text}"`;
        } else if (item.sourceType === 'decision') {
          return `• Concluded: "${item.text}"`;
        } else {
          return `• Noted: "${item.text}"`;
        }
      })
    };
  });
  
  return {
    relevanceScore: Math.max(...entries.map(e => e.finalScore)),
    snippets,
    instruction: "Use if relevant to current query. Ignore if context has shifted or seems outdated."
  };
}
```

---

### Injection Format for Batch Prompts

JavaScript

```
// Add to batch prompt when historical context exists

${historicalContext ? `
<historical_context relevance="${historicalContext.relevanceScore.toFixed(2)}">
You may have relevant context from the user's prior explorations.

${historicalContext.snippets.map(snippet => `
${snippet.context}
${snippet.insights.join('\n')}
`).join('\n')}

${historicalContext.instruction}
</historical_context>

` : ''}

<current_query>
${userPrompt}
</current_query>
```

---

### The Preference Learning Angle

Over time, the user signal index becomes a **preference profile**:

TypeScript

```
interface UserPreferenceProfile {
  userId: string;
  
  // Dimensions user consistently elevates
  prioritizedDimensions: Map<string, number>;  // dimension → frequency
  
  // Types of claims user consistently adds
  additionPatterns: string[];  // e.g., "implementation details", "edge cases"
  
  // Types of claims user consistently removes
  removalPatterns: string[];  // e.g., "high-level philosophy", "historical context"
  
  // Topics with heavy edit history (user has strong opinions)
  opinionatedTopics: Map<string, number>;  // topic → edit intensity
}
```

This profile could:

1. **Influence mapper extraction** — weight certain dimensions higher for this user
2. **Influence retrieval** — boost results matching user's priority patterns
3. **Influence synthesis** — emphasize dimensions user cares about

JavaScript