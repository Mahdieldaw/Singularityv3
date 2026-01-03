import React from "react";

interface StructuralInsightProps {
  type:
    | "fragile_foundation"
    | "keystone"
    | "consensus_conflict"
    | "high_leverage_singular"
    | "cascade_risk"
    | "evidence_gap"
    | "support_outlier";
  claim: {
    label: string;
    supporters: (string | number)[];
  };
  metadata?: {
    dependentCount?: number;
    dependentLabels?: string[];
    cascadeDepth?: number;
    conflictsWith?: string;
    leverageScore?: number;
    gapScore?: number;
    skew?: number;
    supporterCount?: number;
  };
}

export const StructuralInsight: React.FC<StructuralInsightProps> = ({
  type,
  claim,
  metadata,
}) => {
  const insights = {
    fragile_foundation: {
      icon: "⚠️",
      title: "Fragile Foundation",
      description: `Only ${claim.supporters.length} supporter(s), but ${
        metadata?.dependentCount || 0
      } claim(s) depend on "${claim.label}". High impact if wrong.`,
      color: "amber" as const,
    },
    keystone: {
      icon: "🔑",
      title: "Keystone Claim",
      description: `"${claim.label}" is the central pillar—${
        metadata?.dependentCount || 0
      } other claim(s) build on this. If this fails, the structure collapses.`,
      color: "purple" as const,
    },
    consensus_conflict: {
      icon: "⚡",
      title: "Consensus Conflict",
      description: `"${claim.label}" conflicts with "${
        metadata?.conflictsWith || "another claim"
      }". Both have multiple supporters—models disagree on fundamentals.`,
      color: "red" as const,
    },
    high_leverage_singular: {
      icon: "💎",
      title: "Overlooked Insight",
      description: `"${claim.label}" has only ${
        claim.supporters.length
      } supporter(s) but high structural importance (leverage: ${
        metadata?.leverageScore !== undefined
          ? metadata.leverageScore.toFixed(1)
          : "?"
      }). May contain valuable perspective others missed.`,
      color: "indigo" as const,
    },
    cascade_risk: {
      icon: "⛓️",
      title: "Deep Cascade",
      description: `Eliminating "${claim.label}" cascades through ${
        metadata?.dependentCount || 0
      } claim(s) across ${metadata?.cascadeDepth || 0} level(s). Handle with care.`,
      color: "orange" as const,
    },
    evidence_gap: {
      icon: "🎯",
      title: "Load-Bearing Assumption",
      description: `"${claim.label}" enables ${
        metadata?.dependentCount || 0
      } downstream claim(s) but has only ${
        claim.supporters.length
      } supporter(s). Evidence gap score: ${
        metadata?.gapScore !== undefined
          ? metadata.gapScore.toFixed(1)
          : "?"
      }. Verify carefully.`,
      color: "red" as const,
    },
    support_outlier: {
      icon: "🔍",
      title: "Model-Specific Insight",
      description: `${Math.round(
        (metadata?.skew || 0) * 100
      )}% of support for "${claim.label}" comes from a single model (${
        metadata?.supporterCount ?? claim.supporters.length
      } supporter(s) total). Either valuable outlier or model-specific bias.`,
      color: "blue" as const,
    },
  } as const;

  const insight = insights[type];

  const colorClasses: Record<
    (typeof insight)["color"],
    string
  > = {
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    purple: "bg-purple-500/10 border-purple-500/30 text-purple-400",
    red: "bg-red-500/10 border-red-500/30 text-red-400",
    indigo: "bg-indigo-500/10 border-indigo-500/30 text-indigo-400",
    orange: "bg-orange-500/10 border-orange-500/30 text-orange-400",
    blue: "bg-blue-500/10 border-blue-500/30 text-blue-400",
  };

  return (
    <div
      className={`flex gap-2 p-3 rounded-lg border ${colorClasses[insight.color]}`}
    >
      <span className="text-lg flex-shrink-0">{insight.icon}</span>
      <div className="min-w-0">
        <div className="font-semibold text-sm mb-1">{insight.title}</div>
        <div className="text-xs opacity-90 leading-relaxed">
          {insight.description}
        </div>
        {metadata?.dependentLabels &&
          metadata.dependentLabels.length > 0 && (
            <div className="mt-2 text-[10px] opacity-70">
              <span className="font-medium">Affects:</span>{" "}
              {metadata.dependentLabels.slice(0, 3).join(", ")}
              {metadata.dependentLabels.length > 3 &&
                ` +${metadata.dependentLabels.length - 3} more`}
            </div>
          )}
      </div>
    </div>
  );
};

