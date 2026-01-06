import React, { useEffect, useMemo, useCallback, useState } from "react";
import { MapperArtifact, AiTurn, ProviderResponse, ProblemStructure, Claim, StructuralAnalysis, ExploreAnalysis } from "../../../shared/contract";
import { RawResponseCard } from "./cards/RawResponseCard";
import { extractGraphTopologyAndStrip, parseMappingResponse } from "../../../shared/parsing-utils";
import StructureGlyph from "../StructureGlyph";
import { adaptGraphTopology } from "../../utils/graphAdapter";
import { selectedArtifactsAtom, selectedModelsAtom, workflowProgressForTurnFamily } from "../../state/atoms";
import { SelectionBar } from "./SelectionBar";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { SouvenirCard } from "./cards/SouvenirCard";
import { CouncilOrbs } from "../CouncilOrbs";
import { activeSplitPanelAtom, includePromptInCopyAtom, isDecisionMapOpenAtom } from "../../state/atoms";
import { formatTurnForMd, formatDecisionMapForMd } from "../../utils/copy-format-utils";
import { getLatestResponse } from "../../utils/turn-helpers";
import { PipelineErrorBanner } from "../PipelineErrorBanner";
import { CopyButton } from "../CopyButton";
import { SelectableCard } from "./LegacyArtifactViews";
import { LLM_PROVIDERS_CONFIG } from "../../constants";
import type { SelectedArtifact } from "../../hooks/cognitive/useCognitiveMode";
import { MetricsRibbon } from "./MetricsRibbon";
import { useProviderLimits } from "../../hooks/useProviderLimits";
import { getProviderName } from "../../utils/provider-helpers";
import { computeProblemStructureFromArtifact, computeStructuralAnalysis } from "../../../src/core/PromptMethods";

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
                    const normalizedId = match[2].replace(/^claim_/, '');
                    const isSelected = selectedIds.has(normalizedId);
                    return (
                        <span
                            key={i}
                            onClick={(e) => { e.stopPropagation(); onToggle(normalizedId); }}
                            className={`
                                inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded-md cursor-pointer transition-all border
                                ${isSelected
                                    ? "bg-primary-500/20 border-primary-500/40 text-primary-200"
                                    : "bg-surface-highlight border-border-strong text-text-secondary hover:bg-surface-highlight/80 hover:border-brand-400/50"}
                            `}
                            title={`Toggle claim ${normalizedId}`}
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





interface ArtifactShowcaseProps {
    mapperArtifact?: MapperArtifact;
    analysis?: ExploreAnalysis;
    turn: AiTurn;
    onRetryMapping?: (pid: string) => void;
    isLoading?: boolean;
}

function getStructureGuidance(pattern: string): string {
    const guidance: Record<string, string> = {
        linear: "Follow the steps in order; one step unlocks the next.",
        keystone: "Everything hangs on one key idea.",
        contested: "Two incompatible worldviews collide here.",
        tradeoff: "You must give up X to gain Y.",
        dimensional: "The answer depends on conditions.",
        exploratory: "This is open terrain with scattered findings.",
    };
    return guidance[pattern] || guidance.exploratory;
}

export const ArtifactShowcase: React.FC<ArtifactShowcaseProps> = ({
    mapperArtifact,
    analysis,
    turn,
    onRetryMapping,
    isLoading = false,
}) => {
    const [selectedIds, setSelectedIds] = useAtom(selectedArtifactsAtom);
    const selectedModels = useAtomValue(selectedModelsAtom);
    const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
    const includePromptInCopy = useAtomValue(includePromptInCopyAtom);
    const setIsDecisionMapOpen = useSetAtom(isDecisionMapOpenAtom);

    // Display the mapper artifact directly
    const currentTurnId = turn?.id || "";
    const artifactForDisplay = mapperArtifact || null;

    const activeMapperPid = useMemo(() => {
        if (turn.meta?.mapper) return turn.meta.mapper;
        const keys = Object.keys(turn.mappingResponses || {});
        return keys.length > 0 ? keys[0] : null;
    }, [turn.meta?.mapper, turn.mappingResponses]);

    const mapperProviderName = useMemo(() => {
        return activeMapperPid ? getProviderName(activeMapperPid) : "";
    }, [activeMapperPid]);

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

    const structuralAnalysis = useMemo<StructuralAnalysis | undefined>(() => {
        if (!artifactForDisplay) return undefined;
        try {
            return computeStructuralAnalysis(artifactForDisplay as MapperArtifact);
        } catch (e) {
            console.warn("[ArtifactShowcase] structural analysis failed:", e);
            return undefined;
        }
    }, [artifactForDisplay]);

    const problemStructure = useMemo<ProblemStructure | undefined>(() => {
        if (!structuralAnalysis) return undefined;
        // Compute problem structure from the analysis
        try {
            return computeProblemStructureFromArtifact(artifactForDisplay as MapperArtifact);
        } catch {
            return undefined;
        }
    }, [artifactForDisplay, structuralAnalysis]);

    const enrichedClaims = structuralAnalysis?.claimsWithLeverage;
    const graphAnalysis = structuralAnalysis?.graph;
    const ratios = structuralAnalysis?.ratios;

    const graphData = useMemo(() => {
        const claims = Array.isArray(artifactForDisplay?.claims) ? artifactForDisplay!.claims : [];
        const edges = Array.isArray(artifactForDisplay?.edges) ? artifactForDisplay!.edges : [];
        if (claims.length > 0 || edges.length > 0) return { claims, edges };
        return adaptGraphTopology(graphTopology);
    }, [artifactForDisplay, graphTopology]);

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

        // Direct lookup from artifact claims only
        if (artifactForDisplay && artifactForDisplay.claims) {
            for (const id of ids) {
                const claim = artifactForDisplay.claims.find(
                    (c: Claim) => c.id === id || String(c.id) === id
                );
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
            turn.singularityOutput?.text || null,
            turn.singularityOutput?.providerId,
            decisionMap,
            batchResponses,
            includePromptInCopy
        );
        navigator.clipboard.writeText(md);
    }, [turn, includePromptInCopy]);



    const claimsCount = mapperArtifact?.claims?.length || 0;
    const ghostCount = mapperArtifact?.ghosts?.length || 0;

    return (
        <div className="w-full max-w-3xl mx-auto space-y-4 pb-12 animate-in fade-in duration-500">
            {mapperArtifact && (
                <div className="flex flex-col gap-2">
                    <MetricsRibbon
                        analysis={analysis}
                        artifact={mapperArtifact}
                        claimsCount={claimsCount}
                        ghostCount={ghostCount}
                        ghosts={mapperArtifact?.ghosts || []}
                        problemStructure={problemStructure}
                        graphAnalysis={graphAnalysis}
                        enrichedClaims={enrichedClaims}
                        ratios={ratios}
                    />

                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                                Decision Map
                            </div>
                            {mapperProviderName && (
                                <span className="text-[11px] text-text-tertiary">by {mapperProviderName}</span>
                            )}
                        </div>
                        <button
                            onClick={() => setIsDecisionMapOpen({ turnId: turn.id })}
                            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-raised hover:bg-surface-highlight border border-border-subtle text-xs text-text-secondary transition-colors"
                            title="Open Decision Map"
                        >
                            <MapIcon className="w-3.5 h-3.5" />
                            <span>Map</span>
                        </button>

                        <div className="flex items-center gap-1.5">
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
                    {/* GapsCard removed as per cleanup requirements */}

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
                            <div className="px-4 py-4 border-b border-border-subtle bg-surface">
                                <div className="space-y-3">
                                    {problemStructure && (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-highlight/20 border border-brand-500/30">
                                                    <span className="text-[10px] uppercase tracking-wide text-text-muted">
                                                        Structure
                                                    </span>
                                                    <span className="font-semibold text-brand-400 capitalize">
                                                        {problemStructure.primaryPattern}
                                                    </span>
                                                    {problemStructure.confidence < 0.7 && (
                                                        <span className="text-amber-400 text-xs">?</span>
                                                    )}
                                                </div>
                                                <span className="text-xs text-text-muted">
                                                    {Math.round((problemStructure.confidence ?? 0) * 100)}% confidence
                                                </span>
                                            </div>
                                            <div className="text-sm text-text-secondary px-4 py-2 bg-surface-highlight/10 rounded-lg border border-border-subtle/50">
                                                {getStructureGuidance(problemStructure.primaryPattern)}
                                            </div>
                                            <StructureGlyph
                                                pattern={problemStructure.primaryPattern}
                                                claimCount={graphData.claims.length}
                                                width={280}
                                                height={120}
                                                onClick={() => setIsDecisionMapOpen({ turnId: currentTurnId })}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
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

                    {/* All Claims Section (Expandable) */}
                    {artifactForDisplay?.claims && artifactForDisplay.claims.length > 0 && (
                        <div className="mt-4">
                            <details className="group rounded-xl border border-border-subtle bg-surface-raised overflow-hidden">
                                <summary className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-surface-highlight/50 transition-colors select-none">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                                            All Claims
                                        </span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-highlight border border-border-subtle text-text-muted">
                                            {artifactForDisplay.claims.length}
                                        </span>
                                    </div>
                                    <div className="text-text-muted group-open:rotate-180 transition-transform">
                                        ▼
                                    </div>
                                </summary>
                                <div className="p-4 space-y-3 border-t border-border-subtle/50 bg-surface">
                                    {artifactForDisplay.claims.map((claim: Claim) => (
                                        <SelectableCard
                                            key={claim.id}
                                            item={{
                                                id: String(claim.id),
                                                text: claim.label || "Untitled Claim",
                                                type: (claim.supporters?.length || 0) >= 2 ? "consensus" : "supplemental",
                                                graphSupportCount: claim.support_count
                                            }}
                                            isSelected={selectedIds.has(String(claim.id))}
                                            onToggle={() => toggleSelection(String(claim.id))}
                                            className="bg-surface-base hover:bg-surface-highlight"
                                            subtitle={(claim.text || claim.quote) ? (
                                                <div className="space-y-1">
                                                    {claim.text && claim.text !== claim.label && (
                                                        <div className="text-xs text-text-muted leading-relaxed">
                                                            {claim.text}
                                                        </div>
                                                    )}
                                                    {claim.quote ? (
                                                        <div className="text-xs text-text-muted italic border-l-2 border-border-subtle pl-2">
                                                            "{claim.quote}"
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : null}
                                        />
                                    ))}
                                </div>
                            </details>
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
                    {availableProviders.map((p) => {
                        // Estimate limits - this is a rough client-side check
                        // Length = prompt overhead + artifact length
                        const estimatedLength = (mapperNarrative?.length || 0) + (selectedIds.size * 500) + 2000;
                        const { isAllowed } = useProviderLimits(p.id, estimatedLength);
                        return (
                            <option key={p.id} value={p.id} disabled={!isAllowed}>
                                {p.name} {!isAllowed && "(Limit Exceeded)"}
                            </option>
                        );
                    })}
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
