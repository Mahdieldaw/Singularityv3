councc.tsx

// components/CouncilOrbs.tsx

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
    providerEffectiveStateFamily,
    isSplitOpenAtom,
    synthesisProviderAtom,
    mappingProviderAtom,
    composerModelAtom,
    analystModelAtom,
    providerAuthStatusAtom,
    selectedModelsAtom,
    workflowProgressAtom // New atom for workflow progress
} from "../state/atoms";
import { LLMProvider, WorkflowStage } from "../types";
import { PROVIDER_COLORS, PROVIDER_ACCENT_COLORS, WORKFLOW_STAGE_COLORS } from "../constants";
import { getProviderById } from "../providers/providerRegistry";
import { setProviderLock } from "@shared/provider-locks";
import clsx from "clsx";

// Workflow stage type
export type WorkflowStage =
    | 'idle'
    | 'thinking'
    | 'streaming'
    | 'complete'
    | 'error'
    | 'synthesizing';

interface CouncilOrbsProps {
    turnId?: string;
    providers: LLMProvider[];
    voiceProviderId: string;
    onOrbClick?: (providerId: string) => void;
    onCrownMove?: (providerId: string) => void;
    onTrayExpand?: () => void;
    isTrayExpanded?: boolean;
    visibleProviderIds?: string[];
    variant?: "tray" | "divider" | "welcome" | "historical" | "active";
    isEditMode?: boolean;
    // New: Per-provider workflow progress
    workflowProgress?: Record<string, { stage: WorkflowStage; progress?: number }>;
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
    workflowProgress = {},
}) => {
    const [hoveredOrb, setHoveredOrb] = useState<string | null>(null);
    const [isCrownMode, setIsCrownMode] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const isSplitOpen = useAtomValue(isSplitOpenAtom);
    const authStatus = useAtomValue(providerAuthStatusAtom);
    const [synthesisProvider, setSynthesisProvider] = useAtom(synthesisProviderAtom);
    const [mapProviderVal, setMapProvider] = useAtom(mappingProviderAtom);
    const [composerVal, setComposer] = useAtom(composerModelAtom);
    const [analystVal, setAnalyst] = useAtom(analystModelAtom);
    const [selectedModels, setSelectedModels] = useAtom(selectedModelsAtom);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isMenuOpen && containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMenuOpen]);

    // Auto-open menu in edit mode
    useEffect(() => {
        if (variant === 'active') return;
        if (isEditMode) {
            setIsMenuOpen(true);
        } else {
            setIsMenuOpen(false);
        }
    }, [isEditMode, variant]);

    // Filter providers
    const allProviders = useMemo(() =>
        providers.filter(p => p.id !== 'system'),
        [providers]
    );

    const displayProviders = useMemo(() => {
        let filtered = allProviders;
        if (visibleProviderIds) {
            filtered = filtered.filter(p => visibleProviderIds.includes(String(p.id)));
        }
        return filtered;
    }, [allProviders, visibleProviderIds]);

    // Priority ordering
    const PRIORITY_ORDER = ['claude', 'gemini-exp', 'qwen', 'gemini-pro', 'chatgpt', 'gemini'];
    const getPriority = (providerId: string) => {
        const index = PRIORITY_ORDER.indexOf(providerId);
        return index === -1 ? 999 : index;
    };

    // Separate and sort providers
    const voiceProviderObj = displayProviders.find(p => String(p.id) === voiceProviderId)
        || (variant === "active" ? allProviders.find(p => String(p.id) === voiceProviderId) : undefined);

    const otherProviders = displayProviders
        .filter(p => String(p.id) !== voiceProviderId)
        .sort((a, b) => getPriority(String(a.id)) - getPriority(String(b.id)));

    // Distribute left/right
    const leftOrbs: LLMProvider[] = [];
    const rightOrbs: LLMProvider[] = [];
    otherProviders.forEach((provider, index) => {
        if (index % 2 === 0) rightOrbs.push(provider);
        else leftOrbs.push(provider);
    });
    leftOrbs.reverse();

    // Event handlers
    const handleOrbClick = useCallback((e: React.MouseEvent, providerId: string) => {
        e.stopPropagation();
        const isUnauthorized = authStatus?.[providerId] === false;
        if (isUnauthorized) return;

        if (variant === "active") {
            if (isCrownMode && onCrownMove) {
                onCrownMove(providerId);
                setIsCrownMode(false);
            } else {
                const isSelected = selectedModels[providerId];
                setSelectedModels({ ...selectedModels, [providerId]: !isSelected });
            }
        } else {
            if (isCrownMode && onCrownMove) {
                onCrownMove(providerId);
                setIsCrownMode(false);
            } else if (onOrbClick) {
                onOrbClick(providerId);
            }
        }
    }, [variant, isCrownMode, onCrownMove, onOrbClick, selectedModels, setSelectedModels, authStatus]);

    const handleCrownClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (variant === "historical") return;
        setIsCrownMode(!isCrownMode);
    }, [variant, isCrownMode]);

    const handleLongPressStart = useCallback(() => {
        if (variant === "historical") return;
        if (longPressRef.current) clearTimeout(longPressRef.current);
        longPressRef.current = setTimeout(() => setIsMenuOpen(true), 500);
    }, [variant]);

    const handleLongPressCancel = useCallback(() => {
        if (longPressRef.current) {
            clearTimeout(longPressRef.current);
            longPressRef.current = null;
        }
    }, []);

    const shouldDim = variant === "historical" && isSplitOpen;
    const shouldDimInSplit = isSplitOpen && variant === "tray";

    return (
        <div
      ref= { containerRef }
    className = {
        clsx(
        "council-container relative transition-all duration-300",
            isTrayExpanded && "opacity-0 pointer-events-none h-0 overflow-hidden",
        variant === "tray" && "council-tray",
        variant === "divider" && "council-divider",
        variant === "historical" && "council-historical",
        variant === "active" && "council-active w-full flex justify-center py-2 px-4",
        shouldDim && "opacity-50",
        shouldDimInSplit && "opacity-40 saturate-50"
      )}
onMouseDown = { handleLongPressStart }
onMouseUp = { handleLongPressCancel }
onMouseLeave = { handleLongPressCancel }
    >
    {/* Main Orb Container */ }
    < div
className = {
    clsx(
          "council-orb-bar flex items-center justify-center relative",
        variant === "active" && "council-orb-bar--active"
        )}
      >
    {/* Left Orbs */ }
    < div className = "council-orb-group council-orb-group--left" >
    {
        leftOrbs.map((p) => {
            const pid = String(p.id);
            const progress = workflowProgress[pid];
            return (
                <CouncilOrb
                key= { pid }
            turnId = { turnId || ""
        }
                provider = { p }
                isVoice = { false}
                isCrownMode = { isCrownMode }
                onHover = { setHoveredOrb }
                onClick = {(e) => handleOrbClick(e, pid)}
onCrownClick = { handleCrownClick }
isHovered = { hoveredOrb === pid}
variant = { variant }
disabled = { authStatus?.[pid] === false }
isSelected = { variant === "active" ? !!selectedModels[pid] : undefined}
workflowStage = { progress?.stage }
workflowProgress = { progress?.progress }
onLongPressStart = { handleLongPressStart }
onLongPressCancel = { handleLongPressCancel }
    />
            );
          })}
</div>

{/* Center Voice Orb */ }
<div 
          className={
    clsx(
        "council-voice-zone",
        variant !== "divider" && variant !== "active" && "cursor-pointer"
    )
}
onClick = { variant !== "divider" && variant !== "active" ? onTrayExpand : undefined}
        >
    { variant !== "active" && <div className="council-glass-ring" />}

{
    voiceProviderObj && (
        <CouncilOrb
              turnId={ turnId || "" }
    provider = { voiceProviderObj }
    isVoice = { true}
    isCrownMode = { isCrownMode }
    onHover = { setHoveredOrb }
    onClick = {(e) => handleOrbClick(e, String(voiceProviderObj.id))
}
onCrownClick = { handleCrownClick }
isHovered = { hoveredOrb === String(voiceProviderObj.id)}
variant = { variant }
disabled = { authStatus?.[String(voiceProviderObj.id)] === false }
isSelected = { true}
workflowStage = { workflowProgress[String(voiceProviderObj.id)]?.stage }
workflowProgress = { workflowProgress[String(voiceProviderObj.id)]?.progress }
onLongPressStart = { handleLongPressStart }
onLongPressCancel = { handleLongPressCancel }
    />
          )}
</div>

{/* Right Orbs */ }
<div className="council-orb-group council-orb-group--right" >
{
    rightOrbs.map((p) => {
        const pid = String(p.id);
        const progress = workflowProgress[pid];
        return (
            <CouncilOrb
                key= { pid }
        turnId = { turnId || ""
    }
                provider = { p }
                isVoice = { false}
                isCrownMode = { isCrownMode }
                onHover = { setHoveredOrb }
                onClick = {(e) => handleOrbClick(e, pid)}
onCrownClick = { handleCrownClick }
isHovered = { hoveredOrb === pid}
variant = { variant }
disabled = { authStatus?.[pid] === false }
isSelected = { variant === "active" ? !!selectedModels[pid] : undefined}
workflowStage = { progress?.stage }
workflowProgress = { progress?.progress }
onLongPressStart = { handleLongPressStart }
onLongPressCancel = { handleLongPressCancel }
    />
            );
          })}
</div>

{/* Settings Button (Active Mode) */ }
{
    variant === "active" && (
        <button
            onClick={
        (e) => {
            e.stopPropagation();
            setIsMenuOpen(!isMenuOpen);
        }
    }
    className = "council-settings-btn"
    title = "Configure Council"
        >
        <SettingsIcon />
        </button>
        )
}
</div>

{/* Crown Mode Indicator */ }
{
    isCrownMode && (
        <div className="council-crown-indicator" >
            Select new voice
                </div>
      )
}

{/* Menu Panel */ }
{
    isMenuOpen && (
        <CouncilMenu
          providers={ allProviders }
    authStatus = { authStatus }
    synthesisProvider = { synthesisProvider }
    mapProvider = { mapProviderVal }
    composerModel = { composerVal }
    analystModel = { analystVal }
    selectedModels = { selectedModels }
    onSelectSynthesis = {(pid) => {
        if (synthesisProvider === pid) {
            setSynthesisProvider(null);
            setProviderLock('synthesis', false);
        } else {
            setSynthesisProvider(pid);
            setProviderLock('synthesis', true);
        }
    }
}
onSelectMapping = {(pid) => {
    if (mapProviderVal === pid) {
        setMapProvider(null);
        setProviderLock('mapping', false);
    } else {
        setMapProvider(pid);
        setProviderLock('mapping', true);
    }
}}
onSelectComposer = { setComposer }
onSelectAnalyst = { setAnalyst }
onToggleWitness = {(pid) => {
    setSelectedModels({ ...selectedModels, [pid]: !selectedModels[pid] });
}}
onClose = {() => setIsMenuOpen(false)}
        />
      )}
</div>
  );
});

// ============================================================================
// Council Orb Component
// ============================================================================

interface CouncilOrbProps {
    turnId: string;
    provider: LLMProvider;
    isVoice: boolean;
    isCrownMode: boolean;
    onHover: (id: string | null) => void;
    onClick: (e: React.MouseEvent) => void;
    onCrownClick: (e: React.MouseEvent) => void;
    isHovered: boolean;
    variant?: "tray" | "divider" | "historical" | "welcome" | "active";
    disabled?: boolean;
    isSelected?: boolean;
    workflowStage?: WorkflowStage;
    workflowProgress?: number; // 0-100
    onLongPressStart?: () => void;
    onLongPressCancel?: () => void;
}

const CouncilOrb: React.FC<CouncilOrbProps> = React.memo(({
    turnId,
    provider,
    isVoice,
    isCrownMode,
    onHover,
    onClick,
    onCrownClick,
    isHovered,
    variant = "tray",
    disabled = false,
    isSelected,
    workflowStage = 'idle',
    workflowProgress = 0,
    onLongPressStart,
    onLongPressCancel,
}) => {
    const pid = String(provider.id);
    const state = useAtomValue(providerEffectiveStateFamily({ turnId, providerId: pid }));

    // Derive streaming state from turn state (for non-active variants)
    const isStreaming = variant !== "active" && state.latestResponse?.status === 'streaming';
    const hasError = variant !== "active" && state.latestResponse?.status === 'error';

    // Get colors
    const primaryColor = PROVIDER_COLORS[pid] || PROVIDER_COLORS['default'];
    const accentColor = PROVIDER_ACCENT_COLORS[pid] || PROVIDER_ACCENT_COLORS['default'];
    const stageColor = WORKFLOW_STAGE_COLORS[workflowStage] || WORKFLOW_STAGE_COLORS.idle;

    // Get provider config for logo
    const providerConfig = getProviderById(pid);
    const logoSrc = providerConfig?.logoSrc || '';

    // Active variant selection state
    const isActiveVariant = variant === "active";
    const showAsActive = isActiveVariant ? isSelected : true;

    // Calculate progress ring dasharray/offset for workflow progress
    const circumference = 2 * Math.PI * 18; // r=18
    const progressOffset = circumference - (workflowProgress / 100) * circumference;

    return (
        <div 
      className= {
            clsx(
        "council-orb-wrapper",
                isVoice && "council-orb-wrapper--voice",
        isActiveVariant && !showAsActive && "council-orb-wrapper--inactive"
      )}
    >
    {/* Crown for Voice */ }
{
    isVoice && (
        <button
          type="button"
    className = {
        clsx(
            "council-crown",
            isActiveVariant && "council-crown--active",
        variant === "historical" && "council-crown--historical",
        isCrownMode && "council-crown--selecting"
          )
}
onClick = {(e) => variant !== "historical" && onCrownClick(e)}
title = { variant === "historical" ? "Synthesizer for this turn" : "Click to change voice"}
        >
          👑
</button>
      )}

{/* Workflow Progress Ring */ }
{
    workflowStage !== 'idle' && (
        <svg 
          className="council-progress-ring"
    viewBox = "0 0 44 44"
        >
        {/* Background ring */ }
        < circle
    cx = "22"
    cy = "22"
    r = "18"
    fill = "none"
    stroke = "currentColor"
    strokeWidth = "2"
    className = "opacity-20"
        />
        {/* Progress ring */ }
        < circle
    cx = "22"
    cy = "22"
    r = "18"
    fill = "none"
    stroke = { stageColor }
    strokeWidth = "2.5"
    strokeLinecap = "round"
    strokeDasharray = { circumference }
    strokeDashoffset = { progressOffset }
    className = "council-progress-ring__progress"
    style = {{
        transform: 'rotate(-90deg)',
            transformOrigin: 'center',
            }
}
          />
    </svg>
      )}

{/* Main Orb Button */ }
<button
        type="button"
className = {
    clsx(
          "council-orb",
        isVoice? "council-orb--voice" : "council-orb--regular",
        variant === "historical" && "council-orb--historical",
    isStreaming && "council-orb--streaming",
    hasError && "council-orb--error",
    isCrownMode && !isVoice && "council-orb--crown-target",
    disabled && "council-orb--disabled",
    isActiveVariant && showAsActive && "council-orb--selected",
    isActiveVariant && !showAsActive && "council-orb--unselected"
        )}
style = {{
    '--orb-color': primaryColor,
        '--orb-accent': accentColor,
            '--orb-stage': stageColor,
        } as React.CSSProperties}
onMouseEnter = {() => onHover(pid)}
onMouseLeave = {() => onHover(null)}
onClick = { onClick }
onMouseDown = { onLongPressStart }
onMouseUp = { onLongPressCancel }
disabled = { disabled }
    >
    {/* Core gradient */ }
    < div className = "council-orb__core" />

        {/* Animated glow ring */ }
        < div className = "council-orb__glow" />

            {/* Rotating accent (GPU-accelerated) */ }
            < div className = "council-orb__spinner" />

                {/* Logo */ }
{
    logoSrc && (
        <div 
            className="council-orb__logo"
    style = {{ backgroundImage: `url('${logoSrc}')` }
}
          />
        )}

{/* Streaming pulse overlay */ }
{
    (isStreaming || workflowStage === 'streaming') && (
        <div className="council-orb__pulse" />
        )
}
</button>

{/* Workflow Stage Indicator */ }
{
    workflowStage !== 'idle' && workflowStage !== 'complete' && (
        <div 
          className="council-stage-badge"
    style = {{ backgroundColor: stageColor }
}
        >
    { workflowStage === 'thinking' && '🤔'}
{ workflowStage === 'streaming' && '💬' }
{ workflowStage === 'synthesizing' && '✨' }
{ workflowStage === 'error' && '⚠️' }
</div>
      )}

{/* Tooltip */ }
{
    isHovered && (
        <div className="council-tooltip" >
            <span className="council-tooltip__name" > { provider.name } </span>
    {
        workflowStage !== 'idle' && (
            <span className="council-tooltip__stage" >
                { workflowStage === 'thinking' && 'Processing...'
    }
    { workflowStage === 'streaming' && `Generating (${workflowProgress}%)` }
    { workflowStage === 'synthesizing' && 'Synthesizing...' }
    { workflowStage === 'complete' && 'Complete' }
    { workflowStage === 'error' && 'Error occurred' }
    </span>
          )
}
{
    isActiveVariant && !showAsActive && (
        <span className="council-tooltip__action" > Click to enable </span>
          )
}
</div>
      )}
</div>
  );
});

// ============================================================================
// Council Menu Component
// ============================================================================

interface CouncilMenuProps {
    providers: LLMProvider[];
    authStatus: Record<string, boolean> | null;
    synthesisProvider: string | null;
    mapProvider: string | null;
    composerModel: string | null;
    analystModel: string | null;
    selectedModels: Record<string, boolean>;
    onSelectSynthesis: (pid: string) => void;
    onSelectMapping: (pid: string) => void;
    onSelectComposer: (pid: string) => void;
    onSelectAnalyst: (pid: string) => void;
    onToggleWitness: (pid: string) => void;
    onClose: () => void;
}

const CouncilMenu: React.FC<CouncilMenuProps> = ({
    providers,
    authStatus,
    synthesisProvider,
    mapProvider,
    composerModel,
    analystModel,
    selectedModels,
    onSelectSynthesis,
    onSelectMapping,
    onSelectComposer,
    onSelectAnalyst,
    onToggleWitness,
    onClose,
}) => {
    const roles = [
        { key: 'synthesis', label: 'Synthesizer', icon: '👑', value: synthesisProvider, onSelect: onSelectSynthesis },
        { key: 'mapping', label: 'Mapper', icon: '🧩', value: mapProvider, onSelect: onSelectMapping },
        { key: 'composer', label: 'Composer', icon: '✏️', value: composerModel, onSelect: onSelectComposer },
        { key: 'analyst', label: 'Analyst', icon: '🧠', value: analystModel, onSelect: onSelectAnalyst },
    ];

    return (
        <div className= "council-menu" >
        <div className="council-menu__header" >
            <h3>Council Configuration </h3>
                < button onClick = { onClose } className = "council-menu__close" >×</button>
                    </div>

                    < div className = "council-menu__grid" >
                    {
                        roles.map(role => (
                            <div key= { role.key } className = "council-menu__section" >
                            <div className="council-menu__label" >
                            <span>{ role.icon } </span>
                            < span > { role.label } </span>
                            </div>
                        < div className = "council-menu__options" >
                        {
                            providers.map(p => {
                                const pid = String(p.id);
                                const selected = role.value === pid;
                                const unauthorized = authStatus?.[pid] === false;
                                const color = PROVIDER_COLORS[pid] || PROVIDER_COLORS.default;

                                return (
                                    <button
                    key= { pid }
                                onClick = {() => !unauthorized && role.onSelect(pid)}
disabled = { unauthorized }
className = {
    clsx(
                      "council-menu__chip",
        selected && "council-menu__chip--selected"
                    )}
style = {{ '--chip-color': color } as React.CSSProperties}
                  >
    <span 
                      className="council-menu__chip-dot"
style = {{ backgroundColor: color }}
                    />
    < span > { p.name } </span>
{ selected && <span className="council-menu__chip-check" >✓</span> }
{ unauthorized && <span className="council-menu__chip-lock" >🔒</span> }
</button>
                );
              })}
</div>
    </div>
        ))}

{/* Witnesses */ }
<div className="council-menu__section council-menu__section--full" >
    <div className="council-menu__label" >
        <span>👁️</span>
            < span > Witnesses </span>
            </div>
            < div className = "council-menu__options council-menu__options--wrap" >
            {
                providers.map(p => {
                    const pid = String(p.id);
                    const checked = !!selectedModels[pid];
                    const unauthorized = authStatus?.[pid] === false;
                    const color = PROVIDER_COLORS[pid] || PROVIDER_COLORS.default;

                    return (
                        <button
                  key= { pid }
                    onClick = {() => !unauthorized && onToggleWitness(pid)
                }
                  disabled = { unauthorized }
                  className = {
                        clsx(
                    "council-menu__chip council-menu__chip--small",
                            checked && "council-menu__chip--selected"
                )
            }
style = {{ '--chip-color': color } as React.CSSProperties}
                >
    <span 
                    className="council-menu__chip-dot"
style = {{ backgroundColor: color }}
                  />
    < span > { p.name } </span>
{ checked && <span>✓</span> }
{ unauthorized && <span>🔒</span> }
</button>
              );
            })}
</div>
    </div>
    </div>
    </div>
  );
};

// Settings Icon Component
const SettingsIcon = () => (
    <svg className= "w-4 h-4" fill = "none" viewBox = "0 0 24 24" stroke = "currentColor" >
        <path 
      strokeLinecap="round"
strokeLinejoin = "round"
strokeWidth = { 1.5}
d = "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path 
      strokeLinecap="round"
strokeLinejoin = "round"
strokeWidth = { 1.5}
d = "M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
    </svg>
);

export default CouncilOrbs;