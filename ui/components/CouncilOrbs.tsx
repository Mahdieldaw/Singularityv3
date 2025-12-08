import React, { useState, useCallback, useMemo, useRef } from "react";
import { useAtom, useAtomValue } from "jotai";
import { providerEffectiveStateFamily, isSplitOpenAtom, synthesisProviderAtom, mappingProviderAtom, composerModelAtom, analystModelAtom, providerAuthStatusAtom, selectedModelsAtom } from "../state/atoms";
import { LLMProvider } from "..";
import { PROVIDER_COLORS } from "../constants";
import { getProviderById } from "../providers/providerRegistry";
import { setProviderLock } from "@shared/provider-locks";
import clsx from "clsx";

interface CouncilOrbsProps {
    turnId?: string; // Optional for active mode
    providers: LLMProvider[];
    voiceProviderId: string; // The active synthesizer (Crown)
    onOrbClick?: (providerId: string) => void;
    onCrownMove?: (providerId: string) => void;
    onTrayExpand?: () => void;
    isTrayExpanded?: boolean;
    visibleProviderIds?: string[]; // Optional filter for visible orbs
    variant?: "tray" | "divider" | "welcome" | "historical" | "active";
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
    isEditMode = false,
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

    // Auto-open menu when isEditMode becomes true
    React.useEffect(() => {
        if (variant === 'active') return;

        if (isEditMode) {
            setIsMenuOpen(true);
            setMenuTarget(voiceProviderId);
        } else {
            setIsMenuOpen(false);
            setMenuTarget(null);
        }
    }, [isEditMode, voiceProviderId, variant]);

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

        if (variant === "active") {
            // Toggle witness
            const isUnauthorized = authStatus && authStatus[providerId] === false;
            if (isUnauthorized) return;

            if (isCrownMode) {
                // Changing Crown
                if (onCrownMove) {
                    onCrownMove(providerId);
                    setIsCrownMode(false);
                }
            } else {
                // Toggling Witness
                const isSelected = selectedModels[providerId];
                setSelectedModels({ ...selectedModels, [providerId]: !isSelected });
            }
        } else {
            // Historical / Standard behavior
            if (isCrownMode && onCrownMove) {
                onCrownMove(providerId);
                setIsCrownMode(false);
            } else if (onOrbClick) {
                onOrbClick(providerId);
            }
        }
    };

    const handleCrownClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (variant === "historical") return; // No crown interaction for historical
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

    // For 'active' mode, if the voice provider is not in the display list (shouldn't happen if all are shown), find it in allProviders
    const activeVoiceObj = voiceProviderObj || (variant === "active" ? allProviders.find(p => String(p.id) === voiceProviderId) : undefined);

    const otherProviders = displayProviders
        .filter(p => String(p.id) !== voiceProviderId)
        .sort((a, b) => getPriority(String(a.id)) - getPriority(String(b.id)));

    // Distribute alternating left/right with highest priority closest to voice
    const leftOrbs: LLMProvider[] = [];
    const rightOrbs: LLMProvider[] = [];

    otherProviders.forEach((provider, index) => {
        if (index % 2 === 0) {
            rightOrbs.push(provider);
        } else {
            leftOrbs.push(provider);
        }
    });

    leftOrbs.reverse();

    const shouldDimInSplitMode = isSplitOpen && variant === "tray";

    const handleLongPressStart = (pid: string | null) => {
        if (variant === "historical") return; // Disable menu for historical

        if (longPressRef.current) clearTimeout(longPressRef.current);
        longPressRef.current = setTimeout(() => {
            setMenuTarget(pid || voiceProviderId);
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
        if (synthesisProvider === pid) {
            setSynthesisProvider(null);
            setProviderLock('synthesis', false);
        } else {
            setSynthesisProvider(pid);
            setProviderLock('synthesis', true);
        }
    };

    const handleSelectMap = (pid: string) => {
        if (mapProviderVal === pid) {
            setMapProvider(null);
            setProviderLock('mapping', false);
        } else {
            setMapProvider(pid);
            setProviderLock('mapping', true);
        }
    };

    const handleSelectComposer = (pid: string) => {
        setComposer(pid);
        try {
            localStorage.setItem('htos_composer_locked', 'true');
            chrome?.storage?.local?.set?.({ provider_lock_settings: { composer_locked: true } });
        } catch { }
    };

    const handleSelectAnalyst = (pid: string) => {
        setAnalyst(pid);
        try {
            localStorage.setItem('htos_analyst_locked', 'true');
            chrome?.storage?.local?.set?.({ provider_lock_settings: { analyst_locked: true } });
        } catch { }
    };

    return (
        <div
            className={clsx(
                "council-tray-container relative transition-all duration-300 ease-out",
                isTrayExpanded ? "opacity-0 pointer-events-none h-0 overflow-hidden" : "opacity-100",
                variant === "tray" && "council-tray",
                variant === "divider" && "council-divider",
                variant === "historical" && "council-historical",
                variant === "active" && "council-active w-full flex justify-center py-2 px-4",
                shouldDim && "council-historical-dimmed",
                shouldDimInSplitMode && "council-tray-dimmed-split"
            )}
            onMouseDown={() => handleLongPressStart(null)}
            onMouseUp={handleLongPressCancel}
            onMouseLeave={handleLongPressCancel}
            ref={containerRef}
            style={variant === "active" ? { pointerEvents: "auto" } : undefined}
        >
            {/* Orb bar with centered voice and fanned others */}
            {/* Active variant gets a glass-morphic container for visual separation */}
            <div className={clsx(
                "council-orb-bar flex items-center justify-center relative transition-all",
                variant === "active" ? "gap-4 scale-90 bg-surface-raised/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl px-6 py-3" : ""
            )} style={{ maxWidth: '480px', margin: '0 auto', height: variant === "active" ? 'auto' : '60px' }}>
                {/* Left side orbs */}
                <div className={clsx("flex items-center justify-end", variant === "active" ? "gap-3" : "gap-[28px]")} style={{ flex: 1, paddingRight: variant === "active" ? '16px' : '40px' }}>
                    {leftOrbs.map((p) => {
                        const pid = String(p.id);
                        return (
                            <Orb
                                key={pid}
                                turnId={turnId || ""}
                                provider={p}
                                isVoice={false}
                                isCrownMode={isCrownMode}
                                onHover={setHoveredOrb}
                                onClick={(e) => handleOrbClickInternal(e, pid)}
                                onCrownClick={handleCrownClick}
                                hoveredOrb={hoveredOrb}
                                variant={variant as any}
                                disabled={authStatus && authStatus[pid] === false}
                                isSelected={variant === "active" ? !!selectedModels[pid] : undefined}
                                onLongPressStart={() => handleLongPressStart(pid)}
                                onLongPressCancel={handleLongPressCancel}
                            />
                        );
                    })}
                </div>

                {/* CENTER: Voice Orb */}
                <div
                    className={clsx(
                        "council-voice-zone relative flex items-center justify-center",
                        variant !== "divider" && "cursor-pointer"
                    )}
                    style={{ width: variant === "active" ? '48px' : '80px', height: variant === "active" ? '48px' : '80px', flexShrink: 0 }}
                    onClick={variant !== "divider" && variant !== "active" ? onTrayExpand : undefined}
                    onMouseDown={() => handleLongPressStart(String(voiceProviderId))}
                    onMouseUp={handleLongPressCancel}
                >
                    {variant !== "active" && <div className="council-glass-ring" />}

                    {activeVoiceObj && (
                        <Orb
                            key={String(activeVoiceObj.id)}
                            turnId={turnId || ""}
                            provider={activeVoiceObj}
                            isVoice={true}
                            isCrownMode={isCrownMode}
                            onHover={setHoveredOrb}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleOrbClickInternal(e, String(activeVoiceObj.id));
                            }}
                            onCrownClick={handleCrownClick}
                            hoveredOrb={hoveredOrb}
                            variant={variant as any}
                            onLongPressStart={() => handleLongPressStart(String(voiceProviderId))}
                            onLongPressCancel={handleLongPressCancel}
                            disabled={authStatus && authStatus[String(activeVoiceObj.id)] === false}
                            isSelected={true} // Voice is always selected/active
                        />
                    )}
                </div>

                {/* Right side orbs */}
                <div className={clsx("flex items-center justify-start", variant === "active" ? "gap-3" : "gap-[28px]")} style={{ flex: 1, paddingLeft: variant === "active" ? '16px' : '40px' }}>
                    {rightOrbs.map((p) => {
                        const pid = String(p.id);
                        return (
                            <Orb
                                key={pid}
                                turnId={turnId || ""}
                                provider={p}
                                isVoice={false}
                                isCrownMode={isCrownMode}
                                onHover={setHoveredOrb}
                                onClick={(e) => handleOrbClickInternal(e, pid)}
                                onCrownClick={handleCrownClick}
                                hoveredOrb={hoveredOrb}
                                variant={variant as any}
                                disabled={authStatus && authStatus[pid] === false}
                                isSelected={variant === "active" ? !!selectedModels[pid] : undefined}
                                onLongPressStart={() => handleLongPressStart(pid)}
                                onLongPressCancel={handleLongPressCancel}
                            />
                        );
                    })}
                </div>

                {/* Settings Button for Active Mode */}
                {variant === "active" && (
                    <div className="absolute -right-8 top-1/2 -translate-y-1/2">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsMenuOpen(!isMenuOpen);
                            }}
                            className="bg-surface-raised hover:bg-surface-highlight border border-border-subtle rounded-full p-2 text-text-muted hover:text-text-primary transition-all shadow-sm"
                            title="Configure Council"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            {/* Crown Mode Indicator */}
            {isCrownMode && (
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-surface-raised border border-brand-500 text-brand-500 text-xs px-2 py-1 rounded-md shadow-sm animate-bounce whitespace-nowrap z-50">
                    Select new voice
                </div>
            )}

            {isMenuOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-[110%] bg-surface-raised border border-border-subtle rounded-xl shadow-elevated p-3 z-[100] min-w-[640px]">
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
    variant?: "tray" | "divider" | "historical" | "welcome" | "active";
    onLongPressStart?: () => void;
    onLongPressCancel?: () => void;
    disabled?: boolean;
    isSelected?: boolean;
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
    disabled = false,
    isSelected
}) => {
    const pid = String(provider.id);
    const state = useAtomValue(providerEffectiveStateFamily({ turnId, providerId: pid }));

    // For active variant, we don't use turn state status, we use selection state
    const isStreaming = variant !== "active" && state.latestResponse?.status === 'streaming';
    const hasError = variant !== "active" && state.latestResponse?.status === 'error';
    const isHovered = hoveredOrb === pid;

    // Get model color and logo
    const modelColor = PROVIDER_COLORS[pid] || PROVIDER_COLORS['default'];
    const providerConfig = getProviderById(pid);
    const logoSrc = providerConfig?.logoSrc || '';

    // Active variant styling logic
    const isActiveVariant = variant === "active";
    const showAsActive = isActiveVariant ? isSelected : true; // In active mode, dim if not selected

    // In historical mode, it's always "active" because we filter list upstream vs "active" mode where we show all

    return (
        <div className="relative flex items-center justify-center">
            {/* Crown Icon for Voice Provider */}
            {isVoice && (
                <div
                    className={clsx(
                        "absolute z-10 text-[10px] transition-all",
                        isActiveVariant ? "-top-4" : "-top-3",
                        // Active Crown: Vibrant, interactive, pulsing
                        isActiveVariant && !isCrownMode && "text-amber-400 cursor-pointer hover:scale-125 animate-pulse",
                        // Historical Crown: Muted "relic" state (slate/gray), static, still clickable for context
                        variant === "historical" && "text-slate-500/50 cursor-default",
                        // Crown Mode: Highlight selection state
                        isCrownMode && "text-brand-500 scale-125 animate-pulse cursor-pointer"
                    )}
                    onClick={(e) => {
                        if (variant !== "historical") onCrownClick(e);
                    }}
                    title={variant === "historical" ? "Synthesizer for this turn" : "Current Voice (Click to change)"}
                >
                    👑
                </div>
            )}

            <button
                type="button"
                className={clsx(
                    "council-orb transition-all duration-300 ease-out",
                    // Shape and Size
                    isVoice ? (isActiveVariant ? "w-10 h-10" : "council-orb-voice") : (isActiveVariant ? "w-8 h-8" : "council-orb-regular"),

                    // Historical Mode: Static orbs (no heavy animation), but still interactive
                    variant === "historical" && "council-orb-historical",

                    // Status Effects
                    isStreaming && "council-orb-streaming",
                    hasError && "council-orb-error",

                    // Active Mode Selection Dimming
                    // Unselected: Distinctly "Off" but visible logos. Low opacity (40%) + Grayscale.
                    // Hover brings it to life (Full Opacity + Color + Bloom).
                    isActiveVariant && !showAsActive && !isVoice && "opacity-40 grayscale scale-90 hover:opacity-100 hover:grayscale-0 hover:scale-105 hover:shadow-[0_0_15px_-3px_var(--model-color)] transition-all duration-300",

                    // Selected: "On" State. Full Opacity, Color, Glow.
                    // Added brightness boost to combat "dullness".
                    isActiveVariant && showAsActive && "opacity-100 grayscale-0 shadow-[0_0_20px_-4px_var(--model-color)] ring-1 ring-[var(--model-color)]/50 scale-110 z-10 brightness-110",

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
                        {variant !== "active" && state.latestResponse?.status === 'streaming' && " (Generating...)"}
                        {variant !== "active" && state.latestResponse?.status === 'error' && " (Error)"}
                        {isActiveVariant && !showAsActive && !isVoice && " (Click to Enable)"}
                    </div>
                </div>
            )}
        </div>
    );
};
