// ui/components/refinerui/TrustSignalsPanel.tsx

import React, { useState } from 'react';
import MarkdownDisplay from "../MarkdownDisplay";
import type { RefinerOutput } from '../../../shared/parsing-utils';
import {
  getHonestAssessment,
  hasVerificationNeeded,
  getVerificationItems,
  getMissedInsights,
  getOverclaimed,
  getPreserved,
  getGapIcon,
  formatConfidence,
  getConfidenceColor,
  getConfidenceBar,
} from '../../utils/refiner-helpers';

interface TrustSignalsPanelProps {
  refiner: RefinerOutput;
  rawText?: string;
  onClose?: () => void;
  bottomPadding?: number;
}

export function TrustSignalsPanel({ refiner, rawText, onClose, bottomPadding }: TrustSignalsPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section); else next.add(section);
      return next;
    });
  };

  const verificationItems = getVerificationItems(refiner);
  const missedInsights = getMissedInsights(refiner);
  const overclaimed = getOverclaimed(refiner);
  const preserved = getPreserved(refiner);
  const { filled, empty } = getConfidenceBar(refiner.confidenceScore);
  const { reliabilitySummary } = getHonestAssessment(refiner);

  return (
    <div className="flex flex-col h-full bg-surface-raised border-l border-border-subtle">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border-subtle bg-surface-raised">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔍</span>
          <span className="font-semibold text-text-primary">Trust Signals</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            ✕
          </button>
        )}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ paddingBottom: (bottomPadding ?? 160) }}>
        {/* Confidence Section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${getConfidenceColor(refiner.confidenceScore)}`}>
              {formatConfidence(refiner.confidenceScore)}
            </span>
            <span className="text-text-muted text-sm">Confidence</span>
          </div>
          <div className="flex gap-0.5">
            {Array(filled).fill(0).map((_, i) => (
              <div key={`f-${i}`} className="w-2 h-3 bg-brand-500 rounded-sm" />
            ))}
            {Array(empty).fill(0).map((_, i) => (
              <div key={`e-${i}`} className="w-2 h-3 bg-border-subtle rounded-sm" />
            ))}
          </div>
          {reliabilitySummary && (
            <div className="text-xs text-text-secondary mt-1">{reliabilitySummary}</div>
          )}
        </div>

        {/* Why This Score (Collapsible) */}
        {refiner.rationale && (
          <CollapsibleSection
            title="Why this score"
            isExpanded={expandedSections.has('rationale')}
            onToggle={() => toggleSection('rationale')}
          >
            <div className="prose prose-sm max-w-none dark:prose-invert text-text-secondary">
              <MarkdownDisplay content={refiner.rationale} />
            </div>
          </CollapsibleSection>
        )}

        <hr className="border-border-subtle" />

        {/* Verification Needed */}
        {hasVerificationNeeded(refiner) && (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span>🔍</span>
                <span className="font-medium text-amber-600">
                  Verification Needed ({verificationItems.length})
                </span>
              </div>
              <ul className="space-y-2">
                {verificationItems.map((item, idx) => (
                  <li
                    key={idx}
                    className="text-sm bg-amber-500/10 p-3 rounded border border-amber-500/20 text-text-primary"
                  >
                    <div className="font-medium prose prose-sm max-w-none">
                      <MarkdownDisplay content={`"${item.claim}"`} className="text-text-primary" />
                    </div>
                    {item.why && (
                      <div className="text-xs mt-1 prose prose-xs max-w-none">
                        <MarkdownDisplay content={`Why: ${item.why}`} className="text-text-secondary" />
                      </div>
                    )}
                    {item.sourceType && (
                      <div className="text-xs mt-1 text-text-secondary">
                        Check: {item.sourceType}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <hr className="border-border-subtle" />
          </>
        )}

        {/* Gaps */}
        {refiner.gaps?.length > 0 && (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span>🕳</span>
                <span className="font-medium text-text-primary">Gaps ({refiner.gaps.length})</span>
              </div>
              <ul className="space-y-2">
                {refiner.gaps.map((gap, idx) => (
                  <li key={idx} className="text-sm">
                    <CollapsibleSection
                      title={
                        <span className="flex items-center gap-2">
                          <span>{getGapIcon(gap.category)}</span>
                          <span>{gap.title}</span>
                        </span>
                      }
                      isExpanded={expandedSections.has(`gap-${idx}`)}
                      onToggle={() => toggleSection(`gap-${idx}`)}
                      compact
                    >
                      <p className="text-text-secondary text-xs">{gap.explanation}</p>
                    </CollapsibleSection>
                  </li>
                ))}
              </ul>
            </div>
            <hr className="border-border-subtle" />
          </>
        )}

        {/* Synthesis Accuracy */}
        {refiner.synthesisAccuracy && (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span>⚖️</span>
                <span className="font-medium text-text-primary">Synthesis Accuracy</span>
              </div>

              {preserved.length > 0 && (
                <CollapsibleSection
                  title={`✓ Preserved (${preserved.length})`}
                  isExpanded={expandedSections.has('preserved')}
                  onToggle={() => toggleSection('preserved')}
                  compact
                >
                  <ul className="text-xs text-text-secondary space-y-1">
                    {preserved.map((item, idx) => (
                      <li key={idx}>• {item}</li>
                    ))}
                  </ul>
                </CollapsibleSection>
              )}

              {overclaimed.length > 0 && (
                <CollapsibleSection
                  title={`⚠ Overclaimed (${overclaimed.length})`}
                  isExpanded={expandedSections.has('overclaimed')}
                  onToggle={() => toggleSection('overclaimed')}
                  compact
                >
                  <ul className="text-xs text-text-secondary space-y-1">
                    {overclaimed.map((item, idx) => (
                      <li key={idx}>• {item}</li>
                    ))}
                  </ul>
                </CollapsibleSection>
              )}

              {missedInsights.length > 0 && (
                <CollapsibleSection
                  title={`💎 Missed (${missedInsights.length})`}
                  isExpanded={expandedSections.has('missed')}
                  onToggle={() => toggleSection('missed')}
                  compact
                >
                  <ul className="text-xs text-text-secondary space-y-1">
                    {missedInsights.map((item, idx) => (
                      <li key={idx}>• {item.insight}{item.source ? (<span className="text-text-muted"> — {item.source}</span>) : null}</li>
                    ))}
                  </ul>
                </CollapsibleSection>
              )}
            </div>
            <hr className="border-border-subtle" />
          </>
        )}

        {/* Meta Pattern */}
        {refiner.metaPattern && (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span>🔮</span>
                <span className="font-medium text-text-primary">Meta-Pattern</span>
              </div>
              <p className="text-sm text-text-secondary">{refiner.metaPattern}</p>
            </div>
            <hr className="border-border-subtle" />
          </>
        )}

        {/* Mapper Audit */}
        {refiner.mapperAudit && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span>📋</span>
              <span className="font-medium text-text-primary">Mapper Coverage</span>
              {refiner.mapperAudit.complete ? (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">✓ Complete</span>
              ) : (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">⚠ {refiner.mapperAudit.unlistedOptions.length} unlisted</span>
              )}
            </div>
            {!refiner.mapperAudit.complete && refiner.mapperAudit.unlistedOptions.length > 0 && (
              <ul className="text-xs text-text-secondary space-y-1">
                {refiner.mapperAudit.unlistedOptions.map((opt, idx) => (
                  <li key={idx}>• <strong>{opt.title}</strong>: {opt.description}{opt.source ? (<span className="text-text-muted"> — {opt.source}</span>) : null}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Raw Output (Debug) */}
        {rawText && (
          <div className="pt-4">
            <CollapsibleSection
              title="View raw output"
              isExpanded={expandedSections.has('raw')}
              onToggle={() => toggleSection('raw')}
              compact
            >
              <pre className="text-xs bg-surface border border-border-subtle p-2 rounded overflow-x-auto max-h-64 text-text-secondary whitespace-pre-wrap break-words">
                {rawText}
              </pre>
            </CollapsibleSection>
          </div>
        )}
      </div>
    </div>
  );
}

// Helper Component
interface CollapsibleSectionProps {
  title: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  compact?: boolean;
}

function CollapsibleSection({ title, isExpanded, onToggle, children, compact }: CollapsibleSectionProps) {
  return (
    <div className={compact ? '' : 'bg-surface rounded p-2 border border-border-subtle'}>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left text-text-primary"
      >
        <span className="text-text-muted text-xs">
          {isExpanded ? '▾' : '▸'}
        </span>
        <span className={compact ? 'text-sm' : 'font-medium text-sm'}>
          {title}
        </span>
      </button>
      {isExpanded && (
        <div className="mt-2 pl-4">
          {children}
        </div>
      )}
    </div>
  );
}
