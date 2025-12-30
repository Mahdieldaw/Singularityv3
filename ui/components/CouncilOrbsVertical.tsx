import React, { useState, useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { activeSplitPanelAtom, providerEffectiveStateFamily, turnsMapAtom } from "../state/atoms";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import type { AiTurn } from "../types";
import { useRefinerOutput } from "../hooks/useRefinerOutput";
import clsx from "clsx";

interface CouncilOrbsVerticalProps {
    // We need to know which turn is active in the right panel to show the correct states
    // But this component sits on the global divider.
    // It should probably reflect the *active* panel's turn.
}

export const CouncilOrbsVertical: React.FC<CouncilOrbsVerticalProps> = React.memo(() => {
    const activePanel = useAtomValue(activeSplitPanelAtom);
    const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
    const [hoveredOrb, setHoveredOrb] = useState<string | null>(null);
    const turnsMap = useAtomValue(turnsMapAtom);

    if (!activePanel) return null;

    const { turnId, providerId: activeProviderId } = activePanel;
    const turn = turnsMap.get(turnId);
    const { output: refinerOutput } = useRefinerOutput(turnId);

    // Filter out system provider
    const allProviders = LLM_PROVIDERS_CONFIG.filter(p => p.id !== 'system');

    // Determine contributing providers
    const contributingIds = useMemo(() => {
        if (!turn || turn.type !== 'ai') return [];
        const aiTurn = turn as unknown as AiTurn; // Safe cast since we checked type === 'ai'
        const batchKeys = Object.keys(aiTurn.batchResponses || {});
        const mapperKey = aiTurn.meta?.mapper;
        return Array.from(new Set([
            ...batchKeys,
            ...(mapperKey ? [mapperKey] : []),
        ]));
    }, [turn]);

    // Filter display providers to only those that contributed
    const displayProviders = allProviders.filter(p => contributingIds.includes(String(p.id)));

    const showTrustButton = !!(refinerOutput?.gem || refinerOutput?.trustInsights);
    const isTrustActive = activeProviderId === '__trust__';
    const middleIndex = Math.max(0, Math.floor(displayProviders.length / 2));

    return (
        <div className="flex flex-col items-center gap-3 py-4 w-full">
            {displayProviders.map((p, idx) => {
                const pid = String(p.id);
                const isActive = pid === activeProviderId;

                const orbElement = (
                    <VerticalOrb
                        key={pid}
                        turnId={turnId}
                        provider={p}
                        isActive={isActive}
                        onClick={() => setActiveSplitPanel({ turnId, providerId: pid })}
                        onHover={setHoveredOrb}
                        hoveredOrb={hoveredOrb}
                    />
                );

                if (showTrustButton && idx === middleIndex) {
                    return (
                        <React.Fragment key={pid}>
                            <button
                                onClick={() => setActiveSplitPanel({ turnId, providerId: '__trust__' })}
                                className={clsx(
                                    "flex items-center justify-center w-6 h-6 rounded-full transition-all duration-300 shrink-0",
                                    isTrustActive
                                        ? "bg-brand-500 shadow-glow-brand-soft ring-2 ring-brand-400"
                                        : "bg-surface-raised border border-border-subtle hover:bg-surface-highlight hover:scale-110"
                                )}
                                title="Trust Pane (Epistemic Audit)"
                            >
                                <span className={clsx("text-[10px]", isTrustActive ? "text-white" : "text-brand-400")}>
                                    💎
                                </span>
                            </button>
                            {orbElement}
                        </React.Fragment>
                    );
                }

                return orbElement;
            })}

            {/* Fallback if no providers but trust button should show */}
            {displayProviders.length === 0 && showTrustButton && (
                <button
                    onClick={() => setActiveSplitPanel({ turnId, providerId: '__trust__' })}
                    className={clsx(
                        "flex items-center justify-center w-6 h-6 rounded-full transition-all duration-300",
                        isTrustActive
                            ? "bg-brand-500 shadow-glow-brand-soft ring-2 ring-brand-400"
                            : "bg-surface-raised border border-border-subtle hover:bg-surface-highlight hover:scale-110"
                    )}
                    title="Trust Pane (Epistemic Audit)"
                >
                    <span className={clsx("text-[10px]", isTrustActive ? "text-white" : "text-brand-400")}>
                        💎
                    </span>
                </button>
            )}
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
