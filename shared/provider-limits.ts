/**
 * Shared provider limits configuration.
 * Defines maximum input characters and warning thresholds for each provider.
 */
export const PROVIDER_LIMITS = {
    chatgpt: { maxInputChars: 32000, warnThreshold: 25000 },
    claude: { maxInputChars: 100000, warnThreshold: 80000 },
    gemini: { maxInputChars: 30000, warnThreshold: 25000 },
    'gemini-pro': { maxInputChars: 120000, warnThreshold: 100000 },
    'gemini-exp': { maxInputChars: 30000, warnThreshold: 25000 },
    qwen: { maxInputChars: 30000, warnThreshold: 25000 },
} as const;

export type ProviderLimits = typeof PROVIDER_LIMITS;
export type ProviderId = keyof ProviderLimits;
