import React, { useRef, useEffect } from "react";
import { useAtom } from "jotai";
import { launchpadOpenAtom } from "../state/atoms";
import { useLaunchpadDrafts } from "../hooks/useLaunchpadDrafts";
import { useChat } from "../hooks/chat/useChat";
import { DraftCard } from "./DraftCard";
import { cn } from "../utils/cn";

export const LaunchpadDrawer: React.FC = () => {
    const [isOpen, setIsOpen] = useAtom(launchpadOpenAtom);
    const { drafts, updateDraft, deleteDraft, reorderDrafts, clearAll } = useLaunchpadDrafts();
    const { sendMessage, runComposerFlow } = useChat();
    const drawerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            // If clicking the tab, don't close (tab handles toggle)
            if (e.target instanceof Element && e.target.closest('button[title="Open Launchpad"]')) {
                return;
            }
            if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        const timer = setTimeout(() => {
            document.addEventListener("click", handleClickOutside);
        }, 100);

        return () => {
            clearTimeout(timer);
            document.removeEventListener("click", handleClickOutside);
        };
    }, [isOpen, setIsOpen]);

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop - subtle or transparent? Plan said "Backdrop blur like HistoryPanel" */}
            <div className="fixed inset-0 bg-transparent z-[2998]" />

            <div
                ref={drawerRef}
                className={cn(
                    "fixed top-0 left-0 w-[420px] h-screen bg-surface-base/98 backdrop-blur-xl border-r border-border-subtle shadow-nav z-[2999]",
                    "flex flex-col animate-in slide-in-from-left duration-300 ease-out"
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle/50">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                            <span className="text-xl">🚀</span> Launchpad
                        </h2>
                        <span className="px-2 py-0.5 bg-surface-elevated rounded-full text-xs text-text-secondary font-medium border border-border-subtle">
                            {drafts.length}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {drafts.length > 0 && (
                            <button
                                onClick={clearAll}
                                className="text-xs text-text-muted hover:text-intent-danger transition-colors mr-2 uppercase tracking-wide font-medium"
                            >
                                Clear All
                            </button>
                        )}
                        <button
                            onClick={() => setIsOpen(false)}
                            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-elevated text-text-muted hover:text-text-primary transition-all"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-border-subtle scrollbar-track-transparent">
                    {drafts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center text-text-muted px-8 opacity-60">
                            <div className="w-16 h-16 rounded-full bg-surface-elevated mb-4 flex items-center justify-center text-3xl opacity-50">
                                🛸
                            </div>
                            <p className="font-medium text-lg mb-2">Ready for lift-off</p>
                            <p className="text-sm leading-relaxed">
                                Drafts from Composer and Analyst will appear here. Refine them until they are ready to launch.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1 pb-10">
                            {drafts.map((draft, index) => (
                                <DraftCard
                                    key={draft.id}
                                    draft={draft}
                                    index={index}
                                    onUpdate={(text) => updateDraft(draft.id, text)}
                                    onDelete={() => deleteDraft(draft.id)}
                                    // Actions
                                    onSend={() => {
                                        sendMessage(draft.text, "new");
                                        // Optional: close drawer after sending?
                                        // setIsOpen(false); 
                                    }}
                                    onSendToComposer={() => {
                                        // Trigger Composer refinement
                                        runComposerFlow(draft.text, "compose", draft.originalPrompt);
                                        setIsOpen(false); // Close so they see the composer
                                    }}
                                    onSendToAnalyst={() => {
                                        // Trigger Analyst explanation
                                        runComposerFlow(draft.text, "explain", draft.originalPrompt);
                                        setIsOpen(false); // Close so they see the analyst
                                    }}
                                    onReorder={reorderDrafts}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div className="p-3 border-t border-border-subtle/30 bg-surface-base/50 text-[10px] text-center text-text-muted uppercase tracking-widest font-mono opacity-50">
                    Drag to Reorder • Swipe to Delete
                </div>
            </div>
        </>
    );
};

export default LaunchpadDrawer;
