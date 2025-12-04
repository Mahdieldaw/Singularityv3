// src/core/preflight-validator.js
import { selectBestProvider, isProviderAuthorized, PROVIDER_PRIORITIES } from '../../shared/provider-config.js';
import { getProviderLocks } from '../../shared/provider-locks.js';

// Provider login URLs (duplicated from auth-config.ts for JS compatibility)
const PROVIDER_URLS = {
    chatgpt: 'https://chatgpt.com',
    claude: 'https://claude.ai',
    gemini: 'https://gemini.google.com',
    'gemini-pro': 'https://gemini.google.com',
    'gemini-exp': 'https://gemini.google.com',
    qwen: 'https://qianwen.com'
};

/**
 * Get the login URL for a provider
 * @param {string} providerId - Provider ID
 * @returns {string} The login URL or a generic fallback
 */
export function getProviderUrl(providerId) {
    return PROVIDER_URLS[providerId] || 'the provider website';
}

/**
 * Create a user-friendly error message for authentication failures
 * @param {string[]} unauthorizedProviders - List of provider IDs that failed auth
 * @param {string} context - Description of the context where the error occurred
 * @returns {string|null} Formatted error message or null if no unauthorized providers
 */
export function createAuthErrorMessage(unauthorizedProviders, context) {
    if (!unauthorizedProviders || unauthorizedProviders.length === 0) {
        return null;
    }

    const providerList = unauthorizedProviders.join(', ');
    const urlList = unauthorizedProviders
        .map(p => `  • ${p}: ${getProviderUrl(p)}`)
        .join('\n');

    return (
        `The following providers are not authenticated: ${providerList}\n\n` +
        `Please log in at:\n${urlList}\n\n` +
        `Context: ${context}`
    );
}

/**
 * Validates and adjusts provider selections before workflow execution.
 * 
 * - Filters out unauthorized batch providers
 * - Applies ephemeral fallback for locked but unauthorized synth/mapper
 * - Returns warnings for UI to display
 */
export async function runPreflight(request, authStatus, availableProviders) {
    const locks = await getProviderLocks();
    const warnings = [];

    // === Filter batch providers ===
    let providers = (request.providers || []).filter(pid => {
        if (!isProviderAuthorized(pid, authStatus)) {
            warnings.push(`Provider "${pid}" is not authorized and was removed from batch`);
            return false;
        }
        return true;
    });

    // If no providers left, pick smart defaults
    if (providers.length === 0) {
        providers = PROVIDER_PRIORITIES.batch
            .filter(pid => isProviderAuthorized(pid, authStatus) && availableProviders.includes(pid))
            .slice(0, 3);
    }

    // === Synthesizer ===
    let synthesizer = request.synthesizer || null;
    if (synthesizer && !isProviderAuthorized(synthesizer, authStatus)) {
        if (locks.synthesis) {
            // Locked but unauthorized: ephemeral fallback, don't change lock
            const fallback = selectBestProvider('synthesis', authStatus, availableProviders);
            warnings.push(`Synthesizer "${synthesizer}" is locked but unauthorized; using "${fallback}" for this request`);
            synthesizer = fallback;
        } else {
            synthesizer = selectBestProvider('synthesis', authStatus, availableProviders);
        }
    } else if (!synthesizer) {
        synthesizer = selectBestProvider('synthesis', authStatus, availableProviders);
    }

    // === Mapper ===
    let mapper = request.mapper || null;
    if (mapper && !isProviderAuthorized(mapper, authStatus)) {
        if (locks.mapping) {
            const fallback = selectBestProvider('mapping', authStatus, availableProviders);
            warnings.push(`Mapper "${mapper}" is locked but unauthorized; using "${fallback}" for this request`);
            mapper = fallback;
        } else {
            mapper = selectBestProvider('mapping', authStatus, availableProviders);
        }
    } else if (!mapper) {
        mapper = selectBestProvider('mapping', authStatus, availableProviders);
    }

    return { providers, synthesizer, mapper, warnings };
}

