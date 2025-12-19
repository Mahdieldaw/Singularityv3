/**
 * SignalCard - Renders a signal with priority-based styling.
 * 
 * Styling by priority:
 * - blocker: Red background/border
 * - risk: Amber background/border
 * - enhancement: Blue background/border
 * 
 * Icon by type:
 * - divergence: ⚠️ "AI models disagreed"
 * - overclaim: ⚠️ "May be overstated"
 * - gap: 💡 "Context dropped"
 * - blindspot: 🕳️ "Not addressed"
 */

import React from 'react';
import { Signal } from '../../../shared/parsing-utils';
import { getSignalIcon, getSignalLabel, getSignalPriorityClasses } from '../../utils/signalUtils';

export interface SignalCardProps {
    signal: Signal;
    variant?: 'full' | 'compact';
    onClick?: () => void;
}

export const SignalCard: React.FC<SignalCardProps> = ({
    signal,
    variant = 'full',
    onClick
}) => {
    const { background, border, text } = getSignalPriorityClasses(signal.priority);
    const icon = getSignalIcon(signal.type);
    const label = getSignalLabel(signal.type);

    if (variant === 'compact') {
        return (
            <button
                onClick={onClick}
                className={`
                    flex items-start gap-2 p-2 rounded-lg border text-left
                    transition-all hover:scale-[1.02] cursor-pointer
                    ${background} ${border}
                `}
                title={signal.content}
            >
                <span className="flex-shrink-0 text-sm">{icon}</span>
                <div className="min-w-0">
                    <div className={`text-xs font-medium ${text} truncate`}>
                        {label}
                    </div>
                    <div className="text-[11px] text-text-secondary line-clamp-2">
                        {signal.content}
                    </div>
                </div>
            </button>
        );
    }

    return (
        <div
            onClick={onClick}
            className={`
                flex flex-col gap-2 p-3 rounded-xl border
                ${onClick ? 'cursor-pointer hover:scale-[1.01] transition-all' : ''}
                ${background} ${border}
            `}
        >
            {/* Header */}
            <div className="flex items-center gap-2">
                <span className="text-base">{icon}</span>
                <span className={`text-xs font-semibold uppercase tracking-wide ${text}`}>
                    {label}
                </span>
            </div>

            {/* Content */}
            <p className="text-sm text-text-primary leading-relaxed">
                {signal.content}
            </p>

            {/* Meta: Source & Impact */}
            {(signal.source || signal.impact) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted mt-1">
                    {signal.source && (
                        <span>
                            <span className="opacity-60">Source:</span>{' '}
                            <span className="text-text-secondary">{signal.source}</span>
                        </span>
                    )}
                    {signal.impact && (
                        <span>
                            <span className="opacity-60">Impact:</span>{' '}
                            <span className="text-text-secondary">{signal.impact}</span>
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

export default SignalCard;
