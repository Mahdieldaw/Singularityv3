/**
 * HTOS Error Handler with Fallback Mechanisms
 * Provides comprehensive error handling, recovery strategies, and fallback mechanisms
 */

import { persistenceMonitor } from "../core/PersistenceMonitor.js";

// ============================================================
// NEW: Provider authentication configuration
// ============================================================

export type ProviderConfigEntry = {
  displayName: string;
  loginUrl: string;
  maxInputChars: number;
};

export const PROVIDER_CONFIG: Record<string, ProviderConfigEntry> = {
  claude: {
    displayName: "Claude",
    loginUrl: "https://claude.ai",
    maxInputChars: 100000,
  },
  chatgpt: {
    displayName: "ChatGPT",
    loginUrl: "https://chatgpt.com",
    maxInputChars: 32000,
  },
  gemini: {
    displayName: "Gemini",
    loginUrl: "https://gemini.google.com",
    maxInputChars: 30000,
  },
  "gemini-pro": {
    displayName: "Gemini Pro",
    loginUrl: "https://gemini.google.com",
    maxInputChars: 120000,
  },
  "gemini-exp": {
    displayName: "Gemini 2.0",
    loginUrl: "https://gemini.google.com",
    maxInputChars: 30000,
  },
  qwen: {
    displayName: "Qwen",
    loginUrl: "https://qianwen.com",
    maxInputChars: 30000,
  },
  grok: {
    displayName: "Grok",
    loginUrl: "http://grok.com",
    maxInputChars: 120000,
  },
};

// ============================================================
// NEW: Auth error detection patterns
// ============================================================

const AUTH_STATUS_CODES = new Set<number>([401, 403]);

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

export type HTOSErrorCode = string;

export type HTOSErrorContext = Record<string, unknown>;

export class HTOSError extends Error {
  code: HTOSErrorCode;
  context: HTOSErrorContext;
  recoverable: boolean;
  timestamp: number;
  id: string;

  constructor(
    message: string,
    code: HTOSErrorCode,
    context: HTOSErrorContext = {},
    recoverable: boolean = true,
  ) {
    super(message);
    this.name = "HTOSError";
    this.code = code;
    this.context = context;
    this.recoverable = recoverable;
    this.timestamp = Date.now();
    this.id = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  get details(): HTOSErrorContext {
    return this.context;
  }

  toJSON(): {
    id: string;
    name: string;
    message: string;
    code: HTOSErrorCode;
    context: HTOSErrorContext;
    recoverable: boolean;
    timestamp: number;
    stack?: string;
  } {
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
  providerId: string;
  loginUrl: string;

  constructor(providerId: string, message: string | null, context: HTOSErrorContext = {}) {
    const config = PROVIDER_CONFIG[providerId] || {
      displayName: providerId,
      loginUrl: "the provider website",
      maxInputChars: Infinity,
    };

    const userMessage =
      message ||
      `${config.displayName} session expired. Please log in at ${config.loginUrl}`;

    super(
      userMessage,
      "AUTH_REQUIRED",
      {
        ...context,
        providerId,
        loginUrl: config.loginUrl,
        displayName: config.displayName,
      },
      false,
    );

    this.name = "ProviderAuthError";
    this.providerId = providerId;
    this.loginUrl = config.loginUrl;
  }
}

type ErrorWithResponse = {
  status?: unknown;
  response?: { status?: unknown } | null;
  message?: unknown;
  name?: unknown;
  code?: unknown;
  details?: unknown;
};

const getStatusCode = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const e = error as ErrorWithResponse;
  const raw = e.status ?? e.response?.status;
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const num = Number(raw);
    return Number.isFinite(num) ? num : undefined;
  }
  return undefined;
};

const getErrorName = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") return undefined;
  const e = error as ErrorWithResponse;
  return typeof e.name === "string" ? e.name : undefined;
};

// ============================================================
// NEW: Error classification helpers
// ============================================================

export function isProviderAuthError(error: unknown): boolean {
  if (error instanceof ProviderAuthError) return true;
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (code === "AUTH_REQUIRED") return true;
  }

  const status = getStatusCode(error);
  if (typeof status === "number" && AUTH_STATUS_CODES.has(status)) return true;

  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message)
      : String(error);
  return AUTH_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function isRateLimitError(error: unknown): boolean {
  const status = getStatusCode(error);
  if (status === 429) return true;

  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message)
      : String(error);
  return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(message));
}

export function isNetworkError(error: unknown): boolean {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message)
      : String(error);
  return /failed.?to.?fetch|network|timeout|ECONNREFUSED|ENOTFOUND/i.test(message);
}

export function createProviderAuthError(
  providerId: string,
  originalError: unknown,
  context: HTOSErrorContext = {},
): ProviderAuthError {
  return new ProviderAuthError(providerId, null, {
    ...context,
    originalError,
    originalMessage:
      originalError && typeof originalError === "object" && "message" in originalError
        ? String((originalError as { message?: unknown }).message)
        : undefined,
    originalStatus: getStatusCode(originalError),
  });
}

export function createMultiProviderAuthError(
  providerIds: string[] | null | undefined,
  context: string = "",
): HTOSError | ProviderAuthError | null {
  if (!providerIds?.length) return null;

  if (providerIds.length === 1) {
    return new ProviderAuthError(providerIds[0], null);
  }

  const lines = providerIds.map((pid) => {
    const config = PROVIDER_CONFIG[pid] || { displayName: pid, loginUrl: "" };
    return `• ${config.displayName}: ${config.loginUrl}`;
  });

  const message = context
    ? `${context}\n\nPlease log in to:\n${lines.join("\n")}`
    : `Multiple providers need authentication:\n${lines.join("\n")}`;

  return new HTOSError(
    message,
    "MULTI_AUTH_REQUIRED",
    {
      providerIds,
      loginUrls: providerIds.map((pid) => PROVIDER_CONFIG[pid]?.loginUrl),
    },
    false,
  );
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message);
  }
  return String(error);
}

export type NormalizedError = {
  message: string;
  code?: string;
  details?: unknown;
  stack?: string;
};

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    const e = error as Error & { code?: unknown; details?: unknown };
    return {
      message: e.message,
      code: typeof e.code !== "undefined" ? String(e.code) : undefined,
      details: typeof e.details !== "undefined" ? e.details : undefined,
      stack: e.stack,
    };
  }
  if (error && typeof error === "object") {
    const e = error as ErrorWithResponse;
    return {
      message: typeof e.message !== "undefined" ? String(e.message) : String(error),
      code: typeof e.code !== "undefined" ? String(e.code) : undefined,
      details: typeof e.details !== "undefined" ? e.details : undefined,
    };
  }
  return { message: String(error) };
}

export type RetryPolicy = {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
};

export type CircuitBreakerState = {
  state: "closed" | "open" | "half-open";
  failures: number;
  openedAt: number | null;
  timeout: number;
};

export type OperationFn<TResult = unknown> = (context: Record<string, any>) => Promise<TResult>;

export type FallbackStrategy = (
  operation: string,
  context: Record<string, any>,
) => Promise<unknown>;

export type RecoveryStrategy = {
  name: string;
  execute: (error: HTOSError, context: Record<string, any>) => Promise<unknown>;
};

export class ErrorHandler {
  fallbackStrategies: Map<string, FallbackStrategy>;
  retryPolicies: Map<string, RetryPolicy>;
  errorCounts: Map<string, number>;
  circuitBreakers: Map<string, CircuitBreakerState>;

  constructor() {
    this.fallbackStrategies = new Map();
    this.retryPolicies = new Map();
    this.errorCounts = new Map();
    this.circuitBreakers = new Map();

    this.setupDefaultStrategies();
    this.setupDefaultRetryPolicies();
    this.setupProviderStrategies();
  }

  setupProviderStrategies(): void {
    this.retryPolicies.set("PROVIDER_AUTH", {
      maxRetries: 1,
      baseDelay: 500,
      maxDelay: 2000,
      backoffMultiplier: 2,
      jitter: false,
    });

    this.retryPolicies.set("PROVIDER_RATE_LIMIT", {
      maxRetries: 2,
      baseDelay: 5000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
    });
  }

  setupDefaultStrategies(): void {
    this.fallbackStrategies.set(
      "PROVIDER_AUTH_FAILED",
      async (_operation: string, context: Record<string, any>) => {
        const { failedProvider, availableProviders, authManager } = context;

        console.warn(`🔄 Provider ${failedProvider} auth failed, checking alternatives`);

        if (!availableProviders?.length || !authManager) {
          throw new ProviderAuthError(String(failedProvider), null);
        }

        const authStatus = await authManager.getAuthStatus();

        const fallbackProvider = (availableProviders as string[]).find(
          (pid) => pid !== failedProvider && authStatus[pid] === true,
        );

        if (fallbackProvider) {
          console.log(`🔄 Falling back to ${fallbackProvider}`);
          return { fallbackProvider, authStatus };
        }

        throw new ProviderAuthError(String(failedProvider), null);
      },
    );

    this.fallbackStrategies.set(
      "INDEXEDDB_UNAVAILABLE",
      async (operation: string, context: Record<string, any>) => {
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

    this.fallbackStrategies.set(
      "NETWORK_UNAVAILABLE",
      async (operation: string, context: Record<string, any>) => {
        console.warn("🔄 Falling back to cache for network operation:", operation);

        const cacheKey = `htos_cache_${context.url || context.key}`;
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
          try {
            return JSON.parse(cached) as unknown;
          } catch (parseError) {
            throw new HTOSError("Cached data corrupted", "CACHE_CORRUPTED", {
              parseError,
            });
          }
        }

        throw new HTOSError("No cached data available", "NO_CACHE_AVAILABLE");
      },
    );

    this.fallbackStrategies.set(
      "SERVICE_WORKER_UNAVAILABLE",
      async (operation: string, context: Record<string, any>) => {
        console.warn(
          "🔄 Falling back to direct operation (no service worker):",
          operation,
        );

        switch (operation) {
          case "persistence":
            return this.directPersistenceOperation(context);
          case "session":
            return this.directSessionOperation(context);
          default:
            throw new HTOSError("Direct operation not supported", "DIRECT_UNSUPPORTED");
        }
      },
    );
  }

  setupDefaultRetryPolicies(): void {
    this.retryPolicies.set("STANDARD", {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: true,
    });

    this.retryPolicies.set("CRITICAL", {
      maxRetries: 5,
      baseDelay: 500,
      maxDelay: 5000,
      backoffMultiplier: 1.5,
      jitter: true,
    });

    this.retryPolicies.set("CONSERVATIVE", {
      maxRetries: 2,
      baseDelay: 2000,
      maxDelay: 15000,
      backoffMultiplier: 3,
      jitter: false,
    });
  }

  async handleError(error: unknown, context: Record<string, any> = {}): Promise<unknown> {
    const htosError = this.normalizeError(error, context);

    persistenceMonitor.recordError(htosError, context);
    this.incrementErrorCount(htosError.code);

    if (this.isCircuitBreakerOpen(htosError.code)) {
      throw new HTOSError("Circuit breaker open", "CIRCUIT_BREAKER_OPEN", {
        originalError: htosError,
      });
    }

    if (htosError.recoverable) {
      try {
        const result = await this.attemptRecovery(htosError, context);
        this.updateCircuitBreaker(htosError.code, true);
        return result;
      } catch (recoveryError) {
        console.error("🚨 Recovery failed:", recoveryError);
      }
    }

    this.updateCircuitBreaker(htosError.code, false);

    throw htosError;
  }

  normalizeError(error: unknown, context: Record<string, any> = {}): HTOSError {
    if (error instanceof HTOSError) {
      return error;
    }

    let code: HTOSErrorCode = "UNKNOWN_ERROR";
    let recoverable = true;

    if (isProviderAuthError(error)) {
      code = "AUTH_REQUIRED";
      recoverable = false;
    } else if (isRateLimitError(error)) {
      code = "RATE_LIMITED";
      recoverable = true;
    } else if (isNetworkError(error)) {
      code = "NETWORK_ERROR";
      recoverable = true;
    } else if (getErrorName(error) === "QuotaExceededError") {
      code = "STORAGE_QUOTA_EXCEEDED";
      recoverable = false;
    } else if (getErrorName(error) === "InvalidStateError") {
      code = "INVALID_STATE";
    } else if (getErrorName(error) === "NotFoundError") {
      code = "NOT_FOUND";
    } else if (getErrorName(error) === "NetworkError") {
      code = "NETWORK_ERROR";
    } else if (getErrorName(error) === "TimeoutError") {
      code = "TIMEOUT";
    } else if (getErrorMessage(error).includes("IndexedDB")) {
      code = "INDEXEDDB_ERROR";
    } else if (getErrorMessage(error).includes("Service Worker")) {
      code = "SERVICE_WORKER_ERROR";
    } else if (
      getErrorMessage(error).includes("INPUT_TOO_LONG") ||
      (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "INPUT_TOO_LONG")
    ) {
      code = "INPUT_TOO_LONG";
      recoverable = false;
    }

    return new HTOSError(
      getErrorMessage(error),
      code,
      { ...context, originalError: error },
      recoverable,
    );
  }

  async attemptRecovery(error: HTOSError, context: Record<string, any>): Promise<unknown> {
    const strategy = this.getRecoveryStrategy(error.code);

    if (strategy) {
      console.log(
        `🔧 Attempting recovery for ${error.code} using strategy:`,
        strategy.name,
      );
      return await strategy.execute(error, context);
    }

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

  getRecoveryStrategy(errorCode: HTOSErrorCode): RecoveryStrategy | undefined {
    const strategies: Record<string, RecoveryStrategy> = {
      AUTH_REQUIRED: {
        name: "Provider Auth Recovery",
        execute: async (error, context) => {
          if (context.authManager && context.providerId) {
            context.authManager.invalidateCache(context.providerId);
            await context.authManager.verifyProvider(context.providerId);
          }
          throw error;
        },
      },
      RATE_LIMITED: {
        name: "Rate Limit Recovery",
        execute: async (_error, context) => {
          console.log(`⏳ Rate limited by ${context.providerId}, waiting...`);
          return await this.retryWithBackoff(
            context.operation,
            context,
            "PROVIDER_RATE_LIMIT",
          );
        },
      },
      INDEXEDDB_ERROR: {
        name: "IndexedDB Recovery",
        execute: async (error, context) => {
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
          return await this.retryWithBackoff(context.operation, context, "STANDARD");
        },
      },
      TIMEOUT: {
        name: "Timeout Recovery",
        execute: async (_error, context) => {
          const newContext = {
            ...context,
            timeout: (context.timeout || 5000) * 2,
          };
          return await this.retryWithBackoff(context.operation, newContext, "CONSERVATIVE");
        },
      },
    };

    return strategies[errorCode];
  }

  getFallbackStrategy(errorCode: HTOSErrorCode): FallbackStrategy | null {
    const fallbackMap: Record<string, string> = {
      INDEXEDDB_ERROR: "INDEXEDDB_UNAVAILABLE",
      INDEXEDDB_UNAVAILABLE: "INDEXEDDB_UNAVAILABLE",
      NETWORK_ERROR: "NETWORK_UNAVAILABLE",
      SERVICE_WORKER_ERROR: "SERVICE_WORKER_UNAVAILABLE",
    };

    const fallbackKey = fallbackMap[errorCode];
    return fallbackKey ? this.fallbackStrategies.get(fallbackKey) || null : null;
  }

  async retryWithBackoff(
    operation: OperationFn,
    context: Record<string, any>,
    policyName: string = "STANDARD",
  ): Promise<unknown> {
    const policy = this.retryPolicies.get(policyName);
    if (!policy) {
      throw new HTOSError(
        `Retry policy '${policyName}' not found`,
        "INVALID_RETRY_POLICY",
        { policyName },
      );
    }
    let lastError: unknown;

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
        console.warn(`❌ Attempt ${attempt + 1} failed:`, getErrorMessage(error));
      }
    }

    throw new HTOSError("All retry attempts failed", "RETRY_EXHAUSTED", {
      attempts: policy.maxRetries,
      lastError,
    });
  }

  calculateDelay(attempt: number, policy: RetryPolicy): number {
    let delay = policy.baseDelay * Math.pow(policy.backoffMultiplier, attempt);
    delay = Math.min(delay, policy.maxDelay);

    if (policy.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  incrementErrorCount(errorCode: HTOSErrorCode): void {
    const count = this.errorCounts.get(errorCode) || 0;
    this.errorCounts.set(errorCode, count + 1);
  }

  isCircuitBreakerOpen(errorCode: string): boolean {
    const breaker = this.circuitBreakers.get(errorCode);
    if (!breaker) return false;

    const now = Date.now();
    if (breaker.state === "open") {
      const openedAt = breaker.openedAt ?? now;
      if (breaker.openedAt === null) breaker.openedAt = openedAt;
      if (now - openedAt > breaker.timeout) {
      breaker.state = "half-open";
      console.log(`🔄 Circuit breaker for ${errorCode} moved to half-open`);
      }
    }

    return breaker.state === "open";
  }

  updateCircuitBreaker(errorCode: string, success: boolean): void {
    const threshold = 5;
    const timeout = 60000;

    if (!this.circuitBreakers.has(errorCode)) {
      this.circuitBreakers.set(errorCode, {
        state: "closed",
        failures: 0,
        openedAt: null,
        timeout,
      });
    }

    const breaker = this.circuitBreakers.get(errorCode);
    if (!breaker) return;

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

  async saveToLocalStorage(key: string, data: unknown): Promise<{ success: true; fallback: true }> {
    try {
      const serialized = JSON.stringify(data);
      localStorage.setItem(`htos_fallback_${key}`, serialized);
      return { success: true, fallback: true };
    } catch (error) {
      throw new HTOSError("localStorage save failed", "LOCALSTORAGE_SAVE_FAILED", {
        error,
      });
    }
  }

  async loadFromLocalStorage(key: string): Promise<unknown> {
    try {
      const data = localStorage.getItem(`htos_fallback_${key}`);
      return data ? (JSON.parse(data) as unknown) : null;
    } catch (error) {
      throw new HTOSError("localStorage load failed", "LOCALSTORAGE_LOAD_FAILED", {
        error,
      });
    }
  }

  async deleteFromLocalStorage(key: string): Promise<{ success: true; fallback: true }> {
    try {
      localStorage.removeItem(`htos_fallback_${key}`);
      return { success: true, fallback: true };
    } catch (error) {
      throw new HTOSError("localStorage delete failed", "LOCALSTORAGE_DELETE_FAILED", {
        error,
      });
    }
  }

  async listFromLocalStorage(prefix: string): Promise<string[]> {
    try {
      const keys: string[] = [];
      const fullPrefix = `htos_fallback_${prefix}`;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(fullPrefix)) {
          keys.push(key.substring(fullPrefix.length));
        }
      }

      return keys;
    } catch (error) {
      throw new HTOSError("localStorage list failed", "LOCALSTORAGE_LIST_FAILED", {
        error,
      });
    }
  }

  async directPersistenceOperation(_context: Record<string, any>): Promise<never> {
    throw new HTOSError(
      "Direct persistence not implemented",
      "DIRECT_PERSISTENCE_NOT_IMPLEMENTED",
    );
  }

  async directSessionOperation(_context: Record<string, any>): Promise<never> {
    throw new HTOSError(
      "Direct session management not implemented",
      "DIRECT_SESSION_NOT_IMPLEMENTED",
    );
  }

  async handleProviderError(
    error: unknown,
    providerId: string,
    context: Record<string, any> = {},
  ): Promise<unknown> {
    const htosError = this.normalizeError(error, {
      ...context,
      providerId,
    });

    persistenceMonitor.recordError(htosError, { providerId, ...context });
    this.incrementErrorCount(`${providerId}_${htosError.code}`);

    const breakerKey = `provider_${providerId}`;
    if (this.isCircuitBreakerOpen(breakerKey)) {
      throw new HTOSError(
        `${PROVIDER_CONFIG[providerId]?.displayName || providerId} is temporarily unavailable`,
        "CIRCUIT_BREAKER_OPEN",
        { providerId, originalError: htosError },
      );
    }

    if (htosError.code === "AUTH_REQUIRED") {
      this.updateCircuitBreaker(breakerKey, false);
      throw createProviderAuthError(providerId, error, context);
    }

    if (htosError.code === "RATE_LIMITED") {
      throw htosError;
    }

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

  getProviderErrorStats(providerId: string): {
    providerId: string;
    errors: Record<string, number>;
    circuitBreaker: { state: CircuitBreakerState["state"]; failures: number } | null;
  } {
    const prefix = `${providerId}_`;
    const breaker = this.circuitBreakers.get(`provider_${providerId}`) || null;
    const stats = {
      providerId,
      errors: {} as Record<string, number>,
      circuitBreaker: breaker
        ? {
            state: breaker.state,
            failures: breaker.failures,
          }
        : null,
    };

    for (const [code, count] of Array.from(this.errorCounts.entries())) {
      if (code.startsWith(prefix)) {
        stats.errors[code.substring(prefix.length)] = count;
      }
    }

    return stats;
  }

  getErrorStats(): {
    totalErrors: number;
    errorsByCode: Record<string, number>;
    circuitBreakers: Record<string, { state: CircuitBreakerState["state"]; failures: number; openedAt: number | null }>;
  } {
    const stats = {
      totalErrors: 0,
      errorsByCode: {} as Record<string, number>,
      circuitBreakers: {} as Record<
        string,
        { state: CircuitBreakerState["state"]; failures: number; openedAt: number | null }
      >,
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

  reset(): void {
    this.errorCounts.clear();
    this.circuitBreakers.clear();
    console.log("🔄 Error handler reset");
  }
}

export const errorHandler = new ErrorHandler();

if (typeof globalThis !== "undefined") {
  (globalThis as typeof globalThis & { __HTOS_ERROR_HANDLER?: ErrorHandler }).__HTOS_ERROR_HANDLER =
    errorHandler;
}

export default errorHandler;
