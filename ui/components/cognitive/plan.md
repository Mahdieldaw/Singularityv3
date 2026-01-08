StructuralSummary.tsx
React

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
  const top3 = bySupport[2];

  // Template selection based on consensus level
  // High consensus (>70% of models agree on top claim)
  if (consensusRatio > 0.7) {
    if (highSupport.length >= 2) {
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
Simplified MetricsRibbon.tsx
Now the ribbon is just a container for the summary:

React

import React, { useState } from "react";
import {
  StructuralAnalysis,
  ProblemStructure,
  MapperArtifact,
} from "../../../shared/contract";
import { StructuralSummary } from "./StructuralSummary";

interface MetricsRibbonProps {
  artifact?: MapperArtifact;
  analysis?: StructuralAnalysis;
  problemStructure?: ProblemStructure;
}

export const MetricsRibbon: React.FC<MetricsRibbonProps> = ({
  artifact,
  analysis,
  problemStructure,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!analysis) return null;

  const {
    claimsWithLeverage: claims = [],
    patterns,
    landscape,
    ghostAnalysis,
  } = analysis;

  const modelCount = landscape?.modelCount || 0;
  const ghosts = artifact?.ghosts || [];

  // Confidence badge
  const confidence = problemStructure?.confidence;
  const isLowConfidence = confidence ? confidence < 0.5 : false;

  return (
    <div className="bg-surface-raised border border-border-subtle rounded-lg mb-4 px-4 py-3">
      {/* Structure type + confidence */}
      <div className="flex items-center gap-3 mb-3">
        {problemStructure && (
          <span className="text-xs font-medium text-brand-400 capitalize">
            {problemStructure.primaryPattern} structure
          </span>
        )}
        {confidence !== undefined && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              isLowConfidence
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
            }`}
          >
            {isLowConfidence ? "uncertain" : "stable"}
          </span>
        )}
        
        <div className="flex-1" />
        
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-[10px] text-text-muted hover:text-text-primary"
        >
          {showDetails ? "hide details" : "show details"}
        </button>
      </div>

      {/* The three summary lines */}
      <StructuralSummary
        claims={claims}
        conflicts={patterns?.conflictInfos || []}
        cascadeRisks={patterns?.cascadeRisks || []}
        leverageInversions={patterns?.leverageInversions || []}
        ghosts={ghosts}
        problemStructure={problemStructure}
        modelCount={modelCount}
      />

      {/* Expandable details (for power users) */}
      {showDetails && (
        <div className="mt-4 pt-3 border-t border-border-subtle text-xs text-text-muted space-y-2">
          <div>
            <span className="text-text-secondary">Claims:</span> {claims.length} extracted from {modelCount} sources
          </div>
          {patterns?.conflicts && patterns.conflicts.length > 0 && (
            <div>
              <span className="text-text-secondary">Conflicts:</span> {patterns.conflicts.length} detected
            </div>
          )}
          {ghostAnalysis && ghostAnalysis.count > 0 && (
            <div>
              <span className="text-text-secondary">Gaps:</span> {ghostAnalysis.count} unexplored area{ghostAnalysis.count !== 1 ? "s" : ""}
            </div>
          )}
          {problemStructure?.evidence && (
            <div className="mt-2">
              <span className="text-text-secondary">Evidence:</span>
              <ul className="mt-1 space-y-0.5 text-[11px]">
                {problemStructure.evidence.slice(0, 3).map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MetricsRibbon;
What Changed
Before	After
"Consensus: 45%"	"About half the sources agree on 'Start with user research'"
"Tension: 32%"	"Genuine disagreement between 'Use React' and 'Use Vue' — both have strong backing"
"3 Conflicts" (abstract count)	"'React ecosystem' is ahead, but 'Vue simplicity' has notable support"
"2 High-Leverage" (badge)	"'Skip testing' might be undervalued — low support but structurally important"
"👻 2 Ghosts" (badge)	"Not addressed: 'long-term maintenance costs' and 1 other area"
Percentages everywhere	Zero percentages
Claim IDs in tooltips	Claim names inline
The Template System
Floor Templates:

Consensus Level	Template
Very high (>70%) + multiple	"Nearly all sources align on [claim1] and [claim2]"
Very high (>70%) + single	"Strong agreement on [claim1]"
Medium (40-70%) + runner-up	"Most sources back [claim1], with [claim2] also well-supported"
Medium (40-70%)	"About half the sources agree on [claim1]"
Low + split	"Sources split between [claim1] and [claim2]"
Low + scattered	"Views are scattered — [claim1] has a slight edge but nothing dominates"
Very low	"No clear consensus — [claim1] leads slightly"
Tension Templates:

Situation	Template
High-stakes symmetric conflict	"Genuine disagreement between [A] and [B] — both have strong backing"
High-stakes asymmetric	"[stronger] is ahead, but [weaker] has notable support"
Any conflict	"Some tension between [A] and [B]"
Tradeoff structure	"[A] trades off against [B] — you can't fully have both"
Risk Templates:

Situation	Template
Fragile cascade	"[claim] is thinly supported but N other claims depend on it"
Leverage inversion	"[claim] might be undervalued — low support but structurally important"
Single ghost	"Not addressed: [ghost]"
Multiple ghosts	"Not addressed: [ghost1] and N other areas"
The Principle
Variables are claim names. Templates are human sentences. No numbers visible to users.

The system knows the percentages internally (to select the right template), but the user never sees them. They see:

✓ Nearly all sources align on "Focus on MVP first" and "Ship early"

⚡ Genuine disagreement between "Build in-house" and "Use SaaS" — both have strong backing

⚠️ "Skip user research" is thinly supported but 3 other claims depend on it

This is immediately actionable. The user knows what's agreed, what's contested, and what's fragile — using the actual claim names from their query.