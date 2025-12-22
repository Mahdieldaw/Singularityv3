// ui/components/refinerui/RefinerDot.tsx
// Replaces TrustIcon with a simple dot UI following the new paradigm

import React, { useState, useCallback } from 'react';
import type { RefinerOutput } from '../../../shared/parsing-utils';
import { shortenInsight } from '../../utils/refiner-helpers';

interface RefinerDotProps {
    refiner: RefinerOutput | null;
    onClick: () => void;
    isActive?: boolean;
    isLoading?: boolean;
}

type DotState = 'pending' | 'loading' | 'complete_no_gem' | 'active';

function getDotState(isLoading: boolean | undefined, refiner: RefinerOutput | null): DotState {
    if (isLoading && !refiner) return 'loading';
    if (refiner?.gem) return 'active';
    if (refiner) return 'complete_no_gem';
    if (isLoading) return 'loading';
    return 'pending';
}

export const RefinerDot: React.FC<RefinerDotProps> = ({ refiner, onClick, isActive, isLoading }) => {
    const [hovering, setHovering] = useState(false);
    const dotState = getDotState(isLoading, refiner);
    const hasGem = refiner?.gem != null;

    const handleMouseEnter = useCallback(() => setHovering(true), []);
    const handleMouseLeave = useCallback(() => setHovering(false), []);

    return (
        <div className="refiner-dot-container relative flex items-center gap-2">
            <button
                onClick={onClick}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                className={`
                    refiner-dot relative w-6 h-6 rounded-full flex items-center justify-center text-[10px]
                    transition-all duration-300 ease-out cursor-pointer
                    focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:ring-offset-2 focus:ring-offset-surface
                    ${dotState === 'active'
                        ? 'bg-white/90 border border-black/20 shadow-[0_0_10px_rgba(255,255,255,0.7)]'
                        : dotState === 'complete_no_gem'
                            ? 'bg-white/50 border border-black/15 shadow-[0_0_6px_rgba(255,255,255,0.5)]'
                            : dotState === 'loading'
                                ? 'bg-white/40 border border-black/10 animate-pulse'
                                : 'bg-white/20 border border-black/10'
                    }
                    ${isActive ? 'ring-2 ring-brand-500/60' : ''}
                `}
                aria-label={hasGem ? "View gem insight" : "View synthesis+"}
            >
                {hasGem ? (
                    <span className="pointer-events-none">💎</span>
                ) : (
                    <span className="pointer-events-none text-[9px] text-text-muted">◎</span>
                )}
            </button>
            {hovering && hasGem && (
                <div
                    className="
                        absolute top-full left-0 mt-2 
                        bg-surface-raised border border-border-subtle 
                        rounded-lg shadow-elevated px-3 py-2
                        text-xs text-text-primary max-w-[280px]
                        animate-in fade-in zoom-in-95 duration-150
                        z-50
                    "
                >
                    <div className="flex flex-col gap-1">
                        <div className="flex items-start gap-2">
                            <span className="text-sm flex-shrink-0">💎</span>
                            <span>{shortenInsight(refiner!.gem!.insight)}</span>
                        </div>
                        {refiner!.gem!.impact && (
                            <div className="text-[11px] text-text-secondary mt-0.5">
                                {refiner!.gem!.impact}
                            </div>
                        )}
                        {refiner!.gem!.source && (
                            <div className="mt-1">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-chip text-[10px] text-text-muted">
                                    {refiner!.gem!.source}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// Also export for backwards compatibility during migration
export const TrustIcon = RefinerDot;

export default RefinerDot;
