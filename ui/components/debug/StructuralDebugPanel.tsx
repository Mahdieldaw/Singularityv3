import React, { useMemo, useState } from "react";
import type { EnrichmentResult, MapperArtifact, StructuralAnalysis } from "../../../shared/contract";
import clsx from "clsx";
import { CopyButton } from "../CopyButton";

export interface DissentVoice {
    id: string;
    label: string;
    text: string;
    supportRatio: number;
    insightType: string;
    insightScore: number;
    whyItMatters: string;
    challenges: string;
}

interface StructuralDebugPanelProps {
    analysis: StructuralAnalysis;
    semanticMapperPrompt?: string | null;
    rawMappingText?: string | null;
    completeness?: MapperArtifact['completeness'] | null;
    enrichmentResult?: EnrichmentResult | null;
    traversalGraph?: MapperArtifact['traversalGraph'] | null;
    forcingPoints?: MapperArtifact['forcingPoints'] | null;
}

export const StructuralDebugPanel: React.FC<StructuralDebugPanelProps> = ({ analysis, semanticMapperPrompt, rawMappingText, completeness, enrichmentResult, traversalGraph, forcingPoints }) => {
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
        const coverageSignal = modelCount > 0 ? clamp01(uniqueModelCount / modelCount) : 0;

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

        return { peaks, hills, peakThreshold, hillThreshold };
    }, [analysis]);

    // ─────────────────────────────────────────────────────────────────────────
    // Dissent voices (minority with high insight potential)
    // ─────────────────────────────────────────────────────────────────────────
    const dissentVoices = useMemo((): DissentVoice[] => {
        const dissentPattern = analysis.shape.patterns?.find(p => p.type === 'dissent');
        if (dissentPattern?.data) {
            const data = dissentPattern.data as any;
            const rawVoices = Array.isArray(data.voices) ? data.voices : [];

            return rawVoices.map((v: any, idx: number) => ({
                id: v.id || `voice-${idx}`,
                label: v.label || "",
                text: v.text || "",
                supportRatio: v.supportRatio,
                insightType: v.insightType || 'edge_case',
                insightScore: v.insightScore || 0.5,
                whyItMatters: v.whyItMatters || (v.id === data?.strongestVoice?.id ? data?.strongestVoice?.whyItMatters : null) || 'Challenging minority voice',
                challenges: v.challenges || (Array.isArray(v.targets) ? v.targets.join(', ') : 'consensus')
            }));
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
                insightType: 'edge_case',
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

    const completenessReport = completeness?.report || null;
    type FateCounts = { primary: number; supporting: number; orphan: number; noise: number; total: number };
    const fateCounts = useMemo<FateCounts>(() => {
        const counts: Omit<FateCounts, 'total'> = { primary: 0, supporting: 0, orphan: 0, noise: 0 };
        const statementFates = completeness?.statementFates || {};
        for (const fate of Object.values(statementFates)) {
            const key = (fate as any)?.fate;
            if (key === 'primary') counts.primary += 1;
            else if (key === 'supporting') counts.supporting += 1;
            else if (key === 'orphan') counts.orphan += 1;
            else if (key === 'noise') counts.noise += 1;
        }
        const total = Object.values(statementFates).length;
        return { ...counts, total };
    }, [completeness?.statementFates]);

    const formatPct = (ratio: number | null | undefined) => {
        if (ratio == null || Number.isNaN(ratio)) return "—";
        return `${(ratio * 100).toFixed(1)}%`;
    };

    const formatPctCount = (count: number, total: number) => {
        if (!total) return "—";
        return `${((count / total) * 100).toFixed(1)}%`;
    };

    const recommendationBadge = (rec: any) => {
        const label =
            rec === 'coverage_acceptable'
                ? 'Coverage acceptable'
                : rec === 'review_orphans'
                    ? 'Review orphans'
                    : rec === 'possible_gaps'
                        ? 'Possible gaps'
                        : String(rec || '—');
        const className =
            rec === 'coverage_acceptable'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                : rec === 'review_orphans'
                    ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20'
                    : rec === 'possible_gaps'
                        ? 'bg-red-500/15 text-red-400 border-red-500/20'
                        : 'bg-surface-highlight/20 text-text-muted border-border-subtle';
        return (
            <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full border text-[11px]", className)}>
                {label}
            </span>
        );
    };

    const orphanStanceCounts = useMemo(() => {
        const counts = new Map<string, number>();
        const statementFates = completeness?.statementFates || {};
        for (const f of Object.values(statementFates)) {
            const fate = (f as any)?.fate;
            if (fate !== 'orphan') continue;
            const stance = String((f as any)?.shadowMetadata?.stance || 'unknown');
            counts.set(stance, (counts.get(stance) || 0) + 1);
        }
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    }, [completeness?.statementFates]);

    const highSignalOrphans = useMemo(() => {
        const statementFates = completeness?.statementFates || {};
        const orphans = Object.values(statementFates)
            .filter((f: any) => f?.fate === 'orphan' && (f?.shadowMetadata?.signalWeight ?? 0) >= 2)
            .map((f: any) => ({
                statementId: String(f.statementId),
                regionId: f.regionId ?? null,
                claimIds: Array.isArray(f.claimIds) ? f.claimIds : [],
                stance: String(f?.shadowMetadata?.stance || ''),
                confidence: typeof f?.shadowMetadata?.confidence === 'number' ? f.shadowMetadata.confidence : null,
                signalWeight: typeof f?.shadowMetadata?.signalWeight === 'number' ? f.shadowMetadata.signalWeight : null,
                geometricIsolation: typeof f?.shadowMetadata?.geometricIsolation === 'number' ? f.shadowMetadata.geometricIsolation : null,
                reason: String(f?.reason || ''),
            }))
            .sort((a, b) => {
                const sw = (b.signalWeight ?? 0) - (a.signalWeight ?? 0);
                if (sw !== 0) return sw;
                const conf = (b.confidence ?? 0) - (a.confidence ?? 0);
                if (conf !== 0) return conf;
                return (b.geometricIsolation ?? 0) - (a.geometricIsolation ?? 0);
            });
        return orphans;
    }, [completeness?.statementFates]);

    const traversalSummary = useMemo(() => {
        const tg = traversalGraph as any;
        const tiers = Array.isArray(tg?.tiers) ? tg.tiers : [];
        const tensions = Array.isArray(tg?.tensions) ? tg.tensions : [];
        const roots = Array.isArray(tg?.roots) ? tg.roots : [];
        const cycles = Array.isArray(tg?.cycles) ? tg.cycles : [];
        const claims = Array.isArray(tg?.claims) ? tg.claims : [];
        const maxTier = typeof tg?.maxTier === 'number' ? tg.maxTier : null;
        const gatesFlat = tiers.flatMap((t: any) =>
            Array.isArray(t?.gates) ? t.gates.map((g: any) => ({ tierIndex: t.tierIndex, ...g })) : []
        );
        return { tiers, tensions, roots, cycles, claims, maxTier, gatesFlat };
    }, [traversalGraph]);

    const forcingPointsSummary = useMemo(() => {
        const fps = Array.isArray(forcingPoints) ? forcingPoints : [];
        const counts = new Map<string, number>();
        let pendingConflicts = 0;
        for (const fp of fps as any[]) {
            const type = String((fp as any)?.type || 'unknown');
            counts.set(type, (counts.get(type) || 0) + 1);
            if (type === 'conflict' && (fp as any)?.status === 'pending') pendingConflicts += 1;
        }
        const byType = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
        return { total: fps.length, byType, pendingConflicts, forcingPoints: fps as any[] };
    }, [forcingPoints]);

    // Get primary pattern - support both old and new field names
    const primaryPattern = analysis.shape.primary || (analysis.shape as any).primaryPattern || 'unknown';
    const secondaryPatterns = analysis.shape.patterns || [];
    const evidenceList = analysis.shape?.evidence ?? [];

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

            {(semanticMapperPrompt || rawMappingText) && (
                <div className="mb-6 space-y-3">
                    {semanticMapperPrompt && (
                        <details>
                            <summary className="cursor-pointer text-xs font-semibold text-text-secondary">
                                Semantic mapper prompt
                            </summary>
                            <div className="mt-2 bg-surface border border-border-subtle rounded-lg overflow-hidden">
                                <div className="flex items-center justify-end px-2 py-1 border-b border-border-subtle bg-surface-highlight/10">
                                    <CopyButton text={semanticMapperPrompt} label="Copy semantic mapper prompt" variant="icon" />
                                </div>
                                <pre className="text-[11px] leading-snug p-3 overflow-x-auto whitespace-pre-wrap">
                                    {semanticMapperPrompt}
                                </pre>
                            </div>
                        </details>
                    )}
                    {rawMappingText && (
                        <details>
                            <summary className="cursor-pointer text-xs font-semibold text-text-secondary">
                                Raw mapping output
                            </summary>
                            <div className="mt-2 bg-surface border border-border-subtle rounded-lg overflow-hidden">
                                <div className="flex items-center justify-end px-2 py-1 border-b border-border-subtle bg-surface-highlight/10">
                                    <CopyButton text={rawMappingText} label="Copy raw mapping output" variant="icon" />
                                </div>
                                <pre className="text-[11px] leading-snug p-3 overflow-x-auto whitespace-pre-wrap">
                                    {rawMappingText}
                                </pre>
                            </div>
                        </details>
                    )}
                </div>
            )}

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
                    <details open>
                        <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
                            <span>Shadow & Geometry</span>
                            <span className="text-[10px] text-text-muted uppercase tracking-wide">pipelineArtifacts.enrichmentResult</span>
                        </summary>
                        <div className="mt-2 text-xs space-y-3">
                            {!enrichmentResult ? (
                                <div className="text-text-muted">No geometry enrichment result captured for this turn.</div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        <div>
                                            <div className="text-text-muted">Enriched</div>
                                            <div className="font-mono">{enrichmentResult.enrichedCount}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Unenriched</div>
                                            <div className="font-mono">{enrichmentResult.unenrichedCount}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Total</div>
                                            <div className="font-mono">{enrichmentResult.enrichedCount + enrichmentResult.unenrichedCount}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">% enriched</div>
                                            <div className="font-mono">
                                                {formatPct(
                                                    (enrichmentResult.enrichedCount + enrichmentResult.unenrichedCount) > 0
                                                        ? enrichmentResult.enrichedCount / (enrichmentResult.enrichedCount + enrichmentResult.unenrichedCount)
                                                        : null
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-2 border-t border-border-subtle/60">
                                        <div className="text-[11px] font-semibold text-text-secondary">
                                            {enrichmentResult.unenrichedCount}/{enrichmentResult.enrichedCount + enrichmentResult.unenrichedCount} statements not enriched
                                        </div>
                                        {enrichmentResult.failures.length === 0 ? (
                                            <div className="text-text-muted">No failures</div>
                                        ) : (
                                            <div className="max-h-60 overflow-auto border border-border-subtle rounded-md">
                                                <table className="min-w-full text-[11px]">
                                                    <thead className="bg-surface-highlight/20">
                                                        <tr>
                                                            <th className="px-2 py-1 text-left">Statement ID</th>
                                                            <th className="px-2 py-1 text-left">Reason</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {enrichmentResult.failures.slice(0, 12).map((f) => (
                                                            <tr key={f.statementId} className="border-t border-border-subtle/60">
                                                                <td className="px-2 py-1 font-mono text-text-secondary">{f.statementId}</td>
                                                                <td className="px-2 py-1">{f.reason}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </details>

                    <details open>
                        <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
                            <span>Completeness (Mapper)</span>
                            <span className="text-[10px] text-text-muted uppercase tracking-wide">mapperArtifact.completeness</span>
                        </summary>
                        <div className="mt-2 text-xs space-y-3">
                            {!completenessReport ? (
                                <div className="text-text-muted">No completeness report found on this turn.</div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                        <div>
                                            <div className="text-text-muted">Statement coverage</div>
                                            <div className="font-mono">{formatPct(completenessReport.statements.coverageRatio)}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Region coverage</div>
                                            <div className="font-mono">{formatPct(completenessReport.regions.coverageRatio)}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Recommendation</div>
                                            <div>{recommendationBadge(completenessReport.verdict.recommendation)}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Estimated missed claims</div>
                                            <div className="font-mono">{completenessReport.verdict.estimatedMissedClaims}</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2 border-t border-border-subtle/60">
                                        <div className="col-span-2 md:col-span-1">
                                            <div className="text-text-muted">Fates total</div>
                                            <div className="font-mono">{fateCounts.total}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Primary</div>
                                            <div className="font-mono">{fateCounts.primary} <span className="text-text-muted">({formatPctCount(fateCounts.primary, fateCounts.total)})</span></div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Supporting</div>
                                            <div className="font-mono">{fateCounts.supporting} <span className="text-text-muted">({formatPctCount(fateCounts.supporting, fateCounts.total)})</span></div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Orphan</div>
                                            <div className="font-mono">{fateCounts.orphan} <span className="text-text-muted">({formatPctCount(fateCounts.orphan, fateCounts.total)})</span></div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Noise</div>
                                            <div className="font-mono">{fateCounts.noise} <span className="text-text-muted">({formatPctCount(fateCounts.noise, fateCounts.total)})</span></div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-border-subtle/60">
                                        <div>
                                            <div className="text-text-muted">Coverage by claims</div>
                                            <div className="font-mono">
                                                {fateCounts.total > 0 ? formatPct((fateCounts.primary + fateCounts.supporting) / fateCounts.total) : "—"}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Verdict</div>
                                            <div className="font-mono">{completenessReport.verdict.complete ? "complete" : "incomplete"}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Confidence</div>
                                            <div className="font-mono">{completenessReport.verdict.confidence}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Regions unattended (likely)</div>
                                            <div className="font-mono">
                                                {completenessReport.regions.unattended}{" "}
                                                <span className="text-text-muted">({completenessReport.regions.unattendedWithLikelyClaims})</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-border-subtle/60">
                                        <div>
                                            <div className="text-text-muted">Statements total</div>
                                            <div className="font-mono">{completenessReport.statements.total}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">In claims</div>
                                            <div className="font-mono">{completenessReport.statements.inClaims}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Orphaned</div>
                                            <div className="font-mono">{completenessReport.statements.orphaned}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Noise</div>
                                            <div className="font-mono">{completenessReport.statements.noise}</div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-border-subtle/60">
                                        <div>
                                            <div className="text-text-muted">Regions total</div>
                                            <div className="font-mono">{completenessReport.regions.total}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Attended</div>
                                            <div className="font-mono">{completenessReport.regions.attended}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Unattended</div>
                                            <div className="font-mono">{completenessReport.regions.unattended}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Unattended likely</div>
                                            <div className="font-mono">{completenessReport.regions.unattendedWithLikelyClaims}</div>
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-2 border-t border-border-subtle/60">
                                        <div className="text-[11px] font-semibold text-text-secondary">High-signal orphans (from statement fates)</div>
                                        {highSignalOrphans.length === 0 ? (
                                            <div className="text-text-muted">None</div>
                                        ) : (
                                            <div className="max-h-72 overflow-auto border border-border-subtle rounded-md">
                                                <table className="min-w-full text-[11px]">
                                                    <thead className="bg-surface-highlight/20">
                                                        <tr>
                                                            <th className="px-2 py-1 text-left">Statement</th>
                                                            <th className="px-2 py-1 text-left">Region</th>
                                                            <th className="px-2 py-1 text-left">Stance</th>
                                                            <th className="px-2 py-1 text-right">Signal</th>
                                                            <th className="px-2 py-1 text-right">Conf</th>
                                                            <th className="px-2 py-1 text-right">Iso</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {highSignalOrphans.slice(0, 25).map((o) => (
                                                            <tr key={o.statementId} className="border-t border-border-subtle/60">
                                                                <td className="px-2 py-1 font-mono text-text-secondary">{o.statementId}</td>
                                                                <td className="px-2 py-1 font-mono text-text-secondary">{o.regionId || "—"}</td>
                                                                <td className="px-2 py-1 font-mono text-text-secondary">{o.stance}</td>
                                                                <td className="px-2 py-1 text-right font-mono">{o.signalWeight ?? "—"}</td>
                                                                <td className="px-2 py-1 text-right font-mono">{o.confidence == null ? "—" : o.confidence.toFixed(2)}</td>
                                                                <td className="px-2 py-1 text-right font-mono">{o.geometricIsolation == null ? "—" : o.geometricIsolation.toFixed(2)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2 pt-2 border-t border-border-subtle/60">
                                        <div className="text-[11px] font-semibold text-text-secondary">Orphans by stance</div>
                                        {orphanStanceCounts.length === 0 ? (
                                            <div className="text-text-muted">None</div>
                                        ) : (
                                            <div className="max-h-48 overflow-auto border border-border-subtle rounded-md">
                                                <table className="min-w-full text-[11px]">
                                                    <thead className="bg-surface-highlight/20">
                                                        <tr>
                                                            <th className="px-2 py-1 text-left">Stance</th>
                                                            <th className="px-2 py-1 text-right">Count</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {orphanStanceCounts.map(([stance, count]) => (
                                                            <tr key={stance} className="border-t border-border-subtle/60">
                                                                <td className="px-2 py-1 font-mono text-text-secondary">{stance}</td>
                                                                <td className="px-2 py-1 text-right font-mono">{count}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2 pt-2 border-t border-border-subtle/60">
                                        <div className="text-[11px] font-semibold text-text-secondary">Unattended regions (diagnostics)</div>
                                        {(completeness?.unattendedRegions || []).length === 0 ? (
                                            <div className="text-text-muted">None</div>
                                        ) : (
                                            <div className="max-h-72 overflow-auto border border-border-subtle rounded-md">
                                                <table className="min-w-full text-[11px]">
                                                    <thead className="bg-surface-highlight/20">
                                                        <tr>
                                                            <th className="px-2 py-1 text-left">Region</th>
                                                            <th className="px-2 py-1 text-left">Reason</th>
                                                            <th className="px-2 py-1 text-right">Statements</th>
                                                            <th className="px-2 py-1 text-right">Diversity</th>
                                                            <th className="px-2 py-1 text-right">Avg iso</th>
                                                            <th className="px-2 py-1 text-center">Likely</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(completeness?.unattendedRegions || []).map((r) => (
                                                            <tr key={r.id} className="border-t border-border-subtle/60">
                                                                <td className="px-2 py-1 font-mono text-text-secondary">{r.id}</td>
                                                                <td className="px-2 py-1">{r.reason}</td>
                                                                <td className="px-2 py-1 text-right font-mono">{r.statementCount}</td>
                                                                <td className="px-2 py-1 text-right font-mono">{r.modelDiversity}</td>
                                                                <td className="px-2 py-1 text-right font-mono">{r.avgIsolation.toFixed(2)}</td>
                                                                <td className="px-2 py-1 text-center font-mono">{r.likelyClaim ? "true" : "false"}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2 pt-2 border-t border-border-subtle/60">
                                        <div className="text-[11px] font-semibold text-text-secondary">High-signal orphans</div>
                                        {completenessReport.recovery.highSignalOrphans.length === 0 ? (
                                            <div className="text-text-muted">None</div>
                                        ) : (
                                            <div className="max-h-60 overflow-auto border border-border-subtle rounded-md">
                                                <table className="min-w-full text-[11px]">
                                                    <thead className="bg-surface-highlight/20">
                                                        <tr>
                                                            <th className="px-2 py-1 text-left">Text</th>
                                                            <th className="px-2 py-1 text-left">Stance</th>
                                                            <th className="px-2 py-1 text-right">Signal</th>
                                                            <th className="px-2 py-1 text-left">Reason</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {completenessReport.recovery.highSignalOrphans.map((o) => (
                                                            <tr key={o.statementId} className="border-t border-border-subtle/60">
                                                                <td className="px-2 py-1">
                                                                    <div className="whitespace-pre-wrap leading-snug">{o.text}</div>
                                                                </td>
                                                                <td className="px-2 py-1 font-mono text-text-secondary">{o.stance}</td>
                                                                <td className="px-2 py-1 text-right font-mono">{o.signalWeight}</td>
                                                                <td className="px-2 py-1 text-text-muted">{o.reason}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2 pt-2 border-t border-border-subtle/60">
                                        <div className="text-[11px] font-semibold text-text-secondary">Unattended regions</div>
                                        {completenessReport.recovery.unattendedRegionPreviews.length === 0 ? (
                                            <div className="text-text-muted">None</div>
                                        ) : (
                                            <div className="space-y-2">
                                                {completenessReport.recovery.unattendedRegionPreviews.map((r) => (
                                                    <div
                                                        key={r.regionId}
                                                        className="bg-surface border border-border-subtle rounded-lg p-3"
                                                    >
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="font-mono text-[11px] text-text-secondary">{r.regionId}</div>
                                                            <div className="text-[11px] text-text-muted">{r.reason}</div>
                                                        </div>
                                                        <div className="mt-1 text-[10px] text-text-muted">
                                                            likelyClaim: <span className="font-mono">{r.likelyClaim ? "true" : "false"}</span>
                                                        </div>
                                                        {r.statementPreviews.length > 0 && (
                                                            <div className="mt-2 space-y-1">
                                                                {r.statementPreviews.map((s, idx) => (
                                                                    <div key={`${r.regionId}-${idx}`} className="text-[11px] leading-snug text-text-secondary whitespace-pre-wrap">
                                                                        {s}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </details>

                    <details open>
                        <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
                            <span>Traversal (Mapper)</span>
                            <span className="text-[10px] text-text-muted uppercase tracking-wide">mapperArtifact.traversalGraph</span>
                        </summary>
                        <div className="mt-2 text-xs space-y-3">
                            {!traversalGraph ? (
                                <div className="text-text-muted">No traversal graph found on this turn.</div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                                        <div>
                                            <div className="text-text-muted">Claims</div>
                                            <div className="font-mono">{traversalSummary.claims.length}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Tiers</div>
                                            <div className="font-mono">{traversalSummary.tiers.length}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Max tier</div>
                                            <div className="font-mono">{traversalSummary.maxTier ?? "—"}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Tensions</div>
                                            <div className="font-mono">{traversalSummary.tensions.length}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Roots</div>
                                            <div className="font-mono">{traversalSummary.roots.length}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Cycles</div>
                                            <div className="font-mono">{traversalSummary.cycles.length}</div>
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-2 border-t border-border-subtle/60">
                                        <div className="text-[11px] font-semibold text-text-secondary">Tier summary</div>
                                        {traversalSummary.tiers.length === 0 ? (
                                            <div className="text-text-muted">No tiers</div>
                                        ) : (
                                            <div className="max-h-60 overflow-auto border border-border-subtle rounded-md">
                                                <table className="min-w-full text-[11px]">
                                                    <thead className="bg-surface-highlight/20">
                                                        <tr>
                                                            <th className="px-2 py-1 text-left">Tier</th>
                                                            <th className="px-2 py-1 text-right">Claims</th>
                                                            <th className="px-2 py-1 text-right">Gates</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {traversalSummary.tiers.map((t: any) => (
                                                            <tr key={String(t?.tierIndex)} className="border-t border-border-subtle/60">
                                                                <td className="px-2 py-1 font-mono text-text-secondary">{String(t?.tierIndex)}</td>
                                                                <td className="px-2 py-1 text-right font-mono">{Array.isArray(t?.claimIds) ? t.claimIds.length : 0}</td>
                                                                <td className="px-2 py-1 text-right font-mono">{Array.isArray(t?.gates) ? t.gates.length : 0}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2 pt-2 border-t border-border-subtle/60">
                                        <div className="text-[11px] font-semibold text-text-secondary">Gates</div>
                                        {traversalSummary.gatesFlat.length === 0 ? (
                                            <div className="text-text-muted">No gates</div>
                                        ) : (
                                            <div className="max-h-72 overflow-auto border border-border-subtle rounded-md">
                                                <table className="min-w-full text-[11px]">
                                                    <thead className="bg-surface-highlight/20">
                                                        <tr>
                                                            <th className="px-2 py-1 text-left">Tier</th>
                                                            <th className="px-2 py-1 text-left">Type</th>
                                                            <th className="px-2 py-1 text-left">Gate</th>
                                                            <th className="px-2 py-1 text-left">Question</th>
                                                            <th className="px-2 py-1 text-right">Blocked</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {traversalSummary.gatesFlat.slice(0, 40).map((g: any) => (
                                                            <tr key={String(g?.id)} className="border-t border-border-subtle/60 align-top">
                                                                <td className="px-2 py-1 font-mono text-text-secondary">{String(g?.tierIndex ?? "—")}</td>
                                                                <td className="px-2 py-1 font-mono text-text-secondary">{String(g?.type ?? "—")}</td>
                                                                <td className="px-2 py-1 font-mono text-text-secondary">{String(g?.id)}</td>
                                                                <td className="px-2 py-1">
                                                                    <div className="whitespace-pre-wrap leading-snug">{String(g?.question || g?.condition || "").trim() || "—"}</div>
                                                                </td>
                                                                <td className="px-2 py-1 text-right font-mono">{Array.isArray(g?.blockedClaims) ? g.blockedClaims.length : 0}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>

                                    <details>
                                        <summary className="cursor-pointer text-[11px] font-semibold text-text-secondary">
                                            Raw traversalGraph JSON
                                        </summary>
                                        <pre className="mt-2 text-[11px] leading-snug bg-surface border border-border-subtle rounded-lg p-3 overflow-x-auto">
                                            {JSON.stringify(traversalGraph, null, 2)}
                                        </pre>
                                    </details>
                                </>
                            )}
                        </div>
                    </details>

                    <details open>
                        <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
                            <span>Forcing Points (Mapper)</span>
                            <span className="text-[10px] text-text-muted uppercase tracking-wide">mapperArtifact.forcingPoints</span>
                        </summary>
                        <div className="mt-2 text-xs space-y-3">
                            {forcingPointsSummary.total === 0 ? (
                                <div className="text-text-muted">No forcing points found on this turn.</div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                        <div>
                                            <div className="text-text-muted">Total</div>
                                            <div className="font-mono">{forcingPointsSummary.total}</div>
                                        </div>
                                        <div className="md:col-span-2">
                                            <div className="text-text-muted">By type</div>
                                            <div className="font-mono">
                                                {forcingPointsSummary.byType.map(([t, c]) => `${t}:${c}`).join("  ") || "—"}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Pending conflicts</div>
                                            <div className="font-mono">{forcingPointsSummary.pendingConflicts}</div>
                                        </div>
                                        <div>
                                            <div className="text-text-muted">Preview</div>
                                            <div className="font-mono">{Math.min(forcingPointsSummary.total, 20)}</div>
                                        </div>
                                    </div>

                                    <div className="max-h-80 overflow-auto border border-border-subtle rounded-md">
                                        <table className="min-w-full text-[11px]">
                                            <thead className="bg-surface-highlight/20">
                                                <tr>
                                                    <th className="px-2 py-1 text-left">ID</th>
                                                    <th className="px-2 py-1 text-left">Type</th>
                                                    <th className="px-2 py-1 text-right">Tier</th>
                                                    <th className="px-2 py-1 text-left">Question</th>
                                                    <th className="px-2 py-1 text-left">Details</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {forcingPointsSummary.forcingPoints.slice(0, 20).map((fp: any) => {
                                                    const type = String(fp?.type || "—");
                                                    const tier = typeof fp?.tier === "number" ? fp.tier : "—";
                                                    const question = String(fp?.question || fp?.condition || "").trim() || "—";
                                                    const details =
                                                        type === "conflict"
                                                            ? (fp?.optionA && fp?.optionB
                                                                ? `${String(fp.optionA.label)} ↔ ${String(fp.optionB.label)} (${String(fp?.status || "—")})`
                                                                : Array.isArray(fp?.options)
                                                                    ? `${fp.options.length} options`
                                                                    : String(fp?.status || "—"))
                                                            : type === "prerequisite"
                                                                ? String(fp?.claimLabel || fp?.claimId || "—")
                                                                : type === "conditional"
                                                                    ? `${Array.isArray(fp?.affectedClaims) ? fp.affectedClaims.length : 0} affected`
                                                                    : "—";
                                                    return (
                                                        <tr key={String(fp?.id)} className="border-t border-border-subtle/60 align-top">
                                                            <td className="px-2 py-1 font-mono text-text-secondary">{String(fp?.id)}</td>
                                                            <td className="px-2 py-1 font-mono text-text-secondary">{type}</td>
                                                            <td className="px-2 py-1 text-right font-mono">{String(tier)}</td>
                                                            <td className="px-2 py-1">
                                                                <div className="whitespace-pre-wrap leading-snug">{question}</div>
                                                            </td>
                                                            <td className="px-2 py-1 text-text-muted">{details}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    <details>
                                        <summary className="cursor-pointer text-[11px] font-semibold text-text-secondary">
                                            Raw forcingPoints JSON
                                        </summary>
                                        <pre className="mt-2 text-[11px] leading-snug bg-surface border border-border-subtle rounded-lg p-3 overflow-x-auto">
                                            {JSON.stringify(forcingPoints, null, 2)}
                                        </pre>
                                    </details>
                                </>
                            )}
                        </div>
                    </details>

                    {/* PHASE 1: Graph Topology */}
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

                    {/* PHASE 2: Landscape Metrics */}
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

                    {/* PHASE 3: Claim Enrichment */}
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

                    {/* PHASE 4: Core Ratios */}
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

                    {/* PHASE 5: Pattern Detection */}
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

                    {/* PHASE 6: Peaks & Hills Detection */}
                    <details open>
                        <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
                            <span>⛰️ Phase 6: Peaks & Hills Detection</span>
                            <span className="text-[10px] text-text-muted uppercase tracking-wide">detectCompositeShape (peak-first)</span>
                        </summary>
                        <div className="mt-2 text-xs space-y-2">
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

                    {/* PHASE 7: Composite Shape Classification */}
                    <details>
                        <summary className="cursor-pointer text-sm font-semibold flex items-center gap-2">
                            <span>🧱 Phase 7: Composite Shape</span>
                            <span className="text-[10px] text-text-muted uppercase tracking-wide">primary shape + secondary patterns</span>
                        </summary>
                        <div className="mt-2 text-xs space-y-2">
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
                                    {evidenceList.length > 0 ? (
                                        <ul className="list-disc list-inside space-y-1">
                                            {evidenceList.map((e, idx) => (
                                                <li key={idx} className="text-[11px]">{e}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="text-[11px] text-text-muted">No evidence provided.</div>
                                    )}
                                </div>
                            </div>

                            {dissentVoices.length > 0 && (
                                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 mt-2">
                                    <div className="text-[11px] font-semibold text-yellow-400 mb-2">
                                        📢 Dissent Voices — Minority views with potential insight
                                    </div>
                                    <div className="space-y-1">
                                        {dissentVoices.slice(0, 5).map((v: DissentVoice, idx: number) => (
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

                    {/* PHASE 8: Shape-Specific Data */}
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
