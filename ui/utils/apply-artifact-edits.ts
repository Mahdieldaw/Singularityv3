import { MapperArtifact } from "../../shared/contract";
import { ArtifactEdits } from "../state/artifact-edits";

export function applyEdits(
    original: MapperArtifact,
    edits: ArtifactEdits | undefined
): MapperArtifact {
    if (!edits) return original;

    // Apply claim edits
    const editedClaims = (original.claims || [])
        .filter(c => !edits.deletedClaimIds.includes(c.originalId || c.id))
        .map(claim => {
            const id = claim.originalId || claim.id;
            const edit = edits.claimEdits.find(e => e.originalId === id);
            if (!edit) return claim;
            return { ...claim, ...edit.edited };
        });

    // Apply edge edits (tensions/edges)
    const editedEdges = (original.edges || [])
        .filter((_, i) => !edits.deletedTensionIndices.includes(i))
        .map((edge, i) => {
            const edit = edits.tensionEdits.find(e => e.index === i);
            if (!edit) return edge;
            return { ...edge, ...edit.edited };
        });

    return {
        ...original,
        claims: editedClaims,
        edges: editedEdges,
        ghosts: edits.ghostEdit ? [edits.ghostEdit] : (original.ghosts || []), // Mapping ghost string to V3 ghosts array roughly
        // Add user notes as specific field for prompts to verify
        // The contract might NOT have this field typed yet on the backend contract 
        // but we are passing it in payload payload anyway
        // For strict typing we cast or extend, but here we return compatible shape
    };
}
