/**
 * SectionHeader.tsx
 * 
 * Section dividers for dimension-first view
 */

import React from 'react';

interface SectionHeaderProps {
    icon: string;
    title: string;
    count: number;
    subtitle?: string;
    variant: "gap" | "contested" | "settled";
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
    icon,
    title,
    count,
    subtitle,
    variant
}) => {
    const borderColor = {
        gap: 'border-amber-500/30',
        contested: 'border-red-500/30',
        settled: 'border-emerald-500/30',
    }[variant];

    const textColor = {
        gap: 'text-amber-400',
        contested: 'text-red-400',
        settled: 'text-emerald-400',
    }[variant];

    return (
        <div className={`flex items-center gap-2 py-2 border-b ${borderColor} mb-3`}>
            <span className="text-lg">{icon}</span>
            <span className={`font-medium ${textColor}`}>{title}</span>
            <span className="text-white/40">({count})</span>
            {subtitle && (
                <span className="text-xs text-white/30 ml-auto">{subtitle}</span>
            )}
        </div>
    );
};
