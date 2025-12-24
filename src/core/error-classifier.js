// src/core/error-classifier.js

/**
 * Classify errors for user-facing messaging and retry logic
 */
export function classifyError(error) {
  if (error && error.code === "RATE_LIMITED") {
    const retryAfterMs =
      parseRetryAfter(error) || parseRateLimitResetMsFromMessage(error) || 60000;
    return {
      type: "rate_limit",
      message:
        error.message ||
        "Rate limit reached. Please wait before retrying.",
      retryable: true,
      retryAfterMs,
    };
  }

  // HTTP status-based classification
  if (error && (error.status || error.statusCode)) {
    const status = error.status || error.statusCode;

    if (status === 429) {
      const retryAfterMs =
        parseRetryAfter(error) || parseRateLimitResetMsFromMessage(error) || 60000;
      return {
        type: "rate_limit",
        message: "Rate limit reached. Please wait before retrying.",
        retryable: true,
        retryAfterMs,
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

  const errorType = error && (error.type || error.code);
  const message =
    typeof error?.message === "string" ? error.message : "";
  const nestedErrorType =
    (error && error.error && error.error.type) ||
    (error &&
      error.details &&
      error.details.error &&
      error.details.error.type) ||
    (error &&
      error.context &&
      error.context.originalError &&
      error.context.originalError.error &&
      error.context.originalError.error.type) ||
    null;

  if (
    errorType === "rate_limit_error" ||
    errorType === "RATE_LIMITED" ||
    nestedErrorType === "rate_limit_error" ||
    /rate[_\s-]?limit/i.test(message)
  ) {
    const retryAfterMs =
      parseRetryAfter(error) || parseRateLimitResetMsFromMessage(error) || 60000;
    return {
      type: "rate_limit",
      message: "Rate limit reached. Please wait before retrying.",
      retryable: true,
      retryAfterMs,
    };
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

function parseRateLimitResetMsFromMessage(error) {
  const candidates = [];
  if (error && typeof error.message === "string") {
    candidates.push(error.message);
  }
  const ctx = error && error.context;
  const original = ctx && ctx.originalError;
  if (original && typeof original.message === "string") {
    candidates.push(original.message);
  }
  if (error && error.error && typeof error.error.message === "string") {
    candidates.push(error.error.message);
  }
  if (error && error.details && typeof error.details.message === "string") {
    candidates.push(error.details.message);
  }
  if (
    original &&
    original.error &&
    typeof original.error.message === "string"
  ) {
    candidates.push(original.error.message);
  }

  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = String(raw).trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      const direct = parsed.resetsAt || parsed.resets_at;
      if (typeof direct === "number" && isFinite(direct)) {
        const ms = direct * 1000 - Date.now();
        if (ms > 0) return ms;
      }
      const win = parsed.windows && (parsed.windows["5h"] || parsed.windows["1h"]);
      const winReset =
        win && (win.resets_at || win.resetsAt);
      if (typeof winReset === "number" && isFinite(winReset)) {
        const ms = winReset * 1000 - Date.now();
        if (ms > 0) return ms;
      }
    } catch {
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
  input_too_long: {
    title: 'Input Too Long',
    description: "Your message exceeds this provider's input limit. Shorten it and retry.",
    icon: '📏'
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
