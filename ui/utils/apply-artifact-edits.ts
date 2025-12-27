import { MapperArtifact } from "../../shared/contract";
import { ArtifactEdits } from "../state/artifact-edits";

export function applyEdits(
    original: MapperArtifact,
    edits: ArtifactEdits | undefined
): MapperArtifact {
    if (!edits) return original;

    // Apply consensus edits
    const editedClaims = original.consensus.claims
        .filter((_, i) => !edits.deletedClaimIndices.includes(i))
        .map((claim, i) => {
            const edit = edits.consensusEdits.find(e => e.index === i);
            if (!edit) return claim;
            return { ...claim, ...edit.edited };
        });

    // Apply outlier edits
    const editedOutliers = original.outliers
        .filter((_, i) => !edits.deletedOutlierIndices.includes(i))
        .map((outlier, i) => {
            const edit = edits.outlierEdits.find(e => e.index === i);
            if (!edit) return outlier;
            return { ...outlier, ...edit.edited };
        });

    // Apply tension edits
    const editedTensions = (original.tensions || [])
        .filter((_, i) => !edits.deletedTensionIndices.includes(i))
        .map((tension, i) => {
            const edit = edits.tensionEdits.find(e => e.index === i);
            if (!edit) return tension;
            return { ...tension, ...edit.edited };
        });

    return {
        ...original,
        consensus: {
            ...original.consensus,
            claims: editedClaims
        },
        outliers: editedOutliers,
        tensions: editedTensions,
        ghost: edits.ghostEdit !== null ? edits.ghostEdit : original.ghost,
        // Add user notes as specific field for prompts to verify
        // The contract might NOT have this field typed yet on the backend contract 
        // but we are passing it in payload payload anyway
        // For strict typing we cast or extend, but here we return compatible shape
    };
}
