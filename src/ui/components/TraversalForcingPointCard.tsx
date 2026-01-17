import React, { useState } from 'react';

interface ForcingPointOption {
  claimId: string;
  label: string;
  consequence: string;
}

interface TraversalForcingPointCardProps {
  forcingPoint: {
    id: string;
    type: 'binary_choice' | 'multi_option' | 'gate_resolution';
    description: string;
    options: ForcingPointOption[];
  };
  claims: any[];
  isResolved: boolean;
  resolution?: { selectedClaimId: string; selectedLabel: string };
  onResolve: (forcingPointId: string, claimId: string, label: string) => void;
}

export const TraversalForcingPointCard: React.FC<TraversalForcingPointCardProps> = ({
  forcingPoint,
  claims,
  isResolved,
  resolution,
  onResolve
}) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(
    resolution?.selectedClaimId || null
  );

  const handleConfirm = () => {
    if (!selectedOption) return;
    const option = forcingPoint.options.find(opt => opt.claimId === selectedOption);
    if (option) {
      onResolve(forcingPoint.id, option.claimId, option.label);
    }
  };

  const typeIcon = forcingPoint.type === 'binary_choice' ? '⚖️' : '🔀';
  const typeLabel = forcingPoint.type === 'binary_choice' ? 'Binary Choice' : 'Multiple Options';

  return (
    <div className="my-6 p-6 rounded-xl bg-gradient-to-br from-brand-500/5 to-purple-500/5 border-2 border-brand-500/30">
      <div className="flex items-start gap-3 mb-4">
        <span className="text-3xl">{typeIcon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded-md bg-brand-500/20 text-brand-500 text-xs font-bold uppercase tracking-wide">
              {typeLabel}
            </span>
            {isResolved && (
              <span className="px-2 py-0.5 rounded-md bg-green-500/20 text-green-500 text-xs font-bold">
                ✓ Resolved
              </span>
            )}
          </div>
          <div className="text-base font-bold text-text-primary">
            {forcingPoint.description}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {forcingPoint.options.map((option) => {
          const claim = claims.find(c => c.id === option.claimId);
          const isSelected = selectedOption === option.claimId;
          const isThisResolved = isResolved && resolution?.selectedClaimId === option.claimId;

          return (
            <button
              key={option.claimId}
              onClick={() => !isResolved && setSelectedOption(option.claimId)}
              disabled={isResolved}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                isThisResolved
                  ? 'border-green-500 bg-green-500/10'
                  : isSelected
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-border-subtle bg-surface-raised hover:border-brand-500/50'
              } ${isResolved && !isThisResolved ? 'opacity-40' : ''}`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  isThisResolved
                    ? 'border-green-500 bg-green-500'
                    : isSelected
                    ? 'border-brand-500 bg-brand-500'
                    : 'border-border-subtle'
                }`}>
                  {(isSelected || isThisResolved) && (
                    <span className="text-white text-xs">✓</span>
                  )}
                </div>

                <div className="flex-1">
                  <div className="font-bold text-text-primary mb-1">
                    {option.label}
                  </div>
                  {claim?.text && (
                    <div className="text-sm text-text-muted mb-2">
                      {claim.text}
                    </div>
                  )}
                  <div className="text-xs text-text-muted italic">
                    → {option.consequence}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {!isResolved && selectedOption && (
        <button
          onClick={handleConfirm}
          className="mt-4 w-full px-6 py-3 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold transition-colors"
        >
          Confirm Choice
        </button>
      )}
    </div>
  );
};
