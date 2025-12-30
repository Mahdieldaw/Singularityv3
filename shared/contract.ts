// ============================================================================
// CORE TYPES & ENUMS
// ============================================================================
export type ProviderKey =
  | "claude"
  | "gemini"
  | "gemini-pro"
  | "chatgpt"
  | "qwen";
export type WorkflowStepType = "prompt" | "mapping" | "refiner" | "antagonist" | "understand" | "gauntlet";

export type CognitiveMode = "auto" | "understand" | "decide";

export interface GauntletOutput {
  the_answer: {
    statement: string;
    reasoning: string;
    next_step: string;
  };
  survivors: {
    primary: { claim: string; survived_because: string };
    supporting: Array<{ claim: string; relationship: string }>;
    conditional: Array<{ claim: string; condition: string }>;
  };
  eliminated: {
    from_consensus: Array<{ claim: string; killed_because: string }>;
    from_outliers: Array<{ claim: string; source: string; killed_because: string }>;
    ghost: string | null;
  };
  confidence: {
    score: number; // 0-1
    display: string; // dots
    notes: string[];
  };
  souvenir: string;
  artifact_id: string;
}

export interface MapperArtifact {
  consensus: {
    claims: Array<{
      text: string;
      supporters: number[];
      support_count: number;
      // Enhanced fields for computeExplore
      dimension?: string;       // "speed" | "cost" | "hiring" | "simplicity" | etc.
      applies_when?: string;    // Condition when this is especially true
    }>;
    quality: "resolved" | "conventional" | "deflected";
    strength: number; // 0-1
  };
  outliers: Array<{
    insight: string;
    source: string; // model name
    source_index: number;
    type: "supplemental" | "frame_challenger";
    raw_context: string; // 10-20 words surrounding context
    // Enhanced fields for computeExplore
    dimension?: string;         // What axis does this address
    applies_when?: string;      // When is this the right path
    challenges?: string;        // Which consensus claim does this challenge
  }>;
  // Pre-identified relationships (for computeExplore)
  tensions?: Array<{
    between: [string, string];  // Two claim texts or labels
    type: "conflicts" | "tradeoff";
    axis: string;               // What they're trading off on
  }>;
  // Dimension summary (Mapper counts these as it tags)
  dimensions_found?: string[];  // ["speed", "cost", "hiring", "simplicity"]

  topology: "high_confidence" | "dimensional" | "contested";
  ghost: string | null;
  query: string;
  turn: number;
  timestamp: string;
  model_count: number;
  souvenir?: string;
}

// ============================================================================
// EXPLORE ANALYSIS (Computed, not LLM-generated)
// ============================================================================

export type QueryType = "informational" | "procedural" | "advisory" | "comparative" | "creative" | "predictive" | "interpretive" | "general";

export type ContainerType = "direct_answer" | "decision_tree" | "comparison_matrix" | "exploration_space";

// Specificity levels for claims/outliers
export type Specificity = "vague" | "moderate" | "specific" | "actionable";

// Enriched outlier with computed scores (extends MapperArtifact.outliers)
export interface EnrichedOutlier {
  // Original fields from MapperArtifact.outliers
  insight: string;
  source: string;
  source_index: number;
  type: "supplemental" | "frame_challenger";
  raw_context: string;
  dimension?: string;
  applies_when?: string;
  challenges?: string;

  // Computed scores
  id: string;                       // Stable ID for selection (outlier-N)
  elevation_score: number;          // 0-10 composite
  covers_consensus_gap: boolean;    // Dimension not in consensus
  specificity: Specificity;
  is_recommended: boolean;          // Top 3 by elevation_score
}

// Coverage analysis per dimension
export interface DimensionCoverage {
  dimension: string;
  consensus_claims: number;         // Count of consensus claims
  outlier_claims: number;           // Count of outliers
  is_gap: boolean;                  // Outliers only, no consensus
  is_contested: boolean;            // Has frame_challenger or both present
  status: "gap" | "contested" | "settled";
  leader: string | null;            // Top claim text
  leader_source: string | null;     // Who said it
  support_bar: number | null;       // e.g., 6/6 = 6
}

// Universal summary bar data
export interface SummaryBarData {
  lead: {
    text: string;
    support: number | null;
    type: "consensus" | "contested" | "exploration";
  };
  coverage: {
    gaps: number;
    contested: number;
    settled: number;
    total: number;
  };
  signals: {
    challengers: number;
    conditions: number;
    tensions: number;
    ghost: string | null;
  };
  meta: {
    modelCount: number;
    strength: number; // 0-100
    queryType: QueryType;
    escapeVelocity: boolean;
    topology: "high_confidence" | "dimensional" | "contested";
  };
}

export interface ExploreDimension {
  name: string;
  winner: string;
  support: number;
  alternatives: string[];
}

export interface ExploreCondition {
  if: string;
  then: string;
  source: string;
  challenges?: string;
}

export interface ExploreParadigm {
  name: string;
  source: string;
  core_idea: string;
  challenges?: string;
}

export interface ExploreConflict {
  between: [string, string];
  type: "conflicts" | "challenges" | "tradeoff";
  axis: string;
}

export interface ExploreAnalysis {
  queryType: QueryType;
  /** @deprecated - Legacy container routing. Kept for debugging. */
  containerType: ContainerType;
  dimensions: ExploreDimension[];
  conditions: ExploreCondition[];
  paradigms: ExploreParadigm[];
  conflicts: ExploreConflict[];
  escapeVelocity: boolean;

  // NEW: Dimension-first analysis
  dimensionCoverage: DimensionCoverage[];
  recommendedOutliers: EnrichedOutlier[];
  allOutliers: EnrichedOutlier[];
  summaryBar: SummaryBarData;
}

export interface UnderstandOutput {
  short_answer: string;
  long_answer: string;
  the_one: { insight: string; source: string | null; why_this: string } | null;
  the_echo: { position: string; source: string; merit: string } | null;
  souvenir: string;
  artifact_id: string;
}

// ============================================================================
// SECTION 1: WORKFLOW PRIMITIVES (UI -> BACKEND)
// These are the three fundamental requests the UI can send to the backend.
// ============================================================================

export type PrimitiveWorkflowRequest =
  | InitializeRequest
  | ExtendRequest
  | RecomputeRequest;

/**
 * Starts a new conversation thread.
 */
export interface InitializeRequest {
  type: "initialize";
  sessionId?: string | null; // Optional: can be omitted to let the backend create a new session.
  userMessage: string;
  providers: ProviderKey[];
  includeMapping: boolean;
  includeRefiner?: boolean;
  includeAntagonist?: boolean;
  mapper?: ProviderKey;
  refiner?: ProviderKey;
  antagonist?: ProviderKey;
  useThinking?: boolean;
  providerMeta?: Partial<Record<ProviderKey, any>>;
  clientUserTurnId?: string; // Optional: client-side provisional ID for the user's turn.
  mode?: CognitiveMode;
}

/**
 * Continues an existing conversation with a new user message.
 */
export interface ArtifactCurationPayload {
  turnId: string | null;
  timestamp: number;
  selectedArtifactIds: string[];
  edits?: any;
}

export interface ExtendRequest {
  type: "extend";
  sessionId: string;
  userMessage: string;
  providers: ProviderKey[];
  forcedContextReset?: ProviderKey[];
  includeMapping: boolean;
  mapper?: ProviderKey;
  refiner?: ProviderKey;
  antagonist?: ProviderKey;
  includeRefiner?: boolean;
  includeAntagonist?: boolean;
  useThinking?: boolean;
  providerMeta?: Partial<Record<ProviderKey, any>>;
  clientUserTurnId?: string;
  mode?: CognitiveMode;
  artifactCuration?: ArtifactCurationPayload;
}

/**
 * Re-runs a workflow step for a historical turn with a different provider.
 */
export interface RecomputeRequest {
  type: "recompute";
  sessionId: string;
  sourceTurnId: string;
  stepType: "mapping" | "batch" | "refiner" | "antagonist" | "understand" | "gauntlet";
  targetProvider: ProviderKey;
  userMessage?: string;
  useThinking?: boolean;
}

// ============================================================================
// SECTION 2: COMPILED WORKFLOW (BACKEND-INTERNAL)
// These are the low-level, imperative steps produced by the WorkflowCompiler.
// ============================================================================

export interface PromptStepPayload {
  prompt: string;
  providers: ProviderKey[];
  providerContexts?: Record<
    ProviderKey,
    { meta: any; continueThread: boolean }
  >;
  providerMeta?: Partial<Record<ProviderKey, any>>;
  useThinking?: boolean;
}

export interface MappingStepPayload {
  mappingProvider: ProviderKey;
  sourceStepIds?: string[];
  sourceHistorical?: {
    turnId: string;
    mapperArtifact?: MapperArtifact;
    useCognitivePipeline?: boolean;
  }

}


export interface RefinerStepPayload {
  refinerProvider: ProviderKey;
  sourceStepIds?: string[];
  mappingStepIds?: string[];
  understandOutput?: UnderstandOutput;
  gauntletOutput?: GauntletOutput;
  sourceHistorical?: {
    turnId: string;
    responseType: "batch" | "mapping" | "understand" | "gauntlet";
  };
  originalPrompt: string;
}

export interface AntagonistStepPayload {
  antagonistProvider: ProviderKey;
  sourceStepIds?: string[];
  mappingStepIds?: string[];
  refinerStepIds?: string[];
  understandOutput?: UnderstandOutput;
  gauntletOutput?: GauntletOutput;
  refinerOutput?: any;
  sourceHistorical?: {
    turnId: string;
    responseType: "batch" | "mapping" | "understand" | "gauntlet" | "refiner";
  };
  originalPrompt: string;
}

export interface GauntletStepPayload {
  gauntletProvider: ProviderKey;
  sourceStepIds?: string[];
  mappingStepIds?: string[];
  sourceHistorical?: {
    turnId: string;
    responseType: "batch" | "mapping";
  };
  originalPrompt: string;
  mapperArtifact: MapperArtifact;
}

export interface UnderstandStepPayload {
  understandProvider: ProviderKey;
  sourceStepIds?: string[];
  mappingStepIds?: string[];
  sourceHistorical?: {
    turnId: string;
    responseType: "batch" | "mapping";
  };
  originalPrompt: string;
  mapperArtifact: MapperArtifact;
}

export interface WorkflowStep {
  stepId: string;
  type: WorkflowStepType;
  payload: PromptStepPayload | MappingStepPayload | RefinerStepPayload | AntagonistStepPayload | UnderstandStepPayload | GauntletStepPayload;
}

export interface WorkflowContext {
  sessionId: string;
  threadId: string;
  targetUserTurnId: string;
}

export interface WorkflowRequest {
  workflowId: string;
  context: WorkflowContext;
  steps: WorkflowStep[];
}

// ============================================================================
// SECTION 2b: RESOLVED CONTEXT (Output of ContextResolver)
// ============================================================================

export type ResolvedContext =
  | InitializeContext
  | ExtendContext
  | RecomputeContext;

export interface InitializeContext {
  type: "initialize";
  providers: ProviderKey[];
}

export interface ExtendContext {
  type: "extend";
  sessionId: string;
  lastTurnId: string;
  providerContexts: Record<ProviderKey, { meta: any; continueThread: boolean }>;
}

export interface RecomputeContext {
  type: "recompute";
  sessionId: string;
  sourceTurnId: string;
  frozenBatchOutputs: Record<ProviderKey, ProviderResponse>;
  latestMappingOutput?: { providerId: string; text: string; meta: any } | null;
  providerContextsAtSourceTurn: Record<ProviderKey, { meta: any }>;
  stepType: "mapping" | "batch" | "refiner" | "understand" | "gauntlet";
  targetProvider: ProviderKey;
  sourceUserMessage: string;
}

// ============================================================================
// SECTION 3: REAL-TIME MESSAGING (BACKEND -> UI)
// These are messages sent from the backend to the UI for real-time updates.
// ============================================================================

export interface PartialResultMessage {
  type: "PARTIAL_RESULT";
  sessionId: string;
  stepId: string;
  providerId: ProviderKey;
  chunk: { text?: string; meta?: any };
}

export interface WorkflowStepUpdateMessage {
  type: "WORKFLOW_STEP_UPDATE";
  sessionId: string;
  stepId: string;
  status: "completed" | "failed";
  result?: {
    results?: Record<string, ProviderResponse>; // For batch steps
    providerId?: string; // For single-provider steps
    text?: string;
    status?: string;
    meta?: any;
  };
  error?: string;
}

export interface WorkflowCompleteMessage {
  type: "WORKFLOW_COMPLETE";
  sessionId: string;
  workflowId: string;
  finalResults?: Record<string, any>;
  error?: string;
}

// Real-time workflow progress telemetry for UI (optional but recommended)
export interface WorkflowProgressMessage {
  type: 'WORKFLOW_PROGRESS';
  sessionId: string;
  aiTurnId: string;
  phase: 'batch' | 'mapping';
  providerStatuses: ProviderStatus[];
  completedCount: number;
  totalCount: number;
  estimatedTimeRemaining?: number; // milliseconds
}

export interface TurnCreatedMessage {
  type: "TURN_CREATED";
  sessionId: string;
  userTurnId: string;
  aiTurnId: string;
  providers?: ProviderKey[];
  mappingProvider?: ProviderKey | null;
  refinerProvider?: ProviderKey | null;
  antagonistProvider?: ProviderKey | null;
}

export interface TurnFinalizedMessage {
  type: "TURN_FINALIZED";
  sessionId: string;
  userTurnId: string;
  aiTurnId: string;
  turn: {
    user: {
      id: string;
      type: "user";
      text: string;
      createdAt: number;
      sessionId: string;
    };
    ai: AiTurn;
  };
}

export type PortMessage =
  | PartialResultMessage
  | WorkflowStepUpdateMessage
  | WorkflowCompleteMessage
  | WorkflowProgressMessage
  | WorkflowPartialCompleteMessage
  | RetryProviderRequest
  | TurnFinalizedMessage
  | TurnCreatedMessage;

// ============================================================================
// SECTION 3b: ERROR RESILIENCE & RETRIES (SHARED TYPES)
// ============================================================================

/**
 * Error classification for user-facing messaging and retry logic
 */
export type ProviderErrorType =
  | 'rate_limit'      // 429 - Retryable after cooldown
  | 'auth_expired'    // 401/403 - Requires re-login
  | 'timeout'         // Request took too long - Retryable
  | 'circuit_open'    // Too many recent failures - Auto-retry later
  | 'content_filter'  // Response blocked by provider - Not retryable
  | 'input_too_long'  // Input exceeds provider limit - Not retryable
  | 'network'         // Connection failed - Retryable
  | 'unknown';        // Catch-all - Maybe retryable

export interface ProviderError {
  type: ProviderErrorType;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;    // For rate limits
  requiresReauth?: boolean; // For auth errors
}

/**
 * Enhanced provider status in WORKFLOW_PROGRESS
 */
export interface ProviderStatus {
  providerId: string;
  status: 'queued' | 'active' | 'streaming' | 'completed' | 'failed' | 'skipped';
  progress?: number;
  error?: ProviderError;       // Detailed error info when status === 'failed'
  skippedReason?: string;      // Why it was skipped (e.g., "circuit open")
}

/**
 * Retry request from frontend
 */
export interface RetryProviderRequest {
  type: 'RETRY_PROVIDERS';
  sessionId: string;
  aiTurnId: string;
  providerIds: string[];       // Which providers to retry
  retryScope: 'batch' | 'mapping'; // Which phase to retry
}

/**
 * Partial completion message - sent when workflow completes with some failures
 */
export interface WorkflowPartialCompleteMessage {
  type: 'WORKFLOW_PARTIAL_COMPLETE';
  sessionId: string;
  aiTurnId: string;
  successfulProviders: string[];
  failedProviders: Array<{
    providerId: string;
    error: ProviderError;
  }>;
  mappingCompleted: boolean;
}

// ============================================================================
// SECTION 4: PERSISTENT DATA MODELS
// These are the core data entities representing the application's state.
// ============================================================================

// ============================================================================
// GRAPH TOPOLOGY TYPES
// ============================================================================

export interface GraphNode {
  id: string;
  label: string;
  theme: string;
  supporters: (number | string)[];
  support_count: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'conflicts' | 'complements' | 'prerequisite' | string;
  reason: string;
}

export interface GraphTopology {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ProviderResponse {
  providerId: string;
  text: string;
  status: "pending" | "streaming" | "completed" | "error";
  createdAt: number;
  updatedAt?: number;
  attemptNumber?: number;
  artifacts?: Array<{
    title: string;
    identifier: string;
    content: string;
    type: string;
  }>;
  meta?: {
    conversationId?: string;
    parentMessageId?: string;
    tokenCount?: number;
    thinkingUsed?: boolean;
    _rawError?: string;
    graphTopology?: GraphTopology;
    allAvailableOptions?: string;
    citationSourceOrder?: Record<string | number, string>;
    synthesizer?: string;
    mapper?: string;
    [key: string]: any; // Keep index signature for genuinely unknown provider metadata, but we've explicitly typed the known ones.
  };
}

export interface AiTurn {
  id: string;
  type: "ai";
  sessionId: string | null;
  threadId: string;
  userTurnId: string;
  createdAt: number;
  isComplete?: boolean;
  // Arrays for all response buckets for uniform handling
  batchResponses: Record<string, ProviderResponse[]>;
  mappingResponses: Record<string, ProviderResponse[]>;
  refinerResponses?: Record<string, ProviderResponse[]>;
  antagonistResponses?: Record<string, ProviderResponse[]>;
  exploreResponses?: Record<string, ProviderResponse[]>;
  understandResponses?: Record<string, ProviderResponse[]>;
  gauntletResponses?: Record<string, ProviderResponse[]>;

  // Cognitive Pipeline Artifacts (Computed)
  mapperArtifact?: MapperArtifact;
  exploreAnalysis?: ExploreAnalysis;
  understandOutput?: UnderstandOutput;
  gauntletOutput?: GauntletOutput;

  meta?: {
    branchPointTurnId?: string;
    replacesId?: string;
    isHistoricalRerun?: boolean;
    synthForUserTurnId?: string;
    [key: string]: any;
  };
}

export interface Thread {
  id: string;
  sessionId: string;
  parentThreadId: string | null;
  branchPointTurnId: string | null;
  name: string;
  color: string;
  isActive: boolean;
  createdAt: number;
  lastActivity: number;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================
export function isPromptPayload(payload: any): payload is PromptStepPayload {
  return "prompt" in payload && "providers" in payload;
}
export function isMappingPayload(payload: any): payload is MappingStepPayload {
  return "mappingProvider" in payload;
}
export function isRefinerPayload(payload: any): payload is RefinerStepPayload {
  return "refinerProvider" in payload;
}
export function isGauntletPayload(payload: any): payload is GauntletStepPayload {
  return "gauntletProvider" in payload;
}

export function isUserTurn(turn: any): turn is { type: "user" } {
  return !!turn && typeof turn === "object" && turn.type === "user";
}
export function isAiTurn(turn: any): turn is { type: "ai" } {
  return !!turn && typeof turn === "object" && turn.type === "ai";
}

// ============================================================================
// EXPLORE MODE TYPES
// ============================================================================

export interface DirectAnswerContent {
  answer: string;
  additional_context: Array<{ text: string; source: string }>;
}

export interface DecisionTreeContent {
  default_path: string;
  conditions: Array<{ condition: string; path: string; source: string; reasoning: string }>;
  frame_challenger?: { position: string; source: string; consider_if: string };
}

export interface ComparisonContent {
  dimensions: Array<{ name: string; winner: string; sources: string[]; tradeoff: string }>;
  matrix: { approaches: string[]; dimensions: string[]; scores: number[][] };
}

export interface ExplorationContent {
  paradigms: Array<{ name: string; source: string; core_idea: string; best_for: string }>;
  common_thread?: string;
  ghost?: string;
}

export interface ExploreOutput {
  container: "direct_answer" | "decision_tree" | "comparison_matrix" | "exploration_space";
  content: DirectAnswerContent | DecisionTreeContent | ComparisonContent | ExplorationContent;
  souvenir: string;
  alternatives: Array<{ container: string; label: string }>;
  artifact_id: string;
}
