# IDE Agent Prompts - Corrected for Singularity Codebase

> [!IMPORTANT]
> These prompts have been corrected to accurately reflect the Singularity codebase structure.
> Types should be added to `shared/contract.ts`, parsers to `shared/parsing-utils.ts`.

---

## Prompt 1: Foundation — Create MapperArtifact and Parser

```text
I'm building a new Mapper layer for my multi-model AI synthesis pipeline. The Mapper receives raw outputs from 6 AI models and needs to produce a structured artifact.

CODEBASE CONTEXT:
- Types shared between backend/UI live in `shared/contract.ts`
- Parsing utilities are in `shared/parsing-utils.ts`
- Existing parsers like `parseRefinerOutput` and `parseAntagonistOutput` demonstrate the pattern
- UI types extend shared types in `ui/types/index.ts`

The artifact structure is:

MapperArtifact {
  consensus: {
    claims: array of { text, supporters (model indices), support_count }
    quality: "resolved" | "conventional" | "deflected"
    strength: number 0-1
  }
  outliers: array of {
    insight: string
    source: model name
    source_index: number
    type: "supplemental" | "frame_challenger"
    raw_context: string (10-20 words surrounding context)
  }
  topology: "high_confidence" | "dimensional" | "contested"
  ghost: string | null
  query: string
  turn: number
  timestamp: string
  model_count: number
}

TASK 1: Add the TypeScript interfaces to `shared/contract.ts`:
- MapperArtifact (as shown above)
- CognitiveMode type: "auto" | "explore" | "understand" | "decide"
- Add mode field to InitializeRequest and ExtendRequest interfaces

TASK 2: Create parser functions in `shared/parsing-utils.ts`:
- `parseMapperArtifact(text: string): MapperArtifact`
- Follow the existing pattern from `parseRefinerOutput` (lines 353-375)
- Expects sections: ===CONSENSUS===, ===OUTLIERS===, ===METADATA===
- Falls back gracefully with sensible defaults
- Create `createEmptyMapperArtifact()` helper like existing `createEmptyAntagonistOutput()`

TASK 3: Create the directory structure:
- `src/core/cognitive/` (for future cognitive pipeline code)
- `ui/components/cognitive/` (for mode UI components)
- `ui/components/cognitive/containers/` (for Explore mode containers)

TASK 4: Add `USE_COGNITIVE_PIPELINE` feature flag:
- Add to `ui/state/atoms.ts` as `atomWithStorage<boolean>('htos_cognitive_pipeline', false)`
- This will be read by both UI and backend (sync to chrome.storage.local for backend access)
```

---

## Prompt 2: Mapper v2 — Integration into Workflow Engine

```text
I need to integrate the new Mapper v2 into the workflow engine. 

CODEBASE CONTEXT:
- Main workflow execution is in `WorkflowEngine.execute()` (lines 471-1054 of workflow-engine.js)
- Mapping currently happens in the `mappingLoop()` function (lines 655-728)
- Prompts are built via `PromptService.ts` with methods like `buildMappingPrompt`
- Current mapping uses ResponseProcessor for parsing

The existing mapping flow:
1. `mappingLoop()` calls `buildMappingPrompt()` 
2. Sends to mapping provider via orchestrator
3. Response parsed for options and topology

The new flow should:
1. Check if `USE_COGNITIVE_PIPELINE` flag is true (read from chrome.storage.local)
2. If true, use `buildMapperV2Prompt` instead of `buildMappingPrompt`
3. Parse response using new `parseMapperArtifact()` from `shared/parsing-utils.ts`
4. Store `MapperArtifact` in stepResult under `mapperArtifact` field

TASK 1: Add feature flag check at the start of workflow execution:
- Read `USE_COGNITIVE_PIPELINE` from chrome.storage.local (async)
- Store in context object for use throughout workflow

TASK 2: In `PromptService.ts`, add `buildMapperV2Prompt` method:
- Accept: original user query, batch outputs array
- Construct prompt with three-pass instructions:
  - Pass 1: Consensus extraction (≥2 models agree in essence)
  - Pass 2: Outlier extraction (unique to one model)
  - Pass 3: Semantic logic collapse
- Include metadata annotation instructions (quality, topology, ghost)
- Output format with ===CONSENSUS===, ===OUTLIERS===, ===METADATA=== sections

TASK 3: Modify `mappingLoop()` to branch based on feature flag:
- When new pipeline: call buildMapperV2Prompt, parse with parseMapperArtifact
- Store artifact in `stepResults.mapping.mapperArtifact`
- Keep old path unchanged when flag is false

TASK 4: Update MappingStepPayload in `shared/contract.ts`:
- Add `mapperArtifact?: MapperArtifact` field
- Add `useCognitivePipeline?: boolean` field
```

---

## Prompt 3: Mode Selection UI Component

```text
I need a mode selection component that appears in the chat input area.

CODEBASE CONTEXT:
- Chat input is in `ui/components/ChatInput.tsx`
- State atoms are in `ui/state/atoms.ts`
- Request types are in `shared/contract.ts` (InitializeRequest, ExtendRequest)
- useChat hook is in `ui/hooks/chat/useChat.ts`
- Styling should match existing components like `NudgeChipBar.tsx`

The modes are:
- Auto (system decides based on query + artifact shape)
- Explore (🔍) — "Show me what exists"
- Understand (🧠) — "Help me make sense of this"  
- Decide (⚡) — "Just tell me what to do"

TASK 1: Create `ui/components/cognitive/ModeSelector.tsx`:
- Horizontal segmented control with mode icons and labels
- Highlights selected mode
- Fires onChange with mode value
- Only visible when `USE_COGNITIVE_PIPELINE` flag is true

TASK 2: Add to `ui/state/atoms.ts`:
- selectedModeAtom: atomWithStorage<CognitiveMode>("htos_selected_mode", "auto")
- Use CognitiveMode type from shared/contract.ts

TASK 3: Integrate ModeSelector into `ChatInput.tsx`:
- Position above the textarea, conditionally visible
- Import and use feature flag atom to control visibility
- Read from selectedModeAtom
- Update atom when user changes selection

TASK 4: Modify `ui/hooks/chat/useChat.ts`:
- Read selectedModeAtom value using useAtomValue
- Include mode field when building initialize/extend requests
- The mode field was already added to contract.ts in Prompt 1
```

---

## Prompt 4: Explore Mode — Container Components

```text
I'm building the Explore mode which displays results in one of four container types.

CODEBASE CONTEXT:
- Turn rendering is in `ui/components/AiTurnBlock.tsx`
- Synthesis display is in `ui/components/SynthesisBubble.tsx` 
- Decision map components are in `ui/components/DecisionMapSheet.tsx`
- Streaming updates use `workflowProgressAtom` pattern from `atoms.ts`
- Step execution patterns: see `executeRefinerStep` (lines 1440-1605) in workflow-engine.js

Containers:
1. DirectAnswer — Simple answer with optional additional context
2. DecisionTree — Default path with conditional branches
3. ComparisonMatrix — Dimensions with winners and trade-offs
4. ExplorationSpace — Multiple paradigms with no default

TASK 1: Add ExploreOutput types to `shared/contract.ts`:
```typescript
interface DirectAnswerContent {
  answer: string;
  additional_context: Array<{ text: string; source: string }>;
}
interface DecisionTreeContent {
  default_path: string;
  conditions: Array<{ condition: string; path: string; source: string; reasoning: string }>;
  frame_challenger?: { position: string; source: string; consider_if: string };
}
interface ComparisonContent {
  dimensions: Array<{ name: string; winner: string; sources: string[]; tradeoff: string }>;
  matrix: { approaches: string[]; dimensions: string[]; scores: number[][] };
}
interface ExplorationContent {
  paradigms: Array<{ name: string; source: string; core_idea: string; best_for: string }>;
  common_thread?: string;
  ghost?: string;
}
interface ExploreOutput {
  container: "direct_answer" | "decision_tree" | "comparison_matrix" | "exploration_space";
  content: DirectAnswerContent | DecisionTreeContent | ComparisonContent | ExplorationContent;
  souvenir: string;
  alternatives: Array<{ container: string; label: string }>;
  artifact_id: string;
}
```

TASK 2: Create directory `ui/components/cognitive/containers/` with:
- DirectAnswerContainer.tsx
- DecisionTreeContainer.tsx
- ComparisonMatrixContainer.tsx
- ExplorationSpaceContainer.tsx
- ContainerWrapper.tsx (mode indicator + transitions)
- index.ts (barrel export)

TASK 3: Add explore parser to `shared/parsing-utils.ts`:
- `parseExploreOutput(text: string): ExploreOutput`
- `createEmptyExploreOutput(): ExploreOutput`
- Follow pattern from parseRefinerOutput

TASK 4: In `workflow-engine.js`, add `executeExploreStep(step, context, stepResults)`:
- Follow pattern from `executeRefinerStep`
- Requires `mapperArtifact` from mapping step
- Builds explore prompt via new `PromptService.buildExplorePrompt()`
- Parses response with `parseExploreOutput()`
- Emits streaming updates via existing PARTIAL_RESULT pattern

TASK 5: Add explore prompt builder to `PromptService.ts`:
- buildExplorePrompt(originalPrompt: string, mapperArtifact: MapperArtifact): string
- Include query type classification logic
- Include container selection guidance
- Output format matching parser expectations
```

---

## Prompt 5: Artifact Showcase Component

```text
I need an Artifact Showcase component that displays all extracted artifacts from a turn and allows users to select items to carry forward as context.

CODEBASE CONTEXT:
- Panel patterns exist in `ui/components/HistoryPanel.tsx` and `ui/components/DecisionMapSheet.tsx`
- Existing copy functionality in `ui/components/CopyButton.tsx`
- Turn data structure in `ui/types/index.ts` (AiTurn interface)
- Atom patterns in `ui/state/atoms.ts`

The showcase displays:
- Souvenir (one-liner summary, always visible)
- Consensus (expandable, shows quality badge and strength indicator)
- Outliers (list with type badges: ⚡ for frame-challenger, 💡 for supplemental)
- Ghost (if detected, subtle styling)
- Raw Responses (collapsed accordion with model names)

TASK 1: Create `ui/components/cognitive/ArtifactShowcase.tsx`:
- Accepts MapperArtifact as prop
- Renders each section with visual hierarchy
- Handles expand/collapse per section
- Manages selection state

TASK 2: Add selection atoms to `ui/state/atoms.ts`:
- selectedArtifactsAtom: atomWithImmer<Set<string>> for selected artifact IDs
- Add helper for computing estimated token count

TASK 3: Create individual card components in `ui/components/cognitive/`:
- SouvenirCard.tsx — Bold text, copy button
- ConsensusCard.tsx — Claims list, quality badge, strength dots
- OutlierCard.tsx — Insight text, source badge, type icon
- GhostCard.tsx — Italic text, muted styling
- RawResponseCard.tsx — Model name, truncated preview, expandable

TASK 4: Create SelectionBar.tsx:
- Shows at bottom when items selected
- Lists selected items (truncated)
- Shows "Clear All" button
- Optionally shows estimated token count

TASK 5: Wire selection into context injection:
- In `useChat.ts`, when building extend request, check selectedArtifactsAtom
- Build context block from selected items using XML-like format
- Add to request payload for batch prompt injection
```

---

## Prompt 6: Decide Mode — Gauntlet Processing

```text
I'm building the Decide (Gauntlet) mode. It takes the MapperArtifact, stress-tests every claim, eliminates weak ones, and returns a decisive answer.

CODEBASE CONTEXT:
- Step execution patterns in `workflow-engine.js` (see executeRefinerStep, executeAntagonistStep)
- Parsing patterns in `shared/parsing-utils.ts`
- Type definitions in `shared/contract.ts`
- UI output patterns in `ui/components/SynthesisBubble.tsx`

Output structure (GauntletOutput):
{
  the_answer: { statement, reasoning, next_step }
  survivors: {
    primary: { claim, survived_because }
    supporting: array of { claim, relationship }
    conditional: array of { claim, condition }
  }
  eliminated: {
    from_consensus: array of { claim, killed_because }
    from_outliers: array of { claim, source, killed_because }
    ghost: string | null
  }
  confidence: { score (0-1), display (dots), notes (array) }
  souvenir: string
  artifact_id: string
}

TASK 1: Add GauntletOutput interface to `shared/contract.ts`

TASK 2: Create parser in `shared/parsing-utils.ts`:
- parseGauntletOutput(text: string): GauntletOutput
- createEmptyGauntletOutput(): GauntletOutput
- Expects sections: ===THE_ANSWER===, ===SURVIVORS===, ===ELIMINATED===, ===CONFIDENCE===, ===SOUVENIR===
- Calculate confidence display (dots) from score

TASK 3: In `workflow-engine.js`, add `executeGauntletStep(step, context, stepResults)`:
- Follow pattern from executeAntagonistStep
- Requires mapperArtifact from previous step
- Builds gauntlet prompt via PromptService.buildGauntletPrompt()
- Parses response with parseGauntletOutput()
- Emits streaming via PARTIAL_RESULT pattern

TASK 4: Add prompt builder to `PromptService.ts`:
- buildGauntletPrompt(originalPrompt: string, mapperArtifact: MapperArtifact): string
- Include stress-test instructions for each claim
- Include elimination criteria
- Include confidence scoring guidelines

TASK 5: Create `ui/components/cognitive/GauntletOutputView.tsx`:
- Display The Answer prominently (statement, reasoning, next step)
- Show confidence indicator (dots or progress bar)
- Expandable Survivors section
- Expandable Eliminated section (kill rationale)
- Souvenir bar with copy button
- Transition prompts to other modes
```

---

## Prompt 7: Understand Mode — Synthesis Adaptation

```text
I'm building the Understand mode which adapts the existing synthesis to consume MapperArtifact and adds The One / The Echo extraction.

CODEBASE CONTEXT:
- Current synthesis prompt in `PromptService.buildSynthesisPrompt()` (lines 138-215)
- Current synthesis execution in workflow-engine.js
- UI rendering in `SynthesisBubble.tsx`
- The current synthesis is sophisticated - we're adapting, not replacing

Output structure (UnderstandOutput):
{
  short_answer: string (frame crystallized in 1-2 paragraphs)
  long_answer: string (frame inhabited - full synthesis)
  the_one: { insight, source (or null if emergent), why_this } | null
  the_echo: { position, source, merit } | null
  souvenir: string
  artifact_id: string
}

TASK 1: Add UnderstandOutput interface to `shared/contract.ts`

TASK 2: Create parser in `shared/parsing-utils.ts`:
- parseUnderstandOutput(text: string): UnderstandOutput
- createEmptyUnderstandOutput(): UnderstandOutput
- Expects sections for short/long answer, THE_ONE, THE_ECHO, SOUVENIR

TASK 3: Add prompt builder to `PromptService.ts`:
- buildUnderstandPrompt(originalPrompt: string, mapperArtifact: MapperArtifact): string
- Include frame-finding instructions (find meta-perspective)
- Include The One extraction (pivot insight)
- Include The Echo extraction (surviving contrarian)
- Build on existing synthesis philosophy in buildSynthesisPrompt

TASK 4: In `workflow-engine.js`, add `executeUnderstandStep(step, context, stepResults)`:
- Similar to executeGauntletStep
- Requires mapperArtifact
- Calls buildUnderstandPrompt
- Parses with parseUnderstandOutput

TASK 5: Create `ui/components/cognitive/UnderstandOutputView.tsx`:
- Display short answer prominently
- Expandable long answer section
- THE ONE card (💡 icon, insight, source, why)
- THE ECHO card (🔄 icon, position, source, merit) - only if exists
- Souvenir bar
- Transition prompts
```

---

## Prompt 8: Mode Transitions and Caching

```text
Users should be able to switch between modes on the same turn without re-running batch or mapper.

CODEBASE CONTEXT:
- AiTurn interface in `ui/types/index.ts`
- Turn state in `ui/state/atoms.ts` (turnsMapAtom)
- Recompute patterns in `usePortMessageHandler.ts`
- Message types in `shared/contract.ts`

TASK 1: Extend AiTurn type in `ui/types/index.ts`:
- Add optional fields: exploreOutput, understandOutput, gauntletOutput
- Add mapperArtifact field

TASK 2: Create useModeSwitching hook in `ui/hooks/cognitive/`:
- Takes current aiTurnId and target mode
- Checks if output already exists in turn state
- If yes, just switch the active view
- If no, triggers mode processing request
- Returns { switchMode, isProcessing, currentMode, availableModes }

TASK 3: Add mode switch request type to `shared/contract.ts`:
- ModeSwitchRequest with aiTurnId, targetMode, sessionId
- Or reuse RecomputeRequest pattern with stepType extension

TASK 4: Create TransitionBar component in `ui/components/cognitive/`:
- Shows after mode output
- Displays buttons for other modes
- Grays out current mode
- Shows loading state when switching
- Uses useModeSwitching hook

TASK 5: Handle mode switch in workflow-engine:
- New handler or extend recompute handler
- Fetch MapperArtifact from persisted turn
- Run only the target mode's processing step
- Return output without creating new turn
```

---

## Prompt 9: Escape Velocity and Auto Mode Detection

```text
When all models strongly agree and there are no meaningful outliers, skip mode processing. When mode is "auto", detect the best mode.

CODEBASE CONTEXT:
- MapperArtifact structure has consensus.quality, consensus.strength, topology, outliers
- Workflow execution in workflow-engine.js
- Create utilities in src/core/cognitive/ directory

Escape velocity conditions:
- consensus.quality === "resolved"
- consensus.strength >= 0.9
- No frame_challengers in outliers
- topology === "high_confidence"

TASK 1: Create `src/core/cognitive/mode-detector.ts`:
- checkEscapeVelocity(artifact: MapperArtifact): boolean
- detectQueryType(query: string): QueryType
- recommendMode(query: string, artifact: MapperArtifact): { mode, confidence, reasoning }

TASK 2: Query type detection rules:
- "What is", "Define", "Explain" → INFORMATIONAL
- "How do I", "Steps to" → PROCEDURAL  
- "Should I", "What's best" → ADVISORY
- "Compare", "X vs Y" → COMPARATIVE
- "Write", "Create", "Brainstorm" → CREATIVE
- Default: GENERAL

TASK 3: Mode recommendation logic:
- If escape velocity → return { mode: "escape", reasoning }
- If COMPARATIVE or CREATIVE → explore
- If INFORMATIONAL with contested topology → explore
- If frame_challenger present → understand
- If ADVISORY with high_confidence → decide
- If PROCEDURAL with resolved → decide
- Default based on topology

TASK 4: Integrate into workflow after mapper completes:
- Call checkEscapeVelocity
- If escape: create DirectAnswer from consensus, skip mode step
- If not escape and mode is "auto": call recommendMode
- Use recommended mode for processing
- Store detection results for UI display

TASK 5: Show auto-detection in UI:
- Add autoDetectedMode field to turn state
- Display: "Auto-detected: Explore (comparative query)"
- Allow override button to switch modes
```

---

## Prompt 10: Final Integration

```text
Wire together all cognitive pipeline pieces into a cohesive flow.

Components built:
- MapperArtifact type and parser
- Mapper v2 prompt and integration
- Mode selector UI and atom
- Explore mode with 4 containers
- Understand mode
- Decide mode (Gauntlet)
- Artifact Showcase
- Mode transitions and caching
- Escape velocity and auto-detection

TASK 1: Create master routing in workflow-engine.js:
- After batch, check USE_COGNITIVE_PIPELINE flag
- If true: run Mapper v2 instead of old mapper
- Check escape velocity
- If escape: emit ESCAPE_VELOCITY message with direct answer
- If not: check mode (user-selected or auto-detected)
- Run appropriate mode step
- Emit mode-specific completion message

TASK 2: Add new message types to shared/contract.ts:
- MAPPER_V2_COMPLETE with MapperArtifact
- ESCAPE_VELOCITY with direct answer
- EXPLORE_COMPLETE with ExploreOutput
- UNDERSTAND_COMPLETE with UnderstandOutput
- GAUNTLET_COMPLETE with GauntletOutput

TASK 3: Update usePortMessageHandler.ts:
- Handle new message types
- Update turnsMapAtom with mode outputs
- Handle escape velocity rendering

TASK 4: Create CognitiveOutputRenderer in ui/components/cognitive/:
- Receives aiTurn
- Checks which mode outputs exist
- Renders appropriate output component
- Falls back to Showcase if mode failed
- Shows TransitionBar below output

TASK 5: Integrate into AiTurnBlock.tsx:
- Check USE_COGNITIVE_PIPELINE flag
- If true: render CognitiveOutputRenderer for cognitive turns
- Show Showcase in collapsible panel or tab
- Ensure raw responses still accessible

TASK 6: Add error boundaries:
- If mapper fails: show raw batch with retry
- If mode fails: show artifact with retry
- Never lose user's query or batch responses

Test the complete flow:
1. Enable feature flag
2. Send query with mode selected
3. See container/understand/gauntlet output
4. Switch modes on same artifact
5. Select artifacts for next turn
6. Send follow-up with context injection
```