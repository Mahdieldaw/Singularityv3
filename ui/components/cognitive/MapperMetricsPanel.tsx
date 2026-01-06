import React from 'react';
import { StructuralAnalysis, ProblemStructure } from '../../../shared/contract';

interface MapperMetricsPanelProps {
    structuralAnalysis: StructuralAnalysis;
    problemStructure?: ProblemStructure;
    claimCount: number;
    ghostCount: number;
}

/**
 * Compact metrics panel showing key computational insights from the mapper.
 * Displays during the interim/streaming phase before singularity response is ready.
 */
export const MapperMetricsPanel: React.FC<MapperMetricsPanelProps> = ({
    structuralAnalysis,
    problemStructure,
    claimCount,
    ghostCount,
}) => {
    const { ratios, graph: graphAnalysis, claimsWithLeverage } = structuralAnalysis;

    // Compute key insights
    const leverageInversionCount = claimsWithLeverage?.filter(c => c.isLeverageInversion).length || 0;
    const evidenceGapCount = claimsWithLeverage?.filter(c => c.isEvidenceGap).length || 0;
    const conflictCount = claimsWithLeverage?.filter(c => c.isContested).length || 0;
    const hasSignificantFindings = leverageInversionCount > 0 || evidenceGapCount > 0 || conflictCount > 0;

    return (
        <div className="bg-surface-raised border border-border-subtle rounded-xl overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border-subtle bg-gradient-to-r from-brand-500/5 to-transparent">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">📊</span>
                        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                            Structural Analysis
                        </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-text-muted">
                        <span>{claimCount} claims</span>
                        {ghostCount > 0 && (
                            <span className="flex items-center gap-1">
                                <span>👻</span>
                                {ghostCount} gaps
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="p-4 space-y-4">
                {/* Problem Structure Badge */}
                {problemStructure && (
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/30">
                            <span className="text-[10px] uppercase tracking-wide text-text-muted">
                                Pattern
                            </span>
                            <span className="font-semibold text-brand-400 capitalize">
                                {problemStructure.primaryPattern}
                            </span>
                            {problemStructure.confidence < 0.7 && (
                                <span className="text-amber-400 text-xs" title="Low confidence">?</span>
                            )}
                        </div>
                        <span className="text-xs text-text-muted">
                            {Math.round((problemStructure.confidence ?? 0) * 100)}% confidence
                        </span>
                    </div>
                )}

                {/* Key Findings Chips */}
                {hasSignificantFindings && (
                    <div className="flex flex-wrap gap-2">
                        {conflictCount > 0 && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30">
                                <span className="text-xs">⚠️</span>
                                <span className="text-xs font-medium text-red-400">
                                    {conflictCount} {conflictCount === 1 ? 'Conflict' : 'Conflicts'}
                                </span>
                            </div>
                        )}
                        {leverageInversionCount > 0 && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30">
                                <span className="text-xs">💎</span>
                                <span className="text-xs font-medium text-purple-400">
                                    {leverageInversionCount} High-Leverage
                                </span>
                            </div>
                        )}
                        {evidenceGapCount > 0 && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                                <span className="text-xs">🎯</span>
                                <span className="text-xs font-medium text-amber-400">
                                    {evidenceGapCount} Evidence {evidenceGapCount === 1 ? 'Gap' : 'Gaps'}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Core Ratios Grid */}
                {ratios && (
                    <div className="grid grid-cols-5 gap-2">
                        <RatioCell
                            label="Concentration"
                            value={ratios.concentration}
                            tooltip="Max support / modelCount. How much agreement exists."
                        />
                        <RatioCell
                            label="Alignment"
                            value={ratios.alignment}
                            tooltip="Reinforcing edges / total edges. Do top claims support each other?"
                        />
                        <RatioCell
                            label="Tension"
                            value={ratios.tension}
                            tooltip="(Conflicts + tradeoffs) / total edges. How much disagreement exists."
                            isNegative
                        />
                        <RatioCell
                            label="Fragmentation"
                            value={ratios.fragmentation}
                            tooltip="(Components - 1) / (claims - 1). How disconnected is the graph."
                            isNegative
                        />
                        <RatioCell
                            label="Depth"
                            value={ratios.depth}
                            tooltip="Longest chain / claim count. How sequential is reasoning."
                        />
                    </div>
                )}

                {/* Hub Dominance */}
                {graphAnalysis && graphAnalysis.hubDominance > 1.5 && (
                    <div className="text-[11px] text-text-muted flex items-center gap-2 pt-2 border-t border-border-subtle/50">
                        <span>🏛️</span>
                        <span>Hub dominance: {graphAnalysis.hubDominance.toFixed(1)}x — central ideas carry significant weight</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// Helper component for ratio cells
const RatioCell: React.FC<{
    label: string;
    value: number;
    tooltip: string;
    isNegative?: boolean;
}> = ({ label, value, tooltip, isNegative }) => {
    const percentage = Math.round(value * 100);
    const colorClass = isNegative
        ? (percentage > 50 ? 'text-red-400' : percentage > 25 ? 'text-amber-400' : 'text-emerald-400')
        : (percentage > 70 ? 'text-emerald-400' : percentage > 40 ? 'text-amber-400' : 'text-text-muted');

    return (
        <div
            className="bg-surface-highlight/30 border border-border-subtle/50 rounded-lg p-2 text-center cursor-help"
            title={tooltip}
        >
            <div className="text-[10px] text-text-muted uppercase tracking-wide mb-0.5">
                {label}
            </div>
            <div className={`text-sm font-semibold ${colorClass}`}>
                {percentage}%
            </div>
        </div>
    );
};
