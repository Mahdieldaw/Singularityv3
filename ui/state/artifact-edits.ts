import { atomWithImmer } from 'jotai-immer';
import { MapperArtifact } from '../../shared/contract';

export interface ClaimEdit {
    index: number;
    original: MapperArtifact['consensus']['claims'][0];
    edited: Partial<MapperArtifact['consensus']['claims'][0]>;
    userNote?: string;
}

export interface OutlierEdit {
    index: number;
    original: MapperArtifact['outliers'][0];
    edited: Partial<MapperArtifact['outliers'][0]>;
    userNote?: string;
}

export interface ArtifactEdits {
    turnId: string;
    timestamp: number;

    // Edits
    consensusEdits: ClaimEdit[];
    outlierEdits: OutlierEdit[];
    tensionEdits: Array<{ index: number; edited: Partial<NonNullable<MapperArtifact['tensions']>[0]> }>;
    ghostEdit: string | null;

    // Deletions 
    deletedClaimIndices: number[];
    deletedOutlierIndices: number[];
    deletedTensionIndices: number[];

    // Additions
    userNotes: string[];  // General notes for modes to see
}

// Global map of edits keyed by turnId
// Using a Map allows us to separate edits for different turns/sessions if needed
export const artifactEditsAtom = atomWithImmer<Map<string, ArtifactEdits>>(new Map());
