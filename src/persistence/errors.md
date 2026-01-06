import React, { useEffect, useMemo, useCallback, useState } from "react";
import { MapperArtifact, AiTurn, ProviderResponse, ProblemStructure, Claim, StructuralAnalysis, ExploreAnalysis } from "../../../shared/contract";
import { artifactEditsAtom } from "../../state/artifact-edits";
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
import type { CognitiveTransitionOptions, SelectedArtifact } from "../../hooks/cognitive/useCognitiveMode";
import { MetricsRibbon } from "./MetricsRibbon";
import { useProviderLimits } from "../../hooks/useProviderLimits";
import { getProviderName } from "../../utils/provider-helpers";
import { computeProblemStructureFromArtifact, computeStructuralAnalysis } from "../../../src/core/PromptMethods";
import { applyEdits } from "../../utils/apply-artifact-edits";

const MapIcon = ({ className }: { className?: string }) => (
<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><line x1="3" x2="21" y1="9" y2="9" /><line x1="9" x2="9" y1="21" y2="9" /></svg>
);

const FormattedNarrative: React.FC<{
text: string;
onToggle: (id: string) => void;
selectedIds: Set<string>;
}> = ({ text, onToggle, selectedIds }) => {
// Split by the anchor pattern: [Label|ID]
// Regex captures: 1=Label, 2=ID
const parts = text.split(/(**[.?|.?]**)/g);

text

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
const [allEdits] = useAtom(artifactEditsAtom);
const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
const includePromptInCopy = useAtomValue(includePromptInCopyAtom);
const setIsDecisionMapOpen = useSetAtom(isDecisionMapOpenAtom);

text

// Get modified artifact
const currentTurnId = turn?.id || mapperArtifact?.turn?.toString() || "";
const edits = allEdits.get(currentTurnId);
const modifiedArtifact = useMemo(
    () => (mapperArtifact ? applyEdits(mapperArtifact, edits) : null),
    [mapperArtifact, edits]
);
const userNotes = edits?.userNotes;
const artifactForDisplay = modifiedArtifact || mapperArtifact || null;

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

import React from "react";
import { ProblemStructure } from "../../shared/contract";

interface StructureGlyphProps {
pattern: ProblemStructure["primaryPattern"];
claimCount: number;
width?: number;
height?: number;
onClick?: () => void;
}

const StructureGlyph: React.FC<StructureGlyphProps> = ({
pattern,
claimCount,
width = 120,
height = 80,
onClick,
}) => {
// Basic settings
const cx = width / 2;
const cy = height / 2;

text

const renderPattern = () => {
    switch (pattern) {
        case "settled":
        case "contextual": {
            // High convergence ring
            const nodes = Math.min(claimCount, 6);
            const radius = Math.min(width, height) * 0.3;
            return (
                <>
                    {Array.from({ length: nodes }).map((_, i) => {
                        const angle = (i / nodes) * Math.PI * 2;
                        const x = cx + Math.cos(angle) * radius;
                        const y = cy + Math.sin(angle) * radius;
                        return (
                            <g key={i}>
                                <circle cx={x} cy={y} r={4} fill="rgba(16, 185, 129, 0.6)" />
                                {/* Link to previous node in ring */}
                                <line
                                    x1={x}
                                    y1={y}
                                    x2={cx + Math.cos(angle - (Math.PI * 2 / nodes)) * radius}
                                    y2={cy + Math.sin(angle - (Math.PI * 2 / nodes)) * radius}
                                    stroke="rgba(16, 185, 129, 0.3)"
                                    strokeWidth={1.5}
                                />
                            </g>
                        );
                    })}
                    {/* Central stability indicator */}
                    <circle cx={cx} cy={cy} r={radius * 1.5} fill="none" stroke="rgba(16, 185, 129, 0.1)" strokeWidth={1} strokeDasharray="2,2" />
                </>
            );
        }
        case "linear": {
            const nodes = Math.min(claimCount, 5);
            const spacing = width / (nodes + 1 || 1);
            return (
                <>
                    {Array.from({ length: nodes }).map((_, i) => {
                        const x = spacing * (i + 1);
                        return (
                            <g key={i}>
                                <circle cx={x} cy={cy} r={4} fill="rgba(59, 130, 246, 0.6)" />
                                {i < nodes - 1 && (
                                    <line
                                        x1={x + 4}
                                        y1={cy}
                                        x2={x + spacing - 4}
                                        y2={cy}
                                        stroke="rgba(59, 130, 246, 0.3)"
                                        strokeWidth={1.5}
                                        markerEnd="url(#arrowBlue)"
                                    />
                                )}
                            </g>
                        );
                    })}
                </>
            );
        }
        case "keystone": {
            const satellites = Math.max(0, Math.min(claimCount - 1, 6));
            const radius = Math.min(width, height) * 0.3;
            return (
                <>
                    <circle cx={cx} cy={cy} r={8} fill="rgba(139, 92, 246, 0.8)" />
                    {Array.from({ length: satellites }).map((_, i) => {
                        const angle = (i / satellites) * Math.PI * 2 || 0;
                        const x = cx + Math.cos(angle) * radius;
                        const y = cy + Math.sin(angle) * radius;
                        return (
                            <g key={i}>
                                <line
                                    x1={cx}
                                    y1={cy}
                                    x2={x}
                                    y2={y}
                                    stroke="rgba(139, 92, 246, 0.2)"
                                    strokeWidth={1}
                                />
                                <circle cx={x} cy={y} r={3} fill="rgba(139, 92, 246, 0.5)" />
                            </g>
                        );
                    })}
                </>
            );
        }
        case "contested": {
            const leftX = width * 0.25;
            const rightX = width * 0.75;
            return (
                <>
                    {/* Group A */}
                    <circle cx={leftX} cy={cy} r={6} fill="rgba(239, 68, 68, 0.6)" />
                    <circle cx={leftX - 8} cy={cy - 8} r={3} fill="rgba(239, 68, 68, 0.4)" />
                    <circle cx={leftX - 8} cy={cy + 8} r={3} fill="rgba(239, 68, 68, 0.4)" />

                    {/* Conflict Line */}
                    <line
                        x1={leftX + 6}
                        y1={cy}
                        x2={rightX - 6}
                        y2={cy}
                        stroke="#ef4444"
                        strokeWidth={2}
                        strokeDasharray="3,2"
                        markerStart="url(#arrowRed)"
                        markerEnd="url(#arrowRed)"
                    />

                    {/* Group B */}
                    <circle cx={rightX} cy={cy} r={6} fill="rgba(239, 68, 68, 0.6)" />
                    <circle cx={rightX + 8} cy={cy - 8} r={3} fill="rgba(239, 68, 68, 0.4)" />
                    <circle cx={rightX + 8} cy={cy + 8} r={3} fill="rgba(239, 68, 68, 0.4)" />
                </>
            );
        }
        case "tradeoff": {
            const leftX = width * 0.3;
            const rightX = width * 0.7;
            return (
                <>
                    <circle cx={leftX} cy={cy} r={6} fill="rgba(249, 115, 22, 0.6)" />
                    <line
                        x1={leftX + 6}
                        y1={cy}
                        x2={rightX - 6}
                        y2={cy}
                        stroke="#f97316"
                        strokeWidth={2}
                        strokeDasharray="2,2"
                        markerStart="url(#arrowOrange)"
                        markerEnd="url(#arrowOrange)"
                    />
                    <circle cx={rightX} cy={cy} r={6} fill="rgba(249, 115, 22, 0.6)" />
                </>
            );
        }
        case "dimensional": {
            const ratios = [0.3, 0.5, 0.7];
            return (
                <>
                    <line x1={width * 0.1} y1={height * 0.5} x2={width * 0.9} y2={height * 0.5} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
                    <line x1={width * 0.5} y1={height * 0.1} x2={width * 0.5} y2={height * 0.9} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
                    {ratios.map((xRatio, i) =>
                        ratios.map((yRatio, j) => (
                            <circle
                                key={`${i}-${j}`}
                                cx={width * xRatio}
                                cy={height * yRatio}
                                r={3}
                                fill="rgba(168, 85, 247, 0.5)"
                            />
                        ))
                    )}
                </>
            );
        }
        case "exploratory":
        default: {
            const positions: Array<[number, number]> = [
                [0.2, 0.3], [0.5, 0.2], [0.7, 0.5], [0.3, 0.7], [0.8, 0.8]
            ];
            const count = Math.min(claimCount, positions.length);
            return (
                <>
                    {positions.slice(0, count).map(([x, y], i) => (
                        <circle
                            key={i}
                            cx={width * x}
                            cy={height * y}
                            r={3}
                            fill="rgba(156, 163, 175, 0.5)"
                        />
                    ))}
                </>
            );
        }
    }
};

return (
    <div
        className="relative cursor-pointer group"
        onClick={onClick}
        title={`${pattern} structure — click to explore`}
    >
        <svg width={width} height={height} className="overflow-visible">
            <defs>
                <marker id="arrowBlue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(59, 130, 246, 0.6)" />
                </marker>
                <marker id="arrowRed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
                </marker>
                <marker id="arrowOrange" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#f97316" />
                </marker>
            </defs>
            {renderPattern()}
        </svg>
        <div className="absolute inset-0 bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
            <span className="text-xs font-medium text-brand-400">
                Click to explore →
            </span>
        </div>
    </div>
);
};

export default StructureGlyph;

import React from "react";

interface StructuralInsightProps {
type:
| "fragile_foundation"
| "keystone"
| "consensus_conflict" // Keep but rename internally to "high_support_conflict"
| "high_leverage_singular"
| "cascade_risk"
| "evidence_gap"
| "support_outlier"
// NEW V3.1 types
| "leverage_inversion"
| "challenger_threat"
| "orphan"
| "chain_root"
| "hub_dominance";
claim: {
label: string;
supporters: (string | number)[];
};
metadata?: {
dependentCount?: number;
dependentLabels?: string[];
cascadeDepth?: number;
conflictsWith?: string;
leverageScore?: number;
gapScore?: number;
skew?: number;
supporterCount?: number;
// NEW V3.1 metadata
supportRatio?: number;
inversionReason?: "challenger_prerequisite_to_consensus" | "singular_foundation" | "high_connectivity_low_support";
hubDominance?: number;
chainLength?: number;
};
}

export const StructuralInsight: React.FC<StructuralInsightProps> = ({
type,
claim,
metadata,
}) => {
const pct = (n: number) => ${Math.round(n * 100)}%;

const insights = {
fragile_foundation: {
icon: "⚠️",
title: "Fragile Foundation",
description: Only ${pct(metadata?.supportRatio || 0)} support, but ${metadata?.dependentCount || 0 } claim(s) depend on "${claim.label}". High impact if wrong.,
color: "amber" as const,
},
keystone: {
icon: "👑",
title: "Keystone Claim",
description: "${claim.label}" is the structural hub—${metadata?.dependentCount || 0 } other claim(s) build on this.${metadata?.hubDominance ? Dominance: {metadata.hubDominance.toFixed(1)}x.` : '' }`, color: "purple" as const, }, consensus_conflict: { icon: "⚡", title: "High-Support Conflict", description: `"{claim.label}" conflicts with "{metadata?.conflictsWith || "another claim" }". Both are in the top 30% by support—fundamental disagreement.`, color: "red" as const, }, high_leverage_singular: { icon: "💎", title: "Overlooked Insight", description: `"{claim.label}" has low support (${pct(metadata?.supportRatio || 0)}) but high structural importance (leverage: {metadata?.leverageScore?.toFixed(1) || "?" }). May contain what others missed.`, color: "indigo" as const, }, cascade_risk: { icon: "⛓️", title: "Cascade Risk", description: `Eliminating "{claim.label}" cascades through ${metadata?.dependentCount || 0
} claim(s) across {metadata?.cascadeDepth || 0} level(s).`, color: "orange" as const, }, evidence_gap: { icon: "🎯", title: "Load-Bearing Assumption", description: `"{claim.label}" enables ${metadata?.dependentCount || 0
} downstream claims but has only ${pct(metadata?.supportRatio || 0)} support. Gap score: {metadata?.gapScore?.toFixed(1) || "?" }.`, color: "red" as const, }, support_outlier: { icon: "🔍", title: "Model-Specific Insight", description: `{pct(metadata?.skew || 0)} of support for "{claim.label}" comes from one model. Either valuable outlier or bias.`, color: "blue" as const, }, // NEW V3.1 TYPES leverage_inversion: { icon: "🔄", title: "Leverage Inversion", description: (() => { const reason = metadata?.inversionReason; if (reason === "challenger_prerequisite_to_consensus") { return `"{claim.label}" is a challenger that high-support claims depend on. The floor may rest on contested ground.; } if (reason === "singular_foundation") { return "${claim.label}" enables {metadata?.dependentCount || 0} claims with minimal support. Single point of failure.`; } return `"{claim.label}" has high connectivity but low support. Structural importance exceeds evidential backing.; })(), color: "amber" as const, }, challenger_threat: { icon: "⚔️", title: "Challenger Threat", description: "${claim.label}" questions the premise with only {pct(metadata?.supportRatio || 0)} support. May be noise—or the key insight.`, color: "orange" as const, }, orphan: { icon: "🏝️", title: "Isolated Claim", description: `"{claim.label}" has no connections to other claims. May be tangential or an unexplored dimension., color: "gray" as const, }, chain_root: { icon: "🌱", title: "Chain Root", description: "${claim.label}" is the start of a {metadata?.chainLength || 0}-step prerequisite chain. Everything downstream depends on this.`, color: "green" as const, }, hub_dominance: { icon: "🎯", title: "Dominant Hub", description: `"{claim.label}" has ${metadata?.hubDominance?.toFixed(1) || "?"}x more outgoing connections than the next claim. This is the structural center.`,
color: "purple" as const,
},
} as const;

const insight = insights[type];

const colorClasses: Record<string, string> = {
amber: "bg-amber-500/10 border-amber-500/30 text-amber-400",
purple: "bg-purple-500/10 border-purple-500/30 text-purple-400",
red: "bg-red-500/10 border-red-500/30 text-red-400",
indigo: "bg-indigo-500/10 border-indigo-500/30 text-indigo-400",
orange: "bg-orange-500/10 border-orange-500/30 text-orange-400",
blue: "bg-blue-500/10 border-blue-500/30 text-blue-400",
green: "bg-green-500/10 border-green-500/30 text-green-400",
gray: "bg-gray-500/10 border-gray-500/30 text-gray-400",
};

return (
<div className={flex gap-2 p-3 rounded-lg border ${colorClasses[insight.color]}}>
<span className="text-lg flex-shrink-0">{insight.icon}</span>
<div className="min-w-0">
<div className="font-semibold text-sm mb-1">{insight.title}</div>
<div className="text-xs opacity-90 leading-relaxed">
{insight.description}
</div>
{metadata?.dependentLabels && metadata.dependentLabels.length > 0 && (
<div className="mt-2 text-[10px] opacity-70">
<span className="font-medium">Affects:</span>{" "}
{metadata.dependentLabels.slice(0, 3).join(", ")}
{metadata.dependentLabels.length > 3 &&
+${metadata.dependentLabels.length - 3} more}
</div>
)}
</div>
</div>
);
};

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

text

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

import React from 'react';
import { AiTurn } from '../../types';
import MarkdownDisplay from '../MarkdownDisplay';
import { SectionHeader } from './SectionHeader';
import { SingularityOutputState } from '../../hooks/useSingularityOutput';

interface SingularityOutputViewProps {
aiTurn: AiTurn;
singularityState: SingularityOutputState;
onRecompute: (options?: any) => void;
isLoading?: boolean;
}

const SingularityOutputView: React.FC<SingularityOutputViewProps> = ({
singularityState,
onRecompute,
isLoading
}) => {
const { output } = singularityState;

text

if (!output && !isLoading) {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted italic gap-4">
            <span className="text-4xl filter grayscale opacity-20">🕳️</span>
            <span>No Singularity response generated for this turn.</span>
            <button
                onClick={() => onRecompute()}
                className="mt-4 px-6 py-2 rounded-full bg-brand-500/10 hover:bg-brand-500/20 text-brand-500 text-sm font-medium transition-colors border border-brand-500/20"
            >
                Run Concierge
            </button>
        </div>
    );
}

return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Main Content Area */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
            <div className="flex-1 w-full min-w-0">
                <SectionHeader
                    icon="✨"
                    title="The Singularity"
                    subtitle="Consolidated Expert Synthesis"
                    onAction={() => onRecompute()}
                    actionLabel="Recompute"
                />

                <div className="bg-surface border border-border-subtle rounded-2xl p-8 shadow-sm relative overflow-hidden mt-6">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/5 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />

                    <div className="prose prose-lg dark:prose-invert max-w-none relative z-10">
                        <MarkdownDisplay content={output?.text || "Converging..."} />
                    </div>

                    {output?.leakageDetected && output.leakageViolations && (
                        <div className="mt-8 pt-6 border-t border-border-subtle/50 relative z-10">
                            <div className="flex items-center gap-2 text-amber-500 text-[10px] font-bold uppercase tracking-widest mb-3">
                                <span>⚠️ Machinery Leakage</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {output.leakageViolations.map((v, i) => (
                                    <span key={i} className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 font-mono">
                                        {v}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Bar */}
                <div className="mt-8 flex items-center justify-end gap-3">
                    <button
                        onClick={() => onRecompute({ stance: 'challenge' })}
                        className="group flex items-center gap-3 px-8 py-3 rounded-xl bg-surface-raised border border-border-subtle text-text-secondary font-semibold hover:bg-surface-highlight transition-all"
                    >
                        <span>Challenge Perspective</span>
                        <span className="text-xl group-hover:rotate-12 transition-transform">⚖️</span>
                    </button>
                    <button
                        onClick={() => onRecompute({ stance: 'decide' })}
                        className="group flex items-center gap-3 px-8 py-3 rounded-xl bg-brand-500 text-white font-semibold hover:bg-brand-600 transition-all shadow-glow-brand"
                    >
                        <span>Final Decision</span>
                        <span className="text-xl group-hover:translate-x-1 transition-transform">🚀</span>
                    </button>
                </div>
            </div>

        </div>
    </div>
);
};

export default SingularityOutputView;

i have sent the current artifacts showcase, along with its compoenents there is also a singularityoutput file might be able to refactor everything together: