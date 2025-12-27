/**
 * DimensionCard.tsx
 * 
 * Card component for displaying a single dimension with its claims/outliers
 */

import React, { useState } from 'react';
import { DimensionCoverage, MapperArtifact } from '../../../shared/contract';
import { getStatusIcon } from './dimension-helpers';
import { EditableClaimItem } from './cards/items/EditableClaimItem';
import { EditableOutlierItem } from './cards/items/EditableOutlierItem';
import { ArtifactEdits } from '../../state/artifact-edits';

interface DimensionCardProps {
    coverage: DimensionCoverage;
    claims: MapperArtifact['consensus']['claims'];
    outliers: MapperArtifact['outliers'];
    edits?: ArtifactEdits;
    onConsensusEdit?: (index: number, edit: { text: string }) => void;
    onOutlierEdit?: (index: number, edit: { insight: string; type: "supplemental" | "frame_challenger" }) => void;
    onConsensusDelete?: (index: number) => void;
    onOutlierDelete?: (index: number) => void;
}

export const DimensionCard: React.FC<DimensionCardProps> = ({
    coverage,
    claims,
    outliers,
    edits,
    onConsensusEdit,
    onOutlierEdit,
    onConsensusDelete,
    onOutlierDelete
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [editingClaimIndex, setEditingClaimIndex] = useState<number | null>(null);
    const [editingOutlierIndex, setEditingOutlierIndex] = useState<number | null>(null);

    const statusIcon = getStatusIcon(coverage.status);
    const dimensionLabel = coverage.dimension.replace(/[_-]+/g, ' ');
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
        <div className="bg-surface-base border border-border-subtle rounded-lg overflow-hidden">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full text-left p-3 hover:bg-surface-highlight transition-colors group"
                title="Click to view and edit claims"
            >
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">{statusIcon}</span>
                    <div className="text-sm font-medium text-text-primary capitalize flex-1">{dimensionLabel}</div>

                    <div className="flex items-center gap-2">
                        {coverage.support_bar != null && (
                            <span className="text-[10px] text-text-muted font-mono px-1.5 py-0.5 rounded bg-surface-highlight border border-border-subtle hidden sm:inline-block">
                                {coverage.support_bar} support
                            </span>
                        )}
                        <span className="text-[10px] text-text-muted font-mono px-1.5 py-0.5 rounded bg-surface-highlight border border-border-subtle">
                            {claims.length}C / {outliers.length}O
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${statusTone}`}>
                            {statusLabel}
                        </span>
                    </div>
                </div>

                {leaderExcerpt && (
                    <div className="text-xs text-text-secondary leading-relaxed pl-6 opacity-90">
                        {leaderExcerpt}
                    </div>
                )}
            </button>

            {isExpanded && (
                <div className="px-3 pb-3 space-y-4 animate-in slide-in-from-top-2 duration-200 border-t border-border-subtle/50 pt-3">

                    {/* Consensus Claims */}
                    {claims.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider pl-1">Consensus</h4>
                            <div className="space-y-2">
                                {claims.map((claim, idx) => {
                                    // We need to find the REAL index of this claim in the global artifact to pass to handlers
                                    // For now, we assume the parent passes the correct global index or handles filtering.
                                    // WAIT: The passed 'claims' array is filtered. We need the original index.
                                    // The parent should probably pass items wrapper with { item, originalIndex }.
                                    // For simplicity in V1, let's assume the parent handles the mapping or we rely on text matching if indices are tricky.
                                    // ACTUALLY: Let's assume the passed 'claims' has the 'originalIndex' property tacked on? 
                                    // No, the contract doesn't have it.
                                    // Better strategy: The PARENT filters and we rely on the parent to pass objects that include the index, 
                                    // OR we pass the full artifact and filter here.

                                    // Let's rely on the parent to pass extended objects or we iterate differently.
                                    // To fix this without breaking contract, let's assume 'claims' passed here acts as display.
                                    // But wait, editing needs index.
                                    // Let's update `DimensionFirstView` to map the claims to { ...claim, originalIndex } before passing!

                                    const anyClaim = claim as any;
                                    const originalIndex = anyClaim.originalIndex ?? idx;

                                    const editState = edits?.consensusEdits.find(e => e.index === originalIndex);
                                    const isDeleted = edits?.deletedClaimIndices.includes(originalIndex);

                                    if (isDeleted) return null;

                                    // Merge display text
                                    const displayClaim = editState ? { ...claim, ...editState.edited } : claim;

                                    return (
                                        <EditableClaimItem
                                            key={originalIndex}
                                            claim={displayClaim}
                                            isEditing={editingClaimIndex === originalIndex}
                                            hasBeenEdited={!!editState}
                                            onStartEdit={() => setEditingClaimIndex(originalIndex)}
                                            onCancelEdit={() => setEditingClaimIndex(null)}
                                            onSaveEdit={(changes: { text: string }) => {
                                                onConsensusEdit?.(originalIndex, changes);
                                                setEditingClaimIndex(null);
                                            }}
                                            onDelete={() => onConsensusDelete?.(originalIndex)}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Outliers */}
                    {outliers.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider pl-1">Outliers</h4>
                            <div className="space-y-2">
                                {outliers.map((outlier, idx) => {
                                    const anyOutlier = outlier as any;
                                    const originalIndex = anyOutlier.originalIndex ?? idx;

                                    const editState = edits?.outlierEdits.find(e => e.index === originalIndex);
                                    const isDeleted = edits?.deletedOutlierIndices.includes(originalIndex);

                                    if (isDeleted) return null;

                                    const displayOutlier = editState ? { ...outlier, ...editState.edited } : outlier;

                                    return (
                                        <EditableOutlierItem
                                            key={originalIndex}
                                            outlier={displayOutlier}
                                            isEditing={editingOutlierIndex === originalIndex}
                                            hasBeenEdited={!!editState}
                                            onStartEdit={() => setEditingOutlierIndex(originalIndex)}
                                            onCancelEdit={() => setEditingOutlierIndex(null)}
                                            onSaveEdit={(changes: { insight: string; type: "supplemental" | "frame_challenger" }) => {
                                                onOutlierEdit?.(originalIndex, changes);
                                                setEditingOutlierIndex(null);
                                            }}
                                            onDelete={() => onOutlierDelete?.(originalIndex)}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

