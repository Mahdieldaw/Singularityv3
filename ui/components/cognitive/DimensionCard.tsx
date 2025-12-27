/**
 * DimensionCard.tsx
 * 
 * Card component for displaying a single dimension with its claims/outliers
 */

import React from 'react';
import { DimensionCoverage } from '../../../shared/contract';
import { getStatusIcon } from './dimension-helpers';

interface DimensionCardProps {
    coverage: DimensionCoverage;
}

export const DimensionCard: React.FC<DimensionCardProps> = ({
    coverage,
}) => {
    const statusIcon = getStatusIcon(coverage.status);
    const dimensionLabel = coverage.dimension.replace(/[_-]+/g, ' ');
    const countsLabel = `${coverage.consensus_claims} consensus, ${coverage.outlier_claims} outliers`;
    const statusLabel =
        coverage.status === 'gap' ? 'gap' : coverage.status === 'contested' ? 'contested' : 'settled';
    const statusTone =
        coverage.status === 'gap'
            ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
            : coverage.status === 'contested'
                ? 'text-intent-warning bg-intent-warning/10 border-intent-warning/20'
                : 'text-intent-success bg-intent-success/10 border-intent-success/20';

    const leaderText = coverage.leader ? coverage.leader.trim() : '';
    const leaderExcerpt = leaderText.length > 80 ? `${leaderText.slice(0, 79)}…` : leaderText;

    return (
        <div className="bg-surface-base border border-border-subtle rounded-lg p-3">
            <div className="flex items-center gap-2">
                <span className="text-base">{statusIcon}</span>
                <div className="text-sm font-medium text-text-primary capitalize">{dimensionLabel}</div>
                <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full border ${statusTone}`}>
                    {statusLabel}
                </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className="text-[10px] text-text-muted font-mono px-1.5 py-0.5 rounded bg-surface-highlight border border-border-subtle">
                    {countsLabel}
                </span>
                {coverage.support_bar != null && (
                    <span className="text-[10px] text-text-muted font-mono px-1.5 py-0.5 rounded bg-surface-highlight border border-border-subtle">
                        {coverage.support_bar} support
                    </span>
                )}
            </div>

            {leaderExcerpt && (
                <div className="mt-2 text-xs text-text-secondary leading-relaxed">
                    {leaderExcerpt}
                </div>
            )}
        </div>
    );
};
