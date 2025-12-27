import React from "react";
// import { CopyButton } from "../../CopyButton"; // Assuming this might be needed, though standard copy is often enough

interface GhostCardProps {
    ghost: string;
}

export const GhostCard: React.FC<GhostCardProps> = ({ ghost }) => {
    if (!ghost) return null;

    return (
        <div className="mt-3 bg-surface-base/50 border border-border-subtle/50 rounded-xl p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-surface-highlight/50 flex items-center justify-center text-lg grayscale opacity-70">
                👻
            </div>
            <div className="flex-1">
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">The Ghost</h3>
                <p className="text-sm text-text-secondary italic leading-relaxed">
                    "{ghost}"
                </p>
            </div>
        </div>
    );
};
