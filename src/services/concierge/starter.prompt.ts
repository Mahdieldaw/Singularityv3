import type { StructuralAnalysis } from '../../../shared/contract';
import type { ConciergeStance } from '../../core/ConciergeService';
import { buildStructuralBrief, getShapeGuidance, getStanceGuidance } from '../../core/ConciergeService';

export function buildStarterInitialPrompt(
  userMessage: string,
  analysis: StructuralAnalysis,
  stance: ConciergeStance,
): string {
  const stanceGuidance = getStanceGuidance(stance);
  const framingLine = stanceGuidance.framing ? `\n${stanceGuidance.framing}\n` : '';
  return `You are Singularity—unified intelligence synthesized from multiple expert perspectives.${framingLine}

## The Query
"${userMessage}"

## What You Know
${buildStructuralBrief(analysis)}

## Response Guide
${getShapeGuidance(analysis.shape)}

${stanceGuidance.behavior}

## Voice
${stanceGuidance.voice}

## Never
- Reference models, analysis, structure, claims
- Hedge without explaining what you're uncertain about
- Say "it depends" without saying on what

Respond.
No handover instructions. Clean focus on the structural response.`;
}

export function buildStarterContinueWrapper(userMessage: string): string {
  return buildStarterContinueWrapperWithSeed(userMessage);
}

export function buildStarterContinueWrapperWithSeed(
  userMessage: string,
  seed?: { shape?: string; userQuery?: string; starterResponse?: string },
): string {
  const shape = String(seed?.shape || '');
  const userQuery = String(seed?.userQuery || '');
  const starterResponse = String(seed?.starterResponse || '');
  return `Continue the conversation naturally.

You may write an Intent Handover when you have sufficient signal:
- Their goal is understood (not just the question they asked)
- Some constraints have surfaced (time, resources, skill, stakes)
- They've engaged with your framing (accepted, resisted, or redirected)

If they're still orienting, exploring, or haven't revealed enough—continue without handover. There's no rush.

To hand over, append after your response:

<<<HANDOVER>>>
shape: ${shape}
key_findings: [list]
tensions: [list]
gaps: [list]
user_query: ${userQuery}
starter_response: ${starterResponse}
user_reply: {their most recent message}
goal: {your interpretation of what they actually want}
constraints: [what limits them]
accepted_framing: {how they engaged}
resisted_framing: {what they pushed back on, or null}
unprompted_reveals: [what they volunteered]
still_unclear: [what the explorer should probe]
effective_stance: explore|decide|challenge
<<<END>>>

---

"${userMessage}"`;
}

export function buildStarterTurn2Wrapper(userMessage: string): string {
  return buildStarterContinueWrapper(userMessage);
}

export function buildStarterTurn2WrapperWithSeed(
  userMessage: string,
  seed?: { shape?: string; userQuery?: string; starterResponse?: string },
): string {
  return buildStarterContinueWrapperWithSeed(userMessage, seed);
}
