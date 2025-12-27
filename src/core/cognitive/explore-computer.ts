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
    Specificity,
    EnrichedOutlier,
    DimensionCoverage,
    SummaryBarData,
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

    // NEW: Dimension-first analysis
    const dimensionCoverage = computeDimensionCoverage(artifact);
    const sortedCoverage = sortDimensions(dimensionCoverage);

    // Enrich outliers with scores
    const consensusDimensions = new Set(
        artifact.consensus.claims.map(c => c.dimension).filter(Boolean) as string[]
    );
    const allOutliers = artifact.outliers.map(o =>
        computeOutlierElevation(o, consensusDimensions, artifact.outliers)
    );

    // Sort by elevation score and mark top 3 as recommended
    const sortedOutliers = [...allOutliers].sort((a, b) => b.elevation_score - a.elevation_score);
    sortedOutliers.slice(0, 3).forEach(o => o.is_recommended = true);

    // Build summary bar
    const summaryBar = computeSummaryBar(artifact, sortedCoverage, queryType, escapeVelocity);

    return {
        queryType,
        containerType,
        dimensions,
        conditions,
        paradigms,
        conflicts,
        escapeVelocity,
        // NEW fields
        dimensionCoverage: sortedCoverage,
        recommendedOutliers: sortedOutliers.filter(o => o.is_recommended),
        allOutliers: sortedOutliers,
        summaryBar,
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

// ============================================================================
// DIMENSION-FIRST ANALYSIS FUNCTIONS (NEW)
// ============================================================================

/**
 * Compute specificity level of text based on patterns
 */
export function computeSpecificity(text: string): Specificity {
    const lower = text.toLowerCase();

    // Actionable: Has clear action verbs, steps, or tools
    const actionablePatterns = [
        /^(use|start|build|create|position|open-source|leverage)/,
        /step \d|first,|then,|finally,/,
        /by \w+ing/,  // "by positioning", "by leveraging"
    ];
    if (actionablePatterns.some(p => p.test(lower))) {
        return 'actionable';
    }

    // Specific: Has concrete examples, proper nouns, or conditions
    const specificPatterns = [
        /e\.g\.|for example|such as/,
        /when .{10,}/,  // "when targeting high-stakes..."
        /if .{10,}/,    // "if resources are limited..."
        /"[^"]+"/,      // Quoted terms
    ];
    if (specificPatterns.some(p => p.test(lower))) {
        return 'specific';
    }

    // Moderate: Medium length with causal language
    if (text.length > 80 && /because|since|therefore|thus/.test(lower)) {
        return 'moderate';
    }

    return 'vague';
}

/**
 * Compute elevation score for an outlier (0-10)
 */
export function computeOutlierElevation(
    outlier: MapperArtifact['outliers'][0],
    consensusDimensions: Set<string>,
    allOutliers: MapperArtifact['outliers']
): EnrichedOutlier {
    let score = 0;

    // +3: Frame challenger (most important signal)
    if (outlier.type === 'frame_challenger') {
        score += 3;
    }

    // +2: Covers dimension consensus missed
    const coversGap = outlier.dimension ? !consensusDimensions.has(outlier.dimension) : false;
    if (coversGap) {
        score += 2;
    }

    // +1: Has specific condition
    if (outlier.applies_when && outlier.applies_when.length > 10) {
        score += 1;
    }

    // +1: Explicitly challenges something
    if (outlier.challenges) {
        score += 1;
    }

    // +1-2: Specificity
    const specificity = computeSpecificity(outlier.insight);
    if (specificity === 'actionable') score += 2;
    else if (specificity === 'specific') score += 1;

    // +1: Unique dimension (no other outlier has it)
    const dimensionCount = allOutliers.filter(o => o.dimension === outlier.dimension).length;
    if (dimensionCount === 1 && outlier.dimension) {
        score += 1;
    }

    return {
        ...outlier,
        elevation_score: Math.min(score, 10),
        covers_consensus_gap: coversGap,
        specificity,
        is_recommended: false, // Set later after sorting all
    };
}

/**
 * Compute dimension coverage analysis
 */
export function computeDimensionCoverage(artifact: MapperArtifact): DimensionCoverage[] {
    const allDimensions = artifact.dimensions_found || [];

    return allDimensions.map(dim => {
        const consensusClaims = artifact.consensus.claims.filter(c => c.dimension === dim);
        const outlierClaims = artifact.outliers.filter(o => o.dimension === dim);
        const hasFrameChallenger = outlierClaims.some(o => o.type === 'frame_challenger');

        const consensusCount = consensusClaims.length;
        const outlierCount = outlierClaims.length;

        // Determine status
        const is_gap = consensusCount === 0 && outlierCount > 0;
        const is_contested = consensusCount > 0 && outlierCount > 0;
        let status: "gap" | "contested" | "settled";
        if (is_gap) status = "gap";
        else if (is_contested || hasFrameChallenger) status = "contested";
        else status = "settled";

        // Find leader (highest support, or outlier if no consensus)
        let leader: string | null = null;
        let leaderSource: string | null = null;
        let supportBar: number | null = null;

        if (consensusClaims.length > 0) {
            const top = consensusClaims.reduce((a, b) =>
                a.support_count > b.support_count ? a : b
            );
            leader = top.text;
            leaderSource = `${top.support_count} models`;
            supportBar = top.support_count;
        } else if (outlierClaims.length > 0) {
            leader = outlierClaims[0].insight;
            leaderSource = outlierClaims[0].source;
        }

        return {
            dimension: dim,
            consensus_claims: consensusCount,
            outlier_claims: outlierCount,
            is_gap,
            is_contested,
            status,
            leader,
            leader_source: leaderSource,
            support_bar: supportBar,
        };
    });
}

/**
 * Sort dimensions: Gaps first, then Contested, then Settled
 */
export function sortDimensions(coverage: DimensionCoverage[]): DimensionCoverage[] {
    return [...coverage].sort((a, b) => {
        // 1. GAPS first (outliers only) - highest signal
        if (a.status === 'gap' && b.status !== 'gap') return -1;
        if (b.status === 'gap' && a.status !== 'gap') return 1;

        // 2. CONTESTED second (both present) - needs attention
        if (a.status === 'contested' && b.status === 'settled') return -1;
        if (b.status === 'contested' && a.status === 'settled') return 1;

        // 3. SETTLED last (consensus only) - already resolved
        // Within same category, sort by support
        return (b.support_bar || 0) - (a.support_bar || 0);
    });
}

/**
 * Build universal summary bar data
 */
export function computeSummaryBar(
    artifact: MapperArtifact,
    dimensionCoverage: DimensionCoverage[],
    queryType: string,
    escapeVelocity: boolean
): SummaryBarData {
    const gaps = dimensionCoverage.filter(d => d.status === 'gap').length;
    const contested = dimensionCoverage.filter(d => d.status === 'contested').length;
    const settled = dimensionCoverage.filter(d => d.status === 'settled').length;

    // The Lead
    const topClaim = artifact.consensus.claims[0];
    const hasStrongConsensus = artifact.consensus.strength >= 0.7 && gaps === 0;

    let lead: SummaryBarData['lead'];
    if (hasStrongConsensus && topClaim) {
        lead = {
            text: topClaim.text,
            support: topClaim.support_count,
            type: "consensus" as const
        };
    } else if (gaps > settled) {
        lead = {
            text: `${gaps} dimensions only covered by outliers`,
            support: null,
            type: "exploration" as const
        };
    } else if (contested > 0) {
        lead = {
            text: `${contested} dimensions contested`,
            support: null,
            type: "contested" as const
        };
    } else {
        lead = {
            text: topClaim?.text || "Mixed signals",
            support: topClaim?.support_count || null,
            type: "consensus" as const
        };
    }

    // Signals
    const challengers = artifact.outliers.filter(o => o.type === 'frame_challenger').length;
    const conditions = [
        ...artifact.consensus.claims.filter(c => c.applies_when),
        ...artifact.outliers.filter(o => o.applies_when)
    ].length;

    return {
        lead,
        coverage: {
            gaps,
            contested,
            settled,
            total: dimensionCoverage.length,
        },
        signals: {
            challengers,
            conditions,
            tensions: artifact.tensions?.length || 0,
            ghost: artifact.ghost || null,
        },
        meta: {
            modelCount: artifact.model_count,
            strength: Math.round(artifact.consensus.strength * 100),
            queryType,
            escapeVelocity,
            topology: artifact.topology,
        },
    };
}
