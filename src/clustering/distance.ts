// ═══════════════════════════════════════════════════════════════════════════
// DISTANCE & SIMILARITY CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Quantize similarity for deterministic comparisons.
 * Prevents floating-point drift across runs (GPU may vary slightly).
 */
export function quantizeSimilarity(sim: number): number {
    return Math.round(sim * 1e6) / 1e6;
}

/**
 * Cosine similarity between two normalized vectors.
 * Assumes vectors are already L2 normalized.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
    }
    return dot;
}

/**
 * Build distance matrix from embeddings.
 * Returns distances (1 - similarity) for HAC algorithm.
 * 
 * Uses quantized similarities for determinism.
 */
export function buildDistanceMatrix(
    ids: string[],
    embeddings: Map<string, Float32Array>
): number[][] {
    const n = ids.length;
    const distances: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));
    const warnedIds = new Set<string>();

    for (let i = 0; i < n; i++) {
        const embA = embeddings.get(ids[i]);

        for (let j = i + 1; j < n; j++) {
            const embB = embeddings.get(ids[j]);

            // Handle missing embeddings with Infinity sentinel
            if (!embA || !embB) {
                distances[i][j] = Infinity;
                distances[j][i] = Infinity;

                // Warn once per missing id
                if (!embA && !warnedIds.has(ids[i])) {
                    warnedIds.add(ids[i]);
                    console.warn(`[distance] Missing embedding for id: ${ids[i]}`);
                }
                if (!embB && !warnedIds.has(ids[j])) {
                    warnedIds.add(ids[j]);
                    console.warn(`[distance] Missing embedding for id: ${ids[j]}`);
                }
                continue;
            }

            const sim = cosineSimilarity(embA, embB);
            const simQ = quantizeSimilarity(sim);
            const dist = 1 - simQ;
            distances[i][j] = dist;
            distances[j][i] = dist;
        }
    }

    return distances;
}

/**
 * Compute cluster cohesion (average similarity to centroid).
 * 
 * Uses quantized similarities.
 */
export function computeCohesion(
    memberIds: string[],
    centroidId: string,
    embeddings: Map<string, Float32Array>
): number {
    if (memberIds.length <= 1) return 1.0;

    const centroidEmb = embeddings.get(centroidId);
    if (!centroidEmb) return 0;

    let totalSim = 0;
    let count = 0;

    for (const id of memberIds) {
        // Skip centroid to avoid biasing average with 1.0
        if (id === centroidId) continue;

        const emb = embeddings.get(id);
        if (!emb) continue;

        const sim = cosineSimilarity(emb, centroidEmb);
        totalSim += quantizeSimilarity(sim);
        count++;
    }

    return count > 0 ? totalSim / count : 0;
}
