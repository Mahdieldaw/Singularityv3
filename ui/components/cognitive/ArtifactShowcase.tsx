import React from "react";
import { useAtom } from "jotai";
import { SetStateAction } from "jotai"; // For draft typing if needed
import { MapperArtifact, AiTurn, ExploreAnalysis } from "../../../shared/contract";
import { selectedArtifactsAtom } from "../../state/atoms";
import { SouvenirCard } from "./cards/SouvenirCard";
import { ConsensusCard } from "./cards/ConsensusCard";
import { OutlierCard } from "./cards/OutlierCard";
import { GhostCard } from "./cards/GhostCard";
import { RawResponseCard } from "./cards/RawResponseCard";
import { SelectionBar } from "./SelectionBar";
import {
    buildComparisonContent,
    buildExplorationContent,
    buildDecisionTreeContent,
    buildDirectAnswerContent
} from "./content-builders";
import { ComparisonMatrixContainer } from "./containers/ComparisonMatrixContainer";
import { ExplorationSpaceContainer } from "./containers/ExplorationSpaceContainer";
import { DecisionTreeContainer } from "./containers/DecisionTreeContainer";
import { DirectAnswerContainer } from "./containers/DirectAnswerContainer";

interface ArtifactShowcaseProps {
    mapperArtifact: MapperArtifact;
    analysis: ExploreAnalysis;
    turn: AiTurn; // Needed for raw responses
}

export const ArtifactShowcase: React.FC<ArtifactShowcaseProps> = ({
    mapperArtifact,
    analysis,
    turn,
}) => {
    const [selectedIds, setSelectedIds] = useAtom(selectedArtifactsAtom);

    const toggleSelection = (id: string) => {
        setSelectedIds((draft) => {
            if (draft.has(id)) {
                draft.delete(id);
            } else {
                draft.add(id);
            }
        });
    };

    const renderContent = () => {
        switch (analysis.containerType) {
            case 'comparison_matrix':
                return <ComparisonMatrixContainer content={buildComparisonContent(mapperArtifact, analysis)} />;
            case 'exploration_space':
                return <ExplorationSpaceContainer content={buildExplorationContent(mapperArtifact, analysis)} />;
            case 'decision_tree':
                return <DecisionTreeContainer content={buildDecisionTreeContent(mapperArtifact, analysis)} />;
            case 'direct_answer':
                return <DirectAnswerContainer content={buildDirectAnswerContent(mapperArtifact, analysis)} />;
            default:
                return (
                    <>
                        <ConsensusCard
                            consensus={mapperArtifact.consensus}
                            selectedIds={selectedIds}
                            onToggle={toggleSelection}
                        />
                        {(mapperArtifact.outliers?.length > 0) && (
                            <OutlierCard
                                outliers={mapperArtifact.outliers}
                                selectedIds={selectedIds}
                                onToggle={toggleSelection}
                            />
                        )}
                    </>
                );
        }
    };

    return (
        <div className="w-full max-w-3xl mx-auto space-y-4 pb-12 animate-in fade-in duration-500">
            {mapperArtifact.souvenir && (
                <SouvenirCard content={mapperArtifact.souvenir} />
            )}

            {/* ORGANIZED content based on analysis */}
            {renderContent()}

            {mapperArtifact.ghost && (
                <GhostCard ghost={mapperArtifact.ghost} />
            )}

            {/* Raw responses at the bottom for verification */}
            <RawResponseCard turn={turn} />

            {/* Floating Selection Bar */}
            <SelectionBar />
        </div>
    );
};
