/**
 * Refiner Helper Utilities - Updated for signal-based RefinerOutput
 */

import type { RefinerOutput, Signal, SignalPriority, NextStepAction } from "../../shared/parsing-utils";
import { getSignalCounts, hasCriticalSignals } from "./signalUtils";

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
// NEXT STEP VISUAL STYLES
// =============================================================================

interface NextStepStyles {
    container: string;
    icon: string;
    label: string;
}

export function getNextStepStyles(action: NextStepAction | null | undefined): NextStepStyles {
	switch (action) {
		case 'proceed':
			return {
				container: 'bg-emerald-500/10 border-emerald-500/60',
				icon: 'text-emerald-400',
				label: 'text-emerald-300',
			};
		case 'verify':
			return {
				container: 'bg-intent-warning/15 border-intent-warning/40',
				icon: 'text-intent-warning',
				label: 'text-intent-warning',
			};
		case 'reframe':
			return {
				container: 'bg-sky-500/10 border-sky-500/50',
				icon: 'text-sky-400',
				label: 'text-sky-300',
			};
		case 'research':
			return {
				container: 'bg-violet-500/15 border-violet-500/40',
				icon: 'text-violet-400',
				label: 'text-violet-300',
			};
		default:
			return {
				container: 'bg-surface-highlight/40 border-border-subtle',
				icon: 'text-brand-400',
				label: 'text-text-primary',
			};
	}
}

