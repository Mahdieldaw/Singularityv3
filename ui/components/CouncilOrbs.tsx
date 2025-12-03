import React, { useState, useCallback } from "react";
import { useAtomValue } from "jotai";
import { providerEffectiveStateFamily, isSplitOpenAtom } from "../state/atoms";
import { LLMProvider } from "../types";
import { PROVIDER_COLORS } from "../constants";
import { getProviderById } from "../providers/providerRegistry";
import clsx from "clsx";

interface CouncilOrbsProps {
    turnId: string;
    providers: LLMProvider[];
    voiceProviderId: string; // The active synthesizer (Crown)
    onOrbClick: (providerId: string) => void;
    onCrownMove: (providerId: string) => void;
    onTrayExpand: () => void;
    isTrayExpanded: boolean;
    variant?: "tray" | "divider" | "historical"; // NEW: variant support
}

export const CouncilOrbs: React.FC<CouncilOrbsProps> = React.memo(({
    turnId,
    providers,
    voiceProviderId,
    onOrbClick,
    onCrownMove,
    onTrayExpand,
    isTrayExpanded,
    variant = "tray" // Default to tray variant
}) => {
    const [hoveredOrb, setHoveredOrb] = useState<string | null>(null);
    const [isCrownMode, setIsCrownMode] = useState(false);
    const isSplitOpen = useAtomValue(isSplitOpenAtom);

    // Filter out system provider if present
    const displayProviders = providers.filter(p => p.id !== 'system');

    const handleOrbClickInternal = (e: React.MouseEvent, providerId: string) => {
        e.stopPropagation();

        if (isCrownMode) {
            onCrownMove(providerId);
            setIsCrownMode(false);
        } else {
            onOrbClick(providerId);
        }
    };

    const handleCrownClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsCrownMode(!isCrownMode);
    };

    // Determine if this should be dimmed (historical variant when split is open)
    const shouldDim = variant === "historical" && isSplitOpen;

    return (
        <div
            className={clsx(
                "council-tray relative mx-auto mt-4 transition-all duration-300 ease-out",
                "bg-surface-raised border border-border-subtle rounded-full",
                "flex items-center justify-center gap-4 px-6 py-2",
                "cursor-pointer hover:bg-surface-highlight hover:shadow-md",
                isTrayExpanded ? "opacity-0 pointer-events-none h-0 py-0 overflow-hidden" : "opacity-100 h-auto",
                variant === "tray" && "council-tray",
                variant === "divider" && "council-divider",
                variant === "historical" && "council-historical",
                shouldDim && "council-historical-dimmed"
            )}
            onClick={onTrayExpand}
        >
            {displayProviders.map((p) => {
                const pid = String(p.id);
                const isVoice = pid === voiceProviderId;

                return (
                    <Orb
                        key={pid}
                        turnId={turnId}
                        provider={p}
                        isVoice={isVoice}
                        isCrownMode={isCrownMode}
                        onHover={setHoveredOrb}
                        onClick={(e) => handleOrbClickInternal(e, pid)}
                        onCrownClick={handleCrownClick}
                        hoveredOrb={hoveredOrb}
                        variant={variant}
                    />
                );
            })}

            {/* Crown Mode Indicator */}
            {isCrownMode && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-raised border border-brand-500 text-brand-500 text-xs px-2 py-1 rounded-md shadow-sm animate-bounce">
                    Select new voice
                </div>
            )}
        </div>
    );
});

interface OrbProps {
    turnId: string;
    provider: LLMProvider;
    isVoice: boolean;
    isCrownMode: boolean;
    onHover: (id: string | null) => void;
    onClick: (e: React.MouseEvent) => void;
    onCrownClick: (e: React.MouseEvent) => void;
    hoveredOrb: string | null;
    variant?: "tray" | "divider" | "historical";
}

const Orb: React.FC<OrbProps> = ({
    turnId,
    provider,
    isVoice,
    isCrownMode,
    onHover,
    onClick,
    onCrownClick,
    hoveredOrb,
    variant = "tray"
}) => {
    const pid = String(provider.id);
    const state = useAtomValue(providerEffectiveStateFamily({ turnId, providerId: pid }));

    const isStreaming = state.latestResponse?.status === 'streaming';
    const hasError = state.latestResponse?.status === 'error';
    const isHovered = hoveredOrb === pid;

    // Get model color and logo
    const modelColor = PROVIDER_COLORS[pid] || PROVIDER_COLORS['default'];
    const providerConfig = getProviderById(pid);
    const logoSrc = providerConfig?.logoSrc || '';

    return (
        <div className="relative flex items-center justify-center">
            {/* Crown Icon for Voice Provider */}
            {isVoice && (
                <div
                    className={clsx(
                        "absolute -top-3 z-10 text-[10px] transition-all cursor-pointer hover:scale-125",
                        isCrownMode ? "text-brand-500 scale-125 animate-pulse" : "text-amber-400"
                    )}
                    onClick={onCrownClick}
                    title="Current Voice (Click to change)"
                >
                    👑
                </div>
            )}

            <button
                type="button"
                className={clsx(
                    "council-orb",
                    // Size & Base Style (Tailwind)
                    isVoice ? "opacity-100" : "opacity-70 hover:opacity-100",
                    isVoice && "council-orb-voice",
                    isStreaming && "council-orb-streaming",
                    hasError && "council-orb-error",
                    // Crown Mode Selection Target
                    isCrownMode && !isVoice && "ring-2 ring-brand-500/50 ring-offset-1 ring-offset-surface cursor-crosshair animate-pulse"
                )}
                style={{
                    '--model-color': modelColor,
                    '--rotation': `${Math.random() * 360}deg`,
                    '--logo-src': logoSrc ? `url(${logoSrc})` : 'none'
                } as React.CSSProperties}
                onMouseEnter={() => onHover(pid)}
                onMouseLeave={() => onHover(null)}
                onClick={onClick}
            />

            {/* Tooltip */}
            {isHovered && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap z-20">
                    <div className="bg-surface-raised border border-border-subtle text-text-primary text-xs px-2 py-1 rounded shadow-lg">
                        {provider.name}
                        {state.latestResponse?.status === 'streaming' && " (Generating...)"}
                        {state.latestResponse?.status === 'error' && " (Error)"}
                    </div>
                </div>
            )}
        </div>
    );
};
