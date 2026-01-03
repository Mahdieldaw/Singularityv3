import React, { useState, useEffect, useRef, useMemo } from "react";
import clsx from "clsx";
import { AiTurn, ProviderResponse } from "../types";
import MarkdownDisplay from "./MarkdownDisplay";
import { RefinerDot } from "./refinerui/RefinerDot";
import { CopyButton } from "./CopyButton";
import { PipelineErrorBanner } from "./PipelineErrorBanner";
import ProviderErrorCard from "./ProviderErrorCard";
import { AntagonistCard } from "./antagonist/AntagonistCard";
import { formatSynthesisForMd } from "../utils/copy-format-utils";
import { cleanAntagonistResponse } from "../../shared/parsing-utils";
import { SettingsIcon } from "./Icons";

// --- Helper Functions ---

function splitSynthesisAnswer(text: string): { shortAnswer: string; longAnswer: string | null } {
    const input = String(text || '').replace(/\r\n/g, '\n');
    if (!input.trim()) return { shortAnswer: '', longAnswer: null };

    const patterns: RegExp[] = [
        /(?:^|\n)\s*#{1,6}\s*the\s+long\s+answer\s*:?\s*(?:\n|$)/i,
        /(?:^|\n)\s*#{1,6}\s*long\s+answer\s*:?\s*(?:\n|$)/i,
        /(?:^|\n)\s*\*\*\s*the\s+long\s+answer\s*\*\*\s*:?\s*(?:\n|$)/i,
        /(?:^|\n)\s*\*\*\s*long\s+answer\s*\*\*\s*:?\s*(?:\n|$)/i,
        /(?:^|\n)\s*the\s+long\s+answer\s*:?\s*(?:\n|$)/i,
        /(?:^|\n)\s*long\s+answer\s*:?\s*(?:\n|$)/i,
    ];

    let best: { index: number; length: number } | null = null;
    for (const re of patterns) {
        const match = input.match(re);
        if (match && typeof match.index === 'number') {
            const idx = match.index;
            if (!best || idx < best.index) {
                best = { index: idx, length: match[0].length };
            }
        }
    }

    if (!best) return { shortAnswer: input.trim(), longAnswer: null };

    const shortAnswer = input.slice(0, best.index).trim();
    const longAnswer = input.slice(best.index + best.length).trim();

    return {
        shortAnswer,
        longAnswer: longAnswer ? longAnswer : null,
    };
}

function truncateGemInsight(insight: string, maxLength: number = 70): string {
    if (insight.length <= maxLength) return insight;
    return insight.substring(0, maxLength).trimEnd() + "...";
}

const GemFlash: React.FC<{ insight: string }> = ({ insight }) => {
    const [visible, setVisible] = useState(false);
    const [text, setText] = useState("");
    const prevInsightRef = useRef<string | null>(null);

    useEffect(() => {
        const nextInsight = (insight || "").trim();
        if (!nextInsight) return;
        if (prevInsightRef.current === nextInsight) return;
        prevInsightRef.current = nextInsight;
        const truncated = truncateGemInsight(nextInsight, 70);
        setText(truncated);
        setVisible(true);
        const timer = setTimeout(() => {
            setVisible(false);
        }, 2500);
        return () => clearTimeout(timer);
    }, [insight]);

    if (!text) return null;

    return (
        <div
            className={`mt-2 text-center text-[13px] text-text-secondary max-w-md mx-auto px-4 transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"
                }`}
        >
            {text}
        </div>
    );
};

interface SynthesisBubbleProps {
    aiTurn: AiTurn;
    effectiveActiveSynthTab: any;
    synthesisTabs: any[];
    activeSynthTabId: string | null;
    onTabChange: (tabId: string) => void;
    refinerOutput: any;
    isRefinerLoading: boolean;
    showEcho: boolean;
    setShowEcho: (val: boolean | ((prev: boolean) => boolean)) => void;
    onDecisionMapOpen: () => void;
    onTrustPanelOpen: () => void;
    onGemActionClick: (action: string) => void;
    wasSynthRequested: boolean;
    isSynthesisTarget: boolean;
    isMappingError: boolean;
    isMappingLoading: boolean;
    activeMappingClipProviderId: string | null;
    onClipClick: (type: "synthesis" | "mapping" | "antagonist", pid: string) => void;
    latestSynthResponseFallback: ProviderResponse | undefined;
    // For Orbs/Tray
    displayedVoicePid: string;
    visibleProviderIds: string[];
    isThisTurnActive: boolean;
    workflowProgress: any;
    onOrbClick: (pid: string) => void;
    isDecisionMapOpen: boolean;
    // Copy full turn
    onCopyFullTurn: () => void;
    includePromptInCopy: boolean;
    onToggleIncludePrompt: () => void;
    // Antagonist
    activeAntagonistPid: string | null;
    // Providers for recompute
    providersConfig: any[];
    // Artifact handling
    onArtifactClick: (artifact: any) => void;
    // Retry logic
    providerErrors: any;
    retryableProviders: string[];
    onRetryAll: () => void;
    onRetryProvider: (pid: string) => void;
    getProviderName: (pid: string) => string;
    // CouncilOrbs component
    CouncilOrbs: React.FC<any>;
}

export const SynthesisBubble = React.memo<SynthesisBubbleProps>(
    ({
        aiTurn,
        effectiveActiveSynthTab,
        synthesisTabs,
        activeSynthTabId,
        onTabChange,
        refinerOutput,
        isRefinerLoading,
        showEcho,
        setShowEcho,
        onDecisionMapOpen,
        onTrustPanelOpen,
        onGemActionClick,
        wasSynthRequested,
        isSynthesisTarget,
        isMappingError,
        isMappingLoading,
        activeMappingClipProviderId,
        onClipClick,
        latestSynthResponseFallback,
        displayedVoicePid,
        visibleProviderIds,
        isThisTurnActive,
        workflowProgress,
        onOrbClick,
        isDecisionMapOpen,
        onCopyFullTurn,
        includePromptInCopy,
        onToggleIncludePrompt,
        activeAntagonistPid,
        providersConfig,
        onArtifactClick,
        providerErrors,
        retryableProviders,
        onRetryAll,
        onRetryProvider,
        getProviderName,
        CouncilOrbs
    }) => {
        const [isRecomputeMenuOpen, setIsRecomputeMenuOpen] = useState(false);
    const recomputeMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleRecomputeEnter = () => {
        if (recomputeMenuTimeoutRef.current) {
            clearTimeout(recomputeMenuTimeoutRef.current);
            recomputeMenuTimeoutRef.current = null;
        }
        setIsRecomputeMenuOpen(true);
    };

    const handleRecomputeLeave = () => {
        recomputeMenuTimeoutRef.current = setTimeout(() => {
            setIsRecomputeMenuOpen(false);
        }, 300);
    };

    useEffect(() => {
        return () => {
            if (recomputeMenuTimeoutRef.current) {
                clearTimeout(recomputeMenuTimeoutRef.current);
            }
        };
    }, []);

    const hasMappingData = useMemo(() => {
            const mapResps = aiTurn.mappingResponses || {};
            return Object.values(mapResps).some(resps =>
                Array.isArray(resps) && resps.some(r => r.text && r.text.trim().length > 0)
            );
        }, [aiTurn.mappingResponses]);

        const actionBar = (
            <div className="my-6 flex items-center justify-center gap-6 border-y border-border-subtle/60 py-3 w-full">
                {refinerOutput?.outlier && (
                    <button
                        onClick={() => setShowEcho((prev) => !prev)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-raised hover:bg-surface-highlight border border-border-subtle text-xs text-text-secondary"
                        title="View contrarian echo"
                    >
                        <span className="text-sm">📢</span>
                        <span>Echo</span>
                    </button>
                )}

                <button
                    onClick={onDecisionMapOpen}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-raised hover:bg-surface-highlight border border-border-subtle text-xs text-text-secondary"
                    title="Open decision map"
                >
                    <span className="text-sm">📊</span>
                    <span>Map</span>
                </button>

                {(refinerOutput || isRefinerLoading) && (
                    <RefinerDot
                        refiner={refinerOutput || null}
                        onClick={onTrustPanelOpen}
                        isLoading={isRefinerLoading}
                    />
                )}
            </div>
        );

        return (
            <div
                className={clsx(
                    "synthesis-bubble bg-surface rounded-3xl border border-border-subtle shadow-sm relative z-10 transition-all duration-300"
                )}
                style={{ padding: '28px 40px 88px' }}
            >
                {/* OVERLAY: Floating Controls */}
                <div className="absolute inset-0 pointer-events-none z-20">
                    <div className="flex flex-col justify-between h-full px-8 py-6 opacity-0 group-hover/turn:opacity-100 focus-within:opacity-100 transition-opacity duration-300 ease-out">
                        {/* Top-Right: Copy Synthesis */}
                        {effectiveActiveSynthTab?.response?.text && (
                            <div className="self-end pointer-events-auto">
                                <CopyButton
                                    text={formatSynthesisForMd(
                                        effectiveActiveSynthTab.response.text,
                                        effectiveActiveSynthTab.label
                                    )}
                                    label="Copy Synthesis"
                                    variant="icon"
                                    className="bg-surface/95 backdrop-blur-sm shadow-lg rounded-full"
                                />
                            </div>
                        )}

                        {/* Bottom: Copy Turn + Settings */}
                        <div className="flex justify-between items-end mt-auto w-full pointer-events-auto">
                            <div className="flex items-center gap-3">
                                <CopyButton
                                    onCopy={onCopyFullTurn}
                                    label="Copy full turn"
                                    className="bg-surface/95 backdrop-blur-sm shadow-lg rounded-lg text-xs font-medium px-3 py-1.5"
                                >
                                    Copy Turn
                                </CopyButton>

                                <button
                                    className="bg-surface/95 backdrop-blur-sm shadow-lg rounded-full p-2 text-text-muted hover:text-text-primary transition-colors"
                                    onClick={onToggleIncludePrompt}
                                    title={includePromptInCopy ? "Include User Prompt: ON" : "Include User Prompt: OFF"}
                                >
                                    <SettingsIcon className={clsx("w-4 h-4", includePromptInCopy && "text-brand-400")} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* SYNTHESIS TABS UI */}
                {synthesisTabs.length > 0 && (
                    <div className="relative z-10 flex gap-2 overflow-x-auto pb-4 px-2 mb-2 no-scrollbar border-b border-border-subtle/50">
                        {synthesisTabs.map((tab) => {
                            const isActive = tab.id === activeSynthTabId;
                            const isStreaming = tab.response.status === 'streaming' || tab.response.status === 'pending';
                            const isError = tab.response.status === 'error';

                            return (
                                <button
                                    key={tab.id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onTabChange(tab.id);
                                    }}
                                    className={clsx(
                                        "relative px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap border",
                                        isActive
                                            ? "bg-surface-raised border-brand-400 text-text-primary shadow-sm"
                                            : "bg-transparent border-transparent text-text-muted hover:bg-surface-highlight hover:text-text-secondary"
                                    )}
                                >
                                    <span className="flex items-center gap-2">
                                        {tab.label}
                                        {isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-intent-warning animate-pulse" />}
                                        {isError && <span className="w-1.5 h-1.5 rounded-full bg-intent-danger" />}
                                    </span>
                                    {isActive && (
                                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-brand-500 rounded-t-full" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {(() => {
                    if (!wasSynthRequested)
                        return (
                            <div className="flex flex-col items-center justify-center text-text-muted/70 italic relative z-10 w-full">
                                <div className={clsx(!hasMappingData && "py-4")}>
                                    Synthesis not enabled for this turn.
                                </div>
                                {hasMappingData && actionBar}
                            </div>
                        );

                    if (isMappingError && activeMappingClipProviderId) {
                        return (
                            <div className="py-4">
                                <PipelineErrorBanner
                                    type="mapping"
                                    failedProviderId={activeMappingClipProviderId}
                                    onRetry={(pid) => onClipClick("mapping", pid)}
                                    onContinue={() => {
                                        const el = document.getElementById(`orbs-${aiTurn.id}`);
                                        el?.scrollIntoView({ behavior: 'smooth' });
                                    }}
                                />
                            </div>
                        );
                    }

                    const activeTab = effectiveActiveSynthTab;
                    const latest = activeTab?.response || latestSynthResponseFallback;
                    const isGenerating = latest && (latest.status === "streaming" || latest.status === "pending");

                    if (isGenerating && !latest?.text) {
                        return (
                            <div className="flex items-center justify-center gap-2 text-text-muted relative z-10">
                                <span className="italic">
                                    {isSynthesisTarget ? "Starting synthesis..." : "Synthesis generating"}
                                </span>
                                <span className="streaming-dots" />
                            </div>
                        );
                    }

                    if (activeTab && activeTab.response.status === "error") {
                        return (
                            <div className="py-4">
                                <PipelineErrorBanner
                                    type="synthesis"
                                    failedProviderId={activeTab.providerId}
                                    onRetry={(pid) => onClipClick("synthesis", pid)}
                                    onExplore={onDecisionMapOpen}
                                />
                                {activeTab.response.text && activeTab.response.text !== "Synthesis failed" && (
                                    <div className="mt-4 opacity-60 grayscale scale-[0.98] pointer-events-none border-t border-border-subtle pt-4">
                                        <MarkdownDisplay content={activeTab.response.text} />
                                    </div>
                                )}
                            </div>
                        );
                    }

                    if (activeTab) {
                        const take = activeTab.response;
                        const cleanText = take.text || '';
                        const artifacts = take.artifacts || [];
                        const { shortAnswer, longAnswer } = splitSynthesisAnswer(cleanText);

                        return (
                            <div className="relative z-10">
                                <div className="text-base leading-relaxed text-text-primary">
                                    <MarkdownDisplay
                                        content={cleanAntagonistResponse(String(shortAnswer || cleanText || take.text || ""))}
                                    />
                                </div>

                                {actionBar}

                                {refinerOutput?.outlier && showEcho && (
                                    <div className="mt-3 mx-auto max-w-2xl rounded-xl border border-border-subtle bg-surface-raised px-4 py-3 text-sm text-text-primary">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs uppercase tracking-wide text-text-muted">Echo</span>
                                            {refinerOutput.outlier.source && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-chip text-[11px] text-text-secondary">
                                                    [{refinerOutput.outlier.source}]
                                                </span>
                                            )}
                                        </div>
                                        <div>{refinerOutput.outlier.position}</div>
                                        {refinerOutput.outlier.why && (
                                            <div className="mt-1 text-xs text-text-muted">
                                                {refinerOutput.outlier.why}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {refinerOutput?.gem?.insight && (
                                    <GemFlash insight={refinerOutput.gem.insight} />
                                )}

                                {refinerOutput?.gem?.action && (
                                    <div className="mt-4 flex flex-col items-center">
                                        <button
                                            onClick={() => onGemActionClick(refinerOutput.gem.action)}
                                            className="px-4 py-2 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 rounded-full text-brand-400 text-sm font-medium transition-all group/gem-action"
                                        >
                                            <span className="flex items-center gap-2">
                                                <span className="text-xs">✨</span>
                                                {refinerOutput.gem.action}
                                                <span className="opacity-0 group-hover/gem-action:opacity-100 transition-opacity ml-1">→</span>
                                            </span>
                                        </button>
                                    </div>
                                )}

                                {longAnswer && (
                                    <div className="text-base leading-relaxed text-text-primary">
                                        <MarkdownDisplay
                                            content={cleanAntagonistResponse(String(longAnswer))}
                                        />
                                    </div>
                                )}

                                {/* Artifact badges */}
                                {artifacts.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2 justify-center">
                                        {artifacts.map((artifact: any, idx: number) => (
                                            <button
                                                key={idx}
                                                onClick={() => onArtifactClick(artifact)}
                                                className="bg-gradient-to-br from-brand-500 to-brand-600 border border-brand-400 rounded-lg px-3 py-2 text-text-primary text-sm font-medium cursor-pointer flex items-center gap-1.5 hover:-translate-y-px hover:shadow-glow-brand-soft transition-all"
                                            >
                                                📄 {artifact.title}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {refinerOutput?.leap?.action && (
                                    <div className="mt-6 pt-4 border-t border-border-subtle/40">
                                        <div className="text-base font-semibold text-text-primary mb-1">
                                            {refinerOutput.leap.action}
                                        </div>
                                        {refinerOutput.leap.rationale && (
                                            <div className="text-sm text-text-secondary leading-relaxed italic opacity-85">
                                                {refinerOutput.leap.rationale}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    }

                    return (
                        <div className="flex flex-col items-center justify-center h-full text-text-muted italic relative z-10 w-full">
                            {isMappingLoading ? (
                                <div className="flex items-center gap-2 py-4">
                                    <span>Analyzing sources...</span>
                                    <span className="streaming-dots" />
                                </div>
                            ) : (
                                <>
                                    <div className={clsx(!hasMappingData && "py-4")}>
                                        Synthesis unavailable.
                                    </div>
                                    {hasMappingData && actionBar}
                                </>
                            )}
                        </div>
                    );
                })()}

                {/* Antagonist Card */}
                <AntagonistCard
                    aiTurn={aiTurn}
                    activeProviderId={activeAntagonistPid || undefined}
                    onProviderSelect={(pid) => onClipClick("antagonist", pid)}
                />

                {/* Provider Errors (if any) */}
                {
                    Object.entries(providerErrors || {}).length > 0 && (
                        <div className="provider-errors-section mt-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-text-secondary">⚠️ Some providers encountered issues</span>
                                {retryableProviders.length > 0 && aiTurn.sessionId && (
                                    <button
                                        onClick={onRetryAll}
                                        className="provider-error-card__retry-btn"
                                    >
                                        🔄 Retry All ({retryableProviders.length})
                                    </button>
                                )}
                            </div>
                            {Object.entries(providerErrors).map(([pid, error]) => (
                                <ProviderErrorCard
                                    key={pid}
                                    providerId={pid}
                                    providerName={getProviderName(pid)}
                                    error={error as any}
                                    // ✅ FIX: Only pass the function if retryable AND session exists.
                                    // Otherwise pass undefined to hide the button.
                                    onRetry={
                                        (error as any)?.retryable && aiTurn.sessionId
                                            ? () => onRetryProvider(pid)
                                            : undefined
                                    }
                                />
                            ))}
                        </div>
                    )
                }

                {/* BOTTOM TRAY: Council Orbs - Centered */}
                <div
                    className={clsx(
                        "absolute bottom-4 left-0 right-0 flex items-center justify-center z-30 transition-opacity duration-300 ease-out pointer-events-none",
                        isThisTurnActive
                            ? "opacity-100"
                            : "opacity-0 group-hover/turn:opacity-100 focus-within:opacity-100"
                    )}
                >
                    <div className="pointer-events-auto flex items-center gap-2">
                        <CouncilOrbs
                            turnId={aiTurn.id}
                            providers={providersConfig}
                            voiceProviderId={displayedVoicePid}
                            visibleProviderIds={visibleProviderIds}
                            onOrbClick={onOrbClick}
                            onTrayExpand={onDecisionMapOpen}
                            isTrayExpanded={isDecisionMapOpen}
                            variant="historical"
                            workflowProgress={isThisTurnActive ? workflowProgress : undefined}
                        />
                    </div>

                    {isThisTurnActive && (
                        <div className="absolute top-full mt-2 text-[11px] text-text-muted opacity-60 pointer-events-none whitespace-nowrap">
                            Click a glowing orb to see that response
                        </div>
                    )}
                </div>

                {/* BOTTOM RIGHT: Recompute Icon Button */}
                {
                    !isThisTurnActive && (
                        <div 
                            className={clsx(
                                "absolute bottom-6 right-10 z-30 pointer-events-auto transition-opacity duration-300",
                                isRecomputeMenuOpen 
                                    ? "opacity-100" 
                                    : "opacity-0 group-hover/turn:opacity-100 focus-within:opacity-100"
                            )}
                        >
                            <div 
                                className="relative"
                                onMouseEnter={handleRecomputeEnter}
                                onMouseLeave={handleRecomputeLeave}
                            >
                                <button
                                    className="flex items-center justify-center w-8 h-8 bg-surface-raised/80 border border-border-subtle rounded-full text-sm hover:bg-surface-highlight hover:scale-110 transition-all shadow-sm"
                                    title="Recompute synthesis"
                                >
                                    <span className="text-brand-400">⚡</span>
                                </button>

                                {isRecomputeMenuOpen && (
                                    <div className="absolute bottom-full right-0 mb-2 min-w-[140px] bg-surface-raised border border-border-subtle rounded-xl shadow-elevated p-1.5 transition-all animate-in fade-in zoom-in-95 duration-150">
                                        <div className="text-[10px] text-text-muted px-2 py-1 font-medium uppercase tracking-wider">Recompute</div>
                                        {providersConfig.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onClipClick("synthesis", String(p.id));
                                                }}
                                                className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-surface-highlight text-text-secondary hover:text-text-primary flex items-center gap-2"
                                            >
                                                <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: p.color || '#ccc' }} />
                                                {p.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                }
            </div >
        );
    },
    (prev, next) => {
        // ✅ CRITICAL: Custom equality check
        // Only re-render if something that affects THIS bubble changed.
        return (
            prev.aiTurn.id === next.aiTurn.id &&
            prev.aiTurn.synthesisVersion === next.aiTurn.synthesisVersion &&
            prev.aiTurn.refinerVersion === next.aiTurn.refinerVersion &&
            prev.aiTurn.antagonistVersion === next.aiTurn.antagonistVersion && // Included as per user request
            prev.aiTurn.mappingVersion === next.aiTurn.mappingVersion &&
            prev.activeSynthTabId === next.activeSynthTabId &&
            prev.showEcho === next.showEcho &&
            prev.isRefinerLoading === next.isRefinerLoading &&
            prev.isMappingLoading === next.isMappingLoading &&
            prev.isMappingError === next.isMappingError &&
            prev.isThisTurnActive === next.isThisTurnActive &&
            prev.workflowProgress === next.workflowProgress &&
            prev.isDecisionMapOpen === next.isDecisionMapOpen &&
            prev.includePromptInCopy === next.includePromptInCopy &&
            prev.refinerOutput === next.refinerOutput &&
            prev.activeAntagonistPid === next.activeAntagonistPid &&
            prev.effectiveActiveSynthTab?.id === next.effectiveActiveSynthTab?.id &&
            prev.effectiveActiveSynthTab?.response?.status === next.effectiveActiveSynthTab?.response?.status &&
            prev.effectiveActiveSynthTab?.response?.text === next.effectiveActiveSynthTab?.response?.text &&
            prev.providerErrors === next.providerErrors
        );
    }
);
