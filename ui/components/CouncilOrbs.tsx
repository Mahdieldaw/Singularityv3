import React, { useState, useCallback, useMemo, useRef } from "react";
import { useAtom, useAtomValue } from "jotai";
import { providerEffectiveStateFamily, isSplitOpenAtom, synthesisProviderAtom, mappingProviderAtom, composerModelAtom, analystModelAtom, providerAuthStatusAtom, selectedModelsAtom } from "../state/atoms";
import { LLMProvider } from "../types";
import { PROVIDER_COLORS } from "../constants";
import { getProviderById } from "../providers/providerRegistry";
import { setProviderLock } from "@shared/provider-locks";
import clsx from "clsx";

interface CouncilOrbsProps {
    turnId: string;
    providers: LLMProvider[];
    voiceProviderId: string; // The active synthesizer (Crown)
    onOrbClick: (providerId: string) => void;
    onCrownMove: (providerId: string) => void;
    onTrayExpand: () => void;
    isTrayExpanded: boolean;
    visibleProviderIds?: string[]; // Optional filter for visible orbs
    variant?: "tray" | "divider" | "welcome" | "historical";
    isEditMode?: boolean; // When true, auto-open the model selection menu
}

export const CouncilOrbs: React.FC<CouncilOrbsProps> = React.memo(({
    turnId,
    providers,
    voiceProviderId,
    onOrbClick,
    onCrownMove,
    onTrayExpand,
    isTrayExpanded,
    variant = "tray",
    visibleProviderIds,
    isEditMode = false
}) => {
    const [hoveredOrb, setHoveredOrb] = useState<string | null>(null);
    const [isCrownMode, setIsCrownMode] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [menuTarget, setMenuTarget] = useState<string | null>(null);
    const longPressRef = useRef<any>(null);
    const isSplitOpen = useAtomValue(isSplitOpenAtom);
    const authStatus = useAtomValue(providerAuthStatusAtom);
    const [synthesisProvider, setSynthesisProvider] = useAtom(synthesisProviderAtom);
    const [mapProviderVal, setMapProvider] = useAtom(mappingProviderAtom);
    const [composerVal, setComposer] = useAtom(composerModelAtom);
    const [analystVal, setAnalyst] = useAtom(analystModelAtom);
    const [selectedModels, setSelectedModels] = useAtom(selectedModelsAtom);
    const containerRef = useRef<HTMLDivElement>(null);

    // Click Outside Listener
    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isMenuOpen && containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMenuOpen]);

    // Auto-open menu when isEditMode becomes true (triggered by next-turn arrow button)
    React.useEffect(() => {
        if (isEditMode) {
            setIsMenuOpen(true);
            setMenuTarget(voiceProviderId); // Open menu for the voice provider
        } else {
            // Close menu when edit mode ends
            setIsMenuOpen(false);
            setMenuTarget(null);
        }
    }, [isEditMode, voiceProviderId]);

    // Filter out system provider if present
    const allProviders = useMemo(() => {
        return providers.filter(p => p.id !== 'system');
    }, [providers]);

    // displayProviders is used for orbs - can be filtered by visibleProviderIds
    const displayProviders = useMemo(() => {
        let filtered = allProviders;
        if (visibleProviderIds) {
            filtered = filtered.filter(p => visibleProviderIds.includes(String(p.id)));
        }
        return filtered;
    }, [allProviders, visibleProviderIds]);

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

    // Priority ranking for orb placement (closest to voice = highest priority)
    const PRIORITY_ORDER = ['claude', 'gemini-exp', 'qwen', 'gemini-pro', 'chatgpt', 'gemini'];

    const getPriority = (providerId: string) => {
        const index = PRIORITY_ORDER.indexOf(providerId);
        return index === -1 ? 999 : index; // Unknown providers go to the end
    };

    // Separate voice and non-voice providers
    const voiceProviderObj = displayProviders.find(p => String(p.id) === voiceProviderId);
    const otherProviders = displayProviders
        .filter(p => String(p.id) !== voiceProviderId)
        .sort((a, b) => getPriority(String(a.id)) - getPriority(String(b.id)));

    // Distribute alternating left/right with highest priority closest to voice
    const leftOrbs: LLMProvider[] = [];
    const rightOrbs: LLMProvider[] = [];

    otherProviders.forEach((provider, index) => {
        if (index % 2 === 0) {
            // Even indices go to RIGHT (0, 2, 4... = highest, 3rd, 5th priority)
            rightOrbs.push(provider);
        } else {
            // Odd indices go to LEFT (1, 3, 5... = 2nd, 4th, 6th priority)
            leftOrbs.push(provider);
        }
    });

    // Reverse left array so highest priority is closest to center
    leftOrbs.reverse();

    // Determine if this tray should be dimmed when split is open
    const shouldDimInSplitMode = isSplitOpen && variant === "tray";

    const handleLongPressStart = (pid: string | null) => {
        if (longPressRef.current) clearTimeout(longPressRef.current);
        longPressRef.current = setTimeout(() => {
            setMenuTarget(pid);
            setIsMenuOpen(true);
        }, 500);
    };

    const handleLongPressCancel = () => {
        if (longPressRef.current) {
            clearTimeout(longPressRef.current);
            longPressRef.current = null;
        }
    };

    const handleSelectSynth = (pid: string) => {
        setSynthesisProvider(pid);
        setProviderLock('synthesis', true);
        // Keep menu open - only close on outside click
    };

    const handleSelectMap = (pid: string) => {
        setMapProvider(pid);
        setProviderLock('mapping', true);
        // Keep menu open - only close on outside click
    };

    const handleSelectComposer = (pid: string) => {
        setComposer(pid);
        // Composer lock not yet in shared config, leaving as is or removing if obsolete
        // Assuming we only care about synthesis/mapping for now as per plan
        try {
            localStorage.setItem('htos_composer_locked', 'true');
            chrome?.storage?.local?.set?.({ provider_lock_settings: { composer_locked: true } });
        } catch { }
        // Keep menu open - only close on outside click
    };

    const handleSelectAnalyst = (pid: string) => {
        setAnalyst(pid);
        // Analyst lock not yet in shared config
        try {
            localStorage.setItem('htos_analyst_locked', 'true');
            chrome?.storage?.local?.set?.({ provider_lock_settings: { analyst_locked: true } });
        } catch { }
        // Keep menu open - only close on outside click
    };

    return (
        <div
            className={clsx(
                "council-tray-container relative transition-all duration-300 ease-out",
                isTrayExpanded ? "opacity-0 pointer-events-none h-0 overflow-hidden" : "opacity-100",
                variant === "tray" && "council-tray",
                variant === "divider" && "council-divider",
                variant === "historical" && "council-historical",
                shouldDim && "council-historical-dimmed",
                shouldDimInSplitMode && "council-tray-dimmed-split"
            )}
            onMouseDown={() => handleLongPressStart(null)}
            onMouseUp={handleLongPressCancel}
            onMouseLeave={handleLongPressCancel}
            ref={containerRef}
        >
            {/* Orb bar with centered voice and fanned others */}
            <div className="council-orb-bar flex items-center justify-center relative" style={{ maxWidth: '480px', margin: '0 auto', height: '60px' }}>
                {/* Left side orbs - 40px gap from sacred zone, 28px between orbs */}
                <div className="flex items-center justify-end gap-[28px]" style={{ flex: 1, paddingRight: '40px' }}>
                    {leftOrbs.map((p) => {
                        const pid = String(p.id);
                        return (
                            <Orb
                                key={pid}
                                turnId={turnId}
                                provider={p}
                                isVoice={false}
                                isCrownMode={isCrownMode}
                                onHover={setHoveredOrb}
                                onClick={(e) => handleOrbClickInternal(e, pid)}
                                onCrownClick={handleCrownClick}
                                hoveredOrb={hoveredOrb}
                                variant={variant as any}
                                disabled={authStatus && authStatus[pid] === false}
                                onLongPressStart={() => handleLongPressStart(pid)}
                                onLongPressCancel={handleLongPressCancel}
                            />
                        );
                    })}
                </div>

                {/* CENTER: Voice Orb with Sacred Zone - 80px total */}
                <div
                    className={clsx(
                        "council-voice-zone relative flex items-center justify-center",
                        variant !== "divider" && "cursor-pointer"
                    )}
                    style={{ width: '80px', height: '80px', flexShrink: 0 }}
                    onClick={variant !== "divider" ? onTrayExpand : undefined}
                    onMouseDown={() => handleLongPressStart(String(voiceProviderId))}
                    onMouseUp={handleLongPressCancel}
                >
                    {/* Subtle glass ring indicator */}
                    <div className="council-glass-ring" />

                    {voiceProviderObj && (
                        <Orb
                            key={String(voiceProviderObj.id)}
                            turnId={turnId}
                            provider={voiceProviderObj}
                            isVoice={true}
                            isCrownMode={isCrownMode}
                            onHover={setHoveredOrb}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleOrbClickInternal(e, String(voiceProviderObj.id));
                            }}
                            onCrownClick={handleCrownClick}
                            hoveredOrb={hoveredOrb}
                            variant={variant as any}
                            onLongPressStart={() => handleLongPressStart(String(voiceProviderId))}
                            onLongPressCancel={handleLongPressCancel}
                            disabled={authStatus && authStatus[String(voiceProviderObj.id)] === false}
                        />
                    )}
                </div>

                {/* Right side orbs - 40px gap from sacred zone, 28px between orbs */}
                <div className="flex items-center justify-start gap-[28px]" style={{ flex: 1, paddingLeft: '40px' }}>
                    {rightOrbs.map((p) => {
                        const pid = String(p.id);
                        return (
                            <Orb
                                key={pid}
                                turnId={turnId}
                                provider={p}
                                isVoice={false}
                                isCrownMode={isCrownMode}
                                onHover={setHoveredOrb}
                                onClick={(e) => handleOrbClickInternal(e, pid)}
                                onCrownClick={handleCrownClick}
                                hoveredOrb={hoveredOrb}
                                variant={variant as any}
                                disabled={authStatus && authStatus[pid] === false}
                                onLongPressStart={() => handleLongPressStart(pid)}
                                onLongPressCancel={handleLongPressCancel}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Crown Mode Indicator */}
            {isCrownMode && (
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-surface-raised border border-brand-500 text-brand-500 text-xs px-2 py-1 rounded-md shadow-sm animate-bounce">
                    Select new voice
                </div>
            )}

            {isMenuOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-[72px] bg-surface-raised border border-border-subtle rounded-xl shadow-elevated p-3 z-[100] min-w-[640px]">
                    <div className="text-xs text-text-muted mb-2">Council Menu</div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-2 text-sm"><span>👑</span><span>Synthesizer</span></div>
                            <div className="flex flex-wrap gap-2">
                                {allProviders.map(p => {
                                    const pid = String(p.id);
                                    const selected = String(synthesisProvider || '') === pid;
                                    const isUnauthorized = authStatus && authStatus[pid] === false;
                                    return (
                                        <button
                                            key={`s-${pid}`}
                                            onClick={() => !isUnauthorized && handleSelectSynth(pid)}
                                            disabled={isUnauthorized}
                                            className={clsx("px-2 py-2 rounded-md text-xs border flex flex-col items-center gap-1 min-w-[96px]",
                                                selected ? "bg-brand-500/15 border-brand-500 text-text-primary" : "bg-chip border-border-subtle text-text-secondary",
                                                isUnauthorized && "opacity-50 cursor-not-allowed"
                                            )}
                                            title={isUnauthorized ? `Login required for ${p.name}` : undefined}
                                        >
                                            {selected && <span>👑</span>}
                                            <span>{p.name}</span> {isUnauthorized ? "🔒" : ""}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-2 text-sm"><span>🧩</span><span>Mapper</span></div>
                            <div className="flex flex-wrap gap-2">
                                {allProviders.map(p => {
                                    const pid = String(p.id);
                                    const selected = String(mapProviderVal || '') === pid;
                                    const isUnauthorized = authStatus && authStatus[pid] === false;
                                    return (
                                        <button
                                            key={`m-${pid}`}
                                            onClick={() => !isUnauthorized && handleSelectMap(pid)}
                                            disabled={isUnauthorized}
                                            className={clsx("px-2 py-2 rounded-md text-xs border flex flex-col items-center gap-1 min-w-[96px]",
                                                selected ? "bg-brand-500/15 border-brand-500 text-text-primary" : "bg-chip border-border-subtle text-text-secondary",
                                                isUnauthorized && "opacity-50 cursor-not-allowed"
                                            )}
                                            title={isUnauthorized ? `Login required for ${p.name}` : undefined}
                                        >
                                            {selected && <span>🧩</span>}
                                            <span>{p.name}</span> {isUnauthorized ? "🔒" : ""}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-2 text-sm"><span>✏️</span><span>Composer</span></div>
                            <div className="flex flex-wrap gap-2">
                                {allProviders.map(p => {
                                    const pid = String(p.id);
                                    const selected = String(composerVal || '') === pid;
                                    const isUnauthorized = authStatus && authStatus[pid] === false;
                                    return (
                                        <button
                                            key={`c-${pid}`}
                                            onClick={() => !isUnauthorized && handleSelectComposer(pid)}
                                            disabled={isUnauthorized}
                                            className={clsx("px-2 py-2 rounded-md text-xs border flex flex-col items-center gap-1 min-w-[96px]",
                                                selected ? "bg-brand-500/15 border-brand-500 text-text-primary" : "bg-chip border-border-subtle text-text-secondary",
                                                isUnauthorized && "opacity-50 cursor-not-allowed"
                                            )}
                                            title={isUnauthorized ? `Login required for ${p.name}` : undefined}
                                        >
                                            {selected && <span>✏️</span>}
                                            <span>{p.name}</span> {isUnauthorized ? "🔒" : ""}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-2 text-sm"><span>🧠</span><span>Analyst</span></div>
                            <div className="flex flex-wrap gap-2">
                                {allProviders.map(p => {
                                    const pid = String(p.id);
                                    const selected = String(analystVal || '') === pid;
                                    const isUnauthorized = authStatus && authStatus[pid] === false;
                                    return (
                                        <button
                                            key={`a-${pid}`}
                                            onClick={() => !isUnauthorized && handleSelectAnalyst(pid)}
                                            disabled={isUnauthorized}
                                            className={clsx("px-2 py-2 rounded-md text-xs border flex flex-col items-center gap-1 min-w-[96px]",
                                                selected ? "bg-brand-500/15 border-brand-500 text-text-primary" : "bg-chip border-border-subtle text-text-secondary",
                                                isUnauthorized && "opacity-50 cursor-not-allowed"
                                            )}
                                            title={isUnauthorized ? `Login required for ${p.name}` : undefined}
                                        >
                                            {selected && <span>🧠</span>}
                                            <span>{p.name}</span> {isUnauthorized ? "🔒" : ""}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="col-span-2">
                            <div className="flex items-center gap-2 mb-2 text-sm"><span>👁️</span><span>Witness</span></div>
                            <div className="flex flex-wrap gap-2">
                                {allProviders.map(p => {
                                    const pid = String(p.id);
                                    const checked = !!selectedModels?.[pid];
                                    const isUnauthorized = authStatus && authStatus[pid] === false;
                                    return (
                                        <button
                                            key={`w-${pid}`}
                                            onClick={() => !isUnauthorized && setSelectedModels({ ...(selectedModels || {}), [pid]: !checked })}
                                            disabled={isUnauthorized}
                                            className={clsx("px-2 py-1 rounded-md text-xs border",
                                                checked ? "bg-brand-500/15 border-brand-500 text-text-primary" : "bg-chip border-border-subtle text-text-secondary",
                                                isUnauthorized && "opacity-50 cursor-not-allowed"
                                            )}
                                            title={isUnauthorized ? `Login required for ${p.name}` : undefined}
                                        >
                                            {p.name} {checked ? "✓" : ""} {isUnauthorized ? "🔒" : ""}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end mt-3">
                        <button onClick={() => setIsMenuOpen(false)} className="px-2 py-1 text-xs rounded-md bg-surface-highlight border border-border-subtle text-text-secondary">Close</button>
                    </div>
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
    variant?: "tray" | "divider" | "historical" | "welcome";
    onLongPressStart?: () => void;
    onLongPressCancel?: () => void;
    disabled?: boolean;
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
    variant = "tray",
    onLongPressStart,
    onLongPressCancel,
    disabled = false
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
                    // Size differences: voice is 32px, others are 28px
                    isVoice ? "council-orb-voice" : "council-orb-regular",
                    isStreaming && "council-orb-streaming",
                    hasError && "council-orb-error",
                    // Crown Mode Selection Target
                    isCrownMode && !isVoice && "ring-2 ring-brand-500/50 ring-offset-1 ring-offset-surface cursor-crosshair animate-pulse",
                    disabled && "opacity-50 cursor-not-allowed"
                )}
                style={{
                    '--model-color': modelColor,
                    '--rotation': `${Math.random() * 360}deg`,
                    '--logo-src': logoSrc ? `url(${logoSrc})` : 'none'
                } as React.CSSProperties}
                onMouseEnter={() => onHover(pid)}
                onMouseLeave={() => onHover(null)}
                onClick={onClick}
                onMouseDown={onLongPressStart}
                onMouseUp={onLongPressCancel}
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
