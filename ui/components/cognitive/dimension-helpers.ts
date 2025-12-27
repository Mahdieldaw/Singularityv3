/**
 * dimension-helpers.ts
 * 
 * Helper functions for the dimension-first view
 */

import {
    MapperArtifact,
    EnrichedOutlier,
    DimensionCoverage
} from '../../../shared/contract';

/**
 * Get all consensus claims for a specific dimension
 */
export function getClaimsForDimension(
    artifact: MapperArtifact,
    dimension: string
): Array<MapperArtifact['consensus']['claims'][0] & { id: string }> {
    return artifact.consensus.claims
        .map((c, i) => ({ ...c, id: `consensus-${i}` }))
        .filter(c => c.dimension === dimension);
}

/**
 * Get all outliers for a specific dimension
 */
export function getOutliersForDimension(
    allOutliers: EnrichedOutlier[],
    dimension: string
): EnrichedOutlier[] {
    return allOutliers.filter(o => o.dimension === dimension);
}

/**
 * Get the display status for a dimension
 */
export function getDimensionStatus(coverage: DimensionCoverage): "gap" | "contested" | "settled" {
    return coverage.status;
}

/**
 * Format support count as "X models" or "1 model"
 */
export function formatSupportCount(count: number): string {
    return count === 1 ? "1 model" : `${count} models`;
}

/**
 * Get status icon for a dimension
 */
export function getStatusIcon(status: "gap" | "contested" | "settled"): string {
    switch (status) {
        case 'gap': return '🔶';
        case 'contested': return '⚔️';
        case 'settled': return '✅';
    }
}

/**
 * Get status color class for a dimension
 */
export function getStatusColor(status: "gap" | "contested" | "settled"): string {
    switch (status) {
        case 'gap': return 'text-amber-400 border-amber-500/30 bg-amber-500/5';
        case 'contested': return 'text-red-400 border-red-500/30 bg-red-500/5';
        case 'settled': return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5';
    }
}
