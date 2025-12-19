/**
 * Refiner Helper Utilities - Updated for signal-based RefinerOutput
 */

import type { RefinerOutput, Signal, SignalPriority } from "../../shared/parsing-utils";
import { categorizeSignals, getSignalCounts, hasCriticalSignals } from "./signalUtils";

// =============================================================================
// TYPE GUARDS & ACCESSORS
// =============================================================================

/**
 * Check if refiner has any signals requiring attention
 */
export function hasVerificationNeeded(refiner: RefinerOutput | null): boolean {
    if (!refiner?.signals) return false;
    return refiner.signals.some(s => s.priority === 'blocker' || s.type === 'divergence');
}

/**
 * Get signals that need verification (blockers and risks)
 */
export function getVerificationItems(refiner: RefinerOutput | null): Signal[] {
    if (!refiner?.signals) return [];
    return refiner.signals.filter(s => s.priority === 'blocker' || s.priority === 'risk');
}

/**
 * Check if any signal is a blocker
 */
export function hasBlockerSignal(refiner: RefinerOutput | null): boolean {
    return refiner?.signals?.some(s => s.priority === 'blocker') ?? false;
}

/**
 * Get signals by type
 */
export function getSignalsByType(refiner: RefinerOutput | null, type: Signal['type']): Signal[] {
    if (!refiner?.signals) return [];
    return refiner.signals.filter(s => s.type === type);
}

/**
 * Get gap-type signals (including blindspots)
 */
export function getGapSignals(refiner: RefinerOutput | null): Signal[] {
    if (!refiner?.signals) return [];
    return refiner.signals.filter(s => s.type === 'gap' || s.type === 'blindspot');
}

/**
 * Get overclaim signals
 */
export function getOverclaimSignals(refiner: RefinerOutput | null): Signal[] {
    if (!refiner?.signals) return [];
    return refiner.signals.filter(s => s.type === 'overclaim');
}

/**
 * Get divergence signals (model disagreements)
 */
export function getDivergenceSignals(refiner: RefinerOutput | null): Signal[] {
    if (!refiner?.signals) return [];
    return refiner.signals.filter(s => s.type === 'divergence');
}

// =============================================================================
// DEPRECATED - Maintained for backward compat during transition
// =============================================================================

/**
 * @deprecated Use getSignalCounts from signalUtils instead
 */
export function getGapCounts(output: RefinerOutput | null): {
    total: number;
    foundational: number;
    tactical: number;
} {
    const gaps = getGapSignals(output);
    const blockers = gaps.filter(g => g.priority === 'blocker').length;
    return {
        total: gaps.length,
        foundational: blockers,
        tactical: gaps.length - blockers,
    };
}

/**
 * @deprecated These fields no longer exist in new structure
 */
export function getHonestAssessment(refiner: RefinerOutput | null): {
    reliabilitySummary: string;
    biggestRisk: string;
    recommendedNextStep: string;
} {
    if (!refiner) {
        return { reliabilitySummary: "", biggestRisk: "", recommendedNextStep: "" };
    }

    // Derive from nextStep and signals
    const blockers = refiner.signals?.filter(s => s.priority === 'blocker') ?? [];
    const risks = refiner.signals?.filter(s => s.priority === 'risk') ?? [];

    return {
        reliabilitySummary: blockers.length > 0
            ? `${blockers.length} blocker signal${blockers.length > 1 ? 's' : ''} detected`
            : risks.length > 0
                ? `${risks.length} risk signal${risks.length > 1 ? 's' : ''} worth reviewing`
                : 'Output appears reliable',
        biggestRisk: blockers[0]?.content || risks[0]?.content || '',
        recommendedNextStep: refiner.nextStep?.target || '',
    };
}

/**
 * @deprecated These fields no longer exist in new structure
 */
export function getMissedInsights(refiner: RefinerOutput | null): Array<{ insight: string; source?: string; inMapperOptions?: boolean; }> {
    const blindspots = getSignalsByType(refiner, 'blindspot');
    return blindspots.map(s => ({
        insight: s.content,
        source: s.source,
        inMapperOptions: false
    }));
}

/**
 * @deprecated These fields no longer exist in new structure
 */
export function getOverclaimed(refiner: RefinerOutput | null): string[] {
    return getOverclaimSignals(refiner).map(s => s.content);
}

/**
 * @deprecated These fields no longer exist in new structure
 */
export function getPreserved(refiner: RefinerOutput | null): string[] {
    // No direct equivalent in new structure
    return [];
}

/**
 * @deprecated Use getGapIcon from signalUtils instead
 */
export function getGapIcon(category?: 'foundational' | 'tactical'): string {
    if (category === 'foundational') return '🔴';
    if (category === 'tactical') return '🟡';
    return '⚪';
}

/**
 * @deprecated Use hasFoundationalGap(refiner) || hasBlockerSignal(refiner)
 */
export function hasFoundationalGap(refiner: RefinerOutput | null): boolean {
    return hasBlockerSignal(refiner);
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

    const counts = getSignalCounts(refiner.signals);

    // Workbench: blockers or multiple risks
    if (counts.blockers > 0) return 'workbench';
    if (counts.risks > 2) return 'workbench';
    if (refiner.reframe) return 'workbench';

    // Simple: no risks or enhancements, just proceed
    if (counts.risks === 0 && counts.enhancements <= 1 &&
        refiner.nextStep?.action === 'proceed') {
        return 'simple';
    }

    return 'intermediate';
}

/**
 * Determine if trust icon should pulse
 */
export function shouldPulseTrustIcon(refiner: RefinerOutput | null): boolean {
    return hasCriticalSignals(refiner?.signals);
}

/**
 * Determine if side panel should auto-open
 */
export function shouldAutoOpenSidePanel(refiner: RefinerOutput | null): boolean {
    if (!refiner) return false;
    return hasBlockerSignal(refiner);
}

// =============================================================================
// DISPLAY FORMATTERS - Updated for new structure
// =============================================================================

/**
 * Format signal count summary
 */
export function formatSignalSummary(refiner: RefinerOutput | null): string {
    if (!refiner?.signals?.length) return 'No signals';

    const counts = getSignalCounts(refiner.signals);
    const parts: string[] = [];

    if (counts.blockers > 0) parts.push(`${counts.blockers} blocker${counts.blockers > 1 ? 's' : ''}`);
    if (counts.risks > 0) parts.push(`${counts.risks} risk${counts.risks > 1 ? 's' : ''}`);
    if (counts.enhancements > 0) parts.push(`${counts.enhancements} enhancement${counts.enhancements > 1 ? 's' : ''}`);

    return parts.join(', ') || 'No signals';
}

/**
 * Get priority-based color class
 */
export function getPriorityColor(priority: SignalPriority | undefined): string {
    switch (priority) {
        case 'blocker': return 'text-intent-danger';
        case 'risk': return 'text-intent-warning';
        case 'enhancement': return 'text-brand-400';
        default: return 'text-text-muted';
    }
}

// =============================================================================
// DEPRECATED CONFIDENCE FORMATTERS - No longer applicable
// =============================================================================

/**
 * @deprecated Confidence score no longer exists in new structure
 */
export function formatConfidence(score: number | undefined): string {
    if (typeof score !== 'number') return '—';
    return `${Math.round(score * 100)}%`;
}

/**
 * @deprecated Confidence score no longer exists in new structure
 */
export function getConfidenceColor(score: number | undefined): string {
    if (typeof score !== 'number') return 'text-gray-500';
    if (score >= 0.85) return 'text-green-600';
    if (score >= 0.7) return 'text-yellow-600';
    if (score >= 0.5) return 'text-orange-500';
    return 'text-red-500';
}

/**
 * @deprecated Confidence score no longer exists in new structure
 */
export function getConfidenceBar(score: number | undefined, totalSegments = 12): { filled: number; empty: number } {
    if (typeof score !== 'number') return { filled: 0, empty: totalSegments };
    const filled = Math.round(score * totalSegments);
    return { filled, empty: totalSegments - filled };
}

/**
 * @deprecated Presentation strategy no longer exists in new structure
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

/**
 * @deprecated
 */
export function getStructuredAssessment(output: RefinerOutput | null): {
    reliabilitySummary: string;
    biggestRisk: string;
    recommendedNextStep: string;
} | null {
    return getHonestAssessment(output);
}
