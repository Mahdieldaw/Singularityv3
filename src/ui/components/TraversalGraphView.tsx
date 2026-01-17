import React from 'react';
import { useTraversalState } from '../hooks/useTraversalState';
import { TraversalGateCard } from './TraversalGateCard';
import { TraversalForcingPointCard } from './TraversalForcingPointCard';
import { buildTraversalContinuationPrompt } from '../utils/traversal-prompt-builder';

interface TraversalGraphViewProps {
  traversalGraph: any;
  forcingPoints: any[];
  claims: any[];
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
  const {
    state,
    resolveGate,
    resolveForcingPoint,
    unlockedTiers,
    isComplete,
    reset
  } = useTraversalState(traversalGraph, forcingPoints);

  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmitToConcierge = async () => {
    setIsSubmitting(true);

    const continuationPrompt = buildTraversalContinuationPrompt(
      originalQuery,
      state.gateResolutions,
      state.forcingPointResolutions,
      claims
    );

    try {
      // Send to service worker
      const port = chrome.runtime.connect({ name: 'htos-popup' });
      
      port.postMessage({
        type: 'CONTINUE_COGNITIVE_REQUEST',
        payload: {
          sessionId,
          aiTurnId,
          userMessage: continuationPrompt,
          providerId: 'gemini',  // Or let user choose
          isTraversalContinuation: true
        }
      });

      // Listen for completion
      port.onMessage.addListener((msg) => {
        if (msg.type === 'WORKFLOW_STEP_UPDATE' && msg.status === 'completed') {
          setIsSubmitting(false);
          onComplete?.();
        }
      });
    } catch (error) {
      console.error('Failed to submit traversal to Concierge:', error);
      setIsSubmitting(false);
    }
  };

  if (!traversalGraph?.tiers) {
    return null;
  }

  const sortedTiers = [...traversalGraph.tiers].sort((a: any, b: any) => a.tierIndex - b.tierIndex);

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
      {sortedTiers.map((tier: any, idx: number) => {
        const isUnlocked = unlockedTiers.has(tier.tierIndex);
        const tierClaims = tier.claims.map((id: string) => claims.find(c => c.id === id)).filter(Boolean);

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
            <div className={`p-4 rounded-t-xl border-2 border-b-0 ${
              isUnlocked
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
            <div className={`p-4 rounded-b-xl border-2 border-t-0 ${
              isUnlocked
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
      {forcingPoints && forcingPoints.length > 0 && (
        <div className="mt-8">
          <h4 className="text-md font-bold text-text-primary mb-4">Key Decision Points</h4>
          {forcingPoints.map((fp: any) => (
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
          </div>
        </div>
      )}
    </div>
  );
};
