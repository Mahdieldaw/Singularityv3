import React, { useState, useRef, useEffect } from "react";
import { useAtom } from "jotai";
import {
    refinerDataAtom,
    analystDrawerOpenAtom,
} from "../state/atoms";

interface AnalystDrawerProps {
    onPerfectThis: () => void;
    onUseVariant: (variant: string) => void;
}

const AnalystDrawer: React.FC<AnalystDrawerProps> = ({
    onPerfectThis,
    onUseVariant,
}) => {
    const [refinerData] = useAtom(refinerDataAtom);
    const [isOpen, setIsOpen] = useAtom(analystDrawerOpenAtom);
    const [activeTab, setActiveTab] = useState<"audit" | "variants">("audit");
    const [dragStartY, setDragStartY] = useState<number | null>(null);
    const [dragOffset, setDragOffset] = useState(0);
    const drawerRef = useRef<HTMLDivElement>(null);

    // Close on click outside (but not blocking - just listening)
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        // Delay to prevent immediate close
        const timer = setTimeout(() => {
            document.addEventListener("click", handleClickOutside);
        }, 100);

        return () => {
            clearTimeout(timer);
            document.removeEventListener("click", handleClickOutside);
        };
    }, [isOpen, setIsOpen]);

    if (!isOpen || !refinerData) {
        return null;
    }

    const handleDragStart = (e: React.TouchEvent | React.MouseEvent) => {
        e.stopPropagation();
        const y = "touches" in e ? e.touches[0].clientY : e.clientY;
        setDragStartY(y);
    };

    const handleDragMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (dragStartY === null) return;
        const y = "touches" in e ? e.touches[0].clientY : e.clientY;
        const offset = Math.max(0, y - dragStartY);
        setDragOffset(offset);
    };

    const handleDragEnd = () => {
        if (dragOffset > 80) {
            setIsOpen(false);
        }
        setDragStartY(null);
        setDragOffset(0);
    };

    const variants = refinerData.variants || [];
    const audit = refinerData.audit || "No audit available.";

    return (
        <div
            ref={drawerRef}
            className="fixed inset-x-0 bottom-0 z-[2999] transition-transform duration-300 ease-out pointer-events-auto"
            style={{ transform: `translateY(${dragOffset}px)` }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Drawer - NO backdrop, just the drawer itself */}
            <div className="bg-surface-base/98 backdrop-blur-xl border-t border-border-subtle shadow-elevated rounded-t-2xl animate-in slide-in-from-bottom duration-300">
                {/* Header with drag handle and close button */}
                <div
                    className="flex items-center justify-between px-4 py-2 cursor-grab active:cursor-grabbing border-b border-border-subtle/50"
                    onMouseDown={handleDragStart}
                    onMouseUp={handleDragEnd}
                    onMouseMove={handleDragMove}
                    onMouseLeave={handleDragEnd}
                    onTouchStart={handleDragStart}
                    onTouchMove={handleDragMove}
                    onTouchEnd={handleDragEnd}
                >
                    <div className="w-6" /> {/* Spacer */}
                    <div className="w-10 h-1 bg-border-subtle rounded-full" />
                    <button
                        onClick={() => setIsOpen(false)}
                        className="text-text-muted hover:text-text-primary text-lg transition-colors"
                        title="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-4 gap-2 border-b border-border-subtle">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveTab("audit");
                        }}
                        className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all ${activeTab === "audit"
                                ? "text-intent-warning bg-intent-warning/10 border-b-2 border-intent-warning"
                                : "text-text-muted hover:text-text-primary"
                            }`}
                    >
                        🎯 Audit
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveTab("variants");
                        }}
                        className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all ${activeTab === "variants"
                                ? "text-brand-400 bg-brand-500/10 border-b-2 border-brand-400"
                                : "text-text-muted hover:text-text-primary"
                            }`}
                    >
                        🔀 Variants ({variants.length})
                    </button>
                </div>

                {/* Content - scrollable */}
                <div className="h-[200px] overflow-y-auto px-4 py-4">
                    {activeTab === "audit" && (
                        <div className="flex flex-col gap-4">
                            <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                                {audit}
                            </div>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPerfectThis();
                                }}
                                className="self-start px-4 py-2 bg-brand-500/15 border border-brand-500/30 rounded-lg text-brand-400 text-sm font-medium hover:bg-brand-500/25 transition-all flex items-center gap-2"
                            >
                                ✨ Perfect this
                                <span className="text-xs text-text-muted">(Composer)</span>
                            </button>
                        </div>
                    )}

                    {activeTab === "variants" && (
                        <div className="flex flex-col gap-3">
                            {variants.length === 0 ? (
                                <p className="text-text-muted text-sm">No variants available.</p>
                            ) : (
                                variants.map((variant, idx) => (
                                    <div
                                        key={idx}
                                        className="p-3 bg-chip-soft border border-border-subtle rounded-lg hover:border-brand-400/50 transition-all"
                                    >
                                        <p className="text-sm text-text-primary leading-snug mb-2">
                                            {variant}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onUseVariant(variant);
                                            }}
                                            className="px-3 py-1.5 bg-brand-500/10 border border-brand-500/30 rounded-md text-brand-400 text-xs font-medium hover:bg-brand-500/20 transition-all"
                                        >
                                            Use this
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AnalystDrawer;
