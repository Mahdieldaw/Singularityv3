// ui/components/ModelResponsePanel.tsx
// Enhanced single-provider response panel for split pane view
// Migrated features from deprecated ProviderCard.tsx and ProviderResponseBlock.tsx

import React, { useState, useCallback, useMemo } from "react";
import { useAtomValue } from "jotai";
import {
    providerEffectiveStateFamily,
    turnStreamingStateFamily,
    activeRecomputeStateAtom,
    chatInputHeightAtom,
} from "../state/atoms";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import { useProviderActions } from "../hooks/providers/useProviderActions";
import MarkdownDisplay from "./MarkdownDisplay";
import { ArtifactOverlay, Artifact } from "./ArtifactOverlay";
import { ChevronDownIcon, ChevronUpIcon } from "./Icons";
import { CopyButton } from "./CopyButton";
import { formatProviderResponseForMd } from "../utils/copy-format-utils";
import { useRefinerOutput } from "../hooks/useRefinerOutput";
import { TrustSignalsPanel } from "./refinerui/TrustSignalsPanel";
import { useClipActions } from "../hooks/useClipActions";
import clsx from "clsx";

// BuriedInsightCard removed - no longer using signals

interface ModelResponsePanelProps {
    turnId: string;
    providerId: string;
    sessionId?: string;
    onClose: () => void;
}

export const ModelResponsePanel: React.FC<ModelResponsePanelProps> = React.memo(({
    turnId,
    providerId,
    sessionId,
    onClose
}) => {
    // State subscriptions
    const effectiveState = useAtomValue(
        useMemo(() => providerEffectiveStateFamily({ turnId, providerId }), [turnId, providerId])
    );
    const streamingState = useAtomValue(turnStreamingStateFamily(turnId));
    const activeRecompute = useAtomValue(activeRecomputeStateAtom);

    // Actions hook
    const { handleRetryProvider, handleBranchContinue, handleToggleTarget, activeTarget } =
        useProviderActions(sessionId, turnId);
    const { handleClipClick } = useClipActions();

    // Local state
    const [showHistory, setShowHistory] = useState(false);
    const [branchInput, setBranchInput] = useState('');
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

    // Config
    const provider = LLM_PROVIDERS_CONFIG.find(p => String(p.id) === providerId);
    const { latestResponse, historyCount, allResponses } = effectiveState;

    // Derived state with memoization
    const derivedState = useMemo(() => {
        const status = latestResponse?.status || 'pending';
        const text = latestResponse?.text || '';
        const artifacts = (latestResponse?.artifacts || []) as Artifact[];
        const hasText = !!text.trim();
        const isStreaming = status === 'streaming' || streamingState.activeProviderId === providerId;
        const isError = status === 'error' || (status as string) === 'failed' || (status as string) === 'skipped';
        const errorMsg = (latestResponse?.meta as any)?.error || (latestResponse?.meta as any)?.skippedReason || ((status as string) === 'skipped' ? "Skipped by system" : "Error occurred");

        return { status, text, hasText, isStreaming, isError, artifacts, errorMsg };
    }, [latestResponse, streamingState.activeProviderId, providerId]);

    const {
        output: refinerOutput,
        isLoading: isRefinerLoading,
        isError: isRefinerError,
        providerId: refinerPid,
        rawText: refinerRawText
    } = useRefinerOutput(turnId);
    const chatInputHeight = useAtomValue(chatInputHeightAtom);

    // Branch send handler (hook before conditional return)
    const handleBranchSend = useCallback(() => {
        if (!branchInput.trim()) return;
        handleBranchContinue(providerId, branchInput);
        setBranchInput('');
    }, [branchInput, handleBranchContinue, providerId]);


    // Trust mode via sentinel providerId - simplified for new structure
    if (providerId === '__trust__') {
        return (
            <div className="h-full w-full min-w-0 flex flex-col bg-surface-raised border border-border-subtle rounded-2xl shadow-lg overflow-hidden">
                <TrustSignalsPanel
                    refiner={refinerOutput}
                    isLoading={isRefinerLoading}
                    isError={isRefinerError}
                    providerId={refinerPid}
                    onRetry={(pid) => handleClipClick(turnId, "refiner", pid)}
                    rawText={refinerRawText || undefined}
                    onClose={onClose}
                    bottomPadding={(chatInputHeight || 80) + 32}
                    turnId={turnId}
                />
            </div>
        );
    }

    // Branching visual state
    const isBranching = activeRecompute?.providerId === providerId &&
        activeRecompute?.aiTurnId === turnId &&
        activeRecompute?.stepType === 'batch';

    // Is this provider targeted for branch input?
    const isTargeted = activeTarget?.providerId === providerId;
    const hasHistory = historyCount > 1;

    // Empty/loading state
    if (!latestResponse && !derivedState.isError) {
        return (
            <div className="h-full w-full min-w-0 flex flex-col items-center justify-center bg-surface-raised border border-border-subtle rounded-2xl shadow-lg">
                <div className="text-text-muted text-sm animate-pulse">Waiting for response...</div>
            </div>
        );
    }

    return (
        <div className={clsx(
            "h-full w-full min-w-0 flex flex-col bg-surface-raised border border-border-subtle rounded-2xl shadow-lg overflow-hidden animate-in slide-in-from-right duration-300",
            isBranching && "ring-2 ring-brand-500/50"
        )}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-surface-raised flex-shrink-0">
                <div className="flex items-center gap-2">
                    {/* Status LED */}
                    <div className={clsx(
                        "w-2 h-2 rounded-full transition-colors",
                        derivedState.isStreaming && "bg-intent-warning animate-pulse",
                        derivedState.status === 'completed' && derivedState.hasText && "bg-intent-success",
                        derivedState.status === 'completed' && !derivedState.hasText && "bg-intent-warning",
                        derivedState.isError && "bg-intent-danger"
                    )} />

                    {/* Provider info */}
                    {provider?.logoSrc && (
                        <img src={provider.logoSrc} alt={provider.name} className="w-5 h-5 rounded" />
                    )}
                    <h3 className="text-sm font-medium text-text-primary m-0">
                        {provider?.name || providerId}
                    </h3>

                    {/* Branching indicator */}
                    {isBranching && (
                        <span className="text-xs bg-brand-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                            Branching...
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {/* Branch toggle button */}
                    <button
                        onClick={() => handleToggleTarget(providerId)}
                        className={clsx(
                            "text-xs px-2 py-1 rounded transition-colors",
                            isTargeted
                                ? "bg-brand-500 text-white"
                                : "text-text-muted hover:bg-surface-highlight hover:text-text-primary"
                        )}
                        title="Continue conversation with this provider"
                    >
                        🌿 Branch
                    </button>

                    {/* Retry button (for errors or empty responses) */}
                    {(derivedState.isError || (derivedState.status === 'completed' && !derivedState.hasText)) && (
                        <button
                            onClick={() => handleRetryProvider(providerId)}
                            className="text-xs bg-intent-danger/20 text-intent-danger px-2 py-1 rounded hover:bg-intent-danger/30 transition-colors"
                            title="Retry this provider"
                        >
                            🔄 Retry
                        </button>
                    )}

                    {/* Copy button */}
                    {derivedState.hasText && (
                        <CopyButton
                            text={formatProviderResponseForMd(
                                latestResponse!,
                                provider?.name || providerId
                            )}
                            label="Copy response"
                            variant="icon"
                        />
                    )}

                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="text-text-muted hover:text-text-primary transition-colors p-1 rounded-md hover:bg-surface-highlight"
                        aria-label="Close panel"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar relative z-10" style={{ paddingBottom: (chatInputHeight || 80) + 24 }}>
                {/* Main response */}
                <div className="prose prose-sm max-w-none dark:prose-invert break-words" style={{ overflowWrap: 'anywhere' }}>
                    <MarkdownDisplay content={derivedState.text || ((derivedState as any).errorMsg || (derivedState.isError ? "Error occurred" : "Empty response"))} />
                    {derivedState.isStreaming && <span className="streaming-dots" />}
                </div>

                {/* Artifact badges */}
                {derivedState.artifacts.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                        {derivedState.artifacts.map((artifact, idx) => (
                            <button
                                key={idx}
                                onClick={() => setSelectedArtifact(artifact)}
                                className="bg-gradient-to-br from-brand-500/20 to-brand-600/20 border border-brand-500/30 rounded-lg px-3 py-2 text-sm flex items-center gap-1.5 hover:bg-brand-500/30 hover:-translate-y-px transition-all cursor-pointer"
                            >
                                📄 {artifact.title}
                            </button>
                        ))}
                    </div>
                )}

                {/* History Stack */}
                {hasHistory && (
                    <div className="mt-6 pt-4 border-t border-border-subtle">
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className="w-full flex items-center justify-between text-xs text-text-muted hover:text-text-primary transition-colors py-1"
                        >
                            <span>{historyCount - 1} previous version(s)</span>
                            {showHistory ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronUpIcon className="w-3 h-3" />}
                        </button>

                        {showHistory && (
                            <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
                                {allResponses.slice(0, -1).reverse().map((resp, idx) => {
                                    const histText = resp.text || '';
                                    const histArtifacts = (resp.artifacts || []) as Artifact[];
                                    const hasContent = histText || histArtifacts.length > 0;

                                    return (
                                        <div
                                            key={idx}
                                            className="bg-surface p-3 rounded-lg border border-border-subtle opacity-75 hover:opacity-100 transition-opacity"
                                        >
                                            <div className="text-xs text-text-muted mb-2 flex justify-between">
                                                <span>Attempt {historyCount - 1 - idx}</span>
                                                <span>{new Date(resp.createdAt).toLocaleTimeString()}</span>
                                            </div>
                                            <div className="prose prose-sm max-w-none dark:prose-invert text-xs line-clamp-4 hover:line-clamp-none transition-all">
                                                {hasContent ? (
                                                    <>
                                                        <MarkdownDisplay content={histText || '*Artifact only*'} />
                                                        {histArtifacts.length > 0 && (
                                                            <div className="mt-2 flex flex-wrap gap-1">
                                                                {histArtifacts.map((art, i) => (
                                                                    <span
                                                                        key={i}
                                                                        onClick={() => setSelectedArtifact(art)}
                                                                        className="text-xs bg-brand-500/10 text-brand-500 px-1.5 py-0.5 rounded border border-brand-500/20 cursor-pointer hover:bg-brand-500/20"
                                                                    >
                                                                        📄 {art.title}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="text-text-muted italic">Empty response</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Branch Input (shown when targeted) */}
            {isTargeted && (
                <div className="p-3 border-t border-brand-500/30 bg-brand-500/5 flex-shrink-0 animate-in slide-in-from-bottom-2 duration-200">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={branchInput}
                            onChange={(e) => setBranchInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleBranchSend();
                                }
                                if (e.key === 'Escape') {
                                    e.preventDefault();
                                    handleToggleTarget(providerId);
                                }
                            }}
                            placeholder={`Continue with ${provider?.name || providerId}...`}
                            className="flex-1 bg-surface border border-border-subtle rounded px-3 py-2 text-sm focus:outline-none focus:border-brand-500 transition-colors"
                            autoFocus
                        />
                        <button
                            onClick={handleBranchSend}
                            disabled={!branchInput.trim() || isBranching}
                            className="bg-brand-500 text-white px-4 py-2 rounded text-sm disabled:opacity-50 hover:bg-brand-600 transition-colors"
                        >
                            Send
                        </button>
                    </div>
                    <div className="text-xs text-text-muted mt-1.5 px-1">Enter to send • ESC to cancel</div>
                </div>
            )}

            {/* Artifact Overlay */}
            {selectedArtifact && (
                <ArtifactOverlay
                    artifact={selectedArtifact}
                    onClose={() => setSelectedArtifact(null)}
                />
            )}
        </div>
    );
});

ModelResponsePanel.displayName = 'ModelResponsePanel';
