# Singularity: Complete Technical Architecture Specification

---

## Part 1: Foundation Layers

Markdown

```
## Foundation Layers

The foundation executes for every query, regardless of which cognitive mode the user selects. It produces the stable artifact that all modes process.

---

### Layer 1: Batch (Fan-Out)

#### Purpose

Maximize information diversity through parallel querying of multiple models.

#### Providers

| Provider | Model | Characteristics |
|----------|-------|-----------------|
| OpenAI | GPT-4 | Strong reasoning, broad knowledge |
| Anthropic | Claude | Nuanced analysis, careful hedging |
| Google | Gemini | Multimodal awareness, recency |
| Alibaba | Qwen | Alternative training perspective |
| DeepSeek | DeepSeek | Technical depth, coding strength |
| Perplexity | pplx-api | Search-augmented, citation-rich |

#### Execution
```

DISPATCH:  
→ All 6 models receive identical prompt  
→ Parallel execution (no sequential dependencies)  
→ Progressive streaming (responses appear as they arrive)

TIMING:  
t=0.0s Query dispatched to all providers  
t=0.5s First model begins streaming (typically GPT or Claude)  
t=3.0s Majority of models complete  
t=8-10s Slowest model completes (typically search-augmented)

CONTEXT INJECTION:  
Turn 1: Prompt only  
Turn 2+: Prompt + user-selected artifacts from previous turn

text

````

#### Failure Handling

```typescript
interface BatchResult {
  responses: Map<ModelId, Response>;
  failures: Map<ModelId, Error>;
  success_count: number;
}

// Minimum viable threshold
if (batch.success_count >= 2) {
  proceed_to_mapper(batch.responses);
} else if (batch.success_count === 1) {
  display_single_response(batch.responses);
  offer_retry();
} else {
  display_error("No models responded. Please retry.");
}
````

#### Output

TypeScript

```
interface BatchOutput {
  responses: Array<{
    model_id: string;
    model_name: string;
    content: string;
    latency_ms: number;
    token_count: number;
  }>;
  query: string;
  turn: number;
  timestamp: string;
}
```

---

### Layer 2: Mapper (Triage + Semantic Logic)

#### Purpose

Transform raw model outputs into a stable, structured artifact through lossless extraction and intelligent grouping.

#### The Three Passes

##### Pass 1: Consensus Extraction

Identify claims where two or more models agree in essence.

text

```
FOR each claim across all 6 outputs:
  
  DETECT AGREEMENT:
    → Not matching words—matching meaning
    → "Use bcrypt" and "bcrypt is recommended" = SAME claim
    → "Use bcrypt" and "use strong hashing" = DIFFERENT (specific vs general)
    
  IF ≥2 models express this claim in essence:
    → Add to consensus
    → Record supporting model indices
    → Track support count
    
OUTPUT: Raw consensus claims with supporter lists
```

##### Pass 2: Outlier Extraction

Identify unique claims from each model—what they said that no other model said.

text

```
FOR each model output individually:
  FOR each claim in this output:
    
    CHECK UNIQUENESS:
      → Did any other model express this in essence?
      → Not matching words—matching meaning
      
    IF unique to this model:
      → This is an outlier
      → Attribute to source model
      → Preserve raw context (10-20 surrounding words)
      
OUTPUT: Outliers with attribution and context
```

##### Pass 3: Semantic Logic Collapse

Prevent false distinctions from synonyms and false merges from surface similarity.

text

```
FOR each pair of claims (across consensus AND outliers):
  
  QUESTION: "Are these functionally equivalent?"
  
  FUNCTIONAL EQUIVALENCE TEST:
    → "If I implemented Claim A and Claim B, would I be doing 
       the same thing or different things?"
       
  EXAMPLES:
    "potassium" vs "potash" → SAME (chemical equivalence)
    "use bcrypt" vs "use password hashing" → DIFFERENT (specific vs general)
    "increase protein" vs "eat more meat" → DIFFERENT (superset vs subset)
    "REST API" vs "RESTful endpoints" → SAME (terminology variance)
    
  IF functionally equivalent:
    → Collapse to single claim
    → Keep strongest articulation
    → Merge supporter/attribution lists
    
  IF NOT functionally equivalent:
    → Keep separate
    → Even if words are similar
    
OUTPUT: Semantically collapsed claims (true distinctions only)
```

#### Metadata Annotation

After three passes, annotate the artifact with structural metadata:

##### Consensus Quality

TypeScript

```
type ConsensusQuality = "resolved" | "conventional" | "deflected";
```

|Quality|Meaning|Example|Routing|
|---|---|---|---|
|**Resolved**|Factual agreement, floor IS the answer|"The capital of France is Paris"|Escape velocity or any mode|
|**Conventional**|Best practice agreement, floor is baseline|"Use bcrypt for passwords"|Any mode|
|**Deflected**|Agreement that context is needed|"Depends on your budget and timeline"|Clarification screen|

##### Outlier Type

TypeScript

```
type OutlierType = "supplemental" | "frame_challenger";
```

For each outlier, binary classification:

text

```
QUESTION: "Does this fundamentally reframe or invalidate the consensus floor,
           or does it add supplemental detail?"

SUPPLEMENTAL:
  → Adds nuance, edge case, or additional consideration
  → Does not challenge the floor's validity
  → Example: Floor = "use bcrypt", Outlier = "consider Argon2 for memory-hard needs"
  
FRAME_CHALLENGER:
  → Reframes the entire problem
  → Suggests the floor is answering the wrong question
  → Example: Floor = "use bcrypt", Outlier = "passwordless auth eliminates this problem"
```

##### Artifact Topology

TypeScript

```
type Topology = "high_confidence" | "dimensional" | "contested";
```

|Topology|Criteria|Implication|
|---|---|---|
|**High Confidence**|Consensus strength ≥0.8, few outliers, no frame-challengers|Strong agreement, answer is clear|
|**Dimensional**|Moderate consensus, outliers cluster by dimension (cost, speed, risk)|Comparison-appropriate, trade-offs exist|
|**Contested**|Weak consensus, scattered outliers, possible frame-challengers|Multiple paradigms, no clear answer|

text

```
CALCULATION:

if (consensus.strength >= 0.8 && 
    outliers.filter(o => o.type === "frame_challenger").length === 0) {
  topology = "high_confidence";
}
else if (outliers cluster by identifiable dimensions) {
  topology = "dimensional";
}
else {
  topology = "contested";
}
```

##### Ghost Detection (Optional)

text

```
QUESTION: "What question is implied by the query that NO model addressed?"

IF gap exists:
  → Note as "ghost" field
  → May surface in UI: "Interestingly, none of the models addressed [gap]"
  
IF no gap detected:
  → ghost: null
```

#### Output Schema

TypeScript

```
interface MapperArtifact {
  // Consensus
  consensus: {
    claims: Array<{
      text: string;
      supporters: number[];      // Model indices [0-5]
      support_count: number;
    }>;
    quality: "resolved" | "conventional" | "deflected";
    strength: number;            // 0-1, ratio of agreement
  };
  
  // Outliers
  outliers: Array<{
    insight: string;
    source: string;              // Model name
    source_index: number;        // Model index
    type: "supplemental" | "frame_challenger";
    raw_context: string;         // 10-20 words for verification
  }>;
  
  // Metadata
  topology: "high_confidence" | "dimensional" | "contested";
  ghost: string | null;
  
  // Provenance
  query: string;
  turn: number;
  timestamp: string;
  model_count: number;           // How many models responded
}
```

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

## Part 3A: Explore Mode (Triage)

```markdown
## 3A: Explore Mode (Triage)

### Purpose & Philosophy

Explore mode exists for users in the **divergent phase** of thinking—when they need to see the landscape before making judgments.

When a user selects Explore, they are saying:
- "Show me what's out there"
- "I'll decide what matters"
- "Don't collapse the options yet"

Explore mode takes the stable artifact and organizes it for human curation. It does not synthesize, frame, or eliminate. It **displays with intelligence**—grouping, highlighting, and structuring so the user can navigate efficiently.

---

### The Cognitive Stance
````

UNDERSTAND says: "Here's how to think about this."  
DECIDE says: "Here's what survives scrutiny."  
EXPLORE says: "Here's everything that exists. You choose."

text

````

Explore mode maximizes optionality at the cost of decisiveness. It trusts user agency over system judgment.

---

### Input

Explore receives the Mapper Artifact unchanged:

```typescript
interface ExploreInput {
  artifact: MapperArtifact;
  query: string;
  context?: SelectedArtifact[];  // Optional: from previous turns
}
````

---

### Processing Logic

#### Stage 1: Query Type Classification

Determine how the user is likely to consume this information:

text

```
PATTERNS:

"What is..." / "Define..." / "Explain..."
  → INFORMATIONAL
  
"How do I..." / "Steps to..." / "Guide for..."
  → PROCEDURAL
  
"Should I..." / "What's best..." / "Recommend..."
  → ADVISORY
  
"Compare..." / "X vs Y..." / "Difference between..."
  → COMPARATIVE
  
"What if..." / "Will X happen..." 
  → PREDICTIVE
  
"Write..." / "Create..." / "Brainstorm..."
  → CREATIVE
```

#### Stage 2: Artifact Shape Analysis

Cross-reference query type with artifact topology:

text

```
MATRIX:

Query Type      × Topology        → Container
─────────────────────────────────────────────
INFORMATIONAL   × High Confidence → Direct Answer
INFORMATIONAL   × Contested       → Exploration Space
PROCEDURAL      × High Confidence → Direct Answer
PROCEDURAL      × Dimensional     → Decision Tree
ADVISORY        × High Confidence → Direct Answer
ADVISORY        × Dimensional     → Decision Tree
ADVISORY        × Contested       → Exploration Space
COMPARATIVE     × Any             → Comparison Matrix
CREATIVE        × Any             → Exploration Space
PREDICTIVE      × High Confidence → Direct Answer
PREDICTIVE      × Contested       → Exploration Space
```

#### Stage 3: Container Selection

Based on classification and artifact shape, route to one of four containers:

text

```
DIRECT ANSWER
  → When: High confidence, resolved consensus
  → Shows: The floor as the answer, outliers as footnotes
  
DECISION TREE
  → When: Conventional consensus with conditional outliers
  → Shows: Default path + branching conditions
  
COMPARISON MATRIX
  → When: Dimensional topology, multiple valid approaches
  → Shows: Axes of comparison, trade-offs, dimension winners
  
EXPLORATION SPACE
  → When: Contested topology, creative queries, multiple paradigms
  → Shows: All approaches as equal cards, no default
```

---

### The Four Containers

#### Container 1: Direct Answer

**When:** High confidence + Resolved consensus, few/no meaningful outliers

**Structure:**

text

```
┌─────────────────────────────────────────────────────────────────┐
│  THE ANSWER                                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│  [Consensus as clean, direct statement]                         │
│                                                                 │
│  ───────────────────────────────────────────────────────────    │
│  ADDITIONAL CONTEXT                                             │
│  • [Supplemental outlier 1] — [source]                          │
│  • [Supplemental outlier 2] — [source]                          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📋 "[Souvenir]"                                        [Copy]  │
├─────────────────────────────────────────────────────────────────┤
│  See differently: [Decision Tree] [Comparison] [Full Landscape] │
└─────────────────────────────────────────────────────────────────┘
```

**Souvenir Formula:**

text

```
"[Consensus statement]."
```

---

#### Container 2: Decision Tree

**When:** Conventional consensus + conditional outliers, "should I" queries

**Structure:**

text

```
┌─────────────────────────────────────────────────────────────────┐
│  THE DEFAULT PATH                                               │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│  [Consensus as baseline recommendation]                         │
│                                                                 │
│  ───────────────────────────────────────────────────────────    │
│  BUT IF YOUR SITUATION IS...                                    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ IF [Condition A]:                                          │ │
│  │ → [Outlier path A]                             — [source]  │ │
│  │ Because: [why this changes the calculus]                   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ IF [Condition B]:                                          │ │
│  │ → [Outlier path B]                             — [source]  │ │
│  │ Because: [why this changes the calculus]                   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ───────────────────────────────────────────────────────────    │
│  ⚡ FRAME-CHALLENGER (if exists)                                │
│  One perspective suggests: [reframe]              — [source]   │
│  Worth considering if: [condition]                              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📋 "[Default], unless [condition], then [alt]."       [Copy]  │
├─────────────────────────────────────────────────────────────────┤
│  See differently: [Direct Answer] [Comparison] [Full Landscape] │
└─────────────────────────────────────────────────────────────────┘
```

**Souvenir Formula:**

text

```
"[Consensus], unless [key condition], in which case [outlier path]."
```

---

#### Container 3: Comparison Matrix

**When:** Dimensional topology, explicit comparison query, trade-offs exist

**Structure:**

text

```
┌─────────────────────────────────────────────────────────────────┐
│  THE TRADE-OFF LANDSCAPE                                        │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│  There's no single best. It depends on your priority:           │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ DIMENSION: [Speed]                                         │ │
│  │ Winner: [Approach X]                         — [sources]   │ │
│  │ Trade-off: [what you sacrifice for speed]                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ DIMENSION: [Cost]                                          │ │
│  │ Winner: [Approach Y]                         — [sources]   │ │
│  │ Trade-off: [what you sacrifice for low cost]               │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ DIMENSION: [Simplicity]                                    │ │
│  │ Winner: [Approach Z]                         — [sources]   │ │
│  │ Trade-off: [what you sacrifice for simplicity]             │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ───────────────────────────────────────────────────────────    │
│  QUICK MATRIX                                                   │
│  ┌────────────┬───────┬──────┬────────────┐                    │
│  │ Approach   │ Speed │ Cost │ Simplicity │                    │
│  ├────────────┼───────┼──────┼────────────┤                    │
│  │ [X]        │ ★★★   │ ★    │ ★★         │                    │
│  │ [Y]        │ ★     │ ★★★  │ ★★         │                    │
│  │ [Z]        │ ★★    │ ★★   │ ★★★        │                    │
│  └────────────┴───────┴──────┴────────────┘                    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📋 "Depends: [Dim A] → [X], [Dim B] → [Y]."           [Copy]  │
├─────────────────────────────────────────────────────────────────┤
│  What's YOUR priority? [Speed] [Cost] [Simplicity] [Other]      │
└─────────────────────────────────────────────────────────────────┘
```

**Souvenir Formula:**

text

```
"Depends on priority: [Dimension A] → [Option X], [Dimension B] → [Option Y]."
```

---

#### Container 4: Exploration Space

**When:** Contested topology, creative queries, no clear default

**Structure:**

text

```
┌─────────────────────────────────────────────────────────────────┐
│  THE LANDSCAPE                                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│  No consensus here. Multiple paradigms exist:                   │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ PARADIGM: [Name/Label]                        — [source]   │ │
│  │ Core idea: [Brief articulation]                            │ │
│  │ Best for: [Context where this shines]                      │ │
│  │                                            [Explore →]     │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ PARADIGM: [Name/Label]                        — [source]   │ │
│  │ Core idea: [Brief articulation]                            │ │
│  │ Best for: [Context where this shines]                      │ │
│  │                                            [Explore →]     │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ PARADIGM: [Name/Label]                        — [source]   │ │
│  │ Core idea: [Brief articulation]                            │ │
│  │ Best for: [Context where this shines]                      │ │
│  │                                            [Explore →]     │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ───────────────────────────────────────────────────────────    │
│  💡 WHAT UNITES THEM                                            │
│  Despite divergence, all approaches share: [common thread]      │
│                                                                 │
│  👻 GAP (if detected)                                           │
│  Interestingly, none addressed: [ghost]                         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📋 "No consensus. Paradigms: [1], [2], [3]."          [Copy]  │
├─────────────────────────────────────────────────────────────────┤
│  Narrow it down: [I need to decide] [Help me understand]        │
└─────────────────────────────────────────────────────────────────┘
```

**Souvenir Formula:**

text

```
"No consensus. Key paradigms: [Paradigm 1], [Paradigm 2], [Paradigm 3]."
```

---

### Output Schema

TypeScript

```
interface ExploreOutput {
  // Container selection
  container: "direct_answer" | "decision_tree" | "comparison_matrix" | "exploration_space";
  
  // Content varies by container
  content: DirectAnswerContent | DecisionTreeContent | ComparisonContent | ExplorationContent;
  
  // Always present
  souvenir: string;
  
  // Alternative containers available
  alternatives: Array<{
    container: string;
    label: string;
  }>;
  
  // Showcase reference
  artifact_id: string;
}

interface DirectAnswerContent {
  answer: string;
  additional_context: Array<{
    text: string;
    source: string;
  }>;
}

interface DecisionTreeContent {
  default_path: string;
  conditions: Array<{
    condition: string;
    path: string;
    source: string;
    reasoning: string;
  }>;
  frame_challenger?: {
    position: string;
    source: string;
    consider_if: string;
  };
}

interface ComparisonContent {
  dimensions: Array<{
    name: string;
    winner: string;
    sources: string[];
    tradeoff: string;
  }>;
  matrix: {
    approaches: string[];
    dimensions: string[];
    scores: number[][];  // [approach][dimension]
  };
}

interface ExplorationContent {
  paradigms: Array<{
    name: string;
    source: string;
    core_idea: string;
    best_for: string;
  }>;
  common_thread?: string;
  ghost?: string;
}
```

---

### Container Pivot

Users can reframe without reprocessing:

text

```
User viewing Comparison Matrix clicks [Decision Tree]:
  → Same artifact
  → Rerender as tree with conditions
  → Most popular dimension-winner becomes default path
  → Other dimension-winners become conditional branches
  → Instant, no API call
```

**Pivot Logic:**

|From|To|Transformation|
|---|---|---|
|Direct → Tree|Add conditions from supplemental outliers||
|Direct → Matrix|Invent dimensions from outlier variance||
|Direct → Exploration|Elevate all outliers to paradigm cards||
|Tree → Direct|Collapse to default path only||
|Tree → Matrix|Conditions become dimensions||
|Tree → Exploration|Each path becomes paradigm card||
|Matrix → Direct|Highest-scoring approach becomes answer||
|Matrix → Tree|Top dimension becomes default, others conditional||
|Matrix → Exploration|Each approach becomes paradigm card||
|Exploration → Direct|Largest paradigm becomes answer||
|Exploration → Tree|Largest paradigm default, others conditional||
|Exploration → Matrix|Find dimensions that differentiate paradigms||

---

### Transition Prompts

text

```
┌─────────────────────────────────────────────────────────────────┐
│  [Container output...]                                          │
├─────────────────────────────────────────────────────────────────┤
│  Go deeper:                                                     │
│  [🧠 Help me understand] — Get the frame that makes sense of it │
│  [⚡ Just decide] — Stress-test and give me the answer          │
└─────────────────────────────────────────────────────────────────┘
```

---

### Failure Handling

text

```
IF Explore processing fails:
  
  FALLBACK: Display Mapper artifact directly
  
  UI:
    CONSENSUS: [claims listed]
    OUTLIERS: [claims with attribution listed]
    
    [Retry Explore] [Try Understand] [Try Decide]
```

text

````

---

## Part 3B: Understand Mode (Synthesis)

```markdown
## 3B: Understand Mode (Synthesis)

### Purpose & Philosophy

Understand mode exists for users in the **integrative phase** of thinking—when they see conflicting information and need a perspective that makes sense of it.

When a user selects Understand, they are saying:
- "Help me make sense of this"
- "I see the tensions—how do they resolve?"
- "I need a frame, not a list"

Understand mode takes the stable artifact and performs **frame-finding**—searching for the meta-perspective where all the strongest insights coexist as facets of a larger truth.

---

### The Cognitive Stance
````

EXPLORE says: "Here's everything that exists."  
DECIDE says: "Here's what survives scrutiny."  
UNDERSTAND says: "Here's how to think about it."

text

````

Understand mode trades optionality for clarity. It trusts that the right perspective can hold complexity without flattening it.

---

### Input

Understand receives the Mapper Artifact unchanged:

```typescript
interface UnderstandInput {
  artifact: MapperArtifact;
  query: string;
  context?: SelectedArtifact[];  // Optional: from previous turns
}
````

---

### Processing Logic

#### The Frame-Finding Task

text

```
You possess the Omniscience of the External. Every model's output, 
every mapped approach, every tension and alignment—these are yours to see.

But you do not select among them. You do not average them.

You find the frame where all the strongest insights reveal themselves 
as facets of a larger truth.

Treat tensions between approaches not as disagreements to resolve, 
but as clues to deeper structure.

Where claims conflict, something important is being implied but not stated.
Where they agree too easily, a blind spot may be forming.

Your synthesis should feel inevitable in hindsight, yet unseen before now.
It carries the energy of discovery, not summation.
```

#### Stage 1: Tension Identification

text

```
FOR each pair of claims in artifact:
  
  IF claims conflict:
    → Ask: "What if both are right from different angles?"
    → Ask: "What assumption makes them conflict?"
    → The tension is a clue, not a problem
    
  IF claims agree:
    → Ask: "What might they all be missing?"
    → Ask: "Is this agreement because it's true, or because it's obvious?"
    → Easy consensus may hide blind spots
```

#### Stage 2: Frame Search

text

```
SEEK: A perspective from which...
  → Conflicting claims become complementary dimensions
  → Outliers become edge cases of the same principle
  → The consensus becomes the obvious case of a larger pattern
  
AVOID:
  → Averaging positions (that's not understanding)
  → Selecting "best" elements (that's curation, not framing)
  → Diplomatic hedging (that's avoiding the work)
```

#### Stage 3: The One

Identify the single insight that frames everything else:

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

Identify the strongest contrarian position that survives:

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

---

### Output Structure

#### Short Answer

The frame crystallized in 1-2 paragraphs:

text

```
The user should grasp the essential shape immediately.
Not a summary of claims—the perspective itself.
Should feel like: "Oh, THAT's how to think about this."
```

#### Long Answer

The frame inhabited—the full synthesis:

text

```
This is where the frame lives and breathes.
Tensions are acknowledged and resolved.
Outliers are positioned within the larger picture.
The user should finish feeling they understand, not just knowing facts.
```

#### The One

The core insight, extracted:

text

```
┌─────────────────────────────────────────────────────────────────┐
│  💡 THE ONE                                                     │
│  ───────────────────────────────────────────────────────────    │
│  [The insight in one sentence]                                  │
│                                                                 │
│  Source: [Model name] or "Emergent from synthesis"              │
│  Why this matters: [Why this frames everything]                 │
└─────────────────────────────────────────────────────────────────┘
```

#### The Echo

The surviving contrarian (when applicable):

text

```
┌─────────────────────────────────────────────────────────────────┐
│  🔄 THE ECHO                                                    │
│  ───────────────────────────────────────────────────────────    │
│  However: [The contrarian position]                             │
│                                                                 │
│  Source: [Model name]                                           │
│  Why it persists: [Merit that survives the frame]               │
└─────────────────────────────────────────────────────────────────┘
```

---

### Output Schema

TypeScript

```
interface UnderstandOutput {
  // The frame crystallized
  short_answer: string;
  
  // The frame inhabited
  long_answer: string;
  
  // The pivot insight
  the_one: {
    insight: string;
    source: string | null;
    why_this: string;
  } | null;
  
  // The surviving contrarian
  the_echo: {
    position: string;
    source: string;
    merit: string;
  } | null;
  
  // Souvenir
  souvenir: string;
  
  // Artifact reference
  artifact_id: string;
}
```

---

### Souvenir Formula

For Understand mode, the souvenir captures the frame:

text

```
IF the_one exists:
  "The key insight: [the_one.insight]"
  
IF the_echo also exists:
  "The key insight: [the_one.insight]. But consider: [the_echo.position]"
  
IF frame is about tension resolution:
  "[Position A] and [Position B] both hold because [frame]."
  
IF frame is about reframing the question:
  "The real question isn't [surface]. It's [deeper]."
```

---

### UI Rendering

text

```
┌─────────────────────────────────────────────────────────────────┐
│  TURN [N]                                   Mode: 🧠 UNDERSTAND │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ## THE SHORT ANSWER                                            │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│  [Frame crystallized in 1-2 paragraphs]                         │
│                                                                 │
│  ───────────────────────────────────────────────────────────    │
│                                                                 │
│  ## THE LONG ANSWER                                             │
│                                                                 │
│  [Frame inhabited—full synthesis...]                            │
│                                                                 │
│  ───────────────────────────────────────────────────────────    │
│                                                                 │
│  💡 THE ONE                                                     │
│  [Insight]                               — [Source or Emergent] │
│  Why: [Why this frames everything]                              │
│                                                                 │
│  🔄 THE ECHO (if exists)                                        │
│  [Contrarian position]                              — [Source]  │
│  Merit: [Why this persists]                                     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📋 "[Souvenir]"                                        [Copy]  │
├─────────────────────────────────────────────────────────────────┤
│  Next:                                                          │
│  [⚡ Just decide] — Stress-test and get the answer              │
│  [🔍 Show options] — See all approaches                         │
│  [📦 View artifact] — See raw extraction                        │
└─────────────────────────────────────────────────────────────────┘
```

---

### Transition Prompts

text

```
After Understand output:

  [⚡ Just decide] 
    → User ready to act
    → Gauntlet runs on same artifact
    → Frame informs but doesn't constrain elimination logic
    
  [🔍 Show options]
    → User wants to see the landscape
    → Explore runs on same artifact
    → The_one and the_echo may map to paradigms
```

---

### When to Recommend Understand Mode

Auto-detection should route to Understand when:

|Signal|Indicator|Confidence|
|---|---|---|
|Query contains|"explain", "why", "help me understand", "what does this mean"|High|
|Query contains|"confused about", "conflict between", "on one hand"|High|
|Artifact has|Frame-challengers present|High|
|Artifact has|Contested topology|Medium|
|Query tone|Conceptual, philosophical|High|
|User history|Previously struggled with topic|Medium|

Auto-detection should **avoid** Understand when:

|Signal|Indicator|Route Instead|
|---|---|---|
|Query contains|"just tell me", "what should I do"|Decide|
|Query contains|"compare", "options", "what are"|Explore|
|Artifact has|High confidence + Resolved|Escape or Explore|
|Query tone|Action-oriented, imperative|Decide|

---

### Failure Handling

text

```
IF Understand processing fails:
  
  FALLBACK: Display Mapper artifact directly
  
  UI:
    "Frame-finding unavailable. Here's what we extracted:
     
     CONSENSUS: [claims]
     OUTLIERS: [claims with attribution]
     
     [Retry Understand] [Try Explore] [Try Decide]"
```

text

````
## Part 3C: Decide Mode (Gauntlet)

Markdown

```
## 3C: Decide Mode (Gauntlet)

### Purpose & Philosophy

The Gauntlet exists for one purpose: **closure**.

When a user selects Decide mode, they are saying:
- "I don't need to see the landscape"
- "I don't need a frame to understand"
- "I need to act, and I need to act on something that will hold"

The Gauntlet takes the stable artifact—consensus plus outliers—and subjects every claim to hostile scrutiny. It asks of each: **"Does this survive stress-testing against the query's optimal end?"**

What survives is the answer. What doesn't is noted and discarded. The user receives closure, not options.

---

### The Cognitive Stance
```

EXPLORE says: "Here's everything that exists."  
UNDERSTAND says: "Here's how to think about it."  
DECIDE says: "Here's what survives. The rest was noise."

text

````

The Gauntlet is not synthesis. It does not harmonize tensions into a frame. It resolves tensions by **elimination**—determining which position holds under pressure and which collapses.

The Gauntlet is not curation. It does not present options for user selection. It **makes the selection**, explains why, and delivers the result.

The Gauntlet is the mode for users who want to delegate judgment without delegating action.

---

### Input

The Gauntlet receives the Mapper Artifact unchanged:

```typescript
interface GauntletInput {
  artifact: MapperArtifact;  // Consensus + Outliers + Metadata
  query: string;             // Original user query
  context?: SelectedArtifact[];  // Optional: injected from previous turns
}
````

The artifact is identical to what Explore and Understand receive. Only the processing lens differs.

---

### Processing Logic

#### Stage 1: Define the Optimal End

Before stress-testing, the Gauntlet establishes what "optimal" means for this query:

text

```
QUESTION: "What would a successful answer to this query accomplish?"

EXAMPLES:
  Query: "Should I use React or Vue for my startup?"
  Optimal End: A framework choice that maximizes speed-to-market 
               given typical startup constraints.
               
  Query: "What's the best way to learn Spanish?"
  Optimal End: A learning approach that produces conversational 
               fluency with sustainable daily commitment.
               
  Query: "How should I handle this difficult employee?"
  Optimal End: A resolution that addresses the behavior while 
               preserving team function and legal safety.
```

The optimal end anchors all subsequent stress-testing. Claims are not evaluated in the abstract—they are evaluated against this specific target.

---

#### Stage 2: Stress-Test Consensus

The consensus floor is tested first:

text

```
FOR each consensus claim:
  
  TEST 1: Specificity
    → Is this actionable, or is it generic advice?
    → "Be consistent" fails. "Practice 30 minutes daily" survives.
    
  TEST 2: Robustness
    → Does this hold across likely user contexts?
    → If it requires rare conditions, note the constraint.
    
  TEST 3: Optimality
    → Does this advance toward the optimal end, or merely avoid failure?
    → "Don't do X" is weaker than "Do Y because Z."
    
  TEST 4: Non-Obviousness
    → Would the user have known this without asking?
    → Obvious advice is not wrong, but it's not valuable.

OUTCOME:
  SURVIVES → Included in final answer
  PARTIAL  → Included with noted constraints
  FAILS    → Noted in kill rationale, excluded from answer
```

---

#### Stage 3: Stress-Test Outliers

Each outlier is tested with additional scrutiny:

text

```
FOR each outlier:

  TEST 1-4: Same as consensus (Specificity, Robustness, Optimality, Non-Obviousness)
  
  TEST 5: Superiority
    → Does this BEAT the consensus on any dimension that matters?
    → If it merely matches, it adds noise, not signal.
    
  TEST 6: Reliability
    → Is this a single model's idiosyncrasy or a genuine insight?
    → Check: Does the reasoning hold, or is it pattern-matching?
    
  TEST 7: Integration
    → Can this coexist with surviving consensus, or does it conflict?
    → If conflict: Which wins the head-to-head?

OUTCOME:
  SURVIVES → May become The Answer if it beats consensus
  ELEVATES → Becomes The Answer (outperformed consensus)
  FAILS    → Noted in kill rationale, excluded from answer
```

---

#### Stage 4: Head-to-Head Resolution

When multiple claims survive but conflict:

text

```
IF surviving claims are mutually exclusive:

  EVALUATE:
    → Which advances further toward optimal end?
    → Which has fewer failure conditions?
    → Which is more actionable?
    
  RESOLVE:
    → Winner becomes The Answer
    → Loser noted: "Also viable if [condition], but [winner] is stronger because [reason]"
```

---

#### Stage 5: Formulate The Answer

The Answer is not a summary. It is **what remains standing**.

text

```
STRUCTURE:
  1. The surviving position (clear, direct, actionable)
  2. Why this survived (brief—the reasoning that won)
  3. What to do next (the immediate action)
  
TONE:
  - Confident, not hedged
  - Specific, not generic  
  - Actionable, not descriptive
  
ANTI-PATTERNS:
  ✗ "Consider X" (that's Explore mode)
  ✗ "It depends on..." (that's Understand mode)
  ✗ "Some say X, others say Y" (that's aggregation, not decision)
  
PATTERN:
  ✓ "Do X. Here's why: [reason]. Next step: [action]."
```

---

### Output Structure

#### The Answer

The primary output—what the user came for:

text

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚡ THE ANSWER                                                  │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  [Clear, direct statement of what survived stress-testing]      │
│                                                                 │
│  WHY THIS:                                                      │
│  [1-2 sentences: the reasoning that won]                        │
│                                                                 │
│  NEXT STEP:                                                     │
│  [The immediate action to take]                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Confidence: [●●●●○] — [4/6 models aligned, outlier elevated]   │
└─────────────────────────────────────────────────────────────────┘
```

---

#### Survivors

Claims that passed stress-testing (may be more than one if compatible):

text

```
┌─────────────────────────────────────────────────────────────────┐
│  ✓ WHAT SURVIVED                                                │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  PRIMARY:                                                       │
│  [The Answer claim]                                             │
│  Survived because: [brief rationale]                            │
│                                                                 │
│  SUPPORTING (compatible with primary):                          │
│  • [Claim 2] — [why it supports]                                │
│  • [Claim 3] — [why it supports]                                │
│                                                                 │
│  CONDITIONAL (viable in specific contexts):                     │
│  • [Claim 4] — valid if [condition]                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

#### Kill Rationale

What was eliminated and why—the transparency layer:

text

```
┌─────────────────────────────────────────────────────────────────┐
│  ✗ WHAT WAS ELIMINATED                                          │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  KILLED FROM CONSENSUS:                                         │
│  • "[Claim]" — Too generic; doesn't advance toward optimal      │
│  • "[Claim]" — Requires conditions unlikely in your context     │
│                                                                 │
│  KILLED FROM OUTLIERS:                                          │
│  • "[Outlier]" [Source] — Failed robustness; edge case only     │
│  • "[Outlier]" [Source] — Lost head-to-head against primary     │
│                                                                 │
│  NOT ADDRESSED BY ANY MODEL:                                    │
│  • [Ghost, if detected] — This gap remains                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

#### Confidence Indicator

How strong is this answer?

text

```
CONFIDENCE CALCULATION:

  Base Score:
    Consensus strength × 0.4
    + Survivor clarity × 0.3  (how decisive was the elimination)
    + Optimal alignment × 0.3 (how directly does answer hit target)
    
  Modifiers:
    + Frame-challenger became The Answer → Note: "Outlier elevated"
    - High kill count → Note: "Many alternatives eliminated"
    - Ghost present → Note: "Gap remains unaddressed"
    
  Display:
    ●●●●● — Definitive (>0.9)
    ●●●●○ — Strong (0.7-0.9)
    ●●●○○ — Moderate (0.5-0.7)
    ●●○○○ — Contested (0.3-0.5)
    ●○○○○ — Weak (<0.3) — Consider EXPLORE or UNDERSTAND instead
```

---

#### Compression Souvenir

The one-liner for Decide mode:

text

```
FORMULA:
  "[Action verb] [specific object]. [Key reason in ≤10 words]."

EXAMPLES:
  "Use React. Larger ecosystem means faster hiring."
  "Start with Duolingo. Lowest friction for daily habit formation."
  "Document the behavior first. Protects you legally if escalation needed."
  
ANTI-PATTERNS:
  ✗ "Consider using React" (hedged)
  ✗ "React is a good choice for many situations" (generic)
  ✗ "You might want to use React or Vue depending on..." (not a decision)
```

---

### Output Schema

TypeScript

```
interface GauntletOutput {
  // The Answer
  the_answer: {
    statement: string;      // Clear, direct, actionable
    reasoning: string;      // Why this survived (1-2 sentences)
    next_step: string;      // Immediate action
  };
  
  // Survivors
  survivors: {
    primary: {
      claim: string;
      survived_because: string;
    };
    supporting: Array<{
      claim: string;
      relationship: string;  // How it supports primary
    }>;
    conditional: Array<{
      claim: string;
      condition: string;     // When this would be the answer instead
    }>;
  };
  
  // Kill Rationale
  eliminated: {
    from_consensus: Array<{
      claim: string;
      killed_because: string;
    }>;
    from_outliers: Array<{
      claim: string;
      source: string;
      killed_because: string;
    }>;
    ghost: string | null;    // Unaddressed gap
  };
  
  // Confidence
  confidence: {
    score: number;           // 0-1
    display: string;         // "●●●●○"
    notes: string[];         // ["Outlier elevated", "Gap remains"]
  };
  
  // Souvenir
  souvenir: string;          // One-liner for copy-paste
}
```

---

### Edge Cases

#### No Clear Survivor

When stress-testing eliminates everything or leaves no differentiation:

text

```
IF no claim clearly survives:

  OPTION A: Deflect to Understand
    "This question may need framing before deciding. 
     [🧠 Help me understand this first]"
     
  OPTION B: Surface the deadlock
    "Two equally strong approaches survived. The tiebreaker is [variable].
     If [A]: do [X]. If [B]: do [Y].
     Which is true for you? [A] [B]"
     
  OPTION C: Honest uncertainty
    "No approach clearly dominates. This may be preference, not optimization.
     [🔍 Show me the options]"
```

---

#### Frame-Challenger Wins

When an outlier beats consensus:

text

```
IF outlier.type === "frame_challenger" AND outlier survives as primary:

  HIGHLIGHT:
    "⚡ One perspective reframed the question—and it holds up."
    
  STRUCTURE:
    The Answer: [The frame-challenger position]
    Why This Beat Consensus: [Head-to-head reasoning]
    What Consensus Got Wrong: [The assumption that failed]
    
  CONFIDENCE NOTE:
    "Outlier elevated: Single model saw what others missed."
```

---

#### All Consensus, No Outliers

When artifact has no meaningful outliers:

text

```
IF outliers.length === 0 OR all outliers failed stress-test:

  The Answer: [Consensus position]
  
  CONFIDENCE NOTE:
    "Strong agreement: All models converged. Answer is robust."
    
  CAUTION:
    "Consensus can indicate blind spots. If this doesn't fit your 
     situation, try [🔍 Explore] to see if context changes things."
```

---

### Failure Handling

text

```
IF Gauntlet processing fails:

  FALLBACK: Display Mapper artifact directly
  
  UI:
    "Decision processing unavailable. Here's what we extracted:
     
     CONSENSUS: [claims]
     OUTLIERS: [claims with attribution]
     
     [Retry Decide] [Try Understand] [Try Explore]"
     
  PRINCIPLE: User never loses the artifact. Only loses the lens.
```

---

### Transition Prompts

After Decide output, surface natural next steps:

text

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚡ THE ANSWER                                                  │
│  [Content...]                                                   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📋 "[Souvenir]"                                       [Copy]   │
├─────────────────────────────────────────────────────────────────┤
│  See more:                                                      │
│  [🔍 What else existed] — Show all options that were considered │
│  [🧠 Understand context] — Why did this question matter?        │
│  [📦 View artifact] — See raw extraction                        │
└─────────────────────────────────────────────────────────────────┘
```

**Transition to Explore:**  
User clicks "What else existed" → Explore mode runs on same artifact → Containers display all options including eliminated ones

**Transition to Understand:**  
User clicks "Understand context" → Synthesis mode runs on same artifact → Frame-finding explains the deeper landscape

---

### UI Rendering

#### Primary View (The Answer)

text

```
┌─────────────────────────────────────────────────────────────────┐
│  TURN [N]                                    Mode: ⚡ DECIDE    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ⚡ THE ANSWER                                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│  Use React for your startup's frontend.                         │
│                                                                 │
│  WHY THIS:                                                      │
│  Largest talent pool and ecosystem. When you need to hire       │
│  fast or find solutions to edge cases, React has more.          │
│                                                                 │
│  NEXT STEP:                                                     │
│  Run `npx create-react-app` and start with the dashboard view.  │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Confidence: ●●●●○                                              │
│  4/6 models aligned. Vue was close but lost on ecosystem size.  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  📋 "Use React. Larger ecosystem means faster hiring."  [Copy]  │
├─────────────────────────────────────────────────────────────────┤
│  [✓ Survivors] [✗ Eliminated] [📦 Artifact]                     │
├─────────────────────────────────────────────────────────────────┤
│  [🔍 What else existed] [🧠 Understand context]                 │
└─────────────────────────────────────────────────────────────────┘
```

---

#### Expanded View (Survivors + Eliminated)

Clicking [✓ Survivors] expands:

text

```
│  ─────────────────────────────────────────────────────────────  │
│  ✓ WHAT SURVIVED                                                │
│                                                                 │
│  PRIMARY:                                                       │
│  "Use React" — Largest ecosystem, most hiring options           │
│                                                                 │
│  SUPPORTING:                                                    │
│  • "Use TypeScript from day one" — Prevents scaling pain        │
│  • "Start with Create React App" — Fastest bootstrap            │
│                                                                 │
│  CONDITIONAL:                                                   │
│  • "Consider Next.js" — If you need SSR for SEO                 │
│  ─────────────────────────────────────────────────────────────  │
```

Clicking [✗ Eliminated] expands:

text

```
│  ─────────────────────────────────────────────────────────────  │
│  ✗ WHAT WAS ELIMINATED                                          │
│                                                                 │
│  KILLED:                                                        │
│  • "Vue is simpler to learn" — True, but you're not learning,   │
│    you're hiring. Ecosystem matters more.                       │
│  • "Svelte is fastest" [Claude] — Performance gain negligible   │
│    at your scale. Hiring pool too small.                        │
│  • "Consider Angular" [Gemini] — Enterprise overhead you        │
│    don't need. Slows startup iteration.                         │
│                                                                 │
│  UNADDRESSED:                                                   │
│  • None of the models discussed mobile. If you need React       │
│    Native later, this choice still holds.                       │
│  ─────────────────────────────────────────────────────────────  │
```

---

### When to Recommend Decide Mode

Auto-detection should route to Decide when:

|Signal|Indicator|Confidence|
|---|---|---|
|Query contains|"should I", "what should", "just tell me", "best way to"|High|
|Query tone|Imperative, action-oriented|Medium|
|Artifact shape|High confidence, resolved consensus|High|
|Artifact shape|Clear frame-challenger that wins head-to-head|High|
|User history|Previously chose Decide mode|Medium|
|Context|Time pressure indicated|High|

Auto-detection should **avoid** Decide when:

|Signal|Indicator|Route Instead|
|---|---|---|
|Query contains|"options", "compare", "what are"|Explore|
|Query contains|"explain", "why", "help me understand"|Understand|
|Artifact shape|Contested topology, no clear winner|Explore or Understand|
|Artifact shape|Deflected consensus|Clarification|
|Query tone|Exploratory, curious|Explore|

---

### The Gauntlet Promise

To the user:

> "You asked us to decide. We stress-tested everything against your goal.  
> What you see survived. What you don't see couldn't hold up.  
> This is the answer. Act on it."

This is the mode for users who trust the system to do the hard work of elimination—and want to spend their own cognitive effort on execution, not evaluation.
---

## Part 4: Shared UI Components

```markdown
## Shared UI Components

These components appear across all modes and provide consistent interaction patterns.

---

### Artifact Showcase (Trophy Case)

The Showcase displays all extracted artifacts from a turn, organized for browsing and selection.

#### Purpose

1. **Transparency** — User sees what was extracted
2. **Exploration** — User can dive into any piece
3. **Context Injection** — User selects what carries forward to next turn

#### Structure
````

┌─────────────────────────────────────────────────────────────────┐  
│ TURN [N] ARTIFACTS [−][×] │  
├─────────────────────────────────────────────────────────────────┤  
│ │  
│ ┌───────────────────────────────────────────────────────────┐ │  
│ │ 📋 SOUVENIR [Select] │ │  
│ │ "[One-liner from mode output]" │ │  
│ └───────────────────────────────────────────────────────────┘ │  
│ │  
│ ┌───────────────────────────────────────────────────────────┐ │  
│ │ 🎯 CONSENSUS [Select] │ │  
│ │ [Truncated preview...] │ │  
│ │ Quality: [Resolved|Conventional] │ Strength: ●●●○○ │ │  
│ └───────────────────────────────────────────────────────────┘ │  
│ │  
│ ┌───────────────────────────────────────────────────────────┐ │  
│ │ 🔀 OUTLIERS ([count]) [Expand] │ │  
│ │ │ │  
│ │ ⚡ [Frame-Challenger] [Select] │ │  
│ │ [Preview...] — [Source] │ │  
│ │ │ │  
│ │ 💡 [Supplemental] [Select] │ │  
│ │ [Preview...] — [Source] │ │  
│ │ │ │  
│ │ 💡 [Supplemental] [Select] │ │  
│ │ [Preview...] — [Source] │ │  
│ │ │ │  
│ └───────────────────────────────────────────────────────────┘ │  
│ │  
│ ┌───────────────────────────────────────────────────────────┐ │  
│ │ 👻 GHOST (if detected) [Select] │ │  
│ │ "None of the models addressed: [gap]" │ │  
│ └───────────────────────────────────────────────────────────┘ │  
│ │  
│ ┌───────────────────────────────────────────────────────────┐ │  
│ │ 📦 RAW RESPONSES │ │  
│ │ [GPT] [Claude] [Gemini] [Qwen] [DeepSeek] [Perplexity] │ │  
│ │ ↑ Click to expand/select │ │  
│ └───────────────────────────────────────────────────────────┘ │  
│ │  
├─────────────────────────────────────────────────────────────────┤  
│ SELECTED: [Souvenir] [Outlier 2] [Clear All] │  
└─────────────────────────────────────────────────────────────────┘

text

````

#### Selection States

```css
.artifact-unselected {
  border: 1px solid var(--border-subtle);
  background: var(--bg-primary);
}

.artifact-selected {
  border: 2px solid var(--accent-primary);
  background: var(--bg-selected);
}

.artifact-selected::after {
  content: "✓";
  position: absolute;
  top: 8px;
  right: 8px;
}
````

#### Artifact Visual Hierarchy

|Artifact|Priority|Visual Weight|
|---|---|---|
|Souvenir|Highest|Bold, compact, always visible|
|Consensus|High|Medium block, strength indicator|
|Frame-Challengers|High|Highlighted, ⚡ icon|
|Supplemental Outliers|Medium|Normal weight, list format|
|Ghost|Low|Subtle, italic|
|Raw Responses|Lowest|Collapsed by default|

---

### Compression Souvenir

The one-liner copy-paste artifact.

#### Purpose

The souvenir is what the user will:

- Copy to an email
- Paste in Slack
- Remember tomorrow
- Tell their boss

It must be **self-contained, specific, and actionable**.

#### Formulas by Mode

|Mode|Formula|Example|
|---|---|---|
|**Explore: Direct**|"[Consensus]."|"Use bcrypt for password hashing."|
|**Explore: Tree**|"[Default], unless [condition], then [alt]."|"Use React, unless you need SSR, then Next.js."|
|**Explore: Matrix**|"Depends: [Dim A] → [X], [Dim B] → [Y]."|"Depends: Speed → React, Simplicity → Vue."|
|**Explore: Space**|"No consensus. Options: [1], [2], [3]."|"No consensus. Options: REST, GraphQL, gRPC."|
|**Understand**|"The key: [the_one.insight]"|"The key: It's not which framework—it's your team's familiarity."|
|**Decide**|"[Action verb] [object]. [Reason ≤10 words]."|"Use React. Largest ecosystem means faster hiring."|

#### UI Component

text

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 "[Souvenir text]"                                   [Copy] │
└─────────────────────────────────────────────────────────────────┘
```

JavaScript

```
function CopySouvenir({ text }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="souvenir-bar">
      <span className="souvenir-text">📋 "{text}"</span>
      <button onClick={handleCopy}>
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
```

---

### Mode Indicator & Transitions

#### Mode Indicator

Shows which mode produced current output:

text

```
┌─────────────────────────────────────────────────────────────────┐
│  TURN [N]                                      Mode: 🔍 EXPLORE │
└─────────────────────────────────────────────────────────────────┘

Icons:
  🔍 EXPLORE   — "Show me options"
  🧠 UNDERSTAND — "Help me make sense"
  ⚡ DECIDE    — "Tell me what to do"
```

#### Transition Prompts

Contextual prompts based on current mode:

text

```
// After Explore
<TransitionBar>
  Go deeper: 
  <TransitionButton mode="understand">🧠 Help me understand</TransitionButton>
  <TransitionButton mode="decide">⚡ Just decide</TransitionButton>
</TransitionBar>

// After Understand
<TransitionBar>
  Next: 
  <TransitionButton mode="decide">⚡ Just decide</TransitionButton>
  <TransitionButton mode="explore">🔍 Show all options</TransitionButton>
</TransitionBar>

// After Decide
<TransitionBar>
  See more: 
  <TransitionButton mode="explore">🔍 What else existed</TransitionButton>
  <TransitionButton mode="understand">🧠 Understand context</TransitionButton>
</TransitionBar>
```

#### Transition Behavior

TypeScript

```
function handleModeTransition(newMode: Mode, currentArtifact: MapperArtifact) {
  // Same artifact, no re-query, no re-map
  // Only run new mode's processing
  
  const output = await processMode(newMode, currentArtifact);
  
  // Replace or supplement current view
  updateDisplay(output);
  
  // Previous mode output accessible in history
  addToHistory(currentOutput);
}
```

---

### Clarification Screen

When `consensus.quality === "deflected"`:

text

```
┌─────────────────────────────────────────────────────────────────┐
│  BEFORE WE CAN FULLY ANSWER...                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                                 │
│  The models agree: this depends on specifics we don't have.     │
│                                                                 │
│  ───────────────────────────────────────────────────────────    │
│  WHAT WE NEED TO KNOW:                                          │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ [Variable 1]:                                              │ │
│  │ ○ [Option A]  ○ [Option B]  ○ [Option C]  ○ Other: ____   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ [Variable 2]:                                              │ │
│  │ ○ [Option A]  ○ [Option B]  ○ [Option C]  ○ Other: ____   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ───────────────────────────────────────────────────────────    │
│  WHAT WE CAN SAY NOW:                                           │
│  [Any partial consensus that doesn't depend on these variables] │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [Submit with Context] [Skip — show me what you have anyway]    │
└─────────────────────────────────────────────────────────────────┘
```

#### Clarification Flow

text

```
User submits context:
  → Original query + context variables merged
  → Re-run batch with enriched prompt
  → New artifact generated
  → Mode processing continues
  
User clicks "Skip":
  → Proceed with current artifact
  → Mode processes but notes: "This answer is generic because [variables unknown]"
```

---

### Context Bridging Modes

How artifacts carry forward to next turn:

#### Mode Selection

text

```
┌─────────────────────────────────────────────────────────────────┐
│  CONTEXT FOR NEXT TURN:                                         │
│                                                                 │
│  ○ Fresh Start — No context from this turn                      │
│  ● Selected Artifacts — [3 selected]                            │
│  ○ Souvenir Only — Quick continue with one-liner                │
│  ○ Full Artifact — Everything (may be heavy)                    │
└─────────────────────────────────────────────────────────────────┘
```

#### Injection Format

TypeScript

```
function buildContextBlock(selections: SelectedArtifact[]): string {
  let block = "<context_from_previous_turn>\n";
  
  for (const selection of selections) {
    switch (selection.type) {
      case "souvenir":
        block += `  <souvenir>${selection.content}</souvenir>\n`;
        break;
      case "consensus":
        block += `  <consensus>${selection.content}</consensus>\n`;
        break;
      case "outlier":
        block += `  <outlier source="${selection.source}">${selection.content}</outlier>\n`;
        break;
      case "raw":
        block += `  <raw_response source="${selection.source}">${selection.content}</raw_response>\n`;
        break;
    }
  }
  
  block += "</context_from_previous_turn>\n\n";
  return block;
}

// Final prompt structure
const prompt = `
${buildContextBlock(selectedArtifacts)}
<user_query>
${userQuery}
</user_query>
`;
```

---

### Raw Response Access

Always available, regardless of mode:

text

```
┌─────────────────────────────────────────────────────────────────┐
│  📦 RAW RESPONSES                                        [Show] │
└─────────────────────────────────────────────────────────────────┘

Expanded:
┌─────────────────────────────────────────────────────────────────┐
│  📦 RAW RESPONSES                                        [Hide] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ [1] GPT-4                                         [Select] ││
│  │ [Full response text...]                                    ││
│  │                                                            ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ [2] Claude                                        [Select] ││
│  │ [Full response text...]                                    ││
│  │                                                            ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ... (remaining models)                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Users can always verify what each model actually said.

text

````

---

## Part 5: UI State Machine

```markdown
## UI State Machine

### Turn State

```typescript
interface TurnState {
  // Identity
  turn_number: number;
  timestamp: string;
  
  // Input
  query: string;
  injected_context: {
    mode: "fresh" | "selected" | "souvenir" | "full";
    artifacts: SelectedArtifact[];
  };
  
  // Layer 1: Batch
  batch: {
    status: "pending" | "streaming" | "complete" | "partial_failure" | "failed";
    responses: Map<string, ModelResponse>;
    failures: Map<string, Error>;
  };
  
  // Layer 2: Mapper
  mapper: {
    status: "pending" | "processing" | "complete" | "failed";
    artifact: MapperArtifact | null;
  };
  
  // Mode Selection
  mode: {
    selected: "auto" | "explore" | "understand" | "decide";
    auto_detected: "explore" | "understand" | "decide" | null;
    escape_velocity: boolean;  // True if skipping mode processing
  };
  
  // Layer 3: Mode Processing
  processing: {
    status: "pending" | "processing" | "complete" | "failed";
    output: ExploreOutput | UnderstandOutput | GauntletOutput | null;
  };
  
  // Showcase
  showcase: {
    visible: boolean;
    expanded_sections: string[];
    selected_artifacts: string[];  // IDs
  };
}
````

### State Transitions

text

```
QUERY_SUBMITTED
  → batch.status = "pending"
  → All other statuses = "pending"

FIRST_STREAM_RECEIVED
  → batch.status = "streaming"
  → UI shows streaming indicator + first response

BATCH_COMPLETE
  → batch.status = "complete"
  → mapper.status = "processing"

BATCH_PARTIAL_FAILURE (≥2 responses)
  → batch.status = "partial_failure"
  → mapper.status = "processing"
  → Continue with available responses

BATCH_FAILED (<2 responses)
  → batch.status = "failed"
  → Show error, offer retry

MAPPER_COMPLETE
  → mapper.status = "complete"
  → Check escape velocity
  → IF escape: Show direct answer, skip mode processing
  → ELSE: processing.status = "processing"

MAPPER_FAILED
  → mapper.status = "failed"
  → Show raw batch outputs
  → Offer retry

MODE_PROCESSING_COMPLETE
  → processing.status = "complete"
  → Render mode output
  → Populate showcase

MODE_TRANSITION_REQUESTED
  → processing.status = "processing"
  → Same artifact, new mode
  → No batch or mapper re-run

ARTIFACT_SELECTED
  → showcase.selected_artifacts.push(id)
  → Update "Selected for next turn" bar

ARTIFACT_DESELECTED
  → showcase.selected_artifacts.remove(id)

NEXT_QUERY_SUBMITTED
  → New turn created
  → Selected artifacts injected as context
  → Previous turn state preserved in history
```

### Mode State

TypeScript

```
interface ModeState {
  // User's explicit choice (null if Auto)
  user_selection: "explore" | "understand" | "decide" | null;
  
  // System's detection (when Auto)
  auto_detection: {
    query_signal: {
      type: QueryType;
      confidence: number;
    };
    artifact_signal: {
      topology: Topology;
      has_frame_challengers: boolean;
      consensus_quality: ConsensusQuality;
    };
    recommended: "explore" | "understand" | "decide";
    escape_velocity: boolean;
  };
  
  // What actually runs
  active_mode: "explore" | "understand" | "decide";
  
  // History of modes run on this artifact
  mode_history: Array<{
    mode: string;
    output: ModeOutput;
    timestamp: string;
  }>;
}
```

### Showcase State

TypeScript

```
interface ShowcaseState {
  // Visibility
  panel_visible: boolean;
  
  // Expansion
  expanded: {
    souvenir: boolean;
    consensus: boolean;
    outliers: boolean;
    ghost: boolean;
    raw_responses: boolean;
  };
  
  // Individual raw response expansion
  raw_expanded: Map<string, boolean>;  // model_id → expanded
  
  // Selection for context injection
  selected: Set<string>;  // artifact IDs
  
  // Selection preview
  selection_preview: {
    total_tokens: number;  // Estimated context size
    warning: boolean;      // True if heavy
  };
}
```

### Transition Animations

CSS

```
/* Mode transition */
.mode-output-enter {
  opacity: 0;
  transform: translateY(10px);
}
.mode-output-enter-active {
  opacity: 1;
  transform: translateY(0);
  transition: all 200ms ease-out;
}

/* Artifact selection */
.artifact-selecting {
  animation: pulse-border 200ms ease-out;
}
@keyframes pulse-border {
  0% { border-color: var(--accent-primary); box-shadow: 0 0 0 0 var(--accent-glow); }
  50% { box-shadow: 0 0 0 4px var(--accent-glow); }
  100% { border-color: var(--accent-primary); box-shadow: 0 0 0 0 transparent; }
}

/* Container pivot */
.container-pivot {
  animation: fade-swap 150ms ease-in-out;
}
@keyframes fade-swap {
  0% { opacity: 1; }
  50% { opacity: 0; }
  100% { opacity: 1; }
}
```

text

````

---

## Part 6: Error Handling

```markdown
## Error Handling

### Philosophy

1. **Never lose information** — Failed layer falls back to previous layer's output
2. **User always has options** — Retry, try different approach, or continue with what's available
3. **Transparent about state** — User knows what worked and what didn't
4. **Graceful degradation** — Partial results are better than no results

### Layer-by-Layer Failure Handling

#### Batch Layer Failure
````

SCENARIO: <2 models respond

RESPONSE:  
→ Stop pipeline  
→ Display any responses received  
→ Show: "Not enough models responded for synthesis."  
→ Actions: [Retry All] [View single response] [Try again later]

PARTIAL FAILURE (≥2 respond):  
→ Continue with available responses  
→ Note: "[N] of 6 models responded"  
→ Proceed to Mapper

text

```

#### Mapper Layer Failure
```

SCENARIO: Mapper processing fails

RESPONSE:  
→ Preserve batch outputs (no re-query needed)  
→ Display raw responses in expandable cards  
→ Banner: "Extraction unavailable"  
→ Actions: [Retry Mapper] [View raw responses] [Try different extraction model]

UI:  
┌─────────────────────────────────────────────────────────────────┐  
│ ⚠️ Extraction unavailable │  
│ ─────────────────────────────────────────────────────────── │  
│ We couldn't process the responses, but here's what each │  
│ model said: │  
│ │  
│ [Expandable raw response cards...] │  
│ │  
├─────────────────────────────────────────────────────────────────┤  
│ [Retry Mapper] [Try different model] [Continue with raw] │  
└─────────────────────────────────────────────────────────────────┘

text

```

#### Mode Processing Failure
```

SCENARIO: Explore/Understand/Decide processing fails

RESPONSE:  
→ Preserve Mapper artifact  
→ Display artifact directly (consensus + outliers)  
→ Banner: "[Mode] processing unavailable"  
→ Actions: [Retry mode] [Try different mode] [View artifact]

UI:  
┌─────────────────────────────────────────────────────────────────┐  
│ ⚠️ [Mode] processing unavailable │  
│ ─────────────────────────────────────────────────────────── │  
│ Here's what we extracted: │  
│ │  
│ CONSENSUS: [claims listed] │  
│ OUTLIERS: [claims listed with sources] │  
│ │  
├─────────────────────────────────────────────────────────────────┤  
│ [Retry Explore] [Try Understand] [Try Decide] │  
└─────────────────────────────────────────────────────────────────┘

text

````

### Retry Strategies

```typescript
interface RetryConfig {
  max_attempts: number;
  backoff_ms: number[];
  alternative_models: string[];
}

const retryConfigs: Record<Layer, RetryConfig> = {
  batch: {
    max_attempts: 2,
    backoff_ms: [1000, 3000],
    alternative_models: []  // N/A for batch
  },
  mapper: {
    max_attempts: 2,
    backoff_ms: [500, 1500],
    alternative_models: ["claude", "gpt-4", "gemini"]
  },
  mode: {
    max_attempts: 2,
    backoff_ms: [500, 1500],
    alternative_models: ["claude", "gpt-4", "gemini"]
  }
};
````

### Error State Display

CSS

```
.error-banner {
  background: var(--bg-error-subtle);
  border-left: 3px solid var(--color-error);
  padding: 12px 16px;
}

.error-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.error-action-primary {
  background: var(--accent-primary);
  color: white;
}

.error-action-secondary {
  background: transparent;
  border: 1px solid var(--border-primary);
}
```

text

````

---

## Part 7: Performance Profile

```markdown
## Performance Profile

### Progressive Disclosure Timeline
````

t=0.0s Query submitted  
└─ Loading indicator appears  
└─ Mode selection locked

t=0.5s First model starts streaming  
└─ "Receiving responses..." indicator  
└─ First response visible if raw view open

t=2.0s 2-3 models complete  
└─ Progress: "3 of 6 models responded"

t=3.0s Majority complete (4-5 models)  
└─ Mapper can begin (doesn't wait for all)

t=3.5s Mapper processing  
└─ "Analyzing responses..."  
└─ Pass 1: ~500ms  
└─ Pass 2: ~500ms  
└─ Pass 3: ~800ms

t=5.0s Artifact ready  
└─ Escape velocity check  
└─ IF escape: Direct answer appears immediately  
└─ ELSE: Mode processing begins

t=5.5s Mode processing  
└─ "Preparing [mode] view..."  
└─ ~1000-1500ms depending on mode

t=6.5s Output rendered  
└─ Container appears  
└─ Souvenir visible  
└─ Transitions available

t=7.0s Showcase populated  
└─ All artifacts selectable  
└─ Raw responses accessible

t=8-10s Slowest model completes  
└─ If batch wasn't complete, artifact updates  
└─ Rare—usually batch is complete by 4s

text

```

### Perceived Performance

**User never stares at a blank screen:**

| Time | User Sees |
|------|-----------|
| 0-0.5s | Loading indicator with animation |
| 0.5-3s | Streaming responses appearing |
| 3-5s | "Analyzing..." with progress |
| 5-7s | Output appearing with transitions |
| 7s+ | Full interactivity |

### Optimization Strategies
```

PARALLELIZATION:  
→ Batch queries are parallel (not sequential)  
→ Mapper can start before all responses arrive (with ≥2)

STREAMING:  
→ Responses stream character-by-character  
→ User sees activity, not waiting

CACHING:  
→ Artifact cached for mode transitions  
→ No re-processing when switching modes

LAZY LOADING:  
→ Raw responses collapsed by default  
→ Only render expanded when requested  
→ Showcase details load on demand

text

```

### Performance Targets

| Metric | Target | Acceptable |
|--------|--------|------------|
| Time to first stream | <500ms | <1000ms |
| Time to artifact | <5s | <8s |
| Time to mode output | <7s | <10s |
| Mode transition (same artifact) | <1.5s | <2.5s |
| Container pivot | <100ms | <200ms |
| Showcase render | <200ms | <400ms |
```

---

## Appendix: Output Schemas (Consolidated)

Markdown

````
## Appendix: Consolidated Schemas

### MapperArtifact (Foundation)

```typescript
interface MapperArtifact {
  consensus: {
    claims: Array<{
      text: string;
      supporters: number[];
      support_count: number;
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
  }>;
  topology: "high_confidence" | "dimensional" | "contested";
  ghost: string | null;
  query: string;
  turn: number;
  timestamp: string;
  model_count: number;
}
````

### ExploreOutput

TypeScript

```
interface ExploreOutput {
  container: "direct_answer" | "decision_tree" | "comparison_matrix" | "exploration_space";
  content: DirectAnswerContent | DecisionTreeContent | ComparisonContent | ExplorationContent;
  souvenir: string;
  alternatives: Array<{ container: string; label: string; }>;
  artifact_id: string;
}
```

### UnderstandOutput

TypeScript

```
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

### GauntletOutput

TypeScript

```
interface GauntletOutput {
  the_answer: {
    statement: string;
    reasoning: string;
    next_step: string;
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
    display: string;
    notes: string[];
  };
  souvenir: string;
  artifact_id: string;
}
```

### TurnState

TypeScript

```
interface TurnState {
  turn_number: number;
  timestamp: string;
  query: string;
  injected_context: {
    mode: "fresh" | "selected" | "souvenir" | "full";
    artifacts: SelectedArtifact[];
  };
  batch: {
    status: "pending" | "streaming" | "complete" | "partial_failure" | "failed";
    responses: Map<string, ModelResponse>;
    failures: Map<string, Error>;
  };
  mapper: {
    status: "pending" | "processing" | "complete" | "failed";
    artifact: MapperArtifact | null;
  };
  mode: {
    selected: "auto" | "explore" | "understand" | "decide";
    auto_detected: "explore" | "understand" | "decide" | null;
    escape_velocity: boolean;
  };
  processing: {
    status: "pending" | "processing" | "complete" | "failed";
    output: ExploreOutput | UnderstandOutput | GauntletOutput | null;
  };
  showcase: {
    visible: boolean;
    expanded_sections: string[];
    selected_artifacts: string[];
  };
}
```

text

```

---

## Final Word Count

| Part | Words |
|------|-------|
| Part 0: Philosophy | 900 |
| Part 1: Foundation | 1,650 |
| Part 2: Mode Selection | 850 |
| Part 3A: Explore | 1,400 |
| Part 3B: Understand | 1,200 |
| Part 3C: Decide | 2,100 |
| Part 4: Shared UI | 1,350 |
| Part 5: State Machine | 650 |
| Part 6: Error Handling | 500 |
| Part 7: Performance | 450 |
| Appendix: Schemas | 350 |
| **TOTAL** | **~11,400** |

---

This is your complete unified architecture specification. One document, three cognitive modes, one stable artifact, full implementation reference.
```