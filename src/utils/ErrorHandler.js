/**
 * HTOS Error Handler with Fallback Mechanisms
 * Provides comprehensive error handling, recovery strategies, and fallback mechanisms
 */

import { persistenceMonitor } from "../core/PersistenceMonitor.js";

// ============================================================
// NEW: Provider authentication configuration
// ============================================================

export const PROVIDER_CONFIG = {
  claude: {
    displayName: 'Claude',
    loginUrl: 'https://claude.ai',
    maxInputChars: 100000,
  },
  chatgpt: {
    displayName: 'ChatGPT',
    loginUrl: 'https://chatgpt.com',
    maxInputChars: 32000,
  },
  gemini: {
    displayName: 'Gemini',
    loginUrl: 'https://gemini.google.com',
    maxInputChars: 30000,
  },
  'gemini-pro': {
    displayName: 'Gemini Pro',
    loginUrl: 'https://gemini.google.com',
    maxInputChars: 120000,
  },
  'gemini-exp': {
    displayName: 'Gemini 2.0',
    loginUrl: 'https://gemini.google.com',
    maxInputChars: 30000,
  },
  qwen: {
    displayName: 'Qwen',
    loginUrl: 'https://qianwen.com',
    maxInputChars: 30000,
  },
  grok: {
    displayName: 'Grok',
    loginUrl: 'http://grok.com',
    maxInputChars: 120000,
  },
};

// ============================================================
// NEW: Auth error detection patterns
// ============================================================

const AUTH_STATUS_CODES = new Set([401, 403]);

const AUTH_ERROR_PATTERNS = [
  /NOT_LOGIN/i,
  /session.?expired/i,
  /unauthorized/i,
  /login.?required/i,
  /authentication.?required/i,
  /invalid.?session/i,
  /please.?log.?in/i,
];

const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /too.?many.?requests/i,
  /quota.?exceeded/i,
  /try.?again.?later/i,
];

export class HTOSError extends Error {
  constructor(message, code, context = {}, recoverable = true) {
    super(message);
    this.name = "HTOSError";
    this.code = code;
    this.context = context;
    this.recoverable = recoverable;
    this.timestamp = Date.now();
    this.id = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  get details() {
    return this.context;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      recoverable: this.recoverable,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

// ============================================================
// NEW: Provider-specific error class
// ============================================================

export class ProviderAuthError extends HTOSError {
  constructor(providerId, message, context = {}) {
    const config = PROVIDER_CONFIG[providerId] || {
      displayName: providerId,
      loginUrl: 'the provider website'
    };

    const userMessage = message ||
      `${config.displayName} session expired. Please log in at ${config.loginUrl}`;

    super(userMessage, 'AUTH_REQUIRED', {
      ...context,
      providerId,
      loginUrl: config.loginUrl,
      displayName: config.displayName,
    }, false); // Auth errors are not auto-recoverable

    this.name = 'ProviderAuthError';
    this.providerId = providerId;
    this.loginUrl = config.loginUrl;
  }
}

// ============================================================
// NEW: Error classification helpers
// ============================================================

/**
 * Check if an error indicates provider authentication failure
 */
export function isProviderAuthError(error) {
  // Already classified
  if (error instanceof ProviderAuthError) return true;
  if (error?.code === 'AUTH_REQUIRED') return true;

  // Check HTTP status
  const status = error?.status || error?.response?.status;
  if (status && AUTH_STATUS_CODES.has(status)) return true;

  // Check error message patterns
  const message = error?.message || String(error);
  return AUTH_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Check if an error indicates rate limiting (NOT an auth error)
 */
export function isRateLimitError(error) {
  const status = error?.status || error?.response?.status;
  if (status === 429) return true;

  const message = error?.message || String(error);
  return RATE_LIMIT_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Check if an error is a network/connectivity issue
 */
export function isNetworkError(error) {
  const message = error?.message || String(error);
  return /failed.?to.?fetch|network|timeout|ECONNREFUSED|ENOTFOUND/i.test(message);
}

/**
 * Create a ProviderAuthError from a generic error
 */
export function createProviderAuthError(providerId, originalError, context = {}) {
  return new ProviderAuthError(providerId, null, {
    ...context,
    originalError,
    originalMessage: originalError?.message,
    originalStatus: originalError?.status,
  });
}

/**
 * Create consolidated error for multiple provider auth failures
 */
export function createMultiProviderAuthError(providerIds, context = '') {
  if (!providerIds?.length) return null;

  if (providerIds.length === 1) {
    return new ProviderAuthError(providerIds[0]);
  }

  const lines = providerIds.map(pid => {
    const config = PROVIDER_CONFIG[pid] || { displayName: pid, loginUrl: '' };
    return `• ${config.displayName}: ${config.loginUrl}`;
  });

  const message = context
    ? `${context}\n\nPlease log in to:\n${lines.join('\n')}`
    : `Multiple providers need authentication:\n${lines.join('\n')}`;

  return new HTOSError(message, 'MULTI_AUTH_REQUIRED', {
    providerIds,
    loginUrls: providerIds.map(pid => PROVIDER_CONFIG[pid]?.loginUrl),
  }, false);
}

export class ErrorHandler {
  constructor() {
    this.fallbackStrategies = new Map();
    this.retryPolicies = new Map();
    this.errorCounts = new Map();
    this.circuitBreakers = new Map();

    this.setupDefaultStrategies();
    this.setupDefaultRetryPolicies();
    this.setupProviderStrategies(); // NEW
  }

  /**
   * NEW: Setup provider-specific strategies
   */
  setupProviderStrategies() {
    // Provider auth retry policy (conservative - auth issues rarely resolve quickly)
    this.retryPolicies.set("PROVIDER_AUTH", {
      maxRetries: 1,        // Only 1 retry after auth verification
      baseDelay: 500,
      maxDelay: 2000,
      backoffMultiplier: 2,
      jitter: false,
    });

    // Provider rate limit policy (wait longer)
    this.retryPolicies.set("PROVIDER_RATE_LIMIT", {
      maxRetries: 2,
      baseDelay: 5000,      // Start with 5 seconds
      maxDelay: 30000,      // Max 30 seconds
      backoffMultiplier: 2,
      jitter: true,
    });
  }

  /**
   * Setup default fallback strategies
   */
  setupDefaultStrategies() {
    // NEW: Provider auth fallback - use alternative provider
    this.fallbackStrategies.set(
      "PROVIDER_AUTH_FAILED",
      async (_operation, context) => {
        const { failedProvider, availableProviders, authManager } = context;

        console.warn(`🔄 Provider ${failedProvider} auth failed, checking alternatives`);

        if (!availableProviders?.length || !authManager) {
          throw new ProviderAuthError(failedProvider);
        }

        // Get current auth status
        const authStatus = await authManager.getAuthStatus();

        // Find first available authorized provider
        const fallbackProvider = availableProviders.find(
          pid => pid !== failedProvider && authStatus[pid] === true
        );

        if (fallbackProvider) {
          console.log(`🔄 Falling back to ${fallbackProvider}`);
          return { fallbackProvider, authStatus };
        }

        throw new ProviderAuthError(failedProvider);
      }
    );

    // IndexedDB fallback to localStorage
    this.fallbackStrategies.set(
      "INDEXEDDB_UNAVAILABLE",
      async (operation, context) => {
        console.warn("🔄 Falling back to localStorage for:", operation);

        try {
          switch (operation) {
            case "save":
              return this.saveToLocalStorage(context.key, context.data);
            case "load":
              return this.loadFromLocalStorage(context.key);
            case "delete":
              return this.deleteFromLocalStorage(context.key);
            case "list":
              return this.listFromLocalStorage(context.prefix);
            default:
              throw new HTOSError(
                "Unsupported fallback operation",
                "FALLBACK_UNSUPPORTED",
              );
          }
        } catch (error) {
          throw new HTOSError("Fallback strategy failed", "FALLBACK_FAILED", {
            originalError: error,
          });
        }
      },
    );

    // Network fallback to cache
    this.fallbackStrategies.set(
      "NETWORK_UNAVAILABLE",
      async (operation, context) => {
        console.warn(
          "🔄 Falling back to cache for network operation:",
          operation,
        );

        // Try to use cached data
        const cacheKey = `htos_cache_${context.url || context.key}`;
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
          try {
            return JSON.parse(cached);
          } catch (parseError) {
            throw new HTOSError("Cached data corrupted", "CACHE_CORRUPTED", {
              parseError,
            });
          }
        }

        throw new HTOSError("No cached data available", "NO_CACHE_AVAILABLE");
      },
    );

    // Service worker fallback to direct operations
    this.fallbackStrategies.set(
      "SERVICE_WORKER_UNAVAILABLE",
      async (operation, context) => {
        console.warn(
          "🔄 Falling back to direct operation (no service worker):",
          operation,
        );

        // Implement direct operations without service worker
        switch (operation) {
          case "persistence":
            return this.directPersistenceOperation(context);
          case "session":
            return this.directSessionOperation(context);
          default:
            throw new HTOSError(
              "Direct operation not supported",
              "DIRECT_UNSUPPORTED",
            );
        }
      },
    );
  }

  /**
   * Setup default retry policies
   */
  setupDefaultRetryPolicies() {
    // Standard retry policy
    this.retryPolicies.set("STANDARD", {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: true,
    });

    // Aggressive retry for critical operations
    this.retryPolicies.set("CRITICAL", {
      maxRetries: 5,
      baseDelay: 500,
      maxDelay: 5000,
      backoffMultiplier: 1.5,
      jitter: true,
    });

    // Conservative retry for non-critical operations
    this.retryPolicies.set("CONSERVATIVE", {
      maxRetries: 2,
      baseDelay: 2000,
      maxDelay: 15000,
      backoffMultiplier: 3,
      jitter: false,
    });
  }

  /**
   * Handle an error with appropriate strategy
   */
  async handleError(error, context = {}) {
    const htosError = this.normalizeError(error, context);

    // Record the error
    persistenceMonitor.recordError(htosError, context);
    this.incrementErrorCount(htosError.code);

    // Check circuit breaker
    if (this.isCircuitBreakerOpen(htosError.code)) {
      throw new HTOSError("Circuit breaker open", "CIRCUIT_BREAKER_OPEN", {
        originalError: htosError,
      });
    }

    // Try recovery strategies
    if (htosError.recoverable) {
      try {
        const result = await this.attemptRecovery(htosError, context);
        this.updateCircuitBreaker(htosError.code, true);
        return result;
      } catch (recoveryError) {
        console.error("🚨 Recovery failed:", recoveryError);
        // Fall through to throw original error
      }
    }

    // Update circuit breaker
    this.updateCircuitBreaker(htosError.code, false);

    throw htosError;
  }

  /**
   * Normalize any error to HTOSError
   */
  normalizeError(error, context = {}) {
    // Already an HTOS error
    if (error instanceof HTOSError) {
      return error;
    }

    let code = "UNKNOWN_ERROR";
    let recoverable = true;

    // NEW: Check for provider auth errors first
    if (isProviderAuthError(error)) {
      code = "AUTH_REQUIRED";
      recoverable = false;
    } else if (isRateLimitError(error)) {
      code = "RATE_LIMITED";
      recoverable = true;
    } else if (isNetworkError(error)) {
      code = "NETWORK_ERROR";
      recoverable = true;
    }
    // Categorize common errors
    else if (error.name === "QuotaExceededError") {
      code = "STORAGE_QUOTA_EXCEEDED";
      recoverable = false;
    } else if (error.name === "InvalidStateError") {
      code = "INVALID_STATE";
    } else if (error.name === "NotFoundError") {
      code = "NOT_FOUND";
    } else if (error.name === "NetworkError") {
      code = "NETWORK_ERROR";
    } else if (error.name === "TimeoutError") {
      code = "TIMEOUT";
    } else if (error.message?.includes("IndexedDB")) {
      code = "INDEXEDDB_ERROR";
    } else if (error.message?.includes("Service Worker")) {
      code = "SERVICE_WORKER_ERROR";
    } else if (error.message?.includes("INPUT_TOO_LONG") || error.code === "INPUT_TOO_LONG") {
      code = "INPUT_TOO_LONG";
      recoverable = false;
    }

    return new HTOSError(
      error.message || String(error),
      code,
      { ...context, originalError: error },
      recoverable,
    );
  }

  /**
   * Attempt recovery using appropriate strategy
   */
  async attemptRecovery(error, context) {
    const strategy = this.getRecoveryStrategy(error.code);

    if (strategy) {
      console.log(
        `🔧 Attempting recovery for ${error.code} using strategy:`,
        strategy.name,
      );
      return await strategy.execute(error, context);
    }

    // Try fallback strategies
    const fallbackStrategy = this.getFallbackStrategy(error.code);
    if (fallbackStrategy) {
      console.log(`🔄 Using fallback strategy for ${error.code}`);
      return await fallbackStrategy(context.operation, context);
    }

    throw new HTOSError(
      "No recovery strategy available",
      "NO_RECOVERY_STRATEGY",
      { originalError: error },
    );
  }

  /**
   * Get recovery strategy for error code
   */
  getRecoveryStrategy(errorCode) {
    const strategies = {
      // NEW: Provider auth recovery
      AUTH_REQUIRED: {
        name: "Provider Auth Recovery",
        execute: async (error, context) => {
          // Auth errors are not auto-recoverable
          // Just update auth status and re-throw
          if (context.authManager && context.providerId) {
            context.authManager.invalidateCache(context.providerId);
            await context.authManager.verifyProvider(context.providerId);
          }
          throw error;
        },
      },

      // NEW: Rate limit recovery
      RATE_LIMITED: {
        name: "Rate Limit Recovery",
        execute: async (_error, context) => {
          console.log(`⏳ Rate limited by ${context.providerId}, waiting...`);
          return await this.retryWithBackoff(
            context.operation,
            context,
            "PROVIDER_RATE_LIMIT"
          );
        },
      },

      INDEXEDDB_ERROR: {
        name: "IndexedDB Recovery",
        execute: async (error, context) => {
          // Try to reinitialize IndexedDB connection
          if (context.reinitialize) {
            await context.reinitialize();
            return await context.retry();
          }
          throw error;
        },
      },
      NETWORK_ERROR: {
        name: "Network Recovery",
        execute: async (_error, context) => {
          // Wait and retry with exponential backoff
          return await this.retryWithBackoff(
            context.operation,
            context,
            "STANDARD",
          );
        },
      },
      TIMEOUT: {
        name: "Timeout Recovery",
        execute: async (_error, context) => {
          // Retry with longer timeout
          const newContext = {
            ...context,
            timeout: (context.timeout || 5000) * 2,
          };
          return await this.retryWithBackoff(
            context.operation,
            newContext,
            "CONSERVATIVE",
          );
        },
      },
    };

    return strategies[errorCode];
  }

  /**
   * Get fallback strategy for error code
   */
  getFallbackStrategy(errorCode) {
    const fallbackMap = {
      INDEXEDDB_ERROR: "INDEXEDDB_UNAVAILABLE",
      INDEXEDDB_UNAVAILABLE: "INDEXEDDB_UNAVAILABLE",
      NETWORK_ERROR: "NETWORK_UNAVAILABLE",
      SERVICE_WORKER_ERROR: "SERVICE_WORKER_UNAVAILABLE",
    };

    const fallbackKey = fallbackMap[errorCode];
    return fallbackKey ? this.fallbackStrategies.get(fallbackKey) : null;
  }

  /**
   * Retry operation with exponential backoff
   */
  async retryWithBackoff(operation, context, policyName = "STANDARD") {
    const policy = this.retryPolicies.get(policyName);
    if (!policy) {
      throw new HTOSError(
        `Retry policy '${policyName}' not found`,
        "INVALID_RETRY_POLICY",
        { policyName }
      );
    }
    let lastError;

    for (let attempt = 0; attempt < policy.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateDelay(attempt, policy);
          console.log(
            `⏳ Retrying in ${delay}ms (attempt ${attempt + 1}/${policy.maxRetries})`,
          );
          await this.sleep(delay);
        }

        return await operation(context);
      } catch (error) {
        lastError = error;
        console.warn(`❌ Attempt ${attempt + 1} failed:`, error.message);
      }
    }

    throw new HTOSError("All retry attempts failed", "RETRY_EXHAUSTED", {
      attempts: policy.maxRetries,
      lastError,
    });
  }

  /**
   * Calculate delay for exponential backoff
   */
  calculateDelay(attempt, policy) {
    let delay = policy.baseDelay * Math.pow(policy.backoffMultiplier, attempt);
    delay = Math.min(delay, policy.maxDelay);

    if (policy.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5); // Add 0-50% jitter
    }

    return Math.floor(delay);
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Increment error count for circuit breaker
   */
  incrementErrorCount(errorCode) {
    const count = this.errorCounts.get(errorCode) || 0;
    this.errorCounts.set(errorCode, count + 1);
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitBreakerOpen(errorCode) {
    const breaker = this.circuitBreakers.get(errorCode);
    if (!breaker) return false;

    const now = Date.now();
    if (breaker.state === "open" && now - breaker.openedAt > breaker.timeout) {
      // Move to half-open state
      breaker.state = "half-open";
      console.log(`🔄 Circuit breaker for ${errorCode} moved to half-open`);
    }

    return breaker.state === "open";
  }

  /**
   * Update circuit breaker state
   */
  updateCircuitBreaker(errorCode, success) {
    const threshold = 5; // Open after 5 failures
    const timeout = 60000; // 1 minute timeout

    if (!this.circuitBreakers.has(errorCode)) {
      this.circuitBreakers.set(errorCode, {
        state: "closed",
        failures: 0,
        openedAt: null,
        timeout,
      });
    }

    const breaker = this.circuitBreakers.get(errorCode);

    if (success) {
      breaker.failures = 0;
      breaker.state = "closed";
    } else {
      breaker.failures++;
      if (breaker.failures >= threshold) {
        breaker.state = "open";
        breaker.openedAt = Date.now();
        console.warn(
          `🚨 Circuit breaker opened for ${errorCode} after ${breaker.failures} failures`,
        );
      }
    }
  }

  // Fallback implementations

  async saveToLocalStorage(key, data) {
    try {
      const serialized = JSON.stringify(data);
      localStorage.setItem(`htos_fallback_${key}`, serialized);
      return { success: true, fallback: true };
    } catch (error) {
      throw new HTOSError(
        "localStorage save failed",
        "LOCALSTORAGE_SAVE_FAILED",
        { error },
      );
    }
  }

  async loadFromLocalStorage(key) {
    try {
      const data = localStorage.getItem(`htos_fallback_${key}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      throw new HTOSError(
        "localStorage load failed",
        "LOCALSTORAGE_LOAD_FAILED",
        { error },
      );
    }
  }

  async deleteFromLocalStorage(key) {
    try {
      localStorage.removeItem(`htos_fallback_${key}`);
      return { success: true, fallback: true };
    } catch (error) {
      throw new HTOSError(
        "localStorage delete failed",
        "LOCALSTORAGE_DELETE_FAILED",
        { error },
      );
    }
  }

  async listFromLocalStorage(prefix) {
    try {
      const keys = [];
      const fullPrefix = `htos_fallback_${prefix}`;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(fullPrefix)) {
          keys.push(key.substring(fullPrefix.length));
        }
      }

      return keys;
    } catch (error) {
      throw new HTOSError(
        "localStorage list failed",
        "LOCALSTORAGE_LIST_FAILED",
        { error },
      );
    }
  }

  async directPersistenceOperation(_context) {
    // Implement direct persistence without service worker
    throw new HTOSError(
      "Direct persistence not implemented",
      "DIRECT_PERSISTENCE_NOT_IMPLEMENTED",
    );
  }

  async directSessionOperation(_context) {
    // Implement direct session management without service worker
    throw new HTOSError(
      "Direct session management not implemented",
      "DIRECT_SESSION_NOT_IMPLEMENTED",
    );
  }

  /**
   * NEW: Handle provider-specific error with auth recovery
   */
  async handleProviderError(error, providerId, context = {}) {
    const htosError = this.normalizeError(error, {
      ...context,
      providerId
    });

    // Record for monitoring
    persistenceMonitor.recordError(htosError, { providerId, ...context });
    this.incrementErrorCount(`${providerId}_${htosError.code}`);

    // Check provider-specific circuit breaker
    const breakerKey = `provider_${providerId}`;
    if (this.isCircuitBreakerOpen(breakerKey)) {
      throw new HTOSError(
        `${PROVIDER_CONFIG[providerId]?.displayName || providerId} is temporarily unavailable`,
        "CIRCUIT_BREAKER_OPEN",
        { providerId, originalError: htosError }
      );
    }

    // For auth errors, just update status and throw
    if (htosError.code === 'AUTH_REQUIRED') {
      this.updateCircuitBreaker(breakerKey, false);
      throw createProviderAuthError(providerId, error, context);
    }

    // For rate limits, update breaker but don't fully open
    if (htosError.code === 'RATE_LIMITED') {
      // Don't count rate limits toward circuit breaker
      throw htosError;
    }

    // For other errors, use normal recovery flow
    if (htosError.recoverable) {
      try {
        const result = await this.attemptRecovery(htosError, {
          ...context,
          providerId,
        });
        this.updateCircuitBreaker(breakerKey, true);
        return result;
      } catch (recoveryError) {
        this.updateCircuitBreaker(breakerKey, false);
        throw recoveryError;
      }
    }

    this.updateCircuitBreaker(breakerKey, false);
    throw htosError;
  }

  /**
   * NEW: Get provider error statistics
   */
  getProviderErrorStats(providerId) {
    const prefix = `${providerId}_`;
    const stats = {
      providerId,
      errors: {},
      circuitBreaker: null,
    };

    for (const [code, count] of Array.from(this.errorCounts.entries())) {
      if (code.startsWith(prefix)) {
        stats.errors[code.substring(prefix.length)] = count;
      }
    }

    const breaker = this.circuitBreakers.get(`provider_${providerId}`);
    if (breaker) {
      stats.circuitBreaker = {
        state: breaker.state,
        failures: breaker.failures,
      };
    }

    return stats;
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const stats = {
      totalErrors: 0,
      errorsByCode: {},
      circuitBreakers: {},
    };

    for (const [code, count] of Array.from(this.errorCounts.entries())) {
      stats.errorsByCode[code] = count;
      stats.totalErrors += count;
    }

    for (const [code, breaker] of Array.from(this.circuitBreakers.entries())) {
      stats.circuitBreakers[code] = {
        state: breaker.state,
        failures: breaker.failures,
        openedAt: breaker.openedAt,
      };
    }

    return stats;
  }

  /**
   * Reset error counts and circuit breakers
   */
  reset() {
    this.errorCounts.clear();
    this.circuitBreakers.clear();
    console.log("🔄 Error handler reset");
  }
}

// Create global instance
export const errorHandler = new ErrorHandler();

// Make it available globally for debugging
if (typeof globalThis !== "undefined") {
  globalThis.__HTOS_ERROR_HANDLER = errorHandler;
}

export default errorHandler;
