# Shape → Concierge Behavior Guide

This document summarizes, for each structural shape, what the mapper hands to the Concierge layer and how that structure changes the way the Concierge responds.

Pipeline in brief:
- Mapper produces a `StructuralAnalysis` with a primary `shape` and shape-specific `shape.data`.
- `buildStructuralBrief` turns that into a brief with:
  - Structural Metrics
  - Topology (Flow vs Friction framing)
  - The Flow
  - The Friction
  - Fragilities
  - Gaps
  - The Transfer (question handed back to the user)
- `buildConciergePrompt` wraps that brief with:
  - Shape guidance (how to talk given the topology)
  - Stance guidance (decide / explore / challenge / default)

For each shape below:
- “What the map sends” describes the key fields present in `shape.data` and the metrics that matter.
- “How the Concierge responds” describes how the brief and stance are shaped by that data.

---

## Settled (CONVERGENT)

What the map sends:
- High concentration, low tension, strong connected “floor” of high-support claims.
- `SettledShapeData` including:
  - `floor` (central claims with support counts and whether they are contested).
  - `floorStrength` summarizing how strong the agreement is.
  - `challengers` that explicitly push against the floor.
  - `blindSpots` capturing unaddressed areas.
  - `strongestOutlier` (leverage inversion / explicit challenger / minority voice).
  - `floorAssumptions` and a `transferQuestion`.

How the Concierge responds:
- Structural brief:
  - Flow centers on the floor (“centroid”) and what it assumes.
  - Friction focuses on the strongest outlier or challengers and blind spots.
  - Fragilities call out leverage inversions or disconnected consensus.
  - Transfer asks which assumption must hold in the user’s context.
- Shape guidance:
  - “Speak with confidence” but explicitly surface blind spots and minority views.
- Default stance:
  - `default` stance unless user explicitly asks to explore/decide/challenge.
  - Response pattern: clear answer based on the floor, followed by the key caveat or question from the transfer section.

---

## Contested (TENSE)

What the map sends:
- Comparable support for opposing positions, elevated tension.
- `ContestedShapeData` including:
  - `centralConflict` (either two positions or a target vs many challengers) with stakes.
  - `secondaryConflicts` around the main axis.
  - `floor` outside the conflict (shared ground).
  - `fragilities` and a possible `collapsingQuestion`.

How the Concierge responds:
- Structural brief:
  - Flow lays out the fault line: central positions, their support, and stakes of choosing.
  - Friction emphasizes that the disagreement is the structure, and surfaces possible common ground.
  - Fragilities highlight hidden conflicts and low-signal regions.
  - Transfer asks which constraint or priority matters more to the user.
- Shape guidance:
  - “Surface tension naturally, present both sides, don’t pick without user context.”
- Default stance:
  - Shape default is `default` stance; user language can push it to `decide` or `explore`.
  - Response pattern: show the fork and conditions under which each path is preferable, end by asking which side of the trade they care about.

---

## Keystone (HUB-CENTRIC)

What the map sends:
- One highly central claim that many others depend on.
- `KeystoneShapeData` including:
  - `keystone` (hub claim with support and dominance).
  - `dependencies` that structurally hang off the hub.
  - `cascadeSize` and `cascadeConsequences` (what breaks if the hub fails).
  - `challengers` to the hub.
  - `decoupledClaims` that survive even if the hub fails.
  - `transferQuestion`.

How the Concierge responds:
- Structural brief:
  - Flow describes the hub, how dominant it is, and what flows from it.
  - Friction centers on challengers, decoupled claims, and the cascade if the hub is wrong.
  - Fragilities focus on hub fragility and dependence.
  - Transfer asks whether the user accepts the keystone as valid in their setting.
- Shape guidance:
  - “Center the response on the keystone; stress-test it if questioned.”
- Default stance:
  - Shape default is `default` stance.
  - Response pattern: explain “if this foundation holds then X follows,” then press the user on whether that foundation actually holds for them.

---

## Linear (SEQUENTIAL)

What the map sends:
- A chain of prerequisite relationships and a notion of depth.
- `LinearShapeData` including:
  - `chain` (ordered steps with support and whether each is a weak link).
  - `weakLinks` with cascade sizes.
  - `terminalClaim` at the end of the chain.
  - `shortcuts` that may bypass steps.
  - `chainFragility` and `transferQuestion`.

How the Concierge responds:
- Structural brief:
  - Flow walks the user through the sequence, step by step, highlighting weak links.
  - Friction focuses on weak steps, possible shortcuts, and the fragility ratio.
  - Fragilities emphasize how much of the chain depends on fragile steps.
  - Transfer asks where the user is in the sequence and whether early steps are actually satisfied.
- Shape guidance:
  - “Walk through steps in order; emphasize why order and prerequisites matter.”
- Default stance:
  - Shape default is `default` stance.
  - Response pattern: narrative walkthrough (“First… then…”) with explicit attention to where things might break for the user’s actual state.

---

## Tradeoff (EITHER‑OR)

What the map sends:
- Explicit pairs of options that cannot all be optimized simultaneously.
- `TradeoffShapeData` including:
  - `tradeoffs` with option A, option B, symmetry, and governingFactor.
  - `dominatedOptions` that can be eliminated.
  - `floor` outside the tradeoff (uncontested ground).

How the Concierge responds:
- Structural brief:
  - Flow enumerates tradeoffs and describes each option with support and symmetry.
  - Friction frames irreducible cost: choosing one option means giving up what the other provides.
  - Fragilities focus less on single claims and more on how badly misaligned priorities can hurt.
  - Transfer asks what the user is actually optimizing for.
- Shape guidance:
  - “Map what is sacrificed for what is gained; don’t force a choice; show consequences.”
- Default stance:
  - Shape default stance is `explore` (map the space rather than decide).
  - Response pattern: explicit “If you prioritize X, pick A; if you prioritize Y, pick B” and end with a question about which variable matters most.

---

## Dimensional (MULTI‑FACETED)

What the map sends:
- Claims clustered into multiple relatively independent dimensions.
- `DimensionalShapeData` including:
  - `dimensions` (clusters with themes, claims, and cohesion).
  - `interactions` among dimensions (independent/overlapping/conflicting).
  - `gaps` and `governingConditions`.
  - `dominantDimension`, `hiddenDimension`, `dominantBlindSpots`, `transferQuestion`.

How the Concierge responds:
- Structural brief:
  - Flow presents the primary lens and other dimensions, plus key conflicts between them.
  - Friction emphasizes what the dominant lens misses and what the hidden dimension contains.
  - Fragilities surface cross-dimensional conflicts and blind spots.
  - Transfer asks which dimension is most relevant to the user.
- Shape guidance:
  - “Ask which dimension matters; do not collapse prematurely.”
- Default stance:
  - Shape default stance is `explore` (surface dimensions and branches).
  - Response pattern: lay out key dimensions and how choices change with each, then ask the user to anchor on one or two.

---

## Exploratory (UNMAPPED)

What the map sends:
- Sparse or fragmented structure with low coherence.
- `ExploratoryShapeData` including:
  - `strongestSignals` and loose clusters.
  - `isolatedClaims` with no connections.
  - `clarifyingQuestions`.
  - `signalStrength`, `outerBoundary`, `sparsityReasons`, `transferQuestion`.

How the Concierge responds:
- Structural brief:
  - Flow lists strongest signals and coarse clusters, if any.
  - Friction highlights outer boundaries, isolation, and the reasons structure is sparse.
  - Fragilities call out low signal strength and any penalties in the shape.
  - Transfer asks a clarifying question that would collapse ambiguity.
- Shape guidance:
  - “Be honest about uncertainty; ask clarifying questions that would collapse ambiguity.”
- Default stance:
  - Shape default stance is `explore`.
  - Response pattern: exploratory mapping of what little is known, heavy emphasis on what is missing, and a pointed clarifying question at the end.

---

## Contextual (CONDITIONAL)

What the map sends:
- Different branches that apply under different conditions.
- `ContextualShapeData` including:
  - `governingCondition` describing the fork.
  - `branches` with conditions and associated floor claims.
  - `defaultPath` when conditions are not specified.
  - `missingContext` and `transferQuestion`.

How the Concierge responds:
- Structural brief:
  - Flow lays out the governing condition and the branches, plus any default path.
  - Friction focuses on the risk of picking the wrong branch and what context is missing.
  - Fragilities emphasize dependence on user-specific conditions.
  - Transfer asks which situation applies to the user and what context they can provide.
- Shape guidance:
  - “Do not guess; ask for missing context and explain why the answer changes with it.”
- Default stance:
  - Shape default stance is `explore`.
  - Response pattern: “If you are in situation A, do X; if in B, do Y,” then request the missing context that disambiguates which branch applies.

