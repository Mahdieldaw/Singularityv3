
import React from 'react';
import { CognitiveViewMode } from '../../types';
import { motion } from 'framer-motion';

interface TransitionBarProps {
    activeMode: CognitiveViewMode;
    onModeChange: (mode: CognitiveViewMode) => void;
    availableModes: CognitiveViewMode[];
    isLoading?: boolean;
}

const TransitionBar: React.FC<TransitionBarProps> = ({
    activeMode,
    onModeChange,
    availableModes,
    isLoading
}) => {
    // Labels and Icons
    const modeConfigs: Record<CognitiveViewMode, { label: string; emoji: string }> = {
        artifact: { label: 'Landscape', emoji: '🗺️' },
        understand: { label: 'Understand', emoji: '🧠' },
        gauntlet: { label: 'Decide', emoji: '⚖️' },
        singularity: { label: 'Singularity', emoji: '🌌' }
    };

    return (
        <div className="flex items-center gap-1 p-1 bg-surface-highlight/30 rounded-lg border border-border-subtle w-fit mb-4">
            {availableModes.map((mode) => {
                const isActive = activeMode === mode;
                const config = modeConfigs[mode];

                return (
                    <button
                        key={mode}
                        onClick={() => onModeChange(mode)}
                        disabled={isLoading && mode !== activeMode}
                        className={`
                            relative flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                            ${isActive
                                ? 'text-text-primary'
                                : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-highlight/50'}
                            ${isLoading && mode !== activeMode ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                    >
                        {isActive && (
                            <motion.div
                                layoutId="active-mode-pill"
                                className="absolute inset-0 bg-surface-base border border-border-subtle shadow-sm rounded-md"
                                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                            />
                        )}
                        <span className="relative z-10">{config.emoji}</span>
                        <span className="relative z-10">{config.label}</span>
                        {isLoading && mode === activeMode && (
                            <span className="relative z-10 w-2 h-2 rounded-full bg-accent-primary animate-pulse ml-1" />
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default TransitionBar;
