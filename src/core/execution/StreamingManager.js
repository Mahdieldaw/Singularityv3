
const logger = {
  stream: (msg, meta) => {
    // console.debug(`[WorkflowEngine] ${msg}`, meta); 
  },
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

export class StreamingManager {
  constructor(port) {
    this.port = port;
    this.lastStreamState = new Map();
  }

  makeDelta(sessionId, stepId, providerId, fullText = "") {
    if (!sessionId) return fullText || "";

    const key = `${sessionId}:${stepId}:${providerId}`;
    const prev = this.lastStreamState.get(key) || "";
    let delta = "";

    if (prev.length === 0 && fullText && fullText.length > 0) {
      delta = fullText;
      this.lastStreamState.set(key, fullText);
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
        this.lastStreamState.set(key, fullText);
        logger.stream("Incremental append:", {
          providerId,
          deltaLen: delta.length,
        });
      } else {
        logger.stream(
          `Divergence detected for ${providerId}: commonPrefix=${prefixLen}/${prev.length}`,
        );
        this.lastStreamState.set(key, fullText);
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
        this.lastStreamState.set(key, fullText);
        return "";
      }

      const now = Date.now();
      const lastWarnKey = `${key}:lastRegressionWarn`;
      const warnCountKey = `${key}:regressionWarnCount`;
      const lastWarn = this.lastStreamState.get(lastWarnKey) || 0;
      const currentCount = this.lastStreamState.get(warnCountKey) || 0;
      const WARN_MAX = 2;
      if (currentCount < WARN_MAX && now - lastWarn > 5000) {
        logger.warn(
          `[makeDelta] Significant text regression for ${providerId}:`,
          {
            prevLen: prev.length,
            fullLen: fullText.length,
            regression,
            regressionPercent: regressionPercent.toFixed(1) + "%",
          },
        );
        this.lastStreamState.set(lastWarnKey, now);
        this.lastStreamState.set(warnCountKey, currentCount + 1);
      }
      this.lastStreamState.set(key, fullText);
      return "";
    }

    return "";
  }

  clearCache(sessionId) {
    if (!sessionId) return;

    const keysToDelete = [];
    this.lastStreamState.forEach((_, key) => {
      if (key.startsWith(`${sessionId}:`)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => this.lastStreamState.delete(key));
    logger.debug(
      `[StreamingManager] Cleared ${keysToDelete.length} cache entries for session ${sessionId}`,
    );
  }

  dispatchPartialDelta(
    sessionId,
    stepId,
    providerId,
    text,
    label = null,
    isFinal = false,
  ) {
    try {
      let delta;

      // For final emissions, bypass makeDelta regression detection
      // This is critical when we strip sections (like GRAPH_TOPOLOGY) from the text
      if (isFinal) {
        // Force-replace with final text
        const key = `${sessionId}:${stepId}:${providerId}`;
        this.lastStreamState.set(key, text);
        delta = text; // Send complete final text
        logger.stream("Final emission (force-replace):", { stepId, providerId, len: text?.length || 0 });
      } else {
        delta = this.makeDelta(sessionId, stepId, providerId, text);
      }

      if (delta && delta.length > 0) {
        const chunk = isFinal
          ? { text: delta, isFinal: true }
          : { text: delta };
        this.port.postMessage({
          type: "PARTIAL_RESULT",
          sessionId,
          stepId,
          providerId,
          chunk,
        });
        logger.stream(label || "Delta", { stepId, providerId, len: delta.length });
        return true;
      } else {
        logger.stream("Delta skipped (empty):", { stepId, providerId });
        return false;
      }
    } catch (e) {
      logger.warn("Delta dispatch failed:", {
        stepId,
        providerId,
        error: String(e),
      });
      return false;
    }
  }
  
  // Helper to get recovered text for failure handling
  getRecoveredText(sessionId, stepId, providerId) {
      const key = `${sessionId}:${stepId}:${providerId}`;
      return this.lastStreamState.get(key) || "";
  }
}
