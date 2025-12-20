/**
 * TrustSignalsPanel - Simplified for new RefinerOutput structure.
 * Now displays only SynthesisPlus content with attribution click handling.
 */

import React, { useState, useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { activeSplitPanelAtom } from '../../state/atoms';
import type { RefinerOutput } from '../../../shared/parsing-utils';
import MarkdownDisplay from '../MarkdownDisplay';

interface TrustSignalsPanelProps {
  refiner: RefinerOutput;
  rawText?: string;
  onClose?: () => void;
  bottomPadding?: number;
  turnId?: string;
}

/**
 * Parse [ModelName] attributions from synthesisPlus text and make them clickable
 */
function parseAttributions(text: string, onModelClick: (modelName: string) => void): React.ReactNode {
  if (!text) return null;

  // Split by [ModelName] patterns
  const parts = text.split(/(\[[A-Z][a-zA-Z]+\])/g);

  return parts.map((part, index) => {
    // Check if this is a [ModelName] pattern
    const match = part.match(/^\[([A-Z][a-zA-Z]+)\]$/);
    if (match) {
      const modelName = match[1];
      return (
        <button
          key={index}
          onClick={() => onModelClick(modelName)}
          className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-brand-500/10 text-brand-400 text-sm font-medium hover:bg-brand-500/20 transition-colors cursor-pointer"
          title={`View ${modelName}'s response`}
        >
          {modelName}
        </button>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export function TrustSignalsPanel({
  refiner,
  rawText,
  onClose,
  bottomPadding,
  turnId
}: TrustSignalsPanelProps) {
  const [showRaw, setShowRaw] = useState(false);
  const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);

  // Handle attribution clicks - map model name to provider ID and open split pane
  const handleModelClick = useCallback((modelName: string) => {
    if (!turnId) return;

    // Map common model names to provider IDs
    const modelToProviderId: Record<string, string> = {
      'Claude': 'anthropic',
      'Anthropic': 'anthropic',
      'Gemini': 'google',
      'Google': 'google',
      'GPT': 'openai',
      'OpenAI': 'openai',
      'ChatGPT': 'openai',
      'Grok': 'grok',
      'DeepSeek': 'deepseek',
      'Mistral': 'mistral',
    };

    const providerId = modelToProviderId[modelName] || modelName.toLowerCase();
    setActiveSplitPanel({ turnId, providerId });
  }, [turnId, setActiveSplitPanel]);

  return (
    <div className="flex flex-col h-full bg-surface-raised border-l border-border-subtle">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border-subtle bg-surface-raised">
        <div className="flex items-center gap-2">
          <span className="text-lg">✨</span>
          <span className="font-semibold text-text-primary">Synthesis+</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{ paddingBottom: bottomPadding ?? 160 }}
      >
        {/* SynthesisPlus Content */}
        {refiner.synthesisPlus ? (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <div className="text-text-primary leading-relaxed">
              {parseAttributions(refiner.synthesisPlus, handleModelClick)}
            </div>
          </div>
        ) : (
          <div className="text-text-muted italic text-center py-8">
            No enhanced synthesis available.
          </div>
        )}

        {/* Gem Card (if present) */}
        {refiner.gem && (
          <div className="p-4 bg-gradient-to-br from-amber-500/10 to-yellow-500/10 border border-amber-500/20 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">✨</span>
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Hidden Gem</span>
            </div>
            <div className="text-sm text-text-primary">{refiner.gem.insight}</div>
            {refiner.gem.source && (
              <div className="text-xs text-text-muted mt-2">Source: {refiner.gem.source}</div>
            )}
            {refiner.gem.impact && (
              <div className="text-xs text-amber-300/80 mt-1">Impact: {refiner.gem.impact}</div>
            )}
          </div>
        )}

        {/* Outlier Card (if present) */}
        {refiner.outlier && (
          <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🎯</span>
              <span className="text-xs font-semibold text-violet-400 uppercase tracking-wide">Dissenting View</span>
            </div>
            <div className="text-sm text-text-primary">{refiner.outlier.position}</div>
            {refiner.outlier.source && (
              <div className="text-xs text-text-muted mt-2">Source: {refiner.outlier.source}</div>
            )}
            {refiner.outlier.why && (
              <div className="text-xs text-violet-300/80 mt-1">Why: {refiner.outlier.why}</div>
            )}
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
              <div className="mt-2 bg-black/40 rounded-lg p-4 font-mono text-xs text-white/60 whitespace-pre-wrap border border-white/10 overflow-x-auto max-h-64">
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
