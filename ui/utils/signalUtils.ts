/**
 * Signal utilities for categorizing and working with Refiner signals.
 */

import { Signal, SignalPriority, RefinerOutput } from '../../shared/parsing-utils';

export interface CategorizedSignals {
    blockerSignals: Signal[];
    riskSignals: Signal[];
    enhancementSignals: Signal[];
}

/**
 * Categorize signals by priority level.
 */
export function categorizeSignals(signals: Signal[] | undefined): CategorizedSignals {
    if (!signals || !Array.isArray(signals)) {
        return {
            blockerSignals: [],
            riskSignals: [],
            enhancementSignals: []
        };
    }

    return {
        blockerSignals: signals.filter(s => s.priority === 'blocker'),
        riskSignals: signals.filter(s => s.priority === 'risk'),
        enhancementSignals: signals.filter(s => s.priority === 'enhancement')
    };
}

/**
 * Get the icon for a signal type.
 */
export function getSignalIcon(type: Signal['type']): string {
    switch (type) {
        case 'divergence': return '⚠️';
        case 'overclaim': return '⚠️';
        case 'gap': return '💡';
        case 'blindspot': return '🕳️';
        default: return '📌';
    }
}

/**
 * Get the label for a signal type.
 */
export function getSignalLabel(type: Signal['type']): string {
    switch (type) {
        case 'divergence': return 'AI models disagreed';
        case 'overclaim': return 'May be overstated';
        case 'gap': return 'Context dropped';
        case 'blindspot': return 'Not addressed';
        default: return 'Signal';
    }
}

/**
 * Get CSS classes for signal priority styling.
 */
export function getSignalPriorityClasses(priority: SignalPriority): {
    background: string;
    border: string;
    text: string;
} {
    switch (priority) {
        case 'blocker':
            return {
                background: 'bg-intent-danger/10',
                border: 'border-intent-danger/40',
                text: 'text-intent-danger'
            };
        case 'risk':
            return {
                background: 'bg-intent-warning/10',
                border: 'border-intent-warning/40',
                text: 'text-intent-warning'
            };
        case 'enhancement':
        default:
            return {
                background: 'bg-brand-500/10',
                border: 'border-brand-500/30',
                text: 'text-brand-400'
            };
    }
}

/**
 * Check if there are any critical signals (blockers or risks).
 */
export function hasCriticalSignals(signals: Signal[] | undefined): boolean {
    if (!signals) return false;
    return signals.some(s => s.priority === 'blocker' || s.priority === 'risk');
}

/**
 * Get a summary count of signals by priority.
 */
export function getSignalCounts(signals: Signal[] | undefined): { blockers: number; risks: number; enhancements: number } {
    const { blockerSignals, riskSignals, enhancementSignals } = categorizeSignals(signals);
    return {
        blockers: blockerSignals.length,
        risks: riskSignals.length,
        enhancements: enhancementSignals.length
    };
}
