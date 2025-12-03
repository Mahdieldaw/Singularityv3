import React, { useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { activeSplitPanelAtom, providerEffectiveStateFamily } from "../state/atoms";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import clsx from "clsx";

interface CouncilOrbsVerticalProps {
    // We need to know which turn is active in the right panel to show the correct states
    // But this component sits on the global divider.
    // It should probably reflect the *active* panel's turn.
}

export const CouncilOrbsVertical: React.FC<CouncilOrbsVerticalProps> = React.memo(() => {
    const activePanel = useAtomValue(activeSplitPanelAtom);
    const setActivePanel = useSetAtom(activeSplitPanelAtom);
    const [hoveredOrb, setHoveredOrb] = useState<string | null>(null);

    if (!activePanel) return null;

    const { turnId, providerId: activeProviderId } = activePanel;

    // Filter out system provider
    const displayProviders = LLM_PROVIDERS_CONFIG.filter(p => p.id !== 'system');

    return (
        <div className="flex flex-col items-center gap-3 py-4 w-full">
            {displayProviders.map((p) => {
                const pid = String(p.id);
                const isActive = pid === activeProviderId;

                return (
                    <VerticalOrb
                        key={pid}
                        turnId={turnId}
                        provider={p}
                        isActive={isActive}
                        onClick={() => setActivePanel({ turnId, providerId: pid })}
                        onHover={setHoveredOrb}
                        hoveredOrb={hoveredOrb}
                    />
                );
            })}
        </div>
    );
});

interface VerticalOrbProps {
    turnId: string;
    provider: any;
    isActive: boolean;
    onClick: () => void;
    onHover: (id: string | null) => void;
    hoveredOrb: string | null;
}

const VerticalOrb: React.FC<VerticalOrbProps> = ({
    turnId,
    provider,
    isActive,
    onClick,
    onHover,
    hoveredOrb
}) => {
    const pid = String(provider.id);
    const state = useAtomValue(providerEffectiveStateFamily({ turnId, providerId: pid }));

    const isStreaming = state.latestResponse?.status === 'streaming';
    const hasError = state.latestResponse?.status === 'error';
    const isHovered = hoveredOrb === pid;

    return (
        <div className="relative flex items-center justify-center w-full">
            <button
                type="button"
                className={clsx(
                    "rounded-full transition-all duration-200 relative",
                    isActive ? "w-4 h-4 opacity-100 ring-2 ring-brand-500 ring-offset-2 ring-offset-surface-raised" : "w-2 h-2 opacity-40 hover:opacity-80 hover:scale-125",
                    hasError ? "bg-intent-danger" : "bg-text-secondary",
                    isStreaming && "animate-pulse bg-intent-warning"
                )}
                style={{ backgroundColor: isActive ? provider.color : undefined }}
                onMouseEnter={() => onHover(pid)}
                onMouseLeave={() => onHover(null)}
                onClick={onClick}
            />

            {/* Tooltip (Left side for vertical bar) */}
            {isHovered && (
                <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap z-50 pointer-events-none">
                    <div className="bg-surface-raised border border-border-subtle text-text-primary text-xs px-2 py-1 rounded shadow-lg">
                        {provider.name}
                    </div>
                </div>
            )}
        </div>
    );
};
