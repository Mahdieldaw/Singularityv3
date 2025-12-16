import type { RefinerOutput } from "../../shared/parsing-utils";

// =============================================================================
// TYPE GUARDS & ACCESSORS
// =============================================================================

export interface StructuredHonestAssessment {
    reliabilitySummary: string;
    biggestRisk: string;
    recommendedNextStep: string;
}

// Back-compat accessor used in existing code
export function getStructuredAssessment(
    output: RefinerOutput | null
): StructuredHonestAssessment | null {
    if (!output?.honestAssessment) return null;
    if (typeof output.honestAssessment === 'object') {
        return output.honestAssessment as StructuredHonestAssessment;
    }
    return null;
}

/**
 * Safely access honestAssessment fields (handles string fallback)
 */
export function getHonestAssessment(refiner: RefinerOutput | null): {
    reliabilitySummary: string;
    biggestRisk: string;
    recommendedNextStep: string;
} {
    if (!refiner?.honestAssessment) {
        return { reliabilitySummary: "", biggestRisk: "", recommendedNextStep: "" };
    }
    if (typeof refiner.honestAssessment === 'string') {
        return {
            reliabilitySummary: refiner.honestAssessment,
            biggestRisk: "",
            recommendedNextStep: "",
        };
    }
    return refiner.honestAssessment as StructuredHonestAssessment;
}

/**
 * Check if verification is needed
 */
export function hasVerificationNeeded(refiner: RefinerOutput | null): boolean {
    return !!(refiner?.verificationTriggers?.required || (refiner?.verificationTriggers?.items?.length || 0) > 0);
}

/**
 * Get verification items (empty array if none)
 */
export function getVerificationItems(refiner: RefinerOutput | null) {
    return refiner?.verificationTriggers?.items ?? [];
}

/**
 * Check if any gap is foundational
 */
export function hasFoundationalGap(refiner: RefinerOutput | null): boolean {
    return !!refiner?.gaps?.some(g => g.category === 'foundational');
}

/**
 * Get gap icon based on category
 */
export function getGapIcon(category?: 'foundational' | 'tactical'): string {
    if (category === 'foundational') return '🔴';
    if (category === 'tactical') return '🟡';
    return '⚪';
}

/**
 * Get missed insights (empty array if none)
 */
export function getMissedInsights(refiner: RefinerOutput | null): Array<{ insight: string; source?: string; inMapperOptions?: boolean; }> {
    const raw = refiner?.synthesisAccuracy?.missed as any;
    if (!raw) return [];
    // Already normalized array of objects
    if (Array.isArray(raw)) {
        if (raw.length === 0) return [];
        if (typeof raw[0] === 'string') {
            return (raw as string[]).map((insight) => ({ insight, source: 'unknown', inMapperOptions: false }));
        }
        return raw as Array<{ insight: string; source?: string; inMapperOptions?: boolean; }>;
    }
    // Legacy object map: Record<providerId, string[]>
    if (typeof raw === 'object') {
        const out: Array<{ insight: string; source?: string; inMapperOptions?: boolean; }> = [];
        for (const [source, arr] of Object.entries(raw)) {
            if (Array.isArray(arr)) {
                for (const insight of arr) {
                    if (typeof insight === 'string' && insight.trim()) {
                        out.push({ insight, source, inMapperOptions: false });
                    }
                }
            }
        }
        return out;
    }
    return [];
}

/**
 * Get overclaimed items (empty array if none)
 */
export function getOverclaimed(refiner: RefinerOutput | null) {
    return refiner?.synthesisAccuracy?.overclaimed ?? [];
}

/**
 * Get preserved items (empty array if none)
 */
export function getPreserved(refiner: RefinerOutput | null) {
    return refiner?.synthesisAccuracy?.preserved ?? [];
}

// =============================================================================
// UI STATE DETERMINATION
// =============================================================================

export type UIState = 'simple' | 'intermediate' | 'workbench';

/**
 * Determine UI state based on refiner output
 */
export function determineUIState(refiner: RefinerOutput | null): UIState {
    if (!refiner) return 'intermediate';
    const { confidenceScore, presentationStrategy, gaps = [] } = refiner;
    const hasFoundational = gaps.some(g => g.category === 'foundational');
    const verificationNeeded = hasVerificationNeeded(refiner);
    if (confidenceScore < 0.6) return 'workbench';
    if (presentationStrategy === 'low_confidence') return 'workbench';
    if (presentationStrategy === 'query_problematic') return 'workbench';
    if (hasFoundational) return 'workbench';
    if (
        confidenceScore >= 0.85 &&
        !verificationNeeded &&
        gaps.length <= 1 &&
        presentationStrategy === 'definitive'
    ) {
        return 'simple';
    }
    return 'intermediate';
}

/**
 * Determine if trust icon should pulse
 */
export function shouldPulseTrustIcon(refiner: RefinerOutput | null): boolean {
    if (!refiner) return false;
    return (
        (refiner.confidenceScore ?? 0.5) < 0.7 ||
        hasFoundationalGap(refiner) ||
        hasVerificationNeeded(refiner)
    );
}

/**
 * Determine if side panel should auto-open
 */
export function shouldAutoOpenSidePanel(refiner: RefinerOutput | null): boolean {
    if (!refiner) return false;
    return (
        (refiner.confidenceScore ?? 0.5) < 0.6 ||
        hasFoundationalGap(refiner)
    );
}

// =============================================================================
// DISPLAY FORMATTERS
// =============================================================================

/**
 * Format confidence as percentage string
 */
export function formatConfidence(score: number | undefined): string {
    if (typeof score !== 'number') return '—';
    return `${Math.round(score * 100)}%`;
}

/**
 * Get confidence color class
 */
export function getConfidenceColor(score: number | undefined): string {
    if (typeof score !== 'number') return 'text-gray-500';
    if (score >= 0.85) return 'text-green-600';
    if (score >= 0.7) return 'text-yellow-600';
    if (score >= 0.5) return 'text-orange-500';
    return 'text-red-500';
}

/**
 * Get confidence bar segments (for visual display)
 */
export function getConfidenceBar(score: number | undefined, totalSegments = 12): { filled: number; empty: number } {
    if (typeof score !== 'number') return { filled: 0, empty: totalSegments };
    const filled = Math.round(score * totalSegments);
    return { filled, empty: totalSegments - filled };
}

/**
 * Format presentation strategy for display
 */
export function formatStrategy(strategy: string | undefined): string {
    if (!strategy) return '';
    const labels: Record<string, string> = {
        'definitive': 'High Confidence',
        'confident_with_caveats': 'Confident with Caveats',
        'options_forward': 'Multiple Valid Options',
        'context_dependent': 'Context Dependent',
        'low_confidence': 'Low Confidence',
        'needs_verification': 'Needs Verification',
        'query_problematic': 'Query Issues Detected',
    };
    return labels[strategy] || strategy;
}

// =============================================================================
// COUNTS & SUMMARIES
// =============================================================================

export function getGapCounts(output: RefinerOutput | null): {
    total: number;
    foundational: number;
    tactical: number;
} {
    if (!output?.gaps) {
        return { total: 0, foundational: 0, tactical: 0 };
    }
    const foundational = output.gaps.filter(g => g.category === 'foundational').length;
    const tactical = output.gaps.filter(g => g.category === 'tactical' || !g.category).length;
    return {
        total: output.gaps.length,
        foundational,
        tactical,
    };
}
