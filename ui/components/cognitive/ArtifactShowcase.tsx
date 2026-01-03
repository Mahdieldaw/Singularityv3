import React, { useEffect, useMemo, useCallback, useState } from "react";
import { MapperArtifact, AiTurn, ExploreAnalysis, ProviderResponse } from "../../../shared/contract";
import { applyEdits } from "../../utils/apply-artifact-edits";
import { artifactEditsAtom } from "../../state/artifact-edits";
import { RawResponseCard } from "./cards/RawResponseCard";
import { cleanOptionsText, extractGraphTopologyAndStrip, parseMappingResponse } from "../../../shared/parsing-utils";
import DecisionMapGraph from "../DecisionMapGraph";
import { adaptGraphTopology } from "../../utils/graphAdapter";

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
import { PipelineErrorBanner } from "../PipelineErrorBanner";
import { CopyButton } from "../CopyButton";
import {
    reconcileOptions,
    unifiedOptionsToShowcaseItems,
    processShowcaseItems,
    type ProcessedShowcase,
    type SelectableShowcaseItem
} from "./content-builders";
import { SelectableCard, GhostDivider } from "./LegacyArtifactViews";
import { LLM_PROVIDERS_CONFIG } from "../../constants";
import type { CognitiveTransitionOptions, SelectedArtifact } from "../../hooks/cognitive/useCognitiveMode";

const MapIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><line x1="3" x2="21" y1="9" y2="9" /><line x1="9" x2="9" y1="21" y2="9" /></svg>
);



const FormattedNarrative: React.FC<{
    text: string;
    onToggle: (id: string) => void;
    selectedIds: Set<string>;
}> = ({ text, onToggle, selectedIds }) => {
    // Split by the anchor pattern: **[Label|ID]**
    // Regex captures: 1=Label, 2=ID
    const parts = text.split(/(\*\*\[.*?\|.*?\]\*\*)/g);

    return (
        <span>
            {parts.map((part, i) => {
                const match = part.match(/^\*\*\[(.*?)\|(.*?)\]\*\*$/);
                if (match) {
                    const label = match[1];
                    const id = match[2];
                    const isSelected = selectedIds.has(id);
                    return (
                        <span
                            key={i}
                            onClick={(e) => { e.stopPropagation(); onToggle(id); }}
                            className={`
                                inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded-md cursor-pointer transition-all border
                                ${isSelected
                                    ? "bg-primary-500/20 border-primary-500/40 text-primary-200"
                                    : "bg-surface-highlight border-border-strong text-text-secondary hover:bg-surface-highlight/80 hover:border-brand-400/50"}
                            `}
                            title={`Toggle claim ${id}`}
                        >
                            <span className="font-medium text-[13px]">{label}</span>
                            {isSelected && <span className="text-[10px] opacity-70">✓</span>}
                        </span>
                    );
                }
                // Render Bold text **text** correctly too? 
                // For now just return text, but maybe handle bolding for emphasis
                return <span key={i} className="text-text-primary/90">{part.replace(/\*\*/g, '')}</span>;
            })}
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

    // V3: Iterate claims
    for (const c of artifact.claims || []) {
        const titleKey = normalizeTitleKey(c.label);
        const parts: string[] = [];
        if (c.quote) parts.push(`"${c.quote}"`);
        if (typeof c.support_count === "number" && c.support_count > 0) parts.push(`Supported by ${c.support_count} models`);
        if (c.type) parts.push(`Type: ${c.type}`);
        const summary = parts.join(" · ").trim();
        if (titleKey && summary && !map.has(titleKey)) map.set(titleKey, summary);
    }

    return map;
};



interface ArtifactShowcaseProps {
    mapperArtifact?: MapperArtifact;
    analysis?: ExploreAnalysis;
    turn: AiTurn;
    onUnderstand?: (options?: CognitiveTransitionOptions) => void;
    onDecide?: (options?: CognitiveTransitionOptions) => void;
    onRetryMapping?: (pid: string) => void;
    isLoading?: boolean;
}

export const ArtifactShowcase: React.FC<ArtifactShowcaseProps> = ({
    mapperArtifact,
    analysis,
    turn,
    onUnderstand,
    onDecide,
    onRetryMapping,
    isLoading = false,
}) => {
    const [selectedIds, setSelectedIds] = useAtom(selectedArtifactsAtom);
    const selectedModels = useAtomValue(selectedModelsAtom);
    const [allEdits] = useAtom(artifactEditsAtom);
    const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
    const includePromptInCopy = useAtomValue(includePromptInCopyAtom);
    const setIsDecisionMapOpen = useSetAtom(isDecisionMapOpenAtom);

    // Hooks for Refiner and Antagonist
    const { output: refinerOutput, providerId: refinerPid, error: refinerError } = useRefinerOutput(turn?.id);
    const { output: antagonistOutput, providerId: antagonistPid, error: antagonistError } = useAntagonistOutput(turn?.id);

    // Get modified artifact
    const currentTurnId = turn?.id || mapperArtifact?.turn?.toString() || "";
    const edits = allEdits.get(currentTurnId);
    const modifiedArtifact = useMemo(() => mapperArtifact ? applyEdits(mapperArtifact, edits) : null, [mapperArtifact, edits]);
    const userNotes = edits?.userNotes;
    const artifactForDisplay = modifiedArtifact || mapperArtifact || null;

    const activeMapperPid = useMemo(() => {
        if (turn.meta?.mapper) return turn.meta.mapper;
        const keys = Object.keys(turn.mappingResponses || {});
        return keys.length > 0 ? keys[0] : undefined;
    }, [turn.meta?.mapper, turn.mappingResponses]);

    const latestMapping = useMemo(() => {
        if (!activeMapperPid) return null;
        return getLatestResponse((turn.mappingResponses || {})[activeMapperPid]);
    }, [turn.mappingResponses, activeMapperPid]);

    const parsedMapping = useMemo(() => {
        const raw = String(latestMapping?.text || "");
        return parseMappingResponse(raw);
    }, [latestMapping]);

    const graphTopology = useMemo(() => {
        const fromMeta = (latestMapping?.meta as any)?.graphTopology || null;
        if (fromMeta) return fromMeta;
        const raw = String(latestMapping?.text || "");
        return extractGraphTopologyAndStrip(raw).topology || parsedMapping.graphTopology;
    }, [latestMapping, parsedMapping.graphTopology]);

    const mapperNarrative = useMemo(() => {
        return parsedMapping.narrative || "";
    }, [parsedMapping.narrative]);

    const mapperNarrativeAnchorCount = useMemo(() => {
        const matches = mapperNarrative.match(/\*\*\[[^\]|]+\|[^\]]+\]\*\*/g);
        return matches ? matches.length : 0;
    }, [mapperNarrative]);

    const mapperOptionsText = useMemo(() => {
        const fromMeta =
            (latestMapping?.meta as any)?.allAvailableOptions ||
            (latestMapping?.meta as any)?.all_available_options ||
            (latestMapping?.meta as any)?.options ||
            null;
        if (fromMeta) {
            return cleanOptionsText(normalizeMaybeEscapedText(String(fromMeta)));
        }
        return parsedMapping.options ? cleanOptionsText(normalizeMaybeEscapedText(parsedMapping.options)) : null;
    }, [latestMapping, parsedMapping.options]);

    const graphData = useMemo(() => {
        const claims = Array.isArray(artifactForDisplay?.claims) ? artifactForDisplay!.claims : [];
        const edges = Array.isArray(artifactForDisplay?.edges) ? artifactForDisplay!.edges : [];
        if (claims.length > 0 || edges.length > 0) return { claims, edges };
        return adaptGraphTopology(graphTopology);
    }, [artifactForDisplay, graphTopology]);

    const graphContainerRef = React.useRef<HTMLDivElement>(null);
    const [graphDims, setGraphDims] = useState<{ w: number; h: number }>({ w: 0, h: 320 });

    useEffect(() => {
        const update = () => {
            const el = graphContainerRef.current;
            if (!el) return;
            const w = el.clientWidth;
            const h = Math.max(260, Math.min(420, Math.floor(w * 0.6)));
            setGraphDims({ w, h });
        };

        update();
        const raf = requestAnimationFrame(update);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('resize', update);
            cancelAnimationFrame(raf);
        };
    }, []);

    const artifactDetailMap = useMemo(() => buildArtifactDetailMap(artifactForDisplay), [artifactForDisplay]);
    const optionDetailMap = useMemo(() => buildOptionDetailMap(mapperOptionsText), [mapperOptionsText]);

    const reconciliation = useMemo(
        () => reconcileOptions(mapperOptionsText, artifactForDisplay),
        [mapperOptionsText, artifactForDisplay]
    );

    const optionById = useMemo(() => {
        const map = new Map<string, (typeof reconciliation.options)[number]>();
        for (const opt of reconciliation.options) map.set(opt.id, opt);
        return map;
    }, [reconciliation]);

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
            // Check unified items first (reconciled)
            const unified = optionById.get(id);
            if (unified) {
                const ad = unified.artifactData;

                let kind = "inventory_option";
                let text = unified.label;
                let dimension = ad?.dimension;

                const meta: any = {
                    summary: unified.summary,
                    citations: unified.citations,
                    source: unified.source,
                    inventoryIndex: unified.inventoryIndex,
                    matchConfidence: unified.matchConfidence,
                    artifact: ad || null,
                };

                // If linked to a V3 claim (via ID matching)
                if (ad && ad.originalId && artifactForDisplay && artifactForDisplay.claims) {
                    const claim = artifactForDisplay.claims.find(c => c.id === ad.originalId);
                    if (claim) {
                        kind = "consensus_claim"; // Reuse "consensus_claim" kind for compatibility
                        text = claim.label || claim.text;
                        meta.supporters = claim.supporters;
                        meta.support_count = claim.support_count;
                        meta.quote = claim.quote;
                        meta.type = claim.type;
                    }
                }

                out.push({
                    id,
                    kind,
                    text,
                    dimension,
                    meta
                });
                continue;
            }

            // Fallback: Check Artifact directly if not in reconciled list (e.g. from graph only)
            if (artifactForDisplay && artifactForDisplay.claims) {
                const claim = artifactForDisplay.claims.find(c => c.id === id);
                if (claim) {
                    out.push({
                        id,
                        kind: "consensus_claim",
                        text: claim.label || claim.text,
                        meta: {
                            supporters: claim.supporters,
                            support_count: claim.support_count,
                            quote: claim.quote,
                            type: claim.type
                        }
                    });
                }
            }
        }
        return out;
    }, [artifactForDisplay, selectedIds, optionById]);

    const toggleSelection = (id: string) => {
        setSelectedIds((draft) => {
            if (draft.has(id)) {
                draft.delete(id);
            } else {
                draft.add(id);
            }
        });
    };

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

    const processed: ProcessedShowcase | null = useMemo(() => {
        if (!artifactForDisplay) return null;
        const reconciledItems = unifiedOptionsToShowcaseItems(reconciliation);
        return processShowcaseItems(reconciledItems, graphTopology, artifactForDisplay?.ghosts?.[0] ?? null);
    }, [artifactForDisplay, graphTopology, reconciliation]);

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

    const claimsCount = mapperArtifact?.claims?.length || 0;
    const ghostCount = mapperArtifact?.ghosts?.length || 0;

    return (
        <div className="w-full max-w-3xl mx-auto space-y-4 pb-12 animate-in fade-in duration-500">
            {mapperArtifact && (
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex flex-wrap gap-2 items-center flex-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                            Claims: {claimsCount}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                            Models: {mapperArtifact.model_count}
                        </span>
                        {ghostCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                                👻 {ghostCount} {ghostCount === 1 ? 'Ghost' : 'Ghosts'}
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

                    <GapsCard artifact={mapperArtifact!} />

                    {mapperNarrative && (
                        <div className="bg-surface-raised border border-border-subtle rounded-xl overflow-hidden mb-4">
                            <div className="px-4 py-3 border-b border-border-subtle bg-surface-highlight/10 flex items-center justify-between">
                                <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                                    📖 The Landscape
                                </div>
                                <div className="text-[10px] text-text-muted">
                                    {mapperNarrativeAnchorCount} clickable claims
                                </div>
                            </div>
                            {graphData.claims.length > 0 && (
                                <div className="px-4 py-4 border-b border-border-subtle bg-surface">
                                    <div ref={graphContainerRef} className="w-full">
                                        {graphDims.w > 0 && (
                                            <DecisionMapGraph
                                                claims={graphData.claims}
                                                edges={graphData.edges}
                                                width={graphDims.w}
                                                height={graphDims.h}
                                                onNodeClick={(node) => toggleSelection(node.id)}
                                                selectedClaimIds={Array.from(selectedIds)}
                                            />
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="px-5 py-5 text-sm text-text-muted leading-relaxed whitespace-pre-wrap font-serif">
                                <FormattedNarrative
                                    text={mapperNarrative}
                                    onToggle={toggleSelection}
                                    selectedIds={selectedIds}
                                />
                            </div>
                        </div>
                    )}

                    {/* V3: No Container Previews. The Narrative is the structure. */
                    /* However, we still show Challengers, Bundles, etc. if they exist in the graph */}

                    {processedWithDetails && (
                        <div className="space-y-4 mt-2">


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
            ) : (latestMapping?.status === 'error' || (latestMapping?.status as string) === 'failed') ? (
                <div className="py-4">
                    <PipelineErrorBanner
                        type="mapping"
                        failedProviderId={activeMapperPid || ""}
                        onRetry={(pid) => onRetryMapping?.(pid)}
                        errorMessage={typeof (latestMapping?.meta as any)?.error === 'string' ? (latestMapping?.meta as any)?.error : (latestMapping?.meta as any)?.error?.message}
                        requiresReauth={!!(latestMapping?.meta as any)?.error?.requiresReauth}
                    />
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center p-12 bg-surface-highlight/10 rounded-xl border border-dashed border-border-subtle animate-pulse">
                    <div className="text-3xl mb-4">🧩</div>
                    <div className="text-text-secondary font-medium">Assemblying Mapper Artifact...</div>
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
                                ${(analysis.convergenceRatio ?? 0) >= 0.6
                                ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border border-emerald-400/30"
                                : "bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500"}`}
                    >
                        {(analysis.convergenceRatio ?? 0) >= 0.6 ? "🚀 Ready to Decide" : "⚡ Decide"}
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
