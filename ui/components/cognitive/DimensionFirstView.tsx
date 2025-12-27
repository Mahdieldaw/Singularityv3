/**
 * DimensionFirstView.tsx
 * 
 * Main lossless view component for dimension-first explore
 */

import React, { useMemo } from 'react';
import { useAtom } from 'jotai';
import { MapperArtifact, ExploreAnalysis } from '../../../shared/contract';
import { SectionHeader } from './SectionHeader';
import { DimensionCard } from './DimensionCard';
import { artifactEditsAtom } from '../../state/artifact-edits';

interface DimensionFirstViewProps {
    artifact: MapperArtifact;
    analysis: ExploreAnalysis;
}

export const DimensionFirstView: React.FC<DimensionFirstViewProps> = ({
    artifact,
    analysis,
}) => {
    const { dimensionCoverage } = analysis;
    const [allEdits, setAllEdits] = useAtom(artifactEditsAtom);

    // Get edits for current turn or create generic key
    const currentTurnId = artifact.turn.toString();
    const edits = allEdits.get(currentTurnId);

    const gaps = dimensionCoverage.filter((d) => d.status === "gap");
    const contested = dimensionCoverage.filter((d) => d.status === "contested");
    const settled = dimensionCoverage.filter((d) => d.status === "settled");

    // Helper to update edits
    const updateEdits = (fn: (e: any) => void) => {
        setAllEdits((draft) => {
            let turnEdits = draft.get(currentTurnId);
            if (!turnEdits) {
                turnEdits = {
                    turnId: currentTurnId,
                    timestamp: Date.now(),
                    consensusEdits: [],
                    outlierEdits: [],
                    tensionEdits: [],
                    ghostEdit: null,
                    deletedClaimIndices: [],
                    deletedOutlierIndices: [],
                    deletedTensionIndices: [],
                    userNotes: []
                };
                draft.set(currentTurnId, turnEdits);
            }
            fn(turnEdits);
        });
    };

    const handlers = useMemo(() => ({
        onConsensusEdit: (index: number, edit: { text: string }) => {
            updateEdits(draft => {
                const existing = draft.consensusEdits.find((e: any) => e.index === index);
                if (existing) {
                    existing.edited = { ...existing.edited, ...edit };
                } else {
                    draft.consensusEdits.push({ index, original: artifact.consensus.claims[index], edited: edit });
                }
            });
        },
        onOutlierEdit: (index: number, edit: { insight: string; type: "supplemental" | "frame_challenger" }) => {
            updateEdits(draft => {
                const existing = draft.outlierEdits.find((e: any) => e.index === index);
                if (existing) {
                    existing.edited = { ...existing.edited, ...edit };
                } else {
                    draft.outlierEdits.push({ index, original: artifact.outliers[index], edited: edit });
                }
            });
        },
        onConsensusDelete: (index: number) => {
            updateEdits(draft => {
                if (!draft.deletedClaimIndices.includes(index)) {
                    draft.deletedClaimIndices.push(index);
                }
            });
        },
        onOutlierDelete: (index: number) => {
            updateEdits(draft => {
                if (!draft.deletedOutlierIndices.includes(index)) {
                    draft.deletedOutlierIndices.push(index);
                }
            });
        }
    }), [artifact, setAllEdits, currentTurnId]);

    // Pre-process artifacts to include original indices
    const enrichedClaims = useMemo(() =>
        artifact.consensus.claims.map((c, i) => ({ ...c, originalIndex: i })),
        [artifact.consensus.claims]);

    const enrichedOutliers = useMemo(() =>
        artifact.outliers.map((o, i) => ({ ...o, originalIndex: i })),
        [artifact.outliers]);

    const renderSection = (title: string, icon: string, items: typeof dimensionCoverage, subtitle: string, variant: any) => (
        <section>
            <SectionHeader
                icon={icon}
                title={title}
                count={items.length}
                subtitle={subtitle}
                variant={variant}
            />
            {items.map(coverage => (
                <DimensionCard
                    key={coverage.dimension}
                    coverage={coverage}
                    claims={enrichedClaims.filter(c => c.dimension === coverage.dimension)}
                    outliers={enrichedOutliers.filter(o => o.dimension === coverage.dimension)}
                    edits={edits}
                    {...handlers}
                />
            ))}
        </section>
    );

    return (
        <div className="w-full space-y-4">
            {gaps.length > 0 && renderSection("Gaps", "🔶", gaps, "Only outliers cover these", "gap")}
            {contested.length > 0 && renderSection("Contested", "⚔️", contested, "Consensus vs outliers", "contested")}
            {settled.length > 0 && renderSection("Settled", "✅", settled, "Consensus established", "settled")}
        </div>
    );
};
