/**
 * DimensionFirstView.tsx
 * 
 * Main lossless view component for dimension-first explore
 */

import React from 'react';
import { MapperArtifact, ExploreAnalysis } from '../../../shared/contract';
import { SectionHeader } from './SectionHeader';
import { DimensionCard } from './DimensionCard';

interface DimensionFirstViewProps {
    artifact: MapperArtifact;
    analysis: ExploreAnalysis;
}

export const DimensionFirstView: React.FC<DimensionFirstViewProps> = ({
    artifact,
    analysis,
}) => {
    const { dimensionCoverage } = analysis;

    const gaps = dimensionCoverage.filter((d) => d.status === "gap");
    const contested = dimensionCoverage.filter((d) => d.status === "contested");
    const settled = dimensionCoverage.filter((d) => d.status === "settled");

    return (
        <div className="w-full space-y-4">
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
                        />
                    ))}
                </section>
            )}

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
                        />
                    ))}
                </section>
            )}

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
                        />
                    ))}
                </section>
            )}
        </div>
    );
};
