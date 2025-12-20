// ui/components/refinerui/RefinerDot.tsx
// Replaces TrustIcon with a simple dot UI following the new paradigm

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { RefinerOutput } from '../../../shared/parsing-utils';

interface RefinerDotProps {
    refiner: RefinerOutput | null;
    onClick: () => void;
    isActive?: boolean;
}

type DotState = 'hidden' | 'subtle' | 'active';

function getDotState(refiner: RefinerOutput | null): DotState {
    if (!refiner) return 'hidden';
    if (refiner.gem) return 'active';
    if (refiner.synthesisPlus) return 'subtle';
    return 'hidden';
}

export const RefinerDot: React.FC<RefinerDotProps> = ({ refiner, onClick, isActive }) => {
    const [hovering, setHovering] = useState(false);
    const [gemPreviewVisible, setGemPreviewVisible] = useState(false);
    const [gemPreviewText, setGemPreviewText] = useState('');
    const prevGemRef = useRef<string | null>(null);

    const dotState = getDotState(refiner);
    const hasGem = refiner?.gem != null;

    // Gem reveal animation: when gem arrives, show insight briefly
    useEffect(() => {
        if (!refiner?.gem?.insight) {
            prevGemRef.current = null;
            return;
        }

        const currentInsight = refiner.gem.insight;
        // Only trigger animation if this is a NEW gem (not on re-render)
        if (prevGemRef.current !== currentInsight) {
            prevGemRef.current = currentInsight;

            setGemPreviewText(currentInsight);
            setGemPreviewVisible(true);

            const timer = setTimeout(() => {
                setGemPreviewVisible(false);
            }, 2500);

            return () => clearTimeout(timer);
        }
    }, [refiner?.gem?.insight]);

    const handleMouseEnter = useCallback(() => setHovering(true), []);
    const handleMouseLeave = useCallback(() => setHovering(false), []);

    if (dotState === 'hidden') {
        return null;
    }

    return (
        <div className="refiner-dot-container relative flex items-center gap-2">
            {/* Gem Preview Text (appears briefly then fades) */}
            {gemPreviewVisible && gemPreviewText && (
                <div
                    className={`
                        gem-preview absolute right-full mr-3 
                        text-xs text-text-secondary max-w-[250px]
                        whitespace-nowrap overflow-hidden text-ellipsis
                        transition-opacity duration-300 ease-out
                        ${gemPreviewVisible ? 'opacity-100' : 'opacity-0'}
                    `}
                >
                    ✨ {gemPreviewText}
                </div>
            )}

            {/* The Dot */}
            <button
                onClick={onClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className={`
                    refiner-dot relative w-[10px] h-[10px] rounded-full
                    transition-all duration-300 ease-out cursor-pointer
                    focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:ring-offset-2 focus:ring-offset-surface
                    ${dotState === 'active'
                        ? 'bg-white/90 border border-black/20 shadow-[0_0_4px_rgba(255,255,255,0.5)]'
                        : 'bg-white/30 border border-black/10'
                    }
                    ${isActive ? 'ring-2 ring-brand-500/60' : ''}
                `}
                title={hasGem ? refiner.gem!.insight : "View enhanced synthesis"}
                aria-label={hasGem ? "View gem insight" : "View synthesis+"}
            />

            {/* Hover Tooltip */}
            {hovering && hasGem && !gemPreviewVisible && (
                <div
                    className="
                        absolute bottom-full right-0 mb-2 
                        bg-surface-raised border border-border-subtle 
                        rounded-lg shadow-elevated px-3 py-2
                        text-xs text-text-primary max-w-[280px]
                        animate-in fade-in zoom-in-95 duration-150
                        z-50
                    "
                >
                    <div className="flex items-start gap-2">
                        <span className="text-sm flex-shrink-0">✨</span>
                        <span>{refiner!.gem!.insight}</span>
                    </div>
                    {refiner!.gem!.source && (
                        <div className="text-text-muted mt-1 text-[10px]">
                            Source: {refiner!.gem!.source}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// Also export for backwards compatibility during migration
export const TrustIcon = RefinerDot;

export default RefinerDot;
