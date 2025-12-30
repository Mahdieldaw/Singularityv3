import React, { useState } from 'react';
import { LLM_PROVIDERS_CONFIG } from '../constants';
import clsx from 'clsx';

interface PipelineErrorBannerProps {
    type: 'mapping' | 'refiner' | 'antagonist';
    failedProviderId: string;
    onRetry: (pid: string) => void;
    onExplore?: () => void;
    onContinue?: () => void;
    compact?: boolean;
}

export const PipelineErrorBanner: React.FC<PipelineErrorBannerProps> = ({
    type,
    failedProviderId,
    onRetry,
    onExplore,
    onContinue,
    compact = false,
}) => {
    const [showDropdown, setShowDropdown] = useState(false);

    const getTitle = () => {
        switch (type) {
            case 'mapping': return 'Mapping unavailable';
            case 'refiner': return 'Enhancement unavailable';
            case 'antagonist': return 'Context refinement unavailable';
            default: return 'Step unavailable';
        }
    };

    const getDescription = () => {
        switch (type) {
            case 'mapping': return 'Advanced insights require a successful cross-reference of multiple sources.';
            case 'refiner': return 'We couldn\'t generate additional insights or actions for this response.';
            case 'antagonist': return 'Prompt refinement and context checking are currently unavailable.';
            default: return 'An error occurred during this pipeline step.';
        }
    };

    const getIcon = () => {
        switch (type) {
            case 'mapping': return '📊';
            case 'refiner': return '💎';
            case 'antagonist': return '💭';
            default: return '⚠️';
        }
    };

    const failedModelName = LLM_PROVIDERS_CONFIG.find(p => p.id === failedProviderId)?.name || failedProviderId;

    return (
        <div className={clsx(
            "relative z-10 flex flex-col gap-3 p-4 rounded-xl border transition-all animate-in fade-in slide-in-from-top-2 duration-300",
            compact ? "bg-surface-raised/50 border-border-subtle/50" : "bg-intent-warning/5 border-intent-warning/20 shadow-sm"
        )}>
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-surface-raised border border-border-subtle flex items-center justify-center text-lg">
                    {getIcon()}
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-text-primary m-0 flex items-center gap-2">
                        {getTitle()}
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-intent-danger/10 text-intent-danger font-bold border border-intent-danger/20">
                            Failed
                        </span>
                    </h4>
                    {!compact && (
                        <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                            {getDescription()}
                        </p>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-1">
                <button
                    onClick={() => onRetry(failedProviderId)}
                    className="px-3 py-1.5 rounded-lg bg-surface-raised border border-border-subtle text-xs font-medium text-text-primary hover:bg-surface-highlight transition-all flex items-center gap-1.5"
                >
                    <span>🔄</span> Retry {failedModelName}
                </button>

                <div className="relative">
                    <button
                        onClick={() => setShowDropdown(!showDropdown)}
                        className="px-3 py-1.5 rounded-lg bg-surface-raised border border-border-subtle text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-highlight transition-all flex items-center gap-1"
                    >
                        Try different model <span className={clsx("transition-transform", showDropdown && "rotate-180")}>▾</span>
                    </button>

                    {showDropdown && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                            <div className="absolute bottom-full left-0 mb-2 w-48 bg-surface-raised border border-border-subtle rounded-xl shadow-elevated p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                                <div className="text-[10px] text-text-muted px-2 py-1 font-medium uppercase tracking-wider border-b border-border-subtle/30 mb-1">Select Model</div>
                                <div className="max-h-48 overflow-y-auto no-scrollbar">
                                    {LLM_PROVIDERS_CONFIG.filter(p => p.id !== failedProviderId).map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => {
                                                onRetry(p.id);
                                                setShowDropdown(false);
                                            }}
                                            className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-surface-highlight text-text-secondary hover:text-text-primary flex items-center gap-2 transition-colors"
                                        >
                                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || '#ccc' }} />
                                            {p.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {onExplore && (
                    <button
                        onClick={onExplore}
                        className="px-3 py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20 text-xs font-medium text-brand-400 hover:bg-brand-500/20 transition-all flex items-center gap-1.5"
                    >
                        <span>📊</span> Explore map
                    </button>
                )}

                {onContinue && (
                    <button
                        onClick={onContinue}
                        className="px-3 py-1.5 rounded-lg bg-surface-raised border border-border-subtle text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-highlight transition-all"
                    >
                        Continue with raw responses
                    </button>
                )}
            </div>
        </div>
    );
};
