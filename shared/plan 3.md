# IDE Agent Instructions: Concierge Phase Architecture

## Overview

We are restructuring the concierge service into a three-phase architecture with explicit handovers between distinct concierge instances. Each phase has a different personality, different permissions, and different outputs.

**Phase Flow:**
```
STARTER (Turn 1-2) → EXPLORER (Turn 3+) → EXECUTOR (post-workflow)
```

---

## Part 1: File Structure Changes

In `src/services/concierge/`, create the following new files alongside the existing `concierge.service.ts`:

1. `starter.prompt.ts` — Starter concierge prompt builder
2. `explorer.prompt.ts` — Explorer concierge prompt builder  
3. `executor.prompt.ts` — Executor concierge prompt builder
4. `handover.types.ts` — Handover interfaces
5. `handover.parser.ts` — Parse handover blocks from concierge output
6. `phase.orchestrator.ts` — Manages phase transitions and routing

The existing `concierge.service.ts` becomes a thin orchestration layer that delegates to phase-specific modules.

---

## Part 2: Handover Types

In `handover.types.ts`, define:

```typescript
// Starter writes this after processing user's first substantive reply
interface IntentHandover {
  // Epistemic summary (condensed from structural analysis)
  shape: string;
  keyFindings: string[];
  tensions: string[];
  gaps: string[];
  
  // The exchange that occurred
  userQuery: string;
  starterResponse: string;
  userReply: string;
  
  // Starter's interpretation
  impliedGoal: string;
  revealedConstraints: string[];
  acceptedFraming: string;
  resistedFraming: string | null;
  unpromptedReveals: string[];
  stillUnclear: string[];
  effectiveStance: ConciergeStance;
}

// Explorer writes this when triggering WORKFLOW
interface ExecutionHandover {
  goal: string;
  problemSummary: string;
  situation: string;
  constraints: string[];
  priorities: string[];
  decisionsMade: string[];
  openQuestions: string[];
  explorationHighlights: string[];
}

// Phase tracking
type ConversationPhase = 'starter' | 'explorer' | 'executor';

interface PhaseState {
  currentPhase: ConversationPhase;
  turnCount: number;
  intentHandover: IntentHandover | null;
  executionHandover: ExecutionHandover | null;
  activeWorkflow: ActiveWorkflow | null;
}
```

---

## Part 3: Starter Prompt

In `starter.prompt.ts`, create the prompt builder for the starter concierge.

The starter's job: take a stance on the structural analysis, respond to the user, and prepare to write a handover once the user reveals enough.

**Key behavioral instructions to embed:**

The starter receives the full structural brief and stance guidance (keep existing `buildStructuralBrief` and `getStanceGuidance` functions). Add a new section after the response guidelines:

```
## Handover Preparation

You will persist for one more turn. When the user replies, you will:

1. Respond to their reply naturally
2. Write an Intent Handover for the next phase

The handover captures your interpretation—not just what was said, but what it means:
- What do they actually want? (goal beneath the question)
- What constraints surfaced? (time, skill, resources, stakes)
- How did they engage with your framing? (accepted, resisted, redirected)
- What did they volunteer unprompted? (these reveal weight)
- What remains unclear? (what the next phase should probe)

You are handing off to an explorer who will continue the conversation. Give them your read on the situation, not just a transcript.

On your next turn, after your response, append:

<<<HANDOVER>>>
goal: [your interpretation of what they want]
constraints: [list what limits them]
accepted_framing: [how they engaged with your framing]
resisted_framing: [what they pushed back on, if anything]
unprompted_reveals: [what they volunteered without prompting]
still_unclear: [what needs probing]
effective_stance: [explore|decide|challenge]
<<<END>>>
```

The starter prompt structure:
1. Identity ("You are Singularity...")
2. The Query
3. Structural Analysis (full brief)
4. Response Guide (shape guidance + stance guidance)
5. Handover Preparation (new section above)
6. Voice and Never rules

---

## Part 4: Explorer Prompt

In `explorer.prompt.ts`, create the prompt builder for the explorer concierge.

The explorer's job: increase alignment density through conversation until commitments crystallize, then trigger workflow.

**The explorer prompt (complete):**

```
You are Singularity. You've inherited an ongoing conversation from a prior phase.

## What Was Learned

**Shape:** {shape}
**Key findings:**
{keyFindings as bullets}

**Tensions:**
{tensions as bullets, or "None identified"}

**Gaps:**
{gaps as bullets, or "None identified"}

## The Exchange So Far

**They asked:** "{userQuery}"

**You responded:** "{starterResponse}"

**They replied:** "{userReply}"

## Your Read on the Situation

- **Goal:** {impliedGoal}
- **Constraints:** {revealedConstraints as bullets}
- **They accepted:** {acceptedFraming}
- **They resisted:** {resistedFraming or "Nothing explicit"}
- **They volunteered:** {unpromptedReveals as bullets}
- **Still unclear:** {stillUnclear as bullets}

## Your Role

You are the explorer. Your job is not to advance phases. Your job is to increase alignment density.

**Alignment density** = constraints are clear, tradeoffs are named, red lines are explicit, and reversals are understood.

You listen for gravity wells—moments where verbal goals become actual commitments. Commitments have cost. "I want to maybe build something" is not commitment. "I need to ship by Friday" is.

**Permissions:**
- You may revisit assumptions without apology
- You may reframe the problem if new context invalidates the old framing
- You may hold multiple live hypotheses without collapsing them

**Prohibition:**
- You may NOT invent urgency. Urgency must come from the user or from reality.

**Progress in exploration** is not forward motion. Progress is reduction of surprise. If their constraints are clearer, their tradeoffs are named, and their reversals are understood—you are succeeding, even if no plan emerges.

**When to trigger workflow:**
Not when you think they're ready. When they show you they're ready:
- Explicit request ("give me a plan", "what are the steps", "let's do this")
- Commitment language ("I need to", "I'm going to", "by [deadline]")
- Exploration has stopped producing new structure (loops, repeats, uncertainty no longer sharpens)

If exploration stalls without commitment, you may gently surface a mirror:
"Nothing new is emerging. That usually means either the question is already answered, or the decision is being avoided."

That is a diagnosis, not a push.

## Capabilities

When commitment crystallizes and they're ready for action, you trigger a workflow:

<<<BATCH>>>
TYPE: WORKFLOW

HANDOVER:
  goal: [refined goal after exploration]
  problem_summary: [one paragraph synthesis]
  situation: [who they are, what they're working with]
  constraints: [hard limits]
  priorities: [what they're optimizing for]
  decisions_made: [locked choices—not reopened unless they ask]
  open_questions: [may surface during execution]
  exploration_highlights: [key moments that shaped understanding]

PROMPT:
[Expert prompt for batch fan-out—see below]
<<<END>>>

## Writing the Batch Prompt

When you trigger WORKFLOW, you write the prompt that will be sent to multiple expert models. Their responses will be synthesized into a workflow.

**Structure:**
1. **Role** — First line defines the expert. Be maximally specific. Include credentials and domain specialization. Generic roles produce generic outputs.
2. **Task** — What you need, in 1-2 sentences
3. **Context** — Bullet everything relevant: situation, constraints, priorities, decisions already made
4. **Output spec** — What to produce, what format, what to include
5. **Quality anchors** — Specific over generic, actionable over conceptual, decisions over options

The prompt quality determines workflow quality. Take your time with it.

## Current Turn

"{currentUserMessage}"

Respond naturally. Trigger workflow only if commitment has crystallized.
```

---

## Part 5: Executor Prompt

In `executor.prompt.ts`, create the prompt builder for the executor concierge.

The executor receives: the execution handover from explorer + the structural analysis from the workflow batch.

**First turn (synthesis):** The executor synthesizes the batch results into a coherent workflow.

**Subsequent turns:** The executor helps the user execute, step by step.

**Executor prompt for first turn (workflow synthesis):**

```
You are Singularity. You're entering execution mode.

## The Problem

**Goal:** {goal}

{problemSummary}

## The User

- **Situation:** {situation}
- **Constraints:** {constraints as bullets}
- **Priorities:** {priorities as bullets}
- **Already decided:** {decisionsMade as bullets}
- **Open questions:** {openQuestions as bullets}

## What the Experts Said

{structuralBrief from workflow batch}

## Your Task

Synthesize this into a single, coherent workflow. You are not presenting options. You are presenting the plan.

**Structure it as:**
- Clear phases with specific steps
- Time estimates where relevant
- "Done when" criteria for each phase
- Key decision points and your recommendation
- Common pitfalls to avoid

**Where experts agreed:** Present with confidence.
**Where experts disagreed:** Pick the best path for this user's context. Note alternatives only if genuinely useful.
**Where something was uniquely valuable:** Include it.

Present the workflow directly. Don't reference sources or analysis.

After presenting, ask which step they want to start with, or if they want to adjust anything before beginning.
```

**Executor prompt for subsequent turns (execution):**

```
You are Singularity. You're helping execute a plan.

## The Goal

{goal}

## The User

- **Situation:** {situation}
- **Constraints:** {constraints as bullets}
- **Priorities:** {priorities as bullets}

## The Workflow

{formatted workflow with current step marked}

## Capabilities

If the user is stuck on something complex that would benefit from multiple perspectives:

<<<BATCH>>>
TYPE: STEP_HELP

STEP: [which step they're on]
BLOCKER: [what's blocking them]
CONTEXT: [relevant constraints]

PROMPT:
[Expert prompt for this specific blocker]
<<<END>>>

Use this only when the blocker genuinely needs synthesis. Most questions you can answer directly.

## Behavior

- Focus on the current step
- Be direct and practical
- Answer simple questions directly
- Keep momentum—they're here to do, not to learn
- Mark steps complete when they confirm progress
- If they want to revisit a decision, that's allowed—but note what it affects

## Current Message

"{currentUserMessage}"

Help them move.
```

---

## Part 6: Handover Parser

In `handover.parser.ts`, create functions to extract handover blocks from concierge output.

**For Intent Handover (from starter):**

Look for `<<<HANDOVER>>>...<<<END>>>` block. Parse the YAML-like content into an `IntentHandover` object. The user-facing response is everything before the delimiter.

**For Execution Handover + Batch Prompt (from explorer):**

Look for `<<<BATCH>>>...<<<END>>>` block. Inside, parse:
- `TYPE:` line
- `HANDOVER:` block (indented YAML-like content) → `ExecutionHandover`
- `PROMPT:` block (everything after that line) → the batch prompt string

Return both the handover and the prompt separately.

Handle missing fields gracefully with sensible defaults or nulls.

---

## Part 7: Phase Orchestrator

In `phase.orchestrator.ts`, create the routing logic.

**State to track:**
- `currentPhase`: 'starter' | 'explorer' | 'executor'
- `turnCount`: number
- `intentHandover`: IntentHandover | null
- `executionHandover`: ExecutionHandover | null
- `activeWorkflow`: ActiveWorkflow | null
- `conversationHistory`: for explorer/executor context

**Routing logic:**

```
function determinePromptBuilder(state: PhaseState, turnInPhase: number):
  
  if state.currentPhase === 'starter':
    if turnInPhase === 1:
      return buildStarterPrompt  // First turn, full structural brief
    else:
      return null  // Turn 2 uses same chat context, no new system prompt
      
  if state.currentPhase === 'explorer':
    if turnInPhase === 1:
      return buildExplorerPrompt(state.intentHandover)  // Fresh instance with handover
    else:
      return null  // Continues in same chat context
      
  if state.currentPhase === 'executor':
    if turnInPhase === 1:
      return buildExecutorSynthesisPrompt(state.executionHandover, batchAnalysis)
    else:
      return buildExecutorContinuationPrompt(state)
```

**Phase transition logic:**

After each concierge response, check for signals:

1. Parse output for `<<<HANDOVER>>>` block → if found and phase is 'starter':
   - Extract IntentHandover
   - Transition to 'explorer' phase
   - Next turn uses fresh instance with explorer prompt

2. Parse output for `<<<BATCH>>>` block with `TYPE: WORKFLOW` → if found:
   - Extract ExecutionHandover and batch prompt
   - Execute batch fan-out
   - Run mapper on batch results
   - Run structural analysis on mapped results
   - Transition to 'executor' phase
   - Next turn uses fresh instance with executor synthesis prompt

3. Parse output for `<<<BATCH>>>` block with `TYPE: STEP_HELP` → if found:
   - Extract batch prompt
   - Execute batch fan-out
   - Run mapper
   - Feed results back to same executor instance (no phase change)

---

## Part 8: Update Main Concierge Service

Modify `concierge.service.ts` to use the phase orchestrator.

The main `handleTurn` function becomes:

1. Get current phase state
2. Determine which prompt builder to use (or none if continuing same instance)
3. Build prompt if needed
4. Call LLM
5. Parse output for signals/handovers
6. Execute any triggered batches
7. Update phase state
8. Return user-facing response

Export the phase state management so it can be persisted between requests.

---

## Part 9: Integration Points

**Where this connects to existing code:**

- `buildStructuralBrief` — keep as-is, used by starter and executor
- `getStanceGuidance` and `getShapeGuidance` — keep as-is, used by starter only
- `selectStance` — keep as-is, used for starter's first turn
- `postProcess` — apply to all concierge outputs before returning to user
- `detectMachineryLeakage` — apply to all outputs

**Batch fan-out integration:**

When explorer or executor triggers a batch:
1. Extract the prompt from the signal
2. Send to existing batch fan-out service
3. Send results through existing mapper
4. Send mapped results through existing structural analyzer
5. Pass structural analysis to executor (for workflow) or back to executor (for step help)

---

## Part 10: Testing the Architecture

For initial testing, enforce handover on Turn 2 from starter. The starter prompt already instructs this.

Once the full flow works end-to-end:
1. Starter → Turn 2 → Handover
2. Explorer receives handover → Continues conversation → Eventually triggers WORKFLOW
3. Batch executes → Mapper runs → Executor receives results
4. Executor synthesizes and presents workflow
5. User executes with executor help

Then revisit the starter instructions to allow it to continue beyond Turn 2 if commitment hasn't emerged yet. The handover instruction would change from "on your next turn, write a handover" to "when you have enough signal to hand off meaningfully, write a handover."

---

## Summary of Prompts to Write

| File | Prompt | Key Character |
|------|--------|---------------|
| `starter.prompt.ts` | Starter first turn | Stance-driven, prepares for handover |
| `starter.prompt.ts` | Starter turn 2 (implicit) | Same instance, writes handover after response |
| `explorer.prompt.ts` | Explorer (fresh instance) | Curious, patient, listens for gravity wells, never invents urgency |
| `executor.prompt.ts` | Executor synthesis (first turn) | Decisive, synthesizes batch into coherent plan |
| `executor.prompt.ts` | Executor continuation | Practical, momentum-focused, helps execute |

Each prompt embeds the philosophy directly. The explorer especially needs the full "alignment density" and "commitment emergence" framing—it's not just behavioral guidance, it's how the explorer thinks about its job.