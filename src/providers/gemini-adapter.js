/**
 * HTOS Gemini Provider Adapter (Unified)
 * - Implements ProviderAdapter interface for Gemini AND Gemini Pro
 * - Handles both Flash and Pro models via dynamic configuration
 */
import { classifyProviderError } from "../core/request-lifecycle-manager.js";

const GEMINI_ADAPTER_DEBUG = false;
const pad = (...args) => {
  if (GEMINI_ADAPTER_DEBUG) console.log(...args);
};

export class GeminiAdapter {
  constructor(controller, idOverride = "gemini") {
    this.id = idOverride;
    this.capabilities = {
      needsDNR: false,
      needsOffscreen: false,
      supportsStreaming: false, // Non-streaming to avoid canvas/immersive documents
      supportsContinuation: true,
      synthesis: false,
      // Only allow model selection if NOT explicitly Pro (Pro is fixed)
      supportsModelSelection: this.id !== "gemini-pro",
    };
    this.controller = controller;
  }

  async init() {
    return;
  }

  async healthCheck() {
    try {
      return await this.controller.isAvailable();
    } catch {
      return false;
    }
  }

  async sendPrompt(req, onChunk, signal) {
    const startTime = Date.now();
    try {
      // Auto-select model based on adapter ID if not specified in request
      let defaultModel = "gemini-flash";
      if (this.id === "gemini-pro") defaultModel = "gemini-pro";
      if (this.id === "gemini-exp") defaultModel = "gemini-exp";
      const model = req.meta?.model || defaultModel;

      pad(`[GeminiAdapter:${this.id}] Sending prompt with model: ${model}`);

      const result = await this.controller.geminiSession.ask(
        req.originalPrompt,
        {
          signal,
          cursor: req.meta?.cursor,
          model,
        }
      );

      // NORMALIZATION LOGIC (From Pro Adapter)
      const normalizedText =
        result?.text ??
        result?.candidates?.[0]?.content ??
        (typeof result === "string" ? result : JSON.stringify(result));

      // 🔍 DETECT GEMINI IMMERSIVE CONTENT
      if (normalizedText && (normalizedText.includes('googleusercontent.com/immersive_entry_chip') || normalizedText.includes('immersive-editor'))) {
        console.warn(`[GeminiAdapter:${this.id}] 🎨 IMMERSIVE CONTENT DETECTED in response`, {
          textPreview: normalizedText.substring(0, 200),
          fullLength: normalizedText.length,
          model,
        });
      }

      // Emit streaming chunk if applicable
      try {
        if (onChunk && normalizedText && normalizedText.length > 0) {
          onChunk({
            providerId: this.id,
            ok: true,
            text: normalizedText,
            partial: true,
            latencyMs: Date.now() - startTime,
            meta: {
              cursor: result.cursor,
              token: result.token,
              modelName: result.modelName,
              model,
            },
          });
        }
      } catch (_) { }

      return {
        providerId: this.id,
        ok: true,
        id: null,
        text: normalizedText,
        partial: false,
        latencyMs: Date.now() - startTime,
        meta: {
          cursor: result.cursor,
          token: result.token,
          modelName: result.modelName,
          model,
        },
      };
    } catch (error) {
      const classification = classifyProviderError("gemini-session", error);
      const errorCode = classification.type || "unknown";
      return {
        providerId: this.id,
        ok: false,
        text: null,
        errorCode,
        latencyMs: Date.now() - startTime,
        meta: {
          error: error.toString(),
          details: error.details,
          suppressed: classification.suppressed,
        },
      };
    }
  }

  async sendContinuation(prompt, providerContext, sessionId, onChunk, signal) {
    const startTime = Date.now();
    try {
      const meta = providerContext?.meta || providerContext || {};
      const cursor = providerContext?.cursor ?? meta.cursor;

      let defaultModel = "gemini-flash";
      if (this.id === "gemini-pro") defaultModel = "gemini-pro";
      if (this.id === "gemini-exp") defaultModel = "gemini-exp";
      const model = (providerContext?.model ?? meta.model) || defaultModel;

      // STRICT CONTINUATION: Do NOT fall back to new chat. 
      // If we lost the cursor, we must report it so data integrity is preserved.
      if (!cursor) {
        console.warn(`[GeminiAdapter:${this.id}] Context missing (no cursor)`);
        throw new Error("Continuity lost: Missing Gemini cursor for this thread.");
      }

      pad(`[GeminiAdapter:${this.id}] Continuing chat with model: ${model}`);

      const result = await this.controller.geminiSession.ask(prompt, {
        signal,
        cursor,
        model,
      });

      // NORMALIZATION LOGIC (From Pro Adapter)
      const normalizedText =
        result?.text ??
        result?.candidates?.[0]?.content ??
        (typeof result === "string" ? result : JSON.stringify(result));

      // 🔍 DETECT GEMINI IMMERSIVE CONTENT
      if (normalizedText && (normalizedText.includes('googleusercontent.com/immersive_entry_chip') || normalizedText.includes('immersive-editor'))) {
        console.warn(`[GeminiAdapter:${this.id}] 🎨 IMMERSIVE CONTENT DETECTED in continuation`, {
          textPreview: normalizedText.substring(0, 200),
          fullLength: normalizedText.length,
          model,
        });
      }

      try {
        if (onChunk && normalizedText && normalizedText.length > 0) {
          onChunk({
            providerId: this.id,
            ok: true,
            text: normalizedText,
            partial: true,
            latencyMs: Date.now() - startTime,
            meta: {
              cursor: result.cursor,
              token: result.token,
              modelName: result.modelName,
              model,
            },
          });
        }
      } catch (_) { }

      return {
        providerId: this.id,
        ok: true,
        id: null,
        text: normalizedText,
        partial: false,
        latencyMs: Date.now() - startTime,
        meta: {
          cursor: result.cursor,
          token: result.token,
          modelName: result.modelName,
          model,
        },
      };
    } catch (error) {
      const classification = classifyProviderError("gemini-session", error);
      const errorCode = classification.type || "unknown";
      return {
        providerId: this.id,
        ok: false,
        text: null,
        errorCode,
        latencyMs: Date.now() - startTime,
        meta: {
          error: error.toString(),
          details: error.details,
          suppressed: classification.suppressed,
          // Return partial context so UI can debug what was missing
          cursor: providerContext?.cursor ?? providerContext?.meta?.cursor,
        },
      };
    }
  }

  /**
   * Unified ask API
   * Routes to sendContinuation or sendPrompt based on context presence.
   */
  async ask(
    prompt,
    providerContext = null,
    sessionId = undefined,
    onChunk = undefined,
    signal = undefined,
  ) {
    try {
      const meta = providerContext?.meta || providerContext || {};
      const hasCursor = Boolean(meta.cursor || providerContext?.cursor);

      pad(`[ProviderAdapter] ASK_STARTED provider=${this.id} hasContext=${hasCursor}`);

      let res;
      if (hasCursor) {
        res = await this.sendContinuation(
          prompt,
          providerContext,
          sessionId,
          onChunk,
          signal,
        );
      } else {
        res = await this.sendPrompt(
          { originalPrompt: prompt, sessionId, meta },
          onChunk,
          signal,
        );
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
}