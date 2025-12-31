import React, { useEffect, useMemo, useState, useCallback } from "react";
import { MapperArtifact, AiTurn, ExploreAnalysis, ProviderResponse } from "../../../shared/contract";
import { applyEdits } from "../../utils/apply-artifact-edits";
import { artifactEditsAtom } from "../../state/artifact-edits";
import { RawResponseCard } from "./cards/RawResponseCard";

import { selectedArtifactsAtom, selectedModelsAtom, workflowProgressForTurnFamily } from "../../state/atoms";
import { SelectionBar } from "./SelectionBar";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { SouvenirCard } from "./cards/SouvenirCard";
import { ConsensusCard } from "./cards/ConsensusCard";
import { OutlierCard } from "./cards/OutlierCard";
import { GhostCard } from "./cards/GhostCard";
import { GapsCard } from "./cards/GapsCard";
import { CouncilOrbs } from "../CouncilOrbs";
import { activeSplitPanelAtom, includePromptInCopyAtom } from "../../state/atoms";
import { formatTurnForMd, formatDecisionMapForMd } from "../../utils/copy-format-utils";
import { getLatestResponse } from "../../utils/turn-helpers";
import { useRefinerOutput } from "../../hooks/useRefinerOutput";
import { useAntagonistOutput } from "../../hooks/useAntagonistOutput";
import { CopyButton } from "../CopyButton";
import {
    buildComparisonContent,
    buildDecisionTreeContent,
    buildDirectAnswerContent,
    buildExplorationContent
} from "./content-builders";
import { ComparisonMatrixContainer } from "./containers/ComparisonMatrixContainer";
import { DecisionTreeContainer } from "./containers/DecisionTreeContainer";
import { DirectAnswerContainer } from "./containers/DirectAnswerContainer";
import { ExplorationSpaceContainer } from "./containers/ExplorationSpaceContainer";
import { DimensionFirstView } from "./DimensionFirstView";
import { LLM_PROVIDERS_CONFIG } from "../../constants";
import type { CognitiveTransitionOptions, SelectedArtifact } from "../../hooks/cognitive/useCognitiveMode";

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

    // Hooks for Refiner and Antagonist
    const { output: refinerOutput, providerId: refinerPid } = useRefinerOutput(turn?.id);
    const { output: antagonistOutput, providerId: antagonistPid } = useAntagonistOutput(turn?.id);

    // Get modified artifact
    const currentTurnId = turn?.id || mapperArtifact?.turn?.toString() || "";
    const edits = allEdits.get(currentTurnId);
    const modifiedArtifact = useMemo(() => mapperArtifact ? applyEdits(mapperArtifact, edits) : null, [mapperArtifact, edits]);
    const userNotes = edits?.userNotes;

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
                const claim = mapperArtifact?.consensus?.claims?.[idx];
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
                const o = mapperArtifact?.outliers?.[idx];
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
    }, [mapperArtifact, selectedIds]);

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

    const isKnownContainerType =
        analysis?.containerType === "comparison_matrix" ||
        analysis?.containerType === "exploration_space" ||
        analysis?.containerType === "decision_tree" ||
        analysis?.containerType === "direct_answer";

    const renderContent = () => {
        if (!mapperArtifact || !analysis) return null;
        switch (analysis.containerType) {
            case "comparison_matrix":
                return <ComparisonMatrixContainer content={buildComparisonContent(mapperArtifact, analysis)} />;
            case "exploration_space":
                return <ExplorationSpaceContainer content={buildExplorationContent(mapperArtifact, analysis)} />;
            case "decision_tree":
                return <DecisionTreeContainer content={buildDecisionTreeContent(mapperArtifact, analysis)} />;
            case "direct_answer":
                return <DirectAnswerContainer content={buildDirectAnswerContent(mapperArtifact, analysis)} />;
            default:
                return (
                    <>
                        <ConsensusCard consensus={mapperArtifact.consensus} selectedIds={selectedIds} onToggle={toggleSelection} />
                        <OutlierCard
                            outliers={mapperArtifact.outliers}
                            selectedIds={selectedIds}
                            onToggle={(id) => toggleSelection(id)}
                        />
                    </>
                );
        }
    };

    return (
        <div className="w-full max-w-3xl mx-auto space-y-4 pb-12 animate-in fade-in duration-500">
            {mapperArtifact && (
                <div className="flex flex-wrap gap-2 items-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                        🔶 Gaps: {gapsCount}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                        ⚔️ Contested: {contestedCount}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                        ✅ Settled: {settledCount}
                    </span>
                    {ghostPresent && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                            👻 Ghost present
                        </span>
                    )}
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                        Models: {mapperArtifact.model_count}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-highlight/30 border border-border-subtle text-xs text-text-secondary">
                        Dims: {dimsFoundCount}
                    </span>
                </div>
            )}

            {/* Source Layer: Council Orbs */}
            <div className="mb-2">
                <CouncilOrbs
                    providers={LLM_PROVIDERS_CONFIG}
                    turnId={currentTurnId}
                    voiceProviderId={null}
                    visibleProviderIds={visibleProviderIds}
                    variant={!mapperArtifact ? "active" : "historical"}
                    workflowProgress={workflowProgress}
                    onOrbClick={(pid) => setActiveSplitPanel({ turnId: currentTurnId, providerId: pid })}
                />
            </div>

            {mapperArtifact && analysis ? (
                <>
                    {mapperArtifact.souvenir && <SouvenirCard content={mapperArtifact.souvenir} />}

                    <GapsCard artifact={mapperArtifact!} gaps={gaps} />

                    {renderContent()}

                    {isKnownContainerType && (
                        <div className="space-y-3 opacity-95">
                            <ConsensusCard consensus={mapperArtifact.consensus} selectedIds={selectedIds} onToggle={toggleSelection} />
                            <OutlierCard
                                outliers={mapperArtifact.outliers}
                                selectedIds={selectedIds}
                                onToggle={(id) => toggleSelection(id)}
                            />
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

            {mapperArtifact?.ghost && <GhostCard ghost={mapperArtifact.ghost} />}

            <RawResponseCard turn={turn} />

            <SelectionBar />

            {/* Fixed Copy Turn Button */}
            <div className="fixed bottom-6 left-6 z-50">
                <CopyButton
                    onCopy={handleCopyTurn}
                    label="Copy Full Turn"
                    className="bg-surface/90 backdrop-blur-sm shadow-xl rounded-lg text-xs font-semibold px-4 py-2 border border-border-subtle hover:scale-105 transition-transform"
                >
                    📋 Copy Turn
                </CopyButton>
            </div>
        </div>
    );
};
