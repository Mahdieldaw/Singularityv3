export class PortHealthManager {
  private port: chrome.runtime.Port | null = null;
  private healthCheckInterval: number | null = null;
  private reconnectTimeout: number | null = null;
  private messageHandler: ((msg: any) => void) | null = null;
  private onDisconnectCallback: (() => void) | undefined = undefined;

  // Relaxed health check and reconnect strategy to reduce churn
  private readonly HEALTH_CHECK_INTERVAL = 10000; // 10s (reduced from 30s)
  private readonly RECONNECT_DELAY = 2000; // base delay
  private readonly RECONNECT_JITTER_MS = 500; // random jitter
  private readonly RECONNECT_MAX_DELAY_MS = 30000; // 30s cap
  private readonly MAX_RECONNECT_ATTEMPTS = 5;

  // Throttle constants
  private readonly ACTIVITY_THROTTLE_MS = 5000; // Only send activity ping every 5s max
  private lastActivitySent = 0;

  private reconnectAttempts = 0;
  private isConnected = false;
  private isReconnecting = false;
  private lastPongTimestamp = 0;

  private readyResolve: (() => void) | null = null;
  private readyReject: ((reason?: any) => void) | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyTimeout: number | null = null;

  constructor(
    private portName: string = "htos-popup",
    private options: {
      onHealthy?: () => void;
      onUnhealthy?: () => void;
      onReconnect?: () => void;
    } = {},
  ) { }

  connect(
    messageHandler: (msg: any) => void,
    onDisconnect?: () => void,
  ): chrome.runtime.Port {
    this.messageHandler = messageHandler;
    this.onDisconnectCallback = onDisconnect;

    // Clear any pending reconnect state when starting a fresh connection
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.isReconnecting = false;

    this.port = chrome.runtime.connect({ name: this.portName });
    this.isConnected = false;
    // Note: reconnectAttempts is not reset here to allow backoff to continue across attempts


    this.port.onMessage.addListener(this.handleMessage.bind(this));
    this.port.onDisconnect.addListener(this.handleDisconnect.bind(this));

    this.lastPongTimestamp = Date.now();
    this.startHealthCheck();

    console.log("[PortHealthManager] Connected to service worker");
    return this.port;
  }

  async waitForReady(): Promise<void> {
    if (this.isConnected) return;
    if (!this.readyPromise) {
      this.readyPromise = new Promise((resolve, reject) => {
        this.readyResolve = resolve;
        this.readyReject = reject;
      });

      this.readyTimeout = window.setTimeout(() => {
        this.cleanupReadyPromise("Connection timeout after 10s");
      }, 10000);
    }
    return this.readyPromise;
  }

  private cleanupReadyPromise(errorMsg?: string) {
    if (this.readyTimeout) {
      clearTimeout(this.readyTimeout);
      this.readyTimeout = null;
    }
    if (errorMsg && this.readyReject) {
      this.readyReject(new Error(errorMsg));
    }
    this.readyResolve = null;
    this.readyReject = null;
    this.readyPromise = null;
  }

  private sendKeepalivePing() {
    if (!this.port) return;

    try {
      this.port.postMessage({ type: "KEEPALIVE_PING", timestamp: Date.now() });
    } catch (error) {
      console.warn("[PortHealthManager] Failed to send keepalive ping:", error);
      this.handleUnhealthyPort();
    }
  }

  private startHealthCheck() {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);

    this.healthCheckInterval = window.setInterval(() => {
      this.sendKeepalivePing();

      if (this.isConnected) {
        const timeSinceLastPong = Date.now() - this.lastPongTimestamp;
        // Be more tolerant before declaring unhealthy
        if (timeSinceLastPong > this.HEALTH_CHECK_INTERVAL * 3) {
          console.warn(
            "[PortHealthManager] No pong received, port may be unhealthy",
          );
          this.handleUnhealthyPort();
        }
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  private stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private handleMessage(message: any) {
    // Any inbound traffic indicates the port is alive; update timestamp first
    this.lastPongTimestamp = Date.now();

    // Notify SW of activity so lifecycle manager can record activity (best-effort)
    // FIX: THROTTLED to prevent flooding SW with thousands of messages during streaming
    const now = Date.now();
    if (now - this.lastActivitySent > this.ACTIVITY_THROTTLE_MS) {
      this.lastActivitySent = now;
      try {
        if (
          chrome &&
          chrome.runtime &&
          typeof chrome.runtime.sendMessage === "function"
        ) {
          chrome.runtime.sendMessage(
            { type: "htos.activity", timestamp: now },
            () => {
              try {
                if (chrome.runtime && chrome.runtime.lastError) {
                  /* ignore transient delivery errors */
                }
              } catch (_) { }
            },
          );
        }
      } catch (e) { }
    }

    if (message.type === "KEEPALIVE_PONG") {
      if (!this.isConnected) {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log("[PortHealthManager] Port healthy again");
        this.options.onHealthy?.();
      }
      return;
    }

    if (message.type === "HANDLER_READY") {
      console.log("[PortHealthManager] Service worker handler ready");
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.options.onHealthy?.();
      if (this.readyResolve) {
        this.readyResolve();
        this.cleanupReadyPromise();
      }
      return;
    }

    if (this.messageHandler) {
      this.messageHandler(message);
    }
  }

  private handleDisconnect() {
    console.log("[PortHealthManager] Port disconnected (idle or closed)");
    this.isConnected = false;
    this.cleanupReadyPromise("Port disconnected");

    this.options.onUnhealthy?.();
    this.onDisconnectCallback?.();

    this.disconnect({ suppressReconnect: true });
    this.attemptReconnect();
  }

  private handleUnhealthyPort() {
    if (!this.isConnected) return;

    console.log("[PortHealthManager] Port unhealthy, attempting reconnect");
    this.isConnected = false;
    this.cleanupReadyPromise("Port became unhealthy");
    this.options.onUnhealthy?.();

    this.disconnect({ suppressReconnect: true });
    this.attemptReconnect();
  }

  private attemptReconnect() {
    if (this.isReconnecting) return;
    
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error(`[PortHealthManager] Max reconnect attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Stopping.`);
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      this.isReconnecting = false;
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;
    const jitter = Math.floor(Math.random() * this.RECONNECT_JITTER_MS);
    const base = this.RECONNECT_DELAY + jitter;
    const rawDelay = base * Math.pow(2, this.reconnectAttempts - 1);
    const delay = Math.min(rawDelay, this.RECONNECT_MAX_DELAY_MS);

    console.log(
      `[PortHealthManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`,
    );

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = window.setTimeout(() => {
      this.isReconnecting = false;
      if (this.messageHandler) {
        this.connect(this.messageHandler, this.onDisconnectCallback);
        this.options.onReconnect?.();
      }
    }, delay);
  }

  disconnect(options: { suppressReconnect?: boolean } = {}) {
    this.isConnected = false;
    this.stopHealthCheck();

    if (!options.suppressReconnect) {
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      this.isReconnecting = false;
    }

    if (this.port) {
      try {
        this.port.disconnect();
      } catch (e) { }
      this.port = null;
    }
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      lastPongTimestamp: this.lastPongTimestamp,
      timeSinceLastPong: Date.now() - this.lastPongTimestamp,
    };
  }

  checkHealth() {
    this.sendKeepalivePing();
  }
}
