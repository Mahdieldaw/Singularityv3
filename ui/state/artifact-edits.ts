import { atomWithImmer } from 'jotai-immer';
import { MapperArtifact } from '../../shared/contract';

export interface ClaimEdit {
    originalId: string; // V3 uses originalId for tracking
    edited: Partial<MapperArtifact['claims'][0]>;
    userNote?: string;
}

// OutlierEdit removed - unified into ClaimEdit

export interface ArtifactEdits {
    turnId: string;
    timestamp: number;

    // Edits
    claimEdits: ClaimEdit[];
    tensionEdits: Array<{ index: number; edited: Partial<NonNullable<MapperArtifact['edges']>[0]> }>;
    ghostEdit: string | null;

    // Deletions 
    deletedClaimIds: string[]; // Changed from indices to IDs for V3
    deletedTensionIndices: number[]; // Edges might need IDs too but keeping indices for now if edges lack IDs

    // Additions
    userNotes: string[];  // General notes for modes to see
}

// Global map of edits keyed by turnId
// Using a Map allows us to separate edits for different turns/sessions if needed
export const artifactEditsAtom = atomWithImmer<Map<string, ArtifactEdits>>(new Map());
