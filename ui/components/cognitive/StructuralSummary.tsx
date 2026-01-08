import React, { useMemo } from "react";
import {
    EnrichedClaim,
    ProblemStructure,
    ConflictInfo,
    CascadeRisk,
    LeverageInversion,
} from "../../../shared/contract";

interface StructuralSummaryProps {
    claims: EnrichedClaim[];
    conflicts: ConflictInfo[];
    cascadeRisks: CascadeRisk[];
    leverageInversions: LeverageInversion[];
    ghosts: string[];
    problemStructure?: ProblemStructure;
    modelCount: number;
}

interface SummaryLine {
    type: "floor" | "tension" | "risk";
    icon: string;
    text: string;
    color: string;
}

export const StructuralSummary: React.FC<StructuralSummaryProps> = ({
    claims,
    conflicts,
    cascadeRisks,
    leverageInversions,
    ghosts,
    problemStructure,
    modelCount,
}) => {
    const lines = useMemo(() => {
        const result: SummaryLine[] = [];

        // Sort claims by support
        const bySupport = [...claims].sort(
            (a, b) => b.supporters.length - a.supporters.length
        );
        const highSupport = claims.filter((c) => c.isHighSupport);

        // Calculate consensus level (not shown as %, just used for template selection)
        const topSupport = bySupport[0]?.supporters.length || 0;
        const consensusRatio = modelCount > 0 ? topSupport / modelCount : 0;

        // ═══════════════════════════════════════════════════════════════════
        // LINE 1: THE FLOOR (What's agreed on)
        // ═══════════════════════════════════════════════════════════════════

        const floorLine = buildFloorLine(
            bySupport,
            highSupport,
            consensusRatio,
            modelCount,
            problemStructure
        );
        if (floorLine) result.push(floorLine);

        // ═══════════════════════════════════════════════════════════════════
        // LINE 2: THE TENSION (What's contested)
        // ═══════════════════════════════════════════════════════════════════

        const tensionLine = buildTensionLine(conflicts, problemStructure);
        if (tensionLine) result.push(tensionLine);

        // ═══════════════════════════════════════════════════════════════════
        // LINE 3: THE RISK (What's fragile or missing)
        // ═══════════════════════════════════════════════════════════════════

        const riskLine = buildRiskLine(
            cascadeRisks,
            leverageInversions,
            ghosts,
            claims
        );
        if (riskLine) result.push(riskLine);

        return result;
    }, [claims, conflicts, cascadeRisks, leverageInversions, ghosts, problemStructure, modelCount]);

    if (lines.length === 0) {
        return (
            <div className="text-xs text-text-muted italic py-2">
                Sparse structure — not enough signal for a clear summary.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {lines.map((line, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                    <span className="flex-shrink-0">{line.icon}</span>
                    <span className={`${line.color}`}>{line.text}</span>
                </div>
            ))}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// FLOOR LINE BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildFloorLine(
    bySupport: EnrichedClaim[],
    highSupport: EnrichedClaim[],
    consensusRatio: number,
    modelCount: number,
    structure?: ProblemStructure
): SummaryLine | null {
    if (bySupport.length === 0) return null;

    const top1 = bySupport[0];
    const top2 = bySupport[1];

    // Template selection based on consensus level
    // High consensus (>70% of models agree on top claim)
    if (consensusRatio > 0.7) {
        if (highSupport.length >= 2 && top2) {
            return {
                type: "floor",
                icon: "✓",
                text: `Nearly all sources align on "${top1.label}" and "${top2.label}"`,
                color: "text-emerald-400",
            };
        }
        return {
            type: "floor",
            icon: "✓",
            text: `Strong agreement on "${top1.label}"`,
            color: "text-emerald-400",
        };
    }

    // Medium consensus (40-70%)
    if (consensusRatio > 0.4) {
        if (top2 && top2.supporters.length >= modelCount * 0.3) {
            return {
                type: "floor",
                icon: "◐",
                text: `Most sources back "${top1.label}", with "${top2.label}" also well-supported`,
                color: "text-blue-400",
            };
        }
        return {
            type: "floor",
            icon: "◐",
            text: `About half the sources agree on "${top1.label}"`,
            color: "text-blue-400",
        };
    }

    // Low consensus (<40%)
    if (structure?.primaryPattern === "exploratory") {
        return {
            type: "floor",
            icon: "○",
            text: `Views are scattered — "${top1.label}" has a slight edge but nothing dominates`,
            color: "text-slate-400",
        };
    }

    // Contested or tradeoff - different framing
    if (structure?.primaryPattern === "contested" || structure?.primaryPattern === "tradeoff") {
        if (top2) {
            return {
                type: "floor",
                icon: "◑",
                text: `Sources split between "${top1.label}" and "${top2.label}"`,
                color: "text-orange-400",
            };
        }
    }

    // Default low consensus
    return {
        type: "floor",
        icon: "○",
        text: `No clear consensus — "${top1.label}" leads slightly`,
        color: "text-slate-400",
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// TENSION LINE BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildTensionLine(
    conflicts: ConflictInfo[],
    structure?: ProblemStructure
): SummaryLine | null {
    // High-support conflicts are the interesting ones
    const highStakes = conflicts.filter((c) => c.isBothHighSupport);

    if (highStakes.length > 0) {
        const main = highStakes[0];

        if (main.dynamics === "symmetric") {
            return {
                type: "tension",
                icon: "⚡",
                text: `Genuine disagreement between "${main.claimA.label}" and "${main.claimB.label}" — both have strong backing`,
                color: "text-red-400",
            };
        }

        // Asymmetric - one is winning
        const stronger = main.claimA.supportCount > main.claimB.supportCount
            ? main.claimA
            : main.claimB;
        const weaker = main.claimA.supportCount > main.claimB.supportCount
            ? main.claimB
            : main.claimA;

        return {
            type: "tension",
            icon: "⚡",
            text: `"${stronger.label}" is ahead, but "${weaker.label}" has notable support`,
            color: "text-orange-400",
        };
    }

    // Any conflicts at all (even low-support)
    if (conflicts.length > 0) {
        const main = conflicts[0];
        return {
            type: "tension",
            icon: "↔",
            text: `Some tension between "${main.claimA.label}" and "${main.claimB.label}"`,
            color: "text-amber-400",
        };
    }

    // Tradeoff structure but no explicit conflicts
    if (structure?.primaryPattern === "tradeoff") {
        const data = structure.data as any;
        if (data?.tradeoffs?.[0]) {
            const t = data.tradeoffs[0];
            return {
                type: "tension",
                icon: "⚖️",
                text: `"${t.optionA.label}" trades off against "${t.optionB.label}" — you can't fully have both`,
                color: "text-orange-400",
            };
        }
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// RISK LINE BUILDER
// ═══════════════════════════════════════════════════════════════════════════

function buildRiskLine(
    cascadeRisks: CascadeRisk[],
    leverageInversions: LeverageInversion[],
    ghosts: string[],
    claims: EnrichedClaim[]
): SummaryLine | null {
    // Priority 1: Fragile load-bearing claims (low support, high dependents)
    const fragileCascades = cascadeRisks.filter((r) => {
        const claim = claims.find((c) => c.id === r.sourceId);
        return claim && claim.supporters.length <= 1 && r.dependentIds.length >= 2;
    });

    if (fragileCascades.length > 0) {
        const worst = fragileCascades.sort(
            (a, b) => b.dependentIds.length - a.dependentIds.length
        )[0];
        return {
            type: "risk",
            icon: "⚠️",
            text: `"${worst.sourceLabel}" is thinly supported but ${worst.dependentIds.length} other claims depend on it`,
            color: "text-amber-400",
        };
    }

    // Priority 2: Leverage inversions
    if (leverageInversions.length > 0) {
        const inv = leverageInversions[0];
        return {
            type: "risk",
            icon: "💎",
            text: `"${inv.claimLabel}" might be undervalued — low support but structurally important`,
            color: "text-purple-400",
        };
    }

    // Priority 3: Ghosts (unexplored territory)
    if (ghosts.length > 0) {
        if (ghosts.length === 1) {
            return {
                type: "risk",
                icon: "👻",
                text: `Not addressed: "${ghosts[0]}"`,
                color: "text-slate-400",
            };
        }
        return {
            type: "risk",
            icon: "👻",
            text: `Not addressed: "${ghosts[0]}" and ${ghosts.length - 1} other area${ghosts.length > 2 ? "s" : ""}`,
            color: "text-slate-400",
        };
    }

    return null;
}

export default StructuralSummary;
