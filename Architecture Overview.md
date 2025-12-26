---

# Singularity System Architecture Overview

**Version:** 3.0  
**Last Updated:** 2025-12-27  
**Purpose:** Complete architectural blueprint for contributors working on any layer of the system

---

## Table of Contents

1. [System Philosophy](https://claude.ai/chat/90e57a76-883e-4eaf-9601-5170a9f32a9b#1-system-philosophy)
2. [Data Contracts: The Language of the System](https://claude.ai/chat/90e57a76-883e-4eaf-9601-5170a9f32a9b#2-data-contracts)
3. [Backend: The Resolve → Compile → Execute Pipeline](https://claude.ai/chat/90e57a76-883e-4eaf-9601-5170a9f32a9b#3-backend-pipeline)
4. [UI State Management: The Frontend Brain](https://claude.ai/chat/90e57a76-883e-4eaf-9601-5170a9f32a9b#4-ui-state-management)
5. [Rendering Layer: State to Pixels](https://claude.ai/chat/90e57a76-883e-4eaf-9601-5170a9f32a9b#5-rendering-layer)
6. [Critical Flows](https://claude.ai/chat/90e57a76-883e-4eaf-9601-5170a9f32a9b#6-critical-flows)
7. [Debugging Guide](https://claude.ai/chat/90e57a76-883e-4eaf-9601-5170a9f32a9b#7-debugging-guide)

---

## 1. System Philosophy

### Core Principles

**Immutable History, Live Context**  
The system maintains a complete, immutable record of every conversation turn while keeping a separate, hot-path index (`provider_contexts`) for fast continuation lookups. This dual-layer design enables both historical integrity and real-time performance.

**Three Primitives, One Truth**  
All workflows reduce to three primitives:

- `initialize`: Start a new conversation
- `extend`: Continue with live context
- `recompute`: Re-run historical steps without advancing the timeline

**Optimistic UI, Canonical Backend**  
The UI renders immediately using optimistic IDs and placeholder data. The backend sends `TURN_CREATED` and `TURN_FINALIZED` messages with canonical IDs. The UI replaces optimistic data with canonical data upon finalization, never remapping IDs.

**Streaming-First**  
Every AI response streams character-by-character via `PARTIAL_RESULT` messages. The UI uses a `StreamingBuffer` to batch DOM updates, achieving 60fps rendering even during multi-provider fan-out.

**Cognitive Halt, User-Selected Lenses**  
When the Cognitive Pipeline feature flag is enabled, the backend intentionally halts after mapping once it has produced a stable `MapperArtifact` and computed `ExploreAnalysis`. At that point it emits `MAPPER_ARTIFACT_READY` and `WORKFLOW_COMPLETE` with a `haltReason`, and waits for the user to select a lens (Explore containers, Understand synthesis, or Decide/Gauntlet). Continuations run via the `CONTINUE_COGNITIVE_WORKFLOW` protocol and reuse the same artifact rather than re-running batch or mapping.

---

## 2. Data Contracts: The Language of the System

### 2.1 Request Primitives (`shared/contract.ts`)

These are the only three message shapes the backend accepts. Full definitions live in `shared/contract.ts` (`shared/contract.ts:139`):

- `InitializeRequest` — Start a new conversation. Includes:
  - `userMessage`, `providers`, feature toggles (`includeMapping`, `includeSynthesis`, `includeRefiner`, `includeAntagonist`)
  - role selection (`synthesizer`, `mapper`, `refiner`, `antagonist`)
  - cognitive options (`mode?: CognitiveMode`, `providerMeta`)
  - optimistic identity (`clientUserTurnId`)
- `ExtendRequest` — Continue an existing conversation. Inherits the same feature flags and cognitive options, plus:
  - `sessionId` (required)
  - `forcedContextReset?: ProviderKey[]` for per-provider fresh starts
- `RecomputeRequest` — Re-run a historical step without advancing the main timeline:
  - `sourceTurnId`, `stepType: "synthesis" | "mapping" | "batch" | "refiner" | "antagonist"`, `targetProvider`

### 2.2 Real-Time Messages (Backend → UI)

The backend sends these messages over a persistent `chrome.runtime.Port`. Full shapes are defined in `shared/contract.ts` (`shared/contract.ts:234`, `shared/contract.ts:430`), but conceptually:

- `TURN_CREATED` — Announces canonical IDs and session for a new AI turn.
- `PARTIAL_RESULT` — Streams text chunks for batch, synthesis, mapping, refiner, antagonist, and cognitive steps.
- `WORKFLOW_STEP_UPDATE` — Marks individual steps as `completed` or `failed`, with per-step `result.meta` carrying structured outputs (e.g. `understandOutput`, `gauntletOutput`).
- `WORKFLOW_PARTIAL_COMPLETE` — Signals that a workflow finished with some provider failures.
- `MAPPER_ARTIFACT_READY` — Cognitive halt signal containing `MapperArtifact` and `ExploreAnalysis` for a given AI turn.
- `WORKFLOW_PROGRESS` — Aggregate progress across providers.
- `TURN_FINALIZED` — Delivers the canonical `Turn` (user + ai) snapshot after persistence.

### 2.3 Core Data Shapes (`ui/types.ts`, `src/persistence/types.ts`)

This document does not mirror the full type definitions; those live alongside the code:

- UI turn and response shapes: `ui/types.ts` (`ui/types.ts:1`)
  - `UserTurn`, `AiTurn`, `ProviderResponse`
  - Cognitive extensions on `AiTurn`:
    - `mapperArtifact?: MapperArtifact`
    - `exploreAnalysis?: ExploreAnalysis`
    - `understandOutput?: UnderstandOutput`
    - `gauntletOutput?: GauntletOutput`
    - per-mode version counters (`understandVersion`, `gauntletVersion`, etc.)
- Persistence records: `src/persistence/types.ts` (`src/persistence/types.ts:193`)
  - `SessionRecord`, `TurnRecord`, `AiTurnRecord`
  - `ProviderResponseRecord`, `ProviderContextRecord`

All of these are append-only or versioned to preserve history while enabling fast lookup for hot paths (extend, recompute, and cognitive continuation).

---

## 3. Backend Pipeline: Resolve → Compile → Execute

### 3.1 Entry Point: Connection Handler

**File:** `src/core/connection-handler.js`

See: [src/core/connection-handler.js](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/src/core/connection-handler.js)

### 3.2 Context Resolver: Data Fetcher

**File:** `src/core/context-resolver.js`

**Purpose:** Fetch minimum required data for each primitive. This is the performance bottleneck—must be fast.

See: [src/core/context-resolver.js](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/src/core/context-resolver.js)

### 3.3 Workflow Compiler: Instruction Generator

**File:** `src/core/workflow-compiler.js`

**Purpose:** Pure function that converts request + context into imperative steps. It is the only place that knows how to translate `InitializeRequest` / `ExtendRequest` / `RecomputeRequest` into low-level workflow steps.

See: [src/core/workflow-compiler.js](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/src/core/workflow-compiler.js)

Key points:

- Prompt steps (`type: "prompt"`) fan out the user message to all selected providers, passing through `providerMeta` and any continuation contexts resolved in `ContextResolver` (`src/core/context-resolver.js:50`).
- Mapping steps (`type: "mapping"`) call the Mapper provider and are responsible for generating `MapperArtifact` instances (`shared/contract.ts:40`).
- Synthesis, refiner, and antagonist steps operate over the batch/mapping outputs but do not know about cognitive modes directly; they just describe which provider and source step IDs to use.

### 3.4 Workflow Engine: Step Executor

**File:** `src/core/workflow-engine.js`

**Purpose:** Execute steps in sequence, stream results to UI, persist on completion, and host the Cognitive Pipeline runtime.

See: [src/core/workflow-engine.js](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/src/core/workflow-engine.js)

Additional v3 responsibilities:

- Read the `USE_COGNITIVE_PIPELINE` feature flag from `chrome.storage.local` and set `context.useCognitivePipeline` (`src/core/workflow-engine.js:494`).
- After mapping, compute `ExploreAnalysis` and emit `MAPPER_ARTIFACT_READY`, then halt the workflow with `haltReason: "cognitive_exploration_ready"` (`src/core/workflow-engine.js:776`).
- Handle `CONTINUE_COGNITIVE_WORKFLOW` messages by rehydrating the stored turn, creating `understand` or `gauntlet` steps, running them, and re-emitting `TURN_FINALIZED` with the new cognitive output (`src/core/workflow-engine.js:3481`).

### 3.5 System Prompts: Synthesizer and Mapper

**File:** `src/core/workflow-engine.js`

**Purpose:** These prompts define how the synthesis and mapping steps transform batch outputs.

#### Synthesizer Prompt (buildSynthesisPrompt)

The synthesizer creates a unified response that "could only exist" from seeing all models:

See: [src/core/workflow-engine.js](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/src/core/workflow-engine.js)

**Output Contract:**
- **The Short Answer:** 1-2 paragraph overview
- **The Long Answer:** Full synthesis

---

#### Mapper Prompt (buildMappingPrompt)

The mapper is a "provenance tracker and option cataloger" that reveals consensus patterns and divergence:

See: [src/core/workflow-engine.js](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/src/core/workflow-engine.js)

**Output Contract:**
1. **Narrative:** Prose with embedded citations `[1,2,3]` and **bold canonical labels**
2. **Delimiter:** `===ALL_AVAILABLE_OPTIONS===`
3. **Options List:** Grouped by theme, with citations
4. **Delimiter:** `===GRAPH_TOPOLOGY===`
5. **JSON Graph:** Nodes (with supporters) + Edges (with relationship types)

---

### 3.6 Pre-Flight Refinement: PromptRefinerService

**File:** `src/services/PromptRefinerService.ts`

**Purpose:** Two-stage pipeline (Composer → Analyst) that refines user prompts before batch fan-out.

#### Composer Role

The Composer is the "user's voice, clarified"—a hinge between user and the batch pipeline.

See: [src/services/PromptRefinerService.ts](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/src/services/PromptRefinerService.ts)

**Output Contract:**
- `REFINED_PROMPT:` — The polished prompt to send
- `NOTES:` — 2-4 sentences explaining intent/changes

---

#### Analyst Role

The Analyst is the "mirror held up to the composed prompt before it launches."

See: [src/services/PromptRefinerService.ts](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/src/services/PromptRefinerService.ts)

**Output Contract:**
- `AUDIT:` — Negative-space analysis (what's being left behind)
- `VARIANTS:` — 1-3 alternative framings (numbered list)
- `GUIDANCE:` — 2-4 sentences mapping variants to user priorities

---

#### Pipeline Flow

```
User Fragment 
  ↓
Composer (refines prompt, preserves voice)
  ↓
Analyst (reveals negative space, offers variants)
  ↓
User Reviews (chooses refined prompt or variant)
  ↓
Batch Fan-Out
```

**Key Methods:**
- `refineWithAuthorAnalyst()` — Run full Composer → Analyst pipeline
- `runComposer()` — Run Composer only
- `runAnalyst()` — Run Analyst only

---

## 4. UI State Management: The Frontend Brain

### 4.1 State Architecture (`ui/state/atoms.ts`)

**Core Principle:** Map-based storage for O(1) lookups, array of IDs for ordering, plus feature flags and per-turn cognitive mode state.

See: [ui/state/atoms.ts](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/ui/state/atoms.ts)

Highlights:

- Conversation state: `turnsMapAtom`, `turnIdsAtom`, `currentSessionIdAtom`, `isLoadingAtom`, `activeAiTurnIdAtom`.
- Cognitive feature flag: `useCognitivePipelineAtom` (backed by `atomWithStorage`, synchronized to `chrome.storage.local` for backend access).
- Mode selection: `selectedModeAtom` for the pre-flight picker, and `turnCognitiveModeFamily` for per-turn active view (`artifact` vs `understand` vs `gauntlet`) (`ui/state/atoms.ts:1840`).

### 4.2 Message Handler: Backend → State Bridge

**File:** `ui/hooks/chat/usePortMessageHandler.ts`

**Purpose:** Translate backend messages into state updates. This is the most critical UI hook.

See: [ui/hooks/chat/usePortMessageHandler.ts](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/ui/hooks/chat/usePortMessageHandler.ts)

In addition to v2 responsibilities (handling `TURN_CREATED`, `PARTIAL_RESULT`, `WORKFLOW_STEP_UPDATE`, `TURN_FINALIZED`), it now:

- Listens for `MAPPER_ARTIFACT_READY` and stores `mapperArtifact` and `exploreAnalysis` on the relevant `AiTurn` (`ui/hooks/chat/usePortMessageHandler.ts:2021`).
- Extracts `understandOutput` and `gauntletOutput` from `WORKFLOW_STEP_UPDATE.result.meta` and increments per-mode version counters so cognitive views re-render cheaply (`ui/hooks/chat/usePortMessageHandler.ts:623`).

### 4.3 Action Hook: User Intent → Backend Messages

**File:** `ui/hooks/chat/useChat.ts`

See: [ui/hooks/chat/useChat.ts](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/ui/hooks/chat/useChat.ts)

Responsibilities:

- Create optimistic `UserTurn` entries as soon as the user hits Send.
- Build `PrimitiveWorkflowRequest` objects for `initialize` vs `extend`, including:
  - Provider configuration and feature toggles (`includeMapping`, `includeSynthesis`, `includeRefiner`, `includeAntagonist`).
  - Cognitive mode (`mode: selectedMode`) and `providerMeta`.
- Ensure the port is bound for existing sessions via `api.ensurePort({ sessionId })`, then call `api.executeWorkflow(primitive)` (`ui/hooks/chat/useChat.ts:171`).

---

## 5. Rendering Layer: State to Pixels

### 5.1 Top-Level Layout (`ui/App.tsx`)

See: [ui/App.tsx](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/ui/App.tsx)

### 5.2 Chat View: Virtualized Turn List (`ui/views/ChatView.tsx`)

See: [ui/views/ChatView.tsx](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/ui/views/ChatView.tsx)

### 5.3 AI Turn Block: Synthesis-Focused Renderer (`ui/components/AiTurnBlock.tsx`)

**Purpose:** Renders AI turns, including both classic synthesis bubbles and the Cognitive Pipeline’s post-mapper views.

See: [ui/components/AiTurnBlock.tsx](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/ui/components/AiTurnBlock.tsx)

In v3:

- Synthesis remains the primary conversational surface.
- Mapping output and cognitive modes are rendered through dedicated components (Decision Map Sheet, CognitiveOutputRenderer), not inline in the bubble body.
- Council Orbs and related UI still drive provider-level navigation.

**Right Split Pane (ModelResponsePanel):**
- Opens when user clicks an orb
- Shows full batch response for that provider
- Independent scroll from main thread
- Draggable divider (default 60/40 split)

**Decision Map Sheet (DecisionMapSheet):**
- Opens when user clicks orb strip background
- Bottom sheet with Graph/Narrative/Options tabs
- See Section 5.4 for details

### 5.4 Interactive Components: Council Orbs, Decision Map, Nudge Bar, Launchpad

#### Council Orbs (`ui/components/CouncilOrbs.tsx`)

**Purpose:** Visual representation of active models for each turn, with role assignment via long-press menu.

**Key Features:**
- **Voice Provider (Center):** The "crown" model that synthesizes
- **Priority Ordering:** Models arranged by priority (closest to center = highest)
- **Long-Press Menu:** Assign roles (Synthesizer, Mapper, Composer, Analyst)
- **Variants:**
  - `tray` — Config orbs above chat input (for next turn)
  - `historical` — Orbs attached to past synthesis bubbles
  - `welcome` — Orbs on welcome screen
  - `divider` — Orbs on split-pane divider
  - `active` — Currently executing turn

**Props:**
See: [ui/components/CouncilOrbs.tsx](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/ui/components/CouncilOrbs.tsx)

**Visual States:**
- **Active:** Full color, 100% opacity, slight glow
- **Inactive:** Grayscale, 40% opacity
- **Hover:** Scale 1.1x, stronger glow
- **Selected (in menu):** Border highlight

---

#### Decision Map Sheet (`ui/components/DecisionMapSheet.tsx`)

**Purpose:** Bottom sheet for visualizing decision map with three tabs.

**Tabs:**

1. **Graph Tab** (default)
   - Force-directed visualization using D3 (via `DecisionMapGraph.tsx`)
   - Node size = supporter count
   - Edge types: conflicts (red), complements (green), prerequisite (blue)
   - Click node → Detail view with provenance

2. **Narrative Tab**
   - Prose explanation of consensus/divergence
   - Embedded citations `[1,2,3]` clickable
   - **Bold canonical labels** link to options

3. **Options Tab**
   - Collapsible theme sections
   - Each option shows: **[Label]** + description + citations
   - Click citation → Jump to that model's response

**Data Flow:**
See: [ui/components/DecisionMapSheet.tsx](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/ui/components/DecisionMapSheet.tsx)

**Key Components:**
- `SupporterOrbs` — Mini orbs showing which models support a claim
- `MapperSelector` — Dropdown to recompute with different mapper
- `DetailView` — Full provenance for a selected node

---

#### Nudge Chip Bar (`ui/components/NudgeChipBar.tsx`)

**Purpose:** Pre-flight suggestions that appear above chat input after user pauses typing.

**Variants:**
- `default` — "Let Composer perfect it" / "Let Analyst sharpen it"
- `chain_analyst` — After Composer ran: "Now pressure-test with Analyst?"
- `chain_composer` — After Analyst ran: "Now perfect this audited version?"

**Props:**
See: [ui/components/NudgeChipBar.tsx](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/ui/components/NudgeChipBar.tsx)

**Visual Design:**
- Floating pill above input with backdrop blur
- Two chips separated by divider
- Shows model name in small mono font `[gemini-flash]`
- Progress ring animates around perimeter when `type="sending"`

---

#### Launchpad Drawer (`ui/components/LaunchpadDrawer.tsx`)

**Purpose:** Left-edge drawer for managing draft prompts from Composer and Analyst.

**Features:**
- **Auto-capture:** Composer outputs and Analyst variants saved as draft cards
- **Actions per card:**
  - Send (directly to batch)
  - Send to Composer (refine further)
  - Send to Analyst (get audit)
  - Delete
- **Reordering:** Drag to reorder priority
- **Persistence:** Stored in `launchpadDraftsAtom` (IndexedDB via atomWithStorage)

**Draft Card Structure:**
See: [ui/components/LaunchpadDrawer.tsx](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/ui/components/LaunchpadDrawer.tsx)

**Visual Design:**
- 420px wide, full height
- Backdrop blur overlay
- Empty state: "Ready for lift-off" with rocket emoji
- Cards show source badge (Composer/Analyst) and timestamp

---

## 6. Critical Flows

### 6.1 Flow: User Sends First Message (Initialize)

**Actors:** User, UI, ConnectionHandler, ContextResolver, Compiler, WorkflowEngine, Orchestrator, SessionManager

See: [Introduction Flow in docs/flows.md](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/docs/flows.md#1-user-sends-first-message-initialize)

### 6.2 Flow: User Re-runs Synthesis with Different Model (Recompute)

**Actors:** User, UI, ConnectionHandler, ContextResolver, Compiler, WorkflowEngine, Orchestrator, SessionManager

See: [Recompute Flow in docs/flows.md](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/docs/flows.md#2-user-re-runs-synthesis-with-different-model-recompute)

### 6.3 Flow: Provider Fails (Error Handling)

See: [Error Handling Flow in docs/flows.md](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/docs/flows.md#3-provider-fails-error-handling)

---

## 7. Debugging Guide

See: [docs/debugging.md](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/docs/debugging.md)

---

## 8. Extension Points

See: [docs/contributing.md](file:///c:/Users/Mahdi/OneDrive/Desktop/Singularityv3/docs/contributing.md)

---

## Appendix A: File Index

**Backend Core:**

- `src/core/connection-handler.js` - Entry point, orchestrates Resolve → Compile → Execute
- `src/core/context-resolver.js` - Fetches data for primitives
- `src/core/workflow-compiler.js` - Converts primitives to steps
- `src/core/workflow-engine.js` - Executes steps, manages streaming, contains Synthesizer + Mapper prompts
- `src/core/workflow-orchestrator.js` (FaultTolerantOrchestrator) - Provider fan-out

**Pre-Flight Refinement:**

- `src/services/PromptRefinerService.ts` - Composer + Analyst pipeline for prompt refinement

**Persistence:**

- `src/persistence/SessionManager.js` - Conversation data manager
- `src/persistence/SimpleIndexedDBAdapter.js` - Database abstraction
- `src/persistence/types.ts` - Database schema types

**Contracts:**

- `shared/contract.ts` - Request/response types
- `shared/parsing-utils.ts` - Shared parsing functions (extractOptionsAndStrip, extractGraphTopologyAndStrip)
- `ui/types.ts` - UI-specific types

**UI State:**

- `ui/state/atoms.ts` - Jotai state definitions (includes Composer, Analyst, Launchpad, Decision Map, Cognitive Pipeline atoms)
- `ui/hooks/chat/usePortMessageHandler.ts` - Backend → State bridge
- `ui/hooks/chat/useChat.ts` - User actions → Backend messages
- `ui/hooks/useLaunchpadDrafts.ts` - Launchpad draft management

**UI Components:**

- `ui/App.tsx` - Top-level layout
- `ui/views/ChatView.tsx` - Virtualized turn list
- `ui/components/AiTurnBlock.tsx` - Synthesis-focused renderer with tabs
- `ui/components/ModelResponsePanel.tsx` - Right split pane for batch responses
- `ui/components/ChatInput.tsx` - Prompt input
- `ui/components/ChatInputConnected.tsx` - Connected input wrapper
- `ui/components/CouncilOrbs.tsx` - Horizontal orb strip with long-press menu
- `ui/components/CouncilOrbsVertical.tsx` - Vertical orb strip variant
- `ui/components/DecisionMapSheet.tsx` - Bottom sheet with Graph/Narrative/Options tabs
- `ui/components/experimental/DecisionMapGraph.tsx` - D3 force-directed graph visualization
- `ui/components/NudgeChipBar.tsx` - Pre-flight Composer/Analyst suggestions
- `ui/components/LaunchpadDrawer.tsx` - Left-edge draft management drawer
- `ui/components/DraftCard.tsx` - Individual draft card in Launchpad

---

## Appendix B: Performance Characteristics

**Hot Paths (optimized):**

- `extend` request resolution: **~5ms** (indexed lookup on `provider_contexts`)
- PARTIAL_RESULT → DOM update: **16ms** (batched via StreamingBuffer)
- Turn data access: **O(1)** (Map-based `turnsMapAtom`)

**Cold Paths (acceptable):**

- `recompute` request resolution: **~50ms** (multiple DB reads)
- History session load: **~200ms** (reconstruct full session from records)
- Initial app boot: **~500ms** (IndexedDB init + provider registry)

**Limits:**

- Max turn storage: **~10,000 turns** (beyond this, archive old sessions)
- Streaming buffer size: **50 updates** (flushed every 16ms)
- Provider fan-out: **5 concurrent** (hardcoded in orchestrator)

---

**End of Document**

This unified architecture overview provides a complete picture of the system. For hands-on work:

- Backend contributors: Focus on sections 2.1, 3, and 6
- Frontend contributors: Focus on sections 2.2, 2.3, 4, 5, and 6
- Full-stack contributors: Read sequentially

-
