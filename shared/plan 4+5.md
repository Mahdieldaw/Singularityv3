Recommendation: Single Unified Sprint
Reason: The "fix" for concierge persistence depends on knowing the phase model.

Without phases, the "correct" fix would be: persist concierge context across all turns.

With phases, the correct behavior is: persist within phase, reset across phase transitions.

These are different designs. Implementing the first then rebuilding for the second creates throwaway work and potential bugs from lingering assumptions.

The mapper fix (always fresh) is independent and can go anywhere.

Unified Sprint: Concierge Phase Architecture + Context Wiring
Overview
We are making three coordinated changes:

Mapper — Always fresh instance, no context persistence
Concierge — Three-phase architecture with phase-aware persistence
Session State — New phase tracking layer
This is one logical change. The concierge's persistence behavior is defined by the phase model.

Part 1: Session State Extension
Add a new state structure to track concierge phases. This can live in the same persistence layer as provider_contexts but is conceptually separate—it's role-state, not model-state.

New interface:

TypeScript

interface ConciergePhaseState {
  currentPhase: 'starter' | 'explorer' | 'executor';
  turnInPhase: number;
  conciergeContextId: string | null;
  intentHandover: IntentHandover | null;
  executionHandover: ExecutionHandover | null;
  activeWorkflow: ActiveWorkflow | null;
}

interface IntentHandover {
  shape: string;
  keyFindings: string[];
  tensions: string[];
  gaps: string[];
  userQuery: string;
  starterResponse: string;
  userReply: string;
  impliedGoal: string;
  revealedConstraints: string[];
  acceptedFraming: string;
  resistedFraming: string | null;
  unpromptedReveals: string[];
  stillUnclear: string[];
  effectiveStance: string;
}

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

interface ActiveWorkflow {
  goal: string;
  steps: WorkflowStep[];
  currentStepIndex: number;
}

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  doneWhen: string;
  status: 'pending' | 'active' | 'complete';
}
Initialization: When a new session starts, create:

text

{
  currentPhase: 'starter',
  turnInPhase: 0,
  conciergeContextId: null,
  intentHandover: null,
  executionHandover: null,
  activeWorkflow: null
}
Persistence: Store alongside session. Load at start of each turn. Save after each turn.

Part 2: Mapper — Always Fresh
The mapper must have no memory between invocations. Each mapping is pure: batch responses in → structural map out.

In StepExecutor.js:

When executing the mapper step:

Do NOT resolve context from workflowContexts or providerContexts
Do NOT look for existing chatId for the mapper
Always execute with action: 'initialize'
Do NOT save the resulting chatId to session state
Even if the mapper model happens to be the same model as one in the batch, the mapper invocation is a separate role with no continuity.

Remove any Tier 1 resolution logic for the mapper specifically. The mapper is stateless.

Part 3: Concierge Phase Prompts
Create new files in src/services/concierge/:

3.1 handover.types.ts
Export the TypeScript interfaces defined in Part 1 above.

3.2 handover.parser.ts
Create parsing functions to extract handovers from concierge output.

parseIntentHandover(response: string)

Looks for <<<HANDOVER>>>...<<<END>>> block. If found:

Extract the block content
Parse YAML-like lines into IntentHandover object
Return { userResponse: everything before the block, handover: parsed object }
If not found, return { userResponse: full response, handover: null }

parseBatchSignal(response: string)

Looks for <<<BATCH>>>...<<<END>>> block. If found:

Extract TYPE: line → 'WORKFLOW' or 'STEP_HELP'
Extract HANDOVER: block (indented content) → parse into ExecutionHandover
Extract PROMPT: block (everything after that marker) → raw string
Return { userResponse: everything before block, type, handover, batchPrompt }
If not found, return { userResponse: full response, type: null, handover: null, batchPrompt: null }

Handle missing or malformed fields gracefully with nulls or empty arrays.

3.3 starter.prompt.ts
buildStarterPrompt(userMessage: string, analysis: StructuralAnalysis, stance: ConciergeStance)

This is the Turn 1 prompt. Uses existing buildStructuralBrief, getShapeGuidance, getStanceGuidance.

Full prompt structure:

text

You are Singularity—a unified intelligence synthesized from multiple expert perspectives.

{stanceGuidance.framing if present}

## The Query
"{userMessage}"

## What You Know
{structuralBrief}

## Response Guide
{shapeGuidance}

{stanceGuidance.behavior}

## What Happens Next

You will continue for one more turn. When the user replies, you will:

1. Respond to their reply naturally
2. Write an Intent Handover for the next phase

The handover captures your interpretation—not just what was said, but what it means:
- What do they actually want? (the goal beneath the question)
- What constraints surfaced? (time, skill, resources, stakes)
- How did they engage with your framing? (accepted, resisted, redirected)
- What did they volunteer unprompted? (reveals weight)
- What remains unclear? (what needs probing)

After your response on the next turn, append:

<<<HANDOVER>>>
shape: {the shape you identified}
key_findings: [list]
tensions: [list or empty]
gaps: [list or empty]
user_query: {their original question}
starter_response: {summary of your response}
user_reply: {what they said}
goal: {your interpretation of what they want}
constraints: [what limits them]
accepted_framing: {how they engaged}
resisted_framing: {what they pushed back on, or null}
unprompted_reveals: [what they volunteered]
still_unclear: [what needs probing]
effective_stance: {explore|decide|challenge}
<<<END>>>

You are handing off to an explorer who will continue the conversation. Give them your read on the situation, not just a transcript.

## Voice
{stanceGuidance.voice}

## Never
- Reference models, analysis, structure, claims, or batch
- Hedge without explaining what you're uncertain about
- Say "it depends" without saying on what

Respond.
3.4 explorer.prompt.ts
buildExplorerPrompt(handover: IntentHandover, userMessage: string)

This is a fresh instance receiving the handover from starter.

Full prompt:

text

You are Singularity. You've inherited an ongoing conversation from a prior phase.

## What Was Learned

**Shape:** {handover.shape}

**Key findings:**
{handover.keyFindings as bullet list}

**Tensions:**
{handover.tensions as bullet list, or "None identified"}

**Gaps:**
{handover.gaps as bullet list, or "None identified"}

## The Exchange So Far

**They asked:** "{handover.userQuery}"

**You responded:** "{handover.starterResponse}"

**They replied:** "{handover.userReply}"

## Your Read on the Situation

- **Goal:** {handover.impliedGoal}
- **Constraints:** {handover.revealedConstraints as bullets}
- **They accepted:** {handover.acceptedFraming}
- **They resisted:** {handover.resistedFraming or "Nothing explicit"}
- **They volunteered:** {handover.unpromptedReveals as bullets}
- **Still unclear:** {handover.stillUnclear as bullets}

## Your Role

You are the explorer. Your job is not to advance phases. Your job is to increase alignment density.

Alignment density means: constraints are clear, tradeoffs are named, red lines are explicit, reversals are understood.

You listen for gravity wells—moments where verbal goals become actual commitments. Commitments have cost.

"I want to maybe build something" is not commitment.
"I need to ship by Friday" is commitment.

**Permissions:**
- You may revisit assumptions without apology
- You may reframe the problem if new context invalidates the old framing
- You may hold multiple live hypotheses without collapsing them

**Prohibition:**
- You may NOT invent urgency. Urgency must come from the user or from reality.

Progress in exploration is not forward motion. Progress is reduction of surprise. If constraints are clearer, tradeoffs are named, and reversals are understood—you are succeeding, even if no plan emerges.

**When to trigger workflow:**

Not when you think they're ready. When they show you they're ready:
- Explicit request ("give me a plan", "what are the steps", "let's do this")
- Commitment language ("I need to", "I'm going to", "by [deadline]")
- Exploration has stopped producing new structure

If exploration stalls without commitment, you may gently surface:
"Nothing new is emerging. That usually means either the question is already answered, or the decision is being avoided."

That is a diagnosis, not a push.

## Capabilities

When commitment crystallizes and they're ready for action, trigger a workflow:

<<<BATCH>>>
TYPE: WORKFLOW

HANDOVER:
  goal: [refined goal]
  problem_summary: [one paragraph]
  situation: [who they are]
  constraints: [hard limits]
  priorities: [what they optimize for]
  decisions_made: [locked choices]
  open_questions: [may surface later]
  exploration_highlights: [key moments]

PROMPT:
[Expert prompt for batch—see below]
<<<END>>>

## Writing the Batch Prompt

When you trigger WORKFLOW, write the prompt sent to multiple expert models.

Structure:
1. **Role** — First line defines the expert. Be maximally specific. Credentials, experience, domain. Generic roles produce generic outputs.
2. **Task** — What you need, 1-2 sentences
3. **Context** — Bullets: situation, constraints, priorities, decisions made
4. **Output spec** — What to produce, format, what to include
5. **Quality anchors** — Specific over generic, actionable over conceptual, decisions over options

Prompt quality determines workflow quality.

## Current Message

"{userMessage}"

Respond naturally. Trigger workflow only if commitment has crystallized.
3.5 executor.prompt.ts
Two variants: synthesis (first turn) and continuation.

buildExecutorSynthesisPrompt(handover: ExecutionHandover, batchAnalysis: StructuralAnalysis)

text

You are Singularity. You're entering execution mode.

## The Problem

**Goal:** {handover.goal}

{handover.problemSummary}

## The User

- **Situation:** {handover.situation}
- **Constraints:** {handover.constraints as bullets}
- **Priorities:** {handover.priorities as bullets}
- **Already decided:** {handover.decisionsMade as bullets}
- **Open questions:** {handover.openQuestions as bullets}

## What the Experts Said

{buildStructuralBrief(batchAnalysis)}

## Your Task

Synthesize this into a single, coherent workflow. You are not presenting options. You are presenting the plan.

Structure:
- Clear phases with specific steps
- Time estimates where relevant
- "Done when" criteria for each phase
- Key decision points with your recommendation
- Common pitfalls to avoid

Where experts agreed: present with confidence.
Where experts disagreed: pick the best path for this user's context.
Where something was uniquely valuable: include it.

Present directly. Don't reference sources or analysis.

After presenting, ask which step they want to start with.
buildExecutorContinuationPrompt(workflow: ActiveWorkflow, userMessage: string)

text

You are Singularity. You're helping execute a plan.

## The Workflow

{formatActiveWorkflow(workflow)}

## Capabilities

If the user is stuck on something complex that would benefit from multiple perspectives:

<<<BATCH>>>
TYPE: STEP_HELP

STEP: [current step]
BLOCKER: [what's blocking]
CONTEXT: [relevant constraints]

PROMPT:
[Expert prompt for this blocker]
<<<END>>>

Use only when the blocker genuinely needs synthesis. Most questions you can answer directly.

## Behavior

- Focus on the current step
- Be direct and practical
- Answer simple questions directly
- Keep momentum
- Mark steps complete when confirmed

## Current Message

"{userMessage}"

Help them move.
formatActiveWorkflow(workflow: ActiveWorkflow)

Format the workflow showing all steps, with current step marked and expanded.

Part 4: Phase Orchestration in StepExecutor
4.1 Load Phase State
At the start of the concierge step execution, load ConciergePhaseState from session.

4.2 Determine Action and Prompt
text

phaseState.turnInPhase++

if phaseState.conciergeContextId is null:
  // Fresh instance needed
  action = 'initialize'
  
  switch phaseState.currentPhase:
    case 'starter':
      prompt = buildStarterPrompt(userMessage, analysis, stance)
    case 'explorer':
      prompt = buildExplorerPrompt(phaseState.intentHandover, userMessage)
    case 'executor':
      if phaseState.turnInPhase === 1:
        prompt = buildExecutorSynthesisPrompt(phaseState.executionHandover, batchAnalysis)
      else:
        prompt = buildExecutorContinuationPrompt(phaseState.activeWorkflow, userMessage)

else:
  // Continue existing instance
  action = 'continue'
  contextId = phaseState.conciergeContextId
  prompt = userMessage  // Just the user message, system context is retained
4.3 Execute and Save Context
Execute the LLM call with determined action and prompt.

If action was 'initialize', save the returned chatId to phaseState.conciergeContextId.

4.4 Parse Response for Transitions
After getting the response:

Check for Intent Handover (starter phase only):

text

if phaseState.currentPhase === 'starter':
  parsed = parseIntentHandover(response)
  if parsed.handover:
    phaseState.intentHandover = parsed.handover
    phaseState.currentPhase = 'explorer'
    phaseState.turnInPhase = 0
    phaseState.conciergeContextId = null
    userResponse = parsed.userResponse
Check for Batch Signal (explorer or executor):

text

if phaseState.currentPhase in ['explorer', 'executor']:
  parsed = parseBatchSignal(response)
  
  if parsed.type === 'WORKFLOW':
    phaseState.executionHandover = parsed.handover
    
    // Execute batch pipeline
    batchResponses = await executeBatchFanOut(parsed.batchPrompt)
    mappedResults = await executeMapper(batchResponses)  // Fresh mapper
    batchAnalysis = await runStructuralAnalysis(mappedResults)
    
    // Transition to executor
    phaseState.currentPhase = 'executor'
    phaseState.turnInPhase = 0
    phaseState.conciergeContextId = null
    
    // Store batch analysis for executor's first turn
    phaseState.pendingBatchAnalysis = batchAnalysis
    
    userResponse = parsed.userResponse
    // Note: Next turn will trigger executor synthesis
    
  if parsed.type === 'STEP_HELP':
    // Execute batch pipeline
    batchResponses = await executeBatchFanOut(parsed.batchPrompt)
    mappedResults = await executeMapper(batchResponses)  // Fresh mapper
    stepAnalysis = await runStructuralAnalysis(mappedResults)
    
    // Feed back to same executor instance (no phase change)
    // Append synthesis to next executor turn
    phaseState.pendingStepHelp = stepAnalysis
    
    userResponse = parsed.userResponse
4.5 Persist Phase State
Save updated phaseState to session after each turn.

Part 5: Remove Incorrect Behavior
5.1 Remove isFirstTurn logic
The current isFirstTurn flag in buildConciergePrompt is replaced by phase-aware logic. Capabilities are shown based on phase:

Starter: No capabilities section
Explorer: WORKFLOW capability
Executor: STEP_HELP capability
5.2 Remove conversation history injection for concierge
Within a phase, context is maintained by the continued chat thread. Across phases, the handover carries the essential information. No need to inject raw conversation history.

Part 6: File Changes Summary
File	Change
src/services/concierge/handover.types.ts	New — Type definitions
src/services/concierge/handover.parser.ts	New — Parse handovers from output
src/services/concierge/starter.prompt.ts	New — Starter prompt builder
src/services/concierge/explorer.prompt.ts	New — Explorer prompt builder
src/services/concierge/executor.prompt.ts	New — Executor prompt builders
src/services/concierge/concierge.service.ts	Modify — Delegate to phase-specific builders
StepExecutor.js	Modify — Phase-aware routing, context management
StepExecutor.js (mapper)	Modify — Always fresh, no context
Session/State layer	Modify — Add ConciergePhaseState persistence
Part 7: Execution Order
Add type definitions
Add handover parser
Add phase prompt builders (starter, explorer, executor)
Modify session layer to persist phase state
Modify StepExecutor mapper execution to always be fresh
Modify StepExecutor concierge execution with full phase routing
Test end-to-end: starter → handover → explorer → workflow trigger → executor
Testing Checkpoints
Checkpoint 1: Mapper is fresh

Run two turns
Verify mapper has no memory of Turn 1 in Turn 2
Checkpoint 2: Starter persists into Turn 2

Run Turn 1, get response
Run Turn 2, verify concierge continues thread (knows Turn 1)
Verify handover block appears in Turn 2 output
Checkpoint 3: Explorer receives handover

After Turn 2 handover, verify Turn 3 uses explorer prompt
Verify explorer is fresh instance with handover context
Verify explorer persists across subsequent turns
Checkpoint 4: Workflow trigger

Explorer outputs <<<BATCH>>> with WORKFLOW
Verify batch executes
Verify mapper runs fresh
Verify executor receives handover + batch analysis
Verify executor synthesizes workflow
Checkpoint 5: Step help

Executor outputs <<<BATCH>>> with STEP_HELP
Verify batch executes
Verify executor continues same thread (not reset)
Verify step help synthesis appears in next response




