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
    claims: Array<MapperArtifact['consensus']['claims'][0] & { id: string }>;
    outliers: EnrichedOutlier[];
    status: "gap" | "contested" | "settled";
    selectedIds?: Set<string>;
    onToggle?: (id: string) => void;
}

export const DimensionCard: React.FC<DimensionCardProps> = ({
    coverage,
    claims,
    outliers,
    status,
    selectedIds = new Set(),
    onToggle = () => { }
}) => {
    const statusColor = getStatusColor(status);
    const statusIcon = getStatusIcon(status);

    return (
        <div className={`border rounded-lg p-4 mb-3 transition-colors ${statusColor}`}>
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{statusIcon}</span>
                <h3 className="font-medium text-white capitalize">{coverage.dimension}</h3>
                {coverage.support_bar && (
                    <span className="text-xs text-white/40 ml-auto bg-black/20 px-2 py-0.5 rounded-full">
                        {formatSupportCount(coverage.support_bar)} support
                    </span>
                )}
            </div>

            {/* Leader statement */}
            {coverage.leader && (
                <div className="mb-3 text-white/80 text-sm pl-8">
                    <span className="text-white/40 uppercase text-xs font-bold tracking-wider mr-2">Lead</span>
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
                <div className="pl-0">
                    <div className="text-amber-500/70 text-sm mb-3 ml-8 italic flex items-center gap-2">
                        <span>Consensus says nothing here.</span>
                    </div>
                    <div className="space-y-2">
                        {outliers.map((o) => (
                            <OutlierChip
                                key={o.id}
                                outlier={o}
                                isSelected={selectedIds.has(o.id)}
                                onToggle={() => onToggle(o.id)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* CONTESTED: Show both claims and outliers */}
            {status === 'contested' && (
                <div className="space-y-3">
                    {/* Consensus claims */}
                    {claims.length > 0 && (
                        <div className="space-y-2">
                            {claims.map((c) => (
                                <ClaimChip
                                    key={c.id}
                                    claim={c}
                                    isSelected={selectedIds.has(c.id)}
                                    onToggle={() => onToggle(c.id)}
                                />
                            ))}
                        </div>
                    )}

                    {/* Outliers */}
                    {outliers.length > 0 && (
                        <div className="pl-4 mt-2 border-l-2 border-white/5 space-y-2">
                            <div className="text-[10px] uppercase tracking-wider text-white/30 font-bold mb-1 pl-1">
                                Challengers
                            </div>
                            {outliers.map((o) => (
                                <OutlierChip
                                    key={o.id}
                                    outlier={o}
                                    isSelected={selectedIds.has(o.id)}
                                    onToggle={() => onToggle(o.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* SETTLED: Just show claims */}
            {status === 'settled' && claims.length > 0 && (
                <div className="space-y-2">
                    {claims.map((c) => (
                        <ClaimChip
                            key={c.id}
                            claim={c}
                            isSelected={selectedIds.has(c.id)}
                            onToggle={() => onToggle(c.id)}
                        />
                    ))}
                    <div className="text-emerald-500/50 text-xs mt-2 ml-8 italic">
                        No outliers challenge this dimension.
                    </div>
                </div>
            )}
        </div>
    );
};

// Checkbox Component
const Checkbox: React.FC<{ checked: boolean }> = ({ checked }) => (
    <div className={`
        flex-shrink-0 w-4 h-4 rounded border transition-colors flex items-center justify-center mt-0.5
        ${checked
            ? "bg-blue-500 border-blue-500"
            : "border-white/20 bg-white/5 group-hover:border-white/40"
        }
    `}>
        {checked && (
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
        )}
    </div>
);

// Claim chip component
interface ClaimChipProps {
    claim: MapperArtifact['consensus']['claims'][0];
    isSelected: boolean;
    onToggle: () => void;
}

const ClaimChip: React.FC<ClaimChipProps> = ({ claim, isSelected, onToggle }) => (
    <div
        onClick={onToggle}
        className={`
            group flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200
            ${isSelected
                ? 'bg-primary-500/10 border-primary-500/40 shadow-sm'
                : 'bg-surface-base border-border-subtle hover:border-border-strong hover:bg-surface-highlight'
            }
        `}
    >
        <Checkbox checked={isSelected} />
        <div className="flex-1">
            <p className={`text-sm leading-relaxed ${isSelected ? 'text-text-primary' : 'text-text-secondary'}`}>
                {claim.text}
            </p>
            <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-text-muted font-mono px-1.5 py-0.5 rounded bg-surface-highlight border border-border-subtle">
                    {claim.support_count} refs
                </span>
                {claim.applies_when && (
                    <span className="text-[10px] text-intent-info bg-intent-info/10 px-1.5 py-0.5 rounded border border-intent-info/20">
                        When: {claim.applies_when}
                    </span>
                )}
            </div>
        </div>
    </div>
);

// Outlier chip component
interface OutlierChipProps {
    outlier: EnrichedOutlier;
    isSelected: boolean;
    onToggle: () => void;
}

const OutlierChip: React.FC<OutlierChipProps> = ({ outlier, isSelected, onToggle }) => {
    const isChallenger = outlier.type === 'frame_challenger';

    return (
        <div
            onClick={onToggle}
            className={`
                group relative flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200
                ${isSelected
                    ? "bg-primary-500/10 border-primary-500/40 shadow-sm"
                    : isChallenger
                        ? "bg-intent-warning/5 border-intent-warning/20 hover:bg-intent-warning/10"
                        : "bg-surface-base border-border-subtle hover:border-border-strong hover:bg-surface-highlight"
                }
            `}
        >
            <Checkbox checked={isSelected} />
            <div className="flex-1">
                {/* Header Badge Row */}
                <div className="flex justify-between items-start gap-2 mb-1.5">
                    <div className={`
                        text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-1 uppercase tracking-wide
                        ${isChallenger
                            ? "bg-intent-warning/20 text-intent-warning"
                            : "bg-surface-highlight text-text-secondary"
                        }
                    `}>
                        {isChallenger ? "⚡ Frame Challenger" : "💡 Insight"}
                    </div>
                    <span className="text-[10px] text-text-muted font-mono px-1.5 py-0.5 rounded bg-surface-base border border-border-subtle">
                        {outlier.source}
                    </span>
                </div>

                {/* Content */}
                <p className={`text-sm font-medium leading-relaxed mb-1 ${isChallenger ? 'text-intent-warning' : 'text-text-primary'}`}>
                    {outlier.insight}
                </p>

                {outlier.raw_context && isSelected && (
                    <p className="text-xs text-text-muted mt-2 pl-2 border-l-2 border-border-subtle italic">
                        "{outlier.raw_context}"
                    </p>
                )}

                {/* Footer Meta Row */}
                <div className="flex flex-wrap gap-2 mt-2">
                    {outlier.is_recommended && (
                        <span className="text-intent-warning text-[10px] font-medium flex items-center gap-1 bg-intent-warning/10 px-1.5 py-0.5 rounded">
                            ⭐ Top Signal
                        </span>
                    )}
                    {outlier.applies_when && (
                        <div className="text-[10px] text-intent-info bg-intent-info/10 px-1.5 py-0.5 rounded border border-intent-info/20">
                            When: {outlier.applies_when}
                        </div>
                    )}
                    {outlier.challenges && (
                        <div className="text-[10px] text-intent-danger bg-intent-danger/10 px-1.5 py-0.5 rounded border border-intent-danger/20">
                            Challenges: {outlier.challenges}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
