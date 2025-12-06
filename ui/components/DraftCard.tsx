import React, { useState, useRef, useEffect } from "react";
import { cn } from "../utils/cn";
import type { LaunchpadDraft } from "../types";

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
    const [isEditing, setIsEditing] = useState(false);
    const [text, setText] = useState(draft.text);
    const [isDragging, setIsDragging] = useState(false);
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

        // Set a custom drag image or let the browser handle it... 
        // Browser default is usually fine for cards.
    };

    const handleDragEnd = () => {
        setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // Necessary to allow dropping
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const fromIndexStr = e.dataTransfer.getData("application/x-draft-index");
        if (fromIndexStr) {
            const fromIndex = parseInt(fromIndexStr, 10);
            if (!isNaN(fromIndex) && fromIndex !== index) {
                onReorder(fromIndex, index);
            }
        }
    };

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
            draggable={!isEditing}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            // Swipe handlers attached to container
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            // For mouse simulation of swipe (optional, but requested "touch/mouse events")
            // We'll skip mouse swipe to avoid conflict with text selection/drag, 
            // but implemented for completeness if user uses mouse like touch.
            // Usually better to keep mouse for drag-reorder and touch for swipe-delete.
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

                {/* Header: Grip + Title */}
                <div className="flex items-center gap-3 mb-2">
                    <div className="cursor-grab active:cursor-grabbing text-border-subtle hover:text-text-secondary p-1 -ml-1">
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
                    <div className="text-[10px] text-text-muted opacity-50">
                        {new Date(draft.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>

                {/* Content Body */}
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
                            className="w-full bg-transparent text-sm text-text-primary resize-none outline-none leading-relaxed"
                            autoFocus
                        />
                    ) : (
                        <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap line-clamp-6 opacity-90">
                            {text}
                        </p>
                    )}
                </div>

                {/* Action Bar */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border-subtle/30 opacity-80 group-hover:opacity-100 transition-opacity">
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
