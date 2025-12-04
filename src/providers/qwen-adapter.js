/**
 * HTOS Qwen Provider Adapter
 * - Implements ProviderAdapter interface for Qwen
 * - Wraps QwenSessionApi with auth observation (Qwen has internal retries)
 */
import { authManager } from '../core/auth-manager.js';
import {
  errorHandler,
  isProviderAuthError,
  createProviderAuthError
} from '../utils/ErrorHandler.js';

const QWEN_ADAPTER_DEBUG = false;
const pad = (...args) => {
  if (QWEN_ADAPTER_DEBUG) console.log(...args);
};

export class QwenAdapter {
  constructor(controller) {
    this.id = "qwen";
    this.capabilities = {
      needsDNR: true, // To set origin/referer headers
      needsOffscreen: false,
      supportsStreaming: true,
      supportsContinuation: true,
      synthesis: true,
    };
    this.controller = controller;
  }

  async sendPrompt(req, onChunk, signal) {
    const startTime = Date.now();
    let aggregatedText = "";
    let responseContext = {};

    const meta = req?.meta || {};
    const hasContinuation = !!(meta.sessionId || meta.parentMsgId);

    try {
      const result = await this.controller.qwenSession.ask(
        req.originalPrompt,
        {
          signal,
          sessionId: hasContinuation ? meta.sessionId : undefined,
          parentMsgId: hasContinuation ? meta.parentMsgId : undefined,
        },
        (partial) => {
          if (!this.capabilities.supportsStreaming || !onChunk) return;
          aggregatedText = partial.text || aggregatedText;
          responseContext = {
            sessionId: partial.sessionId,
            parentMsgId: partial.parentMsgId,
          };

          onChunk({
            providerId: this.id,
            ok: true,
            text: aggregatedText,
            partial: true,
            latencyMs: Date.now() - startTime,
            meta: { ...responseContext },
          });
        },
      );

      return {
        providerId: this.id,
        ok: true,
        text: result.text ?? aggregatedText,
        partial: false,
        latencyMs: Date.now() - startTime,
        meta: { sessionId: result.sessionId, parentMsgId: result.parentMsgId },
      };
    } catch (error) {
      if (isProviderAuthError(error) || this._isQwenAuthError(error)) {
        authManager.invalidateCache(this.id);
        await authManager.verifyProvider(this.id);

        const authError = createProviderAuthError(this.id, error);
        return {
          providerId: this.id,
          ok: false,
          text: aggregatedText || null,
          errorCode: 'AUTH_REQUIRED',
          latencyMs: Date.now() - startTime,
          meta: {
            error: authError.toString(),
            details: authError.details,
            ...meta,
          },
        };
      }

      try {
        await errorHandler.handleProviderError(error, this.id, {
          operation: 'sendPrompt',
        });
      } catch (handledError) {
        return {
          providerId: this.id,
          ok: false,
          text: aggregatedText || null,
          errorCode: handledError.code || "unknown",
          latencyMs: Date.now() - startTime,
          meta: {
            error: handledError.toString(),
            details: handledError.details,
            suppressed: handledError.suppressed,
            ...meta,
          },
        };
      }
    }
  }

  async sendContinuation(prompt, providerContext, sessionId, onChunk, signal) {
    const startTime = Date.now();
    const meta = providerContext?.meta || providerContext || {};
    let aggregatedText = "";
    let responseContext = {};

    if (!meta.sessionId) {
      console.warn(`[Qwen Adapter] sendContinuation called without a sessionId.`);
      return {
        providerId: this.id,
        ok: false,
        text: null,
        errorCode: "continuation_failed",
        meta: { error: "Missing sessionId for continuation." },
      };
    }

    try {
      const result = await this.controller.qwenSession.ask(
        prompt,
        {
          signal,
          sessionId: meta.sessionId,
          parentMsgId: meta.parentMsgId,
        },
        (partial) => {
          if (!this.capabilities.supportsStreaming || !onChunk) return;
          aggregatedText = partial.text || aggregatedText;
          responseContext = {
            sessionId: partial.sessionId,
            parentMsgId: partial.parentMsgId,
          };

          onChunk({
            providerId: this.id,
            ok: true,
            text: aggregatedText,
            partial: true,
            latencyMs: Date.now() - startTime,
            meta: { ...responseContext },
          });
        },
      );

      return {
        providerId: this.id,
        ok: true,
        text: result.text ?? aggregatedText,
        partial: false,
        latencyMs: Date.now() - startTime,
        meta: { sessionId: result.sessionId, parentMsgId: result.parentMsgId },
      };
    } catch (error) {
      if (isProviderAuthError(error) || this._isQwenAuthError(error)) {
        authManager.invalidateCache(this.id);
        await authManager.verifyProvider(this.id);

        const authError = createProviderAuthError(this.id, error);
        return {
          providerId: this.id,
          ok: false,
          text: aggregatedText || null,
          errorCode: 'AUTH_REQUIRED',
          latencyMs: Date.now() - startTime,
          meta: {
            error: authError.toString(),
            details: authError.details,
            ...meta,
          },
        };
      }

      try {
        await errorHandler.handleProviderError(error, this.id, {
          operation: 'sendContinuation',
        });
      } catch (handledError) {
        return {
          providerId: this.id,
          ok: false,
          text: aggregatedText || null,
          errorCode: handledError.code || "unknown",
          latencyMs: Date.now() - startTime,
          meta: {
            error: handledError.toString(),
            details: handledError.details,
            suppressed: handledError.suppressed,
            ...meta,
          },
        };
      }
    }
  }

  async ask(prompt, providerContext = null, sessionId = undefined, onChunk = undefined, signal = undefined) {
    try {
      const meta = providerContext?.meta || providerContext || {};
      const hasContinuation = Boolean(meta.sessionId || meta.parentMsgId);
      pad(`[ProviderAdapter] ASK_STARTED provider=${this.id} hasContext=${hasContinuation}`);

      let res;
      if (hasContinuation) {
        res = await this.sendContinuation(prompt, meta, sessionId, onChunk, signal);
      } else {
        res = await this.sendPrompt({ originalPrompt: prompt, sessionId, meta }, onChunk, signal);
      }

      try {
        const len = (res?.text || "").length;
        pad(`[ProviderAdapter] ASK_COMPLETED provider=${this.id} ok=${res?.ok !== false} textLen=${len}`);
      } catch (_) { }
      return res;
    } catch (e) {
      console.warn(`[ProviderAdapter] ASK_FAILED provider=${this.id}:`, e?.message || String(e));
      throw e;
    }
  }

  _isQwenAuthError(error) {
    const code = error?.code;
    return code === 'login' || code === 'csrf';
  }
}
