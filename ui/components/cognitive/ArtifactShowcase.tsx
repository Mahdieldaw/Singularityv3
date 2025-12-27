import React, { useEffect, useMemo, useState } from "react";
import { MapperArtifact, AiTurn, ExploreAnalysis } from "../../../shared/contract";
import { RawResponseCard } from "./cards/RawResponseCard";

import { selectedArtifactsAtom, selectedModelsAtom } from "../../state/atoms";
import { SelectionBar } from "./SelectionBar";
import { useAtom, useAtomValue } from "jotai";
import { SouvenirCard } from "./cards/SouvenirCard";
import { ConsensusCard } from "./cards/ConsensusCard";
import { OutlierCard } from "./cards/OutlierCard";
import { GhostCard } from "./cards/GhostCard";
import { GapsCard } from "./cards/GapsCard";
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
    mapperArtifact: MapperArtifact;
    analysis: ExploreAnalysis;
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

    const availableProviders = useMemo(() => {
        const enabled = LLM_PROVIDERS_CONFIG.filter((p) => !!selectedModels?.[p.id]);
        return enabled.length > 0 ? enabled : LLM_PROVIDERS_CONFIG;
    }, [selectedModels]);

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

    const dimensionCoverage = analysis.dimensionCoverage || [];

    const gaps = useMemo(() => dimensionCoverage.filter((d) => d.is_gap), [dimensionCoverage]);

    const gapsCount = gaps.length;
    const contestedCount = useMemo(
        () => dimensionCoverage.filter((d) => d.is_contested).length,
        [dimensionCoverage]
    );
    const totalDims = dimensionCoverage.length;
    const settledCount = Math.max(0, totalDims - gapsCount - contestedCount);
    const ghostPresent = Boolean(mapperArtifact.ghost);
    const dimsFoundCount = mapperArtifact.dimensions_found?.length ?? totalDims;

    const isKnownContainerType =
        analysis.containerType === "comparison_matrix" ||
        analysis.containerType === "exploration_space" ||
        analysis.containerType === "decision_tree" ||
        analysis.containerType === "direct_answer";

    const renderContent = () => {
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

            {mapperArtifact.souvenir && <SouvenirCard content={mapperArtifact.souvenir} />}

            <GapsCard artifact={mapperArtifact} gaps={gaps} />

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
                            <DimensionFirstView artifact={mapperArtifact} analysis={analysis} />
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
                    className="flex-1 bg-surface-base border border-border-subtle rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-brand-500 disabled:opacity-50"
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
            </div>

            <div className="flex gap-3 mt-6 pt-2">
                <button
                    onClick={() => onUnderstand?.({ providerId: nextProviderId, selectedArtifacts })}
                    disabled={isLoading}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 
                               hover:from-blue-500 hover:to-indigo-500 
                               text-white rounded-lg font-medium transition-all
                               disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    🧠 Understand
                </button>
                <button
                    onClick={() => onDecide?.({ providerId: nextProviderId, selectedArtifacts })}
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

            {mapperArtifact.ghost && <GhostCard ghost={mapperArtifact.ghost} />}

            <RawResponseCard turn={turn} />

            <SelectionBar />
        </div>
    );
};
