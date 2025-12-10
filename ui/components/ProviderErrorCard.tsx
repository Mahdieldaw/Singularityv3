// ui/components/ProviderErrorCard.tsx
import React from 'react';
import type { ProviderError } from '@shared/contract';
import { ERROR_DISPLAY_TEXT } from '../constants/errorMessages';
import { PROVIDER_COLORS } from '../constants';
import clsx from 'clsx';

interface ProviderErrorCardProps {
  providerId: string;
  providerName: string;
  error: ProviderError;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ProviderErrorCard: React.FC<ProviderErrorCardProps> = ({
  providerId,
  providerName,
  error,
  onRetry,
  onDismiss,
}) => {
  const displayInfo = ERROR_DISPLAY_TEXT[(error?.type as keyof typeof ERROR_DISPLAY_TEXT) || 'unknown'] || ERROR_DISPLAY_TEXT.unknown;
  const providerColor = PROVIDER_COLORS[providerId] || PROVIDER_COLORS.default;

  return (
    <div
      className={clsx(
        'provider-error-card',
        error?.retryable && 'provider-error-card--retryable'
      )}
      style={{ ['--provider-color' as any]: providerColor }}
    >
      <div className="provider-error-card__header">
        <span className="provider-error-card__icon">{displayInfo.icon}</span>
        <span className="provider-error-card__provider">{providerName}</span>
        <span className="provider-error-card__title">{displayInfo.title}</span>
        {onDismiss && (
          <button
            className="provider-error-card__dismiss"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            ×
          </button>
        )}
      </div>

      <p className="provider-error-card__description">
        {error?.message || displayInfo.description}
      </p>

      {error?.retryAfterMs && (
        <p className="provider-error-card__timer">
          Retry available in {Math.ceil(error.retryAfterMs / 1000)}s
        </p>
      )}

      <div className="provider-error-card__actions">
        {error?.retryable && onRetry && (
          <button className="provider-error-card__retry-btn" onClick={onRetry}>
            🔄 Retry
          </button>
        )}
        {error?.requiresReauth && (
          <button
            className="provider-error-card__auth-btn"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('provider-reauth', { detail: { providerId } })
              );
            }}
          >
            🔑 Log In
          </button>
        )}
      </div>
    </div>
  );
};

export default ProviderErrorCard;
