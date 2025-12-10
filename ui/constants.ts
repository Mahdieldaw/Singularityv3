import { LLMProvider } from "./types";

import { INITIAL_PROVIDERS } from "./providers/providerRegistry";

export const LLM_PROVIDERS_CONFIG: LLMProvider[] = [...INITIAL_PROVIDERS];

export const SIMULATION_CHUNK_DELAY_MS = 70;
export const FIRST_SENTENCE_SUMMARY_CHUNKS = 8;
export const FULL_OUTPUT_CHUNKS = 30;
export const OVERALL_SUMMARY_CHUNKS = 15;

export const EXAMPLE_PROMPT =
  "Explain the concept of quantum entanglement in simple terms.";

export const STREAMING_PLACEHOLDER = ""; // CSS will handle visual streaming indicators (pulsing dots)

// Preferred streaming providers to prioritize in visible slots when 4+ are selected
export const PRIMARY_STREAMING_PROVIDER_IDS: string[] = [
  "gemini-exp",
  "claude",
  "qwen",
];

// Provider color mapping for orb animations
export const PROVIDER_COLORS: Record<string, string> = {
  'claude-sonnet': '#d946ef',        // fuchsia-purple
  'claude': '#d946ef',               // fuchsia-purple
  'gemini-flash': '#8b5cf6',         // violet
  'gemini-exp': '#8b5cf6',           // violet
  'gemini': '#8b5cf6',               // violet
  'grok': '#10b981',                 // emerald
  'openai-4o': '#f59e0b',            // amber
  'o1': '#f59e0b',                   // amber
  'o3': '#f59e0b',                   // amber
  'deepseek': '#06b6d4',             // cyan
  'qwen': '#06b6d4',                 // cyan
  'llama': '#06b6d4',                // cyan
  'mistral': '#06b6d4',              // cyan
  'default': '#64748b'               // slate fallback
};

// Accent colors complementing the primary provider colors for richer gradients
export const PROVIDER_ACCENT_COLORS: Record<string, string> = {
  'claude-sonnet': '#a21caf',         // deeper fuchsia
  'claude': '#a21caf',                // deeper fuchsia
  'gemini-flash': '#6d28d9',          // deep violet
  'gemini-exp': '#6d28d9',            // deep violet
  'gemini': '#6d28d9',                // deep violet
  'grok': '#047857',                  // deep emerald
  'openai-4o': '#b45309',             // deep amber
  'o1': '#b45309',                    // deep amber
  'o3': '#b45309',                    // deep amber
  'deepseek': '#0e7490',              // deep cyan
  'qwen': '#0e7490',                  // deep cyan
  'llama': '#0e7490',                 // deep cyan
  'mistral': '#0e7490',               // deep cyan
  'default': '#334155'                // deep slate
};

// Workflow stage colors used by progress rings and badges
export const WORKFLOW_STAGE_COLORS: Record<
  'idle' | 'thinking' | 'streaming' | 'complete' | 'error' | 'synthesizing',
  string
> = {
  idle: 'rgba(255,255,255,0.35)',
  thinking: '#A78BFA',       // violet-400
  streaming: '#34D399',      // emerald-400
  complete: '#60A5FA',       // blue-400
  error: '#EF4444',          // red-500
  synthesizing: '#F59E0B',   // amber-500
};

