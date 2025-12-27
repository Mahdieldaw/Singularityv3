/**
 * DimensionFirstView.tsx
 * 
 * Main lossless view component for dimension-first explore
 */

import React from 'react';
import { MapperArtifact, ExploreAnalysis } from '../../../shared/contract';
import { SummaryBar } from './SummaryBar';
import { SectionHeader } from './SectionHeader';
import { DimensionCard } from './DimensionCard';
import { getClaimsForDimension, getOutliersForDimension } from './dimension-helpers';

interface DimensionFirstViewProps {
    artifact: MapperArtifact;
    analysis: ExploreAnalysis;
    onUnderstand?: () => void;
    onDecide?: () => void;
    isLoading?: boolean;
    selectedIds?: Set<string>;
    onToggle?: (id: string) => void;
}

export const DimensionFirstView: React.FC<DimensionFirstViewProps> = ({
    artifact,
    analysis,
    onUnderstand,
    onDecide,
    isLoading = false,
    selectedIds,
    onToggle
}) => {
    const { dimensionCoverage, allOutliers, summaryBar } = analysis;

    // Group dimensions by status
    const gaps = dimensionCoverage.filter(d => d.status === 'gap');
    const contested = dimensionCoverage.filter(d => d.status === 'contested');
    const settled = dimensionCoverage.filter(d => d.status === 'settled');

    return (
        <div className="w-full max-w-3xl mx-auto space-y-4 pb-12 animate-in fade-in duration-500">
            {/* Universal Summary Bar */}
            <SummaryBar data={summaryBar} />

            {/* GAPS Section - Outliers only */}
            {gaps.length > 0 && (
                <section>
                    <SectionHeader
                        icon="🔶"
                        title="Gaps"
                        count={gaps.length}
                        subtitle="Only outliers cover these"
                        variant="gap"
                    />
                    {gaps.map(coverage => (
                        <DimensionCard
                            key={coverage.dimension}
                            coverage={coverage}
                            claims={getClaimsForDimension(artifact, coverage.dimension)}
                            outliers={getOutliersForDimension(allOutliers, coverage.dimension)}
                            status="gap"
                            selectedIds={selectedIds}
                            onToggle={onToggle}
                        />
                    ))}
                </section>
            )}

            {/* CONTESTED Section - Both present */}
            {contested.length > 0 && (
                <section>
                    <SectionHeader
                        icon="⚔️"
                        title="Contested"
                        count={contested.length}
                        subtitle="Consensus vs outliers"
                        variant="contested"
                    />
                    {contested.map(coverage => (
                        <DimensionCard
                            key={coverage.dimension}
                            coverage={coverage}
                            claims={getClaimsForDimension(artifact, coverage.dimension)}
                            outliers={getOutliersForDimension(allOutliers, coverage.dimension)}
                            status="contested"
                            selectedIds={selectedIds}
                            onToggle={onToggle}
                        />
                    ))}
                </section>
            )}

            {/* SETTLED Section - Consensus only */}
            {settled.length > 0 && (
                <section>
                    <SectionHeader
                        icon="✅"
                        title="Settled"
                        count={settled.length}
                        subtitle="Consensus established"
                        variant="settled"
                    />
                    {settled.map(coverage => (
                        <DimensionCard
                            key={coverage.dimension}
                            coverage={coverage}
                            claims={getClaimsForDimension(artifact, coverage.dimension)}
                            outliers={getOutliersForDimension(allOutliers, coverage.dimension)}
                            status="settled"
                            selectedIds={selectedIds}
                            onToggle={onToggle}
                        />
                    ))}
                </section>
            )}

            {/* Tensions Section */}
            {artifact.tensions && artifact.tensions.length > 0 && (
                <section>
                    <SectionHeader
                        icon="⚠️"
                        title="Tensions"
                        count={artifact.tensions.length}
                        variant="contested"
                    />
                    <div className="space-y-2">
                        {artifact.tensions.map((tension, i) => (
                            <div key={i} className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                                <div className="text-white/70 text-sm">
                                    <span className="text-red-400">{tension.between[0]}</span>
                                    <span className="text-white/30 mx-2">vs</span>
                                    <span className="text-red-400">{tension.between[1]}</span>
                                </div>
                                <div className="text-xs text-white/40 mt-1">
                                    {tension.type} • {tension.axis}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Ghost Section */}
            {artifact.ghost && (
                <section className="mt-6">
                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">👻</span>
                            <span className="text-purple-400 font-medium">Ghost</span>
                            <span className="text-xs text-white/30">— Approach no model mentioned</span>
                        </div>
                        <p className="text-white/70 text-sm">{artifact.ghost}</p>
                    </div>
                </section>
            )}

            {/* Mode Buttons */}
            <div className="flex gap-3 mt-8 pt-4 border-t border-white/10">
                <button
                    onClick={onUnderstand}
                    disabled={isLoading}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 
                               hover:from-blue-500 hover:to-indigo-500 
                               text-white rounded-lg font-medium transition-all
                               disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    🧠 Understand
                </button>
                <button
                    onClick={onDecide}
                    disabled={isLoading}
                    className={`flex-1 px-4 py-3 text-white rounded-lg font-medium transition-all
                               disabled:opacity-50 disabled:cursor-not-allowed
                               ${analysis.escapeVelocity
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-400/30'
                            : 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500'}`}
                >
                    {analysis.escapeVelocity ? '🚀 Ready to Decide' : '⚡ Decide'}
                </button>
            </div>
        </div>
    );
};
