/**
 * HTOS Gemini Provider Implementation
 *
 * This adapter module provides Gemini AI integration following HTOS patterns.
 * Handles Gemini session-based authentication using browser cookies.
 *
 * Build-phase safe: emitted to dist/adapters/*
 */
import { BusController } from "../core/vendor-exports.js";
import { ArtifactProcessor } from "../../shared/artifact-processor";

// Provider-specific debug flag (off by default)
const GEMINI_DEBUG = false;

// =============================================================================
// GEMINI MODELS CONFIGURATION
// =============================================================================
export const GeminiModels = {
  "gemini-flash": {
    id: "gemini-flash",
    name: "Gemini 2.5 Flash",
    description: "Fast and efficient model for everyday tasks",
    maxTokens: 9999,
    header: '[1,null,null,null,"9ec249fc9ad08861",null,null,0,[4]]',
  },
  "gemini-pro": {
    id: "gemini-pro",
    name: "Gemini 2.5 Pro",
    description: "Advanced model with enhanced reasoning capabilities",
    maxTokens: 9999,
    header: '[1,null,null,null,"61530e79959ab139",null,null,0,[4]]',
  },
  "gemini-exp": {
    id: "gemini-exp",
    name: "Gemini 3.0",
    description: "Latest experimental capability",
    maxTokens: 9999,
    header: '[1,null,null,null,"9d8ca3786ebdfbea",null,null,0,[4]]',
  },
};

// =============================================================================
// GEMINI ERROR TYPES
// =============================================================================
export class GeminiProviderError extends Error {
  constructor(type, details) {
    super(type);
    this.name = "GeminiProviderError";
    this.type = type;
    this.details = details;
  }
  get is() {
    return {
      login: this.type === "login",
      badToken: this.type === "badToken",
      failedToExtractToken: this.type === "failedToExtractToken",
      failedToReadResponse: this.type === "failedToReadResponse",
      noGeminiAccess: this.type === "noGeminiAccess",
      aborted: this.type === "aborted",
      network: this.type === "network",
      unknown: this.type === "unknown",
    };
  }
}

// =============================================================================
// GEMINI SESSION API
// =============================================================================
export class GeminiSessionApi {
  /**
   * @param {{ sharedState?: any, utils?: any, fetchImpl?: typeof fetch }} dependencies
   */
  constructor({ sharedState, utils, fetchImpl = fetch } = {}) {
    this._logs = true;
    this.sharedState = sharedState;
    this.utils = utils;
    this.fetch = fetchImpl;
    // Bind and wrap methods for error handling
    this.ask = this._wrapMethod(this.ask);
  }

  isOwnError(e) {
    return e instanceof GeminiProviderError;
  }

  /**
   * Send prompt to Gemini AI and handle response
   * @param {string} prompt - The prompt text
   * @param {{ token?: {at: string, bl: string} | null, cursor?: any[], model?: string, signal?: AbortSignal }} options - Request options
   * @param {boolean} retrying - Token-refresh retry flag (prevents infinite token refresh loops)
   * @param {number} coldStartRetries - Cold-start retry counter (tracks backend initialization retries)
   */
  async ask(
    prompt,
    {
      token = null,
      cursor = ["", "", ""],
      model = "gemini-flash",
      signal,
    } = {},
    retrying = false,
    coldStartRetries = 0,
  ) {
    // Use prefetched token if available
    if (!token && this.sharedState?.prefetchedToken) {
      token = this.sharedState.prefetchedToken;
      delete this.sharedState.prefetchedToken; // Consume once
    }
    if (!token) {
      token = await this._fetchToken();
    }

    // Generate collision-resistant request ID
    const reqId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    const url =
      "/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate";

    // Get model configuration
    const modelConfig = GeminiModels[model] || GeminiModels["gemini-flash"];

    const body = new URLSearchParams({
      at: token.at,
      "f.req": JSON.stringify([null, JSON.stringify([[prompt], null, cursor])]),
    });

    const response = await this._fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "x-goog-ext-525001261-jspb": modelConfig.header,
      },
      signal,
      query: {
        bl: token.bl,
        rt: "c",
        _reqid: reqId,
      },
      body,
    });

    // Token-refresh retry closure (maintains separation from cold-start logic)
    const retry = async (msg = "") => {
      if (retrying) {
        this._throw("badToken", msg);
      }
      // Preserve cold-start retry count across token refreshes
      return this.ask(prompt, { token: null, cursor, model, signal }, true, coldStartRetries);
    };

    if (response.status !== 200) {
      let responseText = "";
      if (this.utils?.noThrow) {
        responseText = await this.utils.noThrow(() => response.text(), null) || "";
      } else {
        responseText = await response.text();
      }

      if (response.status === 400) {
        return retry(responseText);
      }
      this._throw("unknown", responseText);
    }

    let parsedLines = [];
    let c, u;
    try {
      // Gemini returns an XSSI prefix like ")]}'" followed by multiple JSON lines.
      const raw = await response.text();
      const cleaned = raw.replace(/^\)\]\}'\s*\n?/, "").trim();
      const jsonLines = cleaned
        .split("\n")
        .filter((line) => line.trim().startsWith("["));
      if (jsonLines.length === 0)
        throw new Error("No JSON lines detected in response");
      // Parse all JSON lines (robust to multi-line responses)
      parsedLines = jsonLines
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);
    } catch (e) {
      this._throw("failedToReadResponse", { step: "data", error: e });
    }

    // ========================================================================
    // Cold-Start Failure Detection (BEFORE error code check)
    // ========================================================================
    const hasColdStartSignature = parsedLines.some(line =>
      line.some(entry =>
        Array.isArray(entry) &&
        entry[0] === "e" &&
        entry[1] === 4
      )
    );

    if (hasColdStartSignature) {
      const MAX_COLD_START_RETRIES = 3;

      if (coldStartRetries >= MAX_COLD_START_RETRIES) {
        this._throw("unknown", `Max cold start retries (${MAX_COLD_START_RETRIES}) exceeded`);
      }

      console.warn(
        `[Gemini] Cold start detected: [["e",4,...]] - retrying (attempt ${coldStartRetries + 1}/${MAX_COLD_START_RETRIES})`
      );

      // Wait 500ms-2s for backend to stabilize
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1500));

      // Retry with fresh token and incremented cold-start counter
      return this.ask(
        prompt,
        { token: null, cursor, model, signal },
        false, // Reset token-refresh flag
        coldStartRetries + 1 // Increment cold-start counter
      );
    }
    // ========================================================================

    // Check error code on FIRST parsed line only (before payload extraction)
    try {
      c = parsedLines[0]?.[0]?.[5]?.[0] ?? null;
    } catch (e) {
      this._throw("failedToReadResponse", { step: "errorCode", error: e });
    }

    if (c === 9) {
      // Treat code 9 as access issue
      this._throw("noGeminiAccess");
    }
    if (c === 7) {
      // Bad token or session mismatch — refresh token for retry
      return retry();
    }

    // Extract payload from parsed lines (only reached if code !== 9 and code !== 7)
    // Strategy: First try to find a chunk with actual text.
    // If none found, fall back to any chunk that looks like a valid payload (has t[4]),
    // ignoring simple keep-alives.

    // Pass 1: Look for text
    for (const L of parsedLines) {
      const found = L.find((entry) => {
        try {
          if (typeof entry[2] !== "string") return false;
          const t = JSON.parse(entry[2]);
          const text = t[0]?.[0] || t[4]?.[0]?.[1]?.[0] || "";

          if (text && text.trim().length > 0) {
            const baseCursor = Array.isArray(t?.[1]) ? t[1] : [];
            const tail = t?.[4]?.[0]?.[0];
            const cursor = tail !== undefined ? [...baseCursor, tail] : baseCursor;
            u = { text, cursor };
            return true;
          }
          return false;
        } catch (e) { return false; }
      });
      if (found) break;
    }

    // Pass 2: Fallback (if no text found) - look for any valid payload structure
    if (!u) {
      for (const L of parsedLines) {
        const found = L.find((entry) => {
          try {
            if (typeof entry[2] !== "string") return false;
            const t = JSON.parse(entry[2]);

            // Skip keep-alives (no t[4])
            if (!t[4] || !Array.isArray(t[4])) return false;

            const text = t[0]?.[0] || t[4]?.[0]?.[1]?.[0] || "";
            const baseCursor = Array.isArray(t?.[1]) ? t[1] : [];
            const tail = t?.[4]?.[0]?.[0];
            const cursor = tail !== undefined ? [...baseCursor, tail] : baseCursor;

            u = { text, cursor };
            return true;
          } catch (e) { return false; }
        });
        if (found) break;
      }
    }

    if (!u) {
      this._throw("failedToReadResponse", {
        step: "answer",
        error: "No valid text payload found in response lines"
      });
    }

    // --- Immersive Content Extraction ---
    // Look for hidden markdown content (stories, code, etc) in the response tree
    const immersiveContent = [];
    const images = [];

    for (const L of parsedLines) {
      L.forEach((entry) => {
        try {
          if (typeof entry[2] !== "string") return;
          const t = JSON.parse(entry[2]);
          this._findImmersiveContent(t, immersiveContent);
          this._findImages(t, images);
        } catch (e) { }
      });
    }

    // Replace Image Placeholders with Markdown Images
    // Use shared ArtifactProcessor for consistent handling
    const processor = new ArtifactProcessor();
    if (images.length > 0 && u?.text) {
      u.text = processor.injectImages(u.text, images);
    }

    // Append extracted content as Claude-style artifacts
    if (immersiveContent.length > 0 && u) {
      immersiveContent.forEach((item) => {
        // Avoid duplicates if multiple chunks contain the same item
        if (u.text && !u.text.includes(`identifier="${item.identifier}"`)) {
          u.text += processor.formatArtifact(item);
        }
      });
    }

    if (GEMINI_DEBUG)
      console.info("[Gemini] Response received:", {
        hasText: !!u?.text,
        textLength: u?.text?.length || 0,
        immersiveItems: immersiveContent.length,
        images: images.length,
        status: response?.status || "unknown",
        model: modelConfig.name,
      });

    return {
      text: u.text || "",
      cursor: u.cursor || [],
      token,
      modelName: modelConfig.name,
    };
  }

  /**
   * Recursively search for images
   * Structure: [URL, null, width, height, "Title", URL, ID, ...]
   */
  _findImages(obj, results) {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      // Check signature for Image Data
      if (
        obj.length >= 5 &&
        typeof obj[0] === "string" &&
        (obj[0].startsWith("http") || obj[0].startsWith("data:image")) &&
        typeof obj[2] === "number" && // Width
        typeof obj[3] === "number" && // Height
        typeof obj[4] === "string"    // Title
      ) {
        // Check if already added
        if (!results.find((r) => r.url === obj[0])) {
          results.push({
            url: obj[0],
            width: obj[2],
            height: obj[3],
            title: obj[4],
            id: obj[6] // Optional ID
          });
        }
      }
      // Continue search
      obj.forEach((child) => this._findImages(child, results));
    }
  }

  /**
   * Recursively search for immersive content (e.g. markdown files)
   * Structure: [filename.md, id, title, null, content]
   */
  _findImmersiveContent(obj, results) {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      // Check signature: [filename, id, title, null, content]
      if (
        obj.length >= 5 &&
        typeof obj[0] === "string" &&
        (obj[0].includes(".") || obj[0].length > 0) && // Basic filename check
        !obj[0].includes("_image_") && // EXCLUDE internal image references
        typeof obj[2] === "string" && // Title
        typeof obj[4] === "string" // Content
      ) {
        // Check if already added
        if (!results.find((r) => r.identifier === obj[0])) {
          results.push({
            identifier: obj[0],
            title: obj[2],
            content: obj[4],
          });
        }
      }
      // Continue search
      obj.forEach((child) => this._findImmersiveContent(child, results));
    }
  }

  /**
   * Get maximum tokens for the current model
   */
  get _maxTokens() {
    return (
      this.sharedState?.ai?.connections?.get?.("gemini-session")
        ?.modelMaxTokens || 4096
    );
  }

  /**
   * Fetch authentication token from Gemini
   */
  async _fetchToken() {
    const response = await this._fetch("/faq");
    const t = await response.text();
    let n;
    if (!t.includes("$authuser")) {
      this._throw("login");
    }
    try {
      n = {
        at: this._extractKeyValue(t, "SNlM0e"),
        bl: this._extractKeyValue(t, "cfb2h"),
      };
      if (!n.at || !n.bl) {
        throw new Error("Empty token value extracted");
      }
    } catch (e) {
      this._throw("failedToExtractToken", e);
    }
    return n;
  }

  /**
   * Extract key-value pairs from response text
   * Improved robustness with type guards and safe array access
   */
  _extractKeyValue(str, key) {
    if (typeof str !== "string" || typeof key !== "string") return "";
    const p1 = str.split(key);
    if (p1.length < 2) return "";
    const p2 = p1[1].split('":"');
    if (p2.length < 2) return "";
    const p3 = p2[1].split('"');
    return p3[0] || "";
  }

  /**
   * Make authenticated fetch request to Gemini
   */
  async _fetch(path, options = {}) {
    // Handles both GET and POST with query params
    let url = `https://gemini.google.com${path}`;
    if (options.query) {
      const params = new URLSearchParams(options.query).toString();
      url += (url.includes("?") ? "&" : "?") + params;
      delete options.query;
    }
    options.credentials = "include";
    return await this.fetch(url, options);
  }

  /**
   * Wrap methods with error handling
   */
  _wrapMethod(fn) {
    return async (...args) => {
      try {
        return await fn.call(this, ...args);
      } catch (e) {
        let err;
        if (this.isOwnError(e)) err = e;
        else if (String(e) === "TypeError: Failed to fetch")
          err = this._createError("network", e.message);
        else if (String(e) === "AbortError: The user aborted a request.")
          err = this._createError("aborted", e.message);
        else err = this._createError("unknown", e.message);
        if (err.details) this._logError(err.message, err.details);
        else this._logError(err.message);
        throw err;
      }
    };
  }

  _throw(type, details) {
    throw this._createError(type, details);
  }

  _createError(type, details) {
    return new GeminiProviderError(type, details);
  }

  _logError(...args) {
    if (this._logs) {
      console.error("GeminiSessionApi:", ...args);
    }
  }
}

// =============================================================================
// GEMINI PROVIDER CONTROLLER
// =============================================================================
export class GeminiProviderController {
  constructor(dependencies = {}) {
    this.initialized = false;
    this.api = new GeminiSessionApi(dependencies);
  }

  async init() {
    if (this.initialized) return;
    // Register with BusController for cross-context communication
    if (typeof BusController !== "undefined") {
      BusController.on(
        "gemini-provider.ask",
        this._handleAskRequest.bind(this),
      );
      BusController.on(
        "gemini-provider.fetchToken",
        this._handleFetchTokenRequest.bind(this),
      );
    }
    this.initialized = true;
  }

  async _handleAskRequest(payload) {
    return await this.api.ask(
      payload.prompt,
      payload.options || {},
      payload.retrying || false,
      payload.coldStartRetries || 0,
    );
  }

  async _handleFetchTokenRequest() {
    return await this.api._fetchToken();
  }

  /**
   * Check if Gemini is available (user is logged in)
   */
  async isAvailable() {
    try {
      await this.api._fetchToken();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Expose Gemini API instance for direct usage
   */
  get geminiSession() {
    return this.api;
  }

  isOwnError(e) {
    return this.api.isOwnError(e);
  }
}

// =============================================================================
// MODULE EXPORTS
// =============================================================================
export default GeminiProviderController;

// Build-phase safe: Browser global compatibility
if (typeof window !== "undefined") {
  window["HTOS"] = window["HTOS"] || {};
  window["HTOS"]["GeminiProvider"] = GeminiProviderController;
}