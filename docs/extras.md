## II. The Council Orbs

### 2.1 Anatomy

text

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

### 2.2 The Reveal Interaction

**Hover on any orb:**

text

```
                    ┌──────────────┐
                    │ Claude 4 Opus │
                    │ ████████░░ 84%│  ← confidence/agreement with synthesis
                    └──────────────┘
              ◦      ◦      ◉      ◦      ◦      ◦
```

**Click on orb → Slide-in Panel:**

text

```
┌──────────────────────────────────────┬─────────────────────┐
│                                      │                     │
│  Here's how I'd approach this:       │  Claude 4 Opus      │
│                                      │  ─────────────────  │
│  For your first three engineering    │                     │
│  hires, the standard framework...    │  The equity         │
│                                      │  question requires  │
│                                      │  understanding      │
│                                      │  your specific...   │
│                                      │                     │
│                                      │  [Raw stream from   │
│                                      │   this model]       │
│                                      │                     │
├──────────────────────────────────────┤                     │
│     ◦      ●      ◉      ◦      ◦    │  ──────────────     │
└──────────────────────────────────────┴─────────────────────┘
                    ▲
            [Now highlighted - active orb]
```

The panel slides from right (240px width). Translucent background (`rgba(15, 15, 20, 0.92)`). Click elsewhere or press Escape to dismiss.

**Click between orbs (center zone) → Decision Map:**

The synthesis bubble transforms:

text

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    DECISION TERRAIN                         │
│                                                             │
│          [1-2% standard]                                    │
│               ╱    ╲                                        │
│         ────●────────●────                                  │
│            ╱          ╲                                     │
│    [vest 4yr] ●────────● [vest 3yr cliff]                  │
│                   │                                         │
│                   │                                         │
│           ●───────●───────●                                 │
│    [performance    │    [equal split]                       │
│     multipliers]   │                                        │
│                   ●                                         │
│            [cliff debate]                                   │
│                                                             │
│  ──────────────────────────────────────────────────────── │
│  ● Agreement (4+ models)  ○ Tension  ─── Supports  ╱ Conflicts│
│                                                             │
│─────────────────────────────────────────────────────────────│
│     ◦      ◦      ◉      ◦      ◦      ◦                   │
└─────────────────────────────────────────────────────────────┘
```

Click same zone again → returns to synthesis.




┌─────────────────────────────────────────────────────────────────────────────┐
│                           FOUNDATION LAYER                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  BATCH (1-6 models)                                                  │   │
│  │  • Can run alone                                                     │   │
│  │  • Produces: 6 raw outputs with full reasoning                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MAPPING LAYER                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  MAPPER (Epistemic Cartographer)                                     │   │
│  │  Receives: user prompt + batch outputs                               │   │
│  │  Produces: narrative + options_inventory + artifact + graph_topology │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────────┐
│      PRIMARY SYNTHESIS          │   │       PRIMARY SYNTHESIS             │
│  ┌───────────────────────────┐  │   │  ┌───────────────────────────────┐  │
│  │  UNDERSTAND (Convergent)  │  │   │  │  DECIDE (Eliminatory)         │  │
│  │  "How it all fits"        │  │   │  │  "What survives scrutiny"     │  │
│  │  Receives: prompt +       │  │   │  │  Receives: prompt +           │  │
│  │    full mapper artifact   │  │   │  │    full mapper artifact       │  │
│  │  Produces:                │  │   │  │  Produces:                    │  │
│  │    short_answer           │  │   │  │    the_answer.statement       │  │
│  │    long_answer            │  │   │  │    the_answer.reasoning       │  │
│  │    the_one                │  │   │  │    survivors                  │  │
│  │    the_echo               │  │   │  │    eliminated                 │  │
│  │    gaps_addressed         │  │   │  │    the_void                   │  │
│  └───────────────────────────┘  │   │  │    confidence                 │  │
└─────────────────────────────────┘   │  └───────────────────────────────┘  │
                    │                 └─────────────────────────────────────┘
                    │                                   │
                    └─────────────────┬─────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ENHANCEMENT LAYER                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  CHALLENGE (Refiner)                                                 │   │
│  │  Receives: prompt + batch outputs + mapper narrative + synthesis     │   │
│  │  Purpose: Build equally strong answer from what synthesis missed     │   │
│  │  Produces: final_word + the_one + the_echo + the_step              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  NEXT (Antagonist)                                                   │   │
│  │  Receives: prompt + batch outputs + options_inventory + synthesis   │   │
│  │            + refiner output (if exists)                              │   │
│  │  Purpose: Final failsafe + context elicitation                       │   │
│  │  Produces: structured_prompt + dimensions + grounding + audit       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CONTEXT BRIDGE (Turn 2+)                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Currently: short_answer/statement + mapper narrative/options        │   │
│  │  Injected into: Next turn's batch prompts                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘