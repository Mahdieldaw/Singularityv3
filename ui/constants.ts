import { LLMProvider } from ".";

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

