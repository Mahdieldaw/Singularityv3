import React from "react";
import { SelectableShowcaseItem } from "./content-builders";

export const DimensionBadge: React.FC<{ dimension?: string }> = ({ dimension }) => {
    if (!dimension) return null;
    return (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-highlight/40 border border-border-subtle text-text-muted uppercase tracking-wide">
            {dimension.replace(/_/g, " ")}
        </span>
    );
};

export const UnifiedMetaBadges: React.FC<{ item: SelectableShowcaseItem }> = ({ item }) => {
    const src = item.unifiedSource;
    const confidence = item.matchConfidence;

    const sourceBadge = (() => {
        if (!src) return null;
        if (src === "matched") {
            return (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 uppercase tracking-wide">
                    matched
                </span>
            );
        }
        if (src === "inventory_only") {
            return (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-200 uppercase tracking-wide">
                    options only
                </span>
            );
        }
        return null;
    })();

    const confidenceBadge =
        src === "matched" && confidence && confidence !== "none" ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-text-muted tabular-nums">
                match: {confidence}
            </span>
        ) : null;

    const artifactIdBadge = item.artifactOriginalId ? (
        <span className="text-[10px] text-text-muted font-mono px-1.5 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle">
            {item.artifactOriginalId}
        </span>
    ) : null;

    if (!sourceBadge && !confidenceBadge && !artifactIdBadge) return null;

    return (
        <>
            {sourceBadge}
            {confidenceBadge}
            {artifactIdBadge}
        </>
    );
};

export const SupportMeta: React.FC<{ supportCount?: number }> = ({ supportCount }) => {
    if (typeof supportCount !== "number" || supportCount <= 0) return null;
    // const denom = typeof modelCount === "number" && modelCount > 0 ? modelCount : null;
    return (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-text-muted tabular-nums">
            {supportCount}
        </span>
    );
};

export const SelectableCard: React.FC<{
    item: SelectableShowcaseItem;
    isSelected: boolean;
    onToggle: () => void;
    // modelCount?: number;
    className?: string;
    headerRight?: React.ReactNode;
    subtitle?: React.ReactNode;
}> = ({ item, isSelected, onToggle, className, headerRight, subtitle }) => {
    return (
        <div
            onClick={onToggle}
            className={`
                p-3 rounded-lg border cursor-pointer transition-all duration-200
                ${isSelected
                    ? "bg-primary-500/10 border-primary-500/40 shadow-sm"
                    : "bg-surface-base border-border-subtle hover:border-border-strong hover:bg-surface-highlight"}
                ${className || ""}
            `}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                    <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? "bg-primary-500 border-primary-500" : "border-text-muted"}`}>
                        {isSelected && <span className="text-white text-[10px] pb-0.5">✓</span>}
                    </div>
                    <div className="space-y-1">
                        <div className="text-sm text-text-primary leading-relaxed font-medium">{item.text}</div>
                        {subtitle}
                        <div className="flex items-center gap-2">
                            <UnifiedMetaBadges item={item} />
                            <DimensionBadge dimension={item.dimension} />
                            <SupportMeta supportCount={item.graphSupportCount} />
                            {item.source && (
                                <span className="text-[10px] text-text-muted font-mono px-1.5 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle">
                                    {item.source}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                {headerRight}
            </div>
        </div>
    );
};
