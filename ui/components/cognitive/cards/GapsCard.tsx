import React from "react";
import { MapperArtifact } from "../../../../shared/contract";

interface GapsCardProps {
    artifact: MapperArtifact;
}

const truncate = (text: string, maxLen: number): string =>
    text.length <= maxLen ? text : `${text.slice(0, Math.max(0, maxLen - 1))}…`;

export const GapsCard: React.FC<GapsCardProps> = ({ artifact }) => {
    const ghosts = Array.isArray(artifact.ghosts) ? artifact.ghosts : [];
    if (!ghosts.length) return null;

    return (
        <div className="bg-surface-raised border border-amber-500/20 rounded-xl overflow-hidden transition-all duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-lg shadow-inner">
                        🔶
                    </div>
                    <div>
                        <h3 className="font-semibold text-text-primary">What The Map Couldn't Cover</h3>
                        <p className="text-xs text-text-muted">
                            {ghosts.length} ghost{ghosts.length !== 1 ? "s" : ""}
                        </p>
                    </div>
                </div>
            </div>

            <div className="px-4 pb-4 pt-4 space-y-3">
                {ghosts.map((ghost, idx) => (
                    <div
                        key={idx}
                        className="bg-surface-base border border-border-subtle rounded-lg p-3"
                    >
                        <div className="text-sm text-text-primary leading-relaxed font-medium">
                            {truncate(ghost, 320)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
