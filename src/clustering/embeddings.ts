// ═══════════════════════════════════════════════════════════════════════════
// EMBEDDING CLIENT - SERVICE WORKER SIDE
// ═══════════════════════════════════════════════════════════════════════════
//
// Communicates with offscreen document for embedding generation.
// 
// Key features:
// - Accepts shadowStatements to build embedding text from unclipped sources
// - Rehydrates Float32Array from JSON-serialized number[][]
// - Renormalizes embeddings after truncation for determinism
// ═══════════════════════════════════════════════════════════════════════════

import type { ShadowParagraph } from '../shadow/ShadowParagraphProjector';
import type { ShadowStatement } from '../shadow/ShadowExtractor';
import type { EmbeddingResult } from './types';
import { ClusteringConfig, DEFAULT_CONFIG } from './config';

/**
 * Ensure offscreen document exists for embedding inference.
 */
async function ensureOffscreen(): Promise<void> {
    // Check if chrome.offscreen is available (may not be in all contexts)
    if (typeof chrome === 'undefined' || !chrome.offscreen) {
        throw new Error('Chrome offscreen API not available');
    }

    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    });

    if (existingContexts.length > 0) return;

    await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: 'Embedding model inference for semantic clustering',
    });
}

/**
 * Normalize embedding vector (L2 norm).
 * Critical for determinism after truncation.
 */
function normalizeEmbedding(vec: Float32Array): Float32Array {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) {
        norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
        for (let i = 0; i < vec.length; i++) {
            vec[i] /= norm;
        }
    }

    return vec;
}

/**
 * Request embeddings from offscreen worker.
 * 
 * Builds text from original ShadowStatement texts (unclipped),
 * rehydrates Float32Array, and renormalizes after truncation.
 */
export async function generateEmbeddings(
    paragraphs: ShadowParagraph[],
    shadowStatements: ShadowStatement[],
    config: ClusteringConfig = DEFAULT_CONFIG
): Promise<EmbeddingResult> {
    await ensureOffscreen();

    // Build texts from original statement texts (NOT _fullParagraph)
    const statementsById = new Map(shadowStatements.map(s => [s.id, s]));
    const texts = paragraphs.map(p =>
        p.statementIds
            .map(sid => statementsById.get(sid)?.text || '')
            .filter(t => t.length > 0)
            .join(' ')
    );
    const ids = paragraphs.map(p => p.id);

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                type: 'GENERATE_EMBEDDINGS',
                payload: {
                    texts,
                    dimensions: config.embeddingDimensions,
                    modelId: config.modelId,
                },
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (!response?.success) {
                    reject(new Error(response?.error || 'Embedding generation failed'));
                    return;
                }

                // Rehydrate Float32Array and renormalize
                const embeddings = new Map<string, Float32Array>();
                for (let i = 0; i < ids.length; i++) {
                    const rawData = response.result.embeddings[i] as number[];

                    // Truncate if needed (MRL - Matryoshka Representation Learning)
                    const truncatedData = rawData.length > config.embeddingDimensions
                        ? rawData.slice(0, config.embeddingDimensions)
                        : rawData;

                    let emb = new Float32Array(truncatedData);

                    // Renormalize after truncation (critical for determinism)
                    emb = normalizeEmbedding(emb);

                    embeddings.set(ids[i], emb);
                }

                resolve({
                    embeddings,
                    dimensions: config.embeddingDimensions,
                    timeMs: response.result.timeMs,
                });
            }
        );
    });
}

/**
 * Preload embedding model (call during idle time).
 */
export async function preloadModel(config: ClusteringConfig = DEFAULT_CONFIG): Promise<void> {
    await ensureOffscreen();

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                type: 'PRELOAD_MODEL',
                payload: { modelId: config.modelId }
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response?.success) {
                    resolve();
                } else {
                    reject(new Error(response?.error || 'Model preload failed'));
                }
            }
        );
    });
}

/**
 * Check embedding service status.
 */
export async function getEmbeddingStatus(): Promise<{
    ready: boolean;
    backend: 'webgpu' | 'wasm' | null;
    modelId: string | null;
}> {
    await ensureOffscreen();

    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type: 'EMBEDDING_STATUS' },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response?.success) {
                    resolve(response.result);
                } else {
                    reject(new Error(response?.error || 'Status check failed'));
                }
            }
        );
    });
}
