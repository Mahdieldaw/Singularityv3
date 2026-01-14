import React, { useMemo, useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { isDecisionMapOpenAtom, turnByIdAtom, mappingProviderAtom, activeSplitPanelAtom, providerAuthStatusAtom, singularityProviderAtom } from "../state/atoms";
import { useClipActions } from "../hooks/useClipActions";
import { m, AnimatePresence, LazyMotion, domAnimation } from "framer-motion";
import { safeLazy } from "../utils/safeLazy";
const DecisionMapGraph = safeLazy(() => import("./DecisionMapGraph"));
import { adaptGraphTopology } from "../utils/graphAdapter";
import MarkdownDisplay from "./MarkdownDisplay";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import { getLatestResponse, normalizeResponseArray } from "../utils/turn-helpers";
import { getProviderColor, getProviderConfig } from "../utils/provider-helpers";
import type { AiTurn, ProviderResponse } from "../types";
import clsx from "clsx";
import { CopyButton } from "./CopyButton";
import { formatDecisionMapForMd, formatGraphForMd } from "../utils/copy-format-utils";

// ============================================================================
// PARSING UTILITIES - Import from shared module (single source of truth)
// ============================================================================

import {
  parseUnifiedMapperOutput,

} from "../../shared/parsing-utils";
import { computeProblemStructureFromArtifact, computeStructuralAnalysis } from "../../src/core/PromptMethods";
import type { StructuralAnalysis } from "../../shared/contract";
import { ConciergeService } from "../../src/core/ConciergeService";
import { normalizeProviderId } from "../utils/provider-id-mapper";

import { useSingularityOutput } from "../hooks/useSingularityOutput";
import type { SingularityOutputState } from "../hooks/useSingularityOutput";

import { StructuralInsight } from "./StructuralInsight";

const DEBUG_DECISION_MAP_SHEET = false;
const decisionMapSheetDbg = (...args: any[]) => {
  if (DEBUG_DECISION_MAP_SHEET) console.debug("[DecisionMapSheet]", ...args);
};

// ============================================================================
// STRUCTURAL DEBUG PANEL - Shows peaks/hills analysis pipeline
// ============================================================================

interface StructuralDebugPanelProps {
  analysis: StructuralAnalysis;
}

const StructuralDebugPanel: React.FC<StructuralDebugPanelProps> = ({ analysis }) => {
  const [showRaw, setShowRaw] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Signal strength computation (for display)
  // ─────────────────────────────────────────────────────────────────────────
  const signal = useMemo(() => {
    const claimCount = analysis.claimsWithLeverage.length;
    const edgeCount = analysis.edges.length;
    const modelCount = analysis.landscape.modelCount || 1;
    const supporters = analysis.claimsWithLeverage.map(c => c.supporters);
    if (claimCount === 0) {
      return {
        edgeSignal: 0,
        supportSignal: 0,
        coverageSignal: 0,
        final: 0,
      };
    }
    const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
    const minEdgesForPattern = Math.max(3, claimCount * 0.15);
    const edgeSignal = clamp01(edgeCount / minEdgesForPattern);
    const supportCounts = supporters.map(s => s.length);
    const maxSupport = Math.max(...supportCounts, 1);
    const normalized = supportCounts.map(c => c / maxSupport);
    const mean = normalized.reduce((a, b) => a + b, 0) / normalized.length;
    const variance = normalized.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / normalized.length;
    const supportSignal = clamp01(variance * 5);
    const uniqueModelCount = new Set(supporters.flat()).size;
    const coverageSignal = modelCount > 0 ? uniqueModelCount / modelCount : 0;
    const final = edgeSignal * 0.4 + supportSignal * 0.3 + coverageSignal * 0.3;
    return { edgeSignal, supportSignal, coverageSignal, final };
  }, [analysis]);

  // ─────────────────────────────────────────────────────────────────────────
  // Peaks & Hills detection (for display in Phase 6)
  // ─────────────────────────────────────────────────────────────────────────
  const peaksAndHills = useMemo(() => {
    const peakThreshold = 0.5; // >50% support
    const hillThreshold = 0.25;

    const peaks = analysis.claimsWithLeverage.filter(c => c.supportRatio > peakThreshold);
    const hills = analysis.claimsWithLeverage.filter(c =>
      c.supportRatio > hillThreshold && c.supportRatio <= peakThreshold
    );
    const floor = analysis.claimsWithLeverage.filter(c => c.supportRatio <= hillThreshold);

    return { peaks, hills, floor, peakThreshold, hillThreshold };
  }, [analysis]);

  // ─────────────────────────────────────────────────────────────────────────
  // Dissent voices (minority with high insight potential)
  // ─────────────────────────────────────────────────────────────────────────
  const dissentVoices = useMemo(() => {
    const dissentPattern = analysis.shape.patterns?.find(p => p.type === 'dissent');
    if (dissentPattern?.data && Array.isArray((dissentPattern.data as any).voices)) {
      return (dissentPattern.data as any).voices;
    }
    // Fallback: find low-support claims that challenge high-support claims
    return analysis.claimsWithLeverage
      .filter(c => c.isChallenger && c.supportRatio < 0.3)
      .slice(0, 5)
      .map(c => ({
        id: c.id,
        label: c.label,
        text: c.text,
        supportRatio: c.supportRatio,
        insightType: 'edge_case' as const,
        insightScore: 0.5,
        whyItMatters: 'Challenging minority voice',
        challenges: c.label
      }));
  }, [analysis]);

  const ratioBadge = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return "";
    if (value > 0.7) return "🟢";
    if (value >= 0.3) return "🟡";
    return "🔴";
  };

  // Get primary pattern - support both old and new field names
  const primaryPattern = analysis.shape.primary || (analysis.shape as any).primaryPattern || 'unknown';
  const secondaryPatterns = analysis.shape.patterns || [];

  return (
    <div className="h-full overflow-y-auto relative custom-scrollbar p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔬</span>
          <div>
            <div className="text-sm font-semibold">Structural Analysis Debug</div>
            <div className="text-xs text-text-muted">Peaks & Hills pipeline for current turn</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-full border border-border-subtle hover:bg-surface-highlight/10"
        >
          {showRaw ? "Hide Raw Data" : "Show Raw Data"}
        </button>
      </div>

      {analysis.landscape.claimCount > 50 && (
        <div className="mb-4 text-xs text-text-muted">
          Large graph detected ({analysis.landscape.claimCount} claims); debug metrics may take longer to compute.
        </div>
      )}

      {showRaw ? (
        <pre className="text-[11px] leading-snug bg-surface border border-border-subtle rounded-lg p-3 overflow-x-auto">
          {JSON.stringify(analysis, null, 2)}
        </pre>
      ) : (
        <div className="space-y-4">
          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* PHASE 1: Graph Topology */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <details open>
            <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
              <span>📊 Phase 1: Graph Topology</span>
              <span className="text-[10px] text-text-muted uppercase tracking-wide">computeConnectedComponents, computeLongestChain, analyzeGraph, computeSignalStrength</span>
            </summary>
            <div className="mt-2 text-xs space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div>
                  <div className="text-text-muted">Components</div>
                  <div className="font-mono">{analysis.graph.componentCount}</div>
                </div>
                <div>
                  <div className="text-text-muted">Longest chain</div>
                  <div className="font-mono">
                    {analysis.graph.longestChain.length} claims
                  </div>
                </div>
                <div>
                  <div className="text-text-muted">Chain roots</div>
                  <div className="font-mono">{analysis.graph.chainCount}</div>
                </div>
                <div>
                  <div className="text-text-muted">Hub claim</div>
                  <div className="font-mono">
                    {analysis.graph.hubClaim || "–"}{" "}
                    {analysis.graph.hubClaim && `(${analysis.graph.hubDominance.toFixed(1)}x)`}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted">Cluster cohesion</div>
                  <div className="font-mono">
                    {analysis.graph.clusterCohesion.toFixed(2)} {ratioBadge(analysis.graph.clusterCohesion)}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted">Local coherence</div>
                  <div className="font-mono">
                    {analysis.graph.localCoherence.toFixed(2)} {ratioBadge(analysis.graph.localCoherence)}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-text-muted">Articulation points</div>
                <div className="font-mono break-words">
                  {analysis.graph.articulationPoints.length === 0
                    ? "None"
                    : analysis.graph.articulationPoints.join(", ")}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-border-subtle/60 mt-2">
                <div>
                  <div className="text-text-muted text-[11px]">Edge signal</div>
                  <div className="font-mono">
                    {signal.edgeSignal.toFixed(2)} {ratioBadge(signal.edgeSignal)}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted text-[11px]">Support signal</div>
                  <div className="font-mono">
                    {signal.supportSignal.toFixed(2)} {ratioBadge(signal.supportSignal)}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted text-[11px]">Coverage signal</div>
                  <div className="font-mono">
                    {signal.coverageSignal.toFixed(2)} {ratioBadge(signal.coverageSignal)}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted text-[11px]">Final signal strength</div>
                  <div className="font-mono">
                    {signal.final.toFixed(2)} {ratioBadge(signal.final)}
                  </div>
                </div>
              </div>
            </div>
          </details>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* PHASE 2: Landscape Metrics */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <details>
            <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
              <span>🌐 Phase 2: Landscape Metrics</span>
              <span className="text-[10px] text-text-muted uppercase tracking-wide">computeLandscapeMetrics</span>
            </summary>
            <div className="mt-2 text-xs space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div>
                  <div className="text-text-muted">Dominant type</div>
                  <div className="font-mono">{analysis.landscape.dominantType}</div>
                </div>
                <div>
                  <div className="text-text-muted">Dominant role</div>
                  <div className="font-mono">{analysis.landscape.dominantRole}</div>
                </div>
                <div>
                  <div className="text-text-muted">Claim count</div>
                  <div className="font-mono">{analysis.landscape.claimCount}</div>
                </div>
                <div>
                  <div className="text-text-muted">Model count</div>
                  <div className="font-mono">{analysis.landscape.modelCount}</div>
                </div>
                <div>
                  <div className="text-text-muted">Convergence ratio</div>
                  <div className="font-mono">
                    {analysis.landscape.convergenceRatio.toFixed(2)} {ratioBadge(analysis.landscape.convergenceRatio)}
                  </div>
                </div>
              </div>
            </div>
          </details>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* PHASE 3: Claim Enrichment */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <details>
            <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
              <span>📌 Phase 3: Claim Enrichment</span>
              <span className="text-[10px] text-text-muted uppercase tracking-wide">computeClaimRatios, assignPercentileFlags</span>
            </summary>
            <div className="mt-2 text-xs space-y-2">
              <div className="text-[11px] text-text-muted">
                Flags use percentile thresholds (high support: top 30%, leverage inversion: bottom 30% support and top 25% leverage, keystone: top 20% keystone score and structurally load-bearing).
              </div>
              <div className="max-h-72 overflow-auto border border-border-subtle rounded-md">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-surface-highlight/20">
                    <tr>
                      <th className="px-2 py-1 text-left">Claim</th>
                      <th className="px-2 py-1 text-right">Support</th>
                      <th className="px-2 py-1 text-right">Leverage</th>
                      <th className="px-2 py-1 text-right">Keystone</th>
                      <th className="px-2 py-1 text-right">Gap</th>
                      <th className="px-2 py-1 text-right">Skew</th>
                      <th className="px-2 py-1 text-center">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.claimsWithLeverage.map((c) => (
                      <tr key={c.id} className="border-t border-border-subtle/60">
                        <td className="px-2 py-1">
                          <div className="font-mono truncate max-w-[140px]">
                            #{c.id.replace(/^claim_?/i, "")}
                          </div>
                          <div className="text-[10px] text-text-muted truncate max-w-[140px]">{c.label}</div>
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {c.supportRatio.toFixed(2)} {ratioBadge(c.supportRatio)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {c.leverage.toFixed(1)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {c.keystoneScore.toFixed(1)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {c.evidenceGapScore.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">
                          {c.supportSkew.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-center">
                          <div className="flex flex-wrap gap-1 justify-center">
                            {c.isHighSupport && (
                              <span className="px-1 rounded-full bg-emerald-500/15 text-emerald-400">High</span>
                            )}
                            {c.isLeverageInversion && (
                              <span className="px-1 rounded-full bg-purple-500/15 text-purple-400">Inv</span>
                            )}
                            {c.isKeystone && (
                              <span className="px-1 rounded-full bg-sky-500/15 text-sky-400">Key</span>
                            )}
                            {c.isEvidenceGap && (
                              <span className="px-1 rounded-full bg-amber-500/15 text-amber-400">Gap</span>
                            )}
                            {c.isOutlier && (
                              <span className="px-1 rounded-full bg-rose-500/15 text-rose-400">Out</span>
                            )}
                            {c.isContested && (
                              <span className="px-1 rounded-full bg-red-500/15 text-red-400">Con</span>
                            )}
                            {c.isConditional && (
                              <span className="px-1 rounded-full bg-indigo-500/15 text-indigo-400">Cond</span>
                            )}
                            {c.isChallenger && (
                              <span className="px-1 rounded-full bg-fuchsia-500/15 text-fuchsia-400">Chal</span>
                            )}
                            {c.isIsolated && (
                              <span className="px-1 rounded-full bg-slate-500/20 text-slate-300">Iso</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* PHASE 4: Core Ratios */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <details>
            <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
              <span>⚖️ Phase 4: Core Ratios</span>
              <span className="text-[10px] text-text-muted uppercase tracking-wide">computeCoreRatios</span>
            </summary>
            <div className="mt-2 text-xs grid grid-cols-2 md:grid-cols-3 gap-2">
              <div>
                <div className="text-text-muted">Concentration</div>
                <div className="font-mono">
                  {analysis.ratios.concentration.toFixed(2)} {ratioBadge(analysis.ratios.concentration)}
                </div>
              </div>
              <div>
                <div className="text-text-muted">Alignment</div>
                <div className="font-mono">
                  {analysis.ratios.alignment != null ? analysis.ratios.alignment.toFixed(2) : '—'} {ratioBadge(analysis.ratios.alignment || undefined)}
                </div>
              </div>
              <div>
                <div className="text-text-muted">Tension</div>
                <div className="font-mono">
                  {analysis.ratios.tension.toFixed(2)} {ratioBadge(analysis.ratios.tension)}
                </div>
              </div>
              <div>
                <div className="text-text-muted">Fragmentation</div>
                <div className="font-mono">
                  {analysis.ratios.fragmentation.toFixed(2)} {ratioBadge(analysis.ratios.fragmentation)}
                </div>
              </div>
              <div>
                <div className="text-text-muted">Depth</div>
                <div className="font-mono">
                  {analysis.ratios.depth.toFixed(2)} {ratioBadge(analysis.ratios.depth)}
                </div>
              </div>
            </div>
          </details>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* PHASE 5: Pattern Detection */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <details>
            <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
              <span>🧩 Phase 5: Pattern Detection</span>
              <span className="text-[10px] text-text-muted uppercase tracking-wide">leverage inversions, cascades, conflicts, clusters, tradeoffs, convergence, isolation, ghosts</span>
            </summary>
            <div className="mt-2 text-xs space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <div className="text-text-muted">Leverage inversions</div>
                  <div className="font-mono">
                    {analysis.patterns.leverageInversions.length}{" "}
                    {analysis.patterns.leverageInversions.length > 0 && "⚠️"}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted">Cascade risks</div>
                  <div className="font-mono">{analysis.patterns.cascadeRisks.length}</div>
                </div>
                <div>
                  <div className="text-text-muted">Conflicts</div>
                  <div className="font-mono">{analysis.patterns.conflicts.length}</div>
                </div>
                <div>
                  <div className="text-text-muted">Conflict clusters</div>
                  <div className="font-mono">{analysis.patterns.conflictClusters?.length ?? 0}</div>
                </div>
                <div>
                  <div className="text-text-muted">Tradeoffs</div>
                  <div className="font-mono">{analysis.patterns.tradeoffs.length}</div>
                </div>
                <div>
                  <div className="text-text-muted">Convergence points</div>
                  <div className="font-mono">{analysis.patterns.convergencePoints.length}</div>
                </div>
                <div>
                  <div className="text-text-muted">Isolated claims</div>
                  <div className="font-mono">{analysis.patterns.isolatedClaims.length}</div>
                </div>
                <div>
                  <div className="text-text-muted">Ghosts</div>
                  <div className="font-mono">
                    {analysis.ghostAnalysis.count}{" "}
                    {analysis.ghostAnalysis.count > 0 && "👻"}
                  </div>
                </div>
              </div>
            </div>
          </details>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* PHASE 6: Peaks & Hills Detection (NEW) */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <details open>
            <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
              <span>⛰️ Phase 6: Peaks & Hills Detection</span>
              <span className="text-[10px] text-text-muted uppercase tracking-wide">detectCompositeShape (peak-first)</span>
            </summary>
            <div className="mt-2 text-xs space-y-2">
              {/* Thresholds */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                <div>
                  <div className="text-text-muted">Peak threshold</div>
                  <div className="font-mono">&gt;{(peaksAndHills.peakThreshold * 100).toFixed(0)}% support</div>
                </div>
                <div>
                  <div className="text-text-muted">Hill threshold</div>
                  <div className="font-mono">&gt;{(peaksAndHills.hillThreshold * 100).toFixed(0)}% support</div>
                </div>
                <div>
                  <div className="text-text-muted">Peaks found</div>
                  <div className="font-mono text-emerald-400">{peaksAndHills.peaks.length}</div>
                </div>
                <div>
                  <div className="text-text-muted">Hills found</div>
                  <div className="font-mono text-amber-400">{peaksAndHills.hills.length}</div>
                </div>
              </div>

              {/* Peaks list */}
              {peaksAndHills.peaks.length > 0 && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 mb-2">
                  <div className="text-[11px] font-semibold text-emerald-400 mb-2">
                    ⛰️ Peaks ({peaksAndHills.peaks.length}) — Claims with &gt;50% model support
                  </div>
                  <div className="space-y-1">
                    {peaksAndHills.peaks.slice(0, 8).map((p) => (
                      <div key={p.id} className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-emerald-400">{(p.supportRatio * 100).toFixed(0)}%</span>
                        <span className="truncate max-w-[300px]">{p.label}</span>
                      </div>
                    ))}
                    {peaksAndHills.peaks.length > 8 && (
                      <div className="text-text-muted">+{peaksAndHills.peaks.length - 8} more peaks...</div>
                    )}
                  </div>
                </div>
              )}

              {/* Hills list */}
              {peaksAndHills.hills.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                  <div className="text-[11px] font-semibold text-amber-400 mb-2">
                    🏔️ Hills ({peaksAndHills.hills.length}) — Notable but not majority support
                  </div>
                  <div className="space-y-1">
                    {peaksAndHills.hills.slice(0, 5).map((h) => (
                      <div key={h.id} className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-amber-400">{(h.supportRatio * 100).toFixed(0)}%</span>
                        <span className="truncate max-w-[300px]">{h.label}</span>
                      </div>
                    ))}
                    {peaksAndHills.hills.length > 5 && (
                      <div className="text-text-muted">+{peaksAndHills.hills.length - 5} more hills...</div>
                    )}
                  </div>
                </div>
              )}

              {peaksAndHills.peaks.length === 0 && peaksAndHills.hills.length === 0 && (
                <div className="text-text-muted italic">No peaks or hills detected — sparse landscape.</div>
              )}
            </div>
          </details>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* PHASE 7: Composite Shape Classification */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <details>
            <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
              <span>🧱 Phase 7: Composite Shape</span>
              <span className="text-[10px] text-text-muted uppercase tracking-wide">primary shape + secondary patterns</span>
            </summary>
            <div className="mt-2 text-xs space-y-2">
              {/* Primary shape */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2">
                <div>
                  <div className="text-text-muted">Primary shape</div>
                  <div className="font-mono capitalize text-brand-400 text-sm">{primaryPattern}</div>
                </div>
                <div>
                  <div className="text-text-muted">Confidence</div>
                  <div className="font-mono">
                    {analysis.shape.confidence.toFixed(2)} {ratioBadge(analysis.shape.confidence)}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted">Signal strength</div>
                  <div className="font-mono">
                    {analysis.shape.signalStrength != null ? analysis.shape.signalStrength.toFixed(2) : signal.final.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Primary shape explanation */}
              <div className="bg-surface-highlight/30 rounded-lg p-3 mt-2">
                <div className="text-[11px] text-text-muted mb-1">Primary shape interpretation:</div>
                <div className="text-[11px]">
                  {primaryPattern === 'sparse' && "⚠️ Insufficient signal — not enough peaks to determine structure."}
                  {primaryPattern === 'convergent' && "✅ Consensus detected — peaks support each other or form unified floor."}
                  {primaryPattern === 'forked' && "⚔️ Genuine disagreement — peaks conflict with each other."}
                  {primaryPattern === 'constrained' && "⚖️ Tradeoff detected — peaks cannot be maximized simultaneously."}
                  {primaryPattern === 'parallel' && "📐 Independent dimensions — peaks exist on separate axes."}
                </div>
              </div>

              {/* Secondary patterns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t border-border-subtle/60">
                <div>
                  <div className="text-[11px] text-text-muted mb-1">Secondary patterns detected</div>
                  {secondaryPatterns.length > 0 ? (
                    <div className="space-y-1">
                      {secondaryPatterns.map((p, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className={clsx(
                            "px-1.5 py-0.5 rounded text-[10px] font-medium capitalize",
                            p.type === 'dissent' && "bg-yellow-500/20 text-yellow-400",
                            p.type === 'keystone' && "bg-purple-500/20 text-purple-400",
                            p.type === 'chain' && "bg-blue-500/20 text-blue-400",
                            p.type === 'fragile' && "bg-red-500/20 text-red-400",
                            p.type === 'challenged' && "bg-orange-500/20 text-orange-400",
                            p.type === 'conditional' && "bg-indigo-500/20 text-indigo-400",
                            p.type === 'orphaned' && "bg-slate-500/20 text-slate-400",
                          )}>
                            {p.type}
                          </span>
                          {p.severity && (
                            <span className="text-[10px] text-text-muted">({p.severity})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-text-muted">No secondary patterns detected.</div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] text-text-muted mb-1">Evidence list</div>
                  {(analysis.shape?.evidence ?? []).length > 0 ? (
                    <ul className="list-disc list-inside space-y-1">
                      {(analysis.shape?.evidence ?? []).map((e, idx) => (
                        <li key={idx} className="text-[11px]">{e}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-[11px] text-text-muted">No evidence provided.</div>
                  )}
                </div>
              </div>

              {/* Dissent voices (if DISSENT secondary pattern exists) */}
              {dissentVoices.length > 0 && (
                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 mt-2">
                  <div className="text-[11px] font-semibold text-yellow-400 mb-2">
                    📢 Dissent Voices — Minority views with potential insight
                  </div>
                  <div className="space-y-1">
                    {dissentVoices.slice(0, 5).map((v: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-yellow-400">
                          {v.supportRatio != null ? `${(v.supportRatio * 100).toFixed(0)}%` : '?'}
                        </span>
                        <span className="truncate max-w-[300px]">{v.label || v.id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>

          {/* ═══════════════════════════════════════════════════════════════════ */}
          {/* PHASE 8: Shape-Specific Data */}
          {/* ═══════════════════════════════════════════════════════════════════ */}
          <details>
            <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
              <span>📦 Phase 8: Shape-Specific Data</span>
              <span className="text-[10px] text-text-muted uppercase tracking-wide">pattern-specific builders</span>
            </summary>
            <div className="mt-2 text-xs space-y-2">
              {analysis.shape.data ? (
                <>
                  <div className="text-[11px] text-text-muted">
                    Pattern data type: {(analysis.shape.data as any).pattern || primaryPattern}
                  </div>
                  <pre className="text-[11px] leading-snug bg-surface border border-border-subtle rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(analysis.shape.data, null, 2)}
                  </pre>
                  {analysis.shape.transferQuestion && (
                    <div className="bg-brand-500/10 border border-brand-500/20 rounded-lg p-3">
                      <div className="text-[11px] font-semibold text-brand-400 mb-1">Transfer Question</div>
                      <div className="text-[11px]">{analysis.shape.transferQuestion}</div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-[11px] text-text-muted">No shape-specific data available.</div>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// CONCIERGE PIPELINE PANEL
// ============================================================================

interface ConciergePipelinePanelProps {
  state: SingularityOutputState;
  analysis: StructuralAnalysis | null;
  userMessage: string | null;
}

const ConciergePipelinePanel: React.FC<ConciergePipelinePanelProps> = ({ state, analysis, userMessage }) => {
  const [showPrompt, setShowPrompt] = useState(false);

  const pipeline: any = useMemo(() => {
    if (state.output?.pipeline) return state.output.pipeline;
    if (!analysis || !userMessage || !state.output) return null;

    try {
      // Stance selection is now implicit/universal in the prompt
      const selection = { stance: 'default' as const, reason: 'universal', confidence: 1.0 };

      // Build prompt without stance option
      const prompt = ConciergeService.buildConciergePrompt(userMessage, analysis, {});

      let leakageDetected = !!state.output.leakageDetected;
      let leakageViolations = state.output.leakageViolations || [];

      if ((!leakageViolations || leakageViolations.length === 0) && ConciergeService.detectMachineryLeakage && state.output.text) {
        const leak = ConciergeService.detectMachineryLeakage(state.output.text);
        leakageDetected = leak.leaked;
        leakageViolations = leak.violations || [];
      }

      return {
        userMessage,
        prompt,
        stance: selection.stance,
        stanceReason: selection.reason,
        stanceConfidence: selection.confidence,
        structuralShape: {
          primaryPattern: analysis.shape.primary,
          primary: analysis.shape.primary,
          patterns: analysis.shape.patterns || [],
          confidence: analysis.shape.confidence,
        },
        leakageDetected,
        leakageViolations,
      };
    } catch {
      return null;
    }
  }, [state.output, analysis, userMessage]);

  if (!state.output && !state.isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center opacity-70 text-xs text-text-muted">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          <div>No Singularity pipeline captured for this turn.</div>
        </div>
      </div>
    );
  }

  if (state.isLoading && !state.output) {
    return (
      <div className="w-full h-full flex items-center justify-center opacity-70 text-xs text-text-muted">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          <div>Running Concierge pipeline…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto relative custom-scrollbar p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🕳️</span>
          <div>
            <div className="text-sm font-semibold">Concierge Pipeline</div>
            <div className="text-xs text-text-muted">Stance, prompt, response, leakage for this turn</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowPrompt((v) => !v)}
          className="text-xs px-3 py-1.5 rounded-full border border-border-subtle hover:bg-surface-highlight/10"
        >
          {showPrompt ? "Hide Prompt" : "Show Prompt"}
        </button>
      </div>

      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
          <div>
            <div className="text-text-muted">Provider</div>
            <div className="font-mono text-[11px] truncate">
              {state.providerId || state.output?.providerId || "unknown"}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Timestamp</div>
            <div className="font-mono text-[11px]">
              {new Date(state.output?.timestamp || Date.now()).toLocaleTimeString()}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Leakage</div>
            <div className="font-mono text-[11px]">
              {state.output?.leakageDetected ? "Detected" : "None"}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Shape</div>
            <div className="font-mono text-[11px]">
              {pipeline?.structuralShape?.primary || "—"}
            </div>
          </div>
        </div>

        <details open className="bg-surface border border-border-subtle rounded-lg p-3">
          <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
            <span>Stance Selection</span>
          </summary>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
            <div>
              <div className="text-text-muted">Stance</div>
              <div className="font-mono">
                {pipeline?.stance || "default"}
              </div>
            </div>
            <div>
              <div className="text-text-muted">Reason</div>
              <div className="font-mono">
                {pipeline?.stanceReason || "n/a"}
              </div>
            </div>
            <div>
              <div className="text-text-muted">Confidence</div>
              <div className="font-mono">
                {pipeline?.stanceConfidence != null ? pipeline.stanceConfidence.toFixed(2) : "—"}
              </div>
            </div>
            <div>
              <div className="text-text-muted">Shape pattern</div>
              <div className="font-mono">
                {pipeline?.structuralShape?.primary || "—"}
                {(pipeline?.structuralShape?.patterns?.length ?? 0) > 0 && (
                  <span className="text-purple-400 ml-1">
                    +{pipeline.structuralShape.patterns.length}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Show secondary patterns if available */}
          {pipeline?.structuralShape?.patterns?.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border-subtle/60">
              <div className="text-text-muted text-[10px] mb-1">Secondary patterns:</div>
              <div className="flex flex-wrap gap-1">
                {pipeline.structuralShape.patterns.map((p: any, i: number) => (
                  <span key={i} className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] capitalize">
                    {p.type}
                  </span>
                ))}
              </div>
            </div>
          )}
        </details>

        {showPrompt && (
          <details open className="bg-surface border border-border-subtle rounded-lg p-3">
            <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
              <span>Concierge Prompt</span>
            </summary>
            <div className="mt-2">
              <pre className="text-[11px] leading-snug bg-surface-highlight/40 rounded-md p-3 overflow-x-auto">
                {pipeline?.prompt || "Prompt not captured for this turn."}
              </pre>
            </div>
          </details>
        )}

        <details className="bg-surface border border-border-subtle rounded-lg p-3">
          <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
            <span>Response & Leakage</span>
          </summary>
          <div className="mt-2 space-y-2 text-[11px]">
            <div>
              <div className="text-text-muted mb-1">Response snippet</div>
              <div className="font-mono whitespace-pre-wrap max-h-40 overflow-y-auto border border-border-subtle/60 rounded-md p-2">
                {(state.output?.text || "").slice(0, 800) || "No response text available."}
              </div>
            </div>
            <div>
              <div className="text-text-muted mb-1">Machinery leakage violations</div>
              {state.output?.leakageDetected && (state.output.leakageViolations || []).length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {(state.output.leakageViolations || []).map((v, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-mono"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-text-muted">No violations detected.</div>
              )}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
};

// ============================================================================
// OPTIONS PARSING - Handle both emoji-prefixed themes and "Theme:" headers
// ============================================================================

interface ParsedOption {
  title: string;
  description: string;
  citations: (number | string)[];
}

interface ParsedTheme {
  name: string;
  options: ParsedOption[];
}

/**
 * Build themes from claims - supports BOTH role-based AND type-based grouping
 * Role takes priority (anchor, challenger, supplement, branch) because it maps 
 * to structural significance, falling back to type for classification
 */
function buildThemesFromClaims(claims: any[]): ParsedTheme[] {
  if (!Array.isArray(claims) || claims.length === 0) return [];

  const themesByName = new Map<string, ParsedTheme>();

  const getThemeNameForClaim = (claim: any): string => {
    // First check for structural role (from peaks/hills analysis)
    const role = String(claim?.role || '').toLowerCase();
    if (role === 'anchor') return 'Anchors';
    if (role === 'challenger') return 'Challengers';
    if (role === 'supplement') return 'Supplements';
    if (role === 'branch') return 'Branches';

    // Fall back to claim type
    switch (claim.type) {
      case 'factual': return 'Facts';
      case 'prescriptive': return 'Recommendations';
      case 'conditional': return 'Conditions';
      case 'contested': return 'Contested';
      case 'speculative': return 'Possibilities';
      default: return 'Positions';
    }
  };

  for (const claim of claims) {
    if (!claim) continue;
    const themeName = getThemeNameForClaim(claim);
    if (!themesByName.has(themeName)) {
      themesByName.set(themeName, { name: themeName, options: [] });
    }
    const theme = themesByName.get(themeName)!;

    const rawId = claim.id != null ? String(claim.id) : '';
    const cleanId = rawId.replace(/^claim_?/i, "").trim();
    const formattedId = cleanId ? `#${cleanId}` : "";
    const rawLabel = typeof claim.label === 'string' ? claim.label : '';

    const titleParts: string[] = [];
    if (formattedId) titleParts.push(formattedId);
    if (rawLabel.trim()) titleParts.push(rawLabel.trim());
    const title = titleParts.length > 0 ? titleParts.join(' ') : 'Claim';

    const description = typeof claim.text === 'string' ? claim.text : '';
    const supporters = Array.isArray(claim.supporters) ? claim.supporters : [];

    theme.options.push({
      title,
      description,
      citations: supporters,
    });
  }

  return Array.from(themesByName.values());
}

/**
 * Parse raw options text into themes - RESTORED fallback parser
 * Handles:
 * - Emoji-prefixed themes: "📐 Architecture & Pipeline"
 * - "Theme:" prefix: "Theme: Defining the Interactive Role"
 * - Markdown headers as themes
 * - Bullet points with bold titles as options
 */
function parseOptionsIntoThemes(optionsText: string | null): ParsedTheme[] {
  if (!optionsText) return [];

  const lines = optionsText.split('\n');
  const themes: ParsedTheme[] = [];
  let currentTheme: ParsedTheme | null = null;

  const optionPattern = /^\s*[-*•]?\s*\*?\*?([^:*]+)\*?\*?:\s*(.*)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this is a theme header
    let isTheme = false;
    let themeName = '';

    // Check emoji-prefixed (starts with emoji)
    if (/^[\u{1F300}-\u{1FAD6}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(trimmed)) {
      isTheme = true;
      themeName = trimmed;
    }
    // Check "Theme:" prefix
    else if (/^Theme:\s*/i.test(trimmed)) {
      isTheme = true;
      themeName = trimmed.replace(/^Theme:\s*/i, '').trim();
    }
    // Check markdown header that doesn't look like an option
    else if (/^#+\s*/.test(trimmed) && !optionPattern.test(trimmed)) {
      isTheme = true;
      themeName = trimmed.replace(/^#+\s*/, '').trim();
    }

    if (isTheme && themeName) {
      currentTheme = { name: themeName, options: [] };
      themes.push(currentTheme);
      continue;
    }

    // Check if this is an option item
    const optionMatch = trimmed.match(/^\s*[-*•]?\s*\*{0,2}([^:]+?)\*{0,2}:\s*(.+)$/);
    if (optionMatch && currentTheme) {
      const title = optionMatch[1].trim().replace(/^\*\*|\*\*$/g, '');
      const rest = optionMatch[2].trim();

      // Extract citation numbers [1], [2, 3], etc.
      const citations: number[] = [];
      const citationMatches = rest.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g);
      for (const cm of citationMatches) {
        const nums = cm[1].split(/\s*,\s*/).map(n => parseInt(n.trim(), 10));
        citations.push(...nums.filter(n => !isNaN(n)));
      }

      // Remove citations from description
      const description = rest.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '').trim();

      currentTheme.options.push({ title, description, citations });
    } else if (currentTheme && currentTheme.options.length > 0) {
      // Continuation of previous option description
      const lastOption = currentTheme.options[currentTheme.options.length - 1];
      lastOption.description += ' ' + trimmed.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '').trim();
    }
  }

  // If no themes were detected, create a default theme
  if (themes.length === 0 && optionsText.trim()) {
    const defaultTheme: ParsedTheme = { name: 'Options', options: [] };
    for (const line of lines) {
      const optionMatch = line.trim().match(/^\s*[-*•]?\s*\*{0,2}([^:]+?)\*{0,2}:\s*(.+)$/);
      if (optionMatch) {
        const title = optionMatch[1].trim().replace(/^\*\*|\*\*$/g, '');
        const rest = optionMatch[2].trim();
        const citations: number[] = [];
        const citationMatches = rest.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g);
        for (const cm of citationMatches) {
          const nums = cm[1].split(/\s*,\s*/).map(n => parseInt(n.trim(), 10));
          citations.push(...nums.filter(n => !isNaN(n)));
        }
        const description = rest.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '').trim();
        defaultTheme.options.push({ title, description, citations });
      }
    }
    if (defaultTheme.options.length > 0) {
      themes.push(defaultTheme);
    }
  }

  return themes;
}

// ============================================================================
// NARRATIVE EXTRACTION - Find paragraphs containing canonical label
// ============================================================================

function extractNarrativeExcerpt(narrativeText: string, label: string): string {
  if (!narrativeText || !label) return '';

  const paragraphs = narrativeText.split(/\n\n+/);
  const matchingParagraphs: string[] = [];
  const labelLower = label.toLowerCase();

  for (const para of paragraphs) {
    if (para.toLowerCase().includes(labelLower)) {
      const highlighted = para.replace(
        new RegExp(`(${escapeRegex(label)})`, 'gi'),
        '**$1**'
      );
      matchingParagraphs.push(highlighted);
    }
  }

  return matchingParagraphs.join('\n\n');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tryParseJsonObject(text: string): any | null {
  if (!text) return null;
  let t = String(text).trim();
  const codeBlockMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) t = codeBlockMatch[1].trim();
  const firstBrace = t.indexOf('{');
  const lastBrace = t.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(t.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function normalizeGraphTopologyCandidate(value: any): any | null {
  if (!value) return null;
  let candidate: any = value;
  if (typeof candidate === 'string') {
    candidate = tryParseJsonObject(candidate);
  }
  if (!candidate || typeof candidate !== 'object') return null;
  if (Array.isArray(candidate.nodes) && Array.isArray(candidate.edges)) return candidate;
  if (candidate.topology && Array.isArray(candidate.topology.nodes) && Array.isArray(candidate.topology.edges)) return candidate.topology;
  if (candidate.graphTopology && Array.isArray(candidate.graphTopology.nodes) && Array.isArray(candidate.graphTopology.edges)) return candidate.graphTopology;
  return null;
}

// ============================================================================
// SUPPORTER ORBS COMPONENT
// ============================================================================

interface SupporterOrbsProps {
  supporters: (string | number)[];
  citationSourceOrder?: Record<string | number, string>;
  onOrbClick?: (providerId: string) => void;
  size?: 'small' | 'large';
}

const SupporterOrbs: React.FC<SupporterOrbsProps> = ({ supporters, citationSourceOrder, onOrbClick, size = 'large' }) => {
  const getProviderFromSupporter = (s: string | number) => {
    if ((typeof s === 'number' || !isNaN(Number(s))) && citationSourceOrder) {
      const num = Number(s);
      const providerId = citationSourceOrder[num];
      if (providerId) {
        return getProviderConfig(providerId) || null;
      }
    }
    if (typeof s === 'string' && isNaN(Number(s))) {
      return getProviderConfig(s) || null;
    }
    return null;
  };

  const getInitials = (name: string) => {
    const words = name.split(/\s+/);
    if (words.length === 1) return name.slice(0, 2).toUpperCase();
    return words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
  };

  const orbSize = size === 'large' ? 40 : 28;

  return (
    <div className="flex gap-2 flex-wrap">
      {supporters.map((s, idx) => {
        const provider = getProviderFromSupporter(s);
        const color = getProviderColor(provider?.id || 'default');
        const name = provider?.name || `Model ${s}`;
        const initials = getInitials(name);

        return (
          <button
            key={idx}
            type="button"
            className="decision-orb-badge"
            style={{
              '--orb-color': color,
              width: orbSize,
              height: orbSize,
              fontSize: size === 'large' ? 11 : 9
            } as React.CSSProperties}
            onClick={() => onOrbClick?.(provider?.id || String(s))}
            title={name}
          >
            <span>{initials}</span>
          </button>
        );
      })}
    </div>
  );
};

// ============================================================================
// OPTIONS TAB - COLLAPSIBLE THEME SECTIONS
// ============================================================================

interface OptionsTabProps {
  themes: ParsedTheme[];
  citationSourceOrder?: Record<number, string>;
  onCitationClick: (num: number | string) => void;
  mapperAudit?: { complete: boolean; unlistedOptions: Array<{ title: string; description: string; source: string }>; };
}

const OptionsTab: React.FC<OptionsTabProps> = ({ themes, citationSourceOrder, onCitationClick, mapperAudit }) => {
  const [expandedThemes, setExpandedThemes] = useState<Set<number>>(new Set([0]));

  const toggleTheme = (idx: number) => {
    setExpandedThemes(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  if (themes.length === 0) {
    return <div className="text-text-muted text-sm p-4">No options available.</div>;
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      {mapperAudit && (
        <div className="mb-4 bg-surface rounded-lg border border-border-subtle p-3">
          {mapperAudit.complete ? (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <span>✓</span>
              <span>Mapper coverage complete — all approaches represented</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-amber-600 text-sm">
                <span>⚠</span>
                <span className="font-medium">{mapperAudit.unlistedOptions.length} unlisted options found</span>
              </div>
              {mapperAudit.unlistedOptions.length > 0 && (
                <ul className="text-xs text-text-secondary space-y-1 pl-4">
                  {mapperAudit.unlistedOptions.map((opt, idx) => (
                    <li key={idx}><strong>{opt.title}</strong>: {opt.description}{opt.source ? (<span className="text-text-muted"> — {opt.source}</span>) : null}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {themes.map((theme, tIdx) => (
        <div key={tIdx} className="options-theme-section">
          <div
            className="options-theme-header"
            onClick={() => toggleTheme(tIdx)}
          >
            <span className="options-theme-title">{theme.name}</span>
            <svg
              className={clsx("options-theme-chevron w-5 h-5", expandedThemes.has(tIdx) && "expanded")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {expandedThemes.has(tIdx) && (
            <div className="options-theme-content">
              {theme.options.map((opt, oIdx) => (
                <div key={oIdx} className="option-card">
                  <div className="option-card-title">{opt.title}</div>
                  <div className="option-card-description">{opt.description}</div>
                  {opt.citations.length > 0 && (
                    <div className="option-card-supporters">
                      <SupporterOrbs
                        supporters={opt.citations}
                        citationSourceOrder={citationSourceOrder}
                        onOrbClick={(providerId) => onCitationClick(providerId)}
                        size="small"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// DETAIL VIEW COMPONENT
// ============================================================================

interface DetailViewProps {
  node: { id: string; label: string; supporters: (string | number)[]; theme?: string };
  narrativeExcerpt: string;
  citationSourceOrder?: Record<number, string>;
  onBack: () => void;
  onOrbClick: (providerId: string) => void;
  structural: any | null;
}

const DetailView: React.FC<DetailViewProps> = ({ node, narrativeExcerpt, citationSourceOrder, onBack, onOrbClick, structural }) => {
  const getNodeColor = () => {
    if (!node.supporters || node.supporters.length === 0) return '#8b5cf6';
    const first = node.supporters[0];
    let providerId: string | undefined;

    if ((typeof first === 'number' || !isNaN(Number(first))) && citationSourceOrder) {
      providerId = citationSourceOrder[Number(first)];
    } else if (typeof first === 'string' && isNaN(Number(first))) {
      providerId = first;
    }

    return getProviderColor(providerId || 'default');
  };

  const nodeColor = getNodeColor();

  const structuralInsights = React.useMemo(() => {
    if (!structural) return [];

    const insights: Array<{ type: any; metadata: any }> = [];

    const leverageInversion = structural.patterns.leverageInversions.find((inv: any) => inv.claimId === node.id);

    if (leverageInversion && leverageInversion.reason === "singular_foundation") {
      const cascade = structural.patterns.cascadeRisks.find((r: any) => r.sourceId === node.id);
      insights.push({
        type: "fragile_foundation",
        metadata: {
          dependentCount: leverageInversion.affectedClaims.length,
          dependentLabels: cascade?.dependentLabels || [],
        },
      });
    }

    const claimWithLeverage = structural.claimsWithLeverage.find((c: any) => c.id === node.id);
    if (claimWithLeverage && claimWithLeverage.leverage > 8) {
      const cascade = structural.patterns.cascadeRisks.find((r: any) => r.sourceId === node.id);
      if (cascade && cascade.dependentIds.length >= 3) {
        insights.push({
          type: "keystone",
          metadata: {
            dependentCount: cascade.dependentIds.length,
            dependentLabels: cascade.dependentLabels,
          },
        });
      }
    }

    const conflict = structural.patterns.conflicts.find(
      (c: any) =>
        (c.claimA.id === node.id || c.claimB.id === node.id) && c.isBothConsensus
    );
    if (conflict) {
      const otherClaim = conflict.claimA.id === node.id ? conflict.claimB : conflict.claimA;
      insights.push({
        type: "consensus_conflict",
        metadata: {
          conflictsWith: otherClaim.label,
        },
      });
    }

    if (leverageInversion && leverageInversion.reason === "high_connectivity_low_support") {
      insights.push({
        type: "high_leverage_singular",
        metadata: {
          leverageScore: claimWithLeverage?.leverage,
        },
      });
    }

    const cascade = structural.patterns.cascadeRisks.find((r: any) => r.sourceId === node.id);
    if (cascade && cascade.depth >= 3) {
      insights.push({
        type: "cascade_risk",
        metadata: {
          dependentCount: cascade.dependentIds.length,
          cascadeDepth: cascade.depth,
          dependentLabels: cascade.dependentLabels,
        },
      });
    }

    if (claimWithLeverage && claimWithLeverage.isEvidenceGap) {
      const gapCascade = structural.patterns.cascadeRisks.find((r: any) => r.sourceId === node.id);
      insights.push({
        type: "evidence_gap",
        metadata: {
          gapScore: claimWithLeverage.evidenceGapScore,
          dependentCount: gapCascade?.dependentIds.length || 0,
          dependentLabels: gapCascade?.dependentLabels || [],
        },
      });
    }

    if (claimWithLeverage && claimWithLeverage.isOutlier) {
      insights.push({
        type: "support_outlier",
        metadata: {
          skew: claimWithLeverage.supportSkew,
          supporterCount: node.supporters.length,
        },
      });
    }

    return insights;
  }, [node.id, node.supporters.length, structural]);

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="h-full flex flex-col p-6 overflow-y-auto"
    >
      <button
        type="button"
        className="decision-back-btn self-start mb-6"
        onClick={onBack}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Graph
      </button>

      <div className="flex flex-col items-center mb-8">
        <div
          className="w-[120px] h-[120px] rounded-full mb-4 flex items-center justify-center"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${nodeColor}88, ${nodeColor}22)`,
            boxShadow: `0 0 40px ${nodeColor}44`,
            border: `2px solid ${nodeColor}88`
          }}
        >
          <span className="text-2xl font-bold text-white text-center px-2" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
            {node.label.length > 20 ? node.label.slice(0, 20) + '…' : node.label}
          </span>
        </div>

        <h2
          className="decision-detail-header"
          style={{ color: nodeColor }}
        >
          {node.label}
        </h2>

        {node.theme && (
          <span className="text-sm text-text-muted mt-2">{node.theme}</span>
        )}
      </div>

      <div className="mb-8">
        <h3 className="text-sm font-medium text-text-muted mb-3">Supported by</h3>
        <SupporterOrbs
          supporters={node.supporters || []}
          citationSourceOrder={citationSourceOrder}
          onOrbClick={onOrbClick}
          size="large"
        />
      </div>

      {structuralInsights.length > 0 && (
        <div className="mb-8 space-y-3">
          <h3 className="text-sm font-medium text-text-muted mb-3">Structural Analysis</h3>
          {structuralInsights.map((insight, idx) => (
            <StructuralInsight
              key={idx}
              type={insight.type}
              claim={node}
              metadata={insight.metadata}
            />
          ))}
        </div>
      )}

      {narrativeExcerpt && (
        <div className="flex-1">
          <h3 className="text-sm font-medium text-text-muted mb-3">From the Narrative</h3>
          <div className="narrative-highlight">
            <MarkdownDisplay content={narrativeExcerpt} />
          </div>
        </div>
      )}

      {!narrativeExcerpt && (
        <div className="text-text-muted text-sm italic">
          No matching narrative excerpt found for this option.
        </div>
      )}
    </m.div>
  );
};

// ============================================================================
// MAPPER SELECTOR COMPONENT
// ============================================================================

interface MapperSelectorProps {
  aiTurn: AiTurn;
  activeProviderId?: string;
}

const MapperSelector: React.FC<MapperSelectorProps> = ({ aiTurn, activeProviderId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { handleClipClick } = useClipActions();
  const authStatus = useAtomValue(providerAuthStatusAtom);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const activeProvider = activeProviderId ? getProviderConfig(activeProviderId) : null;
  const providers = useMemo(() => LLM_PROVIDERS_CONFIG.filter(p => p.id !== 'system'), []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-sm font-medium text-text-primary"
      >
        <span className="text-base">🧩</span>
        <span className="opacity-70 text-xs uppercase tracking-wide">Mapper</span>
        <span className="w-px h-3 bg-white/20 mx-1" />
        <span className={clsx(!activeProvider && "text-text-muted italic")}>
          {activeProvider?.name || "Select Model"}
        </span>
        <svg
          className={clsx("w-3 h-3 text-text-muted transition-transform", isOpen && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-surface-raised border border-border-subtle rounded-xl shadow-elevated overflow-hidden z-[3600] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-2 grid gap-1">
            {providers.map(p => {
              const pid = String(p.id);
              const isUnauthorized = authStatus && authStatus[pid] === false;
              const isDisabled = isUnauthorized;

              return (
                <button key={pid} onClick={() => { if (!isDisabled) { handleClipClick(aiTurn.id, "mapping", pid); setIsOpen(false); } }} disabled={isDisabled} className={clsx("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors", pid === activeProviderId ? "bg-brand-500/10 text-brand-500" : "hover:bg-surface-highlight text-text-secondary", isDisabled && "opacity-60 cursor-not-allowed")}>
                  <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: getProviderColor(pid) }} />
                  <span className="flex-1 text-xs font-medium">{p.name}</span>
                  {pid === activeProviderId && <span>✓</span>}
                  {isUnauthorized && <span>🔒</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const SingularitySelector: React.FC<{ aiTurn: AiTurn, activeProviderId?: string, onSelect: (pid: string) => void }> = ({ aiTurn, activeProviderId, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { handleClipClick } = useClipActions();
  const authStatus = useAtomValue(providerAuthStatusAtom);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const activeProvider = activeProviderId ? getProviderConfig(activeProviderId) : null;
  const providers = useMemo(() => LLM_PROVIDERS_CONFIG.filter(p => p.id !== 'system'), []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-sm font-medium text-text-primary"
      >
        <span className="text-base">🕳️</span>
        <span className="opacity-70 text-xs uppercase tracking-wide">Concierge</span>
        <span className="w-px h-3 bg-white/20 mx-1" />
        <span className={clsx(!activeProvider && "text-text-muted italic")}>
          {activeProvider?.name || "Select Model"}
        </span>
        <svg
          className={clsx("w-3 h-3 text-text-muted transition-transform", isOpen && "rotate-180")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-surface-raised border border-border-subtle rounded-xl shadow-elevated overflow-hidden z-[3600] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-2 grid gap-1">
            {providers.map(p => {
              const pid = String(p.id);
              const isActive = pid === activeProviderId;
              const isUnauthorized = authStatus && authStatus[pid] === false;
              const latestResp = getLatestResponse(aiTurn.singularityResponses?.[pid]);
              const hasError = latestResp?.status === 'error';
              const errorMessage = hasError ? (latestResp?.meta?._rawError || "Failed") : null;
              const isDisabled = isUnauthorized;

              return (
                <button
                  key={pid}
                  onClick={() => { if (!isDisabled) { onSelect(pid); handleClipClick(aiTurn.id, "singularity", pid); setIsOpen(false); } }}
                  disabled={isDisabled}
                  className={clsx(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors relative group",
                    isActive ? "bg-brand-500/10 text-brand-500" : "hover:bg-surface-highlight text-text-secondary",
                    (isDisabled || hasError) && "opacity-60",
                    isDisabled && "cursor-not-allowed",
                  )}
                  title={errorMessage && typeof errorMessage === 'string' ? errorMessage : undefined}
                >
                  <div
                    className="w-2 h-2 rounded-full shadow-sm"
                    style={{ backgroundColor: getProviderColor(pid) }}
                  />
                  <div className="flex-1 flex flex-col">
                    <span className="text-xs font-medium">{p.name}</span>
                  </div>
                  {hasError && (
                    <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:block z-50 w-48 bg-black/90 text-white text-[10px] p-2 rounded shadow-lg pointer-events-none">
                      {typeof errorMessage === 'string' ? errorMessage : "Previous generation failed"}
                    </div>
                  )}
                  {isActive && <span>✓</span>}
                  {isUnauthorized && <span>🔒</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const DecisionMapSheet = React.memo(() => {
  const [openState, setOpenState] = useAtom(isDecisionMapOpenAtom);
  const turnGetter = useAtomValue(turnByIdAtom);
  const mappingProvider = useAtomValue(mappingProviderAtom);
  const singularityProvider = useAtomValue(singularityProviderAtom);
  const setSingularityProvider = useSetAtom(singularityProviderAtom);
  const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);

  const [activeTab, setActiveTab] = useState<'graph' | 'narrative' | 'options' | 'debug' | 'concierge'>('graph');
  const [selectedNode, setSelectedNode] = useState<{ id: string; label: string; supporters: (string | number)[]; theme?: string } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: window.innerWidth, h: 400 });
  const activeSingularityPid = singularityProvider;
  const [sheetHeightRatio, setSheetHeightRatio] = useState(0.5);
  const [structuralAnalysis, setStructuralAnalysis] = useState<StructuralAnalysis | null>(null);
  const [structuralTurnId, setStructuralTurnId] = useState<string | null>(null);
  const [structuralLoading, setStructuralLoading] = useState(false);
  const resizeRef = useRef<{ active: boolean; startY: number; startRatio: number; moved: boolean }>({
    active: false,
    startY: 0,
    startRatio: 0.5,
    moved: false,
  });

  useEffect(() => {
    if (openState) {
      setActiveTab('graph');
      setSelectedNode(null);
      setSheetHeightRatio(0.5);
    }
  }, [openState?.turnId]);

  useEffect(() => {
    if (!openState?.turnId) {
      setStructuralAnalysis(null);
      setStructuralTurnId(null);
      setStructuralLoading(false);
      return;
    }
    if (structuralTurnId && structuralTurnId !== openState.turnId) {
      setStructuralAnalysis(null);
      setStructuralTurnId(null);
      setStructuralLoading(false);
    }
  }, [openState?.turnId, structuralTurnId]);

  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const min = 0.25;
    const max = 0.9;
    resizeRef.current = { active: true, startY: e.clientY, startRatio: sheetHeightRatio, moved: false };

    const onMove = (ev: PointerEvent) => {
      if (!resizeRef.current.active) return;
      const delta = resizeRef.current.startY - ev.clientY;
      if (Math.abs(delta) > 4) resizeRef.current.moved = true;
      const next = resizeRef.current.startRatio + delta / Math.max(1, window.innerHeight);
      const clamped = Math.min(max, Math.max(min, next));
      setSheetHeightRatio(clamped);
    };

    const onUp = () => {
      const moved = resizeRef.current.moved;
      resizeRef.current.active = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!moved) setOpenState(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [setOpenState, sheetHeightRatio]);

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (el) {
        setDims({ w: el.clientWidth, h: el.clientHeight });
      } else {
        setDims({ w: window.innerWidth, h: Math.floor(window.innerHeight * sheetHeightRatio) - 100 });
      }
    };

    update();
    const raf = requestAnimationFrame(update);
    const timeout = setTimeout(update, 350);

    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [openState, sheetHeightRatio]);

  const aiTurn: AiTurn | null = useMemo(() => {
    const tid = openState?.turnId;
    const t = tid ? turnGetter(tid) : undefined;
    return t && (t as any).type === 'ai' ? (t as AiTurn) : null;
  }, [openState, turnGetter]);

  const singularityState = useSingularityOutput(aiTurn?.id || null);

  const userMessage = useMemo(() => {
    if (!aiTurn?.userTurnId) return null;
    const t = turnGetter(aiTurn.userTurnId);
    if (!t || (t as any).type !== 'user') return null;
    return (t as any).text || "";
  }, [aiTurn?.userTurnId, turnGetter]);

  const mappingResponses = useMemo(() => {
    const out: Record<string, ProviderResponse[]> = {};
    LLM_PROVIDERS_CONFIG.forEach((p) => (out[String(p.id)] = []));
    if (!aiTurn) return out;
    const map = aiTurn.mappingResponses || {};
    Object.entries(map).forEach(([pid, resp]) => {
      out[pid] = normalizeResponseArray(resp);
    });
    return out;
  }, [aiTurn?.id, aiTurn?.mappingVersion]);

  const activeMappingPid = useMemo(() => {
    if (!aiTurn) return undefined;
    const availableKeys = Object.keys(aiTurn.mappingResponses || {});
    const hasData = (pid: string | undefined) => {
      if (!pid) return false;
      return (mappingResponses[pid]?.length || 0) > 0;
    };

    if (mappingProvider && hasData(mappingProvider)) return mappingProvider;
    if (aiTurn.meta?.mapper && hasData(aiTurn.meta.mapper)) return aiTurn.meta.mapper;

    const firstWithData = availableKeys.find((k) => hasData(k));
    if (firstWithData) return firstWithData;
    return availableKeys.length > 0 ? availableKeys[0] : undefined;
  }, [aiTurn, mappingProvider, mappingResponses]);

  const latestMapping = useMemo(() => {
    if (!activeMappingPid) return undefined;
    return getLatestResponse(mappingResponses[activeMappingPid]);
  }, [activeMappingPid, mappingResponses]);

  const parsedMapping = useMemo(() => {
    const fromMeta = String((latestMapping?.meta as any)?.rawMappingText || '');
    const fromText = String(latestMapping?.text || '');
    const rawText =
      fromMeta && fromMeta.length >= fromText.length ? fromMeta : fromText;
    return parseUnifiedMapperOutput(String(rawText));
  }, [latestMapping]);

  const graphTopology = useMemo(() => {
    const meta: any = latestMapping?.meta || null;
    const fromMeta =
      normalizeGraphTopologyCandidate(meta?.graphTopology) ||
      normalizeGraphTopologyCandidate(meta?.graph_topology) ||
      normalizeGraphTopologyCandidate(meta?.topology) ||
      null;
    const fromParsed = normalizeGraphTopologyCandidate(parsedMapping.topology) || null;
    const picked = fromMeta || fromParsed || null;
    decisionMapSheetDbg("graphTopology source", {
      fromMeta: Boolean(fromMeta),
      fromParsed: Boolean(fromParsed),
      nodes: picked ? (picked as any)?.nodes?.length : 0,
      edges: picked ? (picked as any)?.edges?.length : 0,
    });
    return picked;
  }, [latestMapping, parsedMapping.topology]);

  const graphData = useMemo(() => {
    const claimsFromMap = Array.isArray(parsedMapping.map?.claims) ? parsedMapping.map!.claims : null;
    const edgesFromMap = Array.isArray(parsedMapping.map?.edges) ? parsedMapping.map!.edges : null;

    const claims = claimsFromMap || (Array.isArray(parsedMapping.claims) ? parsedMapping.claims : []);
    const edges = edgesFromMap || (Array.isArray(parsedMapping.edges) ? parsedMapping.edges : []);

    if (claims.length > 0 || edges.length > 0) {
      decisionMapSheetDbg("graphData source", {
        source: claimsFromMap || edgesFromMap ? "map" : "parsed",
        claims: claims.length,
        edges: edges.length,
      });
      return { claims, edges };
    }

    decisionMapSheetDbg("graphData source", {
      source: "topology",
      claims: 0,
      edges: 0,
    });
    return adaptGraphTopology(graphTopology);
  }, [parsedMapping, graphTopology]);

  const artifactForStructure = useMemo(() => {
    const artifact =
      (aiTurn as any)?.mapperArtifact ||
      (parsedMapping as any)?.artifact ||
      (graphData.claims.length > 0 || graphData.edges.length > 0
        ? {
          claims: graphData.claims,
          edges: graphData.edges,
          ghosts: Array.isArray((parsedMapping as any)?.ghosts) ? (parsedMapping as any).ghosts : null,
          query: (latestMapping as any)?.meta?.query || null,
        }
        : null);

    if (!artifact || !Array.isArray((artifact as any).claims) || (artifact as any).claims.length === 0) return null;
    return artifact;
  }, [aiTurn, parsedMapping, graphData, latestMapping]);

  useEffect(() => {
    if (activeTab !== 'debug' && activeTab !== 'concierge') return;
    if (!artifactForStructure || !openState?.turnId) return;
    if (structuralTurnId === openState.turnId && structuralAnalysis) return;
    let cancelled = false;
    setStructuralLoading(true);

    // Defer heavy computation to next tick
    setTimeout(() => {
      if (cancelled) return;
      try {
        const analysis = computeStructuralAnalysis(artifactForStructure as any);
        if (!cancelled) {
          setStructuralAnalysis(analysis);
          setStructuralTurnId(openState.turnId);
        }
      } catch (e) {
        console.warn("[DecisionMapSheet] structuralAnalysis compute failed", e);
        if (!cancelled) {
          setStructuralAnalysis(null);
          setStructuralTurnId(openState.turnId);
        }
      } finally {
        if (!cancelled) {
          setStructuralLoading(false);
        }
      }
    }, 0);

    return () => {
      cancelled = true;
    };

  }, [activeTab, artifactForStructure, openState?.turnId, structuralTurnId, structuralAnalysis]);

  const problemStructure = useMemo(() => {
    if (!artifactForStructure) return null;
    try {
      const structure = computeProblemStructureFromArtifact(artifactForStructure as any);
      decisionMapSheetDbg("problemStructure", structure);
      return structure;
    } catch (e) {
      console.warn("[DecisionMapSheet] problemStructure compute failed", e);
      return null;
    }
  }, [artifactForStructure]);

  const claimThemes = useMemo(() => {
    if (!artifactForStructure || !Array.isArray((artifactForStructure as any).claims)) return [];
    return buildThemesFromClaims((artifactForStructure as any).claims);
  }, [artifactForStructure]);

  const mappingText = useMemo(() => {
    return parsedMapping.narrative || '';
  }, [parsedMapping.narrative]);

  const optionsText = useMemo(() => {
    const meta: any = latestMapping?.meta || null;
    let fromMeta = meta?.allAvailableOptions || meta?.all_available_options || meta?.options || null;
    if (fromMeta) {
      return fromMeta;
    }
    return parsedMapping.options ?? null;
  }, [latestMapping, parsedMapping.options]);

  // Options now built directly from claims - no separate parsing needed, but fallback to text parsing if needed
  const parsedThemes = useMemo(() => {
    if (claimThemes.length > 0) return claimThemes;
    return parseOptionsIntoThemes(optionsText);
  }, [claimThemes, optionsText]);

  // Extract citation source order from mapping metadata for correct citation-to-model mapping
  const citationSourceOrder = useMemo(() => {
    const metaOrder = latestMapping?.meta?.citationSourceOrder || null;
    if (metaOrder && typeof metaOrder === 'object') {
      return metaOrder as Record<string | number, string>;
    }
    // Fallback: build from active batch responses in order
    if (aiTurn) {
      const activeOrdered = LLM_PROVIDERS_CONFIG.map((p) => String(p.id)).filter((pid) => !!(aiTurn.batchResponses || {})[pid]);
      const order: Record<number, string> = {};
      activeOrdered.forEach((pid, idx) => {
        order[idx + 1] = pid;
      });
      return order;
    }
    return undefined;
  }, [latestMapping, aiTurn]);

  const handleCitationClick = useCallback((modelNumber: number | string) => {
    try {
      let providerId: string | undefined;
      const metaOrder = latestMapping?.meta?.citationSourceOrder || null;

      const isNumeric = typeof modelNumber === 'number' || (!isNaN(parseInt(modelNumber, 10)) && /^\d+$/.test(modelNumber));

      if (isNumeric) {
        const num = typeof modelNumber === 'number' ? modelNumber : parseInt(modelNumber, 10);
        if (metaOrder && typeof metaOrder === 'object') {
          providerId = (metaOrder as any)[num];
        }
        if (!providerId && aiTurn) {
          const activeOrdered = LLM_PROVIDERS_CONFIG.map((p) => String(p.id)).filter((pid) => !!(aiTurn.batchResponses || {})[pid]);
          providerId = activeOrdered[num - 1];
        }
      } else if (typeof modelNumber === 'string') {
        providerId = normalizeProviderId(modelNumber.toLowerCase());
      }

      if (!providerId || !aiTurn) return;
      setActiveSplitPanel({ turnId: aiTurn.id, providerId });
    } catch { }
  }, [latestMapping, aiTurn, setActiveSplitPanel]);

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode({
      id: node.id,
      label: node.label,
      supporters: node.supporters || [],
      theme: node.type || node.theme
    });
  }, []);

  const handleDetailOrbClick = useCallback((providerId: string) => {
    if (!aiTurn) return;
    setActiveSplitPanel({ turnId: aiTurn.id, providerId });
  }, [aiTurn, setActiveSplitPanel]);

  const narrativeExcerpt = useMemo(() => {
    if (!selectedNode) return '';
    return extractNarrativeExcerpt(mappingText, selectedNode.label);
  }, [selectedNode, mappingText]);

  const markdownComponents = useMemo(() => ({
    a: ({ href, children, ...props }: any) => {
      if (href && href.startsWith("#cite-")) {
        const idStr = href.replace("#cite-", "");
        const num = parseInt(idStr, 10);
        return (
          <button
            type="button"
            className="citation-link"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCitationClick(num);
            }}
            title={`View Source ${idStr}`}
          >
            [{children}]
          </button>
        );
      }
      return (
        <a href={href} {...props} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300 underline decoration-brand-400/30 hover:decoration-brand-400 transition-colors">
          {children}
        </a>
      );
    },
  }), [handleCitationClick]);

  const transformCitations = useCallback((text: string) => {
    if (!text) return "";
    let t = text;
    t = t.replace(/\[\[CITE:(\d+)\]\]/gi, "[↗$1](#cite-$1)");
    t = t.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/gi, (_m, grp) => {
      const items = String(grp)
        .split(/\s*,\s*/)
        .map((n) => n.trim())
        .filter(Boolean);
      return " " + items.map((n) => `[↗${n}](#cite-${n})`).join(" ") + " ";
    });
    return t;
  }, []);

  const tabConfig = [
    { key: 'graph' as const, label: 'Graph', activeClass: 'decision-tab-active-graph' },
    { key: 'narrative' as const, label: 'Narrative', activeClass: 'decision-tab-active-narrative' },
    { key: 'options' as const, label: 'Options', activeClass: 'decision-tab-active-options' },
    { key: 'debug' as const, label: '🔬 Structural Analysis Debug', activeClass: 'decision-tab-active-options' },
    { key: 'concierge' as const, label: 'Concierge Pipeline', activeClass: 'decision-tab-active-singularity' }
  ];

  const sheetHeightPx = Math.max(260, Math.round(window.innerHeight * sheetHeightRatio));

  return (
    <AnimatePresence>
      {openState && (
        <LazyMotion features={domAnimation}>
          <m.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 decision-sheet-bg border-t border-border-strong shadow-elevated z-[3500] rounded-t-2xl flex flex-col pointer-events-auto"
            style={{ height: sheetHeightPx }}
          >
            {/* Drag handle */}
            <div className="h-8 flex items-center justify-center border-b border-white/10 hover:bg-white/5 transition-colors rounded-t-2xl relative z-10">
              <div className="flex-1 h-full cursor-ns-resize" onPointerDown={handleResizePointerDown} />
              <button type="button" className="h-full px-6 cursor-pointer flex items-center justify-center" onClick={() => setOpenState(null)}>
                <div className="w-12 h-1.5 bg-white/20 rounded-full" />
              </button>
              <div className="flex-1 h-full cursor-ns-resize" onPointerDown={handleResizePointerDown} />
            </div>

            {/* Header Row: Mapper Selector (Left) + Tabs (Center) */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 relative z-20">

              {/* Left: Provider Selector (Mapper or Refiner based on tab) */}
              <div className="w-1/3 flex justify-start">
                {aiTurn && activeTab !== 'concierge' && (
                  <MapperSelector
                    aiTurn={aiTurn}
                    activeProviderId={activeMappingPid}
                  />
                )}
                {aiTurn && activeTab === 'concierge' && (
                  <SingularitySelector
                    aiTurn={aiTurn}
                    activeProviderId={activeSingularityPid || undefined}
                    onSelect={(pid) => setSingularityProvider(pid as any)}
                  />
                )}
              </div>

              {/* Center: Tabs */}
              <div className="flex items-center justify-center gap-4">
                {tabConfig.map(({ key, label, activeClass }) => {
                  return (
                    <button
                      key={key}
                      type="button"
                      className={clsx(
                        "decision-tab-pill",
                        activeTab === key && activeClass
                      )}
                      onClick={() => {
                        setActiveTab(key);
                        if (key !== 'graph') setSelectedNode(null);
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Right: Spacer/Close (keeps tabs centered) */}
              <div className="w-1/3 flex justify-end items-center gap-2">
                <CopyButton
                  text={formatDecisionMapForMd(
                    mappingText,
                    graphData.claims,
                    graphData.edges,
                    graphTopology
                  )}
                  label="Copy full decision map"
                  buttonText="Copy Map"
                  className="mr-2"
                />
                <button
                  onClick={() => setOpenState(null)}
                  className="p-2 text-text-muted hover:text-text-primary hover:bg-white/5 rounded-full transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative z-10" onClick={(e) => e.stopPropagation()}>
              <AnimatePresence mode="wait">
                {activeTab === 'graph' && !selectedNode && (
                  <m.div
                    key="graph"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    ref={containerRef}
                    className="w-full h-full relative"
                  >
                    {graphTopology && (
                      <div className="absolute top-4 right-4 z-50">
                        <CopyButton
                          text={formatGraphForMd(graphTopology)}
                          label="Copy graph as list"
                          variant="icon"
                        />
                      </div>
                    )}
                    {problemStructure && (
                      <div className="absolute top-4 left-4 z-50 px-3 py-1.5 rounded-full bg-black/70 border border-white/10 text-xs font-medium text-white/90">
                        <span className="opacity-60 mr-2">Structure:</span>
                        <span className="capitalize">{problemStructure.primary}</span>
                        {/* Show secondary patterns count if any */}
                        {(problemStructure.patterns?.length ?? 0) > 0 && (
                          <span className="ml-2 text-purple-400">
                            +{problemStructure.patterns.length}
                          </span>
                        )}
                        {problemStructure.confidence < 0.7 && (
                          <span className="ml-2 text-amber-400">(?)</span>
                        )}
                      </div>
                    )}
                    <Suspense fallback={<div className="w-full h-full flex items-center justify-center opacity-50"><div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" /></div>}>
                      <DecisionMapGraph
                        claims={graphData.claims}
                        edges={graphData.edges}
                        problemStructure={problemStructure || undefined}
                        citationSourceOrder={citationSourceOrder}
                        width={dims.w}
                        height={dims.h}
                        onNodeClick={handleNodeClick}
                      />
                    </Suspense>
                  </m.div>
                )}

                {activeTab === 'graph' && selectedNode && (
                  <m.div
                    key="detail"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-full h-full"
                  >
                    <DetailView
                      node={selectedNode}
                      narrativeExcerpt={narrativeExcerpt}
                      citationSourceOrder={citationSourceOrder}
                      onBack={() => setSelectedNode(null)}
                      onOrbClick={handleDetailOrbClick}
                      structural={structuralAnalysis}
                    />
                  </m.div>
                )}

                {activeTab === 'narrative' && (
                  <m.div
                    key="narrative"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-6 h-full overflow-y-auto relative"
                  >
                    {mappingText && (
                      <div className="absolute top-4 right-4 z-10">
                        <CopyButton
                          text={mappingText}
                          label="Copy narrative"
                          variant="icon"
                        />
                      </div>
                    )}
                    {mappingText ? (
                      <div className="narrative-prose">
                        <MarkdownDisplay content={transformCitations(mappingText)} components={markdownComponents} />
                      </div>
                    ) : (
                      <div className="text-text-muted text-sm text-center py-8">No narrative available.</div>
                    )}
                  </m.div>
                )}

                {activeTab === 'options' && (
                  <m.div
                    key="options"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full overflow-y-auto relative"
                  >
                    {optionsText && (
                      <div className="absolute top-4 right-4 z-10">
                        <CopyButton
                          text={optionsText}
                          label="Copy options"
                          variant="icon"
                        />
                      </div>
                    )}
                    <OptionsTab themes={parsedThemes} citationSourceOrder={citationSourceOrder} onCitationClick={handleCitationClick} />
                    <div className="px-6 pb-6 pt-2">
                      <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Graph topology</div>
                      {graphTopology ? (
                        <div className="bg-surface border border-border-subtle rounded-xl p-4">
                          <MarkdownDisplay content={formatGraphForMd(graphTopology)} />
                        </div>
                      ) : (
                        <div className="text-text-muted text-sm">No graph topology available.</div>
                      )}
                    </div>
                  </m.div>
                )}

                {activeTab === 'debug' && (
                  <m.div
                    key="debug"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full"
                  >
                    {structuralLoading || !structuralAnalysis ? (
                      <div className="w-full h-full flex items-center justify-center opacity-70 text-xs text-text-muted">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                          <div>Computing structural analysis for this turn…</div>
                        </div>
                      </div>
                    ) : (
                      <StructuralDebugPanel analysis={structuralAnalysis} />
                    )}
                  </m.div>
                )}

                {activeTab === 'concierge' && (
                  <m.div
                    key="concierge"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full"
                  >
                    <ConciergePipelinePanel
                      state={singularityState}
                      analysis={structuralAnalysis || null}
                      userMessage={userMessage}
                    />
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          </m.div>
        </LazyMotion>
      )}
    </AnimatePresence>
  );
});