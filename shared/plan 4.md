Architecture Wiring: Phase-Aware Context Management
The Problem Restated
Role	Current Behavior	Desired Behavior
Batch	Persists, continues	Same (correct)
Mapper	Continues from batch thread	Fresh every time (impartial)
Concierge	Fresh every turn (broken)	Phase-aware persistence
Part 1: Mapper — Always Fresh
The mapper should have no memory. Each mapping is a pure function: batch responses in → structural map out.

Changes in StepExecutor.js:

In the mapper step execution, do NOT resolve context from workflowContexts or providerContexts. Always call the mapper with initialize action, never continue.

If the mapper happens to be the same model as one in the batch, that's irrelevant—the mapper invocation is a separate role. It should not inherit the batch thread.

Concretely:

When executing the mapper step, pass an empty or null context ID
Do not save the mapper's resulting context ID to the session
Each mapper call is ephemeral
This is a simplification, not a complication. Remove the Tier 1 resolution logic for the mapper specifically.

Part 2: Concierge — Phase-Aware Persistence
The concierge needs a different model: persist within a phase, reset on phase transition.

New State to Track
Add to session state (wherever provider_contexts or session data lives):

TypeScript

interface ConciergePhaseState {
  currentPhase: 'starter' | 'explorer' | 'executor';
  turnInPhase: number;
  conciergeContextId: string | null;  // The chatId for current phase instance
  intentHandover: IntentHandover | null;
  executionHandover: ExecutionHandover | null;
  activeWorkflow: ActiveWorkflow | null;
}
This is separate from provider_contexts because it's role-state, not model-state.

Persistence Logic
On session start:

text

phaseState = {
  currentPhase: 'starter',
  turnInPhase: 0,
  conciergeContextId: null,
  intentHandover: null,
  executionHandover: null,
  activeWorkflow: null
}
On each concierge turn:

text

turnInPhase++

if (conciergeContextId === null OR phase just transitioned):
  action = 'initialize'
  build full phase prompt (starter/explorer/executor)
else:
  action = 'continue'
  use saved conciergeContextId
  no system prompt rebuild needed
  
execute concierge call

if action was 'initialize':
  save returned chatId as conciergeContextId

parse response for handovers/signals
update phaseState accordingly
On phase transition:

When a handover is detected:

Store the handover in phaseState
Set currentPhase to next phase
Set turnInPhase to 0
Set conciergeContextId to null (forces fresh instance next turn)
Part 3: Phase Transition Detection
After each concierge response, parse for signals:

Starter → Explorer Transition
Look for <<<HANDOVER>>>...<<<END>>> block.

If found:

Parse into IntentHandover object
Store in phaseState.intentHandover
Set phaseState.currentPhase = 'explorer'
Set phaseState.turnInPhase = 0
Set phaseState.conciergeContextId = null
Next turn: Explorer receives fresh instance with buildExplorerPrompt(intentHandover)

Explorer → Executor Transition
Look for <<<BATCH>>>...<<<END>>> block with TYPE: WORKFLOW.

If found:

Parse HANDOVER: block into ExecutionHandover
Parse PROMPT: block into batch prompt string
Store handover in phaseState.executionHandover
Execute batch fan-out with the prompt
Run mapper (fresh instance) on batch results
Run structural analysis on mapped results
Set phaseState.currentPhase = 'executor'
Set phaseState.turnInPhase = 0
Set phaseState.conciergeContextId = null
Store synthesized workflow in phaseState.activeWorkflow
Next turn: Executor receives fresh instance with buildExecutorSynthesisPrompt(executionHandover, batchAnalysis)

Step Help (No Phase Transition)
Look for <<<BATCH>>>...<<<END>>> block with TYPE: STEP_HELP.

If found:

Parse PROMPT: block
Execute batch fan-out
Run mapper (fresh) on results
Run structural analysis
Feed results back to same executor instance (continue, not initialize)
Do NOT reset conciergeContextId
The executor stays in the same thread but receives the step help synthesis in its next message.

Part 4: StepExecutor Changes
Fix the isFirstTurn Bug
Currently isFirstTurn is not passed, so it defaults to falsy, which incorrectly shows capabilities on Turn 1.

The fix: Pass turnInPhase from phaseState. But actually, the logic should be:

Starter Turn 1: No capabilities section (just did batch, nothing to trigger)
Starter Turn 2: Still no capabilities (writes handover, doesn't trigger batches)
Explorer: Has capabilities (can trigger WORKFLOW)
Executor: Has capabilities (can trigger STEP_HELP)
So the logic is phase-based, not just turn-based:

TypeScript

const showCapabilities = phaseState.currentPhase !== 'starter';
Pass this to the prompt builder instead of isFirstTurn.

Pass Correct Context to Concierge
In executeSingularityStep (or wherever the concierge is called):

Load phaseState from session
Determine action:
text

if (phaseState.conciergeContextId === null) {
  action = 'initialize'
  prompt = buildPhasePrompt(phaseState)  // Full system prompt for this phase
} else {
  action = 'continue'
  prompt = userMessage  // Just the user's message, system prompt is in context
}
Execute with appropriate action
If initialized, save returned context ID to phaseState.conciergeContextId
Parse response for signals
Update phaseState and persist
Prompt Builder Routing
Based on phase:

TypeScript

function buildPhasePrompt(phaseState: ConciergePhaseState, analysis?: StructuralAnalysis): string {
  switch (phaseState.currentPhase) {
    case 'starter':
      // Turn 1: full structural brief + stance
      return buildStarterPrompt(analysis, stance);
      
    case 'explorer':
      // Fresh instance, receives intent handover
      return buildExplorerPrompt(phaseState.intentHandover);
      
    case 'executor':
      if (phaseState.turnInPhase === 0) {
        // First executor turn: synthesis mode
        return buildExecutorSynthesisPrompt(phaseState.executionHandover, batchAnalysis);
      } else {
        // Continuing execution
        return buildExecutorContinuationPrompt(phaseState.activeWorkflow);
      }
  }
}
Part 5: Conversation History
Within a phase, we do NOT need to pass conversation history explicitly—it's in the model's context (that's the point of continuing the thread).

On phase transition, the handover document carries the essential information. The new instance doesn't need the raw transcript; it needs the interpreted summary.

This is a feature, not a limitation:

Keeps context focused
Prevents balloon
Forces meaningful compression at transitions
Part 6: Implementation Order
Add phase state to session model — new fields for phase tracking, handovers, workflow

Update mapper to always fresh — remove context resolution for mapper step, don't persist mapper context

Create handover parser — extract <<<HANDOVER>>> and <<<BATCH>>> blocks from concierge output

Create phase prompt builders — starter, explorer, executor prompts as specified in previous instructions

Update StepExecutor for concierge — implement phase-aware routing:

Load phase state
Determine initialize vs continue
Build appropriate prompt or pass through message
Save context ID on initialize
Parse for transitions
Update and persist phase state
Wire batch trigger path — when explorer triggers WORKFLOW:

Execute batch with explorer's prompt
Fresh mapper
Structural analysis
Transition to executor with results
Wire step help path — when executor triggers STEP_HELP:

Execute batch
Fresh mapper
Return to same executor thread
Summary: Context Continuity Model
Role	Within Session	Across Phases
Batch	Continue (persisted chatIds)	Continue
Mapper	Always fresh	N/A
Starter	Turn 1: Init, Turn 2: Continue	Ends at handover
Explorer	Init with handover, then Continue	Ends at WORKFLOW
Executor	Init with handover + synthesis, then Continue	Until workflow complete
Each phase's concierge instance persists within that phase but resets across phase transitions. The handover document is the compressed state that bridges the gap.