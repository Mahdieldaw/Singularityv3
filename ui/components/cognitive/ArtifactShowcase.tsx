import React, { useEffect, useMemo, useState, useCallback } from "react";
import { MapperArtifact, AiTurn, ExploreAnalysis, ProviderResponse } from "../../../shared/contract";
import { applyEdits } from "../../utils/apply-artifact-edits";
import { artifactEditsAtom } from "../../state/artifact-edits";
import { RawResponseCard } from "./cards/RawResponseCard";
import { cleanOptionsText, extractGraphTopologyAndStrip, parseMappingResponse } from "../../../shared/parsing-utils";

import { selectedArtifactsAtom, selectedModelsAtom, workflowProgressForTurnFamily } from "../../state/atoms";
import { SelectionBar } from "./SelectionBar";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { SouvenirCard } from "./cards/SouvenirCard";
import { GapsCard } from "./cards/GapsCard";
import { CouncilOrbs } from "../CouncilOrbs";
import RefinerDot from '../refinerui/RefinerDot';
import { activeSplitPanelAtom, includePromptInCopyAtom, isDecisionMapOpenAtom } from "../../state/atoms";
import { formatTurnForMd, formatDecisionMapForMd } from "../../utils/copy-format-utils";
import { getLatestResponse } from "../../utils/turn-helpers";
import { useRefinerOutput } from "../../hooks/useRefinerOutput";
import { useAntagonistOutput } from "../../hooks/useAntagonistOutput";
import { CopyButton } from "../CopyButton";
import {
    buildComparisonContent,
    buildDecisionTreeContent,
    buildDirectAnswerContent,
    buildExplorationContent,
    processArtifactForShowcase,
    type ProcessedShowcase,
    type SelectableShowcaseItem
} from "./content-builders";
import { DimensionFirstView } from "./DimensionFirstView";
import { LLM_PROVIDERS_CONFIG } from "../../constants";
import type { CognitiveTransitionOptions, SelectedArtifact } from "../../hooks/cognitive/useCognitiveMode";

const MapIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><line x1="3" x2="21" y1="9" y2="9" /><line x1="9" x2="9" y1="21" y2="9" /></svg>
);

const DimensionBadge: React.FC<{ dimension?: string }> = ({ dimension }) => {
    if (!dimension) return null;
    return (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-highlight/40 border border-border-subtle text-text-muted uppercase tracking-wide">
            {dimension.replace(/_/g, " ")}
        </span>
    );
};

const SupportMeta: React.FC<{ supportCount?: number; modelCount?: number }> = ({ supportCount, modelCount }) => {
    if (typeof supportCount !== "number" || supportCount <= 0) return null;
    const denom = typeof modelCount === "number" && modelCount > 0 ? modelCount : null;
    return (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-text-muted tabular-nums">
            {denom ? `${supportCount}/${denom}` : supportCount}
        </span>
    );
};

const normalizeTitleKey = (title: string): string =>
    String(title || "")
        .toLowerCase()
        .replace(/[`"'’“”]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const normalizeMaybeEscapedText = (text: string): string => {
    const raw = String(text || "");
    if (!raw.includes("\n") && raw.includes("\\n")) {
        return raw
            .replace(/\\n/g, "\n")
            .replace(/\\t/g, "\t")
            .replace(/\\"/g, '"');
    }
    return raw;
};

const buildOptionDetailMap = (optionsText: string | null | undefined): Map<string, string> => {
    const map = new Map<string, string>();
    if (!optionsText) return map;

    const normalizedText = normalizeMaybeEscapedText(String(optionsText));
    const lines = normalizedText.split("\n");

    const isThemeHeader = (line: string) => {
        const t = line.trim();
        if (!t) return false;
        if (/^Theme:\s*/i.test(t)) return true;
        if (/^#+\s+/.test(t)) return true;
        if (/^[\u{1F300}-\u{1FAD6}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(t)) return true;
        return false;
    };

    const titleLineMatch = (line: string): { title: string; desc: string } | null => {
        const t = line.trim();
        if (!t) return null;
        const boldMatch = t.match(/^\s*[-*•]?\s*\*\*([^*]+)\*\*\s*:\s*(.+)$/);
        if (boldMatch) return { title: boldMatch[1].trim(), desc: boldMatch[2].trim() };
        const plainMatch = t.match(/^\s*[-*•]?\s*\*{0,2}([^:]{3,}?)\*{0,2}\s*:\s*(.+)$/);
        if (plainMatch) return { title: plainMatch[1].trim(), desc: plainMatch[2].trim() };
        return null;
    };

    let currentTitle: string | null = null;
    let buffer: string[] = [];

    const flush = () => {
        if (!currentTitle) return;
        const key = normalizeTitleKey(currentTitle);
        const body = buffer.join(" ").replace(/\s+/g, " ").trim();
        if (key && body && !map.has(key)) map.set(key, body);
        currentTitle = null;
        buffer = [];
    };

    for (const rawLine of lines) {
        const trimmed = String(rawLine || "").trim();
        if (!trimmed) continue;
        if (isThemeHeader(trimmed)) {
            flush();
            continue;
        }
        const match = titleLineMatch(trimmed);
        if (match) {
            flush();
            currentTitle = match.title;
            if (match.desc) buffer.push(match.desc);
            continue;
        }
        if (currentTitle) buffer.push(trimmed.replace(/^\s*[-*•]\s+/, ""));
    }

    flush();
    return map;
};

const findBestOptionDetail = (optionDetailMap: Map<string, string>, itemText: string): string | null => {
    if (optionDetailMap.size === 0) return null;
    const key = normalizeTitleKey(itemText);
    if (!key) return null;
    const direct = optionDetailMap.get(key);
    if (direct) return direct;

    const keyTokens = new Set(key.split(" ").filter(Boolean));
    let best: { detail: string; score: number } | null = null;

    for (const [optKey, detail] of optionDetailMap.entries()) {
        if (!optKey) continue;
        if (optKey.includes(key) || key.includes(optKey)) {
            return detail;
        }

        const optTokens = optKey.split(" ").filter(Boolean);
        if (optTokens.length === 0) continue;
        let intersect = 0;
        for (const t of optTokens) if (keyTokens.has(t)) intersect += 1;
        const union = new Set([...keyTokens, ...optTokens]).size || 1;
        const score = intersect / union;
        if (!best || score > best.score) best = { detail, score };
    }

    if (best && best.score >= 0.55) return best.detail;
    return null;
};

const buildArtifactDetailMap = (artifact: MapperArtifact | null): Map<string, string> => {
    const map = new Map<string, string>();
    if (!artifact) return map;
    const anyArtifact = artifact as any;

    if (Array.isArray(anyArtifact?.options_inventory)) {
        for (const opt of anyArtifact.options_inventory) {
            const label = String(opt?.label || "").trim();
            const summary = String(opt?.summary || "").trim();
            if (!label || !summary) continue;
            const key = normalizeTitleKey(label);
            if (key && !map.has(key)) map.set(key, summary);
        }
    }

    for (const c of artifact.consensus?.claims || []) {
        const titleKey = normalizeTitleKey(c.text);
        const parts: string[] = [];
        if (c.applies_when) parts.push(`When: ${c.applies_when}`);
        if (typeof c.support_count === "number" && c.support_count > 0) parts.push(`Supported by ${c.support_count} models`);
        if (c.dimension) parts.push(`Dimension: ${c.dimension.replace(/_/g, " ")}`);
        const summary = parts.join(" · ").trim();
        if (titleKey && summary && !map.has(titleKey)) map.set(titleKey, summary);
    }

    for (const o of artifact.outliers || []) {
        const titleKey = normalizeTitleKey(o.insight);
        const parts: string[] = [];
        if (o.applies_when) parts.push(`When: ${o.applies_when}`);
        if (o.challenges) parts.push(`Challenges: ${o.challenges}`);
        if (o.raw_context) parts.push(o.raw_context);
        const summary = parts.join(" · ").trim();
        if (titleKey && summary && !map.has(titleKey)) map.set(titleKey, summary);
    }

    return map;
};

const SelectableCard: React.FC<{
    item: SelectableShowcaseItem;
    isSelected: boolean;
    onToggle: () => void;
    modelCount?: number;
    className?: string;
    headerRight?: React.ReactNode;
    subtitle?: React.ReactNode;
}> = ({ item, isSelected, onToggle, modelCount, className, headerRight, subtitle }) => {
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
                            <DimensionBadge dimension={item.dimension} />
                            <SupportMeta supportCount={item.graphSupportCount} modelCount={modelCount} />
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

const GhostDivider: React.FC<{ ghost: string }> = ({ ghost }) => (
    <div className="mt-4 p-4 rounded-xl border border-dashed border-border-subtle bg-surface-highlight/10">
        <div className="text-xs font-semibold text-text-secondary mb-2">👻 The Ghost</div>
        <div className="text-sm text-text-muted italic leading-relaxed">{ghost}</div>
    </div>
);

const ContainerPreview: React.FC<{
    type: ExploreAnalysis["containerType"];
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

const BifurcationSlot: React.FC<{
    left: SelectableShowcaseItem;
    right: SelectableShowcaseItem;
    axis?: string;
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    modelCount?: number;
}> = ({ left, right, axis, selectedIds, onToggle, modelCount }) => {
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
                        modelCount={modelCount}
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
                        modelCount={modelCount}
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

const RelationshipBundle: React.FC<{
    items: SelectableShowcaseItem[];
    edges: Array<{ source: string; target: string; type: string }>;
    selectedIds: Set<string>;
    onToggle: (id: string) => void;
    modelCount?: number;
}> = ({ items, edges, selectedIds, onToggle, modelCount }) => {
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
                                modelCount={modelCount}
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

const FrameChallengerCard: React.FC<{
    item: SelectableShowcaseItem;
    isSelected: boolean;
    onToggle: () => void;
    modelCount?: number;
    relatedEdgesCount?: number;
}> = ({ item, isSelected, onToggle, modelCount, relatedEdgesCount }) => {
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
                    <SupportMeta supportCount={item.graphSupportCount} modelCount={modelCount} />
                </div>
            </div>
            <div className="p-4 space-y-3">
                <SelectableCard
                    item={item}
                    isSelected={isSelected}
                    onToggle={onToggle}
                    modelCount={modelCount}
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

interface ArtifactShowcaseProps {
    mapperArtifact?: MapperArtifact;
    analysis?: ExploreAnalysis;
    turn: AiTurn;
    onUnderstand?: (options?: CognitiveTransitionOptions) => void;
    onDecide?: (options?: CognitiveTransitionOptions) => void;
    isLoading?: boolean;
}

export const ArtifactShowcase: React.FC<ArtifactShowcaseProps> = ({
    mapperArtifact,
    analysis,
    turn,
    onUnderstand,
    onDecide,
    isLoading = false,
}) => {
    const [selectedIds, setSelectedIds] = useAtom(selectedArtifactsAtom);
    const [dimensionViewOpen, setDimensionViewOpen] = useState(false);
    const selectedModels = useAtomValue(selectedModelsAtom);
    const [allEdits] = useAtom(artifactEditsAtom);
    const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
    const includePromptInCopy = useAtomValue(includePromptInCopyAtom);
    const setIsDecisionMapOpen = useSetAtom(isDecisionMapOpenAtom);

    // Hooks for Refiner and Antagonist
    const { output: refinerOutput, providerId: refinerPid } = useRefinerOutput(turn?.id);
    const { output: antagonistOutput, providerId: antagonistPid } = useAntagonistOutput(turn?.id);

    // Get modified artifact
    const currentTurnId = turn?.id || mapperArtifact?.turn?.toString() || "";
    const edits = allEdits.get(currentTurnId);
    const modifiedArtifact = useMemo(() => mapperArtifact ? applyEdits(mapperArtifact, edits) : null, [mapperArtifact, edits]);
    const userNotes = edits?.userNotes;
    const artifactForDisplay = modifiedArtifact || mapperArtifact || null;

    const workflowProgress = useAtomValue(workflowProgressForTurnFamily(currentTurnId));

    const availableProviders = useMemo(() => {
        const enabled = LLM_PROVIDERS_CONFIG.filter((p) => !!selectedModels?.[p.id]);
        return enabled.length > 0 ? enabled : LLM_PROVIDERS_CONFIG;
    }, [selectedModels]);

    const visibleProviderIds = useMemo(() => {
        const keys = Object.keys(turn?.batchResponses || {});
        if (keys.length > 0) return keys;
        // Fallback to currently selected models if no responses yet (early loading)
        return LLM_PROVIDERS_CONFIG.filter(p => !!selectedModels?.[p.id]).map(p => p.id);
    }, [turn, selectedModels]);

    const [nextProviderId, setNextProviderId] = useState<string>(() => availableProviders[0]?.id || "gemini");

    useEffect(() => {
        if (!availableProviders.some((p) => p.id === nextProviderId)) {
            setNextProviderId(availableProviders[0]?.id || "gemini");
        }
    }, [availableProviders, nextProviderId]);

    const selectedArtifacts = useMemo(() => {
        const out: SelectedArtifact[] = [];
        const ids = Array.from(selectedIds);
        ids.sort();
        for (const id of ids) {
            if (id.startsWith("consensus-")) {
                const idx = Number(id.slice("consensus-".length));
                const claim = artifactForDisplay?.consensus?.claims?.[idx];
                if (!claim) continue;
                out.push({
                    id,
                    kind: "consensus_claim",
                    text: claim.text,
                    dimension: claim.dimension,
                    meta: {
                        applies_when: claim.applies_when,
                        support_count: claim.support_count,
                        supporters: claim.supporters,
                    },
                });
                continue;
            }
            if (id.startsWith("outlier-")) {
                const idx = Number(id.slice("outlier-".length));
                const o = artifactForDisplay?.outliers?.[idx];
                if (!o) continue;
                out.push({
                    id,
                    kind: "outlier",
                    text: o.insight,
                    dimension: o.dimension,
                    source: o.source,
                    meta: {
                        type: o.type,
                        raw_context: o.raw_context,
                        applies_when: o.applies_when,
                        source_index: o.source_index,
                    },
                });
                continue;
            }
        }
        return out;
    }, [artifactForDisplay, selectedIds]);

    const toggleSelection = (id: string) => {
        setSelectedIds((draft) => {
            if (draft.has(id)) {
                draft.delete(id);
            } else {
                draft.add(id);
            }
        });
    };

    const dimensionCoverage = analysis?.dimensionCoverage || [];

    const gaps = useMemo(() => dimensionCoverage.filter((d) => d.is_gap), [dimensionCoverage]);

    const gapsCount = gaps.length;

    // Copy Handlers
    const handleCopyMapper = useCallback(() => {
        if (!mapperArtifact) return;

        // Find latest mapper response to get raw narrative/options
        const activeMapperPid = turn.meta?.mapper || Object.keys(turn.mappingResponses || {})[0];
        const mapperResp = activeMapperPid ? getLatestResponse(turn.mappingResponses?.[activeMapperPid]) : null;

        const narrative = mapperResp?.text || "";
        const options = (mapperResp?.meta as any)?.allAvailableOptions || null;
        const topology = (mapperResp?.meta as any)?.graphTopology || null;

        const md = formatDecisionMapForMd(narrative, options, topology);
        navigator.clipboard.writeText(md);
    }, [turn, mapperArtifact]);

    const handleCopyTurn = useCallback(() => {
        // Gather Batch Responses (latest for each provider)
        const batchResponses: Record<string, ProviderResponse> = {};
        Object.entries(turn.batchResponses || {}).forEach(([pid, resps]) => {
            const latest = getLatestResponse(resps);
            if (latest) batchResponses[pid] = latest;
        });

        // Mapping Data
        const activeMapperPid = turn.meta?.mapper || Object.keys(turn.mappingResponses || {})[0];
        const mapperResp = activeMapperPid ? getLatestResponse(turn.mappingResponses?.[activeMapperPid]) : null;
        const decisionMap = mapperResp ? {
            narrative: mapperResp.text || "",
            options: (mapperResp.meta as any)?.allAvailableOptions || null,
            topology: (mapperResp.meta as any)?.graphTopology || null
        } : null;

        const userPrompt = (turn as any)?.userPrompt ?? (turn as any)?.prompt ?? null;

        const md = formatTurnForMd(
            turn.id,
            userPrompt,
            null, // Analysis (Understand/Gauntlet) - not available in artifact view yet
            undefined,
            decisionMap,
            batchResponses,
            includePromptInCopy,
            refinerOutput,
            refinerPid,
            antagonistOutput,
            antagonistPid
        );
        navigator.clipboard.writeText(md);
    }, [turn, refinerOutput, refinerPid, antagonistOutput, antagonistPid, includePromptInCopy]);

    const contestedCount = useMemo(
        () => dimensionCoverage.filter((d) => d.is_contested).length,
        [dimensionCoverage]
    );
    const totalDims = dimensionCoverage.length;
    const settledCount = Math.max(0, totalDims - gapsCount - contestedCount);
    const ghostPresent = Boolean(mapperArtifact?.ghost);
    const dimsFoundCount = mapperArtifact?.dimensions_found?.length ?? totalDims;

    const activeMapperPid = useMemo(() => {
        if (turn.meta?.mapper) return turn.meta.mapper;
        const keys = Object.keys(turn.mappingResponses || {});
        return keys.length > 0 ? keys[0] : undefined;
    }, [turn.meta?.mapper, turn.mappingResponses]);

    const latestMapping = useMemo(() => {
        if (!activeMapperPid) return null;
        return getLatestResponse((turn.mappingResponses || {})[activeMapperPid]);
    }, [turn.mappingResponses, activeMapperPid]);

    const graphTopology = useMemo(() => {
        const fromMeta = (latestMapping?.meta as any)?.graphTopology || null;
        if (fromMeta) return fromMeta;
        const raw = String(latestMapping?.text || "");
        return extractGraphTopologyAndStrip(raw).topology;
    }, [latestMapping]);

    const mapperNarrative = useMemo(() => {
        const raw = String(latestMapping?.text || "");
        const parsed = parseMappingResponse(raw);
        return parsed.narrative || "";
    }, [latestMapping]);

    const mapperOptionsText = useMemo(() => {
        const fromMeta =
            (latestMapping?.meta as any)?.allAvailableOptions ||
            (latestMapping?.meta as any)?.all_available_options ||
            (latestMapping?.meta as any)?.options ||
            null;
        if (fromMeta) {
            return cleanOptionsText(normalizeMaybeEscapedText(String(fromMeta)));
        }
        const raw = String(latestMapping?.text || "");
        const parsed = parseMappingResponse(raw);
        return parsed.options ? cleanOptionsText(normalizeMaybeEscapedText(parsed.options)) : null;
    }, [latestMapping]);

    const artifactDetailMap = useMemo(() => buildArtifactDetailMap(artifactForDisplay), [artifactForDisplay]);
    const optionDetailMap = useMemo(() => buildOptionDetailMap(mapperOptionsText), [mapperOptionsText]);

    const processed: ProcessedShowcase | null = useMemo(() => {
        if (!artifactForDisplay) return null;
        return processArtifactForShowcase(artifactForDisplay, graphTopology);
    }, [artifactForDisplay, graphTopology]);

    const processedWithDetails: ProcessedShowcase | null = useMemo(() => {
        if (!processed) return null;
        if (artifactDetailMap.size === 0 && optionDetailMap.size === 0) return processed;

        const attach = (it: SelectableShowcaseItem): SelectableShowcaseItem => {
            if (it.detail) return it;
            if (!it.text) return it;
            const fromArtifact = findBestOptionDetail(artifactDetailMap, it.text);
            const found = fromArtifact || findBestOptionDetail(optionDetailMap, it.text);
            if (!found) return it;
            const clipped = found.length > 260 ? `${found.slice(0, 257)}…` : found;
            return { ...it, detail: clipped };
        };

        return {
            ...processed,
            frameChallengers: processed.frameChallengers.map(attach),
            bifurcations: processed.bifurcations.map((b) => ({
                ...b,
                left: attach(b.left),
                right: attach(b.right),
            })),
            bundles: processed.bundles.map((bundle) => ({
                ...bundle,
                items: bundle.items.map(attach),
            })),
            independentAnchors: processed.independentAnchors.map(attach),
        };
    }, [processed, artifactDetailMap, optionDetailMap]);

    const renderContainerPreview = () => {
        if (!artifactForDisplay || !analysis) return null;
        switch (analysis.containerType) {
            case "comparison_matrix":
                {
                    const content = buildComparisonContent(artifactForDisplay, analysis);
                    const dims = content?.dimensions || [];
                    return (
                        <ContainerPreview
                            type="comparison_matrix"
                            title="Comparison Matrix"
                            summary={
                                <div className="space-y-2">
                                    {dims.slice(0, 3).map((d, idx) => (
                                        <div key={idx} className="flex items-center justify-between gap-3 text-sm">
                                            <span className="text-text-muted">{d.name}</span>
                                            <span className="text-text-primary font-medium truncate max-w-[60%]">{d.winner}</span>
                                        </div>
                                    ))}
                                    {dims.length > 3 && (
                                        <div className="text-xs text-text-muted">+{dims.length - 3} more dimensions</div>
                                    )}
                                </div>
                            }
                        />
                    );
                }
            case "exploration_space":
                {
                    const content = buildExplorationContent(artifactForDisplay, analysis);
                    const paradigms = content?.paradigms || [];
                    return (
                        <ContainerPreview
                            type="exploration_space"
                            title="Exploration Space"
                            summary={
                                <div className="space-y-3">
                                    {content?.common_thread && (
                                        <div className="text-xs text-text-secondary italic">"{content.common_thread}"</div>
                                    )}
                                    <div className="flex flex-wrap gap-1.5">
                                        {paradigms.slice(0, 4).map((p, idx) => (
                                            <span key={idx} className="text-xs px-2 py-0.5 rounded bg-violet-500/10 text-violet-300">
                                                {p.name}
                                            </span>
                                        ))}
                                        {paradigms.length > 4 && (
                                            <span className="text-xs text-text-muted">+{paradigms.length - 4}</span>
                                        )}
                                    </div>
                                </div>
                            }
                        />
                    );
                }
            case "decision_tree":
                {
                    const content = buildDecisionTreeContent(artifactForDisplay, analysis);
                    const branches = content?.conditions?.length || 0;
                    return (
                        <ContainerPreview
                            type="decision_tree"
                            title="Decision Path"
                            summary={
                                <div className="space-y-2">
                                    <div>
                                        <div className="text-[11px] text-text-muted uppercase tracking-wide">Default</div>
                                        <div className="text-sm text-text-primary font-medium leading-relaxed">{content.default_path}</div>
                                    </div>
                                    {branches > 0 && (
                                        <div className="text-xs text-text-muted">{branches} conditional branches</div>
                                    )}
                                    {content.frame_challenger && (
                                        <div className="text-xs text-amber-300">Frame challenger present</div>
                                    )}
                                </div>
                            }
                        />
                    );
                }
            case "direct_answer":
                {
                    const content = buildDirectAnswerContent(artifactForDisplay, analysis);
                    const extraCount = content?.additional_context?.length || 0;
                    return (
                        <ContainerPreview
                            type="direct_answer"
                            title="Consensus Answer"
                            summary={
                                <div className="space-y-2">
                                    <div className="text-sm text-text-primary font-medium leading-relaxed">{content.answer}</div>
                                    {extraCount > 0 && (
                                        <div className="text-xs text-text-muted">+{extraCount} supporting points</div>
                                    )}
                                </div>
                            }
                        />
                    );
                }
            default:
                return null;
        }
    };

    return (
        <div className="w-full max-w-3xl mx-auto space-y-4 pb-12 animate-in fade-in duration-500">
            {mapperArtifact && (
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex flex-wrap gap-2 items-center flex-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                            🔶 Gaps: {gapsCount}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                            ⚔️ Contested: {contestedCount}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                            ✅ Settled: {settledCount}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                            Models: {mapperArtifact.model_count}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                            Dims: {dimsFoundCount}
                        </span>
                        {ghostPresent && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                                👻 Ghost present
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsDecisionMapOpen({ turnId: turn.id })}
                            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-raised hover:bg-surface-highlight border border-border-subtle text-xs text-text-secondary transition-colors"
                            title="Open Decision Map"
                        >
                            <MapIcon className="w-3.5 h-3.5" />
                            <span>Map</span>
                        </button>

                        <div className="flex items-center gap-1.5">
                            <RefinerDot
                                refiner={refinerOutput}
                                isLoading={false}
                                onClick={() => setActiveSplitPanel({ turnId: turn.id, providerId: '__trust__' })}
                            />
                        </div>
                        <div className="border-l border-border-subtle h-4 mx-1" />
                        <CopyButton
                            onCopy={handleCopyMapper}
                            label="Copy Mapper Output"
                            variant="icon"
                        />
                    </div>
                </div>
            )}

            {/* Source Layer: Council Orbs */}
            <div className="mb-2">
                <CouncilOrbs
                    providers={LLM_PROVIDERS_CONFIG}
                    turnId={currentTurnId}
                    voiceProviderId={turn.meta?.mapper || Object.keys(turn.mappingResponses || {})[0] || null}
                    visibleProviderIds={visibleProviderIds}
                    variant={!mapperArtifact ? "active" : "historical"}
                    workflowProgress={workflowProgress}
                    onOrbClick={(pid) => setActiveSplitPanel({ turnId: currentTurnId, providerId: pid })}
                />
            </div>

            {mapperArtifact ? (
                <>
                    {mapperArtifact.souvenir && <SouvenirCard content={mapperArtifact.souvenir} />}

                    <GapsCard artifact={mapperArtifact!} gaps={gaps} />

                    {mapperNarrative && (
                        <details className="bg-surface-raised border border-border-subtle rounded-xl overflow-hidden">
                            <summary className="cursor-pointer select-none px-4 py-3 text-xs text-text-secondary hover:bg-surface-highlight transition-colors">
                                📖 The landscape
                            </summary>
                            <div className="px-4 pb-4 text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
                                {mapperNarrative}
                            </div>
                        </details>
                    )}

                    {renderContainerPreview()}

                    {processedWithDetails && (
                        <div className="space-y-4 mt-2">
                            {processedWithDetails.frameChallengers.length > 0 && (
                                <div className="space-y-3">
                                    {processedWithDetails.frameChallengers.map((fc) => {
                                        const nodeId = fc.graphNodeId;
                                        const relatedEdgesCount =
                                            nodeId && graphTopology?.edges
                                                ? graphTopology.edges.filter((e: any) => e.source === nodeId || e.target === nodeId).length
                                                : 0;
                                        return (
                                            <FrameChallengerCard
                                                key={fc.id}
                                                item={fc}
                                                isSelected={selectedIds.has(fc.id)}
                                                onToggle={() => toggleSelection(fc.id)}
                                                modelCount={mapperArtifact.model_count}
                                                relatedEdgesCount={relatedEdgesCount}
                                            />
                                        );
                                    })}
                                </div>
                            )}

                            {processedWithDetails.bifurcations.length > 0 && (
                                <div className="space-y-3">
                                    {processedWithDetails.bifurcations.map((b, i) => (
                                        <BifurcationSlot
                                            key={`bif-${i}`}
                                            left={b.left}
                                            right={b.right}
                                            axis={b.axis}
                                            selectedIds={selectedIds}
                                            onToggle={toggleSelection}
                                            modelCount={mapperArtifact.model_count}
                                        />
                                    ))}
                                </div>
                            )}

                            {processedWithDetails.bundles.length > 0 && (
                                <div className="space-y-3">
                                    {processedWithDetails.bundles.map((bundle, i) => (
                                        <RelationshipBundle
                                            key={`bundle-${i}`}
                                            items={bundle.items}
                                            edges={bundle.edges}
                                            selectedIds={selectedIds}
                                            onToggle={toggleSelection}
                                            modelCount={mapperArtifact.model_count}
                                        />
                                    ))}
                                </div>
                            )}

                            {processedWithDetails.independentAnchors.length > 0 && (
                                <div className="space-y-2">
                                    {processedWithDetails.independentAnchors.map((item) => (
                                        <SelectableCard
                                            key={item.id}
                                            item={item}
                                            isSelected={selectedIds.has(item.id)}
                                            onToggle={() => toggleSelection(item.id)}
                                            modelCount={mapperArtifact.model_count}
                                            subtitle={
                                                item.detail ? (
                                                    <div className="text-xs text-text-muted leading-relaxed">{item.detail}</div>
                                                ) : null
                                            }
                                        />
                                    ))}
                                </div>
                            )}

                            {processedWithDetails.ghost && <GhostDivider ghost={processedWithDetails.ghost} />}
                        </div>
                    )}
                </>
            ) : (
                <div className="flex flex-col items-center justify-center p-12 bg-surface-highlight/10 rounded-xl border border-dashed border-border-subtle animate-pulse">
                    <div className="text-3xl mb-4">🧩</div>
                    <div className="text-text-secondary font-medium">Assemblying Mapper Artifact...</div>
                </div>
            )}

            {dimensionCoverage.length > 0 && (
                <div className="bg-surface-raised border border-border-subtle rounded-xl overflow-hidden">
                    <button
                        onClick={() => setDimensionViewOpen((v) => !v)}
                        className="w-full flex items-center justify-between p-3 hover:bg-surface-highlight transition-colors text-left"
                    >
                        <span className="text-xs text-text-secondary">
                            {dimensionViewOpen
                                ? "▾ Hide dimension breakdown"
                                : `▸ View by dimension (${dimensionCoverage.length})`}
                        </span>
                    </button>
                    {dimensionViewOpen && (
                        <div className="px-3 pb-3">
                            <DimensionFirstView artifact={mapperArtifact!} analysis={analysis!} />
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center gap-3 bg-surface-raised border border-border-subtle rounded-xl px-3 py-2">
                <div className="text-xs text-text-secondary">Model</div>
                <select
                    value={nextProviderId}
                    onChange={(e) => setNextProviderId(e.target.value)}
                    disabled={isLoading}
                    className="flex-1 bg-[#1a1b26] border border-border-subtle rounded px-2 py-1 text-sm text-gray-200 focus:outline-none focus:border-brand-500 disabled:opacity-50 appearance-none"
                >
                    {availableProviders.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name}
                        </option>
                    ))}
                </select>
                <div className="text-xs text-text-muted tabular-nums">
                    {selectedArtifacts.length > 0 ? `${selectedArtifacts.length} selected` : "None selected"}
                </div>
                <div className="border-l border-border-subtle h-4 mx-1" />
                <CopyButton
                    onCopy={handleCopyMapper}
                    label="Copy Mapper Output"
                    variant="icon"
                />
            </div>

            {mapperArtifact && analysis && (
                <div className="flex gap-3 mt-6 pt-2">
                    <button
                        onClick={() => onUnderstand?.({
                            providerId: nextProviderId,
                            selectedArtifacts,
                            mapperArtifact: modifiedArtifact!, // null check done above
                            userNotes
                        })}
                        disabled={isLoading}
                        className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 
                                hover:from-blue-500 hover:to-indigo-500 
                                text-white rounded-lg font-medium transition-all
                                disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        🧠 Understand
                    </button>
                    <button
                        onClick={() => onDecide?.({
                            providerId: nextProviderId,
                            selectedArtifacts,
                            mapperArtifact: modifiedArtifact!,
                            userNotes
                        })}
                        disabled={isLoading}
                        className={`flex-1 px-4 py-3 text-white rounded-lg font-medium transition-all
                                disabled:opacity-50 disabled:cursor-not-allowed
                                ${analysis.escapeVelocity
                                ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-400/30"
                                : "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500"}`}
                    >
                        {analysis.escapeVelocity ? "🚀 Ready to Decide" : "⚡ Decide"}
                    </button>
                </div>
            )}

            <RawResponseCard turn={turn} />

            <SelectionBar />

            {/* Contextual Copy Turn Button */}
            <div className="mt-6 pt-4 border-t border-border-subtle/30">
                <CopyButton
                    onCopy={handleCopyTurn}
                    label="Copy Full Turn"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-raised hover:bg-surface-highlight border border-border-subtle text-xs text-text-secondary transition-all"
                >
                    <span>📋 Copy Turn</span>
                </CopyButton>
            </div>
        </div>
    );
};
