/**
 * @deprecated DEPRECATED: Side-by-side card layout removed.
 * Features migrated to ModelResponsePanel.
 * Keep for reference until new system verified. Do not extend.
 */
// ProviderCard.tsx - Isolated provider card component
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useAtomValue, useAtom, useSetAtom } from "jotai";
import {
    providerEffectiveStateFamily,
    providerHistoryExpandedFamily,
    providerContextsAtom,
    activeRecomputeStateAtom,
    toastAtom,
} from "../state/atoms";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import MarkdownDisplay from "./MarkdownDisplay";
import clsx from "clsx";


interface ProviderCardProps {
    turnId: string;
    providerId: string;
    isStreamingTarget: boolean; // Passed from parent
    isReducedMotion?: boolean;
    sessionId?: string;
    userTurnId: string;
    onRetry?: (providerId: string) => void;
    onToggleTarget?: (providerId: string) => void;
    onBranchContinue?: (providerId: string, prompt: string) => void;
    activeTarget?: { aiTurnId: string; providerId: string } | null;
    onCardClick?: (providerId: string) => void;
    isHighlighted?: boolean;
    isSwapSource?: boolean; // When this card is selected as the source for a swap
    hasSwapSource?: boolean; // When ANY card is selected as source (global swap mode)
    onArtifactOpen?: (artifact: { title: string; identifier: string; content: string }) => void;
}

const ProviderCard: React.FC<ProviderCardProps> = React.memo(({
    turnId,
    providerId,
    isStreamingTarget,
    isReducedMotion = false,
    sessionId,
    userTurnId,
    onRetry,
    onToggleTarget,
    onBranchContinue,
    activeTarget,
    onCardClick,
    isHighlighted = false,
    isSwapSource = false,
    hasSwapSource = false,
    onArtifactOpen,
}) => {
    // Subscribe to effective state for this provider
    const effectiveState = useAtomValue(
        useMemo(
            () => providerEffectiveStateFamily({ turnId, providerId }),
            [turnId, providerId]
        )
    );

    const { latestResponse, historyCount, allResponses } = effectiveState;

    // Provider context (rate limits, model info)
    const providerContexts = useAtomValue(providerContextsAtom);
    const context = providerContexts[providerId];

    // Active recompute state for branching indicator
    const activeRecompute = useAtomValue(activeRecomputeStateAtom);

    // Local state for history toggle
    const [showHistory, setShowHistory] = useAtom(
        useMemo(
            () => providerHistoryExpandedFamily(`${turnId}-${providerId}`),
            [turnId, providerId]
        )
    );

    // Inline branch input state
    const [branchInput, setBranchInput] = useState("");

    // Toast for copy feedback
    const setToast = useSetAtom(toastAtom);

    // Scroll attention state
    const [isScrollActive, setIsScrollActive] = useState(false);
    const scrollTimerRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = useCallback(() => {
        scrollTimerRef.current = setTimeout(() => {
            setIsScrollActive(true);
        }, 200);
    }, []);

    const handleMouseDown = useCallback(() => {
        if (scrollTimerRef.current) {
            clearTimeout(scrollTimerRef.current);
            scrollTimerRef.current = null;
        }
        setIsScrollActive(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
        if (scrollTimerRef.current) {
            clearTimeout(scrollTimerRef.current);
            scrollTimerRef.current = null;
        }
        setIsScrollActive(false);
    }, []);

    // Compute derived state with memoization
    const derivedState = useMemo(() => {
        const status = latestResponse?.status || "pending";
        const cleanText = latestResponse?.text || ""; // Backend already cleaned this
        const artifacts = latestResponse?.artifacts || []; // Pre-processed artifacts
        const hasText = !!cleanText.trim();
        const isStreaming = status === "streaming" || isStreamingTarget;
        const isError = status === "error";
        const provider = LLM_PROVIDERS_CONFIG.find((p) => p.id === providerId);

        const isTargeted = activeTarget?.providerId === providerId && activeTarget?.aiTurnId === turnId;

        const displayText = isError
            ? context?.errorMessage || cleanText || "Provider error"
            : cleanText || (status === "completed" ? "Empty Response" : getStatusText(status));

        return {
            status,
            text: cleanText,
            hasText,
            isStreaming,
            isError,
            provider,
            isTargeted,
            displayText,
            cleanText,
            artifacts, // Now read directly from state
        };
    }, [latestResponse, isStreamingTarget, providerId, activeTarget, turnId, context]);

    const { isTargeted, isStreaming } = derivedState; // Destructure for use in effects/callbacks if needed, but we use derivedState.isTargeted in render

    // Branching visual state
    const isBranching = activeRecompute?.providerId === providerId &&
        activeRecompute?.aiTurnId === turnId &&
        activeRecompute?.stepType === "batch";

    // Reset branch input when card is untargeted
    useEffect(() => {
        if (!derivedState.isTargeted) {
            setBranchInput("");
        }
    }, [derivedState.isTargeted]);

    // Branch send handler
    const handleBranchSend = useCallback(() => {
        if (!branchInput.trim() || !onBranchContinue) return;
        onBranchContinue(providerId, branchInput);
        setBranchInput("");
    }, [branchInput, onBranchContinue, providerId]);

    // Copy handler
    const handleCopy = useCallback(
        async (text: string) => {
            try {
                await navigator.clipboard.writeText(text);
                setToast({ id: Date.now(), message: "Copied to clipboard", type: "info" });
            } catch (error) {
                console.error("Failed to copy text:", error);
                setToast({ id: Date.now(), message: "Failed to copy", type: "error" });
            }
        },
        [setToast]
    );

    return (
        <div
            id={`provider-card-${turnId}-${providerId}`}
            onClick={(e) => {
                e.stopPropagation();
                if ((e.target as HTMLElement).closest("button, a, .provider-card-scroll")) return;
                onCardClick?.(providerId);
            }}
            className={clsx(
                "flex flex-col bg-surface-raised border rounded-2xl p-3",
                "shadow-card-sm flex-shrink-0 overflow-hidden",
                "flex-1 basis-[320px] min-w-[260px] max-w-[380px] w-full h-[300px]",
                "transition-[box-shadow,border-color] duration-300 relative",
                // Cursor logic:
                // If this is the source -> pointer (to deselect)
                // If swap mode is active (hasSwapSource) AND this is NOT source -> move (to swap)
                // Else -> pointer
                hasSwapSource && !isSwapSource ? "cursor-move" : "cursor-pointer",
                isHighlighted
                    ? "border-brand-500 shadow-glow-brand"
                    : derivedState.isTargeted
                        ? "border-brand-500 ring-2 ring-brand-500/50 shadow-glow-brand"
                        : isSwapSource
                            ? "border-brand-400 ring-2 ring-brand-400 shadow-glow-brand-soft bg-brand-500/5"
                            : "border-border-subtle hover:border-border-strong",
                isBranching && "animate-pulse-ring"
            )}
            aria-live="polite"
        >
            {isBranching && (
                <div className="absolute top-2 right-2 z-10 text-xs font-bold bg-brand-500 text-white px-2 py-0.5 rounded-full shadow-sm animate-in fade-in zoom-in duration-300">
                    Branching...
                </div>
            )}

            {/* Fixed Header */}
            <div className="flex items-center gap-2 mb-3 flex-shrink-0 h-6">
                {derivedState.provider?.logoSrc ? (
                    <img
                        src={derivedState.provider.logoSrc}
                        alt={derivedState.provider.name}
                        className="w-4 h-4 rounded object-contain"
                    />
                ) : (
                    derivedState.provider && (
                        <div
                            className={`model-logo ${derivedState.provider.logoBgClass} w-4 h-4 rounded`}
                        />
                    )
                )}
                <div className="font-medium text-xs text-text-muted">
                    {derivedState.provider?.name || providerId}
                </div>
                {derivedState.isTargeted && (
                    <div className="bg-brand-500 text-white text-xs px-1.5 py-0.5 rounded font-medium animate-in fade-in zoom-in duration-200">
                        Targeted
                    </div>
                )}
                {context && (
                    <div className="text-xs text-text-muted/70 ml-1">
                        {context.rateLimitRemaining && `(${context.rateLimitRemaining} left)`}
                        {context.modelName && ` • ${context.modelName}`}
                    </div>
                )}
                <div
                    className={clsx(
                        "ml-auto w-2 h-2 rounded-full",
                        getStatusClass(derivedState.status, derivedState.hasText),
                        derivedState.isStreaming && !isReducedMotion && "animate-pulse"
                    )}
                />
            </div>

            {/* Scrollable Content Area */}
            <div
                className={clsx(
                    "provider-card-scroll flex-1 overflow-x-hidden p-3 bg-surface-overlay rounded-lg min-h-0 relative group",
                    isScrollActive ? "overflow-y-auto" : "overflow-y-hidden"
                )}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onMouseDown={handleMouseDown}
                onWheelCapture={(e: React.WheelEvent<HTMLDivElement>) => {
                    if (!isScrollActive) return;
                    const el = e.currentTarget;
                    const dy = e.deltaY ?? 0;
                    const canDown = el.scrollTop + el.clientHeight < el.scrollHeight;
                    const canUp = el.scrollTop > 0;
                    if ((dy > 0 && canDown) || (dy < 0 && canUp)) {
                        e.stopPropagation();
                    }
                }}
            >
                <div className="prose prose-sm max-w-none dark:prose-invert text-sm leading-relaxed text-text-secondary">
                    <MarkdownDisplay content={String(derivedState.cleanText || derivedState.displayText || "")} />
                    {derivedState.isStreaming && <span className="streaming-dots" />}
                </div>

                {/* Artifact badges */}
                {derivedState.artifacts.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 justify-center">
                        {derivedState.artifacts.map((artifact, idx) => (
                            <button
                                key={idx}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onArtifactOpen?.(artifact);
                                }}
                                className="bg-gradient-to-br from-brand-500 to-brand-600 border border-brand-400 rounded-lg px-3 py-2 text-text-primary text-sm font-medium cursor-pointer flex items-center gap-1.5 hover:-translate-y-px hover:shadow-glow-brand-soft transition-all"
                            >
                                📄 {artifact.title}
                            </button>
                        ))}
                    </div>
                )}

                {/* History Stack (Previous Attempts) */}
                {showHistory && historyCount > 1 && (
                    <div className="mt-6 pt-4 border-t border-border-subtle space-y-4 animate-in slide-in-from-top-2 duration-200">
                        <div className="text-xs font-medium text-text-muted uppercase tracking-wider">
                            Previous Attempts
                        </div>
                        {allResponses.slice(0, -1).reverse().map((resp, idx) => {
                            const cleanText = resp.text || ""; // Already cleaned by backend
                            const histArtifacts = resp.artifacts || []; // Pre-processed
                            const hasContent = cleanText || histArtifacts.length > 0;

                            return (
                                <div
                                    key={idx}
                                    className="bg-surface p-3 rounded border border-border-subtle opacity-75 hover:opacity-100 transition-opacity"
                                >
                                    <div className="text-xs text-text-muted mb-1 flex justify-between">
                                        <span>Attempt {historyCount - 1 - idx}</span>
                                        <span>{new Date(resp.createdAt).toLocaleTimeString()}</span>
                                    </div>
                                    <div className="prose prose-sm max-w-none dark:prose-invert text-xs text-text-secondary line-clamp-3 hover:line-clamp-none transition-all">
                                        {hasContent ? (
                                            <>
                                                <MarkdownDisplay
                                                    content={cleanText || (histArtifacts.length ? "*Artifact content*" : resp.text)}
                                                />
                                                {histArtifacts.length > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1 justify-center">
                                                        {histArtifacts.map((art, i) => (
                                                            <span
                                                                key={i}
                                                                className="text-xs bg-brand-500/10 text-brand-500 px-1.5 py-0.5 rounded border border-brand-500/20 flex items-center gap-1"
                                                            >
                                                                📄 {art.title}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="text-text-muted italic opacity-70">
                                                No content available (empty response)
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Inline Branch Input (only when targeted) */}
            {derivedState.isTargeted && (
                <div className="mt-3 p-3 bg-brand-500/5 border border-brand-500/30 rounded-lg animate-in slide-in-from-bottom-2">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={branchInput}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setBranchInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleBranchSend();
                                }
                                if (e.key === "Escape") {
                                    e.preventDefault();
                                    onToggleTarget?.(providerId);
                                }
                            }}
                            placeholder={`Continue with ${derivedState.provider?.name || providerId}...`}
                            className="flex-1 bg-surface border border-border-subtle rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
                            autoFocus
                        />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleBranchSend();
                            }}
                            disabled={!branchInput.trim()}
                            className="bg-brand-500 text-white px-4 py-2 rounded text-sm disabled:opacity-50 hover:bg-brand-600"
                        >
                            Send
                        </button>
                    </div>
                    <div className="text-xs text-text-muted mt-1.5 px-1">Enter to send • ESC to cancel</div>
                </div>
            )}

            {/* Fixed Footer with actions */}
            <div className="mt-3 flex justify-between items-center flex-shrink-0 h-8">
                {/* Left: History Toggle */}
                {historyCount > 1 ? (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowHistory(!showHistory);
                        }}
                        className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1 px-1.5 py-1 rounded hover:bg-surface-highlight transition-colors"
                    >
                        {showHistory ? "▼" : "▶"} {historyCount - 1} previous
                    </button>
                ) : (
                    <div />
                )}

                {/* Right: Actions */}
                <div className="flex gap-2">
                    {/* Retry Button */}
                    {(derivedState.isError ||
                        (derivedState.status === "completed" && !derivedState.text?.trim())) &&
                        onRetry && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRetry(providerId);
                                }}
                                title="Retry this provider"
                                className="bg-intent-danger border border-intent-danger/80 rounded-md px-2 py-1 text-text-primary text-xs cursor-pointer flex items-center gap-1"
                            >
                                🔄 Retry
                            </button>
                        )}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(derivedState.text);
                        }}
                        className="bg-surface-raised border border-border-subtle rounded-md px-2 py-1 text-text-muted text-xs cursor-pointer hover:bg-surface-highlight transition-all"
                    >
                        📋 Copy
                    </button>
                </div>
            </div>
        </div>
    );
});

ProviderCard.displayName = "ProviderCard";

// Helper functions
function getStatusClass(status: string, hasText: boolean = true) {
    switch (status) {
        case "pending":
        case "streaming":
            return "bg-intent-warning";
        case "completed":
            return hasText ? "bg-intent-success" : "bg-intent-warning";
        case "error":
            return "bg-intent-danger";
        default:
            return "bg-text-muted";
    }
}

function getStatusText(status: string) {
    switch (status) {
        case "pending":
            return "Waiting...";
        case "streaming":
            return "Generating...";
        case "completed":
            return "Complete";
        case "error":
            return "Error";
        default:
            return "Unknown";
    }
}

export default ProviderCard;
