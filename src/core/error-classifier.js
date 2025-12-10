// src/core/error-classifier.js

/**
 * Classify errors for user-facing messaging and retry logic
 */
export function classifyError(error) {
  // HTTP status-based classification
  if (error && (error.status || error.statusCode)) {
    const status = error.status || error.statusCode;

    if (status === 429) {
      return {
        type: 'rate_limit',
        message: 'Rate limit reached. Please wait before retrying.',
        retryable: true,
        retryAfterMs: parseRetryAfter(error) || 60000
      };
    }

    if (status === 401 || status === 403) {
      return {
        type: 'auth_expired',
        message: 'Authentication expired. Please log in again.',
        retryable: false,
        requiresReauth: true
      };
    }

    if (status >= 500) {
      return {
        type: 'unknown',
        message: 'Provider server error. Will retry automatically.',
        retryable: true
      };
    }
  }

  // Timeout detection
  if (
    error?.code === 'ETIMEDOUT' ||
    error?.code === 'ESOCKETTIMEDOUT' ||
    (typeof error?.message === 'string' && error.message.toLowerCase().includes('timeout'))
  ) {
    return {
      type: 'timeout',
      message: 'Request timed out. Retrying may help.',
      retryable: true
    };
  }

  // Network errors
  if (
    error?.code === 'ECONNREFUSED' ||
    error?.code === 'ENOTFOUND' ||
    error?.code === 'ENETUNREACH' ||
    (typeof error?.message === 'string' && error.message.toLowerCase().includes('network'))
  ) {
    return {
      type: 'network',
      message: 'Network connection failed.',
      retryable: true
    };
  }

  // Content filter / safety
  if (
    typeof error?.message === 'string' && (
      error.message.toLowerCase().includes('content filter') ||
      error.message.toLowerCase().includes('safety') ||
      error.message.toLowerCase().includes('blocked')
    )
  ) {
    return {
      type: 'content_filter',
      message: 'Response blocked by provider safety filters.',
      retryable: false
    };
  }

  // Default unknown
  return {
    type: 'unknown',
    message: (error && error.message) || 'An unexpected error occurred.',
    retryable: true // Optimistic - allow retry attempt
  };
}

function parseRetryAfter(error) {
  // Try to extract Retry-After header value
  const retryAfter = error?.headers?.['retry-after'] || error?.headers?.['Retry-After'];
  if (retryAfter) {
    const seconds = parseInt(String(retryAfter), 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }
  }
  return null;
}

/**
 * User-friendly error messages by type
 */
export const ERROR_DISPLAY_TEXT = {
  rate_limit: {
    title: 'Rate Limited',
    description: 'This provider is temporarily unavailable. It will automatically retry.',
    icon: '⏳'
  },
  auth_expired: {
    title: 'Login Required',
    description: 'Please log in to this provider again.',
    icon: '🔒'
  },
  timeout: {
    title: 'Timed Out',
    description: 'The request took too long. Click retry to try again.',
    icon: '⏱️'
  },
  circuit_open: {
    title: 'Temporarily Unavailable',
    description: 'Too many recent failures. Will automatically recover.',
    icon: '🔌'
  },
  content_filter: {
    title: 'Content Blocked',
    description: 'This provider blocked the response. Try rephrasing your request.',
    icon: '🚫'
  },
  network: {
    title: 'Connection Failed',
    description: 'Could not reach the provider. Check your connection.',
    icon: '📡'
  },
  unknown: {
    title: 'Error',
    description: 'Something went wrong.',
    icon: '⚠️'
  }
};
