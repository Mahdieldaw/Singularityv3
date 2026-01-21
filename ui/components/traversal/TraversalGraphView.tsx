import React from 'react';
import { useTraversalState } from '../../hooks/cognitive/useTraversalState';
import { TraversalGateCard } from './TraversalGateCard';
import { TraversalForcingPointCard } from './TraversalForcingPointCard';
import { buildTraversalContinuationPrompt } from '../../utils/traversal-prompt-builder';
import type { Claim, ForcingPoint, SerializedTraversalGraph, TraversalGate } from '../../../shared/contract';
import { CONTINUE_COGNITIVE_WORKFLOW, WORKFLOW_STEP_UPDATE } from '../../../shared/messaging';
import api from '../../services/extension-api';

interface TraversalGraphViewProps {
  traversalGraph: SerializedTraversalGraph;
  forcingPoints: ForcingPoint[];
  claims: Claim[];
  originalQuery: string;
  sessionId: string;
  aiTurnId: string;
  onComplete?: () => void;
}

export const TraversalGraphView: React.FC<TraversalGraphViewProps> = ({
  traversalGraph,
  forcingPoints,
  claims,
  originalQuery,
  sessionId,
  aiTurnId,
  onComplete
}) => {
  const tiersArray = Array.isArray(traversalGraph?.tiers) ? traversalGraph.tiers : [];
  const conflictForcingPoints = Array.isArray(forcingPoints)
    ? forcingPoints.filter((fp: any) => fp && fp.type === 'conflict')
    : [];

  const {
    state,
    resolveGate,
    resolveForcingPoint,
    unlockedTiers,
    isComplete,
    reset
  } = useTraversalState(traversalGraph, conflictForcingPoints);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submissionError, setSubmissionError] = React.useState<string | null>(null);

  const handleSubmitToConcierge = async () => {
    setIsSubmitting(true);
    setSubmissionError(null);

    const allGates = tiersArray.flatMap((t) => t.gates || []);
    const gatesMap = new Map<string, TraversalGate>(allGates.map((g) => [g.id, g]));

    const continuationPrompt = buildTraversalContinuationPrompt(
      originalQuery,
      state.gateResolutions,
      state.forcingPointResolutions,
      claims,
      gatesMap
    );

    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      let port: chrome.runtime.Port | null = null;
      let messageListener: ((msg: any) => void) | null = null;
      let disconnectListener: (() => void) | null = null;
      let ackTimeoutId: any = null;
      let completionTimeoutId: any = null;

      const cleanup = () => {
        try {
          if (ackTimeoutId) clearTimeout(ackTimeoutId);
        } catch (e) {
          console.debug('[TraversalGraphView] Error clearing ack timeout:', e);
        }
        try {
          if (completionTimeoutId) clearTimeout(completionTimeoutId);
        } catch (e) {
          console.debug('[TraversalGraphView] Error clearing completion timeout:', e);
        }
        try {
          if (port && messageListener) {
            port.onMessage.removeListener(messageListener);
          }
        } catch (e) {
          console.debug('[TraversalGraphView] Error removing message listener:', e);
        }
        try {
          if (port && disconnectListener) {
            port.onDisconnect.removeListener(disconnectListener);
          }
        } catch (e) {
          console.debug('[TraversalGraphView] Error removing disconnect listener:', e);
        }
      };

      try {
        port = await api.ensurePort({ sessionId, force: attempt > 0 });

        await new Promise<void>((resolve, reject) => {
          let acked = false;
          let isDone = false;

          const finish = (fn: () => void) => {
            if (isDone) return;
            isDone = true;
            cleanup();
            fn();
          };

          messageListener = (msg: any) => {
            if (!msg || typeof msg !== 'object') return;

            if (msg.type === 'CONTINUATION_ACK' && msg.aiTurnId === aiTurnId) {
              acked = true;
              try {
                if (ackTimeoutId) clearTimeout(ackTimeoutId);
              } catch (_) { }
              return;
            }

            if (msg.type === 'CONTINUATION_ERROR' && msg.aiTurnId === aiTurnId) {
              finish(() => reject(new Error(msg.error || 'Continuation failed')));
              return;
            }

            if (msg.type !== WORKFLOW_STEP_UPDATE) return;
            if (msg.sessionId && msg.sessionId !== sessionId) return;

            const stepId = String(msg.stepId || '');
            const isRelevantStep =
              stepId.startsWith('singularity-') || stepId === 'continue-singularity-error';
            if (!isRelevantStep) return;

            if (msg.status === 'completed') {
              finish(() => resolve());
              return;
            }

            if (msg.status === 'failed') {
              finish(() =>
                reject(new Error(msg.error || 'Submission failed. Please try again.')),
              );
              return;
            }
          };

          disconnectListener = () => {
            finish(() => reject(new Error('Port disconnected')));
          };

          port!.onMessage.addListener(messageListener);
          port!.onDisconnect.addListener(disconnectListener);

          ackTimeoutId = setTimeout(() => {
            if (isDone) return;
            if (acked) return;
            finish(() => reject(new Error('No ACK received. Please try again.')));
          }, 10000);

          completionTimeoutId = setTimeout(() => {
            finish(() => reject(new Error('Submission timed out. Please try again.')));
          }, 30000);

          try {
            port!.postMessage({
              type: CONTINUE_COGNITIVE_WORKFLOW,
              payload: {
                sessionId,
                aiTurnId,
                userMessage: continuationPrompt,
                providerId: 'gemini',
                isTraversalContinuation: true
              }
            });
          } catch (e) {
            finish(() => reject(e instanceof Error ? e : new Error(String(e))));
          }
        });

        setIsSubmitting(false);
        onComplete?.();
        return;
      } catch (error) {
        cleanup();
        const isLast = attempt === maxRetries - 1;
        if (isLast) {
          setIsSubmitting(false);
          setSubmissionError(error instanceof Error ? error.message : String(error));
          return;
        }
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  };

  if (!Array.isArray(traversalGraph?.tiers)) {
    console.warn('[Traversal] Legacy/malformed traversal graph detected', traversalGraph);
    return (
      <div className="mt-8 pt-6 border-t border-border-subtle text-text-muted text-sm">
        This response used an older traversal format and can’t be displayed.
      </div>
    );
  }

  const sortedTiers = [...tiersArray].sort((a: any, b: any) => a.tierIndex - b.tierIndex);

  return (
    <div className="mt-8 pt-6 border-t border-border-subtle">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-text-primary">Decision Traversal</h3>
          <p className="text-sm text-text-muted">
            Resolve gates and make choices to generate personalized guidance
          </p>
        </div>
        <button
          onClick={reset}
          className="px-3 py-1.5 rounded-lg bg-surface-highlight hover:bg-surface-raised border border-border-subtle text-xs font-medium transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Tiers */}
      {sortedTiers.map((tier: any) => {
        const isUnlocked = unlockedTiers.has(tier.tierIndex);
        const tierClaims = Array.isArray(tier.claimIds)
          ? tier.claimIds.map((id: string) => claims.find((c: any) => c.id === id)).filter(Boolean)
          : Array.isArray(tier.claims)
            ? tier.claims
            : [];

        return (
          <div key={tier.tierIndex} className="mb-6">
            {/* Gates before this tier */}
            {tier.gates && tier.gates.length > 0 && tier.gates.map((gate: any) => (
              <TraversalGateCard
                key={gate.id}
                gate={gate}
                isResolved={state.gateResolutions.has(gate.id)}
                resolution={state.gateResolutions.get(gate.id)}
                onResolve={resolveGate}
              />
            ))}

            {/* Tier header */}
            <div className={`p-4 rounded-t-xl border-2 border-b-0 ${isUnlocked
              ? 'bg-surface-raised border-brand-500/30'
              : 'bg-surface-subtle border-border-subtle opacity-50'
              }`}>
              <div className="flex items-center gap-2">
                {isUnlocked ? '🔓' : '🔒'}
                <span className="font-bold text-text-primary">
                  Tier {tier.tierIndex}: {tier.tierIndex === 0 ? 'Foundation' : 'Dependent Claims'}
                </span>
                <span className="text-xs text-text-muted">
                  ({tierClaims.length} claim{tierClaims.length !== 1 ? 's' : ''})
                </span>
              </div>
            </div>

            {/* Tier claims */}
            <div className={`p-4 rounded-b-xl border-2 border-t-0 ${isUnlocked
              ? 'bg-surface-raised border-brand-500/30'
              : 'bg-surface-subtle border-border-subtle opacity-50'
              }`}>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {tierClaims.map((claim: any) => (
                  <div
                    key={claim.id}
                    className="flex-shrink-0 w-64 p-3 rounded-lg bg-surface-highlight border border-border-subtle"
                  >
                    <div className="text-sm font-bold text-text-primary mb-1">
                      {claim.label}
                    </div>
                    <div className="text-xs text-text-muted line-clamp-2">
                      {claim.text}
                    </div>
                    {claim.supporters && claim.supporters.length > 0 && (
                      <div className="mt-2 flex -space-x-1">
                        {claim.supporters.map((modelIdx: number, i: number) => (
                          <div
                            key={i}
                            className="w-5 h-5 rounded-full bg-brand-500 border-2 border-surface flex items-center justify-center text-xs font-bold text-white"
                          >
                            {modelIdx}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {/* Forcing Points */}
      {conflictForcingPoints.length > 0 && (
        <div className="mt-8">
          <h4 className="text-md font-bold text-text-primary mb-4">Key Decision Points</h4>
          {conflictForcingPoints.map((fp: any) => (
            <TraversalForcingPointCard
              key={fp.id}
              forcingPoint={fp}
              claims={claims}
              isResolved={state.forcingPointResolutions.has(fp.id)}
              resolution={state.forcingPointResolutions.get(fp.id)}
              onResolve={resolveForcingPoint}
            />
          ))}
        </div>
      )}

      {/* Submit button */}
      {isComplete && (
        <div className="mt-8 p-6 rounded-xl bg-gradient-to-br from-green-500/10 to-brand-500/10 border-2 border-green-500/30 animate-in fade-in slide-in-from-bottom-4">
          <div className="text-center">
            <div className="text-lg font-bold text-text-primary mb-2">
              ✓ All Decision Points Resolved
            </div>
            <p className="text-sm text-text-muted mb-4">
              Ready to generate your personalized synthesis based on your choices
            </p>
            <button
              onClick={handleSubmitToConcierge}
              disabled={isSubmitting}
              className="px-8 py-3 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm transition-colors"
            >
              {isSubmitting ? 'Generating...' : 'Generate Personalized Guidance'}
            </button>
            {submissionError && (
              <div className="mt-2">
                <div className="text-xs text-red-500 font-bold">
                  {submissionError}
                </div>
                <button
                  onClick={handleSubmitToConcierge}
                  disabled={isSubmitting}
                  className="mt-2 px-3 py-1.5 rounded-lg bg-surface-highlight hover:bg-surface-raised border border-border-subtle text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
