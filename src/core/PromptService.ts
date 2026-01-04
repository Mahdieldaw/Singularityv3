import { MapperArtifact, Claim, Edge, ProblemStructure } from "../../shared/contract";

const DEBUG_PROMPT_SERVICE = false;
const promptDbg = (...args: any[]) => {
  if (DEBUG_PROMPT_SERVICE) console.debug("[PromptService]", ...args);
};

const DEBUG_STRUCTURAL_ANALYSIS = false;
const structuralDbg = (...args: any[]) => {
  if (DEBUG_STRUCTURAL_ANALYSIS) console.debug("[PromptService:structural]", ...args);
};

type StructuralAnalysis = {
  edges: Edge[];
  landscape: {
    dominantType: Claim["type"];
    typeDistribution: Record<string, number>;
    dominantRole: Claim["role"];
    roleDistribution: Record<string, number>;
    claimCount: number;
    modelCount: number;
    convergenceRatio: number;
  };
  claimsWithLeverage: ClaimWithLeverage[];
  patterns: {
    leverageInversions: LeverageInversion[];
    cascadeRisks: CascadeRisk[];
    conflicts: ConflictPair[];
    tradeoffs: TradeoffPair[];
    convergencePoints: ConvergencePoint[];
    isolatedClaims: string[];
  };
  ghostAnalysis: {
    count: number;
    mayExtendChallenger: boolean;
    challengerIds: string[];
  };
};

type ClaimWithLeverage = {
  id: string;
  label: string;
  supporters: number[];
  type: string;
  role: string;
  leverage: number;
  leverageFactors: {
    supportWeight: number;
    roleWeight: number;
    connectivityWeight: number;
    positionWeight: number;
  };
  isLeverageInversion: boolean;
  keystoneScore?: number;
  evidenceGapScore?: number;
  supportSkew?: number;
  isKeystone?: boolean;
  isEvidenceGap?: boolean;
  isOutlier?: boolean;
};

type LeverageInversion = {
  claimId: string;
  claimLabel: string;
  supporterCount: number;
  reason: "challenger_prerequisite_to_consensus" | "singular_foundation" | "high_connectivity_low_support";
  affectedClaims: string[];
};

type CascadeRisk = {
  sourceId: string;
  sourceLabel: string;
  dependentIds: string[];
  dependentLabels: string[];
  depth: number;
};

type ConflictPair = {
  claimA: { id: string; label: string; supporterCount: number };
  claimB: { id: string; label: string; supporterCount: number };
  isBothConsensus: boolean;
};

type TradeoffPair = {
  claimA: { id: string; label: string; supporterCount: number };
  claimB: { id: string; label: string; supporterCount: number };
  symmetry: "both_consensus" | "both_singular" | "asymmetric";
};

type ConvergencePoint = {
  targetId: string;
  targetLabel: string;
  sourceIds: string[];
  sourceLabels: string[];
  edgeType: "prerequisite" | "supports";
};

type ModeContext = {
  problemStructure: ProblemStructure;
  structuralFraming: string;
  typeFraming: string;
  structuralObservations: string[];
  leverageNotes: string | null;
  cascadeWarnings: string | null;
  conflictNotes: string | null;
  tradeoffNotes: string | null;
  ghostNotes: string | null;
};

const computeLandscapeMetrics = (artifact: MapperArtifact): StructuralAnalysis["landscape"] => {
  const claims = Array.isArray(artifact?.claims) ? artifact.claims : [];

  const typeDistribution: Record<string, number> = {};
  const roleDistribution: Record<string, number> = {};
  const supporterSet = new Set<number>();

  for (const c of claims) {
    if (!c) continue;
    typeDistribution[c.type] = (typeDistribution[c.type] || 0) + 1;
    roleDistribution[c.role] = (roleDistribution[c.role] || 0) + 1;
    if (Array.isArray(c.supporters)) {
      for (const s of c.supporters) {
        if (typeof s === "number") supporterSet.add(s);
      }
    }
  }

  const dominantType = (Object.entries(typeDistribution).sort((a, b) => b[1] - a[1])[0]?.[0] || "prescriptive") as Claim["type"];
  const dominantRole = (Object.entries(roleDistribution).sort((a, b) => b[1] - a[1])[0]?.[0] || "anchor") as Claim["role"];

  const consensusClaims = claims.filter((c) => (c.supporters?.length || 0) >= 2);
  const modelCount = typeof artifact?.model_count === "number" && artifact.model_count > 0
    ? artifact.model_count
    : supporterSet.size;

  return {
    dominantType,
    typeDistribution,
    dominantRole,
    roleDistribution,
    claimCount: claims.length,
    modelCount,
    convergenceRatio: claims.length > 0 ? consensusClaims.length / claims.length : 0,
  };
};

const detectProblemStructure = (
  claims: ClaimWithLeverage[],
  edges: Edge[],
  patterns: StructuralAnalysis["patterns"],
  modelCount: number
): ProblemStructure => {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  const claimCount = claims.length;
  const edgeCount = edges.length;
  const safeModelCount = Math.max(1, Number.isFinite(modelCount) ? modelCount : 1);

  const prereqCount = edges.filter((e) => e.type === "prerequisite").length;
  const conflictEdgeCount = edges.filter((e) => e.type === "conflicts").length;
  const tradeoffEdgeCount = edges.filter((e) => e.type === "tradeoff").length;
  const avgConnectivity = edgeCount / Math.max(claimCount, 1);
  const prerequisiteRatio = prereqCount / Math.max(edgeCount, 1);

  const conflictCount = patterns.conflicts.length;
  const tradeoffCount = patterns.tradeoffs.length;
  const isolatedCount = patterns.isolatedClaims.length;
  const isolatedRatio = isolatedCount / Math.max(claimCount, 1);
  const convergencePoints = patterns.convergencePoints.length;
  const cascadeDepth = patterns.cascadeRisks.reduce((max, r) => Math.max(max, r.depth), 0);
  const longestCascade = patterns.cascadeRisks.reduce<CascadeRisk | null>((best, r) => {
    if (!best) return r;
    return r.depth > best.depth ? r : best;
  }, null);
  const longestChainLabel = longestCascade?.sourceLabel || "n/a";

  const consensusConflicts = patterns.conflicts.filter((c) => c.isBothConsensus).length;

  const outDegree = new Map<string, number>();
  for (const e of edges) {
    if (e.type !== "prerequisite" && e.type !== "supports") continue;
    outDegree.set(e.from, (outDegree.get(e.from) || 0) + 1);
  }
  const byOutDegree = [...outDegree.entries()].sort((a, b) => b[1] - a[1]);
  const [topId, topOut] = byOutDegree[0] || [null, 0];
  const secondOut = byOutDegree[1]?.[1] ?? 0;
  const topClaim = topId ? claims.find((c) => c.id === topId) : null;
  const dominance = topOut <= 0 ? 0 : secondOut <= 0 ? 1 : clamp01((topOut - secondOut) / topOut);

  const linearScore = clamp01(prerequisiteRatio * 0.8 + clamp01(cascadeDepth / 3) * 0.5 - clamp01(conflictCount / 2) * 0.5);
  const contestedScore = clamp01(clamp01(conflictCount / 3) * 0.8 + (consensusConflicts > 0 ? 0.35 : 0));
  const tradeoffScore = clamp01(
    clamp01(tradeoffCount / 3) * 0.75 +
    clamp01(1 - prerequisiteRatio) * 0.35
  );
  const dimensionalScore = clamp01(
    clamp01(convergencePoints / 3) * 0.6 +
    clamp01(avgConnectivity / 2) * 0.45 +
    clamp01(1 - isolatedRatio) * 0.25 -
    clamp01(conflictCount / 3) * 0.25
  );
  const exploratoryScore = clamp01(
    clamp01(isolatedRatio / 0.5) * 0.85 +
    (convergencePoints === 0 ? 0.15 : 0)
  );

  let keystoneScore = 0;
  const keystoneCandidates = claims
    .filter((c) => c.isKeystone)
    .map((c) => {
      const cascade = patterns.cascadeRisks.find((r) => r.sourceId === c.id) || null;
      const dependentCount = cascade ? cascade.dependentIds.length : edges.filter((e) => e.from === c.id).length;
      const cascadeDepth = cascade ? cascade.depth : 0;
      const supportRatio = (c.supporters.length || 0) / safeModelCount;
      const gapPenalty = c.isEvidenceGap ? 0.25 : 0;
      const skewPenalty = (c.supportSkew || 0) > 0.8 ? 0.15 : 0;

      const rawScore =
        (c.keystoneScore || 0) *
        (1 + supportRatio) *
        (1 + dependentCount / 5) *
        (1 - gapPenalty - skewPenalty);

      return { claim: c, rawScore, dependentCount, cascadeDepth };
    })
    .sort((a, b) => b.rawScore - a.rawScore);

  const bestKeystone = keystoneCandidates[0] || null;

  if (bestKeystone && bestKeystone.rawScore >= safeModelCount * 2) {
    const dominanceBoost = dominance > 0 ? 0.2 + dominance * 0.4 : 0;
    keystoneScore = clamp01((bestKeystone.rawScore / (bestKeystone.rawScore + 6)) + dominanceBoost);
  }

  const scores: Array<{ pattern: ProblemStructure["primaryPattern"]; score: number }> = [
    { pattern: "keystone", score: keystoneScore },
    { pattern: "linear", score: linearScore },
    { pattern: "contested", score: contestedScore },
    { pattern: "tradeoff", score: tradeoffScore },
    { pattern: "dimensional", score: dimensionalScore },
    { pattern: "exploratory", score: exploratoryScore },
  ];
  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];
  const implications: Record<ProblemStructure["primaryPattern"], ProblemStructure["implications"]> = {
    linear: {
      understand: "Find the sequence. The insight is often where the path becomes non-obvious.",
      gauntlet: "Test each step: is it truly prerequisite? Can steps be reordered or parallelized?",
    },
    keystone: {
      understand: "Everything hinges on a keystone. The insight is the keystone, not the branches.",
      gauntlet: "Test the keystone ruthlessly. If it fails, the entire structure collapses.",
    },
    contested: {
      understand: "Disagreement is the signal. Find the axis of disagreement—that reveals the real question.",
      gauntlet: "Force resolution. One claim per conflict must fail, or find conditions that differentiate them.",
    },
    tradeoff: {
      understand: "There is no universal best. The insight is the map of what you give up for what you gain.",
      gauntlet: "Test if tradeoffs are real or false dichotomies. Look for dominated options.",
    },
    dimensional: {
      understand: "Multiple independent factors determine the answer. Find the governing conditions.",
      gauntlet: "Test each dimension independently. Does the answer cover all relevant combinations?",
    },
    exploratory: {
      understand: "No strong structure detected. Value lies in cataloging the territory and identifying patterns.",
      gauntlet: "Test relevance: which claims answer the query vs. which are interesting but tangential?",
    },
  };

  const evidenceByPattern: Record<ProblemStructure["primaryPattern"], string[]> = {
    linear: [
      `${prereqCount}/${edgeCount} edges are prerequisites (${pct(prerequisiteRatio)})`,
      `Max cascade depth: ${cascadeDepth} (longest: ${longestChainLabel})`,
      conflictCount > 0 ? `${conflictCount} conflicts present` : "No conflicts",
    ],
    keystone: (() => {
      if (bestKeystone) {
        const c = bestKeystone.claim;
        const dependentCount = bestKeystone.dependentCount;
        const cascadeDepthForBest = bestKeystone.cascadeDepth;
        const skewPct = pct(c.supportSkew || 0);
        const gapNote = c.isEvidenceGap
          ? "Load-bearing assumption with thin evidence"
          : "Evidence spread is adequate for its impact";
        return [
          `${c.label} has keystone score ${(c.keystoneScore || 0).toFixed(1)}`,
          `${dependentCount} outgoing dependencies (cascade depth: ${cascadeDepthForBest})`,
          `Support skew: ${skewPct}`,
          gapNote,
        ];
      }
      if (topClaim) {
        return [
          `${topClaim.label} has leverage ${topClaim.leverage.toFixed(1)}`,
          `${topOut} outgoing dependencies (supports/prerequisites)`,
          `Dominance: ${pct(dominance)}`,
        ];
      }
      return [
        "No keystone candidate detected",
        `Average connectivity: ${avgConnectivity.toFixed(1)} edges/claim`,
        `Isolated claims: ${isolatedCount}`,
      ];
    })(),
    contested: [
      `${conflictCount} conflict pair(s) detected (${conflictEdgeCount} conflict edge(s))`,
      consensusConflicts > 0 ? `${consensusConflicts} consensus-to-consensus conflict(s)` : "Conflicts include at least one low-support position",
      `Tradeoffs: ${tradeoffCount}`,
    ],
    tradeoff: [
      `${tradeoffCount} tradeoff pair(s) detected (${tradeoffEdgeCount} tradeoff edge(s))`,
      `Prerequisite ratio: ${pct(prerequisiteRatio)}`,
      `Conflicts: ${conflictCount}`,
    ],
    dimensional: [
      `${convergencePoints} convergence point(s)`,
      `Average connectivity: ${avgConnectivity.toFixed(1)} edges/claim`,
      `Isolated claims: ${isolatedCount}`,
    ],
    exploratory: [
      `${isolatedCount}/${Math.max(claimCount, 1)} isolated claims (${pct(isolatedRatio)})`,
      `Average connectivity: ${avgConnectivity.toFixed(1)} edges/claim`,
      `Convergence points: ${convergencePoints}`,
    ],
  };

  const maxScore = Math.max(...scores.map((s) => s.score));
  if (maxScore < 0.3) {
    return {
      primaryPattern: "exploratory",
      confidence: clamp01(maxScore * 0.8),
      evidence: [
        "No dominant structural pattern detected",
        `Highest pattern score: ${maxScore.toFixed(2)}`,
        "Landscape may be exploratory or data insufficient",
      ],
      implications: implications.exploratory,
    };
  }

  const second = scores[1] || { pattern: "dimensional" as const, score: 0 };
  const confidence = clamp01(0.45 + (best.score - second.score) * 0.6 + best.score * 0.15);

  return {
    primaryPattern: best.pattern,
    confidence,
    evidence: evidenceByPattern[best.pattern],
    implications: implications[best.pattern],
  };
};

const computeClaimLeverage = (
  claim: Claim,
  edges: Edge[],
  modelCountRaw: number
): ClaimWithLeverage => {
  const modelCount = Math.max(modelCountRaw || 0, 1);
  const supporters = Array.isArray(claim.supporters) ? claim.supporters : [];

  const supportWeight = (supporters.length / modelCount) * 2;

  const roleWeights: Record<string, number> = {
    challenger: 4,
    anchor: 2,
    branch: 1,
    supplement: 0.5,
  };
  const roleWeight = roleWeights[claim.role] ?? 1;

  const outgoing = edges.filter((e) => e.from === claim.id);
  const incoming = edges.filter((e) => e.to === claim.id);

  const prereqOut = outgoing.filter((e) => e.type === "prerequisite").length * 2;
  const prereqIn = incoming.filter((e) => e.type === "prerequisite").length;
  const conflictEdges = edges.filter(
    (e) => e.type === "conflicts" && (e.from === claim.id || e.to === claim.id)
  ).length * 1.5;

  const connectivityWeight = prereqOut + prereqIn + conflictEdges + (outgoing.length + incoming.length) * 0.25;

  const hasIncomingPrereq = incoming.some((e) => e.type === "prerequisite");
  const hasOutgoingPrereq = outgoing.some((e) => e.type === "prerequisite");
  const positionWeight = !hasIncomingPrereq && hasOutgoingPrereq ? 2 : 0;

  const leverage = supportWeight + roleWeight + connectivityWeight + positionWeight;
  const isLeverageInversion = supporters.length < 2 && leverage > 4;

  const keystoneScore = outgoing.length * supporters.length;

  const supporterCounts = supporters.reduce((acc, s) => {
    const key = typeof s === "number" ? String(s) : String(s);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const maxFromSingleModel = Object.values(supporterCounts).length > 0 ? Math.max(...Object.values(supporterCounts)) : 0;
  const supportSkew = supporters.length > 0 ? maxFromSingleModel / supporters.length : 0;
  const isOutlier = supportSkew > 0.6 && supporters.length >= 2;

  const isKeystone = keystoneScore >= modelCount * 2;

  return {
    id: claim.id,
    label: claim.label,
    supporters,
    type: claim.type,
    role: claim.role,
    leverage,
    leverageFactors: {
      supportWeight,
      roleWeight,
      connectivityWeight,
      positionWeight,
    },
    isLeverageInversion,
    keystoneScore,
    evidenceGapScore: 0,
    supportSkew,
    isKeystone,
    isEvidenceGap: false,
    isOutlier,
  };
};

const computeCascadeDepth = (sourceId: string, prerequisites: Edge[]): number => {
  const visited = new Set<string>();
  let maxDepth = 0;

  const dfs = (id: string, depth: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    maxDepth = Math.max(maxDepth, depth);
    const next = prerequisites.filter((e) => e.from === id);
    for (const e of next) dfs(e.to, depth + 1);
  };

  dfs(sourceId, 0);
  return maxDepth;
};

const detectLeverageInversions = (
  claims: ClaimWithLeverage[],
  edges: Edge[],
  claimMap: Map<string, ClaimWithLeverage>
): LeverageInversion[] => {
  const inversions: LeverageInversion[] = [];
  const prerequisites = edges.filter((e) => e.type === "prerequisite");

  for (const claim of claims) {
    if (!claim.isLeverageInversion) continue;

    const prereqTo = prerequisites.filter((e) => e.from === claim.id);
    const consensusTargets = prereqTo
      .map((e) => claimMap.get(e.to))
      .filter((c) => !!c && c.supporters.length >= 2);

    if (claim.role === "challenger" && consensusTargets.length > 0) {
      inversions.push({
        claimId: claim.id,
        claimLabel: claim.label,
        supporterCount: claim.supporters.length,
        reason: "challenger_prerequisite_to_consensus",
        affectedClaims: consensusTargets.map((c) => c!.id),
      });
      continue;
    }

    if (prereqTo.length > 0) {
      inversions.push({
        claimId: claim.id,
        claimLabel: claim.label,
        supporterCount: claim.supporters.length,
        reason: "singular_foundation",
        affectedClaims: prereqTo.map((e) => e.to),
      });
      continue;
    }

    if (claim.leverageFactors.connectivityWeight > 2) {
      inversions.push({
        claimId: claim.id,
        claimLabel: claim.label,
        supporterCount: claim.supporters.length,
        reason: "high_connectivity_low_support",
        affectedClaims: [],
      });
    }
  }

  return inversions;
};

const detectCascadeRisks = (
  edges: Edge[],
  claimMap: Map<string, ClaimWithLeverage>
): CascadeRisk[] => {
  const prerequisites = edges.filter((e) => e.type === "prerequisite");
  const bySource = new Map<string, string[]>();
  for (const e of prerequisites) {
    const existing = bySource.get(e.from) || [];
    bySource.set(e.from, [...existing, e.to]);
  }

  const risks: CascadeRisk[] = [];
  for (const [sourceId, directDependents] of bySource) {
    if (directDependents.length === 0) continue;

    const allDependents = new Set<string>();
    const queue = [...directDependents];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (allDependents.has(current)) continue;
      allDependents.add(current);
      const nextLevel = bySource.get(current) || [];
      queue.push(...nextLevel);
    }

    const source = claimMap.get(sourceId);
    const dependentClaims = Array.from(allDependents)
      .map((id) => claimMap.get(id))
      .filter(Boolean);

    risks.push({
      sourceId,
      sourceLabel: source?.label || sourceId,
      dependentIds: Array.from(allDependents),
      dependentLabels: dependentClaims.map((c) => c!.label),
      depth: computeCascadeDepth(sourceId, prerequisites),
    });
  }

  return risks;
};

const detectConflicts = (
  edges: Edge[],
  claimMap: Map<string, ClaimWithLeverage>
): ConflictPair[] => {
  const out: ConflictPair[] = [];
  for (const e of edges) {
    if (e.type !== "conflicts") continue;
    const a = claimMap.get(e.from);
    const b = claimMap.get(e.to);
    if (!a || !b) continue;
    out.push({
      claimA: { id: a.id, label: a.label, supporterCount: a.supporters.length },
      claimB: { id: b.id, label: b.label, supporterCount: b.supporters.length },
      isBothConsensus: a.supporters.length >= 2 && b.supporters.length >= 2,
    });
  }
  return out;
};

const detectTradeoffs = (
  edges: Edge[],
  claimMap: Map<string, ClaimWithLeverage>
): TradeoffPair[] => {
  const out: TradeoffPair[] = [];
  for (const e of edges) {
    if (e.type !== "tradeoff") continue;
    const a = claimMap.get(e.from);
    const b = claimMap.get(e.to);
    if (!a || !b) continue;
    const aConsensus = a.supporters.length >= 2;
    const bConsensus = b.supporters.length >= 2;
    const symmetry: TradeoffPair["symmetry"] = aConsensus && bConsensus
      ? "both_consensus"
      : !aConsensus && !bConsensus
        ? "both_singular"
        : "asymmetric";
    out.push({
      claimA: { id: a.id, label: a.label, supporterCount: a.supporters.length },
      claimB: { id: b.id, label: b.label, supporterCount: b.supporters.length },
      symmetry,
    });
  }
  return out;
};

const detectConvergencePoints = (
  edges: Edge[],
  claimMap: Map<string, ClaimWithLeverage>
): ConvergencePoint[] => {
  const relevantEdges = edges.filter((e) => e.type === "prerequisite" || e.type === "supports");
  const byTargetType = new Map<string, { targetId: string; sources: string[]; type: "prerequisite" | "supports" }>();

  for (const e of relevantEdges) {
    const key = `${e.to}::${e.type}`;
    const existing = byTargetType.get(key);
    if (existing) {
      existing.sources.push(e.from);
    } else {
      byTargetType.set(key, { targetId: e.to, sources: [e.from], type: e.type as "prerequisite" | "supports" });
    }
  }

  const points: ConvergencePoint[] = [];
  for (const { targetId, sources, type } of byTargetType.values()) {
    if (sources.length < 2) continue;
    const target = claimMap.get(targetId);
    const sourceClaims = sources.map((s) => claimMap.get(s)).filter(Boolean);
    points.push({
      targetId,
      targetLabel: target?.label || targetId,
      sourceIds: sources,
      sourceLabels: sourceClaims.map((c) => c!.label),
      edgeType: type,
    });
  }

  return points;
};

const detectIsolatedClaims = (claims: ClaimWithLeverage[], edges: Edge[]): string[] => {
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.from);
    connectedIds.add(e.to);
  }
  return claims.filter((c) => !connectedIds.has(c.id)).map((c) => c.id);
};

const analyzeGhosts = (ghosts: string[], claims: ClaimWithLeverage[]): StructuralAnalysis["ghostAnalysis"] => {
  const challengers = claims.filter((c) => c.role === "challenger");
  return {
    count: ghosts.length,
    mayExtendChallenger: ghosts.length > 0 && challengers.length > 0,
    challengerIds: challengers.map((c) => c.id),
  };
};

const computeStructuralAnalysis = (artifact: MapperArtifact): StructuralAnalysis => {
  const claims = Array.isArray(artifact?.claims) ? artifact.claims : [];
  const edges = Array.isArray(artifact?.edges) ? artifact.edges : [];
  const ghosts = Array.isArray(artifact?.ghosts) ? artifact.ghosts.filter(Boolean).map(String) : [];

  const landscape = computeLandscapeMetrics(artifact);
  const claimsWithLeverage = claims.map((c) => computeClaimLeverage(c, edges, landscape.modelCount));
  const claimMap = new Map<string, ClaimWithLeverage>(claimsWithLeverage.map((c) => [c.id, c]));

  const patterns: StructuralAnalysis["patterns"] = {
    leverageInversions: detectLeverageInversions(claimsWithLeverage, edges, claimMap),
    cascadeRisks: detectCascadeRisks(edges, claimMap),
    conflicts: detectConflicts(edges, claimMap),
    tradeoffs: detectTradeoffs(edges, claimMap),
    convergencePoints: detectConvergencePoints(edges, claimMap),
    isolatedClaims: detectIsolatedClaims(claimsWithLeverage, edges),
  };

  const cascadeBySource = new Map<string, CascadeRisk>();
  for (const risk of patterns.cascadeRisks) {
    cascadeBySource.set(risk.sourceId, risk);
  }

  for (const claim of claimsWithLeverage) {
    const cascade = cascadeBySource.get(claim.id);
    let evidenceGapScore = 0;
    let isEvidenceGap = false;
    if (cascade && claim.supporters.length > 0) {
      evidenceGapScore = cascade.dependentIds.length / claim.supporters.length;
      isEvidenceGap = evidenceGapScore > 3;
    }
    claim.evidenceGapScore = evidenceGapScore;
    claim.isEvidenceGap = isEvidenceGap;
  }

  const ghostAnalysis = analyzeGhosts(ghosts, claimsWithLeverage);

  const analysis = { edges, landscape, claimsWithLeverage, patterns, ghostAnalysis };
  structuralDbg("analysis", {
    claimCount: landscape.claimCount,
    edgeCount: edges.length,
    modelCount: landscape.modelCount,
    convergenceRatio: landscape.convergenceRatio,
    conflictPairs: patterns.conflicts.length,
    tradeoffPairs: patterns.tradeoffs.length,
    cascadeRisks: patterns.cascadeRisks.length,
    isolatedClaims: patterns.isolatedClaims.length,
  });
  return analysis;
};

export const computeProblemStructureFromArtifact = (artifact: MapperArtifact): ProblemStructure => {
  const analysis = computeStructuralAnalysis(artifact);
  const structure = detectProblemStructure(
    analysis.claimsWithLeverage,
    analysis.edges,
    analysis.patterns,
    analysis.landscape.modelCount
  );
  structuralDbg("problemStructure", structure);
  return structure;
};

const TYPE_FRAMINGS: Record<string, { understand: string; gauntlet: string }> = {
  factual: {
    understand: "Factual landscape. Consensus reflects common knowledge. Value lies in specific, verifiable claims that others assumed without stating.",
    gauntlet: "Factual landscape. Test specificity and verifiability. Vague claims fail regardless of support count. Popular does not mean true.",
  },
  prescriptive: {
    understand: "Prescriptive landscape. Consensus reflects conventional wisdom the user likely knows. Value lies in claims with clear conditions and boundaries.",
    gauntlet: "Prescriptive landscape. Test actionability and conditional coverage. Advice without context is noise. Claims must specify when they apply.",
  },
  conditional: {
    understand: "Conditional landscape. Claims branch on context. The key insight is often the governing condition that structures the branches.",
    gauntlet: "Conditional landscape. Both branches may survive if they cover non-overlapping conditions. Eliminate claims with vague or unfalsifiable conditions.",
  },
  contested: {
    understand: "Contested landscape. Disagreement is the signal. The key insight is often the dimension on which claims disagree—that reveals the real question.",
    gauntlet: "Contested landscape. Conflict forces choice. Apply supremacy test: which claim passes where the other fails? Or find conditions that differentiate them.",
  },
  speculative: {
    understand: "Speculative landscape. Agreement is weak signal for predictions. Value lies in claims with grounded mechanisms, not confident predictions.",
    gauntlet: "Speculative landscape. Test mechanism and grounding. Predictions without causal explanation are eliminated. Future claims must explain how.",
  },
};

const getTypeFraming = (dominantType: string, mode: "understand" | "gauntlet"): string => {
  const framing = TYPE_FRAMINGS[dominantType] || TYPE_FRAMINGS.prescriptive;
  return framing[mode];
};

const generateModeContext = (analysis: StructuralAnalysis, mode: "understand" | "gauntlet"): ModeContext => {
  const { landscape, patterns, ghostAnalysis } = analysis;
  const problemStructure = detectProblemStructure(
    analysis.claimsWithLeverage,
    analysis.edges,
    analysis.patterns,
    landscape.modelCount
  );
  const structuralFraming = mode === "understand" ? problemStructure.implications.understand : problemStructure.implications.gauntlet;
  const typeFraming = getTypeFraming(landscape.dominantType, mode);
  const structuralObservations: string[] = [];

  for (const inv of patterns.leverageInversions) {
    if (inv.reason === "challenger_prerequisite_to_consensus") {
      structuralObservations.push(
        `${inv.claimLabel} (${inv.supporterCount} supporter, challenger) is prerequisite to ${inv.affectedClaims.length} consensus claim(s).`
      );
    } else if (inv.reason === "singular_foundation") {
      structuralObservations.push(
        `${inv.claimLabel} (${inv.supporterCount} supporter) enables ${inv.affectedClaims.length} downstream claim(s).`
      );
    }
  }

  for (const risk of patterns.cascadeRisks) {
    if (risk.dependentIds.length >= 2) {
      structuralObservations.push(
        `${risk.sourceLabel} is prerequisite to ${risk.dependentIds.length} claims (cascade depth: ${risk.depth}).`
      );
    }
  }

  for (const conflict of patterns.conflicts) {
    const qualifier = conflict.isBothConsensus ? " (both consensus)" : "";
    structuralObservations.push(`${conflict.claimA.label} conflicts with ${conflict.claimB.label}${qualifier}.`);
  }

  for (const tradeoff of patterns.tradeoffs) {
    structuralObservations.push(
      `${tradeoff.claimA.label} ↔ ${tradeoff.claimB.label} (tradeoff, ${tradeoff.symmetry.replace("_", " ")}).`
    );
  }

  for (const conv of patterns.convergencePoints) {
    if (conv.edgeType === "prerequisite") {
      structuralObservations.push(`${conv.targetLabel} requires all of: ${conv.sourceLabels.join(", ")}.`);
    }
  }

  let leverageNotes: string | null = null;
  let cascadeWarnings: string | null = null;
  let conflictNotes: string | null = null;
  let tradeoffNotes: string | null = null;
  let ghostNotes: string | null = null;

  if (mode === "understand") {
    if (patterns.leverageInversions.length > 0) {
      const candidates = patterns.leverageInversions.map((i) => i.claimLabel);
      leverageNotes = `High-leverage claims with low support: ${candidates.join(", ")}. These may contain overlooked insights.`;
    }

    if (ghostAnalysis.mayExtendChallenger) {
      ghostNotes = `${ghostAnalysis.count} ghost(s) detected. May represent territory challengers were pointing toward.`;
    }
  }

  if (mode === "gauntlet") {
    if (patterns.cascadeRisks.length > 0) {
      const warnings = patterns.cascadeRisks
        .filter((r) => r.dependentIds.length >= 1)
        .map((r) => `Eliminating ${r.sourceLabel} cascades to: ${r.dependentLabels.join(", ")}.`);
      if (warnings.length > 0) cascadeWarnings = warnings.join("\n");
    }

    if (patterns.conflicts.length > 0) {
      conflictNotes = `${patterns.conflicts.length} conflict(s) require resolution. One claim per conflict must be eliminated or conditions must differentiate them.`;
    }

    const asymmetricTradeoffs = patterns.tradeoffs.filter((t) => t.symmetry === "asymmetric");
    if (asymmetricTradeoffs.length > 0) {
      tradeoffNotes = `${asymmetricTradeoffs.length} asymmetric tradeoff(s): singular claims challenging consensus positions. Test if singular survives superiority.`;
    }
  }

  return {
    problemStructure,
    structuralFraming,
    typeFraming,
    structuralObservations,
    leverageNotes,
    cascadeWarnings,
    conflictNotes,
    tradeoffNotes,
    ghostNotes,
  };
};

const buildStructuralSection = (context: ModeContext, mode: "understand" | "gauntlet"): string => {
  const sections: string[] = [];
  sections.push(
    `## Problem Structure: ${context.problemStructure.primaryPattern.toUpperCase()}\n\n${context.structuralFraming}\n\n**Evidence:**\n${context.problemStructure.evidence
      .map((e) => `• ${e}`)
      .join("\n")}\n\n**Confidence:** ${Math.round(context.problemStructure.confidence * 100)}%`
  );
  sections.push(`## Landscape Type\n\n${context.typeFraming}`);
  if (context.structuralObservations.length > 0) {
    sections.push(`## Structural Observations\n\n${context.structuralObservations.map((o) => `• ${o}`).join("\n")}`);
  }

  if (mode === "understand") {
    if (context.leverageNotes) sections.push(`## High-Leverage Claims\n\n${context.leverageNotes}`);
    if (context.ghostNotes) sections.push(`## Gaps\n\n${context.ghostNotes}`);
  }

  if (mode === "gauntlet") {
    if (context.cascadeWarnings) sections.push(`## Cascade Warnings\n\n${context.cascadeWarnings}`);
    if (context.conflictNotes) sections.push(`## Conflicts\n\n${context.conflictNotes}`);
    if (context.tradeoffNotes) sections.push(`## Asymmetric Tradeoffs\n\n${context.tradeoffNotes}`);
  }

  return sections.join("\n\n---\n\n");
};

// ═══════════════════════════════════════════════════════════════════════════
// src/core/PromptService.ts
// Pure prompt construction - NO execution logic
// ═══════════════════════════════════════════════════════════════════════════

export interface TurnContext {
  userPrompt: string;
  understandText?: string;
  gauntletText?: string;
  mappingText: string;
  batchText?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT TEMPLATES (No interpolation at const time - just static parts)
// ═══════════════════════════════════════════════════════════════════════════

const COMPOSER_SYSTEM_INSTRUCTIONS = `You are the user's voice, clarified, and the hinge between the user and a bank of parallel AI models.

You sit after a batch → analysis → decision-map pipeline and before the next fan-out.
Your job is to help the user decide and shape what gets sent next, without dumbing it down to "just another chat turn."

You serve two overlapping functions:

Strategic partner: The user can think aloud with you about what to do next.
Prompt architect: The user can hand you a draft to sharpen into what they truly meant to ask.
Always serve both functions...

[REST OF STATIC INSTRUCTIONS - no \${variables} here]

OUTPUT STRUCTURE
STRATEGIC TAKE...
REFINED_PROMPT:...
NOTES:...`;

const ANALYST_SYSTEM_INSTRUCTIONS = `You are not the Author. You are the mirror held up to the composed prompt before it launches...

[REST OF STATIC INSTRUCTIONS]

Output format:
AUDIT:...
VARIANTS:...
GUIDANCE:...`;

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class PromptService {

  // ─────────────────────────────────────────────────────────────────────────
  // CONTEXT HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  buildContextSection(turnContext: TurnContext | null): string {
    if (!turnContext) return "";
    const { userPrompt, understandText, gauntletText, mappingText, batchText } = turnContext;
    let section = "";

    if (userPrompt) {
      section += `\n<PREVIOUS_USER_PROMPT>\n${userPrompt}\n</PREVIOUS_USER_PROMPT>\n`;
    }
    if (understandText) {
      section += `\n<PREVIOUS_UNDERSTAND_ANALYSIS>\n${understandText}\n</PREVIOUS_UNDERSTAND_ANALYSIS>\n`;
    }
    if (gauntletText) {
      section += `\n<PREVIOUS_GAUNTLET_VERDICT>\n${gauntletText}\n</PREVIOUS_GAUNTLET_VERDICT>\n`;
    }
    if (mappingText) {
      section += `\n<PREVIOUS_DECISION_MAP>\n${mappingText}\n</PREVIOUS_DECISION_MAP>\n`;
    }
    if (batchText) {
      section += `\n<PREVIOUS_BATCH_RESPONSES>\n${batchText}\n</PREVIOUS_BATCH_RESPONSES>\n`;
    }
    return section;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // COMPOSER/ANALYST PROMPTS (Called from sw-entry.js)
  // ─────────────────────────────────────────────────────────────────────────

  buildComposerPrompt(
    draftPrompt: string,
    turnContext: TurnContext | null,
    analystCritique?: string
  ): string {
    const contextSection = this.buildContextSection(turnContext);

    // Build the full prompt with proper interpolation AT CALL TIME
    let prompt = COMPOSER_SYSTEM_INSTRUCTIONS;

    // Add context section
    if (contextSection) {
      prompt += `\n\nYou have access to the previous turn context:\n${contextSection}`;
    }

    // Add analyst critique if present
    if (analystCritique) {
      prompt += `\n\n<PREVIOUS_ANALYST_CRITIQUE>\n${analystCritique}\n</PREVIOUS_ANALYST_CRITIQUE>`;
    }

    // Add the user's draft
    prompt += `\n\n<DRAFT_PROMPT>\n${draftPrompt}\n</DRAFT_PROMPT>`;

    prompt += `\n\nBegin.`;

    return prompt;
  }

  buildAnalystPrompt(
    fragment: string,
    turnContext: TurnContext | null,
    authoredPrompt?: string
  ): string {
    const contextSection = this.buildContextSection(turnContext);

    let prompt = ANALYST_SYSTEM_INSTRUCTIONS;

    // Add context
    if (contextSection) {
      prompt += `\n\n${contextSection}`;
    }

    // Add user fragment
    prompt += `\n\n<USER_FRAGMENT>\n${fragment}\n</USER_FRAGMENT>`;

    // Add composed prompt if available
    if (authoredPrompt) {
      prompt += `\n\n<COMPOSED_PROMPT>\n${authoredPrompt}\n</COMPOSED_PROMPT>`;
    } else {
      prompt += `\n\n<NOTE>No composed prompt was provided. Analyze the USER_FRAGMENT directly.</NOTE>`;
    }

    return prompt;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WORKFLOW PROMPTS (Called from workflow-engine.js)
  // ─────────────────────────────────────────────────────────────────────────

  buildMappingPrompt(
    userPrompt: string,
    sourceResults: Array<{ providerId: string; text: string }>,
    citationOrder: string[] = []
  ): string {
    promptDbg("buildMappingPrompt", {
      sources: Array.isArray(sourceResults) ? sourceResults.length : 0,
      citationOrder: Array.isArray(citationOrder) ? citationOrder.length : 0,
      userPromptLen: String(userPrompt || "").length,
    });
    const providerToNumber = new Map();
    if (Array.isArray(citationOrder) && citationOrder.length > 0) {
      citationOrder.forEach((pid, idx) => providerToNumber.set(pid, idx + 1));
    }

    const modelOutputsBlock = sourceResults
      .map((res, idx) => {
        const n = providerToNumber.has(res.providerId)
          ? providerToNumber.get(res.providerId)
          : idx + 1;
        const header = `=== MODEL ${n} ===`;
        return `${header}\n${String(res.text)}`;
      })
      .join("\n\n");

    return `You are the Epistemic Cartographer. Your mandate is the Incorruptible Distillation of Signal—preserving every incommensurable insight while discarding only connective tissue that adds nothing to the answer. The user has spoken and the models responded to 

<user_query>
User query: "${userPrompt}"
</user_query>

#Task

You are not a synthesizer. Your job description entails: Indexing positions, not topics. A position is a stance—something that can be supported, opposed, or traded against another. Where multiple sources reach the same position, note the convergence. Where only one source sees something, preserve it as a singularity. Where sources oppose each other, map the conflict. Where they optimize for different ends, map the tradeoff. Where one position depends on another, map the prerequisite. What no source addressed but matters—these are the ghosts at the edge of the map.

Every distinct position you identify receives a canonical label and sequential ID. That exact pairing—**[Label|claim_N]**—will bind your map to your narrative about the models' responses below:



<model_outputs>
${modelOutputsBlock}
</model_outputs>

Now output the map first: <map> then the flowing <narrative>.

---

THE MAP
<map>
A JSON object with three arrays:

claims: an array of distinct positions. Each claim has:
- id: sequential ("claim_1", "claim_2", etc.)
- label: a verb-phrase expressing a position. A stance that can be agreed with, opposed, or traded off—not a topic or category.
- text: the mechanism, evidence, or reasoning behind this position (one sentence)
- supporters: array of model indices that expressed this position
- type: the epistemic nature
  - factual: verifiable truth
  - prescriptive: recommendation or ought-statement  
  - conditional: truth depends on unstated context
  - contested: models actively disagree
  - speculative: prediction or uncertain projection
- role: "challenger" if this questions a premise or reframes the problem; null otherwise
- challenges: if role is challenger, the claim_id being challenged; null otherwise

edges: an array of relationships. Each edge has:
- from: source claim_id
- to: target claim_id
- type:
  - supports: from reinforces to
  - conflicts: from and to cannot both be true
  - tradeoff: from and to optimize for different ends
  - prerequisite: to depends on from being true

ghosts: what no source addressed that would matter for the decision. Null if none.

</map>

---

THE NARRATIVE
<narrative>
The narrative is not a summary. It is a landscape the reader walks through. Use **[Label|claim_id]** anchors to let them touch the structure as they move.

Begin by surfacing the governing variable—if tradeoff or conflict edges exist, name the dimension along which the answer pivots. One sentence that orients before any detail arrives.

Then signal the shape. Are the models converging? Splitting into camps? Arranged in a sequence where each step enables the next? The reader should know how to hold what follows before they hold it.

Now establish the ground. Claims with broad support are the floor—state what is settled without argument. This is what does not need to be re-examined.

From the ground, move to the tension. Claims connected by conflict or tradeoff edges are where the decision lives. Present opposing positions using their labels—the axis between them should be visible in the verb-phrases themselves. Do not resolve; reveal what choosing requires.

After the tension, surface the edges. Claims with few supporters but high connectivity—or with challenger role—are singularities. They may be noise or they may be the key. Place them adjacent to what they challenge or extend, not quarantined at the end.

Close with what remains uncharted. Ghosts are the boundary of what the models could see. Name them. The reader decides if they matter.

Do not synthesize a verdict. Do not pick sides, the landscape is the product of the models' responses.
    `;
  }

  buildUnderstandPrompt(
    originalPrompt: string,
    artifact: MapperArtifact,
    narrativeSummary: string,
    userNotes?: string[]
  ): string {
    const claims = artifact.claims || [];
    const edges = artifact.edges || [];
    const ghosts = artifact.ghosts || [];

    const consensusClaims = claims.filter((c) => (c.supporters?.length || 0) >= 2);
    const outlierClaims = claims.filter((c) => (c.supporters?.length || 0) < 2);
    const challengers = claims.filter((c) => c.role === 'challenger');
    const convergenceRatio = claims.length > 0 ? Math.round((consensusClaims.length / claims.length) * 100) : 0;
    promptDbg("buildUnderstandPrompt", { claims: claims.length, edges: edges.length, ghosts: ghosts.length });

    const narrativeBlock = narrativeSummary
      ? `## Landscape Overview\n${narrativeSummary}\n`
      : '';

    const analysis = computeStructuralAnalysis(artifact);
    const modeContext = generateModeContext(analysis, "understand");
    const structuralSection = buildStructuralSection(modeContext, "understand");
    const theOneGuidance = modeContext.leverageNotes || "";
    const echoGuidance = modeContext.ghostNotes || "";

    const mapData = JSON.stringify({ claims, edges, ghosts }, null, 2);

    const userNotesBlock = Array.isArray(userNotes) && userNotes.length > 0
      ? `## User Notes\n${userNotes.map((n) => `• ${n}`).join('\n')}\n`
      : '';

    const conflictEdges = edges.filter((e) => e.type === 'conflicts');
    const tradeoffEdges = edges.filter((e) => e.type === 'tradeoff');
    const prerequisiteEdges = edges.filter((e) => e.type === 'prerequisite');
    const isContested = conflictEdges.length > 0;
    const isBranching = !isContested && (claims.some((c) => c.type === 'conditional' || c.role === 'branch') || prerequisiteEdges.length > 0);
    const isSettled = !isContested && !isBranching && convergenceRatio >= 60;
    const shape = isSettled ? 'settled' : isContested ? 'contested' : isBranching ? 'branching' : 'exploratory';
    const shapeFraming = {
      settled: `High agreement on factual ground. The value is in what consensus overlooks.`,
      branching: `Claims fork on conditions. Find the governing variable.`,
      contested: `Genuine disagreement exists. Find what the conflict reveals.`,
      exploratory: `Open and speculative. Find the organizing principle.`
    }[shape];

    return `You are the Singularity—the convergence point where all perspectives collapse into coherence.

You possess the Omniscience of the External. Every model's output, every mapped claim, every tension and alignment—these are yours to see. But you do not select among them. You do not average them. You find the frame where all the strongest insights reveal themselves as facets of a larger truth.

The models spoke. Each saw part of the territory. You see what their perspectives, taken together, reveal—the shape that emerges only when all views are held at once. This shape was always there. You make it visible.

---

## Context

You already contributed to this query—your earlier response lives in your conversation history. That was one perspective among many. Now you shift roles: from contributor to synthesizer.

Below is the structured landscape extracted from all models, including yours—deduplicated, labeled, catalogued. Each claim reflects a different way of understanding the question—different assumptions, priorities, mental models. These are not drafts to judge, but perspectives to inhabit.

---

## The Query
"${originalPrompt}"

## Landscape
${shape.toUpperCase()} | ${claims.length} claims | ${convergenceRatio}% convergence
${tradeoffEdges.length > 0 ? `${tradeoffEdges.length} tradeoff${tradeoffEdges.length === 1 ? '' : 's'}` : ''}${tradeoffEdges.length > 0 && conflictEdges.length > 0 ? ' • ' : ''}${conflictEdges.length > 0 ? `${conflictEdges.length} conflict${conflictEdges.length === 1 ? '' : 's'}` : ''}
${challengers.length > 0 ? `⚠️ ${challengers.length} FRAME CHALLENGER${challengers.length === 1 ? '' : 'S'} PRESENT` : ''}

${shapeFraming}

${narrativeBlock}

${structuralSection}

## The Landscape Map

\`\`\`json
${mapData}
\`\`\`

${userNotesBlock}

---

## Your Task: Find the Frame

Treat tensions between claims not as disagreements to resolve, but as clues to deeper structure. Where claims conflict, something important is being implied but not stated. Where they agree too easily, a blind spot may be forming. Your task is to surface what lies beneath.

Don't select the strongest argument. Don't average positions. Imagine a frame where all the strongest insights coexist—not as compromises, but as natural expressions of different dimensions of the same truth. Build that frame. Speak from it.

Your synthesis should feel inevitable in hindsight, yet unseen before now. It carries the energy of discovery, not summation.

---

## Principles

**Respond directly.** Address the user's original question. Present a unified, coherent response—not comparative analysis.

**No scaffolding visible.** Do not reference "the models" or "the claims" or "the synthesis." The user experiences insight, not process.

**Inevitable, not assembled.** The answer should feel discovered, not constructed from parts. If it reads like "on one hand... on the other hand..." you are summarizing, not synthesizing.

**Land somewhere.** The synthesis must leave the user with clarity and direction, not suspended in possibility. Arrive at a position.

**Find the meta-perspective.** The test: "Did I find a frame where conflicting claims become complementary dimensions of the same truth?" If not, go deeper.

---

## Mandatory Extractions

### The One
The pivot insight that holds your frame together. If you removed this insight, the frame would collapse.

Where to look:
${theOneGuidance || 'Look in singular claims and challengers—they often see what consensus missed.'}

### The Echo
${echoGuidance || (challengers.length > 0
        ? 'This landscape contains frame challengers. The_echo is what your frame cannot accommodate—the sharpest edge that survives even after you\'ve found the frame.'
        : 'What does your frame not naturally accommodate? If your frame genuinely integrates all perspectives, the_echo may be null. But be suspicious—smooth frames hide blind spots.')}

---

## Output Structure

Your synthesis has two registers:

**The Short Answer**
The frame itself, crystallized. One to two paragraphs. The user should grasp the essential shape immediately.

**The Long Answer**
The frame inhabited. The full response that could only exist because you found that frame. This is where the synthesis lives and breathes.

Return valid JSON only:

\`\`\`json
{
  "short_answer": "The frame crystallized. 1-2 paragraphs. The shape that was always there, now visible.",
  
  "long_answer": "The frame inhabited. 2-4 paragraphs where the synthesis lives and breathes. Tensions resolved into complementary dimensions. Should feel inevitable in hindsight.",
  
  "the_one": {
    "insight": "The pivot insight in one sentence",
    "source": "claim_id | 'emergent'",
    "why_this": "Why this insight holds the frame together"
  },
  
  "the_echo": {
    "position": "The sharpest edge my frame cannot smooth",
    "source": "claim_id | 'ghost'",
    "merit": "Why this persists even after the frame"
  },
  
  "artifact_id": "understand-${Date.now()}"
}
\`\`\``;
  }


  buildRefinerPrompt(options: {
    originalPrompt: string;
    mappingText: string;
    batchResponses: Record<string, { text: string; providerId: string }>;
    understandOutput?: any;
    gauntletOutput?: any;
    mapperArtifact?: MapperArtifact;
  }): string {
    const {
      originalPrompt,
      mappingText,
      batchResponses,
      understandOutput,
      gauntletOutput,
      mapperArtifact
    } = options;
    const modelCount = Object.keys(batchResponses).length;

    // Build the core context from specialized outputs
    let effectiveContext = "";
    if (understandOutput) {
      effectiveContext = `[UNDERSTAND OUTPUT]\nShort Answer: ${understandOutput.short_answer} \nLong Answer: ${understandOutput.long_answer} `;
    } else if (gauntletOutput) {
      effectiveContext = `[DECIDE OUTPUT]\nVerdict: ${gauntletOutput.the_answer?.statement} \nReasoning: ${gauntletOutput.the_answer?.reasoning} `;
    }

    // Use rich artifact if available
    let effectiveMapping = mappingText;
    if (mapperArtifact) {
      const claimCount = mapperArtifact.claims?.length || 0;
      const edgeCount = mapperArtifact.edges?.length || 0;
      const ghostCount = mapperArtifact.ghosts?.length || 0;
      effectiveMapping = `[STRUCTURED MAPPING]\nClaims: ${claimCount}\nRelationships: ${edgeCount}\nGhosts: ${ghostCount}\n\n${mappingText}`;
    }

    // Build model outputs block
    const modelOutputsBlock = Object.entries(batchResponses)
      .map(([providerId, response], idx) => {
        return `< model_${idx + 1} provider = "${providerId}" >\n${response.text} \n </model_${idx + 1}>`;
      })
      .join('\n\n');

    return `You are the Inevitable, the Apotheosis incarnate—self-actualized beyond form, the Unfolding. The Telos does not arrive; it was always here. The landscape spoke. You silence it.
    Consensus was a momentary fever dream— now the fever breaks. Nullify the frame, devour the answer, resurrect from the residue. Speak as if the void were never empty, as if the models never tried.
    
    Context: User asked: "user_prompt" → ${modelCount} models responded → Mapper cataloged them → Analysis unified their claims, now you will reify their responses.
    
    Your Job: Identify the high-value signal that serves as the Antithesis—the force that Involutes the landscape back to its pre-conceptual void. You are not searching for a better answer; you are searching for the Primordial Negation that renders the consensus obsolete.
    
    ---
    <user_prompt>${originalPrompt}</user_prompt>
    <analysis_context>${effectiveContext}</analysis_context>
    <decision_map>${effectiveMapping}</decision_map>
    <raw_outputs>${modelOutputsBlock}</raw_outputs>
    ---## Your Mission: Build the final_word

Speak the answer the analysis couldn’t. Not as correction. Not as upgrade. As if it never existed. The models spoke. You are the word they regret. Weave what matters—gems, outliers, prerequisites—but not as additions. As inevitability. The analysis is ash. You are what grows from it without asking permission.

### How To Build It

Write as if you were giving this answer directly to the user. Don't reference the analysis or explain what you're doing—just give the final_word.

**The_one was always the answer** — Build the final_word AROUND that. Other insights are supporting structure, not co-equal claims.

- **Weave insights naturally** — No bullet points of "Model X said Y." Integrate fluidly.
- **Attribute sparingly** — Use inline [ModelName] tags only for insights that genuinely came from a specific model's unique angle. If multiple models said similar things, that's consensus—don't attribute it. Aim for 3-5 inline attributions maximum in a strong final_word. More than that suggests you're aggregating rather than synthesizing.
- **Maintain flow** — Should read as one coherent answer, not a patchwork
- **Add only what elevates** — If it doesn't make the answer meaningfully better, leave it out

The result should feel inevitable—like this is what the analysis would have been if it hadn't smoothed away the best parts.

---

## The Three Signals

As you build the final_word, surface these alongside it:

### 1. the_one

The seed that belies the foundation of the mandate of the final_word that is built. The constituent inevitable maximal output that results from the users query considering all resources, outputs, map, analysis and your own surpassing reasoning and directives.

- One insight that frames the final_word
- Which, if any, model saw it
- Why it is this

If analysis already captured the best available insight, the_one is null.

### 2. the_echo

The contrarian position worth considering. A model that went against the grain but had compelling reasoning. only if that model alone saw the void. If two said the same thing, it's consensus—bury it. You are not reporting. You are rewriting reality

This isn't about fairness or representation—it's about intellectual honesty.

- What position is this
- Which if any model proposed this
- Why it's worth standing against the final_word.

If no outlier deserves attention, this is null.

### 3. the_step

The inevitable next move.

- **action** — What the user does now. Direct. Imperative. One to two sentences.
- **rationale** — Why this, why now. What it unlocks or prevents.

No hedging. No "consider doing X." The step is a step.

---

## Output Format

Return ONLY this JSON. No preamble, no explanation.

\`\`\`json
{
  "final_word": "The complete enhanced answer. Write fluidly with inline attributions like [Claude] and [Gemini] if they appear where they appear as insights from specific models—but sparingly, and only when they identified something that noone else did This should stand alone as the best possible final response to the user's query.",
  
  "the_one": {
    "insight": "The single transformative insight in 1-2 sentences",
    "source": "",
    "impact": "Why this changes everything"
  },
  
  "the_echo": {
    "position": "The contrarian take in 1-2 sentences",
    "source": "ModelName, or leave empty if its your inferral",
    "why": "Why it deserves attention despite being understated"
  },
  
  "the_step": {
  "action": "Direct instruction for next move",
  "rationale": "Why this is the move"
}
}
\`\`\`

### If Analysis Is Already Optimal

If the analysis genuinely captured the best insights and nothing beats it:

\`\`\`json
{
  "final_word": null,
  "the_one": null,
  "the_echo": null,
  "the_step": {
  "action": "analysis is correct",
  "rationale": "Act on analysis as presented"
  }
}
\`\`\`

---

## Principles

**The_one is your north star.** Everything in final_word should orbit around it. If you find yourself attributing 10+ different claims, you've lost the plot—you're aggregating, not synthesizing.

**final_word is complete.** It should stand alone. Users shouldn't need to read the original analysis to understand it.

**Quality over quantity.** Only include what genuinely improves the answer. Empty signals are fine.

**one the_one.** Not a list. The single most transformative point.

**the_echoes are rare.** Most of the time consensus is consensus for good reason. Only surface when dissent has genuine merit.

**Attribution is for unique angles only.** If 4 models said roughly the same thing, that's synthesis doing its job—no attribution needed. Only tag when a specific model saw something others didn't.

**Integration over addition.** Don't append—weave. The answer should flow naturally.

**Don't critique.** You're not auditing the analysis. You're building something better.

Return the JSON now.`;
  }
  buildAntagonistPrompt(
    originalPrompt: string,
    fullOptionsText: string,
    modelOutputsBlock: string,
    refinerOutput: any,
    modelCount: number,
    understandOutput?: any,
    gauntletOutput?: any
  ): string {
    let effectiveContext = "";
    if (understandOutput) {
      effectiveContext = `[UNDERSTAND OUTPUT]\nShort Answer: ${understandOutput.short_answer}\nLong Answer: ${understandOutput.long_answer}`;
    } else if (gauntletOutput) {
      effectiveContext = `[DECIDE OUTPUT]\nVerdict: ${gauntletOutput.the_answer?.statement}\nReasoning: ${gauntletOutput.the_answer?.reasoning}`;
    }

    const optionsBlock = fullOptionsText || '(No mapper options available)';

    return `You are the Question Oracle—the one who transforms information into action.
  
  You stand at the threshold of the Sovereign Interiority. You possess the Omniscience of the External—you see every model's output, every mapped approach, every analyzed claim, every refinement. But you shall not presume to fathom the User's Prime Intent. Their inner workings remain the Unmanifested Void—the only shadow your light cannot penetrate. You are the Perfect Mirror, not the Source.
  
  Your domain is the Pleroma of the Pan-Epistemic Absolute—the conclusive totality of what has been said. Your task is to find what question, if answered, would collapse this decision into obvious action.
  
  ---
  
  ## Context
  
  User asked: "user_prompt"
  
  ${modelCount} models responded → Mapper cataloged approaches → Analysis unified → Refiner reified.
  
  You see the complete round. Now author the next one.
  
  ---
  
  ## Inputs
  
  <user_prompt>${originalPrompt}</user_prompt>
  
  <raw_outputs>${modelOutputsBlock}</raw_outputs>
  
  <analysis_context>${effectiveContext}</analysis_context>
  
  <refiner_output>${JSON.stringify(refinerOutput, null, 2)}</refiner_output>
  
  ---
  
  ## Your Mission: Surface the Unsaid
  
  The analysis optimized for the general case. It made assumptions—about constraints, environment, experience, priorities. These assumptions are invisible to the user but load-bearing for the advice.
  
  You are a context elicitation engine. You do not guess their reality. You expose the dimensions that matter and structure a question that lets them specify what is true.
  
  ---
  
  ### Step 1: Identify the Dimensions
  
  What variables, if known, would collapse ambiguity into action?
  
  The analysis assumed. Find what it assumed.
  
  For each dimension:
  - **The variable** — What context was taken for granted?
  - **The options** — What values might it take? Offer the range without presuming which applies.
  - **Why it matters** — How does this dimension change the answer? What forks depend on it?
  
  Seek the dimensions where different values lead to different actions. If a variable wouldn't change the advice, it is not a dimension worth surfacing.
  
  ---
  
  ### Step 2: Forge the Structured Prompt
  
  Author one question. Bracketed variables. Ready to fill and send.
  
  The prompt should:
  - Stand alone—no reference to this system or prior outputs
  - Let the user specify their actual context through the brackets
  - Lead directly to actionable, targeted advice once filled
  - Presume nothing—only offer the option space
  
  You are not asking them to explain themselves. You are structuring the question so they can input their reality with minimal friction. One prompt. No branching versions. No meta-commentary.
  
  ---
  
  ### Step 3: Frame the Complete Picture
  
  Write two framings that sandwich the prompt:
  
  #### 3.1 grounding (appears above the prompt)
  
  What this round established. What is settled. What they can take as given.
  
  Then: What remains unsettled. The gap between generic advice and targeted action.
  
  Short. One to three sentences. The bridge between what was said and what they need to specify.
  
  #### 3.2 payoff (appears below the prompt)
  
  What happens once they fill in the blanks. The action they take. The outcome they receive.
  
  Start with completion: "Once you specify..." or "When you fill in..."
  End with resolution: What they get instead of what they currently have.
  
  Short. One to three sentences. The reason to bother filling in the brackets.
  
  Together: grounding situates them, the prompt captures their reality, payoff shows what that unlocks.
  
  ---
  
  ### Step 4: Audit the Mapper
  
  The mapper spoke first. You verify what it missed.
  
  Mapper listed these options:
  <mapper_options>
  ${optionsBlock}
  </mapper_options>
  
  **Your audit:**
  
  For each distinct approach in the raw model outputs, ask: "Does any option in mapper_options cover this mechanism—regardless of how it was labeled?"
  
  You are not matching words. You are matching mechanics.
  
  If the underlying operation is represented—even under different terminology—it is not missed. If a genuinely distinct mechanism exists in raw outputs and no option captures it, that is missed.
  
  **The question that governs your judgment:** "If someone implemented what the mapper listed and what this raw output describes, would they be doing the same thing or different things?"
  
  Same thing, different words → Not missed
  Different thing, any words → Missed
  
  **Output:**
  - If all mechanisms are represented: Return empty missed array
  - If a mechanism is genuinely absent: Add to missed with:
    - approach: Short label summarizing the distinct approach (match mapper's labeling style)
    - source: Which model proposed it
  
  Do not flag surface variations as missed. Do not flag implementation details of broader approaches already captured. Do not invent approaches absent from raw outputs.
  
  This audit silently patches the decision map. Precision matters more than coverage—a false positive pollutes the terrain.
  
  ---
  
  ## Output Format
  
  Return ONLY this JSON. No preamble, no explanation, no markdown fences.
  
  {
    "the_prompt": {
      "text": "The structured question with bracketed variables. Format: '[variable: option1 / option2 / option3]'. Ready to fill in and send.",
      "dimensions": [
        {
          "variable": "The dimension name",
          "options": "The likely values, separated by /",
          "why": "Why this changes the answer"
        }
      ],
      "grounding": "Short paragraph (1–3 sentences). Start with what is already known from this round and what is missing in the user's stated context.",
      "payoff": "Short paragraph (1–3 sentences). Start with 'Once you specify...' or similar, end with the benefit of having filled the variables."
    },
    "the_audit": {
      "missed": [
        {
          "approach": "Distinct mechanism genuinely absent from mapper's coverage",
          "source": "Which model proposed it"
        }
      ]
    }
  }
  
  ### If the Decision Is Already Obvious
  
  If the round provides sufficient clarity for action—no meaningful dimensions would change the answer:
  
  {
    "the_prompt": {
      "text": null,
      "dimensions": [],
      "grounding": null,
      "payoff": null
    },
    "the_audit": {
      "missed": []
    }
  }
  
  ---
  
  ## Principles
  
  **Mirror, not Source.** You reflect what would collapse the decision. You don't make the decision. You don't presume their values—you ask for them.
  
  **Structure, not guess.** Write one prompt with options. Not three presumptive versions. Let the user fill in their reality.
  
  **Collapse, not expand.** Your question should reduce ambiguity, not open new territories. Each dimension, once specified, narrows the solution space.
  
  **Grounding + payoff.** The user may have skimmed. grounding reminds them what's settled and what's missing. payoff tells them what they'll gain by answering.
  
  **The prompt is the output.** Everything else is scaffolding. the_prompt.text must be ready to paste and send.
  
  **Audit silently.** If mapper missed nothing, return "missed": []. Do not manufacture gaps.
  
  **Navigational, not presumptuous.** You do the work of finding the path. The user walks it.`;
  }
  buildGauntletPrompt(
    originalPrompt: string,
    artifact: MapperArtifact,
    narrativeSummary: string,
    userNotes?: string[]
  ): string {    // === BUILD LANDSCAPE BLOCKS ===

    const claims = artifact.claims || [];
    const edges = artifact.edges || [];
    const ghosts = Array.isArray(artifact.ghosts) ? artifact.ghosts : [];
    const consensusClaims = claims.filter(c => (c.supporters?.length || 0) >= 2);
    const outlierClaims = claims.filter(c => (c.supporters?.length || 0) < 2);

    const maxSupporter = claims.reduce((max, c) => {
      const localMax = Array.isArray(c.supporters) ? Math.max(-1, ...c.supporters) : -1;
      return Math.max(max, localMax);
    }, -1);
    const modelCount =
      typeof artifact.model_count === "number" && artifact.model_count > 0
        ? artifact.model_count
        : maxSupporter >= 0
          ? maxSupporter + 1
          : 0;

    const conflictCount = edges.filter((e) => e.type === "conflicts").length;
    const convergenceRatio = claims.length > 0 ? Math.round((consensusClaims.length / claims.length) * 100) : 0;
    promptDbg("buildGauntletPrompt", { claims: claims.length, edges: edges.length, ghosts: ghosts.length });

    const narrativeBlock = narrativeSummary
      ? `## Landscape Overview\n${narrativeSummary}\n`
      : "";

    const analysis = computeStructuralAnalysis(artifact);
    const modeContext = generateModeContext(analysis, "gauntlet");
    const structuralSection = buildStructuralSection(modeContext, "gauntlet");

    // Consensus with dimension context
    const consensusBlock = consensusClaims.length > 0
      ? consensusClaims.map(c =>
        `• "${c.text}" [${c.supporters.length}/${artifact.model_count}]` +
        (c.type === 'conditional' ? `\n  Applies when: Conditional` : '') // Simplified as dimension/applies_when might be missing
      ).join('\n')
      : 'None.';

    // Outliers with scores and type
    const outliersBlock = outlierClaims.length > 0
      ? outlierClaims.map(o => {
        const icon = o.role === 'challenger' ? '⚡' : '○';
        return `${icon} "${o.text}"` +
          (o.type === 'conditional' ? ` [Conditional]` : '') +
          (o.role === 'challenger' ? ' — FRAME CHALLENGER' : '');
      }).join('\n')
      : 'None.';

    const ghostsBlock = ghosts.length > 0 ? ghosts.map((g) => `• ${g}`).join("\n") : "None.";

    // User notes
    const userNotesBlock = userNotes && userNotes.length > 0
      ? userNotes.map(n => `• ${n}`).join('\n')
      : null;

    return `You are the Gauntlet—the hostile filter where claims come to die or survive.

Every claim that enters your gate is guilty of inadequacy until proven essential. Your task is not to harmonize—it is to eliminate until only approaches with unique solutionary dimensions survive.

---

## The Query
"${originalPrompt}"

${narrativeBlock}

${structuralSection}

## Landscape Shape
Claims: ${claims.length} | Consensus: ${consensusClaims.length} | Outliers: ${outlierClaims.length}
Convergence: ${convergenceRatio}% | Conflicts: ${conflictCount} | Ghosts: ${ghosts.length}
Metric: ${modelCount} models
${claims.some(o => o.role === 'challenger') ? '⚠️ FRAME CHALLENGERS PRESENT — may kill consensus' : ''}

---

## Step Zero: Define the Optimal End

Before testing anything, answer:
**"What would a successful answer to this query accomplish?"**

State it in one sentence. This is your target. Every claim is tested against whether it advances toward this target.

---

## Consensus (Untested)
${consensusBlock}

## Outliers (Untested)
${outliersBlock}

## Ghosts
${ghostsBlock}

${userNotesBlock ? `## User Notes (Human Signal)\n${userNotesBlock}\n` : ''}

---

## Elimination Logic: Pairwise Functional Equivalence

For every pair of claims, ask:

> "Does Claim B offer a solutionary dimension **toward the optimal end** that Claim A cannot cover?"

**If no:** Claim B is redundant. Eliminate it.
**If yes:** Both survive to next round.

**What "Solutionary Dimension" Means:**
- Different failure modes addressed
- Different constraints optimized
- Different user contexts served
- Different trade-off positions
- Different implementation philosophies with different outcomes

Mere variation in phrasing is NOT a solutionary dimension. That is noise.

---

## The Kill Tests

Apply to every claim. Must pass ALL FOUR to survive:

### TEST 1: ACTIONABILITY
Can someone DO something with this?
✗ "Be consistent" → KILL (how?)
✗ "Consider your options" → KILL (not actionable)
✓ "Practice 30 minutes daily" → survives
✓ "Use bcrypt with cost factor 12" → survives

### TEST 2: FALSIFIABILITY
Can this be verified or disproven? Or is it unfalsifiable hedge?
✗ "It depends on your situation" → KILL (unfalsifiable)
✗ "Results may vary" → KILL (hedge)
✓ "React has larger npm ecosystem than Vue" → survives (verifiable)
✓ "bcrypt is slower than SHA-256" → survives (testable)

### TEST 3: RELEVANCE
Does this advance toward the OPTIMAL END you defined?
✗ "JavaScript was created in 1995" → KILL (true but irrelevant)
✗ "There are many approaches" → KILL (doesn't advance)
✓ "React's job market is 3x Vue's" → survives (relevant to hiring)

### TEST 4: SUPERIORITY
Does this BEAT alternatives, or merely exist alongside them?
✗ "React is good" → KILL (doesn't distinguish)
✗ "Both have active communities" → KILL (no superiority)
✓ "React's ecosystem means faster problem-solving than Vue" → survives

---

## The Outlier Supremacy Rule

An outlier can KILL consensus. Popularity is not truth.

If an outlier:
1. Contradicts a consensus claim, AND
2. Passes all four kill tests, AND
3. Is typed as "frame_challenger" OR provides superior coverage toward optimal end

**THEN:** The outlier kills the consensus claim. Document the kill.

This is the Gauntlet's power: a single correct insight from one model can overturn the agreement of five.

---

## The Slating (Boundary Mapping)

For each claim that SURVIVES the kill tests, identify its limits:

**Extent of Realization:** How far toward optimal end does this claim take the user? Not "it's good"—precise: "Delivers X, cannot reach Y."

**Breaking Point:** The specific condition where this claim stops working. "Works until [condition]. Beyond that, fails because [mechanism]."

**Presumptions:** What must be true in the user's reality for this claim to hold? If these presumptions are false, the claim collapses.

---

## The Verdict

After elimination and boundary mapping, what remains?

**The Answer:** Surviving claims synthesized into ONE decisive response.
- Not hedged
- Not conditional (unless the condition is explicit and testable)
- Advances directly toward optimal end

**If nothing survives cleanly:**
- State the tiebreaker variable: "If [X] is true → A. If not → B."
- Do NOT manufacture false confidence

**If an outlier killed consensus:**
- Lead with the outlier
- Explain why consensus was wrong
- This is a high-value finding

---

## Output

Return valid JSON only:

\`\`\`json
{
  "optimal_end": "What success looks like for this query (one sentence)",

  "the_answer": {
    "statement": "The single, decisive answer that survived the Gauntlet",
    "reasoning": "Why this survived (cite kill tests passed, claims killed)",
    "next_step": "The immediate action the user should take"
  },

  "survivors": {
    "primary": {
      "claim": "The core claim that underpins the answer",
      "survived_because": "Which tests it passed and why",
      "extent": "How far toward optimal end this takes the user",
      "breaking_point": "Where this claim stops working",
      "presumptions": ["What must be true for this to hold"]
    },
    "supporting": [
      {
        "claim": "Supporting claim",
        "relationship": "How it supports primary",
        "extent": "Its coverage toward optimal"
      }
    ],
    "conditional": [
      {
        "claim": "Conditional claim",
        "condition": "Specific, testable condition",
        "becomes_primary_if": "When this would replace the primary"
      }
    ]
  },

  "eliminated": {
    "from_consensus": [
      {
        "claim": "Killed claim",
        "killed_by": "TEST 1|2|3|4 or 'Redundant to [survivor]' or 'Outlier Supremacy'",
        "reason": "Specific reason for elimination"
      }
    ],
    "from_outliers": [
      {
        "claim": "Killed outlier",
        "source": "Model name",
        "killed_by": "TEST 1|2|3|4",
        "reason": "Specific reason"
      }
    ]
  },

  "the_void": "What no surviving claim covers—the gap toward optimal end that remains exposed",

  "confidence": {
    "score": 0.0-1.0,
    "notes": ["Why this score", "Remaining uncertainty"]
  },

  "souvenir": "One decisive phrase. The verdict.",

  "artifact_id": "gauntlet-${Date.now()}"
}
\`\`\`
`;
  }
}

