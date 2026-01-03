// MinimalMapperArtifact removed in favor of full MapperArtifact from contract

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

import { MapperArtifact } from "../../shared/contract";

export interface ContextBridge {
  query: string;
  established: EstablishedFacts;
  openEdges: string[];
  nextStep: string | null;
  landscape: MapperArtifact;
  cascadeEffects?: CascadeEffects;
  turnId: string;
}

