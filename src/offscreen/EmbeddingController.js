/**
 * EMBEDDING CONTROLLER - OFFSCREEN DOCUMENT
 * 
 * Runs embedding model inference using WebGPU (primary) or WASM (fallback).
 * Returns number[][] over the message bus (JSON-serializable).
 * 
 * Features:
 * - Model caching with single-flight loading pattern
 * - WebGPU with automatic WASM fallback
 * - Batch processing for efficiency
 */

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let modelCache = new Map();
let inFlightLoad = null;
let currentBackend = null;
let currentModelId = null;

// ═══════════════════════════════════════════════════════════════════════════
// MODEL INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

async function ensureModel(modelId = 'all-MiniLM-L6-v2') {
    // Check cache first
    if (modelCache.has(modelId)) {
        return modelCache.get(modelId);
    }

    // Single-flight pattern: wait for any in-progress load
    if (inFlightLoad) {
        await inFlightLoad;
        if (modelCache.has(modelId)) {
            return modelCache.get(modelId);
        }
    }

    // Load model dynamically
    console.log(`[EmbeddingController] Loading model ${modelId}...`);
    const startTime = performance.now();

    inFlightLoad = (async () => {
        // Dynamic import of transformers library
        const { pipeline, env } = await import('@huggingface/transformers');

        // Configure for local models only
        env.allowRemoteModels = false;
        env.allowLocalModels = true;
        env.localModelPath = chrome.runtime.getURL('/models/');

        let model;
        const hasWebGPU = typeof navigator !== 'undefined' && !!navigator.gpu;

        if (hasWebGPU) {
            try {
                model = await pipeline('feature-extraction', modelId, {
                    device: 'webgpu',
                });
                currentBackend = 'webgpu';
                console.log(`[EmbeddingController] Loaded with WebGPU in ${Math.round(performance.now() - startTime)}ms`);
            } catch (webgpuError) {
                console.warn('[EmbeddingController] WebGPU failed, falling back to WASM:', webgpuError);
                model = await pipeline('feature-extraction', modelId, {
                    device: 'wasm',
                });
                currentBackend = 'wasm';
                console.log(`[EmbeddingController] Loaded with WASM fallback in ${Math.round(performance.now() - startTime)}ms`);
            }
        } else {
            model = await pipeline('feature-extraction', modelId, {
                device: 'wasm',
            });
            currentBackend = 'wasm';
            console.log(`[EmbeddingController] Loaded with WASM in ${Math.round(performance.now() - startTime)}ms`);
        }

        currentModelId = modelId;
        modelCache.set(modelId, model);
        return model;
    })();

    const result = await inFlightLoad;
    inFlightLoad = null;
    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// EMBEDDING GENERATION
// ═══════════════════════════════════════════════════════════════════════════

async function generateEmbeddings(texts, targetDimensions, modelId = 'all-MiniLM-L6-v2') {
    const embedder = await ensureModel(modelId);

    const startTime = performance.now();
    const batchSize = 32;
    const allEmbeddings = [];

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);

        const outputs = await embedder(batch, {
            pooling: 'mean',
            normalize: true,
        });

        // Handle both array and single output cases
        for (let j = 0; j < batch.length; j++) {
            // outputs.tolist() returns the raw array data
            const outputData = outputs.tolist ? outputs.tolist() : outputs;
            const data = Array.isArray(outputData[j]) ? outputData[j] : outputData;

            // Truncate to target dimensions (MRL - Matryoshka Representation Learning)
            const truncated = Array.isArray(data)
                ? data.slice(0, targetDimensions)
                : Array.from(data).slice(0, targetDimensions);

            allEmbeddings.push(truncated);
        }
    }

    return {
        embeddings: allEmbeddings,  // number[][] for JSON serialization
        dimensions: targetDimensions,
        timeMs: performance.now() - startTime,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

const EmbeddingController = {
    async init() {
        console.log('[EmbeddingController] Initializing...');

        // Register with bus if available
        if (window['bus']) {
            window['bus'].on('embeddings.embedTexts', async (texts, opts = {}) => {
                try {
                    const { dims = 256, modelId = 'all-MiniLM-L6-v2' } = opts;
                    return await generateEmbeddings(texts, dims, modelId);
                } catch (error) {
                    console.error('[EmbeddingController] embedTexts failed:', error);
                    throw error;
                }
            });

            window['bus'].on('embeddings.ping', async () => {
                return { ready: modelCache.size > 0 };
            });

            window['bus'].on('embeddings.status', async () => {
                return {
                    ready: modelCache.size > 0,
                    backend: currentBackend,
                    modelId: currentModelId,
                };
            });

            console.log('[EmbeddingController] Registered bus handlers');
        }

        // Also listen for direct chrome.runtime messages
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            if (message.type === 'GENERATE_EMBEDDINGS') {
                const { texts, dimensions, modelId } = message.payload;

                generateEmbeddings(texts, dimensions, modelId)
                    .then(result => sendResponse({ success: true, result }))
                    .catch(error => {
                        console.error('[EmbeddingController] Generation failed:', error);
                        sendResponse({ success: false, error: error.message });
                    });

                return true;  // Async response
            }

            if (message.type === 'PRELOAD_MODEL') {
                const { modelId } = message.payload || {};

                ensureModel(modelId || 'all-MiniLM-L6-v2')
                    .then(() => sendResponse({ success: true }))
                    .catch(error => sendResponse({ success: false, error: error.message }));

                return true;  // Async response
            }

            if (message.type === 'EMBEDDING_STATUS') {
                sendResponse({
                    success: true,
                    result: {
                        ready: modelCache.size > 0,
                        backend: currentBackend,
                        modelId: currentModelId,
                    },
                });
                return false;  // Sync response
            }

            return false;
        });

        console.log('[EmbeddingController] Initialized successfully');
    },
};

export { EmbeddingController };
