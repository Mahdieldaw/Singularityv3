import React, { useState, useEffect } from "react";
import { Claim } from "../../../../../shared/contract";

interface EditableClaimItemProps {
    claim: Claim;
    isEditing: boolean;
    hasBeenEdited: boolean;
    onStartEdit: () => void;
    onSaveEdit: (edited: { text: string }) => void;
    onCancelEdit: () => void;
    onDelete: () => void;
}

export const EditableClaimItem: React.FC<EditableClaimItemProps> = ({
    claim,
    isEditing,
    hasBeenEdited,
    onStartEdit,
    onSaveEdit,
    onCancelEdit,
    onDelete
}) => {
    const [editedText, setEditedText] = useState(claim.text);

    useEffect(() => {
        if (isEditing) setEditedText(claim.text);
    }, [isEditing, claim.text]);

    if (!isEditing) {
        return (
            <div className={`p-3 rounded border border-border-subtle hover:border-border-strong bg-surface-base transition-colors group relative ${hasBeenEdited ? 'border-l-2 border-l-brand-400' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1">
                        <div className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full bg-surface-highlight flex items-center justify-center text-[10px] text-text-secondary border border-border-subtle">
                            C
                        </div>
                        <div className="space-y-1">
                            <span className="text-sm text-text-primary leading-relaxed block">{claim.text}</span>
                            {hasBeenEdited && <span className="text-[10px] text-brand-400 font-medium">Edited</span>}
                        </div>
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
                    <label className="text-xs text-text-secondary mb-1 block">Claim Text</label>
                    <textarea
                        value={editedText}
                        onChange={e => setEditedText(e.target.value)}
                        className="w-full bg-surface-base border border-border-subtle rounded p-2 text-sm text-text-primary focus:outline-none focus:border-brand-500 min-h-[60px]"
                        autoFocus
                    />
                </div>

                <div className="flex gap-2 justify-end">
                    <button
                        onClick={onCancelEdit}
                        className="px-3 py-1.5 bg-surface-highlight hover:bg-surface-raised text-text-secondary rounded text-xs font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onSaveEdit({ text: editedText })}
                        className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-medium transition-colors"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};
