import React from "react";
import { useAtom, useAtomValue } from "jotai";
import { chatInputHeightAtom, selectedArtifactsAtom, selectedArtifactTokenCountAtom } from "../../state/atoms";
import { TrashIcon } from "../Icons"; // Ensure this icon exists or use generic SVG

export const SelectionBar: React.FC = () => {
    const [selectedIds, setSelectedIds] = useAtom(selectedArtifactsAtom);
    const tokenCount = useAtomValue(selectedArtifactTokenCountAtom);
    const chatInputHeight = useAtomValue(chatInputHeightAtom);

    if (selectedIds.size === 0) return null;

    const handleClear = () => {
        setSelectedIds((draft) => {
            draft.clear();
        });
    };

    return (
        <div
            className="fixed left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300"
            style={{ bottom: Math.max(chatInputHeight, 80) + 16 }}
        >
            <div className="flex items-center gap-4 bg-surface-raised border border-primary-500/30 shadow-xl shadow-primary-500/10 rounded-full px-5 py-2.5 backdrop-blur-md ring-1 ring-primary-500/20">
                <div className="flex flex-col">
                    <span className="text-sm font-semibold text-text-primary">
                        {selectedIds.size} artifact{selectedIds.size !== 1 ? 's' : ''} selected
                    </span>
                    <span className="text-[10px] text-text-muted">
                        ~{tokenCount} tokens • Will be injected as context
                    </span>
                </div>

                <div className="h-6 w-px bg-border-subtle mx-1" />

                <button
                    onClick={handleClear}
                    className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-intent-danger transition-colors font-medium px-2 py-1 rounded hover:bg-surface-highlight"
                >
                    <TrashIcon className="w-3.5 h-3.5" />
                    Clear
                </button>
            </div>
        </div>
    );
};
