// src/ui/utils/streamingBuffer.ts
type ResponseType = "batch" | "synthesis" | "mapping" | "refiner" | "antagonist";

interface BatchUpdate {
  providerId: string;
  text: string;
  status: string;
  responseType: ResponseType;
  createdAt: number;
}

export class StreamingBuffer {
  // Keyed by `${responseType}:${providerId}` to avoid collisions across types
  private pendingDeltas: Map<
    string,
    {
      deltas: { text: string; ts: number }[];
      status: string;
      responseType: ResponseType;
    }
  > = new Map();

  private onFlushCallback: (updates: BatchUpdate[]) => void;
  private pendingFlushRaf: number | null = null;
  private lastFlushTime = 0;

  constructor(onFlush: (updates: BatchUpdate[]) => void) {
    this.onFlushCallback = onFlush;
  }

  addDelta(
    providerId: string,
    delta: string,
    status: string,
    responseType: ResponseType,
  ) {
    const key = `${responseType}:${providerId}`;
    if (!this.pendingDeltas.has(key)) {
      this.pendingDeltas.set(key, {
        deltas: [],
        status,
        responseType,
      });
    }

    const entry = this.pendingDeltas.get(key)!;
    entry.deltas.push({ text: delta, ts: Date.now() });
    entry.status = status;
    entry.responseType = responseType;

    // ✅ ADAPTIVE THROTTLING: Immediate if 1 provider, batched if 2+
    this.scheduleFlush();
  }

  private scheduleFlush() {
    // Optimized count: how many providers are currently contributing to pending deltas?
    // We already have their entries in pendingDeltas. 
    // Wait, the user logic counts active streaming providers across ALL states.
    // Let's count how many distinct providerIds are in our pendingDeltas map.
    const activeProviderIds = new Set<string>();
    this.pendingDeltas.forEach((_, key) => {
      const providerId = key.split(":")[1];
      activeProviderIds.add(providerId);
    });

    const activeCount = activeProviderIds.size;

    // ✅ ZERO LATENCY: Single provider streams immediately
    if (activeCount <= 1) {
      if (this.pendingFlushRaf) {
        cancelAnimationFrame(this.pendingFlushRaf);
        this.pendingFlushRaf = null;
      }
      this.flushAll();
      return;
    }

    // ✅ SMART BATCHING: Multiple providers -> throttle at 60fps (16.6ms)
    const now = performance.now();
    const timeSinceLastFlush = now - this.lastFlushTime;
    const BATCH_INTERVAL = 16.6; // ~60fps

    if (timeSinceLastFlush >= BATCH_INTERVAL) {
      if (this.pendingFlushRaf) {
        cancelAnimationFrame(this.pendingFlushRaf);
        this.pendingFlushRaf = null;
      }
      this.flushAll();
    } else if (!this.pendingFlushRaf) {
      this.pendingFlushRaf = requestAnimationFrame(() => {
        this.pendingFlushRaf = null;
        this.flushAll();
      });
    }
  }

  private flushAll() {
    const updates: BatchUpdate[] = [];

    this.pendingDeltas.forEach((entry, compositeKey) => {
      const idx = compositeKey.indexOf(":");
      const providerId = idx >= 0 ? compositeKey.slice(idx + 1) : compositeKey;
      const concatenatedText = entry.deltas.map((d) => d.text).join("");
      const lastTs = entry.deltas.length
        ? entry.deltas[entry.deltas.length - 1].ts
        : Date.now();
      updates.push({
        providerId,
        text: concatenatedText,
        status: entry.status,
        responseType: entry.responseType,
        createdAt: lastTs,
      });
    });

    this.pendingDeltas.clear();

    if (updates.length > 0) {
      updates.sort((a, b) => a.createdAt - b.createdAt);
      this.onFlushCallback(updates);
      this.lastFlushTime = performance.now();
    }
  }

  flushImmediate() {
    if (this.pendingFlushRaf) {
      cancelAnimationFrame(this.pendingFlushRaf);
      this.pendingFlushRaf = null;
    }
    this.flushAll();
  }

  clear() {
    if (this.pendingFlushRaf) {
      cancelAnimationFrame(this.pendingFlushRaf);
      this.pendingFlushRaf = null;
    }
    this.pendingDeltas.clear();
  }
}
