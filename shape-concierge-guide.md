# Shape → Concierge Behavior Guide

This document summarizes, for each structural shape, what the mapper hands to the Concierge layer and how that structure changes the way the Concierge responds.

## Pipeline in brief

- **Mapper** produces a `StructuralAnalysis` containing:
    - `landscape`: High-level metrics (claim counts, model counts, dominant roles).
    - `shape`: Primary `pattern` and shape-specific `data`.
    - `patterns`: Detected structural features (conflicts, tradeoffs, risks).
    - `ratios`: Mathematical descriptions of the topology (tension, fragmentation, depth).
- `buildStructuralBrief` constructs a narrative brief combining topology descriptions and data-driven observations.
- `buildConciergePrompt` wraps the brief with:
    - **Shape Guidance**: Tone and strategy notes specific to the topology.
    - **Stance Guidance**: Directives based on the selected stance (`default`, `decide`, `explore`, or `challenge`).

## Core Concepts & Terminology

To understand the shapes below, you must first understand the fundamental structural units the Mapper uses:

### The "Floor"
The **Floor** refers to the foundation of the current problem landscape. It consists of the most stable, highly-supported claims that most sources agree upon. It is the "consensus centroid."
- **Floor Strength**: A quantitative measure of how "settled" the agreement is. A "High" floor strength means there is dominant support for a specific cluster of claims with little significant opposition. A "Weak" floor strength suggests fragmented agreement or high tension.
- **Floor Assumptions**: The specific technical or logical conditions that *must* hold true for the current consensus to be valid. These are the "hidden foundations" the Concierge often challenges.

### Shape Data (`SettledShapeData`, `ContestedShapeData`, etc.)
Each topology produces a specific data payload (`shape.data`) that the Concierge uses to build its response:
- **SettledShapeData**: Focuses on the strength of the consensus and identifies any "Minority Reports" (strong outliers) that disagree with the floor.
- **ContestedShapeData**: Focuses on the "Fault Line"—the axis where two or more supported positions conflict, and the "Stakes" of choosing one over the other.
- **KeystoneShapeData**: Identifies the "Hub"—a single claim that carries the weight of the entire structure. If the keystone falls, the "Cascade" breaks everything else.
- **LinearShapeData**: Tracks the "Chain"—a sequence where steps must be completed in order. It identifies "Weak Links" that risk the terminal outcome.

## Brief Structure

The `StructuralBrief` follows a standardized section hierarchy:

1.  **Topology**: The high-level classification (e.g., CONVERGENT, TENSE).
2.  **Core Claims**: The most supported claims in the landscape.
3.  **Key Tensions / Tradeoffs**: Explicit disagreements or optimization boundaries.
4.  **Structural Risks**: Leverage inversions (low support/high impact) or cascade risks.
5.  **Gaps**: Areas not addressed by any source.
6.  **The Flow**: A shape-specific narrative describing the logical path.
7.  **The Friction**: A shape-specific narrative describing the resistance or uncertainty.
8.  **Fragilities**: Critical structural weaknesses (e.g., articulation points).
9.  **The Transfer**: The specific question or context requested from the user.

---

## Settled (CONVERGENT)

**What the map sends:**
- High concentration, low tension, strong connected “floor” of high-support claims.
- `SettledShapeData` includes `floorStrength`, `floorAssumptions`, `challengers`, and `strongestOutlier` (minority reports).

**The Flow:**
- Centers on **Narrative Gravity**. Describes the "Centroid" (the floor) and its explicit assumptions.

**The Friction:**
- Highlights the **Minority Report** (strongest outlier) or explicit challengers. If none exist, notes the risk of a shared blind spot.

**Shape Guidance:**
- Speak with confidence; lead with the answer. Challenge assumptions or explore edge cases only if probed.

**Default Stance:** `default` (unless query signals otherwise).

---

## Contested (TENSE)

**What the map sends:**
- Comparable support for opposing positions, elevated tension.
- `ContestedShapeData` includes a `centralConflict` (axis and positions) and associated `stakes`.

**The Flow:**
- Lays out the **Fault Line**. Presents the target under siege or the individual fork, including the dynamics (symmetric vs. asymmetric).

**The Friction:**
- Frames the friction *as* the structure. Identifies common ground outside the conflict and secondary tensions.

**Shape Guidance:**
- Surface tension naturally. Present both sides as valid depending on priorities. Do not pick a side without user context.

**Default Stance:** `default`.

---

## Keystone (HUB-CENTRIC)

**What the map sends:**
- One highly central claim that many others depend on.
- `KeystoneShapeData` includes `keystone` (dominance and fragility), `dependencies`, and `cascadeConsequences`.

**The Flow:**
- Focuses on **The Hub**. Describes its structural position, dominance ratio, and exactly what claims flow from it.

**The Friction:**
- Identifies **Challengers to the hub** and **Decoupled Claims** (those that survive hub failure). Details the quantitative consequences if the hub fails.

**Shape Guidance:**
- Center the response on the keystone. Stress-test it if the user asks "why" or "what if."

**Default Stance:** `default`.

---

## Linear (SEQUENTIAL)

**What the map sends:**
- A chain of prerequisite relationships and a notion of depth.
- `LinearShapeData` includes the `chain` (ordered steps) and `weakLinks` with cascade sizes.

**The Flow:**
- Walks through **The Sequence**. Steps are presented in order, explicitly marking terminal claims and prerequisite steps.

**The Friction:**
- Highlights **Weak Links** in the chain and potential **Shortcuts** (bypassable steps). Summarizes overall chain fragility.

**Shape Guidance:**
- Walk through steps in order. Emphasize prerequisites and help the user identify where they are in the sequence.

**Default Stance:** `default`.

---

## Tradeoff (EITHER-OR)

**What the map sends:**
- Explicit pairs of options that cannot all be optimized simultaneously.
- `TradeoffShapeData` includes `tradeoffs` (symmetry/governing factors) and `dominatedOptions`.

**The Flow:**
- Maps **Optimization Boundaries**. Enumerates each tradeoff with its balance and governing logic.

**The Friction:**
- Frames the irreducible cost: choosing one option means accepting the loss of the other. Identifies agreed ground unaffected by the tradeoff.

**Shape Guidance:**
- Map what is sacrificed for what is gained. Do not force a choice; show the consequences of each path.

**Default Stance:** `explore`.

---

## Dimensional (MULTI-FACETED)

**What the map sends:**
- Claims clustered into multiple relatively independent dimensions.
- `DimensionalShapeData` includes `dimensions` (themes/cohesion), `interactions`, and `governingConditions`.

**The Flow:**
- Presents the **Primary Lens** (dominant dimension) and summarizes other detected dimensions and conflicts.

**The Friction:**
- Surfaces the **Hidden Dimension** and identifies what the primary lens may miss. Lists unaddressed combinations (gaps).

**Shape Guidance:**
- Ask which dimension matters; do not collapse prematurely. Present options tied to specific conditions.

**Default Stance:** `explore`.

---

## Exploratory (UNMAPPED)

**What the map sends:**
- Sparse or fragmented structure with low coherence.
- `ExploratoryShapeData` includes `strongestSignals`, `looseClusters`, and `sparsityReasons`.

**The Flow:**
- Reports **Signal Strength**. Lists the strongest individual signals and any coarse thematic clusters detected.

**The Friction:**
- Describes the **Outer Boundary** and identifies why the structure is sparse (ambiguity, underexplored domain, etc.).

**Shape Guidance:**
- Be honest about uncertainty; don't overstate. Ask clarifying questions to collapse ambiguity.

**Default Stance:** `explore`.

---

## Contextual (CONDITIONAL)

**What the map sends:**
- Different branches that apply under different conditions.
- `ContextualShapeData` includes `governingCondition`, `branches`, and `missingContext`.

**The Flow:**
- Defines **The Fork**. Lays out the governing condition and the specific claims activated by each branch.

**The Friction:**
- Focuses on the **Missing Context** needed to resolve the fork. Identifies exceptions to the highest-support default path.

**Shape Guidance:**
- Do not guess. Ask for missing context directly and explain how the answer changes based on that context.

**Default Stance:** `explore`.
