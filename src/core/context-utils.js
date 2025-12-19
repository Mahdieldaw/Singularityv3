// src/core/context-utils.js

/**
 * ContextUtils
 * 
 * Shared utilities for resolving and extracting context from session data.
 * Consolidates logic to prevent drift between ContextResolver and WorkflowEngine.
 */

/**
 * Extract batch outputs from a turn object (legacy/embedded format)
 * @param {Object} turn - The turn object
 * @returns {Object} Map of providerId -> details
 */
export function extractBatchOutputs(turn) {
    if (!turn) return {};

    // Legacy fallback: if embedded responses exist on the turn, use them
    const embedded = turn.batchResponses || turn.providerResponses || {};
    if (embedded && Object.keys(embedded).length > 0) {
        const frozen = {};
        for (const [providerId, val] of Object.entries(embedded)) {
            // Handle both array (new) and object (legacy) formats
            const r = Array.isArray(val) ? val[val.length - 1] : val;
            if (r && r.text) {
                frozen[providerId] = {
                    providerId,
                    text: r.text,
                    status: r.status || "completed",
                    meta: r.meta || {},
                    createdAt: r.createdAt || turn.createdAt,
                    updatedAt: r.updatedAt || turn.createdAt,
                };
            }
        }
        return frozen;
    }
    return {};
}

/**
 * Aggregate batch outputs per provider from raw provider response records.
 * Chooses the latest completed 'batch' response for each provider.
 * @param {Array} providerResponses - List of response objects
 * @returns {Object} Map of providerId -> response object
 */
export function aggregateBatchOutputs(providerResponses = []) {
    try {
        const frozen = {};
        const byProvider = new Map();
        for (const r of providerResponses) {
            if (!r || r.responseType !== "batch") continue;
            const pid = r.providerId;
            const existing = byProvider.get(pid);
            // Prefer the latest completed response
            const rank = (val) =>
                val?.status === "completed" ? 2 : val?.status === "streaming" ? 1 : 0;
            if (
                !existing ||
                (r.updatedAt ?? 0) > (existing.updatedAt ?? 0) ||
                rank(r) > rank(existing)
            ) {
                byProvider.set(pid, r);
            }
        }
        for (const [pid, r] of byProvider.entries()) {
            frozen[pid] = {
                providerId: pid,
                text: r.text || "",
                status: r.status || "completed",
                meta: r.meta || {},
                createdAt: r.createdAt || Date.now(),
                updatedAt: r.updatedAt || r.createdAt || Date.now(),
            };
        }
        return frozen;
    } catch (e) {
        console.warn("[ContextUtils] aggregateBatchOutputs failed:", e);
        return {};
    }
}

/**
 * Find the latest valid mapping output among provider responses for a turn.
 * @param {Array} providerResponses - List of response objects
 * @param {string} [preferredProvider] - Optional preferred provider ID
 * @returns {Object|null} The mapping output or null
 */
export function findLatestMappingOutput(providerResponses = [], preferredProvider) {
    try {
        if (!providerResponses || providerResponses.length === 0) {
            return null;
        }

        const mappingResponses = providerResponses.filter(
            (r) =>
                r &&
                r.responseType === "mapping" &&
                r.text &&
                String(r.text).trim().length > 0,
        );

        if (mappingResponses.length === 0) {
            return null;
        }

        // Sort by most recent update
        mappingResponses.sort(
            (a, b) =>
                (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0),
        );

        if (preferredProvider) {
            const preferred = mappingResponses.find(
                (r) => r.providerId === preferredProvider,
            );
            if (preferred) {
                return {
                    providerId: preferred.providerId,
                    text: preferred.text,
                    meta: preferred.meta || {},
                };
            }
        }

        const latest = mappingResponses[0];
        return {
            providerId: latest.providerId,
            text: latest.text,
            meta: latest.meta || {},
        };
    } catch (e) {
        console.warn("[ContextUtils] findLatestMappingOutput failed:", e);
        return null;
    }
}

/**
 * Find the latest valid synthesis output among provider responses for a turn.
 * @param {Array} providerResponses - List of response objects
 * @returns {Object|null} The synthesis output or null
 */
export function findLatestSynthesisOutput(providerResponses = []) {
    try {
        if (!providerResponses || providerResponses.length === 0) {
            return null;
        }

        const synthesisResponses = providerResponses.filter(
            (r) =>
                r &&
                r.responseType === "synthesis" &&
                r.text &&
                String(r.text).trim().length > 0,
        );

        if (synthesisResponses.length === 0) {
            return null;
        }

        // Sort by most recent update
        synthesisResponses.sort(
            (a, b) =>
                (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0),
        );

        const latest = synthesisResponses[0];
        return {
            providerId: latest.providerId,
            text: latest.text,
            meta: latest.meta || {},
        };
    } catch (e) {
        console.warn("[ContextUtils] findLatestSynthesisOutput failed:", e);
        return null;
    }
}

/**
 * Extract text content from a user turn object.
 * @param {Object} userTurn - The user turn object
 * @returns {string} The text content
 */
export function extractUserMessage(userTurn) {
    return userTurn?.text || userTurn?.content || "";
}
