export type ConversationPhase = 'starter' | 'explorer' | 'executor';

export interface ConciergePhaseState {
  currentPhase: ConversationPhase;
  turnInPhase: number;
  conciergeContextMeta: Record<string, any> | null;
  intentHandover: IntentHandover | null;
  executionHandover: ExecutionHandover | null;
  activeWorkflow: ActiveWorkflow | null;
  pendingWorkflowAnalysis: any | null;
  pendingStepBatchAnalysis: any | null;
}

export interface IntentHandover {
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

export interface ExecutionHandover {
  goal: string;
  problemSummary: string;
  situation: string;
  constraints: string[];
  priorities: string[];
  decisionsMade: string[];
  openQuestions: string[];
  explorationHighlights: string[];
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

