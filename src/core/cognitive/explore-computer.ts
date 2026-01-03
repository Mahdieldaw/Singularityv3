/**
 * explore-computer.ts
 * 
 * Pure computational layer that replaces the Explore LLM step.
 * Runs in ~5ms, no API call needed.
 * V3 Refactor: Narrative-first, no container selection.
 */

import {
    MapperArtifact,
    ExploreAnalysis,
} from '../../../shared/contract';

/**
 * Main entry point: compute Explore analysis from query and MapperArtifact
 */
export function computeExplore(query: string, artifact: MapperArtifact): ExploreAnalysis {
    const claims = artifact.claims || [];

    const consensusCount = claims.filter((c) => (c.supporters?.length || 0) >= 2).length;
    const outlierCount = claims.filter((c) => (c.supporters?.length || 0) < 2).length;
    const challengerCount = claims.filter((c) => c.role === 'challenger').length;
    const claimCount = claims.length;

    const convergenceRatio = claimCount > 0 ? consensusCount / claimCount : 0;

    return {
        claimCount,
        consensusCount,
        outlierCount,
        challengerCount,
        convergenceRatio,
        hasChallengers: challengerCount > 0,
    };
}
