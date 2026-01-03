// ResizableSplitLayout.tsx - PRODUCTION-GRADE FIX
// Fixes: Right pane width expansion bug when content has long unbreakable strings

import React, { useRef, useState, useCallback } from 'react';
import clsx from 'clsx';

interface ResizableSplitLayoutProps {
    leftPane: React.ReactNode;
    rightPane: React.ReactNode;
    isSplitOpen: boolean;
    ratio?: number; // Optional: Initial or controlled percentage (0-100)
    onRatioChange?: (ratio: number) => void;
    minRatio?: number;
    maxRatio?: number;
    dividerContent?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export const ResizableSplitLayout: React.FC<ResizableSplitLayoutProps> = ({
    leftPane,
    rightPane,
    isSplitOpen,
    ratio: controlledRatio,
    onRatioChange,
    minRatio = 20,
    maxRatio = 80,
    dividerContent,
    className,
    style
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [internalRatio, setInternalRatio] = useState(controlledRatio ?? 70);
    const [isDragging, setIsDragging] = useState(false);

    // Use controlled ratio if provided, otherwise internal
    const ratio = controlledRatio ?? internalRatio;

    // Calculate effective ratio - if split is closed, left is 100%
    const leftWidth = isSplitOpen ? ratio : 100;
    const rightWidth = 100 - ratio; // Store for clarity

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (!isSplitOpen) return;
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        // Capture pointer to handle moves outside the divider
        (e.target as Element).setPointerCapture(e.pointerId);
    }, [isSplitOpen]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging || !containerRef.current) return;
        e.preventDefault();

        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const totalWidth = rect.width;

        let newRatio = (x / totalWidth) * 100;

        // Clamp ratio
        newRatio = Math.max(minRatio, Math.min(maxRatio, newRatio));

        if (onRatioChange) {
            onRatioChange(newRatio);
        } else {
            setInternalRatio(newRatio);
        }
    }, [isDragging, minRatio, maxRatio, onRatioChange]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (!isDragging) return;
        e.preventDefault();
        setIsDragging(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        (e.target as Element).releasePointerCapture(e.pointerId);
    }, [isDragging]);

    return (
        <div
            ref={containerRef}
            className={clsx("flex h-full w-full overflow-hidden", className)}
            style={style}
        >
            {/* ============================================
                LEFT PANE
                - flex-shrink-0: Prevent collapsing below width
                - min-w-0: Allow content to scroll/clip
                - overflow-hidden: Clip overflowing content
                ============================================ */}
            <div
                style={{ width: `${leftWidth}%` }}
                className={clsx(
                    "h-full flex-shrink-0 min-w-0 overflow-hidden transition-[width] duration-75 ease-out",
                    isDragging && "transition-none"
                )}
            >
                {leftPane}
            </div>

            {/* Divider and Right Pane (only if open) */}
            {isSplitOpen && (
                <>
                    {/* ============================================
                        DIVIDER HANDLE
                        ============================================ */}
                    <div
                        className="w-1.5 h-full bg-border-subtle hover:bg-brand-500/50 transition-colors cursor-col-resize relative z-10 shrink-0 select-none touch-none"
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                    >
                        {/* Centered Divider Content (Orbs) */}
                        <div
                            className="absolute top-0 bottom-0 left-0 w-0 flex flex-col items-center justify-center overflow-visible pointer-events-none"
                        >
                            <div className="pointer-events-auto transform -translate-x-[calc(100%+6px)]">
                                {dividerContent}
                            </div>
                        </div>
                    </div>

                    {/* ============================================
                        RIGHT PANE - CRITICAL FIXES APPLIED
                        ============================================
                        
                        🔥 KEY CHANGES:
                        1. REMOVED flex-1 (was causing expansion)
                        2. ADDED flex-shrink-0 (prevents collapse)
                        3. ADDED max-width to enforce boundary
                        4. ADDED overflow-hidden for containment
                        
                        WHY THIS WORKS:
                        - width + max-width with same value = hard constraint
                        - flex-shrink-0 prevents compression
                        - overflow-hidden clips content instead of expanding
                        - min-w-0 allows internal scrolling
                        ============================================ */}
                    <div
                        style={{
                            width: `${rightWidth}%`,
                            maxWidth: `${rightWidth}%`, // ⭐ CRITICAL: Enforce as maximum
                        }}
                        className={clsx(
                            "h-full flex-shrink-0 min-w-0 overflow-hidden transition-[width] duration-75 ease-out",
                            isDragging && "transition-none"
                        )}
                    >
                        {rightPane}
                    </div>
                </>
            )}
        </div>
    );
};

// ============================================
// TECHNICAL DEBT NOTICE
// ============================================
// This fix addresses a fundamental CSS flexbox behavior where:
// 1. Percentage widths are treated as "suggestions" not constraints
// 2. Content with intrinsic width can override flexible containers
// 3. The combination of flex-1 + percentage width creates ambiguity
//
// FUTURE IMPROVEMENT:
// Consider migrating to CSS Grid for more predictable layout control:
// grid-template-columns: ${ratio}% 6px 1fr;
// This would eliminate the flex ambiguity entirely.
// ============================================