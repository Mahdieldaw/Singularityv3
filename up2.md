



## Mode Outputs: Now Container-Aware

### Understand Mode Receives:

TypeScript

```
{
  artifact: MapperArtifact,
  analysis: ExploreAnalysis // includes containerType, dimensions, etc.
}
```

### Understand Mode Does:

text

```
CORE WORK:
  - Find frame where all insights coexist
  - Extract The One
  - Identify The Echo

CONTAINER-AWARE STRUCTURING:
  IF containerType === "comparison_matrix":
    → Frame should address each dimension
    → "The real question isn't which dimension wins, it's [frame]"
    → Structure long answer around dimensions
    
  IF containerType === "decision_tree":
    → Frame should speak to the conditions
    → "The default path works, but [frame recontextualizes conditions]"
    → The One might resolve the conditional complexity
    
  IF containerType === "exploration_space":
    → Frame should unify the paradigms
    → "These aren't competing approaches, they're [frame]"
    → Long answer weaves paradigms together
    
  IF containerType === "direct_answer":
    → Frame confirms or deepens the consensus
    → "The agreement is right, and here's why [frame]"
```

### Decide Mode Receives:

Same inputs.

### Decide Mode Does:

text

```
CORE WORK:
  - Stress-test all claims
  - Eliminate weak ones
  - Produce The Answer

CONTAINER-AWARE STRUCTURING:
  IF containerType === "comparison_matrix":
    → Test each dimension's winner
    → "On dimension X, the winner survives because [reason]"
    → Kill rationale organized by dimension
    
  IF containerType === "decision_tree":
    → Test default path vs conditions
    → "The default path wins UNLESS [surviving condition]"
    → Kill non-viable conditions
    
  IF containerType === "exploration_space":
    → Head-to-head paradigms
    → "Paradigm X survives, paradigms Y and Z fail because [reasons]"
    → Or: "Given your context, paradigm Y wins"
    
  IF containerType === "direct_answer":
    → Confirm consensus or find fatal flaw
    → "The consensus holds. Do [X]. Killed: [outliers that failed]"
```

---

## What Modes Now Output

### Understand Output (Enhanced)

TypeScript

```
interface UnderstandOutput {
  // Existing
  short_answer: string;
  long_answer: string;
  the_one: TheOne | null;
  the_echo: TheEcho | null;
  souvenir: string;
  
  // NEW: Container-structured elaboration
  structured_response: {
    containerType: ContainerType;
    
    // If comparison_matrix
    dimension_frames?: Array<{
      dimension: string;
      frame_perspective: string;  // How the frame applies to this dimension
    }>;
    
    // If decision_tree
    path_analysis?: {
      default_reframed: string;   // How frame changes the default
      conditions_reframed: Array<{
        condition: string;
        frame_perspective: string;
      }>;
    };
    
    // If exploration_space
    paradigm_synthesis?: Array<{
      paradigm: string;
      how_frame_unifies: string;
    }>;
  };
}
```

### Decide Output (Enhanced)

TypeScript

```
interface GauntletOutput {
  // Existing
  the_answer: TheAnswer;
  survivors: Survivors;
  eliminated: Eliminated;
  confidence: Confidence;
  souvenir: string;
  
  // NEW: Container-structured results
  structured_decision: {
    containerType: ContainerType;
    
    // If comparison_matrix
    dimension_verdicts?: Array<{
      dimension: string;
      winner: string;
      survived_because: string;
      killed: string[];
    }>;
    
    // If decision_tree
    path_verdict?: {
      chosen_path: "default" | "condition";
      condition_if_chosen?: string;
      killed_paths: Array<{
        path: string;
        killed_because: string;
      }>;
    };
    
    // If exploration_space
    paradigm_verdict?: {
      surviving_paradigm: string;
      survived_because: string;
      killed_paradigms: Array<{
        paradigm: string;
        killed_because: string;
      }>;
    };
  };
}
```

---

## The Full Flow

text

```
STAGE 1: MAPPER
  Input: Batch outputs
  Output: MapperArtifact (with dimension tags, applies_when, etc.)

STAGE 2: COMPUTE EXPLORE (pure function)
  Input: Artifact + query
  Output: ExploreAnalysis (queryType, containerType, dimensions, gaps, etc.)

STAGE 3: DISPLAY LOSSLESS VIEW
  ┌─────────────────────────────────────────────────────────────────┐
  │  SUMMARY BAR (based on containerType)                           │
  │  - comparison: dimension leaders + gap count                    │
  │  - decision_tree: default path + condition count                │
  │  - exploration: paradigm count + ghost                          │
  │  - direct: top claim + support                                  │
  ├─────────────────────────────────────────────────────────────────┤
  │  DIMENSION-FIRST VIEW (lossless)                                │
  │  - Gaps → Contested → Settled                                   │
  │  - All claims, all outliers, all metadata                       │
  ├─────────────────────────────────────────────────────────────────┤
  │  [🧠 Understand]  [⚡ Decide]                                   │
  └─────────────────────────────────────────────────────────────────┘

STAGE 4: USER CLICKS MODE

STAGE 5: MODE PROCESSING
  Input: Artifact + Analysis (including containerType)
  
  Understand:
    - Does frame-finding
    - ALSO structures output per containerType
    
  Decide:
    - Does stress-testing
    - ALSO structures verdicts per containerType

STAGE 6: MODE OUTPUT DISPLAY
  ┌─────────────────────────────────────────────────────────────────┐
  │  MODE OUTPUT (Frame or Answer)                                  │
  │  - The One / The Answer                                         │
  │  - Structured by containerType (dimension verdicts, path, etc.) │
  ├─────────────────────────────────────────────────────────────────┤
  │  [View original landscape]  [Select for next turn]              │
  └─────────────────────────────────────────────────────────────────┘


  ## Summary Bar Examples

### Direct Answer Type

text

```
┌─────────────────────────────────────────────────────────────────┐
│  ✅ DIRECT ANSWER                                               │
│  "Position as Council/Board of Directors"                       │
│  [6/6 models agree] • 3 supplemental notes • 1 ghost            │
└─────────────────────────────────────────────────────────────────┘
```

### Comparison Matrix Type

text

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 COMPARISON: 7 dimensions                                    │
│  Leaders: narrative [6/6] • cost [5/6] • persona [5/6] • ...    │
│  Gaps: gtm_strategy • tech_sustainability • risk_mitigation     │
│  Contested: 0 • Tensions: 2                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Decision Tree Type

text

```
┌─────────────────────────────────────────────────────────────────┐
│  🌳 DECISION TREE                                               │
│  Default: "Position as Council/Board of Directors"              │
│  3 conditions change the path • 1 frame challenger              │
└─────────────────────────────────────────────────────────────────┘
```

### Exploration Space Type

text

```
┌─────────────────────────────────────────────────────────────────┐
│  🗺️ EXPLORATION: No consensus                                   │
│  3 competing paradigms • Ghost: industry verticalization        │
│  Common thread: Multi-perspective over single-model             │
└─────────────────────────────────────────────────────────────────┘
