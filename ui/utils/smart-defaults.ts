import { LLMProvider } from "../types";

// Priority list for Synthesis (Single Speaker)
// Claude as strongest, gemini 3.0 exp next in line, then Qwen, Then gemini 2.5 pro, then chatgpt, then gemini default
export const SYNTHESIS_PRIORITY = [
    'claude',
    'gemini-exp',
    'qwen',
    'gemini-pro',
    'chatgpt',
    'gemini'
];

// Priority list for Mapping (Decision Map)
// Best for decision maps: gemini default, qwen, chatgpt, gemini 3.0, claude, gemini 2.5 pro
export const MAPPING_PRIORITY = [
    'gemini',
    'qwen',
    'chatgpt',
    'gemini-exp',
    'claude',
    'gemini-pro'
];

/**
 * Selects the best available provider from a priority list based on authentication status.
 * @param priorityList Array of provider IDs in descending order of preference.
 * @param authStatus Record of provider IDs to boolean auth status.
 * @returns The ID of the best available provider, or null if none are available.
 */
export function selectSmartDefault(
    priorityList: string[],
    authStatus: Record<string, boolean>
): string | null {
    for (const providerId of priorityList) {
        if (authStatus[providerId] === true) {
            return providerId;
        }
    }
    return null; // No providers available
}
