/**
 * NextStepFooter - Replaces BottomLineCard with cleaner next step display.
 * 
 * Shows:
 * - Action verb (Proceed/Verify/Reframe/Research) in bold
 * - Target description
 * - Why explanation
 */

import React from 'react';
import { NextStepAction } from '../../../shared/parsing-utils';

export interface NextStepFooterProps {
    nextStep: {
        action: NextStepAction;
        target: string;
        why: string;
    } | null;
    isLoading?: boolean;
}

const ACTION_LABELS: Record<NextStepAction, string> = {
    proceed: 'Proceed',
    verify: 'Verify',
    reframe: 'Reframe',
    research: 'Research'
};

const ACTION_ICONS: Record<NextStepAction, string> = {
    proceed: '→',
    verify: '🔍',
    reframe: '🔄',
    research: '📚'
};

export const NextStepFooter: React.FC<NextStepFooterProps> = ({
    nextStep,
    isLoading = false
}) => {
    if (isLoading) {
        return (
            <div className="bg-surface-highlight/40 border-l-4 border-brand-400 rounded-r-lg p-4 mt-4">
                <div className="flex items-center gap-2 text-text-muted animate-pulse">
                    <span className="text-lg">→</span>
                    <span className="text-sm">...</span>
                </div>
            </div>
        );
    }

    if (!nextStep) {
        return null;
    }

    const { action, target, why } = nextStep;
    const icon = ACTION_ICONS[action] || '→';
    const label = ACTION_LABELS[action] || action;

    return (
        <div className="bg-surface-highlight/40 border-l-4 border-brand-400 rounded-r-lg p-4 mt-4">
            <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0 text-brand-400">{icon}</span>
                <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary">
                        <span className="font-bold text-text-primary">{label}:</span>{' '}
                        <span>{target}</span>
                    </div>
                    {why && (
                        <p className="text-xs text-text-muted mt-1 leading-relaxed">
                            {why}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NextStepFooter;
