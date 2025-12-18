// ui/components/refinerui/TrustIcon.tsx

import React from 'react';
import type { RefinerOutput } from '../../../shared/parsing-utils';
import { shouldPulseTrustIcon } from '../../utils/refiner-helpers';

interface TrustIconProps {
  refiner: RefinerOutput | null;
  onClick: () => void;
  isActive?: boolean;
}

export const TrustIcon: React.FC<TrustIconProps> = ({ refiner, onClick, isActive }) => {
  const shouldPulse = refiner ? shouldPulseTrustIcon(refiner) : false;

  return (
    <button
      onClick={onClick}
      className={`
        relative w-8 h-8 rounded-full flex items-center justify-center
        transition-all duration-200 ml-4 shrink-0 z-40
        ${isActive ? 'bg-brand-500/15 text-brand-500' : 'bg-surface-raised text-text-secondary hover:bg-surface-highlight'}
      `}
      title="Trust signals — quick audit of this answer"
    >
      <span className="text-base">🔍</span>
      {shouldPulse && !isActive && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
        </span>
      )}
    </button>
  );
};
