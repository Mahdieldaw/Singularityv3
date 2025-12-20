import React from 'react';
import { Signal } from '../../../shared/parsing-utils';
import { getSignalLabel, getSignalPriorityClasses } from '../../utils/signalUtils';

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
                <div className="min-w-0 flex flex-col gap-1">
                    <div className="text-xs font-medium text-text-primary truncate">
                        {signal.content}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-text-muted">
                        {signal.source && (
                            <span className="truncate">{signal.source}</span>
                        )}
                        {label && (
                            <span className={`px-1.5 py-0.5 rounded-full bg-surface-highlight whitespace-nowrap ${text}`}>
                                {label}
                            </span>
                        )}
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
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary leading-relaxed">
                        {signal.content}
                    </div>
                </div>
                {label && (
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-highlight text-text-muted whitespace-nowrap ${text}`}>
                        {label}
                    </span>
                )}
            </div>

            {signal.source && (
                <div className="text-xs text-text-secondary">
                    {signal.source}
                </div>
            )}

            {signal.impact && (
                <div className="text-xs text-text-muted">
                    {`→ ${signal.impact}`}
                </div>
            )}
        </div>
    );
};

export default SignalCard;
