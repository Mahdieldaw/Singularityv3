/**
 * explore-computer.ts
 * 
 * Pure computational layer that replaces the Explore LLM step.
 * Runs in ~5ms, no API call needed.
 */

import {
    MapperArtifact,
    ExploreAnalysis,
    QueryType,
    ContainerType,
    ExploreDimension,
    ExploreCondition,
    ExploreParadigm,
    ExploreConflict,
} from '../../../shared/contract';

/**
 * Main entry point: compute Explore analysis from query and MapperArtifact
 */
export function computeExplore(query: string, artifact: MapperArtifact): ExploreAnalysis {
    const queryType = classifyQueryType(query);
    const escapeVelocity = checkEscapeVelocity(artifact);
    const containerType = selectContainer(artifact.topology, queryType, artifact);
    const dimensions = buildDimensionMatrix(artifact);
    const conditions = extractConditions(artifact);
    const paradigms = extractParadigms(artifact);
    const conflicts = extractConflicts(artifact);

    return {
        queryType,
        containerType,
        dimensions,
        conditions,
        paradigms,
        conflicts,
        escapeVelocity,
    };
}

// ============================================================================
// QUERY TYPE CLASSIFICATION (Regex-based)
// ============================================================================

export function classifyQueryType(query: string): QueryType {
    const q = query.toLowerCase().trim();

    // Informational queries
    if (/^(what is|define|explain|describe|tell me about|what are)\b/.test(q)) {
        return "informational";
    }

    // Procedural queries
    if (/^(how do i|how to|steps to|guide|show me how|walk me through)\b/.test(q)) {
        return "procedural";
    }

    // Advisory queries
    if (/^(should i|what's best|what is best|recommend|which should|what do you suggest)\b/.test(q)) {
        return "advisory";
    }

    // Comparative queries
    if (/(compare|vs|versus|difference between|or|better|worse|which is)\b/.test(q)) {
        return "comparative";
    }

    // Creative queries
    if (/^(write|create|generate|brainstorm|come up with|design|build)\b/.test(q)) {
        return "creative";
    }

    // Predictive queries
    if (/(what if|will .* happen|predict|forecast|future of|what will)\b/.test(q)) {
        return "predictive";
    }

    // Interpretive queries
    if (/(why did|what caused|meaning of|significance|interpret)\b/.test(q)) {
        return "interpretive";
    }

    return "general";
}

// ============================================================================
// ESCAPE VELOCITY CHECK
// ============================================================================

export function checkEscapeVelocity(artifact: MapperArtifact): boolean {
    // Escape velocity: can skip mode processing entirely
    // Conditions:
    // 1. Consensus quality is "resolved" (factual agreement)
    // 2. Consensus strength >= 0.9
    // 3. No frame_challengers in outliers
    // 4. Topology is "high_confidence"

    if (artifact.consensus.quality !== "resolved") return false;
    if (artifact.consensus.strength < 0.9) return false;
    if (artifact.topology !== "high_confidence") return false;

    const hasFrameChallengers = artifact.outliers.some(o => o.type === "frame_challenger");
    if (hasFrameChallengers) return false;

    return true;
}

// ============================================================================
// CONTAINER SELECTION (Lookup table)
// ============================================================================

export function selectContainer(
    topology: MapperArtifact['topology'],
    queryType: QueryType,
    artifact: MapperArtifact
): ContainerType {
    // Escape velocity → direct answer
    if (checkEscapeVelocity(artifact)) {
        return "direct_answer";
    }

    // Dimensional topology → comparison matrix
    if (topology === "dimensional") {
        return "comparison_matrix";
    }

    // Contested with multiple frame-challengers → exploration space
    if (topology === "contested") {
        const frameChallengers = artifact.outliers.filter(o => o.type === "frame_challenger");
        if (frameChallengers.length >= 2) {
            return "exploration_space";
        }
    }

    // Check for conditions (applies_when fields)
    const hasConditions = artifact.outliers.some(o => o.applies_when) ||
        artifact.consensus.claims.some(c => c.applies_when);

    // Advisory query with conditions → decision tree
    if (queryType === "advisory" && hasConditions) {
        return "decision_tree";
    }

    // Comparative query → comparison matrix
    if (queryType === "comparative") {
        return "comparison_matrix";
    }

    // Creative query → exploration space
    if (queryType === "creative") {
        return "exploration_space";
    }

    // Informational with contested → exploration space
    if (queryType === "informational" && topology === "contested") {
        return "exploration_space";
    }

    // Procedural with high confidence → direct answer
    if (queryType === "procedural" && topology === "high_confidence") {
        return "direct_answer";
    }

    // Has conditions → decision tree
    if (hasConditions) {
        return "decision_tree";
    }

    // Default based on topology
    if (topology === "high_confidence") {
        return "direct_answer";
    }

    return "comparison_matrix";
}

// ============================================================================
// DIMENSION MATRIX (Aggregation)
// ============================================================================

export function buildDimensionMatrix(artifact: MapperArtifact): ExploreDimension[] {
    const dimensionMap = new Map<string, {
        claims: Array<{ text: string; supporters: number[]; source?: string }>;
        totalSupport: number;
    }>();

    // Aggregate consensus claims by dimension
    for (const claim of artifact.consensus.claims) {
        if (!claim.dimension) continue;

        const existing = dimensionMap.get(claim.dimension) || { claims: [], totalSupport: 0 };
        existing.claims.push({ text: claim.text, supporters: claim.supporters });
        existing.totalSupport += claim.support_count;
        dimensionMap.set(claim.dimension, existing);
    }

    // Add outliers to their dimensions
    for (const outlier of artifact.outliers) {
        if (!outlier.dimension) continue;

        const existing = dimensionMap.get(outlier.dimension) || { claims: [], totalSupport: 0 };
        existing.claims.push({ text: outlier.insight, supporters: [], source: outlier.source });
        dimensionMap.set(outlier.dimension, existing);
    }

    // Find "winner" per dimension (highest support)
    return Array.from(dimensionMap.entries()).map(([name, data]) => {
        const winner = data.claims.reduce((best, claim) =>
            (claim.supporters?.length || 0) > (best.supporters?.length || 0) ? claim : best
        );

        return {
            name,
            winner: winner.text,
            support: data.totalSupport,
            alternatives: data.claims.filter(c => c !== winner).map(c => c.text),
        };
    });
}

// ============================================================================
// CONDITIONS EXTRACTION
// ============================================================================

export function extractConditions(artifact: MapperArtifact): ExploreCondition[] {
    const conditions: ExploreCondition[] = [];

    // From outliers with applies_when
    for (const outlier of artifact.outliers) {
        if (outlier.applies_when) {
            conditions.push({
                if: outlier.applies_when,
                then: outlier.insight,
                source: outlier.source,
                challenges: outlier.challenges,
            });
        }
    }

    // From claims with applies_when
    for (const claim of artifact.consensus.claims) {
        if (claim.applies_when) {
            conditions.push({
                if: claim.applies_when,
                then: claim.text,
                source: `Consensus (${claim.support_count} models)`,
            });
        }
    }

    return conditions;
}

// ============================================================================
// PARADIGMS EXTRACTION (From Frame-Challengers)
// ============================================================================

export function extractParadigms(artifact: MapperArtifact): ExploreParadigm[] {
    return artifact.outliers
        .filter(o => o.type === "frame_challenger")
        .map(o => ({
            name: o.insight.slice(0, 50) + (o.insight.length > 50 ? "..." : ""),
            source: o.source,
            core_idea: o.insight,
            challenges: o.challenges,
        }));
}

// ============================================================================
// CONFLICTS EXTRACTION (From Tensions or Challenges)
// ============================================================================

export function extractConflicts(artifact: MapperArtifact): ExploreConflict[] {
    const conflicts: ExploreConflict[] = [];

    // From explicit tensions array
    if (artifact.tensions) {
        for (const tension of artifact.tensions) {
            conflicts.push({
                between: tension.between,
                type: tension.type as ExploreConflict['type'],
                axis: tension.axis,
            });
        }
    }

    // From challenges field on outliers
    for (const outlier of artifact.outliers) {
        if (outlier.challenges) {
            conflicts.push({
                between: [outlier.insight, outlier.challenges] as [string, string],
                type: "challenges",
                axis: outlier.dimension || "general",
            });
        }
    }

    return conflicts;
}
