import {
    MapperArtifact,
    ExploreAnalysis,
    ComparisonContent,
    ExplorationContent,
    DecisionTreeContent,
    DirectAnswerContent
} from '../../../shared/contract';

// Helper to get model name from index
const MODEL_NAMES = ['gpt', 'claude', 'gemini', 'qwen', 'deepseek', 'perplexity'];
const getModelNames = (indices: number[]): string[] =>
    indices.map(i => MODEL_NAMES[i] || `model-${i}`);

/**
 * Build ComparisonContent from artifact + analysis
 */
export function buildComparisonContent(
    artifact: MapperArtifact,
    analysis: ExploreAnalysis
): ComparisonContent {

    const dimensions = (artifact.dimensions_found || []).map(dimName => {
        // Find claims tagged with this dimension
        const dimClaims = artifact.consensus.claims.filter(c => c.dimension === dimName);
        const dimOutliers = artifact.outliers.filter(o => o.dimension === dimName);

        // Winner is highest support claim in this dimension
        const winner = dimClaims.length > 0
            ? dimClaims.reduce((best, c) => c.support_count > best.support_count ? c : best)
            : null;

        // Get sources from winner supporters
        const sources = winner ? getModelNames(winner.supporters) :
            dimOutliers.length > 0 ? [dimOutliers[0].source] : [];

        // Find tradeoff from tensions
        const tension = artifact.tensions?.find(t =>
            t.axis.toLowerCase().includes(dimName.toLowerCase()) ||
            t.between.some(b => b.toLowerCase().includes(dimName.toLowerCase()))
        );
        const tradeoff = tension
            ? `${tension.between[0]} vs ${tension.between[1]}`
            : winner?.applies_when || '';

        return {
            name: dimName.replace('_', ' '),
            winner: winner?.text || dimOutliers[0]?.insight || 'No clear winner',
            sources,
            tradeoff
        };
    });

    // Build simplified matrix (we don't have real scores, so derive from support)
    const approaches = [...new Set(dimensions.map(d => d.winner))].slice(0, 4);
    const dimNames = dimensions.map(d => d.name);

    const scores = dimNames.map(dimName => {
        const dim = dimensions.find(d => d.name === dimName);
        return approaches.map(approach =>
            approach === dim?.winner ? 8 : 5  // Winner gets 8, others get 5
        );
    });

    return {
        dimensions,
        matrix: {
            approaches,
            dimensions: dimNames,
            scores
        }
    };
}

/**
 * Build ExplorationContent from artifact + analysis
 */
export function buildExplorationContent(
    artifact: MapperArtifact,
    analysis: ExploreAnalysis
): ExplorationContent {

    // Paradigms from frame-challengers + distinct consensus themes
    const paradigms = artifact.outliers
        .filter(o => o.type === 'frame_challenger')
        .map(o => ({
            name: o.insight.slice(0, 50) + (o.insight.length > 50 ? '...' : ''),
            source: o.source,
            core_idea: o.insight,
            best_for: o.applies_when || 'Consider when standard approach doesn\'t fit'
        }));

    // Add top consensus as a "paradigm" if we have few frame-challengers
    if (paradigms.length < 2 && artifact.consensus.claims.length > 0) {
        const topClaim = artifact.consensus.claims[0];
        paradigms.unshift({
            name: 'Consensus View',
            source: `${topClaim.support_count} models`,
            core_idea: topClaim.text,
            best_for: topClaim.applies_when || 'General recommendation'
        });
    }

    // Common thread from high-agreement claims
    const common_thread = artifact.consensus.claims
        .filter(c => c.support_count >= 4)
        .map(c => c.text)
        .slice(0, 2)
        .join('; ') || undefined;

    return {
        paradigms,
        common_thread,
        ghost: artifact.ghost || undefined
    };
}

/**
 * Build DecisionTreeContent from artifact + analysis
 */
export function buildDecisionTreeContent(
    artifact: MapperArtifact,
    analysis: ExploreAnalysis
): DecisionTreeContent {

    // Default path is top consensus claim
    const defaultClaim = artifact.consensus.claims[0];
    const default_path = defaultClaim?.text || 'No clear default recommendation';

    // Conditions from outliers with applies_when
    const conditions = artifact.outliers
        .filter(o => o.applies_when)
        .map(o => ({
            condition: o.applies_when!,
            path: o.insight,
            reasoning: o.challenges || `Alternative to ${o.dimension || 'default'} approach`,
            source: o.source
        }));

    // Also add consensus claims with applies_when as conditions
    artifact.consensus.claims
        .filter(c => c.applies_when && c !== defaultClaim)
        .forEach(c => {
            conditions.push({
                condition: c.applies_when!,
                path: c.text,
                reasoning: `Supported by ${c.support_count} models`,
                source: `${c.support_count} models`
            });
        });

    // Frame challenger from outliers
    const challenger = artifact.outliers.find(o => o.type === 'frame_challenger');
    const frame_challenger = challenger ? {
        position: challenger.insight,
        source: challenger.source,
        consider_if: challenger.applies_when || challenger.challenges ||
            'Standard approach doesn\'t fit your situation'
    } : undefined;

    return {
        default_path,
        conditions,
        frame_challenger
    };
}

/**
 * Build DirectAnswerContent from artifact + analysis
 */
export function buildDirectAnswerContent(
    artifact: MapperArtifact,
    analysis: ExploreAnalysis
): DirectAnswerContent {

    // Answer is the top consensus claim
    const answer = artifact.consensus.claims[0]?.text ||
        'No clear consensus reached';

    // Additional context from supplemental outliers
    const additional_context = artifact.outliers
        .filter(o => o.type === 'supplemental')
        .map(o => ({
            text: o.insight,
            source: o.source
        }));

    return {
        answer,
        additional_context
    };
}
