import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Claim, Edge, ExploreAnalysis, MapperArtifact } from '../../../shared/contract';

interface MetricsRibbonProps {
    analysis?: ExploreAnalysis;
    artifact?: MapperArtifact;
    claimsCount: number;
    ghostCount: number;
}

export const MetricsRibbon: React.FC<MetricsRibbonProps> = ({
    analysis,
    artifact,
    claimsCount,
    ghostCount
}) => {
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    type StructuralAnalysis = {
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

    const structural = useMemo((): StructuralAnalysis | null => {
        if (!artifact) return null;

        const claims = Array.isArray(artifact?.claims) ? artifact.claims : [];
        const edges = Array.isArray(artifact?.edges) ? artifact.edges : [];
        const ghosts = Array.isArray(artifact?.ghosts) ? artifact.ghosts.filter(Boolean).map(String) : [];

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
        const modelCount = typeof (artifact as any)?.model_count === "number" && (artifact as any).model_count > 0
            ? (artifact as any).model_count
            : supporterSet.size;

        const landscape: StructuralAnalysis["landscape"] = {
            dominantType,
            typeDistribution,
            dominantRole,
            roleDistribution,
            claimCount: claims.length,
            modelCount,
            convergenceRatio: claims.length > 0 ? consensusClaims.length / claims.length : 0,
        };

        const computeClaimLeverage = (claim: Claim, allEdges: Edge[], modelCountRaw: number): ClaimWithLeverage => {
            const safeModelCount = Math.max(modelCountRaw || 0, 1);
            const supporters = Array.isArray(claim.supporters) ? claim.supporters : [];
            const supportWeight = (supporters.length / safeModelCount) * 2;

            const roleWeights: Record<string, number> = {
                challenger: 4,
                anchor: 2,
                branch: 1,
                supplement: 0.5,
            };
            const roleWeight = roleWeights[claim.role] ?? 1;

            const outgoing = allEdges.filter((e) => e.from === claim.id);
            const incoming = allEdges.filter((e) => e.to === claim.id);

            const prereqOut = outgoing.filter((e) => e.type === "prerequisite").length * 2;
            const prereqIn = incoming.filter((e) => e.type === "prerequisite").length;
            const conflictEdges = allEdges.filter(
                (e) => e.type === "conflicts" && (e.from === claim.id || e.to === claim.id)
            ).length * 1.5;

            const connectivityWeight = prereqOut + prereqIn + conflictEdges + (outgoing.length + incoming.length) * 0.25;

            const hasIncomingPrereq = incoming.some((e) => e.type === "prerequisite");
            const hasOutgoingPrereq = outgoing.some((e) => e.type === "prerequisite");
            const positionWeight = !hasIncomingPrereq && hasOutgoingPrereq ? 2 : 0;

            const leverage = supportWeight + roleWeight + connectivityWeight + positionWeight;
            const isLeverageInversion = supporters.length < 2 && leverage > 4;

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
            };
        };

        const claimsWithLeverage = claims.map((c) => computeClaimLeverage(c, edges, landscape.modelCount));
        const claimMap = new Map<string, ClaimWithLeverage>(claimsWithLeverage.map((c) => [c.id, c]));

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
            leverageClaims: ClaimWithLeverage[],
            allEdges: Edge[],
            map: Map<string, ClaimWithLeverage>
        ): LeverageInversion[] => {
            const inversions: LeverageInversion[] = [];
            const prerequisites = allEdges.filter((e) => e.type === "prerequisite");

            for (const claim of leverageClaims) {
                if (!claim.isLeverageInversion) continue;

                const prereqTo = prerequisites.filter((e) => e.from === claim.id);
                const consensusTargets = prereqTo
                    .map((e) => map.get(e.to))
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

        const detectCascadeRisks = (allEdges: Edge[], map: Map<string, ClaimWithLeverage>): CascadeRisk[] => {
            const prerequisites = allEdges.filter((e) => e.type === "prerequisite");
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

                const source = map.get(sourceId);
                const dependentClaims = Array.from(allDependents)
                    .map((id) => map.get(id))
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

        const detectConflicts = (allEdges: Edge[], map: Map<string, ClaimWithLeverage>): ConflictPair[] => {
            const out: ConflictPair[] = [];
            for (const e of allEdges) {
                if (e.type !== "conflicts") continue;
                const a = map.get(e.from);
                const b = map.get(e.to);
                if (!a || !b) continue;
                out.push({
                    claimA: { id: a.id, label: a.label, supporterCount: a.supporters.length },
                    claimB: { id: b.id, label: b.label, supporterCount: b.supporters.length },
                    isBothConsensus: a.supporters.length >= 2 && b.supporters.length >= 2,
                });
            }
            return out;
        };

        const detectTradeoffs = (allEdges: Edge[], map: Map<string, ClaimWithLeverage>): TradeoffPair[] => {
            const out: TradeoffPair[] = [];
            for (const e of allEdges) {
                if (e.type !== "tradeoff") continue;
                const a = map.get(e.from);
                const b = map.get(e.to);
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

        const detectConvergencePoints = (allEdges: Edge[], map: Map<string, ClaimWithLeverage>): ConvergencePoint[] => {
            const relevantEdges = allEdges.filter((e) => e.type === "prerequisite" || e.type === "supports");
            const byTargetType = new Map<string, { targetId: string; sources: string[]; type: "prerequisite" | "supports" }>();

            for (const e of relevantEdges) {
                const key = `${e.to}::${e.type}`;
                const existing = byTargetType.get(key);
                if (existing) existing.sources.push(e.from);
                else byTargetType.set(key, { targetId: e.to, sources: [e.from], type: e.type as "prerequisite" | "supports" });
            }

            const points: ConvergencePoint[] = [];
            for (const { targetId, sources, type } of byTargetType.values()) {
                if (sources.length < 2) continue;
                const target = map.get(targetId);
                const sourceClaims = sources.map((s) => map.get(s)).filter(Boolean);
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

        const detectIsolatedClaims = (leverageClaims: ClaimWithLeverage[], allEdges: Edge[]): string[] => {
            const connectedIds = new Set<string>();
            for (const e of allEdges) {
                connectedIds.add(e.from);
                connectedIds.add(e.to);
            }
            return leverageClaims.filter((c) => !connectedIds.has(c.id)).map((c) => c.id);
        };

        const analyzeGhosts = (ghostIds: string[], leverageClaims: ClaimWithLeverage[]): StructuralAnalysis["ghostAnalysis"] => {
            const challengers = leverageClaims.filter((c) => c.role === "challenger");
            return {
                count: ghostIds.length,
                mayExtendChallenger: ghostIds.length > 0 && challengers.length > 0,
                challengerIds: challengers.map((c) => c.id),
            };
        };

        const patterns: StructuralAnalysis["patterns"] = {
            leverageInversions: detectLeverageInversions(claimsWithLeverage, edges, claimMap),
            cascadeRisks: detectCascadeRisks(edges, claimMap),
            conflicts: detectConflicts(edges, claimMap),
            tradeoffs: detectTradeoffs(edges, claimMap),
            convergencePoints: detectConvergencePoints(edges, claimMap),
            isolatedClaims: detectIsolatedClaims(claimsWithLeverage, edges),
        };

        const ghostAnalysis = analyzeGhosts(ghosts, claimsWithLeverage);

        return { landscape, claimsWithLeverage, patterns, ghostAnalysis };
    }, [artifact]);

    useEffect(() => {
        if (!isAdvancedOpen) return;
        const onDown = (evt: MouseEvent) => {
            const node = containerRef.current;
            if (!node) return;
            if (evt.target instanceof Node && !node.contains(evt.target)) setIsAdvancedOpen(false);
        };
        const onKey = (evt: KeyboardEvent) => {
            if (evt.key === "Escape") setIsAdvancedOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            window.removeEventListener("keydown", onKey);
        };
    }, [isAdvancedOpen]);

    const convergence = analysis?.convergenceRatio !== undefined
        ? Math.round(analysis.convergenceRatio * 100)
        : structural?.landscape?.convergenceRatio !== undefined
            ? Math.round(structural.landscape.convergenceRatio * 100)
            : null;

    const conflictCount = analysis?.conflictCount ?? structural?.patterns?.conflicts?.length ?? 0;

    // Determine color for convergence based on health
    const convergenceColor = (convergence ?? 0) >= 60
        ? "text-emerald-400"
        : (convergence ?? 0) >= 30
            ? "text-amber-400"
            : "text-text-secondary";

    const leverageInversionCount = structural?.patterns?.leverageInversions?.length ?? 0;
    const cascadeRiskCount = structural?.patterns?.cascadeRisks?.length ?? 0;
    const tradeoffCount = structural?.patterns?.tradeoffs?.length ?? 0;
    const convergencePointCount = structural?.patterns?.convergencePoints?.length ?? 0;
    const isolatedCount = structural?.patterns?.isolatedClaims?.length ?? 0;
    const modelCount = structural?.landscape?.modelCount ?? (artifact as any)?.model_count ?? null;

    const formatLeverageReason = (reason: LeverageInversion["reason"]) => {
        if (reason === "challenger_prerequisite_to_consensus") return "challenger prerequisite";
        if (reason === "singular_foundation") return "singular foundation";
        return "high connectivity";
    };

    return (
        <div ref={containerRef} className="relative flex items-center gap-4 px-4 py-2 bg-surface-raised border border-border-subtle rounded-lg mb-4 text-xs">
            {/* Claims */}
            <div className="flex items-center gap-1.5" title="Total claims in the map">
                <span className="text-text-muted">Claims:</span>
                <span className="font-medium text-text-primary">{claimsCount}</span>
            </div>

            <div className="w-px h-3 bg-border-subtle" />

            {/* Convergence */}
            {convergence !== null && (
                <div className="flex items-center gap-1.5" title="Agreement ratio across models">
                    <span className="text-text-muted">Convergence:</span>
                    <span className={`font-medium ${convergenceColor}`}>{convergence}%</span>
                </div>
            )}

            {/* Conflicts - Only show if > 0 */}
            {conflictCount > 0 && (
                <>
                    <div className="w-px h-3 bg-border-subtle" />
                    <div className="flex items-center gap-1.5" title="Conflicting viewpoints identified">
                        <span className="text-text-muted">Conflicts:</span>
                        <span className="font-medium text-intent-warning">{conflictCount}</span>
                    </div>
                </>
            )}

            {/* Ghosts - Only show if > 0 */}
            {ghostCount > 0 && (
                <>
                    <div className="w-px h-3 bg-border-subtle" />
                    <div className="flex items-center gap-1.5" title="Uncharted territories (Ghosts)">
                        <span className="text-text-muted">Ghosts:</span>
                        <span className="font-medium text-purple-400">{ghostCount}</span>
                    </div>
                </>
            )}

            <div className="flex-1" />

            {/* Model Count */}
            {typeof modelCount === "number" && modelCount > 0 && (
                <div className="flex items-center gap-1.5 opacity-60">
                    <span className="text-text-muted">Models:</span>
                    <span>{modelCount}</span>
                </div>
            )}

            {structural && (
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setIsAdvancedOpen((v) => !v)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border-subtle bg-surface-highlight/10 hover:bg-surface-highlight/20 text-text-secondary transition-colors"
                        aria-expanded={isAdvancedOpen}
                    >
                        <span>Details</span>
                        {(leverageInversionCount + cascadeRiskCount + tradeoffCount + convergencePointCount + isolatedCount) > 0 && (
                            <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-500/20 text-brand-300">
                                {leverageInversionCount + cascadeRiskCount + tradeoffCount + convergencePointCount + isolatedCount}
                            </span>
                        )}
                        <span className="text-[10px] opacity-70">{isAdvancedOpen ? "▴" : "▾"}</span>
                    </button>

                    {isAdvancedOpen && (
                        <div className="absolute right-0 top-full mt-2 w-[460px] max-w-[calc(100vw-32px)] z-[60] bg-surface-raised/95 border border-border-subtle rounded-xl shadow-lg overflow-hidden">
                            <div className="px-4 py-3 border-b border-border-subtle flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="text-xs font-semibold text-text-primary">Structural Analysis</div>
                                    <div className="text-[11px] text-text-muted truncate">
                                        {structural.landscape.dominantType} • {structural.landscape.dominantRole} • {Math.round(structural.landscape.convergenceRatio * 100)}% convergence
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="text-text-muted hover:text-text-primary transition-colors px-2 py-1 rounded-md hover:bg-surface-highlight"
                                    onClick={() => setIsAdvancedOpen(false)}
                                    aria-label="Close details"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="px-4 py-3 grid grid-cols-2 gap-3 text-[11px]">
                                <div className="bg-surface-highlight/10 border border-border-subtle rounded-lg p-2">
                                    <div className="text-text-muted">Dominant type</div>
                                    <div className="text-text-primary font-medium">{structural.landscape.dominantType}</div>
                                </div>
                                <div className="bg-surface-highlight/10 border border-border-subtle rounded-lg p-2">
                                    <div className="text-text-muted">Dominant role</div>
                                    <div className="text-text-primary font-medium">{structural.landscape.dominantRole}</div>
                                </div>
                                <div className="bg-surface-highlight/10 border border-border-subtle rounded-lg p-2">
                                    <div className="text-text-muted">Leverage inversions</div>
                                    <div className="text-text-primary font-medium">{leverageInversionCount}</div>
                                </div>
                                <div className="bg-surface-highlight/10 border border-border-subtle rounded-lg p-2">
                                    <div className="text-text-muted">Cascade risks</div>
                                    <div className="text-text-primary font-medium">{cascadeRiskCount}</div>
                                </div>
                            </div>

                            <div className="px-4 pb-4 max-h-[420px] overflow-y-auto custom-scrollbar space-y-3">
                                <div className="border border-border-subtle rounded-lg overflow-hidden">
                                    <div className="px-3 py-2 bg-surface-highlight/10 text-[11px] text-text-secondary flex items-center justify-between">
                                        <span>Leverage inversions</span>
                                        <span className="opacity-70">{leverageInversionCount}</span>
                                    </div>
                                    {leverageInversionCount > 0 ? (
                                        <div className="px-3 py-2 space-y-1">
                                            {structural.patterns.leverageInversions.slice(0, 6).map((inv) => (
                                                <div key={`${inv.claimId}:${inv.reason}`} className="text-text-primary">
                                                    <span className="font-medium">{inv.claimLabel}</span>
                                                    <span className="text-text-muted"> ({inv.supporterCount})</span>
                                                    <span className="text-text-muted"> — {formatLeverageReason(inv.reason)}</span>
                                                    {inv.affectedClaims.length > 0 && (
                                                        <span className="text-text-muted"> → affects {inv.affectedClaims.length}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="px-3 py-2 text-text-muted">None detected.</div>
                                    )}
                                </div>

                                <div className="border border-border-subtle rounded-lg overflow-hidden">
                                    <div className="px-3 py-2 bg-surface-highlight/10 text-[11px] text-text-secondary flex items-center justify-between">
                                        <span>Cascade risks</span>
                                        <span className="opacity-70">{cascadeRiskCount}</span>
                                    </div>
                                    {cascadeRiskCount > 0 ? (
                                        <div className="px-3 py-2 space-y-1">
                                            {structural.patterns.cascadeRisks
                                                .slice()
                                                .sort((a, b) => b.dependentIds.length - a.dependentIds.length)
                                                .slice(0, 6)
                                                .map((r) => (
                                                    <div key={r.sourceId} className="text-text-primary">
                                                        <span className="font-medium">{r.sourceLabel}</span>
                                                        <span className="text-text-muted"> → {r.dependentIds.length} dependents</span>
                                                        <span className="text-text-muted"> (depth {r.depth})</span>
                                                    </div>
                                                ))}
                                        </div>
                                    ) : (
                                        <div className="px-3 py-2 text-text-muted">None detected.</div>
                                    )}
                                </div>

                                <div className="border border-border-subtle rounded-lg overflow-hidden">
                                    <div className="px-3 py-2 bg-surface-highlight/10 text-[11px] text-text-secondary flex items-center justify-between">
                                        <span>Conflicts</span>
                                        <span className="opacity-70">{structural.patterns.conflicts.length}</span>
                                    </div>
                                    {structural.patterns.conflicts.length > 0 ? (
                                        <div className="px-3 py-2 space-y-1">
                                            {structural.patterns.conflicts.slice(0, 6).map((c) => (
                                                <div key={`${c.claimA.id}:${c.claimB.id}`} className="text-text-primary">
                                                    <span className="font-medium">{c.claimA.label}</span>
                                                    <span className="text-text-muted"> vs </span>
                                                    <span className="font-medium">{c.claimB.label}</span>
                                                    {c.isBothConsensus && <span className="text-text-muted"> (both consensus)</span>}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="px-3 py-2 text-text-muted">None detected.</div>
                                    )}
                                </div>

                                <div className="border border-border-subtle rounded-lg overflow-hidden">
                                    <div className="px-3 py-2 bg-surface-highlight/10 text-[11px] text-text-secondary flex items-center justify-between">
                                        <span>Tradeoffs</span>
                                        <span className="opacity-70">{tradeoffCount}</span>
                                    </div>
                                    {tradeoffCount > 0 ? (
                                        <div className="px-3 py-2 space-y-1">
                                            {structural.patterns.tradeoffs.slice(0, 6).map((t) => (
                                                <div key={`${t.claimA.id}:${t.claimB.id}`} className="text-text-primary">
                                                    <span className="font-medium">{t.claimA.label}</span>
                                                    <span className="text-text-muted"> ↔ </span>
                                                    <span className="font-medium">{t.claimB.label}</span>
                                                    <span className="text-text-muted"> ({t.symmetry.replace("_", " ")})</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="px-3 py-2 text-text-muted">None detected.</div>
                                    )}
                                </div>

                                <div className="border border-border-subtle rounded-lg overflow-hidden">
                                    <div className="px-3 py-2 bg-surface-highlight/10 text-[11px] text-text-secondary flex items-center justify-between">
                                        <span>Convergence points</span>
                                        <span className="opacity-70">{convergencePointCount}</span>
                                    </div>
                                    {convergencePointCount > 0 ? (
                                        <div className="px-3 py-2 space-y-1">
                                            {structural.patterns.convergencePoints.slice(0, 6).map((p) => (
                                                <div key={`${p.targetId}:${p.edgeType}`} className="text-text-primary">
                                                    <span className="font-medium">{p.targetLabel}</span>
                                                    <span className="text-text-muted"> ← </span>
                                                    <span className="text-text-muted">{p.sourceLabels.slice(0, 3).join(", ")}</span>
                                                    {p.sourceLabels.length > 3 && <span className="text-text-muted"> +{p.sourceLabels.length - 3}</span>}
                                                    <span className="text-text-muted"> ({p.edgeType})</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="px-3 py-2 text-text-muted">None detected.</div>
                                    )}
                                </div>

                                <div className="border border-border-subtle rounded-lg overflow-hidden">
                                    <div className="px-3 py-2 bg-surface-highlight/10 text-[11px] text-text-secondary flex items-center justify-between">
                                        <span>Isolated claims</span>
                                        <span className="opacity-70">{isolatedCount}</span>
                                    </div>
                                    {isolatedCount > 0 ? (
                                        <div className="px-3 py-2 text-text-primary">
                                            {structural.patterns.isolatedClaims.slice(0, 10).join(", ")}
                                            {structural.patterns.isolatedClaims.length > 10 && (
                                                <span className="text-text-muted"> +{structural.patterns.isolatedClaims.length - 10}</span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="px-3 py-2 text-text-muted">None detected.</div>
                                    )}
                                </div>

                                <div className="border border-border-subtle rounded-lg overflow-hidden">
                                    <div className="px-3 py-2 bg-surface-highlight/10 text-[11px] text-text-secondary flex items-center justify-between">
                                        <span>Ghost analysis</span>
                                        <span className="opacity-70">{structural.ghostAnalysis.count}</span>
                                    </div>
                                    <div className="px-3 py-2 space-y-1 text-[11px]">
                                        <div className="text-text-primary">
                                            <span className="text-text-muted">May extend challengers:</span>{" "}
                                            <span className="font-medium">{structural.ghostAnalysis.mayExtendChallenger ? "yes" : "no"}</span>
                                        </div>
                                        {structural.ghostAnalysis.challengerIds.length > 0 && (
                                            <div className="text-text-primary">
                                                <span className="text-text-muted">Challengers:</span>{" "}
                                                <span className="font-medium">{structural.ghostAnalysis.challengerIds.slice(0, 8).join(", ")}</span>
                                                {structural.ghostAnalysis.challengerIds.length > 8 && (
                                                    <span className="text-text-muted"> +{structural.ghostAnalysis.challengerIds.length - 8}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
