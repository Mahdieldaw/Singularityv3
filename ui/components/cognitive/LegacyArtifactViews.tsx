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


export const GhostDivider: React.FC<{ ghost: string }> = ({ ghost }) => (
    <div className="mt-4 p-4 rounded-xl border border-dashed border-border-subtle bg-surface-highlight/10">
        <div className="text-xs font-semibold text-text-secondary mb-2">👻 The Ghost</div>
        <div className="text-sm text-text-muted italic leading-relaxed">{ghost}</div>
    </div>
);

export const ContainerPreview: React.FC<{
    type: "direct_answer" | "decision_tree" | "comparison_matrix" | string;
    title: string;
    summary: React.ReactNode;
}> = ({ type, title, summary }) => {
    const wrapperClass =
        type === "direct_answer"
            ? "bg-emerald-500/5 border border-emerald-500/20"
            : type === "decision_tree"
                ? "bg-blue-500/5 border border-blue-500/20"
                : type === "comparison_matrix"
                    ? "bg-purple-500/5 border border-purple-500/20"
                    : "bg-violet-500/5 border border-violet-500/20";

    const headerClass =
        type === "direct_answer"
            ? "border-emerald-500/10"
            : type === "decision_tree"
                ? "border-blue-500/10"
                : type === "comparison_matrix"
                    ? "border-purple-500/10"
                    : "border-violet-500/10";

    const titleClass =
        type === "direct_answer"
            ? "text-emerald-300"
            : type === "decision_tree"
                ? "text-blue-300"
                : type === "comparison_matrix"
                    ? "text-purple-300"
                    : "text-violet-300";

    return (
        <div className={`${wrapperClass} rounded-xl overflow-hidden`}>
            <div className={`px-4 py-3 flex items-center justify-between border-b ${headerClass}`}>
                <div className={`text-xs font-semibold uppercase tracking-wide ${titleClass}`}>{title}</div>
                <div className="text-[11px] text-text-muted">↓ All claims selectable below</div>
            </div>
            <div className="p-4">{summary}</div>
        </div>
    );
};

export const BifurcationSlot: React.FC<{
    left: SelectableShowcaseItem;
    right: SelectableShowcaseItem;
    axis?: string;
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    // modelCount?: number;
}> = ({ left, right, axis, selectedIds, onToggle }) => {
    const leftSelected = selectedIds.has(left.id);
    const rightSelected = selectedIds.has(right.id);
    const dimLeft = leftSelected && !rightSelected;
    const dimRight = rightSelected && !leftSelected;

    return (
        <div className="bg-surface-raised border border-border-subtle rounded-xl overflow-hidden">
            {axis && (
                <div className="px-4 py-2 text-[11px] text-text-muted border-b border-border-subtle/40">
                    <span className="font-medium text-text-secondary">Axis:</span> {axis}
                </div>
            )}
            <div className="grid grid-cols-2 divide-x divide-border-subtle/40">
                <div className={dimLeft ? "" : dimRight ? "opacity-50" : ""}>
                    <SelectableCard
                        item={left}
                        isSelected={leftSelected}
                        onToggle={() => onToggle(left.id)}
                        // modelCount={modelCount}
                        className="rounded-none border-0"
                        subtitle={
                            left.detail ? (
                                <div className="text-xs text-text-muted leading-relaxed">{left.detail}</div>
                            ) : null
                        }
                    />
                </div>
                <div className={dimRight ? "" : dimLeft ? "opacity-50" : ""}>
                    <SelectableCard
                        item={right}
                        isSelected={rightSelected}
                        onToggle={() => onToggle(right.id)}
                        // modelCount={modelCount}
                        className="rounded-none border-0"
                        subtitle={
                            right.detail ? (
                                <div className="text-xs text-text-muted leading-relaxed">{right.detail}</div>
                            ) : null
                        }
                    />
                </div>
            </div>
        </div>
    );
};

const relationshipLabel = (
    a: SelectableShowcaseItem,
    b: SelectableShowcaseItem,
    edges: Array<{ source: string; target: string; type: string }>
): { text: string; tone: string } | null => {
    const aid = a.graphNodeId;
    const bid = b.graphNodeId;
    if (!aid || !bid) return null;
    const direct = edges.find((e) => e.source === aid && e.target === bid);
    const reverse = edges.find((e) => e.source === bid && e.target === aid);
    const chosen = direct || reverse;
    if (!chosen) return null;
    const t = String(chosen.type || "").toLowerCase();
    if (t === "prerequisite" || t.includes("prereq")) return { text: "↓ enables", tone: "text-emerald-300" };
    if (t === "complements" || t.includes("complement")) return { text: "↔ complements", tone: "text-emerald-300" };
    return null;
};

export const RelationshipBundle: React.FC<{
    items: SelectableShowcaseItem[];
    edges: Array<{ source: string; target: string; type: string }>;
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    // modelCount?: number;
}> = ({ items, edges, selectedIds, onToggle }) => {
    const scrollable = items.length >= 5;
    return (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-emerald-500/10 flex items-center justify-between">
                <div className="text-xs font-semibold text-emerald-300 uppercase tracking-wide">Relationship Bundle</div>
                <div className="text-[11px] text-text-muted">{items.length} items</div>
            </div>
            <div className={`${scrollable ? "max-h-80 overflow-y-auto" : ""} divide-y divide-emerald-500/10`}>
                {items.map((item, idx) => {
                    const rel = idx > 0 ? relationshipLabel(items[idx - 1], item, edges) : null;
                    return (
                        <div key={item.id} className="px-4 py-3">
                            {rel && (
                                <div className={`text-[11px] mb-2 ${rel.tone}`}>
                                    {rel.text}
                                </div>
                            )}
                            <SelectableCard
                                item={item}
                                isSelected={selectedIds.has(item.id)}
                                onToggle={() => onToggle(item.id)}
                                // modelCount={modelCount}
                                className="bg-transparent border-border-subtle/60 hover:bg-surface-highlight/30"
                                subtitle={
                                    item.detail ? (
                                        <div className="text-xs text-text-muted leading-relaxed">{item.detail}</div>
                                    ) : null
                                }
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const FrameChallengerCard: React.FC<{
    item: SelectableShowcaseItem;
    isSelected: boolean;
    onToggle: () => void;
    // modelCount?: number;
    relatedEdgesCount?: number;
}> = ({ item, isSelected, onToggle, relatedEdgesCount }) => {
    return (
        <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/25 rounded-xl overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between border-b border-amber-500/15">
                <div className="text-xs font-semibold text-amber-300 uppercase tracking-wide">Frame Challenger</div>
                <div className="flex items-center gap-2">
                    {typeof relatedEdgesCount === "number" && relatedEdgesCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-200 tabular-nums">
                            {relatedEdgesCount} links
                        </span>
                    )}
                    <SupportMeta supportCount={item.graphSupportCount} />
                </div>
            </div>
            <div className="p-4 space-y-3">
                <SelectableCard
                    item={item}
                    isSelected={isSelected}
                    onToggle={onToggle}
                    // modelCount={modelCount}
                    className="bg-transparent border-amber-500/20 hover:border-amber-400/40"
                    subtitle={
                        <div className="mt-2 space-y-2">
                            {item.detail ? (
                                <div className="text-xs text-text-muted leading-relaxed">{item.detail}</div>
                            ) : null}
                            {item.challenges ? (
                                <div className="p-2 rounded bg-black/20 border border-amber-500/15 text-xs text-amber-100/90">
                                    <span className="text-amber-300 font-semibold">Challenges:</span> {item.challenges}
                                </div>
                            ) : null}
                        </div>
                    }
                />
            </div>
        </div>
    );
};
