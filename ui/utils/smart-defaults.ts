


// Priority list for Mapping (Decision Map)
// Best for decision maps: gemini default, qwen, chatgpt, gemini 3.0, claude, gemini 2.5 pro
export const MAPPING_PRIORITY = [
    'gemini',
    'qwen',
    'gemini-pro',
    'gemini-exp',
    'claude',
    'chatgpt'
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
