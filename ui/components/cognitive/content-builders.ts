import {
    MapperArtifact,
    ExploreAnalysis,
    ComparisonContent,
    ExplorationContent,
    DecisionTreeContent,
    DirectAnswerContent
} from "../../../shared/contract";

const MODEL_NAMES = ["gpt", "claude", "gemini", "qwen", "deepseek", "perplexity"];

const getModelNames = (indices: number[]): string[] =>
    indices.map((i) => MODEL_NAMES[i] || `model-${i}`);

export function buildComparisonContent(
    artifact: MapperArtifact,
    _analysis: ExploreAnalysis
): ComparisonContent {
    const dimensions = (artifact.dimensions_found || []).map((dimName) => {
        const dimClaims = artifact.consensus.claims.filter((c) => c.dimension === dimName);
        const dimOutliers = artifact.outliers.filter((o) => o.dimension === dimName);

        const winner =
            dimClaims.length > 0
                ? dimClaims.reduce((best, c) => (c.support_count > best.support_count ? c : best))
                : null;

        const sources = winner
            ? getModelNames(winner.supporters)
            : dimOutliers.length > 0
                ? [dimOutliers[0].source]
                : [];

        const tension = artifact.tensions?.find(
            (t) =>
                t.axis.toLowerCase().includes(dimName.toLowerCase()) ||
                t.between.some((b) => b.toLowerCase().includes(dimName.toLowerCase()))
        );

        const tradeoff = tension ? `${tension.between[0]} vs ${tension.between[1]}` : winner?.applies_when || "";

        return {
            name: dimName.replace(/_/g, " "),
            winner: winner?.text || dimOutliers[0]?.insight || "No clear winner",
            sources,
            tradeoff
        };
    });

    const approaches = [...new Set(dimensions.map((d) => d.winner))].slice(0, 4);
    const dimNames = dimensions.map((d) => d.name);

    const scores = dimNames.map((dimName) => {
        const dim = dimensions.find((d) => d.name === dimName);
        return approaches.map((approach) => (approach === dim?.winner ? 8 : 5));
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

export function buildExplorationContent(
    artifact: MapperArtifact,
    _analysis: ExploreAnalysis
): ExplorationContent {
    const paradigms = artifact.outliers
        .filter((o) => o.type === "frame_challenger")
        .map((o) => ({
            name: o.insight.slice(0, 50) + (o.insight.length > 50 ? "..." : ""),
            source: o.source,
            core_idea: o.insight,
            best_for: o.applies_when || "Consider when standard approach doesn't fit"
        }));

    if (paradigms.length < 2 && artifact.consensus.claims.length > 0) {
        const topClaim = artifact.consensus.claims[0];
        paradigms.unshift({
            name: "Consensus View",
            source: `${topClaim.support_count} models`,
            core_idea: topClaim.text,
            best_for: topClaim.applies_when || "General recommendation"
        });
    }

    const common_thread =
        artifact.consensus.claims
            .filter((c) => c.support_count >= 4)
            .map((c) => c.text)
            .slice(0, 2)
            .join("; ") || undefined;

    return {
        paradigms,
        common_thread,
        ghost: artifact.ghost || undefined
    };
}

export function buildDecisionTreeContent(
    artifact: MapperArtifact,
    _analysis: ExploreAnalysis
): DecisionTreeContent {
    const defaultClaim = artifact.consensus.claims[0];
    const default_path = defaultClaim?.text || "No clear default recommendation";

    const conditions = artifact.outliers
        .filter((o) => o.applies_when)
        .map((o) => ({
            condition: o.applies_when!,
            path: o.insight,
            reasoning: o.challenges || `Alternative to ${o.dimension || "default"} approach`,
            source: o.source
        }));

    artifact.consensus.claims
        .filter((c) => c.applies_when && c !== defaultClaim)
        .forEach((c) => {
            conditions.push({
                condition: c.applies_when!,
                path: c.text,
                reasoning: `Supported by ${c.support_count} models`,
                source: `${c.support_count} models`
            });
        });

    const challenger = artifact.outliers.find((o) => o.type === "frame_challenger");
    const frame_challenger = challenger
        ? {
            position: challenger.insight,
            source: challenger.source,
            consider_if:
                challenger.applies_when || challenger.challenges || "Standard approach doesn't fit your situation"
        }
        : undefined;

    return {
        default_path,
        conditions,
        frame_challenger
    };
}

export function buildDirectAnswerContent(
    artifact: MapperArtifact,
    _analysis: ExploreAnalysis
): DirectAnswerContent {
    const answer = artifact.consensus.claims[0]?.text || "No clear consensus reached";

    const additional_context = artifact.outliers
        .filter((o) => o.type === "supplemental")
        .map((o) => ({
            text: o.insight,
            source: o.source
        }));

    return {
        answer,
        additional_context
    };
}

