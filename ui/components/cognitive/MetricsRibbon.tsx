import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CoreRatios, EnrichedClaim, ExploreAnalysis, GraphAnalysis, MapperArtifact, ProblemStructure } from '../../../shared/contract';
import { StructuralInsight } from "../StructuralInsight";
import { generateInsightsFromAnalysis } from '../../utils/graphAdapter';

interface MetricsRibbonProps {
    analysis?: ExploreAnalysis;
    artifact?: MapperArtifact;
    claimsCount: number;
    ghostCount: number;
    problemStructure?: ProblemStructure;
    // NEW Props
    graphAnalysis?: GraphAnalysis;
    enrichedClaims?: EnrichedClaim[];
    ratios?: CoreRatios;
    ghosts?: string[];
}

export const MetricsRibbon: React.FC<MetricsRibbonProps> = ({
    // analysis,
    // artifact,
    claimsCount,
    ghostCount,
    problemStructure,
    graphAnalysis,
    enrichedClaims,
    ratios,
    ghosts,
}) => {
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [showGuidance, setShowGuidance] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Generate insights for the advanced panel using the NEW standalone utility
    const insights = useMemo(() => {
        if (!graphAnalysis || !enrichedClaims) return [];
        // We filter our EnrichedClaims using the helper from graphAdapter
        return generateInsightsFromAnalysis(enrichedClaims, undefined, graphAnalysis);
    }, [enrichedClaims, graphAnalysis]);

    const leverageInversionCount = enrichedClaims?.filter(c => c.isLeverageInversion).length || 0;
    const evidenceGapCount = enrichedClaims?.filter(c => c.isEvidenceGap).length || 0;
    const conflictCount = enrichedClaims?.filter(c => c.isContested).length || 0;
    const effectiveGhostCount = ghosts?.length || ghostCount || 0;
    // const modelCount = ratios ? Math.round(ratios.concentration > 0 ? (1 / ratios.concentration) : 0) : ((artifact as any)?.model_count || 0);

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

    return (
        <div ref={containerRef} className="relative flex flex-wrap items-center gap-3 sm:gap-4 px-4 py-2 bg-surface-raised border border-border-subtle rounded-lg mb-4 text-xs">
            {problemStructure && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-highlight/20 border border-brand-500/30">
                    <span className="text-[10px] uppercase tracking-wide text-text-muted">
                        Structure
                    </span>
                    <span className="font-semibold text-brand-400 capitalize">
                        {problemStructure.primaryPattern}
                    </span>
                    {problemStructure.confidence < 0.7 && (
                        <span className="text-amber-400 text-xs" title="Low confidence">
                            ?
                        </span>
                    )}
                </div>
            )}

            <div className="w-px h-4 bg-border-subtle" />

            {/* High-Level Alerts */}
            {conflictCount > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/30">
                    <span className="text-xs">⚠️</span>
                    <span className="text-xs font-medium text-red-400">{conflictCount} Conflicts</span>
                </div>
            )}

            {leverageInversionCount > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-500/10 border border-purple-500/30">
                    <span className="text-xs">💎</span>
                    <span className="text-xs font-medium text-purple-400">
                        {leverageInversionCount} High-Leverage
                    </span>
                </div>
            )}

            {evidenceGapCount > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30">
                    <span className="text-xs">🎯</span>
                    <span className="text-xs font-medium text-amber-400">
                        {evidenceGapCount} Evidence Gaps
                    </span>
                </div>
            )}

            {effectiveGhostCount > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-500/10 border border-slate-500/30" title="Missing perspectives or unaddressed territory">
                    <span className="text-xs">👻</span>
                    <span className="text-xs font-medium text-slate-400">
                        {effectiveGhostCount} Ghosts
                    </span>
                </div>
            )}

            <div className="flex-1" />

            {/* Structure Meaning Toggle */}
            {problemStructure && (
                <button
                    type="button"
                    onClick={() => setShowGuidance((v) => !v)}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border-subtle hover:bg-surface-highlight/10 transition-colors"
                >
                    <span className="text-xs text-text-muted">What this means</span>
                    <span className="text-[10px] opacity-70">{showGuidance ? "▴" : "▾"}</span>
                </button>
            )}

            {/* Advanced Analysis Toggle */}
            {graphAnalysis && (
                <div className="relative ml-1">
                    <button
                        type="button"
                        onClick={() => setIsAdvancedOpen((v) => !v)}
                        className="p-1.5 rounded-md hover:bg-surface-highlight/10 text-text-muted hover:text-text-primary transition-colors"
                        aria-expanded={isAdvancedOpen}
                        title="Full structural analysis"
                    >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                            <circle cx="2" cy="8" r="1.5" />
                            <circle cx="8" cy="8" r="1.5" />
                            <circle cx="14" cy="8" r="1.5" />
                        </svg>
                    </button>

                    {/* Advanced Panel Dropdown */}
                    {isAdvancedOpen && (
                        <div className="absolute right-0 top-full mt-2 w-[460px] max-w-[calc(100vw-32px)] z-[60] bg-surface-raised/95 border border-border-subtle rounded-xl shadow-lg overflow-hidden backdrop-blur-sm">
                            <div className="px-4 py-3 border-b border-border-subtle flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="text-xs font-semibold text-text-primary">Structural Analysis</div>
                                    <div className="text-[11px] text-text-muted truncate">
                                        Generated dynamically from {claimsCount} claims
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

                            {/* Stats Grid */}
                            <div className="px-4 py-3 grid grid-cols-2 gap-3 text-[11px]">
                                {ratios && (
                                    <>
                                        <div className="bg-surface-highlight/10 border border-border-subtle rounded-lg p-2" title="Max support / modelCount. How much agreement exists (0 = total disagreement, 1 = unanimous)">
                                            <div className="text-text-muted">Concentration</div>
                                            <div className="text-text-primary font-medium">
                                                {Math.round(ratios.concentration * 100)}%
                                            </div>
                                        </div>
                                        <div className="bg-surface-highlight/10 border border-border-subtle rounded-lg p-2" title="Reinforcing edges / total edges between top claims. Do top claims support each other or conflict?">
                                            <div className="text-text-muted">Alignment</div>
                                            <div className="text-text-primary font-medium">
                                                {Math.round(ratios.alignment * 100)}%
                                            </div>
                                        </div>
                                        <div className="bg-surface-highlight/10 border border-border-subtle rounded-lg p-2" title="(Conflicts + tradeoffs) / total edges. How much disagreement exists.">
                                            <div className="text-text-muted">Tension</div>
                                            <div className="text-text-primary font-medium">
                                                {Math.round(ratios.tension * 100)}%
                                            </div>
                                        </div>
                                        <div className="bg-surface-highlight/10 border border-border-subtle rounded-lg p-2" title="(Components - 1) / (claims - 1). How disconnected is the graph (0 = fully connected, 1 = all isolated).">
                                            <div className="text-text-muted">Fragmentation</div>
                                            <div className="text-text-primary font-medium">
                                                {Math.round(ratios.fragmentation * 100)}%
                                            </div>
                                        </div>
                                        <div className="bg-surface-highlight/10 border border-border-subtle rounded-lg p-2" title="Longest chain / claim count. How sequential is reasoning (0 = flat, 1 = single chain).">
                                            <div className="text-text-muted">Depth</div>
                                            <div className="text-text-primary font-medium">
                                                {Math.round(ratios.depth * 100)}%
                                            </div>
                                        </div>
                                    </>
                                )}
                                <div className="bg-surface-highlight/10 border border-border-subtle rounded-lg p-2">
                                    <div className="text-text-muted">Hub Dominance</div>
                                    <div className="text-text-primary font-medium">
                                        {graphAnalysis && graphAnalysis.hubDominance > 0 ? `${graphAnalysis.hubDominance.toFixed(1)}x` : '-'}
                                    </div>
                                </div>
                            </div>

                            {/* Scrollable Insights & Ghosts List */}
                            <div className="px-4 pb-4 max-h-[350px] overflow-y-auto custom-scrollbar space-y-4">
                                <div className="border border-border-subtle rounded-lg overflow-hidden">
                                    <div className="px-3 py-2 bg-surface-highlight/10 text-[11px] text-text-secondary flex items-center justify-between">
                                        <span>Key Insights</span>
                                        <span className="opacity-70">{insights.length}</span>
                                    </div>

                                    {insights.length > 0 ? (
                                        <div className="px-3 py-2 space-y-2">
                                            {insights.map((insight, idx) => (
                                                <StructuralInsight
                                                    key={idx}
                                                    type={insight.type as any}
                                                    claim={insight.claim}
                                                    metadata={insight.metadata}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="px-3 py-2 text-text-muted italic text-[11px]">
                                            No critical structural anomalies detected.
                                        </div>
                                    )}
                                </div>

                                {ghosts && ghosts.length > 0 && (
                                    <div className="border border-border-subtle rounded-lg overflow-hidden">
                                        <div className="px-3 py-2 bg-surface-highlight/10 text-[11px] text-text-secondary flex items-center justify-between">
                                            <span>Ghosts (Epistemic Gaps)</span>
                                            <span className="opacity-70">{ghosts.length}</span>
                                        </div>
                                        <div className="px-3 py-2 space-y-2 bg-surface/50">
                                            {ghosts.map((ghost, idx) => (
                                                <div key={idx} className="text-[11px] text-text-muted italic border-l-2 border-slate-500/30 pl-2 py-0.5">
                                                    "{ghost}"
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Structure Guidance Tooltip */}
            {showGuidance && problemStructure && (
                <div className="absolute top-full left-0 mt-2 w-[420px] bg-surface-raised border border-border-subtle rounded-xl shadow-lg p-4 z-50">
                    <div className="text-sm font-semibold text-text-primary mb-2 capitalize">
                        {problemStructure.primaryPattern} Structure
                    </div>

                    <div className="text-xs text-text-secondary mb-3">
                        {problemStructure.implications.understand}
                    </div>

                    <div className="text-[11px] text-text-muted space-y-1">
                        <div className="font-medium text-text-secondary mb-1">Evidence:</div>
                        {problemStructure.evidence.map((e, i) => (
                            <div key={i}>• {e}</div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
