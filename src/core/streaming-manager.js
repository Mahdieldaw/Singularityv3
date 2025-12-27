const STREAMING_DEBUG = false;

const logger = {
  stream: (msg, meta) => {
    if (STREAMING_DEBUG) console.debug(`[StreamingManager] ${msg}`, meta);
  },
  debug: console.debug.bind(console),
  warn: console.warn.bind(console),
};

export class StreamingManager {
  constructor() {
    this._lastStreamState = new Map();
  }

  _key(sessionId, stepId, providerId) {
    return `${sessionId}:${stepId}:${providerId}`;
  }

  setFinalText(sessionId, stepId, providerId, text) {
    if (!sessionId) return text || "";
    const key = this._key(sessionId, stepId, providerId);
    this._lastStreamState.set(key, text || "");
    logger.stream("Final emission (force-replace):", {
      stepId,
      providerId,
      len: text?.length || 0,
    });
    return text || "";
  }

  makeDelta(sessionId, stepId, providerId, fullText = "") {
    if (!sessionId) return fullText || "";

    const key = this._key(sessionId, stepId, providerId);
    const prev = this._lastStreamState.get(key) || "";
    let delta = "";

    if (prev.length === 0 && fullText && fullText.length > 0) {
      delta = fullText;
      this._lastStreamState.set(key, fullText);
      logger.stream("First emission:", {
        providerId,
        textLength: fullText.length,
      });
      return delta;
    }

    if (fullText && fullText.length > prev.length) {
      let prefixLen = 0;
      const minLen = Math.min(prev.length, fullText.length);

      while (prefixLen < minLen && prev[prefixLen] === fullText[prefixLen]) {
        prefixLen++;
      }

      if (prefixLen >= prev.length * 0.7) {
        delta = fullText.slice(prev.length);
        this._lastStreamState.set(key, fullText);
        logger.stream("Incremental append:", {
          providerId,
          deltaLen: delta.length,
        });
      } else {
        logger.stream(
          `Divergence detected for ${providerId}: commonPrefix=${prefixLen}/${prev.length}`,
        );
        this._lastStreamState.set(key, fullText);
        return fullText.slice(prefixLen);
      }
      return delta;
    }

    if (fullText === prev) {
      logger.stream("Duplicate call (no-op):", { providerId });
      return "";
    }

    if (fullText.length < prev.length) {
      const regression = prev.length - fullText.length;
      const regressionPercent = (regression / prev.length) * 100;
      const isSmallRegression = regression <= 200 || regressionPercent <= 5;

      if (isSmallRegression) {
        logger.stream(`Acceptable regression for ${providerId}:`, {
          chars: regression,
          percent: regressionPercent.toFixed(1) + "%",
        });
        this._lastStreamState.set(key, fullText);
        return "";
      }

      const now = Date.now();
      const lastWarnKey = `${key}:lastRegressionWarn`;
      const warnCountKey = `${key}:regressionWarnCount`;
      const lastWarn = this._lastStreamState.get(lastWarnKey) || 0;
      const currentCount = this._lastStreamState.get(warnCountKey) || 0;
      const WARN_MAX = 2;
      if (currentCount < WARN_MAX && now - lastWarn > 5000) {
        logger.warn(
          `[StreamingManager] Significant text regression for ${providerId}:`,
          {
            prevLen: prev.length,
            fullLen: fullText.length,
            regression,
            regressionPercent: regressionPercent.toFixed(1) + "%",
          },
        );
        this._lastStreamState.set(lastWarnKey, now);
        this._lastStreamState.set(warnCountKey, currentCount + 1);
      }
      this._lastStreamState.set(key, fullText);
      return "";
    }

    return "";
  }

  clearCache(sessionId) {
    if (!sessionId) return;

    const keysToDelete = [];
    this._lastStreamState.forEach((_, key) => {
      if (key.startsWith(`${sessionId}:`)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => this._lastStreamState.delete(key));
    logger.debug(
      `[StreamingManager] Cleared ${keysToDelete.length} cache entries for session ${sessionId}`,
    );
  }

  stream(msg, meta) {
    logger.stream(msg, meta);
  }
}

