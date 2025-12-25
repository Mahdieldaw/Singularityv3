import React, { useEffect } from "react";
import { useAtom } from "jotai";
import { MapperArtifact, AiTurn } from "../../../shared/contract";
import { selectedArtifactsAtom } from "../../state/atoms";
import { SouvenirCard } from "./cards/SouvenirCard";
import { ConsensusCard } from "./cards/ConsensusCard";
import { OutlierCard } from "./cards/OutlierCard";
import { GhostCard } from "./cards/GhostCard";
import { RawResponseCard } from "./cards/RawResponseCard";
import { SelectionBar } from "./SelectionBar";

interface ArtifactShowcaseProps {
    mapperArtifact: MapperArtifact;
    turn: AiTurn; // Needed for raw responses
}

export const ArtifactShowcase: React.FC<ArtifactShowcaseProps> = ({
    mapperArtifact,
    turn,
}) => {
    const [selectedIds, setSelectedIds] = useAtom(selectedArtifactsAtom);

    // Auto-select everything by default if it's a fresh render? 
    // For now, let's keep it manual to avoid context bloat, or maybe auto-select high-confidence items later.

    const toggleSelection = (id: string, textContext?: string) => {
        setSelectedIds((draft) => {
            if (draft.has(id)) {
                draft.delete(id);
            } else {
                draft.add(id);
            }
        });
    };

    return (
        <div className="w-full max-w-3xl mx-auto space-y-4 pb-12 animate-in fade-in duration-500">

            {/* Header / Intro could go here if needed, but Souvenir serves as the summary */}

            {mapperArtifact.souvenir && (
                <SouvenirCard content={mapperArtifact.souvenir} />
            )}

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
