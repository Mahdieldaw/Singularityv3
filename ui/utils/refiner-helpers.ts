import { RefinerOutput } from "../../shared/parsing-utils";

export interface StructuredHonestAssessment {
    reliabilitySummary: string;
    biggestRisk: string;
    recommendedNextStep: string;
}

export function getStructuredAssessment(
    output: RefinerOutput | null
): StructuredHonestAssessment | null {
    if (!output?.honestAssessment) return null;

    if (typeof output.honestAssessment === 'object') {
        return output.honestAssessment as StructuredHonestAssessment;
    }

    return null;
}

export function getGapCounts(output: RefinerOutput | null): {
    total: number;
    foundational: number;
    tactical: number;
} {
    if (!output?.gaps) {
        return { total: 0, foundational: 0, tactical: 0 };
    }

    const foundational = output.gaps.filter(g => g.category === 'foundational').length;
    const tactical = output.gaps.filter(g => g.category === 'tactical' || !g.category).length;

    return {
        total: output.gaps.length,
        foundational,
        tactical
    };
}
