import React, { useRef, useState, useCallback } from 'react';
import clsx from 'clsx';

interface ResizableSplitLayoutProps {
    leftPane: React.ReactNode;
    rightPane: React.ReactNode;
    isSplitOpen: boolean;
    ratio: number; // Percentage (0-100)
    onRatioChange: (ratio: number) => void;
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
    ratio,
    onRatioChange,
    minRatio = 20,
    maxRatio = 80,
    dividerContent,
    className,
    style
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Calculate effective ratio - if split is closed, left is 100%
    // But we keep the 'ratio' prop as the "target" for when it opens
    const leftWidth = isSplitOpen ? ratio : 100;

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

        onRatioChange(newRatio);
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
            {/* Left Pane */}
            <div
                style={{ width: `${leftWidth}%` }}
                className={clsx("h-full min-w-0 transition-[width] duration-75 ease-out", isDragging && "transition-none")}
            >
                {leftPane}
            </div>

            {/* Divider and Right Pane (only if open) */}
            {isSplitOpen && (
                <>
                    {/* Divider Handle */}
                    <div
                        className="w-1.5 h-full bg-border-subtle hover:bg-brand-500/50 transition-colors cursor-col-resize relative z-10 shrink-0 select-none touch-none"
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                    >
                        {/* Centered Divider Content (Orbs) */}
                        {/* We position this absolutely relative to the divider to allow it to overflow freely */}
                        <div
                            className="absolute top-0 bottom-0 left-0 w-0 flex flex-col items-center justify-center overflow-visible pointer-events-none"
                        >
                            <div className="pointer-events-auto transform -translate-x-[calc(100%+6px)]">
                                {dividerContent}
                            </div>
                        </div>
                    </div>

                    {/* Right Pane */}
                    <div
                        style={{ width: `${100 - ratio}%` }}
                        className={clsx("h-full min-w-0 flex-1 transition-[width] duration-75 ease-out", isDragging && "transition-none")}
                    >
                        {rightPane}
                    </div>
                </>
            )}
        </div>
    );
};
