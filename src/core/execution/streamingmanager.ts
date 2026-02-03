const STREAMING_DEBUG = false;

interface PartialChunk {
  text: string;
  isFinal: boolean;
  isReplace: boolean;
}

interface PartialResultMessage {
  type: "PARTIAL_RESULT";
  sessionId: string;
  stepId: string;
  providerId: string;
  chunk: PartialChunk;
}

interface Port {
  postMessage: (message: PartialResultMessage) => void;
}

interface StreamState {
  text: string;
  lastWarn?: number;
  warnCount?: number;
}

const logger = {
  stream: (_msg: string, _meta?: Record<string, unknown>) => {
    if (STREAMING_DEBUG) console.debug(`[StreamingManager] ${_msg}`, _meta);
  },
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

export class StreamingManager {
  private port: Port;
  private streamStates: Map<string, StreamState>;

  constructor(port: Port) {
    this.port = port;
    this.streamStates = new Map<string, StreamState>();
  }

  makeDelta(
    sessionId: string | null | undefined,
    stepId: string,
    providerId: string,
    fullText: string = ""
  ): string {
    if (!sessionId) return fullText || "";

    const key = `${sessionId}:${stepId}:${providerId}`;
    const existingState = this.streamStates.get(key) ?? { text: "" };
    const prev = existingState.text;
    let delta = "";

    if (prev.length === 0 && fullText && fullText.length > 0) {
      delta = fullText;
      this.streamStates.set(key, { ...existingState, text: fullText });
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
        this.streamStates.set(key, { ...existingState, text: fullText });
        logger.stream("Incremental append:", {
          providerId,
          deltaLen: delta.length,
        });
      } else {
        logger.stream(
          `Divergence detected for ${providerId}: commonPrefix=${prefixLen}/${prev.length}`,
        );
        this.streamStates.set(key, { ...existingState, text: fullText });
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
        this.streamStates.set(key, { ...existingState, text: fullText });
        return "";
      }

      const now = Date.now();
      const lastWarn = existingState.lastWarn ?? 0;
      const currentCount = existingState.warnCount ?? 0;
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
        this.streamStates.set(key, {
          ...existingState,
          text: fullText,
          lastWarn: now,
          warnCount: currentCount + 1,
        });
      } else {
        this.streamStates.set(key, { ...existingState, text: fullText });
      }
      return "";
    }

    return "";
  }

  clearCache(sessionId: string) {
    if (!sessionId) return;

    const keysToDelete: string[] = [];
    this.streamStates.forEach((_, key) => {
      if (key.startsWith(`${sessionId}:`)) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => this.streamStates.delete(key));
    logger.debug(
      `[StreamingManager] Cleared ${keysToDelete.length} cache entries for session ${sessionId}`,
    );
  }

  dispatchPartialDelta(
    sessionId: string,
    stepId: string,
    providerId: string,
    text: string,
    label: string | null = null,
    isFinal = false
  ): boolean {
    try {
      let delta: string;
      let isReplace = false;

      if (isFinal) {
        const key = `${sessionId}:${stepId}:${providerId}`;
        const existingState = this.streamStates.get(key) ?? { text: "" };
        this.streamStates.set(key, { ...existingState, text });
        delta = text;
        isReplace = true;
        logger.stream("Final emission (force-replace):", {
          stepId,
          providerId,
          len: text.length,
        });
      } else {
        delta = this.makeDelta(sessionId, stepId, providerId, text);
      }

      if ((delta && delta.length > 0) || (isFinal && isReplace)) {
        const chunk = {
          text: delta,
          isFinal: !!isFinal,
          isReplace: !!isReplace,
        };
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

  getRecoveredText(sessionId: string, stepId: string, providerId: string): string {
    const key = `${sessionId}:${stepId}:${providerId}`;
    return this.streamStates.get(key)?.text ?? "";
  }
}
