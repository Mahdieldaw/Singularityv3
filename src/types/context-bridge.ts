export interface MinimalMapperArtifact {
  claims: Array<{
    text: string;
    dimension?: string;
    applies_when?: string;
    isFrameChallenger?: boolean;
  }>;
  dimensions: string[];
  tensions: Array<{
    pair: [string, string];
    axis: string;
  }>;
  ghost: string | null;
  claimCount: number;
}

export interface EstablishedFacts {
  positive: Array<{
    text: string;
    source: "correction" | "grounding";
  }>;
  negative: Array<{
    text: string;
    source: "removal";
  }>;
}

export interface CascadeEffects {
  orphanedClaims: Array<{
    claimId: string;
    claimText: string;
    lostPrerequisite: string;
    action: "flag" | "auto_remove";
  }>;
  freedClaims: Array<{
    claimId: string;
    claimText: string;
  }>;
  resolvedConflicts: Array<{
    survivingClaim: string;
    eliminatedClaim: string;
  }>;
  brokenComplements: Array<{
    orphanedClaim: string;
    lostComplement: string;
  }>;
}

export interface ContextBridge {
  query: string;
  established: EstablishedFacts;
  openEdges: string[];
  nextStep: string | null;
  landscape: MinimalMapperArtifact;
  cascadeEffects?: CascadeEffects;
  turnId: string;
}

