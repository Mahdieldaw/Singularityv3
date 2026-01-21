// ═══════════════════════════════════════════════════════════════════════════
// HIERARCHICAL AGGLOMERATIVE CLUSTERING
// ═══════════════════════════════════════════════════════════════════════════

import { ClusteringConfig } from './config';
import { quantizeSimilarity } from './distance';

/**
 * Average linkage: mean distance between all pairs across clusters.
 * This is generally best for semantic clustering.
 */
function averageLinkage(
    clusterA: Set<number>,
    clusterB: Set<number>,
    distances: number[][]
): number {
    let sum = 0;
    let count = 0;

    for (const i of clusterA) {
        for (const j of clusterB) {
            sum += distances[i][j];
            count++;
        }
    }

    return count > 0 ? sum / count : Infinity;
}

/**
 * Hierarchical Agglomerative Clustering with threshold-based stopping.
 * 
 * Includes stable tie-breakers and max clusters safety limit.
 * 
 * Key behavior:
 * - Cluster count is EMERGENT from data, not forced
 * - Algorithm stops when nothing is similar enough to merge
 * - If cluster count exceeds maxClusters, forces merges to stay under limit
 * 
 * @param paragraphIds - Array of paragraph IDs in stable order
 * @param distances - Distance matrix (pre-computed, quantized)
 * @param config - Clustering configuration
 * @returns Array of clusters, each cluster is array of paragraph indices
 */
export function hierarchicalCluster(
    paragraphIds: string[],
    distances: number[][],
    config: ClusteringConfig
): number[][] {
    const n = paragraphIds.length;

    // Edge case: too few items
    if (n < config.minParagraphsForClustering) {
        return Array.from({ length: n }, (_, i) => [i]);
    }

    // Initialize: each item is its own cluster with stable IDs
    const clusters: Set<number>[] = Array.from({ length: n }, (_, i) => new Set([i]));
    const active = new Set(Array.from({ length: n }, (_, i) => i));

    // Convert similarity threshold to distance threshold
    const distanceThreshold = 1 - config.similarityThreshold;

    // Merge loop
    while (active.size > 1) {
        // Find closest pair with stable ordering for tie-breaking
        let minDist = Infinity;
        let minI = -1;
        let minJ = -1;

        // Stable order for determinism
        const activeArray = Array.from(active).sort((a, b) => a - b);

        for (let ai = 0; ai < activeArray.length; ai++) {
            for (let aj = ai + 1; aj < activeArray.length; aj++) {
                const i = activeArray[ai];
                const j = activeArray[aj];
                const dist = quantizeSimilarity(averageLinkage(clusters[i], clusters[j], distances));

                // Stable tie-breaker - prefer lower index pairs
                if (dist < minDist || (dist === minDist && (i < minI || (i === minI && j < minJ)))) {
                    minDist = dist;
                    minI = i;
                    minJ = j;
                }
            }
        }

        // Stop conditions with max clusters safety

        // Under limit: stop if threshold exceeded
        if (active.size <= config.maxClusters && minDist > distanceThreshold) {
            break;
        }

        // Over limit: force merge even if over threshold (safety mechanism)
        // (Will continue loop until we're under limit or at 1 cluster)

        // Merge j into i
        for (const idx of clusters[minJ]) {
            clusters[minI].add(idx);
        }
        active.delete(minJ);
    }

    // Convert to stable array format
    return Array.from(active)
        .sort((a, b) => a - b)
        .map(i => Array.from(clusters[i]).sort((a, b) => a - b));
}
