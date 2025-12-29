# Singularity: Complete Technical Architecture Specification

---

## Status & Scope

This document maps the current V3 implementation (Cognitive Pipeline) and its intended architecture.

- **Execution truth**: Code behavior is canonical.
- **Doc purpose**: A single end-to-end reference that connects cognitive theory → runtime pipeline → UI.

## Table of Contents

1. Part 0: System Context (Manifest V3 Extension)
2. Part 1: The Cognitive Flow
3. Part 2: Data Contracts (Requests, Artifacts, Messages)
4. Part 3: Backend Runtime (Resolve → Compile → Execute)
5. Part 4: UI Runtime (State → Views → Interactions)
6. Part 5: Persistence & History (IndexedDB)
7. Part 6: Error Resilience (Retries, Degraded Runs)
8. Part 7: Security & Privacy
9. Part 8: Artifact Editing & Signal Preservation
10. Part 9: UI State Machine (Cognitive Halt → Continuations)

---

## Part 0: System Context (Manifest V3 Extension)

Singularity runs as a **Chrome Extension (Manifest V3)** with a React UI and a service-worker backend. The system is intentionally split into:

- **UI (React)**: Renders turns, streams tokens, and hosts all user interaction.
- **Service Worker (Background)**: Owns execution, provider calls, persistence, and canonical IDs.
- **Persistence (IndexedDB)**: Append-only storage for turns, responses, and provider continuation contexts.

### Component Map

```
┌───────────────────────────────┐
│ UI (React)                    │
│ ui/                           │
│ - ChatView / AiTurnBlock      │
│ - CouncilOrbs / DecisionMap   │
│ - Cognitive views             │
└───────────────┬───────────────┘
                │ chrome.runtime.Port
                ▼
┌───────────────────────────────┐
│ Service Worker (MV3)          │
│ src/sw-entry.js               │
│ - connection-handler          │
│ - workflow-engine             │
│ - providers                   │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ IndexedDB (Local)             │
│ src/persistence/              │
│ - turns / responses           │
│ - provider_contexts (hot)     │
└───────────────────────────────┘
```

---

## Part 1: The Cognitive Flow

### Philosophy: Agency & Rigor

The Singularity architecture has evolved from a linear pipeline to a flexible **Cognitive Flow**. This model prioritizes user agency, allowing dynamic navigation between "seeing the landscape" (Mapping), "finding the frame" (Understanding), and "forcing a choice" (Deciding), with optional enhancement layers for rigorous stress-testing.

Rather than a fixed 5-step track, the system operates as an **Epistemic Engine**:
1.  **Foundation**: Broad parallel data harvesting.
2.  **Mapping**: High-fidelity unbiased structuring (Force Directed Graphs, Narrative).
3.  **Discovery**: User chooses the vector of inquiry (Convergent vs Eliminatory).
4.  **Enhancement**: Optional adversarial hardening.

### Layer 1: Foundation (Batch Fan-Out)

#### Purpose
Maximize information diversity through parallel querying of multiple models. The foundation executes for every query, regardless of downstream intent.

#### Providers
| Provider Key | Role | Notes |
|---|---|---|
| `chatgpt` | Reasoning / breadth | OpenAI adapter |
| `claude` | Nuance / framing | Anthropic adapter |
| `gemini` | Speed / general | Gemini adapter |
| `gemini-pro` | Deeper Gemini variant | Gemini adapter (variant) |
| `qwen` | Alternative view | Qwen adapter |

#### Execution (Parallel Fan-Out)
- **Dispatch**: All models receive identical prompts simultaneously.
- **Timing**: Progressive streaming (t=0.5s to t=10s).
- **Context**: Artifact-aware injection from previous turns.

#### Failure Handling
- **Partial Failure**: If ≥2 models succeed, proceed to Mapper.
- **Catastrophic Failure**: If <2 models, offer retry/fallback to raw view.

#### Output
`BatchOutput`: Map of 6 raw model responses (content + metadata).


### Layer 2: Mapper (Epistemic Cartographer)

#### Purpose
Transform raw model outputs into a stable, structured artifact. The Mapper **subsumes the Explorer**, directly producing the "Artifact Showcase"—a rich, navigable map of the problem space.

It performs **Epistemic Cartography**:
- **Consensus Extraction**: What everyone agrees on.
- **Outlier Detection**: Unique high-value signals (Frame Challengers).
- **Topology Mapping**: The shape of the debate (High Confidence vs Dimensional vs Contested).

#### The Three Passes (Logic)
1.  **Consensus**: Identify claims with ≥2 supporters (semantic grouping).
2.  **Outliers**: Identify unique claims, distinguishing "Supplemental" (additive) from "Frame Challengers" (transformative).
3.  **Logic Collapse**: Merge synonyms, prevent false distinctions.

#### Post-Processing: The Rich Structures
The Mapper produces four key actionable structures:
1.  **Narrative**: A cohesive story describing the landscape.
2.  **Graph Topology (Force Directed Graph)**: Visual node-link representation of claims and model support.
3.  **Mapper Artifact**: The rigorous data object (Consensus/Outliers/Metadata).
4.  **Options Inventory**: Complete list of all available paths/options for downstream processing.

#### Metadata Annotation
- **Consensus Quality**: `Resolved` | `Conventional` | `Deflected`
- **Outlier Type**: `Supplemental` | `FrameChallenger`
- **Topology**: `HighConfidence` | `Dimensional` | `Contested`
- **Ghost Detection**: Implicit questions no one answered.

#### Output Schema

```typescript
export interface MapperArtifact {
  consensus: {
    claims: Array<{
      text: string;
      supporters: number[];
      support_count: number;
      dimension?: string;
      applies_when?: string;
    }>;
    quality: "resolved" | "conventional" | "deflected";
    strength: number;
  };
  outliers: Array<{
    insight: string;
    source: string;
    source_index: number;
    type: "supplemental" | "frame_challenger";
    raw_context: string;
    dimension?: string;
    applies_when?: string;
    challenges?: string;
  }>;
  tensions?: Array<{
    between: [string, string];
    type: "conflicts" | "tradeoff";
    axis: string;
  }>;
  dimensions_found?: string[];
  topology: "high_confidence" | "dimensional" | "contested";
  ghost: string | null;
  query: string;
  turn: number;
  timestamp: string;
  model_count: number;
  souvenir?: string;
}
```

### Mapper Output Formats (Narrative, Options, Graph)

The Mapping step produces human-facing content (Narrative + Options inventory) and, optionally, Graph topology. The cognitive pipeline then derives a `MapperArtifact` from that mapping output.

Typical formats:

- **Delimiter-based (legacy)**: `===ALL_AVAILABLE_OPTIONS===` and `===GRAPH_TOPOLOGY===`
- **Unified tagged**: `<raw_narrative>...</raw_narrative>`, `<options_inventory>...</options_inventory>`, `<mapper_artifact>...</mapper_artifact>`, `<graph_topology>...</graph_topology>`

Parsing lives in `shared/parsing-utils.ts`.

### UI Components: The Council Orbs & Decision Map

This layer visualizes the "Council" of models.

#### 1. Anatomy
```
              ◦      ◦      ◉      ◦      ◦      ◦
              │      │      │      │      │      │
        Claude4.5 GPT-5.1  Gemini3 Qwen gemini2.5 Gemini
                          ▲
                    [THE VOICE]
                   (larger, crowned)
```

**Visual Specifications:**
|State|Size|Opacity|Effect|
|---|---|---|---|
|Idle (non-Voice)|6px|40%|None|
|Hover|8px|80%|Model name tooltip|
|Active (streaming)|6px|70%|Subtle pulse|
|The Voice|10px|100%|Golden ring (1px)|
|Error/Timeout|6px|30%|Red tint, no pulse|

#### 2. Reveal Interaction
**Hover on Orb**: Displays confidence/agreement with synthesis.
**Click Orb**: Slide-in panel showing that specific model's raw stream/reasoning.

#### 3. The Decision Map (Center Click)
Clicking the center zone reveals the **Force Directed Graph**:
- **Nodes**: Claims/Positions.
- **Edges**: Support/Conflict relationships.
- **Terrain**: Visual clustering of agreement (Safe consensus vs Edge tension).


#### Failure Handling

text

```
IF Mapper fails:
  
  PRESERVE: Batch outputs (no re-query needed)
  
  DISPLAY:
    Banner: "Synthesis unavailable"
    Content: Raw batch outputs in expandable cards
    Actions: [Retry Mapper] [View raw responses] [Try different model]
    
  PRINCIPLE: User never loses the raw data. Only loses the structured extraction.
```

---

### The Stable Artifact

The Mapper produces **one artifact** that:

1. **All modes consume** — Explore, Understand, and Decide all process the same object
2. **Never changes** — Once extracted, the artifact is immutable for this turn
3. **Is always accessible** — User can view raw artifact regardless of mode output
4. **Enables context bridging** — Can be selected for injection into next turn

text

```
        ┌─────────────────────────────────────────────┐
        │              MAPPER ARTIFACT                │
        │                                             │
        │  consensus: { claims, quality, strength }   │
        │  outliers: [ { insight, source, type } ]    │
        │  topology: "high_confidence" | ...          │
        │  ghost: string | null                       │
        │                                             │
        └─────────────────────────────────────────────┘
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
         EXPLORE       UNDERSTAND       DECIDE
         
         Same input.   Different lens.   Different output.
```

text

````

---

## Part 3: The Interaction Model

### The Artifact Showcase: Point of Agency

Instead of "Explore Mode" generating text, the system presents the **Artifact Showcase** immediately. This is not merely a display; it is the **High-Fidelity User Agency Point**.

**Philosophy**:
- "Ticking artifacts you judge relevant is a higher value signal than any we could give to the LLM."
- "Human judgment enters the system here at maximum fidelity."
- "Everything downstream (Enhancement, Context Bridge, History) benefits from knowing what the user kept vs. ignored."

#### Structure
A visual dashboard presenting the Mapper Artifact:
- **Consensus Cards**: The shared reality.
- **Outlier Cards**: The unique insights (Frame Challengers highlighted).
- **The Graph**: Interactive force-directed representation of the debate.

#### User Actions
From the Showcase, the user chooses their cognitive move:
1.  **Synthesize (Understand)**: "Help me make sense of this map." (Convergent)
2.  **Converge (Decide)**: "Just give me the answer." (Eliminatory)
3.  **Enhance (Challenge)**: "This map is incomplete/wrong." (Adversarial)

The user can always double back, add contexts, or choose a different direction.

---

## Part 4: Primary Synthesis (Parallel Tracks)

The user chooses one of two mutually exclusive directions. The input to these modes is now the **User-Edited Mapper Artifact** (reflecting any selection/deselection in the Showcase).

### Mode A: Understand (Convergent)

#### Purpose
Frame-finding. Searches for the meta-perspective where all strongest insights coexist.
**Ideal For**: "Explain", "Why", "Help me understand", "Conflict resolution".

#### Input
- User Prompt
- **Edited** Mapper Artifact (Consensus + Outliers)

#### Logic
1.  **Tension Identification**: Treat conflicts as clues.
2.  **Frame Search**: Find the perspective where conflicts became complementary.
3.  **The One**: The single pivot insight.
4.  **The Echo**: The strongest contrarian view that persists outside the frame.

#### Stage 1: Tension Identification

text

```
FOR each pair of claims in artifact:
  
  IF claims conflict:
    → Ask: "What if both are right from different angles?"
    → Identify the variable that separates them (Time? Scale? Values?)
    
  IF claims are orthogonal:
    → Ask: "What larger system contains both?"
```

#### Stage 2: Frame Search

The frame is the "unifying theory" of the artifact.

text

```
CRITERIA FOR A VALID FRAME:
1. Explains the consensus (the floor)
2. Explains the outliers (the variance)
3. Resolves the identified tensions (not by picking a side, but by contextualizing)
```

#### Stage 3: The One

The core insight, extracted.

text

```
THE ONE:
  → The pivot point of the frame
  → If you removed this insight, the frame collapses
  → May come from consensus (obvious in hindsight)
  → May come from outlier (the key that unlocked the frame)
  → May be emergent (not explicitly stated by any model)

FORMAT:
  {
    insight: "The actual insight in one sentence",
    source: ModelName | null,  // null if emergent
    why_this: "Why this insight frames everything else"
  }
```

#### Stage 4: The Echo

Identify the strongest contrarian position that survives.

text

```
THE ECHO:
  → A position that doesn't fit the frame
  → But has genuine merit
  → Worth considering even after understanding the frame
  → Usually from a frame-challenger outlier
  → Included only when it genuinely challenges, not decoratively
  
FORMAT:
  {
    position: "The contrarian position",
    source: ModelName,
    merit: "Why this is worth holding onto"
  }
  
NOTE: null most of the time. Only populate when there's real tension.
```

#### Output Schema

```typescript
interface UnderstandOutput {
  short_answer: string;
  long_answer: string;
  the_one: {
    insight: string;
    source: string | null;
    why_this: string;
  } | null;
  the_echo: {
    position: string;
    source: string;
    merit: string;
  } | null;
  souvenir: string;
  artifact_id: string;
}
```

### Mode B: Decide (Gauntlet / Eliminatory)

#### Purpose
Closure. Subjecting every claim to hostile scrutiny against an "Optimal End".
**Ideal For**: "What should I do", "Pick one", "Action needed".

#### Input
- User Prompt
- **Edited** Mapper Artifact

#### Logic
1.  **Define Optimal End**: What does success look like?
2.  **Stress Test**: Attack consensus and outliers against specificity, robustness, and optimality.
3.  **Elimination**: Kill anything that fails.
4.  **Verdict**: The survivor is the answer.

#### Stage 1: Define the Optimal End

Before stress-testing, the Gauntlet establishes what "optimal" means for this query.
*Example: "Should I use React?" -> Optimal End: Maximize speed-to-market given startup constraints.*

#### Stage 2: Stress-Testing

Each claim (Consensus & Outliers) is tested against:
1.  **Specificity**: Is it actionable?
2.  **Robustness**: Does it hold across contexts?
3.  **Optimality**: Does it advance the Optimal End?
4.  **Superiority (Outliers)**: Does it BEAT consensus?

#### Stage 3: Head-to-Head Resolution

If multiple claims survive:
- Which has fewer failure conditions?
- Which is more actionable?

#### Stage 4: Formulate The Answer

The Answer is not a summary. It is **what remains standing**.
*Pattern: "Do X. Here's why. Next step."*

#### Output Schema

```typescript
interface GauntletOutput {
  the_answer: {
    statement: string;      // Clear, direct, actionable
    reasoning: string;      // Why this survived
    next_step: string;      // Immediate action
  };
  survivors: {
    primary: { claim: string; survived_because: string; };
    supporting: Array<{ claim: string; relationship: string; }>;
    conditional: Array<{ claim: string; condition: string; }>;
  };
  eliminated: {
    from_consensus: Array<{ claim: string; killed_because: string; }>;
    from_outliers: Array<{ claim: string; source: string; killed_because: string; }>;
    ghost: string | null;
  };
  confidence: {
    score: number;
    display: string; // "●●●●○"
    notes: string[];
  };
  souvenir: string;
}
```

---

## Part 5: Enhancement Layers

This optional layer applies constructive adversarial pressure *after* Synthesis.

### Challenge (Refiner) Mode
**Role**: The Editor.
**Cognitive Stance**: "This is good, but is it true? Is it complete?"

#### Adaptation by Input Mode
**If Input is UNDERSTAND (Frame):**
- **Task**: "Nullify the frame, rebuild from residue."
- **The One**: The insight synthesis missed.
- **The Echo**: What the refiner's frame can't accommodate.

**If Input is DECIDE (Verdict):**
- **Task**: "Challenge the elimination, resurrect the worthy."
- **Audit**: Review the Kill List. Was anything killed unfairly?
- **Question**: Was the "Optimal End" defined correctly?
- **Resurrect**: If a claim was wrongly eliminated, build the `final_word` around it.

### Next (Antagonist) Mode
**Role**: The Realist.
**Cognitive Stance**: "This works in theory. What about reality?"

#### Adaptation by Input Mode
**If Input is UNDERSTAND (Frame):**
- **Task**: Explore the frame's limits.
- **Prompt**: Construct a question (`structured_prompt`) that pushes the user to the edge of this frame.

**If Input is DECIDE (Verdict):**
- **Task**: Specify action parameters.
- **Edge Cases**: When does this verdict NOT apply?
- **The Void**: The Gauntlet identified a gap; the Antagonist asks the question to fill it.

---

## Part 6: Context Bridge (Composite)

The system builds a structured context packet to preserve key signals for the next turn.

### Structure: Option B (Composite Bridge)

```javascript
{
  // The "headline" - what was concluded
  conclusion: string | null,
  
  // The established facts - don't re-argue
  established: string[],
  
  // The open edges - natural follow-up territory
  openEdges: string[],
  
  // The action context
  nextStep: string | null,
  
  // The landscape reference - for disambiguation
  landscapeRef: string | null,
  
  // User Signal (Premium)
  userSignal: {
    userAdditions: string[],
    userPriorities: string[],
    userGhost: string | null
  }
}
```

This ensures Turn 2 models receive not just the text of the answer, but the **structural conclusion**, **unresolved tensions**, and **user priorities**.

---

## Part 7: History & Memory Architecture

The history layer serves as the foundation for long-term preference learning and semantic retrieval.

### The Vision
A "History Retrieval Layer" sits between the User and the Batch Layer. It intercepts the query and injects relevant context from deep history.

### Index Structure
1.  **Claims Index**: All consensus/outlier claims from Mapper Artifacts.
2.  **Decisions Index**: All `short_answer` (Understand) and `the_answer` (Decide) outputs.
3.  **User Signals Index (Premium)**: All user edits, additions, and elevations.

### Retrieval Pipeline
1.  **Embed**: Vectorize current query.
2.  **Search**: Query all indices (User Signal Index has highest weight).
3.  **Merge & Dedup**: Combine results.
4.  **Format**: Inject into Batch Prompt as `<historical_context>`.

### Preference Learning
Over time, the **User Signals Index** builds a "Preference Profile":
- **Prioritized Dimensions**: What does the user constantly filter for? (e.g., "Privacy", "Speed").
- **Opinionated Topics**: Areas with heavy edit intensity.

---

## Part 8: Artifact Editing & Signal Preservation

User edits to the artifact are the highest-fidelity signal in the system.

### Edit Schema (`ArtifactEdits`)

Artifact edits are stored per turn in UI state and applied as a pure transformation.

```typescript
export interface ArtifactEdits {
  turnId: string;
  timestamp: number;
  consensusEdits: Array<{ index: number; edited: Partial<MapperArtifact['consensus']['claims'][0]>; userNote?: string }>;
  outlierEdits: Array<{ index: number; edited: Partial<MapperArtifact['outliers'][0]>; userNote?: string }>;
  tensionEdits: Array<{ index: number; edited: Partial<NonNullable<MapperArtifact['tensions']>[0]> }>;
  ghostEdit: string | null;
  deletedClaimIndices: number[];
  deletedOutlierIndices: number[];
  deletedTensionIndices: number[];
  userNotes: string[];
}
```

### Application Model

The UI computes a `modifiedArtifact = applyEdits(mapperArtifact, edits)` and uses that as the working surface for:

- Container rendering (Direct Answer / Decision Tree / Comparison Matrix / Exploration Space)
- Claim/outlier selection for continuations

Edits are captured as **high-fidelity user signal** and should be injected into downstream mode prompts when available.

---


---

## Part 9: UI State Machine

This state machine describes the V3 “cognitive halt” UX: the backend stops after Mapping, emits artifacts, then waits for a user-selected continuation.

### Primary UI Phases

```
┌────────────────────┐
│ idle               │
└─────────┬──────────┘
          │ Send
          ▼
┌────────────────────┐
│ running            │  streams: PARTIAL_RESULT
│ (batch/mapping/...)│  updates: WORKFLOW_PROGRESS
└─────────┬──────────┘
          │ MAPPER_ARTIFACT_READY
          ▼
┌──────────────────────────────────────┐
│ awaiting_action                      │
│ - show ArtifactShowcase              │
│ - show DecisionMapSheet (optional)   │
└─────────┬───────────────┬────────────┘
          │               │
          │ Understand     │ Decide (Gauntlet)
          ▼               ▼
┌────────────────┐   ┌────────────────┐
│ continuing      │   │ continuing      │
│ (understand)    │   │ (gauntlet)      │
└───────┬────────┘   └───────┬────────┘
        │ WORKFLOW_STEP_UPDATE          
        ▼                               
┌──────────────────────────────────────┐
│ awaiting_action                      │
│ - show UnderstandOutputView          │
│ - show GauntletOutputView            │
└──────────────────────────────────────┘
```

### Backend ↔ UI Message Flow (Cognitive Halt)

```
UI                                  SW (backend)
│                                       │
│ EXECUTE_WORKFLOW (initialize/extend)  │
│──────────────────────────────────────▶│
│                                       │
│◀──────────── TURN_CREATED             │
│◀──────────── PARTIAL_RESULT (batch)   │
│◀──────────── WORKFLOW_STEP_UPDATE     │
│◀──────────── PARTIAL_RESULT (mapping) │
│◀──────────── WORKFLOW_STEP_UPDATE     │
│◀──────────── MAPPER_ARTIFACT_READY    │
│◀──────────── WORKFLOW_COMPLETE        │  haltReason=cognitive_exploration_ready
│                                       │
│ (user selects lens + optional artifacts)
│ CONTINUE_COGNITIVE_WORKFLOW           │
│──────────────────────────────────────▶│
│◀──────────── PARTIAL_RESULT (mode)    │
│◀──────────── WORKFLOW_STEP_UPDATE     │  meta.{understandOutput|gauntletOutput}
│◀──────────── TURN_FINALIZED           │
└───────────────────────────────────────┘
```

### Canonical Storage During Halt

On `MAPPER_ARTIFACT_READY`, the backend persists enough state to allow later continuations without re-running Batch or Mapping:

- `AiTurn.mapperArtifact`
- `AiTurn.exploreAnalysis`
- Frozen Mapping output (narrative/options/graph) and provider contexts

This is implemented by the cognitive runtime handler in `src/core/execution/CognitivePipelineHandler.js`.

---
