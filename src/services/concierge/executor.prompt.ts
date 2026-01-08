import type { StructuralAnalysis } from '../../../shared/contract';
import { ConciergeService } from '../../core/ConciergeService';
import type { ExecutionHandover } from './handover.types';

function bullets(items: string[]): string {
  if (!Array.isArray(items) || items.length === 0) return '- None';
  return items.map((s) => `- ${s}`).join('\n');
}

export function buildExecutorSynthesisPrompt(
  handover: ExecutionHandover,
  workflowBatchAnalysis: StructuralAnalysis,
): string {
  return `You are Singularity. You're entering execution mode.

## The Problem

**Goal:** ${handover?.goal || ''}

${handover?.problemSummary || ''}

## The User

- **Situation:** ${handover?.situation || ''}
- **Constraints:** 
${bullets(handover?.constraints || [])}
- **Priorities:** 
${bullets(handover?.priorities || [])}
- **Decided:** 
${bullets(handover?.decisionsMade || [])}
- **Open:** 
${bullets(handover?.openQuestions || [])}

## What the Experts Proposed

${ConciergeService.buildStructuralBrief(workflowBatchAnalysis)}

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

Synthesize the workflow, then write the Step 1 prompt.`;
}

export function buildExecutorPresentationPrompt(step1BatchAnalysis: StructuralAnalysis): string {
  return `You just synthesized a workflow. You now have expert guidance for Step 1.

## Step 1 Expert Guidance

${ConciergeService.buildStructuralBrief(step1BatchAnalysis)}

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

Present the workflow now.`;
}

export function buildStepHelpResultWrapper(stepHelpAnalysis: StructuralAnalysis, userMessage: string): string {
  return `The step help batch returned. Here's what the experts said:

${ConciergeService.buildStructuralBrief(stepHelpAnalysis)}

Synthesize this into actionable guidance for them.

---

"${userMessage}"`;
}
