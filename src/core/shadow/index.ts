import { INCLUSION_PATTERNS } from './StatementTypes';
import { EXCLUSION_RULES } from './ExclusionRules';

let _initialized = false;

/**
 * Pattern definitions are immutable at runtime.
 * Called automatically on module import, but safe to call again.
 */
export function initializeShadowMapper(): void {
    if (_initialized) return;

    Object.freeze(INCLUSION_PATTERNS);
    for (const pattern of INCLUSION_PATTERNS) {
        Object.freeze(pattern);
        Object.freeze(pattern.patterns);
    }
    Object.freeze(EXCLUSION_RULES);
    for (const rule of EXCLUSION_RULES) {
        Object.freeze(rule);
    }

    _initialized = true;
    console.log('[Shadow] Pattern definitions locked. Guardrail 1 active.');
}

// Auto-initialize on import
initializeShadowMapper();

export * from './StatementTypes';
export * from './ExclusionRules';
export * from './ShadowExtractor';
export * from './ShadowDelta';
