import React from "react";
import { MapperArtifact, AiTurn, ExploreAnalysis } from "../../../shared/contract";
import { DimensionFirstView } from "./DimensionFirstView";
import { RawResponseCard } from "./cards/RawResponseCard";

interface ArtifactShowcaseProps {
    mapperArtifact: MapperArtifact;
    analysis: ExploreAnalysis;
    turn: AiTurn;
    onUnderstand?: () => void;
    onDecide?: () => void;
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
    return (
        <div className="w-full">
            {/* Primary: Dimension-First View (lossless) */}
            <DimensionFirstView
                artifact={mapperArtifact}
                analysis={analysis}
                onUnderstand={onUnderstand}
                onDecide={onDecide}
                isLoading={isLoading}
            />

            {/* Raw responses at the bottom for verification */}
            <div className="max-w-3xl mx-auto mt-6">
                <RawResponseCard turn={turn} />
            </div>
        </div>
    );
};
