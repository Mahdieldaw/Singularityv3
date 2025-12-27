import React from "react";
import { DimensionCoverage, MapperArtifact } from "../../../../shared/contract";

interface GapsCardProps {
    artifact: MapperArtifact;
    gaps: DimensionCoverage[];
}

const humanizeDimension = (dimension: string): string => dimension.replace(/[_-]+/g, " ");

const truncate = (text: string, maxLen: number): string =>
    text.length <= maxLen ? text : `${text.slice(0, Math.max(0, maxLen - 1))}…`;

export const GapsCard: React.FC<GapsCardProps> = ({ artifact, gaps }) => {
    if (!gaps.length) return null;

    return (
        <div className="bg-surface-raised border border-amber-500/20 rounded-xl overflow-hidden transition-all duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-lg shadow-inner">
                        🔶
                    </div>
                    <div>
                        <h3 className="font-semibold text-text-primary">Where Consensus is Blind</h3>
                        <p className="text-xs text-text-muted">
                            {gaps.length} gap dimension{gaps.length !== 1 ? "s" : ""}
                        </p>
                    </div>
                </div>
            </div>

            <div className="px-4 pb-4 pt-4 space-y-3">
                {gaps.map((coverage) => {
                    const lead = artifact.outliers.find((o) => o.dimension === coverage.dimension) || null;
                    return (
                        <div
                            key={coverage.dimension}
                            className="bg-surface-base border border-border-subtle rounded-lg p-3"
                        >
                            <div className="flex items-center gap-2 mb-1.5">
                                <div className="text-[10px] uppercase tracking-wider text-amber-400 font-bold">
                                    {humanizeDimension(coverage.dimension)}
                                </div>
                                <div className="ml-auto text-[10px] text-text-muted font-mono px-1.5 py-0.5 rounded bg-surface-highlight border border-border-subtle">
                                    Outliers only
                                </div>
                            </div>

                            {lead ? (
                                <>
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <div className="text-sm text-text-primary leading-relaxed font-medium">
                                            {truncate(lead.insight, 220)}
                                        </div>
                                        <span className="flex-shrink-0 text-[10px] text-text-muted font-mono px-1.5 py-0.5 rounded bg-surface-highlight border border-border-subtle">
                                            {lead.source}
                                        </span>
                                    </div>
                                    {lead.applies_when && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <span className="text-[10px] text-intent-info bg-intent-info/10 px-1.5 py-0.5 rounded border border-intent-info/20">
                                                When: {truncate(lead.applies_when, 120)}
                                            </span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-xs text-text-muted">No outlier detail available.</div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

