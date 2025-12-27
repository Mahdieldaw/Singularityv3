/**
 * DimensionCard.tsx
 * 
 * Card component for displaying a single dimension with its claims/outliers
 */

import React from 'react';
import { DimensionCoverage, EnrichedOutlier, MapperArtifact } from '../../../shared/contract';
import { getStatusIcon, getStatusColor, formatSupportCount } from './dimension-helpers';

interface DimensionCardProps {
    coverage: DimensionCoverage;
    claims: MapperArtifact['consensus']['claims'];
    outliers: EnrichedOutlier[];
    status: "gap" | "contested" | "settled";
}

export const DimensionCard: React.FC<DimensionCardProps> = ({
    coverage,
    claims,
    outliers,
    status
}) => {
    const statusColor = getStatusColor(status);
    const statusIcon = getStatusIcon(status);

    return (
        <div className={`border rounded-lg p-4 mb-3 ${statusColor}`}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{statusIcon}</span>
                <h3 className="font-medium text-white capitalize">{coverage.dimension}</h3>
                {coverage.support_bar && (
                    <span className="text-xs text-white/40 ml-auto">
                        {formatSupportCount(coverage.support_bar)}
                    </span>
                )}
            </div>

            {/* Leader statement */}
            {coverage.leader && (
                <div className="mb-3 text-white/80 text-sm">
                    <span className="text-white/50">Lead: </span>
                    {coverage.leader}
                    {coverage.leader_source && (
                        <span className="text-white/30 text-xs ml-2">
                            — {coverage.leader_source}
                        </span>
                    )}
                </div>
            )}

            {/* GAP: Show "Consensus says nothing" + outliers */}
            {status === 'gap' && (
                <>
                    <div className="text-amber-500/70 text-sm mb-2 italic">
                        Consensus says: nothing. Only outliers cover this dimension.
                    </div>
                    <div className="space-y-2">
                        {outliers.map((o, i) => (
                            <OutlierChip key={i} outlier={o} />
                        ))}
                    </div>
                </>
            )}

            {/* CONTESTED: Show both claims and outliers */}
            {status === 'contested' && (
                <div className="space-y-3">
                    {/* Consensus claims */}
                    {claims.length > 0 && (
                        <div>
                            <div className="text-xs text-white/40 mb-1">Consensus</div>
                            <div className="space-y-1">
                                {claims.map((c, i) => (
                                    <ClaimChip key={i} claim={c} />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Outliers */}
                    {outliers.length > 0 && (
                        <div>
                            <div className="text-xs text-white/40 mb-1">Challengers</div>
                            <div className="space-y-1">
                                {outliers.map((o, i) => (
                                    <OutlierChip key={i} outlier={o} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* SETTLED: Just show claims */}
            {status === 'settled' && claims.length > 0 && (
                <div className="space-y-1">
                    {claims.map((c, i) => (
                        <ClaimChip key={i} claim={c} />
                    ))}
                    <div className="text-emerald-500/50 text-xs mt-2 italic">
                        No outliers challenge this dimension.
                    </div>
                </div>
            )}
        </div>
    );
};

// Claim chip component
interface ClaimChipProps {
    claim: MapperArtifact['consensus']['claims'][0];
}

const ClaimChip: React.FC<ClaimChipProps> = ({ claim }) => (
    <div className="bg-white/5 rounded px-2 py-1.5 text-sm text-white/70">
        {claim.text}
        <span className="text-white/30 text-xs ml-2">
            [{claim.support_count}]
        </span>
        {claim.applies_when && (
            <span className="text-blue-400/60 text-xs ml-2">
                When: {claim.applies_when}
            </span>
        )}
    </div>
);

// Outlier chip component
interface OutlierChipProps {
    outlier: EnrichedOutlier;
}

const OutlierChip: React.FC<OutlierChipProps> = ({ outlier }) => (
    <div className={`
        bg-white/5 rounded px-2 py-1.5 text-sm
        ${outlier.type === 'frame_challenger' ? 'border-l-2 border-amber-500' : ''}
    `}>
        <span className={outlier.type === 'frame_challenger' ? 'text-amber-300' : 'text-white/70'}>
            {outlier.insight}
        </span>
        <span className="text-white/30 text-xs ml-2">
            — {outlier.source}
        </span>
        {outlier.is_recommended && (
            <span className="text-amber-400 text-xs ml-2">⭐</span>
        )}
        {outlier.applies_when && (
            <div className="text-blue-400/60 text-xs mt-1">
                When: {outlier.applies_when}
            </div>
        )}
        {outlier.challenges && (
            <div className="text-red-400/60 text-xs mt-1">
                Challenges: {outlier.challenges}
            </div>
        )}
    </div>
);
