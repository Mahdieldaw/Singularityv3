/**
 * TrustSignalsPanel - Displays detailed trust signals in a side panel.
 * Updated for signal-based RefinerOutput structure.
 */

import React, { useEffect, useState } from 'react';
import type { RefinerOutput } from '../../../shared/parsing-utils';
import { SignalCard } from './SignalCard';
import { categorizeSignals, getSignalCounts } from '../../utils/signalUtils';
import { formatSignalSummary, getNextStepStyles } from '../../utils/refiner-helpers';

interface TrustSignalsPanelProps {
  refiner: RefinerOutput;
  rawText?: string;
  onClose?: () => void;
  bottomPadding?: number;
  initialSection?: 'blockers' | 'risks' | 'context' | null;
}

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  isExpanded: boolean;
  onToggle: () => void;
  priorityColor?: string;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  count,
  isExpanded,
  onToggle,
  priorityColor = 'text-text-muted',
  children
}) => (
  <div className="border border-border-subtle rounded-lg overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-3 bg-surface-raised hover:bg-surface-highlight transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className={`text-sm font-medium ${priorityColor}`}>{title}</span>
        {count !== undefined && count > 0 && (
          <span className="text-xs bg-surface-highlight px-2 py-0.5 rounded-full text-text-muted">
            {count}
          </span>
        )}
      </div>
      <span className={`text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
        ▼
      </span>
    </button>
    {isExpanded && (
      <div className="p-3 space-y-2 bg-surface">
        {children}
      </div>
    )}
  </div>
);

export function TrustSignalsPanel({ refiner, rawText, onClose, bottomPadding, initialSection }: TrustSignalsPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['blockers', 'risks']));
  const [showRaw, setShowRaw] = useState(false);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const { blockerSignals, riskSignals, enhancementSignals } = categorizeSignals(refiner.signals);
  const counts = getSignalCounts(refiner.signals);
  const summary = formatSignalSummary(refiner);
  const nextStepStyles = getNextStepStyles(refiner.nextStep?.action);

  useEffect(() => {
    if (!initialSection) return;

    const sectionKey =
      initialSection === 'context' ? 'enhancements' : initialSection === 'blockers' ? 'blockers' : 'risks';

    setExpandedSections(prev => {
      const next = new Set(prev);
      next.add(sectionKey);
      return next;
    });

    const id =
      initialSection === 'blockers'
        ? 'trust-blockers'
        : initialSection === 'risks'
        ? 'trust-risks'
        : 'trust-context';

    const handle = window.setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);

    return () => window.clearTimeout(handle);
  }, [initialSection]);

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
      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ paddingBottom: bottomPadding ?? 160 }}>
        {/* Summary */}
        <div className="text-sm text-text-secondary">
          {summary}
        </div>

        {/* Blocker Signals */}
        {blockerSignals.length > 0 && (
          <div id="trust-blockers">
            <CollapsibleSection
              title="🚫 Blockers"
              count={counts.blockers}
              isExpanded={expandedSections.has('blockers')}
              onToggle={() => toggleSection('blockers')}
              priorityColor="text-intent-danger"
            >
              {blockerSignals.map((signal, idx) => (
                <SignalCard key={idx} signal={signal} />
              ))}
            </CollapsibleSection>
          </div>
        )}

        {/* Risk Signals */}
        {riskSignals.length > 0 && (
          <div id="trust-risks">
            <CollapsibleSection
              title="⚠️ Risks"
              count={counts.risks}
              isExpanded={expandedSections.has('risks')}
              onToggle={() => toggleSection('risks')}
              priorityColor="text-intent-warning"
            >
              {riskSignals.map((signal, idx) => (
                <SignalCard key={idx} signal={signal} />
              ))}
            </CollapsibleSection>
          </div>
        )}

        {/* Enhancement Signals */}
        {enhancementSignals.length > 0 && (
          <div id="trust-context">
            <CollapsibleSection
              title="💡 Additional Context"
              count={counts.enhancements}
              isExpanded={expandedSections.has('enhancements')}
              onToggle={() => toggleSection('enhancements')}
              priorityColor="text-brand-400"
            >
              {enhancementSignals.map((signal, idx) => (
                <SignalCard key={idx} signal={signal} />
              ))}
            </CollapsibleSection>
          </div>
        )}

        {/* Unlisted Options */}
        {refiner.unlistedOptions.length > 0 && (
          <CollapsibleSection
            title="📋 Unlisted Options"
            count={refiner.unlistedOptions.length}
            isExpanded={expandedSections.has('unlisted')}
            onToggle={() => toggleSection('unlisted')}
          >
            {refiner.unlistedOptions.map((opt, idx) => (
              <div key={idx} className="p-2 bg-surface-highlight/40 rounded-lg border border-border-subtle">
                <div className="text-sm font-medium text-text-primary">{opt.title}</div>
                <div className="text-xs text-text-secondary mt-1">{opt.description}</div>
                {opt.source && (
                  <div className="text-xs text-text-muted mt-1">Source: {opt.source}</div>
                )}
              </div>
            ))}
          </CollapsibleSection>
        )}

        {/* Next Step */}
        {refiner.nextStep && (
          <div className={`p-3 rounded-lg border ${nextStepStyles.container}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-sm ${nextStepStyles.icon}`}>→</span>
              <span className={`text-xs font-bold uppercase ${nextStepStyles.label}`}>Next Step</span>
            </div>
            <div className="text-sm text-text-primary">
              <strong>{refiner.nextStep.action}:</strong> {refiner.nextStep.target}
            </div>
            {refiner.nextStep.why && (
              <div className="text-xs text-text-muted mt-1">{refiner.nextStep.why}</div>
            )}
          </div>
        )}

        <div className="border border-border-subtle rounded-lg p-3 bg-surface-raised/60">
          <div className="text-xs font-bold text-text-secondary uppercase mb-2">Refiner's Take</div>
          <div className="space-y-3 text-sm text-text-primary">
            <div>{refiner.meta.reliabilitySummary || 'No reliability summary available.'}</div>
            {refiner.meta.strategicPattern && (
              <div>
                <div className="text-xs font-semibold text-text-secondary uppercase mb-1">Strategic Pattern</div>
                <div>{refiner.meta.strategicPattern}</div>
              </div>
            )}
            {refiner.meta.biggestRisk && (
              <div>
                <div className="text-xs font-semibold text-text-secondary uppercase mb-1">Biggest Risk</div>
                <div>{refiner.meta.biggestRisk}</div>
              </div>
            )}
            {refiner.meta.honestAssessment && (
              <div>
                <div className="text-xs font-semibold text-text-secondary uppercase mb-1">Honest Assessment</div>
                <div>{refiner.meta.honestAssessment}</div>
              </div>
            )}
          </div>
        </div>

        {/* Reframe suggestion */}
        {refiner.reframe && (
          <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">🔄</span>
              <span className="text-xs font-bold text-violet-400 uppercase">Reframe Suggested</span>
            </div>
            {refiner.reframe.issue && (
              <div className="text-xs text-violet-200/70 mb-2">{refiner.reframe.issue}</div>
            )}
            <div className="text-sm text-text-primary">"{refiner.reframe.suggestion}"</div>
            {refiner.reframe.unlocks && (
              <div className="text-xs text-violet-300 mt-2">
                <span className="opacity-70">Unlocks:</span> {refiner.reframe.unlocks}
              </div>
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
