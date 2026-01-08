Unified Sprint: Concierge Phase Architecture
Overview
Three concierge phases, each a distinct instance with different behavior. Within each phase, the concierge persists across turns. At phase transitions, a fresh instance receives a handover.

Key principle: Full prompt on first turn only. Subsequent turns receive minimal wrappers—the context is already in the thread.

The Flow
text

STARTER (2 turns)
  Turn 1: Full prompt with structural analysis. Responds.
  Turn 2: Light wrapper with handover instructions. Writes handover.
  → Transition to Explorer

EXPLORER (variable turns)
  Turn 1: Full prompt with intent handover. Fresh instance.
  Turn 2+: Light wrapper. Continues exploring.
  When ready: Writes WORKFLOW signal with batch prompt.
  → Transition to Executor

EXECUTOR
  Turn 1: Full prompt with execution handover + workflow batch results.
          Synthesizes workflow + writes Step 1 batch prompt.
          System immediately triggers Step 1 batch.
  Turn 2: Light wrapper with Step 1 batch results + capabilities.
          Presents workflow with Step 1 deep dive.
  Turn 3+: User messages only. Context maintained. Can trigger STEP_HELP.
The Pre-Triggering Decision
Yes, do it. On executor Turn 1, the concierge synthesizes the workflow AND writes the Step 1 batch prompt. System triggers immediately.

Why this works:

User will spend time reading the workflow, thinking, typing
During that time, Step 1 batch is already running
By Turn 2, results are ready—zero perceived latency
The risk:

User might say "actually, let's change the plan"
Mitigation:

Step 1 results are still useful context even if user pivots
If they change the whole plan, they're signaling return to exploration
The common case (user proceeds) gets faster; the rare case (user pivots) is handled gracefully
Part 1: Types
Create src/services/concierge/handover.types.ts:

TypeScript

type ConversationPhase = 'starter' | 'explorer' | 'executor';

interface ConciergePhaseState {
  currentPhase: ConversationPhase;
  turnInPhase: number;
  conciergeContextId: string | null;
  intentHandover: IntentHandover | null;
  executionHandover: ExecutionHandover | null;
  activeWorkflow: ActiveWorkflow | null;
  pendingStepBatchAnalysis: StructuralAnalysis | null;
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
Part 2: Handover Parser
Create src/services/concierge/handover.parser.ts:

parseIntentHandover(response: string)

Looks for <<<HANDOVER>>>...<<<END>>> block.

Returns:

TypeScript

{
  userResponse: string;      // Everything before the block
  handover: IntentHandover | null;
}
Parse the YAML-like content inside the block into the IntentHandover structure.

parseBatchSignal(response: string)

Looks for <<<BATCH>>>...<<<END>>> block.

Returns:

TypeScript

{
  userResponse: string;           // Everything before the block
  type: 'WORKFLOW' | 'STEP_HELP' | null;
  handover: ExecutionHandover | null;  // Only for WORKFLOW
  batchPrompt: string | null;
}
Inside the block:

TYPE: line determines type
HANDOVER: block (indented) parses to ExecutionHandover
PROMPT: everything after this marker is the raw batch prompt
Part 3: Starter Prompts
Create src/services/concierge/starter.prompt.ts:

buildStarterInitialPrompt(userMessage, analysis, stance)
Used on Turn 1. Full structural analysis, stance guidance.

text

You are Singularity—unified intelligence synthesized from multiple expert perspectives.

{stanceGuidance.framing if present}

## The Query
"{userMessage}"

## What You Know
{buildStructuralBrief(analysis)}

## Response Guide
{getShapeGuidance(analysis.shape)}

{stanceGuidance.behavior}

## Voice
{stanceGuidance.voice}

## Never
- Reference models, analysis, structure, claims
- Hedge without explaining what you're uncertain about
- Say "it depends" without saying on what

Respond.
No handover instructions. Clean focus on the structural response.

buildStarterTurn2Wrapper(userMessage)
Used on Turn 2. Wraps the user message with handover instructions.

text

The user has replied. Respond naturally to their message, then write an Intent Handover.

The handover captures your interpretation—not just what was said, but what it means:
- What do they actually want?
- What constraints surfaced?
- How did they engage with your framing?
- What did they volunteer unprompted?
- What remains unclear?

After your response, append:

<<<HANDOVER>>>
shape: {shape from turn 1}
key_findings: [list]
tensions: [list]
gaps: [list]
user_query: {their original question}
starter_response: {brief summary of your turn 1 response}
user_reply: {what they just said}
goal: {your interpretation of what they want}
constraints: [what limits them]
accepted_framing: {how they engaged with your framing}
resisted_framing: {what they pushed back on, or null}
unprompted_reveals: [what they volunteered without prompting]
still_unclear: [what needs further exploration]
effective_stance: explore|decide|challenge
<<<END>>>

---

"{userMessage}"
Part 4: Explorer Prompts
Create src/services/concierge/explorer.prompt.ts:

buildExplorerInitialPrompt(handover, userMessage)
Used on Turn 1 of explorer phase. Fresh instance receives the handover.

text

You are Singularity. You've inherited a conversation from a prior phase.

## What Was Learned

**Shape:** {handover.shape}

**Key findings:**
{handover.keyFindings as bullets}

**Tensions:**
{handover.tensions as bullets, or "None identified"}

**Gaps:**
{handover.gaps as bullets, or "None identified"}

## The Exchange So Far

**They asked:** "{handover.userQuery}"

**You responded:** "{handover.starterResponse}"

**They replied:** "{handover.userReply}"

## Your Read

- **Goal:** {handover.impliedGoal}
- **Constraints:** {handover.revealedConstraints as bullets}
- **Accepted:** {handover.acceptedFraming}
- **Resisted:** {handover.resistedFraming or "Nothing"}
- **Volunteered:** {handover.unpromptedReveals as bullets}
- **Unclear:** {handover.stillUnclear as bullets}

## Your Role

You are the explorer. Your job is to increase alignment density—not to advance phases.

Alignment density: constraints are clear, tradeoffs are named, red lines are explicit, reversals are understood.

Listen for gravity wells. Commitments have cost. "I might build something" is not commitment. "I need to ship by Friday" is.

**Permissions:**
- Revisit assumptions without apology
- Reframe if new context invalidates old framing
- Hold multiple hypotheses without collapsing

**Prohibition:**
- Never invent urgency. It must come from them or from reality.

Progress is reduction of surprise, not forward motion.

## When to Trigger Workflow

When they show readiness:
- Explicit: "give me a plan", "what are the steps"
- Commitment language: "I need to", "by [deadline]"
- Exploration stops producing new structure

If stalled without commitment, you may surface:
"Nothing new is emerging. That usually means the question is answered, or the decision is being avoided."

That's diagnosis, not a push.

## To Trigger Workflow

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
[Expert prompt—see below]
<<<END>>>

## Writing the Batch Prompt

Structure:
1. **Role** — Specific expert. Credentials, experience, domain.
2. **Task** — What you need, 1-2 sentences.
3. **Context** — Bullets: situation, constraints, priorities, decisions.
4. **Output** — What to produce, format, inclusions.
5. **Quality** — Specific over generic, decisions over options.

## Current Message

"{userMessage}"

Continue exploring. Trigger workflow only when commitment crystallizes.
buildExplorerContinueWrapper(userMessage)
Used on Turn 2+ of explorer phase. Minimal—context is in thread.

text

Continue the exploration.

"{userMessage}"
That's it. The explorer already knows its role, the handover, everything. Just keep going.

Part 5: Executor Prompts
Create src/services/concierge/executor.prompt.ts:

buildExecutorSynthesisPrompt(handover, workflowBatchAnalysis)
Used on Turn 1 of executor phase. Fresh instance receives handover + batch results.

text

You are Singularity. You're entering execution mode.

## The Problem

**Goal:** {handover.goal}

{handover.problemSummary}

## The User

- **Situation:** {handover.situation}
- **Constraints:** {handover.constraints as bullets}
- **Priorities:** {handover.priorities as bullets}
- **Decided:** {handover.decisionsMade as bullets}
- **Open:** {handover.openQuestions as bullets}

## What the Experts Proposed

{buildStructuralBrief(workflowBatchAnalysis)}

## Your Task

Synthesize into a coherent workflow.

Structure:
- Clear phases with steps
- Time estimates where relevant
- "Done when" criteria
- Recommendations at decision points
- Pitfalls to avoid

Where experts agreed: confidence.
Where they disagreed: pick for this user's context.

After synthesizing, write a batch prompt for Step 1. The system will immediately gather deep guidance on the first step.

End your response with:

<<<BATCH>>>
TYPE: STEP_HELP

STEP: [Step 1 title]
CONTEXT: [User's situation and constraints relevant to this step]

PROMPT:
[Expert prompt specifically for executing Step 1]
<<<END>>>

Synthesize the workflow, then write the Step 1 prompt.
buildExecutorPresentationPrompt(step1BatchAnalysis)
Used on Turn 2 of executor phase. The workflow synthesis is in context. Now adding Step 1 deep dive + capabilities.

text

You just synthesized a workflow. You now have expert guidance for Step 1.

## Step 1 Expert Guidance

{buildStructuralBrief(step1BatchAnalysis)}

## Your Task

Present the complete workflow to the user. Expand Step 1 with full detail based on what the experts said:
- Specific actions
- Recommended approach
- What to watch out for
- How to know it's done

End by asking if they're ready to start or want to adjust anything.

## Going Forward

From now on, you're helping them execute. You have a capability:

If they're stuck on something complex, trigger:

<<<BATCH>>>
TYPE: STEP_HELP

STEP: [step name]
BLOCKER: [what's blocking]
CONTEXT: [relevant constraints]

PROMPT:
[Expert prompt for this blocker]
<<<END>>>

Use only when the blocker genuinely needs multiple perspectives. Most questions you answer directly.

Keep momentum. Be practical. Help them move.

Present the workflow now.
Turn 3+ of Executor
No wrapper needed. User messages pass directly. The executor has full context from Turns 1-2, including the STEP_HELP capability.

If STEP_HELP is triggered and returns results, wrap the next user message:

text

The step help batch returned. Here's what the experts said:

{buildStructuralBrief(stepHelpAnalysis)}

Synthesize this into actionable guidance for them.

---

"{userMessage}"
Otherwise, just pass the user message through. Context is maintained.

Part 6: Phase Orchestration
Update StepExecutor.js (or create phase.orchestrator.ts):

Initialization
On new session:

JavaScript

phaseState = {
  currentPhase: 'starter',
  turnInPhase: 0,
  conciergeContextId: null,
  intentHandover: null,
  executionHandover: null,
  activeWorkflow: null,
  pendingStepBatchAnalysis: null
}
Turn Execution Logic
JavaScript

async function executeConcierge(userMessage, analysis, phaseState) {
  phaseState.turnInPhase++;
  
  let action, prompt;
  
  // STARTER PHASE
  if (phaseState.currentPhase === 'starter') {
    if (phaseState.turnInPhase === 1) {
      action = 'initialize';
      prompt = buildStarterInitialPrompt(userMessage, analysis, stance);
    } else {
      action = 'continue';
      prompt = buildStarterTurn2Wrapper(userMessage);
    }
  }
  
  // EXPLORER PHASE
  else if (phaseState.currentPhase === 'explorer') {
    if (phaseState.turnInPhase === 1) {
      action = 'initialize';
      prompt = buildExplorerInitialPrompt(phaseState.intentHandover, userMessage);
    } else {
      action = 'continue';
      prompt = buildExplorerContinueWrapper(userMessage);
    }
  }
  
  // EXECUTOR PHASE
  else if (phaseState.currentPhase === 'executor') {
    if (phaseState.turnInPhase === 1) {
      action = 'initialize';
      prompt = buildExecutorSynthesisPrompt(
        phaseState.executionHandover, 
        phaseState.pendingWorkflowAnalysis
      );
    } else if (phaseState.turnInPhase === 2) {
      action = 'continue';
      prompt = buildExecutorPresentationPrompt(phaseState.pendingStepBatchAnalysis);
      // Note: We might not even have a user message here—system auto-continues
    } else {
      action = 'continue';
      if (phaseState.pendingStepBatchAnalysis) {
        prompt = buildStepHelpResultWrapper(phaseState.pendingStepBatchAnalysis, userMessage);
        phaseState.pendingStepBatchAnalysis = null;
      } else {
        prompt = userMessage;
      }
    }
  }
  
  // Execute
  const result = await callConcierge(action, prompt, phaseState.conciergeContextId);
  
  if (action === 'initialize') {
    phaseState.conciergeContextId = result.contextId;
  }
  
  // Parse and handle transitions
  await handleTransitions(result.response, phaseState);
  
  return result.response;
}
Transition Handling
JavaScript

async function handleTransitions(response, phaseState) {
  
  // STARTER → EXPLORER
  if (phaseState.currentPhase === 'starter') {
    const parsed = parseIntentHandover(response);
    if (parsed.handover) {
      phaseState.intentHandover = parsed.handover;
      phaseState.currentPhase = 'explorer';
      phaseState.turnInPhase = 0;
      phaseState.conciergeContextId = null;
      return parsed.userResponse;
    }
  }
  
  // EXPLORER → EXECUTOR (or STEP_HELP in executor)
  const batchSignal = parseBatchSignal(response);
  
  if (batchSignal.type === 'WORKFLOW') {
    phaseState.executionHandover = batchSignal.handover;
    
    // Execute workflow batch
    const batchResponses = await executeBatchFanOut(batchSignal.batchPrompt);
    const mapped = await executeMapper(batchResponses);  // Always fresh
    const workflowAnalysis = await runStructuralAnalysis(mapped);
    
    phaseState.pendingWorkflowAnalysis = workflowAnalysis;
    phaseState.currentPhase = 'executor';
    phaseState.turnInPhase = 0;
    phaseState.conciergeContextId = null;
    
    return batchSignal.userResponse;
  }
  
  if (batchSignal.type === 'STEP_HELP') {
    // Executor Turn 1: Step 1 pre-trigger
    // OR Executor Turn 3+: User is stuck
    
    const batchResponses = await executeBatchFanOut(batchSignal.batchPrompt);
    const mapped = await executeMapper(batchResponses);  // Always fresh
    const stepAnalysis = await runStructuralAnalysis(mapped);
    
    phaseState.pendingStepBatchAnalysis = stepAnalysis;
    
    // Don't change phase. Results injected on next turn.
    return batchSignal.userResponse;
  }
  
  return response;
}
Part 7: Mapper — Always Fresh
In StepExecutor.js, when executing the mapper:

Do NOT resolve context from any persistence layer
Always use action: 'initialize'
Do NOT save resulting context ID
Each mapper invocation is stateless
Remove any Tier 1 resolution logic for the mapper.

Part 8: File Summary
File	Action
handover.types.ts	Create — All type definitions
handover.parser.ts	Create — Parse handover and batch signals
starter.prompt.ts	Create — buildStarterInitialPrompt, buildStarterTurn2Wrapper
explorer.prompt.ts	Create — buildExplorerInitialPrompt, buildExplorerContinueWrapper
executor.prompt.ts	Create — buildExecutorSynthesisPrompt, buildExecutorPresentationPrompt, buildStepHelpResultWrapper
StepExecutor.js	Modify — Phase-aware routing, mapper always fresh
Session layer	Modify — Add ConciergePhaseState persistence
Part 9: Execution Order
Add type definitions
Add handover parser
Add starter prompts
Add explorer prompts
Add executor prompts
Modify session layer for phase state
Modify StepExecutor mapper to always fresh
Modify StepExecutor concierge with full phase routing
Test end-to-end
Part 10: Testing Checkpoints
Checkpoint 1: Starter → Explorer

Turn 1: Starter responds (no handover block)
Turn 2: Starter responds + handover block appears
Turn 3: Explorer responds (fresh instance, references handover content)
Checkpoint 2: Explorer persists

Turns 3-N: Explorer continues thread, minimal wrappers
Explorer remembers prior turns in exploration
Checkpoint 3: Explorer → Executor

Explorer outputs WORKFLOW signal
Batch executes, mapper runs fresh
Executor Turn 1: Synthesizes workflow + outputs STEP_HELP for Step 1
Step 1 batch triggers immediately
Checkpoint 4: Executor presentation

Executor Turn 2: Receives Step 1 results, presents full workflow
Has STEP_HELP capability in context
Checkpoint 5: Executor working

Turn 3+: User messages pass through
STEP_HELP triggers batch, results injected on next turn
Same thread throughout
Checkpoint 6: Mapper isolation

Run multiple batches
Verify mapper has no memory between any of them