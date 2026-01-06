/**
 * SectionHeader.tsx
 * 
 * Section dividers for dimension-first view
 */

import React from 'react';

interface SectionHeaderProps {
    icon: string;
    title: string;
    count?: number;
    subtitle?: string;
    variant?: "gap" | "contested" | "settled" | "default";
    onAction?: () => void;
    actionLabel?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
    icon,
    title,
    count,
    subtitle,
    variant = "default",
    onAction,
    actionLabel
}) => {
    const borderColor = {
        gap: 'border-amber-500/30',
        contested: 'border-red-500/30',
        settled: 'border-emerald-500/30',
        default: 'border-brand-500/30',
    }[variant];

    const textColor = {
        gap: 'text-amber-400',
        contested: 'text-red-400',
        settled: 'text-emerald-400',
        default: 'text-brand-400',
    }[variant];

    return (
        <div className={`flex items-center gap-2 py-2 border-b ${borderColor} mb-3`}>
            <span className="text-lg">{icon}</span>
            <span className={`font-medium ${textColor}`}>{title}</span>
            {count !== undefined && <span className="text-white/40">({count})</span>}
            {subtitle && (
                <span className="text-xs text-white/30 ml-auto mr-2">{subtitle}</span>
            )}
            {onAction && actionLabel && (
                <button
                    onClick={onAction}
                    className="ml-auto text-xs px-2 py-1 rounded bg-surface-highlight hover:bg-surface-raised border border-border-subtle transition-colors"
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );
};
