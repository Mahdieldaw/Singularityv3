import React, { useState } from "react";
import { useAtomValue } from "jotai";
import { providerEffectiveStateFamily } from "../state/atoms";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import MarkdownDisplay from "./MarkdownDisplay";
import { ChevronDownIcon, ChevronUpIcon } from "./Icons";
import { CopyButton } from "./CopyButton";
import { formatProviderResponseForMd } from "../utils/copy-format-utils";
import clsx from "clsx";

interface ModelResponsePanelProps {
    turnId: string;
    providerId: string;
    onClose: () => void;
}

export const ModelResponsePanel: React.FC<ModelResponsePanelProps> = React.memo(({
    turnId,
    providerId,
    onClose
}) => {
    const state = useAtomValue(providerEffectiveStateFamily({ turnId, providerId }));
    const provider = LLM_PROVIDERS_CONFIG.find(p => String(p.id) === providerId);
    const [showHistory, setShowHistory] = useState(false);

    if (!state.latestResponse) return null;

    const historyCount = state.historyCount || 0;
    const hasHistory = historyCount > 1;

    return (
        <div className="h-full w-full min-w-0 flex flex-col bg-surface-raised border border-border-subtle rounded-2xl shadow-lg overflow-hidden animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-surface-raised">
                <div className="flex items-center gap-2">
                    <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: provider?.color || 'var(--text-muted)' }}
                    />
                    <h3 className="text-sm font-medium text-text-primary m-0">
                        {provider?.name || providerId}
                    </h3>
                </div>
                <div className="flex items-center gap-1">
                    <CopyButton
                        text={formatProviderResponseForMd(
                            state.latestResponse,
                            provider?.name || providerId
                        )}
                        label="Copy response"
                        variant="icon"
                    />
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
            <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar">
                <div className="prose prose-sm max-w-none dark:prose-invert break-words" style={{ overflowWrap: 'anywhere' }}>
                    <MarkdownDisplay content={state.latestResponse.text || ""} />
                </div>
            </div>

            {/* Footer / History */}
            {hasHistory && (
                <div className="border-t border-border-subtle bg-surface-raised">
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="w-full flex items-center justify-between px-4 py-2 text-xs text-text-muted hover:bg-surface-highlight transition-colors"
                    >
                        <span>{historyCount - 1} previous version(s)</span>
                        {showHistory ? <ChevronDownIcon className="w-3 h-3" /> : <ChevronUpIcon className="w-3 h-3" />}
                    </button>

                    {showHistory && (
                        <div className="max-h-40 overflow-y-auto border-t border-border-subtle bg-surface">
                            {/* Placeholder for history list - can be expanded later */}
                            <div className="p-4 text-xs text-text-muted italic text-center">
                                History view coming soon
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});
