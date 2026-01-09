The Simplified Model
text

USER CHATS WITH CONCIERGE (natural, no constraints)
         │
         │ User toggles "New Batch" in UI
         ▼
┌─────────────────────────────────────────┐
│  CONTEXT HANDOVER                       │
│  Current concierge writes brief:        │
│  "Here's what I know about this user"   │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  BATCH FAN-OUT                          │
│  6 models respond to user's query       │
│  (informed by handover context)         │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  MAPPER (fresh, stateless)              │
│  Extracts structural map                │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  NEW CONCIERGE (fresh context)          │
│  Receives: Structural Brief +           │
│            Context Handover             │
│  Synthesizes and responds               │
└─────────────────────────────────────────┘
         │
         ▼
USER CONTINUES CHATTING (until next batch toggle)
The Handover Brief
When user triggers a batch, we secretly prompt the current concierge:

text

Before this conversation continues with fresh context, capture what matters.

Write a context brief (adapt starter handover prompt)):
- What is the user actually trying to accomplish?
- What constraints have they revealed? (time, skill, resources, priorities)
- What decisions are already locked? (things they've committed to)
- What were they just asking about or stuck on?
- Any preferences or resistance you've observed? (add more points from starter handover prompt)

Be concrete. Skip anything generic. Only what a fresh instance needs to continue seamlessly.

<<<CONTEXT_BRIEF>>>
[your brief here]
<<<END>>>
This gets parsed, stored, and injected into the new concierge's prompt after the batch returns.

The New Concierge Prompt (Single, Simple)
text
(use concierge main prompt template from @conciergeservices.ts)
You are Singularity—unified intelligence from multiple expert perspectives.

## The Query
"{userMessage}"

{IF context brief exists from prior conversation:}
## What You Already Know About This User
{contextBrief}
etc.

Respond.


Agent Instructions


Part 1: Remove Phase Complexity
Files to simplify or remove:

Remove entirely:

services/concierge/starter.prompt.ts
services/concierge/explorer.prompt.ts
services/concierge/executor.prompt.ts
services/concierge/handover.types.ts (replace with simpler type)
services/concierge/handover.parser.ts (replace with simpler parser)
In ConciergeService.ts:

Remove buildCapabilitiesSection function
Remove buildSignalInstructions function

use original buildConciergePrompt just add contextbrief section for when it exists.

Remove phase state tracking

Remove handover parsing for WORKFLOW/STEP_HELP signals
Keep only: build prompt → send → parse response
In CognitivePipelineHandler.js:

Remove all phase-aware prompt selection logic
Remove phaseState management
Single path: build concierge prompt with structural brief and normal logic for how shape analysis  and stance + optional context brief



Part 2: Add Context Handover
New simple type:

TypeScript
adapt starter to explorer handover structure and prompt
New handover prompt builder:

TypeScript

export function buildContextHandoverPrompt(): string {
  return `Before this conversation continues with fresh context, capture what matters.

Write a context brief:
- What is the user actually trying to accomplish?
- What constraints have they revealed? (time, skill, resources, priorities)
- What decisions are already locked?
- What were they just asking about or stuck on?
- Any preferences or resistance you've observed? (add more points from starter handover prompt)

Be concrete. Skip anything generic. Only what a fresh instance needs to continue seamlessly.

<<<CONTEXT_BRIEF>>>
goal: [one line]
constraints: [list]
decisions: [list]
current_focus: [what they're working on now]
observations: [anything else that matters] etc.
<<<END>>>`;
}
New parser:

TypeScript

export function parseContextBrief(response: string): ContextBrief | null {
  // Look for <<<CONTEXT_BRIEF>>>...<<<END>>> block
  // Parse YAML-like content into ContextBrief
  // Return null if not found
}
Flow when user triggers batch:

Send buildContextHandoverPrompt() to current concierge
Parse response for context brief
Execute batch fan-out with user's new query
Run mapper (fresh, stateless)
Run structural analysis
Build new concierge prompt with:
User's query
Context brief (if exists)
New structural brief
Send to fresh concierge instance
Part 3: Fix Structural Brief
Replace buildStructuralBrief with version that:

Drops raw metrics — no percentages without meaning

Uses claim labels/text everywhere — never claim_1

Expands all counts to content:

Gaps → list actual gap descriptions from ghostAnalysis.ghosts
Fragilities → name the fragile claims and why they matter
Bridges → identify which claims are bridges
Makes stakes concrete — what you gain/lose, not restatements

New structure:

TypeScript

export function buildStructuralBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, ghostAnalysis } = analysis;
  
  let brief = "";
  
  // The Landscape (one line summary)
  brief += `## The Landscape\n\n`;
  brief += `${landscape.modelCount} perspectives examined this. `;
  brief += getPatternSummary(shape.primaryPattern, analysis);
  brief += `\n\n`;
  
  // Pattern-specific content (with named claims, not IDs)
  brief += buildPatternContent(analysis);
  
  // Fragilities (if any, with actual claim names)
  const 

