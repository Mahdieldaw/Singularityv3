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
        try {
            await inFlightLoad;
        } catch {
            // Previous load failed, we'll retry below
        }
        if (modelCache.has(modelId)) {
            return modelCache.get(modelId);
        }
    }

    // Load model dynamically
    console.log(`[EmbeddingController] Loading model ${modelId}...`);
    const startTime = performance.now();

    inFlightLoad = (async () => {
        try {
            // Dynamic import of transformers library
            const { pipeline, env } = await import('@huggingface/transformers');

            // === CRITICAL: Configure for local-only MV3 Chrome extension ===

            // 1. Force local files only
            env.allowRemoteModels = false;
            env.allowLocalModels = true;

            // 2. Disable browser cache (unsupported for chrome-extension://)
            env.useBrowserCache = false;
            env.cacheDir = null;

            // 3. Point to extension root for models
            env.localModelPath = chrome.runtime.getURL('/');

            // 4. CRITICAL: Set WASM paths BEFORE any pipeline call
            // Initialize backends if not present
            if (!env.backends) env.backends = {};
            if (!env.backends.onnx) env.backends.onnx = {};
            if (!env.backends.onnx.wasm) env.backends.onnx.wasm = {};
            env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('/onnx/');

            console.log('[EmbeddingController] Config:', {
                localModelPath: env.localModelPath,
                wasmPaths: env.backends.onnx.wasm.wasmPaths,
                allowRemoteModels: env.allowRemoteModels,
            });

            let model;
            const modelPath = `models/${modelId}`;

            // Pipeline options - use fp32 for model.onnx or q8 for model_quantized.onnx
            const pipelineOptions = {
                dtype: 'q8',
            };

            if (hasWebGPU) {
                try {
                    model = await pipeline('feature-extraction', modelPath, {
                        ...pipelineOptions,
                        device: 'webgpu',
                    });
                    currentBackend = 'webgpu';
                    console.log(`[EmbeddingController] Loaded with WebGPU in ${Math.round(performance.now() - startTime)}ms`);
                } catch (webgpuError) {
                    console.warn('[EmbeddingController] WebGPU failed, falling back to WASM:', webgpuError);
                    model = await pipeline('feature-extraction', modelPath, {
                        ...pipelineOptions,
                        device: 'wasm',
                    });
                    currentBackend = 'wasm';
                    console.log(`[EmbeddingController] Loaded with WASM fallback in ${Math.round(performance.now() - startTime)}ms`);
                }
            } else {
                model = await pipeline('feature-extraction', modelPath, {
                    ...pipelineOptions,
                    device: 'wasm',
                });
                currentBackend = 'wasm';
                console.log(`[EmbeddingController] Loaded with WASM in ${Math.round(performance.now() - startTime)}ms`);
            }

            currentModelId = modelId;
            modelCache.set(modelId, model);
            return model;
        } finally {
            // Always clear inFlightLoad so retries can happen on failure
            inFlightLoad = null;
        }
    })();

    return await inFlightLoad;
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
