import React, { useState, useRef, useEffect } from "react";
import { cn } from "../utils/cn";
import type { LaunchpadDraft } from "../types";
import { useAtom } from "jotai";
import { chatInputValueAtom } from "../state/atoms";

interface DraftCardProps {
    draft: LaunchpadDraft;
    index: number;
    onUpdate: (text: string) => void;
    onDelete: () => void;
    onSend: () => void;
    onSendToComposer: () => void;
    onSendToAnalyst: () => void;
    onReorder: (fromIndex: number, toIndex: number) => void;
}

export const DraftCard: React.FC<DraftCardProps> = ({
    draft,
    index,
    onUpdate,
    onDelete,
    onSend,
    onSendToComposer,
    onSendToAnalyst,
    onReorder,
}) => {
    const [chatInputValue, setChatInputValue] = useAtom(chatInputValueAtom);
    const [isEditing, setIsEditing] = useState(false);
    const [text, setText] = useState(draft.text);
    const [isDragging, setIsDragging] = useState(false);
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
    const cardRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [isEditing, text]);

    const handleDragStart = (e: React.DragEvent) => {
        setIsDragging(true);
        e.dataTransfer.effectAllowed = "move";
        // Store only the index as plain text
        e.dataTransfer.setData("application/x-draft-index", index.toString());
    };

    const handleDragEnd = () => {
        setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (e.cancelable) e.preventDefault(); // Necessary to allow dropping, but check cancelable for safety
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent) => {
        if (e.cancelable) e.preventDefault();
        const fromIndexStr = e.dataTransfer.getData("application/x-draft-index");
        if (fromIndexStr) {
            const fromIndex = parseInt(fromIndexStr, 10);
            if (!isNaN(fromIndex) && fromIndex !== index) {
                onReorder(fromIndex, index);
            }
        }
    };

    const extractToInput = (content: string) => {
        setChatInputValue(content);
    };

    const mainText = (() => {
        const d: any = draft as any;
        if (Array.isArray(d.sections) && d.sections.length > 0) {
            const primaryId = d.primarySectionId || d.sections[0]?.id;
            const primary = d.sections.find((s: any) => s.id === primaryId) || d.sections[0];
            return primary?.text || draft.text;
        }
        return draft.text;
    })();

    const allText = (() => {
        const d: any = draft as any;
        if (Array.isArray(d.sections) && d.sections.length > 0) {
            return d.sections.map((s: any) => `${s.title}\n\n${s.text}`).join("\n\n\n");
        }
        return draft.text;
    })();

    const handleBlur = () => {
        setIsEditing(false);
        if (text !== draft.text) {
            onUpdate(text);
        }
    };

    const getSourceColor = (source: LaunchpadDraft["source"]) => {
        switch (source) {
            case "composer":
                return "text-brand-400 border-brand-500/30 bg-brand-500/5";
            case "analyst-audit":
                return "text-intent-warning border-intent-warning/30 bg-intent-warning/5";
            case "analyst-variant":
                return "text-text-secondary border-border-subtle bg-surface-base";
            default:
                return "text-text-muted border-border-subtle";
        }
    };

    // Swipe to delete logic
    // Simple implementation: if user drags mostly horizontally > threshold
    const [swipeOffset, setSwipeOffset] = useState(0);
    const touchStartX = useRef<number | null>(null);

    const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
        // Only if not editing
        if (isEditing) return;
        const x = "touches" in e ? e.touches[0].clientX : e.clientX;
        touchStartX.current = x;
    };

    const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (touchStartX.current === null || isEditing) return;
        const x = "touches" in e ? e.touches[0].clientX : e.clientX;
        const diff = x - touchStartX.current;

        // Only allow swiping left (negative diff)
        if (diff < 0) {
            setSwipeOffset(diff);
        }
    };

    const handleTouchEnd = () => {
        if (swipeOffset < -150) {
            // Swiped far enough to delete
            onDelete();
        }
        setSwipeOffset(0);
        touchStartX.current = null;
    };

    return (
        <div
            ref={cardRef}
            className={cn(
                "relative transition-all duration-200 group mb-3 select-none",
                isDragging && "opacity-40 scale-95",
                swipeOffset < 0 && "cursor-grabbing"
            )}
            // Drag & drop: only enable drop targets on the card; dragging starts from the grip only.
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            // Swipe handlers attached to container
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ transform: `translateX(${swipeOffset}px)` }}
        >
            {/* Background delete indicator (revealed on swipe) */}
            <div
                className="absolute inset-y-0 right-[-100px] w-[100px] bg-intent-danger/20 flex items-center justify-center rounded-r-lg opacity-0 transition-opacity"
                style={{ opacity: swipeOffset < -50 ? 1 : 0 }}
            >
                <span className="text-intent-danger font-bold">Delete</span>
            </div>

            <div className={cn(
                "p-4 rounded-xl border backdrop-blur-sm transition-colors",
                getSourceColor(draft.source),
                "hover:border-opacity-50 hover:shadow-lg"
            )}>

                {/* Header: Grip + Title + Extract buttons */}
                <div className="flex items-center gap-3 mb-2">
                    <div
                        className="cursor-grab active:cursor-grabbing text-border-subtle hover:text-text-secondary p-1 -ml-1"
                        draggable={!isEditing}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                    >
                        {/* 6-dots grip icon */}
                        <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor">
                            <circle cx="3" cy="4" r="1.5" />
                            <circle cx="9" cy="4" r="1.5" />
                            <circle cx="3" cy="10" r="1.5" />
                            <circle cx="9" cy="10" r="1.5" />
                            <circle cx="3" cy="16" r="1.5" />
                            <circle cx="9" cy="16" r="1.5" />
                        </svg>
                    </div>
                    <h3 className="text-xs font-bold uppercase tracking-wider opacity-90 flex-1 truncate">
                        {draft.title}
                    </h3>
                    <div className="flex items-center gap-2 ml-auto">
                        <button
                            onClick={(e) => { e.stopPropagation(); extractToInput(mainText + "\n\n" + chatInputValue); }}
                            className="px-2 py-1 text-[10px] bg-chip-soft hover:bg-surface-highlight border border-border-subtle rounded-md text-text-secondary"
                            title="Extract main to input"
                        >
                            Extract main →
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); extractToInput(allText + "\n\n" + chatInputValue); }}
                            className="px-2 py-1 text-[10px] bg-chip-soft hover:bg-surface-highlight border border-border-subtle rounded-md text-text-secondary"
                            title="Extract all to input"
                        >
                            Extract all →
                        </button>
                        <div className="text-[10px] text-text-muted opacity-50">
                            {new Date(draft.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                </div>

                {/* Content Body */}
                {Array.isArray((draft as any).sections) && (draft as any).sections.length > 0 ? (
                    <div className="flex flex-col gap-3">
                        {/* Primary section first if provided */}
                        {(() => {
                            const d: any = draft as any;
                            const sections = d.sections as Array<{ id: string; title: string; text: string }>;
                            const primaryId: string | undefined = d.primarySectionId;
                            const ordered = primaryId ? [
                                ...sections.filter(s => s.id === primaryId),
                                ...sections.filter(s => s.id !== primaryId)
                            ] : sections;
                            return ordered.map((sec) => (
                                <div key={sec.id} className="rounded-lg border border-border-subtle/60 bg-surface">
                                    <button
                                        className="w-full flex items-center justify-between px-3 py-2 text-left"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenSections((prev) => ({ ...prev, [sec.id]: !prev[sec.id] }));
                                        }}
                                    >
                                        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1">
                                            <span className={`transition-transform ${openSections[sec.id] !== false ? '' : '-rotate-90'}`}>▸</span>
                                            {sec.title}
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); extractToInput(sec.text + "\n\n" + chatInputValue); }}
                                            className="px-2 py-1 text-xs bg-chip-soft hover:bg-surface-highlight border border-border-subtle rounded-md text-text-secondary"
                                            title="Extract this section to input"
                                        >
                                            Extract →
                                        </button>
                                    </button>
                                    {openSections[sec.id] !== false && (
                                        <div className="px-3 pb-3 text-sm text-text-primary whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
                                            {sec.text}
                                        </div>
                                    )}
                                </div>
                            ));
                        })()}
                    </div>
                ) : (
                    <div
                        className="min-h-[60px] cursor-text"
                        onClick={() => setIsEditing(true)}
                    >
                        {isEditing ? (
                            <textarea
                                ref={textareaRef}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                onBlur={handleBlur}
                                className="w-full bg-transparent text-sm text-text-primary resize-none outline-none leading-relaxed max-h-64 overflow-y-auto"
                                autoFocus
                            />
                        ) : (
                            <div className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap opacity-90 max-h-64 overflow-y-auto">
                                {text}
                            </div>
                        )}
                    </div>
                )}

                {/* Action Bar */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border-subtle/30 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={(e) => { e.stopPropagation(); extractToInput(mainText + "\n\n" + chatInputValue); }}
                        className="px-3 py-1.5 bg-chip-soft hover:bg-surface-highlight text-text-secondary border border-border-subtle rounded-lg text-xs transition-colors flex items-center gap-1.5"
                        title="Extract main to input"
                    >
                        <span>→</span>
                        <span>Extract</span>
                    </button>

                    <button
                        onClick={(e) => { e.stopPropagation(); onSend(); }}
                        className="flex-1 px-3 py-1.5 bg-brand-500/20 hover:bg-brand-500/30 text-brand-400 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                        <span>Run This</span>
                    </button>

                    <div className="w-[1px] h-4 bg-border-subtle/50 mx-1" />

                    <button
                        onClick={(e) => { e.stopPropagation(); onSendToComposer(); }}
                        className="px-2 py-1.5 text-text-secondary hover:text-brand-400 hover:bg-surface-elevated rounded-md text-xs transition-colors"
                        title="Send to Composer"
                    >
                        → Comp
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onSendToAnalyst(); }}
                        className="px-2 py-1.5 text-text-secondary hover:text-intent-warning hover:bg-surface-elevated rounded-md text-xs transition-colors"
                        title="Send to Analyst"
                    >
                        → Anal
                    </button>
                </div>
            </div>
        </div>
    );
};
