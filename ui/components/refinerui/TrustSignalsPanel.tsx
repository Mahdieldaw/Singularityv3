/**
 * TrustSignalsPanel - Simplified for new RefinerOutput structure.
 * Displays enhanced trust insights with attribution click handling.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { activeSplitPanelAtom, providerIdsForTurnFamily } from '../../state/atoms';
import type { RefinerOutput } from '../../../shared/parsing-utils';
import { LLM_PROVIDERS_CONFIG } from '../../constants';
import { PipelineErrorBanner } from '../PipelineErrorBanner';
import { CopyButton } from '../CopyButton';
import { formatRefinerOutputForMd } from '../../utils/copy-format-utils';

interface TrustSignalsPanelProps {
  refiner: RefinerOutput | null;
  isLoading?: boolean;
  isError?: boolean;
  providerId?: string | null;
  onRetry?: (pid: string) => void;
  rawText?: string;
  onClose?: () => void;
  bottomPadding?: number;
  turnId?: string;
  error?: any;
}

function parseAttributions(text: string, onModelClick: (modelName: string) => void): React.ReactNode {
  if (!text) return null;

  const parts = text.split(/(\[[^\]]+\])/g);

  return parts.map((part, index) => {
    const match = part.match(/^\[([^\]]+)\]$/);
    if (match) {
      const modelName = match[1];
      return (
        <button
          key={index}
          onClick={() => onModelClick(modelName)}
          className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-brand-500/10 text-brand-400 text-xs font-medium hover:bg-brand-500/20 transition-colors cursor-pointer underline decoration-dotted"
          title={`View ${modelName}'s response`}
        >
          {part}
        </button>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export function TrustSignalsPanel({
  refiner,
  isLoading,
  isError,
  providerId,
  onRetry,
  rawText,
  onClose,
  bottomPadding,
  turnId,
  error
}: TrustSignalsPanelProps) {
  const [showRaw, setShowRaw] = useState(false);
  const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
  const providerIds = useAtomValue(turnId ? providerIdsForTurnFamily(turnId) : providerIdsForTurnFamily(""));

  const providersById = useMemo(() => {
    const map: Record<string, { id: string; name: string }> = {};
    LLM_PROVIDERS_CONFIG.forEach((p) => {
      map[String(p.id)] = { id: String(p.id), name: p.name };
    });
    return map;
  }, []);

  const handleModelClick = useCallback((modelName: string) => {
    if (!turnId) return;

    const normalized = modelName.toLowerCase().trim();
    const compact = normalized.replace(/\s+/g, "");

    const candidateIds = providerIds && providerIds.length > 0
      ? providerIds
      : LLM_PROVIDERS_CONFIG.map((p) => String(p.id));

    let matchedId: string | null = null;

    // 1. Direct match with name or ID
    for (const pid of candidateIds) {
      const cfg = providersById[pid] || { id: pid, name: pid };
      const nameLower = cfg.name.toLowerCase();
      const nameCompact = nameLower.replace(/\s+/g, "");
      const idLower = cfg.id.toLowerCase();

      if (
        normalized === nameLower ||
        compact === nameCompact ||
        normalized === idLower ||
        nameLower.includes(normalized) ||
        normalized.includes(nameLower)
      ) {
        matchedId = cfg.id;
        break;
      }
    }

    // 2. Alias/Fuzzy match fallback
    if (!matchedId) {
      const aliases: Record<string, string[]> = {
        'chatgpt': ['gpt', 'openai', 'o1', 'o3'],
        'claude': ['anthropic', 'sonnet', 'opus', 'haiku'],
        'gemini': ['google', 'deepmind', 'pro', 'flash'],
        'qwen': ['alibaba', 'tongyi'],
      };

      for (const [pid, providerAliases] of Object.entries(aliases)) {
        if (providerAliases.some(alias => normalized.includes(alias) || alias.includes(normalized))) {
          // Verify if this provider is actually in candidateIds
          if (candidateIds.includes(pid)) {
            matchedId = pid;
            break;
          }
        }
      }
    }

    const providerId = matchedId || compact;
    setActiveSplitPanel({ turnId, providerId });
  }, [turnId, setActiveSplitPanel, providerIds, providersById]);

  return (
    <div className="flex flex-col h-full bg-surface-raised border-l border-border-subtle">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border-subtle bg-surface-raised">
        <div className="flex items-center gap-2">
          <span className="text-lg">✨</span>
          <span className="font-semibold text-text-primary">Trust Insights</span>
        </div>
        <div className="flex items-center gap-2">
          {refiner && (
            <CopyButton
              text={formatRefinerOutputForMd(refiner, providerId && providersById[providerId] ? providersById[providerId].name : undefined)}
              label="Copy Trust Insights"
              variant="icon"
            />
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-4 space-y-4 shadow-inner"
        style={{ paddingBottom: bottomPadding ?? 160 }}
      >
        {isError && (
          <div className="py-2">
            <PipelineErrorBanner
              type="refiner"
              failedProviderId={providerId || ""}
              onRetry={onRetry || (() => { })}
              errorMessage={error?.message}
              requiresReauth={!!error?.requiresReauth}
              compact
            />
          </div>
        )}

        {refiner?.gem && (
          <div className="gem-callout bg-gradient-to-br from-amber-400/10 via-amber-50/5 to-white/0 border border-amber-400/40 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-sm text-text-primary flex items-center gap-2">
                <span>💎</span>
                <span>The Insight</span>
              </div>
              {refiner.gem?.source && (
                <button
                  onClick={() => handleModelClick(refiner.gem?.source || '')}
                  className="gem-link text-[11px] text-brand-400 hover:text-brand-300 underline decoration-dotted cursor-pointer"
                >
                  See full →
                </button>
              )}
            </div>
            <div className="gem-content text-sm text-text-primary leading-relaxed mb-2">
              {refiner.gem?.insight}
            </div>
            {refiner.gem?.impact && (
              <div className="text-sm text-text-secondary italic mb-2">
                {refiner.gem.impact}
              </div>
            )}
            {refiner.gem?.source && (
              <div className="gem-source text-xs text-text-muted flex items-center justify-between">
                <span>— {refiner.gem.source}</span>
              </div>
            )}
          </div>
        )}

        {refiner?.trustInsights ? (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <div className="text-text-primary leading-relaxed">
              {parseAttributions(refiner.trustInsights, handleModelClick)}
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center gap-2 text-text-muted py-8">
            <span className="italic">Generating trust insights...</span>
            <span className="streaming-dots" />
          </div>
        ) : !isError && !refiner?.gem && (
          <div className="text-text-muted italic text-center py-8">
            No trust insights available.
          </div>
        )}

        <hr className="border-border-subtle" />

        {/* Raw Output Toggle */}
        {rawText && (
          <div>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="text-xs text-text-muted hover:text-text-secondary transition-colors"
            >
              {showRaw ? '▼ Hide Raw Output' : '▶ Show Raw Output'}
            </button>
            {showRaw && (
              <div className="mt-2 bg-black/40 rounded-lg p-4 font-mono text-xs text-white/60 whitespace-pre-wrap border border-white/10 overflow-x-auto max-h-64 shadow-inner">
                {rawText}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default TrustSignalsPanel;
