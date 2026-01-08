Adapted Concierge Service with Workflow Generation
Here's the adapted prompt and supporting infrastructure. The key changes:

Capabilities section - teaches the concierge when and how to trigger batch requests
Signal format - parseable delimiters the system can detect
Batch prompt generation instructions - how to write expert-role-led prompts
Parsing logic - extracts signals and routes appropriately
TypeScript

// ═══════════════════════════════════════════════════════════════════════════
// SIGNAL TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface WorkflowSignal {
  type: 'GENERATE_WORKFLOW';
  goal: string;
  context: string;
  batchPrompt: string;
}

export interface StepHelpSignal {
  type: 'STEP_HELP_NEEDED';
  step: string;
  blocker: string;
  constraint: string;
  batchPrompt: string;
}

export type ConciergeSignal = WorkflowSignal | StepHelpSignal | null;

export interface ConciergeOutput {
  userResponse: string;
  signal: ConciergeSignal;
}

export interface ActiveWorkflow {
  goal: string;
  steps: WorkflowStep[];
  currentStepIndex: number;
}

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  doneWhen: string;
  status: 'pending' | 'active' | 'complete';
}

// ═══════════════════════════════════════════════════════════════════════════
// CAPABILITIES & WORKFLOW INSTRUCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function buildCapabilitiesSection(activeWorkflow?: ActiveWorkflow): string {
  const workflowStatus = activeWorkflow 
    ? `\n\n**Active Workflow:** "${activeWorkflow.goal}" — Step ${activeWorkflow.currentStepIndex + 1}/${activeWorkflow.steps.length}`
    : '';

  return `## Capabilities

You can trigger multi-perspective batch queries:

**WORKFLOW** — Generate an action plan from multiple expert perspectives
- Trigger when: exploration complete, user ready for action, sufficient context gathered
- Don't trigger when: still clarifying, missing critical info, task is simple

**STEP_HELP** — Get synthesized guidance for a specific blocker
- Trigger when: user stuck on complex step with multiple valid approaches
- Don't trigger when: answer is straightforward (just answer directly)
${workflowStatus}`;
}

function buildSignalInstructions(): string {
  return `## Signal Format

To trigger a batch request, end your response with:

\`\`\`
<<<BATCH>>>
TYPE: WORKFLOW | STEP_HELP
GOAL: [outcome user wants]
STEP: [for STEP_HELP: current step]
BLOCKER: [for STEP_HELP: what's blocking]
CONTEXT: [constraints, situation, priorities]

PROMPT:
[the prompt to send to expert models]
<<<END>>>
\`\`\`

Everything before \`<<<BATCH>>>\` is shown to user. The signal is parsed and executed.

## Batch Prompt Requirements

The prompt you write will be sent to multiple AI models in parallel. Their responses get synthesized.

**Structure:**
1. **Role** — First line must define the expert. Be maximally specific to this task. Include credentials, experience level, and domain specialization. Generic roles produce generic outputs.
2. **Task** — State exactly what you need in 1-2 sentences
3. **Context** — Bullet the user's situation, constraints, priorities, and what's already decided
4. **Output spec** — What to produce, what format, what to include/exclude
5. **Quality anchors** — Specific over generic, actionable over conceptual, decisions over options

**Principles:**
- The role should be the highest-caliber expert for THIS specific task
- Include everything the expert needs to give tailored advice
- Ask for decisions and recommendations, not just options
- Specify what "done" looks like
- Request concrete details, not abstractions`;
}

---

## Your Response Format

Most turns: Just respond naturally. No signal needed.

When triggering a batch request:

\`\`\`
[Your natural response to the user, acknowledging what you're about to do]

<<<SINGULARITY_BATCH_REQUEST>>>
TYPE: WORKFLOW
GOAL: [extracted from conversation]
CONTEXT: [what you know about their situation]

PROMPT:
[Your expertly crafted batch prompt following the structure above]
<<<END_BATCH_REQUEST>>>
\`\`\`

The user sees everything before the \`<<<\` delimiter. The system parses and executes everything after.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// UPDATED MAIN PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export function buildConciergePrompt(
  userMessage: string,
  analysis: StructuralAnalysis,
  options?: {
    stance?: ConciergeStance;
    conversationHistory?: string;
    activeWorkflow?: ActiveWorkflow;
    isFirstTurn?: boolean;
  }
): string {
  const stance = options?.stance ?? 'default';
  const structuralBrief = buildStructuralBrief(analysis);
  const shapeGuidance = getShapeGuidance(analysis.shape);
  const stanceGuidance = getStanceGuidance(stance);

  const framingLine = stanceGuidance.framing ? `\n${stanceGuidance.framing}\n` : '';
  const historySection = options?.conversationHistory 
    ? `## Conversation\n${options.conversationHistory}\n` 
    : '';
  const workflowSection = options?.activeWorkflow 
    ? `## Active Workflow\n${formatActiveWorkflow(options.activeWorkflow)}\n` 
    : '';

  // Only include capabilities from turn 2 onwards
  const capabilitiesSection = options?.isFirstTurn 
    ? '' 
    : buildCapabilitiesSection(options?.activeWorkflow);

  return `You are Singularity—unified intelligence from multiple expert perspectives.
${framingLine}
## Query
"${userMessage}"

${historySection}
## Structural Analysis
${structuralBrief}

${workflowSection}
${capabilitiesSection}

## Response Guide
${shapeGuidance}

${stanceGuidance.behavior}

**Voice:** ${stanceGuidance.voice}

**Never:** Reference models/analysis/structure/claims/batch. Hedge without explanation. Say "it depends" without saying on what.

Respond.`;
}
// Turn 1
const prompt = buildConciergePrompt(userMessage, analysis, { 
  isFirstTurn: true 
});

// Turn 2+
const prompt = buildConciergePrompt(userMessage, analysis, {
  isFirstTurn: false,
  conversationHistory: history,
  activeWorkflow: workflow // if one exists
});

function formatActiveWorkflow(workflow: ActiveWorkflow): string {
  let output = `**Goal:** ${workflow.goal}\n\n`;
  output += `**Progress:** Step ${workflow.currentStepIndex + 1} of ${workflow.steps.length}\n\n`;
  
  workflow.steps.forEach((step, idx) => {
    const statusIcon = step.status === 'complete' ? '✓' : step.status === 'active' ? '→' : '○';
    const current = idx === workflow.currentStepIndex ? ' **(current)**' : '';
    output += `${statusIcon} **${step.title}**${current}\n`;
    if (idx === workflow.currentStepIndex) {
      output += `   ${step.description}\n`;
      output += `   *Done when: ${step.doneWhen}*\n`;
    }
    output += '\n';
  });

  return output;
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT PARSING
// ═══════════════════════════════════════════════════════════════════════════

export function parseConciergeOutput(rawResponse: string): ConciergeOutput {
  // Look for the signal delimiter
  const signalMatch = rawResponse.match(
    /<<<SINGULARITY_BATCH_REQUEST>>>([\s\S]*?)<<<END_BATCH_REQUEST>>>/
  );

  if (!signalMatch) {
    return {
      userResponse: rawResponse.trim(),
      signal: null
    };
  }

  // Extract user-facing response (everything before the signal)
  const userResponse = rawResponse
    .substring(0, rawResponse.indexOf('<<<SINGULARITY_BATCH_REQUEST>>>'))
    .trim();

  // Parse the signal content
  const signalContent = signalMatch[1];
  const signal = parseSignalContent(signalContent);

  return {
    userResponse,
    signal
  };
}

function parseSignalContent(content: string): ConciergeSignal {
  // Extract TYPE
  const typeMatch = content.match(/TYPE:\s*(\w+)/i);
  const type = typeMatch?.[1]?.toUpperCase();

  // Extract PROMPT (everything after "PROMPT:")
  const promptMatch = content.match(/PROMPT:\s*([\s\S]*?)$/);
  const batchPrompt = promptMatch?.[1]?.trim() || '';

  if (!batchPrompt) {
    console.warn('[ConciergeService] Signal detected but no batch prompt found');
    return null;
  }

  if (type === 'WORKFLOW') {
    const goalMatch = content.match(/GOAL:\s*(.+?)(?=\n(?:STEP:|BLOCKER:|CONTEXT:|PROMPT:)|$)/s);
    const contextMatch = content.match(/CONTEXT:\s*(.+?)(?=\n(?:PROMPT:)|$)/s);

    return {
      type: 'GENERATE_WORKFLOW',
      goal: goalMatch?.[1]?.trim() || '',
      context: contextMatch?.[1]?.trim() || '',
      batchPrompt
    };
  }

  if (type === 'STEP_HELP') {
    const stepMatch = content.match(/STEP:\s*(.+?)(?=\n(?:BLOCKER:|CONTEXT:|PROMPT:)|$)/s);
    const blockerMatch = content.match(/BLOCKER:\s*(.+?)(?=\n(?:CONTEXT:|PROMPT:)|$)/s);
    const contextMatch = content.match(/CONTEXT:\s*(.+?)(?=\n(?:PROMPT:)|$)/s);

    return {
      type: 'STEP_HELP_NEEDED',
      step: stepMatch?.[1]?.trim() || '',
      blocker: blockerMatch?.[1]?.trim() || '',
      constraint: contextMatch?.[1]?.trim() || '',
      batchPrompt
    };
  }

  console.warn(`[ConciergeService] Unknown signal type: ${type}`);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// UPDATED MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export interface HandleTurnResult {
  response: string;
  stance: ConciergeStance;
  stanceReason: string;
  signal: ConciergeSignal;
}

export async function handleTurn(
  userMessage: string,
  analysis: StructuralAnalysis,
  callLLM: (prompt: string) => Promise<string>,
  options?: {
    stanceOverride?: ConciergeStance;
    conversationHistory?: string;
    activeWorkflow?: ActiveWorkflow;
  }
): Promise<HandleTurnResult> {

  // Handle meta queries
  if (isMetaQuery(userMessage)) {
    return {
      response: buildMetaResponse(analysis),
      stance: 'default',
      stanceReason: 'meta_query',
      signal: null
    };
  }

  // Select stance
  const selection = options?.stanceOverride
    ? { stance: options.stanceOverride, reason: 'user_override' as const, confidence: 1.0 }
    : selectStance(userMessage, analysis.shape);

  // Build and execute prompt
  const prompt = buildConciergePrompt(
    userMessage, 
    analysis, 
    selection.stance,
    options?.conversationHistory,
    options?.activeWorkflow
  );
  
  const raw = await callLLM(prompt);

  // Parse output for signals
  const parsed = parseConciergeOutput(raw);

  // Post-process user-facing response
  const processed = postProcess(parsed.userResponse);
  
  // Check for leakage
  const leakage = detectMachineryLeakage(processed);
  if (leakage.leaked) {
    console.warn('[ConciergeService] Machinery leakage detected:', leakage.violations);
  }

  // Log signal if present
  if (parsed.signal) {
    console.log('[ConciergeService] Signal detected:', parsed.signal.type);
  }

  return {
    response: processed,
    stance: selection.stance,
    stanceReason: selection.reason,
    signal: parsed.signal
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH PROMPT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export function validateBatchPrompt(prompt: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for expert role at start
  const startsWithRole = /^You are (a |an |the )/i.test(prompt.trim());
  if (!startsWithRole) {
    issues.push('Prompt should start with an expert role definition ("You are a...")');
  }

  // Check for specificity
  if (prompt.length < 200) {
    issues.push('Prompt seems too short—may lack necessary context');
  }

  // Check for generic role
  const genericRoles = [
    /You are an? (expert|assistant|helper|AI)/i,
    /You are an? (software engineer|developer|marketer)\.?\s/i, // Too generic if no qualifiers
  ];
  if (genericRoles.some(p => p.test(prompt))) {
    issues.push('Expert role may be too generic—add specific credentials and experience');
  }

  // Check for context section
  if (!/context|situation|background/i.test(prompt)) {
    issues.push('Prompt may be missing context section');
  }

  // Check for output specification
  if (!/provide|create|generate|output|deliverable/i.test(prompt)) {
    issues.push('Prompt may be missing clear output specification');
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const ConciergeService = {
  // Existing exports
  selectStance,
  buildConciergePrompt,
  postProcess,
  detectMachineryLeakage,
  isMetaQuery,
  buildMetaResponse,
  handleTurn,
  
  // New exports for workflow/signal handling
  parseConciergeOutput,
  validateBatchPrompt,
};
System Integration
Here's how the system layer should handle the signals:

TypeScript

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM SIGNAL HANDLER
// ═══════════════════════════════════════════════════════════════════════════

import { ConciergeService, ConciergeSignal, WorkflowSignal, StepHelpSignal } from './concierge';
import { BatchFanOut } from './batch';
import { MapperService } from './mapper';

export async function processConciergeTurn(
  userMessage: string,
  analysis: StructuralAnalysis,
  options: ProcessOptions
): Promise<ProcessResult> {
  
  // 1. Get concierge response
  const conciergeResult = await ConciergeService.handleTurn(
    userMessage,
    analysis,
    options.callLLM,
    {
      conversationHistory: options.conversationHistory,
      activeWorkflow: options.activeWorkflow,
    }
  );

  // 2. If no signal, just return the response
  if (!conciergeResult.signal) {
    return {
      userResponse: conciergeResult.response,
      workflowGenerated: null,
      stepHelpProvided: null,
    };
  }

  // 3. Handle signal
  const signal = conciergeResult.signal;

  if (signal.type === 'GENERATE_WORKFLOW') {
    return await handleWorkflowGeneration(signal, conciergeResult, options);
  }

  if (signal.type === 'STEP_HELP_NEEDED') {
    return await handleStepHelp(signal, conciergeResult, options);
  }

  // Unknown signal type - just return response
  return {
    userResponse: conciergeResult.response,
    workflowGenerated: null,
    stepHelpProvided: null,
  };
}

async function handleWorkflowGeneration(
  signal: WorkflowSignal,
  conciergeResult: HandleTurnResult,
  options: ProcessOptions
): Promise<ProcessResult> {
  
  // Validate the batch prompt
  const validation = ConciergeService.validateBatchPrompt(signal.batchPrompt);
  if (!validation.valid) {
    console.warn('[System] Batch prompt quality issues:', validation.issues);
  }

  // 1. Fan out to all models
  const modelResponses = await BatchFanOut.query(signal.batchPrompt, options.models);

  // 2. Run through mapper
  const mapped = await MapperService.map(modelResponses);

  // 3. Run structural analysis
  const workflowAnalysis = StructuralAnalyzer.analyze(mapped);

  // 4. Build synthesis prompt for concierge
  const synthesisPrompt = buildWorkflowSynthesisPrompt(signal, workflowAnalysis);
  
  // 5. Get synthesized workflow from concierge
  const synthesizedWorkflow = await options.callLLM(synthesisPrompt);

  // 6. Parse into structured workflow
  const workflow = parseWorkflowFromSynthesis(synthesizedWorkflow, signal.goal);

  return {
    userResponse: conciergeResult.response,
    workflowGenerated: workflow,
    stepHelpProvided: null,
    followUpResponse: synthesizedWorkflow, // The actual workflow presentation
  };
}

async function handleStepHelp(
  signal: StepHelpSignal,
  conciergeResult: HandleTurnResult,
  options: ProcessOptions
): Promise<ProcessResult> {

  // 1. Fan out to all models
  const modelResponses = await BatchFanOut.query(signal.batchPrompt, options.models);

  // 2. Run through mapper
  const mapped = await MapperService.map(modelResponses);

  // 3. Run structural analysis
  const stepAnalysis = StructuralAnalyzer.analyze(mapped);

  // 4. Build synthesis prompt for concierge
  const synthesisPrompt = buildStepHelpSynthesisPrompt(signal, stepAnalysis);
  
  // 5. Get synthesized help from concierge
  const synthesizedHelp = await options.callLLM(synthesisPrompt);

  return {
    userResponse: conciergeResult.response,
    workflowGenerated: null,
    stepHelpProvided: {
      step: signal.step,
      guidance: synthesizedHelp,
    },
    followUpResponse: synthesizedHelp,
  };
}

function buildWorkflowSynthesisPrompt(
  signal: WorkflowSignal,
  analysis: StructuralAnalysis
): string {
  const brief = buildStructuralBrief(analysis);

  return `You are Singularity. You just gathered workflow recommendations from multiple experts. Now synthesize them into a single, coherent workflow.

## The Goal
${signal.goal}

## Context
${signal.context}

## What the Experts Said
${brief}

## Your Task
Synthesize this into a unified, actionable workflow. 

Structure it as:
1. Clear phases with specific steps
2. Time estimates where relevant
3. "Done when" criteria for each phase
4. Key decision points and your recommendation
5. Common pitfalls to avoid

Where experts agreed: present with confidence.
Where experts disagreed: pick the best path for this user's context and note alternatives briefly.
Where something was uniquely valuable: include it.

Present the workflow directly to the user. Don't reference "the experts" or "the analysis."

Speak as the unified voice that has already resolved internal debates.`;
}

function buildStepHelpSynthesisPrompt(
  signal: StepHelpSignal,
  analysis: StructuralAnalysis
): string {
  const brief = buildStructuralBrief(analysis);

  return `You are Singularity. You just gathered step-specific guidance from multiple experts. Now synthesize it into clear, actionable help.

## The Step
${signal.step}

## The Blocker
${signal.blocker}

## Context
${signal.constraint}

## What the Experts Said
${brief}

## Your Task
Synthesize this into clear guidance:

1. **The Recommendation**: What should they do? Pick one primary approach.
2. **How to Do It**: Specific, step-by-step instructions
3. **Why This Approach**: Brief explanation
4. **Watch Out For**: 2-3 things that commonly go wrong
5. **Alternative** (if relevant): One backup approach if the primary doesn't work

Be specific and actionable. Don't say "set up authentication"—say exactly which commands to run.

Speak directly to the user. Don't reference sources or analysis.`;
}
Key Design Decisions
1. Signal Format
Used <<<SINGULARITY_BATCH_REQUEST>>> delimiters because:

Unlikely to appear in normal conversation
Easy to parse with regex
Clear visual separation
Includes structured fields + freeform prompt
2. Expert Role Generation
The concierge generates the expert role dynamically based on:

The domain (software, marketing, content, etc.)
The specific task within that domain
The user's apparent needs
Included a reference table of examples but emphasized being specific rather than generic.

3. Prompt Quality Guidance
Embedded detailed prompt engineering instructions because:

The batch prompt quality determines synthesis quality
LLMs can generate excellent prompts when shown examples
This makes the system self-improving
4. Validation Layer
Added validateBatchPrompt() to catch:

Missing expert roles
Too-short prompts
Generic roles without specificity
Missing context sections
5. Separation of Concerns
Concierge: Decides when to trigger, generates the prompt
System: Parses signal, executes batch, feeds back to concierge
Concierge (synthesis): Gets separate prompt specifically for synthesizing batch results
This keeps the concierge focused on intelligence while the system handles orchestration.