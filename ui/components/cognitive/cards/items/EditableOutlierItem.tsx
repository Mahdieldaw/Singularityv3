import React, { useState, useEffect } from "react";
import { MapperArtifact } from "../../../../../shared/contract";

interface EditableOutlierItemProps {
    outlier: MapperArtifact["outliers"][0];
    isEditing: boolean;
    hasBeenEdited: boolean;
    onStartEdit: () => void;
    onSaveEdit: (edited: { insight: string; type: "supplemental" | "frame_challenger" }) => void;
    onCancelEdit: () => void;
    onDelete: () => void;
}

export const EditableOutlierItem: React.FC<EditableOutlierItemProps> = ({
    outlier,
    isEditing,
    hasBeenEdited,
    onStartEdit,
    onSaveEdit,
    onCancelEdit,
    onDelete
}) => {
    const [editedInsight, setEditedInsight] = useState(outlier.insight);
    const [editedType, setEditedType] = useState(outlier.type);

    useEffect(() => {
        if (isEditing) {
            setEditedInsight(outlier.insight);
            setEditedType(outlier.type);
        }
    }, [isEditing, outlier.insight, outlier.type]);

    const isChallenger = outlier.type === 'frame_challenger';

    if (!isEditing) {
        return (
            <div className={`
                p-3 rounded border bg-surface-base transition-colors group relative
                ${isChallenger
                    ? 'border-intent-warning/30 bg-intent-warning/5'
                    : 'border-border-subtle hover:border-border-strong'}
                 ${hasBeenEdited ? 'border-l-2 border-l-brand-400' : ''}
            `}>
                <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                            <span className={`
                                text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded
                                ${isChallenger
                                    ? 'text-intent-warning bg-intent-warning/20'
                                    : 'text-text-secondary bg-surface-highlight'}
                            `}>
                                {isChallenger ? '⚡ Frame Challenger' : '💡 Supplemental'}
                            </span>
                            {hasBeenEdited && <span className="text-[10px] text-brand-400 font-medium">Edited</span>}
                        </div>
                        <span className="text-sm text-text-primary leading-relaxed block">{outlier.insight}</span>
                    </div>

                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
                            className="p-1.5 hover:bg-surface-highlight rounded text-text-secondary hover:text-text-primary"
                            title="Edit"
                        >
                            ✏️
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="p-1.5 hover:bg-surface-highlight rounded text-text-secondary hover:text-intent-danger"
                            title="Delete"
                        >
                            🗑️
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-3 rounded border border-brand-500/50 bg-brand-500/5 ring-1 ring-brand-500/20">
            <div className="flex flex-col gap-3">
                <div>
                    <label className="text-xs text-text-secondary mb-1 block">Insight</label>
                    <textarea
                        value={editedInsight}
                        onChange={e => setEditedInsight(e.target.value)}
                        className="w-full bg-surface-base border border-border-subtle rounded p-2 text-sm text-text-primary focus:outline-none focus:border-brand-500 min-h-[60px]"
                        autoFocus
                    />
                </div>

                <div>
                    <label className="text-xs text-text-secondary mb-1 block">Type</label>
                    <select
                        value={editedType}
                        onChange={e => setEditedType(e.target.value as any)}
                        className="w-full bg-[#1a1b26] border border-border-subtle rounded p-2 text-sm text-gray-200 focus:outline-none focus:border-brand-500 appearance-none"
                    >
                        <option value="supplemental">💡 Supplemental - Adds color/detail</option>
                        <option value="frame_challenger">⚡ Frame Challenger - Disproves consensus</option>
                    </select>
                </div>

                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onCancelEdit}
                        className="px-3 py-1.5 bg-surface-highlight hover:bg-surface-raised text-text-secondary rounded text-xs font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSaveEdit({ insight: editedInsight, type: editedType })}
                        className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-medium transition-colors"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};
