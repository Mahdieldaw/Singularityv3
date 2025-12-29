export interface ArtifactEdit {
  sessionId: string;
  turnId: string;
  editedAt: number;
  userNotes: string | null;
  edits: {
    added: Array<{
      claim: {
        id: string;
        text: string;
        dimension?: string;
      };
    }>;
    removed: Array<{
      claimId: string;
    }>;
    modified: Array<{
      originalId: string;
      originalText: string;
      editedText: string;
    }>;
  };
  tickedIds: string[];
  ghostOverride: string | null;
  editIntensity: "light" | "moderate" | "heavy";
}

