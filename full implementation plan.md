# Implementation Plan: Cognitive Pipeline v2

> [!NOTE]
> This plan has been audited against the current Singularity codebase and corrected for accuracy.

## Strategic Overview

Current pipeline:
```
Batch → Mapper + Synthesis (parallel) → Refiner → Antagonist → [UI]
```

New pipeline:
```
Batch → Mapper v2 → [Mode Selection] → Explore | Understand | Decide → [UI]
                          ↓
                   Artifact Showcase
```

The key insight: Mapper becomes the stable foundation that all three modes consume.

---

## Codebase Reference

| Component | File Path | Purpose |
|-----------|-----------|---------|
| Workflow Engine | `src/core/workflow-engine.js` | Main pipeline execution (2831 lines) |
| Prompt Builder | `src/core/PromptService.ts` | Prompt construction (705 lines) |
| Parsing Utils | `shared/parsing-utils.ts` | Response parsing (949 lines) |
| Type Definitions | `shared/contract.ts` | Shared types (456 lines) |
| UI State | `ui/state/atoms.ts` | Jotai atoms (594 lines) |
| Chat Input | `ui/components/ChatInput.tsx` | Input component |
| Turn Rendering | `ui/components/AiTurnBlock.tsx` | AI turn display |

---

## Sprint Plan

### Phase 0: Preparation (1 day)

**Goal**: Create clean separation for new pipeline without breaking existing functionality.

| Task | Effort | Files to Modify |
|------|--------|-----------------|
| Create feature flag `USE_COGNITIVE_PIPELINE` | 0.5 hr | `ui/state/atoms.ts` |
| Sync flag to chrome.storage.local for backend | 0.5 hr | `ui/state/atoms.ts` |
| Create directory `src/core/cognitive/` | 0.25 hr | New directory |
| Create directory `ui/components/cognitive/` | 0.25 hr | New directory |
| Create directory `ui/components/cognitive/containers/` | 0.25 hr | New directory |
| Document flag usage pattern | 0.25 hr | Comments |

---

### Phase 1: Mapper v2 — The Foundation (3 days)

**Goal**: Mapper produces MapperArtifact with three passes + metadata.

| Task | Effort | Priority | Files |
|------|--------|----------|-------|
| Define MapperArtifact interface | 2 hr | P0 | `shared/contract.ts` |
| Define CognitiveMode type | 0.5 hr | P0 | `shared/contract.ts` |
| Add mode field to InitializeRequest/ExtendRequest | 0.5 hr | P0 | `shared/contract.ts` |
| Write `parseMapperArtifact()` parser | 4 hr | P0 | `shared/parsing-utils.ts` |
| Write `createEmptyMapperArtifact()` helper | 0.5 hr | P0 | `shared/parsing-utils.ts` |
| Write `buildMapperV2Prompt()` method | 4 hr | P0 | `src/core/PromptService.ts` |
| Add feature flag check in workflow execute() | 1 hr | P0 | `src/core/workflow-engine.js` |
| Branch mappingLoop() based on flag | 3 hr | P0 | `src/core/workflow-engine.js` |
| Test: Run 10 diverse queries, validate artifact | 2 hr | P0 | Manual |

**Deliverable**: Mapper produces MapperArtifact that all three modes will consume.

---

### Phase 2: Escape Velocity + Mode Selection UI (2 days)

**Goal**: Build routing logic and mode selection UI.

| Task | Effort | Priority | Files |
|------|--------|----------|-------|
| Create `ModeSelector.tsx` component | 3 hr | P0 | `ui/components/cognitive/ModeSelector.tsx` |
| Add `selectedModeAtom` | 0.5 hr | P0 | `ui/state/atoms.ts` |
| Integrate ModeSelector into ChatInput.tsx | 2 hr | P0 | `ui/components/ChatInput.tsx` |
| Pass mode in useChat.ts request | 1 hr | P0 | `ui/hooks/chat/useChat.ts` |
| Create mode-detector.ts utility | 3 hr | P1 | `src/core/cognitive/mode-detector.ts` |
| Implement escape velocity check | 2 hr | P1 | `src/core/cognitive/mode-detector.ts` |
| Implement query type classifier | 2 hr | P1 | `src/core/cognitive/mode-detector.ts` |
| Implement mode recommendation logic | 2 hr | P1 | `src/core/cognitive/mode-detector.ts` |

**Deliverable**: User can select mode before sending, system can auto-recommend.

---

### Phase 3: Explore Mode — Triage (4 days)

**Goal**: First cognitive mode with four container types.

| Task | Effort | Priority | Files |
|------|--------|----------|-------|
| Define ExploreOutput + content interfaces | 2 hr | P0 | `shared/contract.ts` |
| Write `parseExploreOutput()` parser | 3 hr | P0 | `shared/parsing-utils.ts` |
| Write `buildExplorePrompt()` | 4 hr | P0 | `src/core/PromptService.ts` |
| Create `executeExploreStep()` | 3 hr | P0 | `src/core/workflow-engine.js` |
| Build DirectAnswerContainer.tsx | 3 hr | P0 | `ui/components/cognitive/containers/` |
| Build DecisionTreeContainer.tsx | 4 hr | P1 | `ui/components/cognitive/containers/` |
| Build ComparisonMatrixContainer.tsx | 5 hr | P1 | `ui/components/cognitive/containers/` |
| Build ExplorationSpaceContainer.tsx | 4 hr | P1 | `ui/components/cognitive/containers/` |
| Build ContainerWrapper.tsx | 2 hr | P0 | `ui/components/cognitive/containers/` |
| Build souvenir component | 1 hr | P0 | `ui/components/cognitive/` |

**Deliverable**: User selects Explore, sees container-appropriate output.

---

### Phase 4: Understand Mode — Synthesis (3 days)

**Goal**: Adapt synthesis to work from MapperArtifact with The One / The Echo.

| Task | Effort | Priority | Files |
|------|--------|----------|-------|
| Define UnderstandOutput interface | 1 hr | P0 | `shared/contract.ts` |
| Write `parseUnderstandOutput()` parser | 2 hr | P0 | `shared/parsing-utils.ts` |
| Write `buildUnderstandPrompt()` | 3 hr | P0 | `src/core/PromptService.ts` |
| Create `executeUnderstandStep()` | 2 hr | P0 | `src/core/workflow-engine.js` |
| Build UnderstandOutputView.tsx | 3 hr | P0 | `ui/components/cognitive/` |
| Build TheOneCard.tsx | 1 hr | P0 | `ui/components/cognitive/` |
| Build TheEchoCard.tsx | 1 hr | P1 | `ui/components/cognitive/` |

**Deliverable**: User selects Understand, sees frame-finding synthesis with The One.

---

### Phase 5: Decide Mode — Gauntlet (3 days)

**Goal**: Stress-test artifact, eliminate weak claims, deliver decisive answer.

| Task | Effort | Priority | Files |
|------|--------|----------|-------|
| Define GauntletOutput interface | 1.5 hr | P0 | `shared/contract.ts` |
| Write `parseGauntletOutput()` parser | 3 hr | P0 | `shared/parsing-utils.ts` |
| Write `buildGauntletPrompt()` | 5 hr | P0 | `src/core/PromptService.ts` |
| Create `executeGauntletStep()` | 3 hr | P0 | `src/core/workflow-engine.js` |
| Build GauntletOutputView.tsx | 4 hr | P0 | `ui/components/cognitive/` |
| Build ConfidenceIndicator.tsx | 1 hr | P1 | `ui/components/cognitive/` |
| Build SurvivorsSection.tsx | 2 hr | P1 | `ui/components/cognitive/` |
| Build EliminatedSection.tsx | 2 hr | P1 | `ui/components/cognitive/` |

**Deliverable**: User selects Decide, sees stress-tested answer with survivors.

---

### Phase 6: Artifact Showcase (3 days)

**Goal**: Trophy case UI for artifact display and context selection.

| Task | Effort | Priority | Files |
|------|--------|----------|-------|
| Add `selectedArtifactsAtom` | 1 hr | P0 | `ui/state/atoms.ts` |
| Build ArtifactShowcase.tsx container | 3 hr | P0 | `ui/components/cognitive/` |
| Build SouvenirCard.tsx | 1 hr | P0 | `ui/components/cognitive/` |
| Build ConsensusCard.tsx | 2 hr | P0 | `ui/components/cognitive/` |
| Build OutlierCard.tsx | 2 hr | P0 | `ui/components/cognitive/` |
| Build GhostCard.tsx | 1 hr | P2 | `ui/components/cognitive/` |
| Build RawResponseCard.tsx | 2 hr | P1 | `ui/components/cognitive/` |
| Build SelectionBar.tsx | 2 hr | P0 | `ui/components/cognitive/` |
| Wire context injection into useChat.ts | 3 hr | P0 | `ui/hooks/chat/useChat.ts` |

**Deliverable**: User can browse artifacts, select items, carry forward to next turn.

---

### Phase 7: Mode Transitions + Caching (2 days)

**Goal**: Switch modes on same artifact without reprocessing.

| Task | Effort | Priority | Files |
|------|--------|----------|-------|
| Extend AiTurn with mode output fields | 1 hr | P0 | `ui/types/index.ts` |
| Create useModeSwitching hook | 3 hr | P0 | `ui/hooks/cognitive/` |
| Build TransitionBar.tsx | 2 hr | P0 | `ui/components/cognitive/` |
| Add ModeSwitchRequest type | 1 hr | P0 | `shared/contract.ts` |
| Handle mode switch in workflow-engine | 3 hr | P0 | `src/core/workflow-engine.js` |
| Cache mode outputs per turn | 2 hr | P1 | `src/core/workflow-engine.js` |

**Deliverable**: User can flow between modes on same turn.

---

### Phase 8: Clarification Screen (1 day)

**Goal**: Handle deflected consensus with context gathering.

| Task | Effort | Priority | Files |
|------|--------|----------|-------|
| Build ClarificationScreen.tsx | 3 hr | P1 | `ui/components/cognitive/` |
| Wire deflected routing | 2 hr | P1 | `src/core/workflow-engine.js` |
| Handle context re-query | 2 hr | P1 | `src/core/workflow-engine.js` |
| Handle "Skip" action | 1 hr | P1 | UI component |

**Deliverable**: Deflected queries route to clarification, then proceed.

---

### Phase 9: Polish + Error Handling (2 days)

**Goal**: Graceful degradation and error recovery.

| Task | Effort | Priority | Files |
|------|--------|----------|-------|
| Add loading states per phase | 2 hr | P0 | UI components |
| Mapper failure fallback | 2 hr | P0 | `src/core/workflow-engine.js` |
| Mode failure fallback | 2 hr | P0 | `src/core/workflow-engine.js` |
| Retry buttons | 2 hr | P1 | UI components |
| "Try different model" option | 2 hr | P2 | UI + backend |
| Test error scenarios | 3 hr | P0 | Manual |

**Deliverable**: System degrades gracefully, user never loses information.

---

### Phase 10: Final Integration (1 day)

**Goal**: Wire everything together with master routing.

| Task | Effort | Priority | Files |
|------|--------|----------|-------|
| Master routing logic | 3 hr | P0 | `src/core/workflow-engine.js` |
| New message types | 1 hr | P0 | `shared/contract.ts` |
| Update usePortMessageHandler | 2 hr | P0 | `ui/hooks/chat/usePortMessageHandler.ts` |
| Create CognitiveOutputRenderer | 2 hr | P0 | `ui/components/cognitive/` |
| Integrate into AiTurnBlock | 2 hr | P0 | `ui/components/AiTurnBlock.tsx` |

**Deliverable**: Complete cognitive pipeline working end-to-end.

---

## Timeline Summary

| Phase | Days | Cumulative |
|-------|------|------------|
| 0: Preparation | 1 | 1 |
| 1: Mapper v2 | 3 | 4 |
| 2: Mode Selection | 2 | 6 |
| 3: Explore Mode | 4 | 10 |
| 4: Understand Mode | 3 | 13 |
| 5: Decide Mode | 3 | 16 |
| 6: Artifact Showcase | 3 | 19 |
| 7: Mode Transitions | 2 | 21 |
| 8: Clarification | 1 | 22 |
| 9: Polish | 2 | 24 |
| 10: Integration | 1 | 25 |
| **Total** | **~25 working days** | **(5 weeks)** |

---

## Minimum Viable Launch (2 weeks)

Ship with:
- Phase 0 + 1 (Mapper v2) — 4 days
- Phase 2 (Mode Selection, simplified) — 1 day
- Phase 3 (Explore Mode, DirectAnswer only) — 2 days
- Phase 4 (Understand Mode) — 3 days
- Phase 6 (Artifact Showcase, basic) — 2 days

**MVP: 12 days** — Users get Explore + Understand with artifact display.

Add Decide mode and polish in fast-follow.

---

## Known Gaps in Architecture Document

> [!WARNING]
> The following items are referenced but not fully specified in `New singularity.md`:

1. **Part 3C: Decide Mode** - Only the GauntletOutput schema exists (in appendix). The detailed processing logic, stress-test criteria, and elimination rules need to be derived from the schema.

2. **Clarification Screen Logic** - The variable extraction for deflected queries needs implementation detail.

3. **Context Bridging Format** - The XML-like injection format is shown but exact integration with existing batch prompts needs specification.
