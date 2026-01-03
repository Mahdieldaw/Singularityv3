import { MapperArtifact } from "../../shared/contract";
import type {
  EstablishedFacts,
  ContextBridge,
} from "../types/context-bridge";
import { computeCascadeEffects } from "./cascade-effects";

// Deprecated: No longer "minimal", just returns the full artifact as the bridge expects MapperArtifact now
export function buildMinimalMapperArtifact(
  fullArtifact: MapperArtifact,
): MapperArtifact {
  return fullArtifact;
}

export function extractEstablishedFacts(turnState: any): EstablishedFacts {
  const established: EstablishedFacts = { positive: [], negative: [] };
  if (turnState?.artifactEdits?.edits?.modified) {
    for (const mod of turnState.artifactEdits.edits.modified) {
      established.positive.push({ text: mod.editedText, source: "correction" });
    }
  }
  if (
    turnState?.antagonist?.grounding &&
    Array.isArray(turnState.antagonist.grounding)
  ) {
    for (const g of turnState.antagonist.grounding) {
      established.positive.push({ text: g, source: "grounding" });
    }
  }
  if (turnState?.artifactEdits?.edits?.removed) {
    for (const removal of turnState.artifactEdits.edits.removed) {
      const claim = findClaimById(removal.claimId, turnState.mapper.artifact);
      if (claim) {
        established.negative.push({ text: claim.text, source: "removal" });
      }
    }
  }
  return established;
}

function findClaimById(
  claimId: string,
  artifact: MapperArtifact,
): { text: string } | null {
  const claim = artifact.claims?.find(
    (c) => c.id === claimId || c.text === claimId
  );
  if (claim) return claim;
  return null;
}

export function buildContextBridge(turnState: any): ContextBridge {
  const bridge: ContextBridge = {
    query: turnState.query,
    established: extractEstablishedFacts(turnState),
    openEdges: [],
    nextStep: null,
    landscape: turnState?.mapper?.artifact || null,
    turnId: String(turnState.turnId),
  };
  if (turnState?.artifactEdits?.edits?.removed?.length > 0) {
    const removedIds = turnState.artifactEdits.edits.removed.map(
      (r: any) => r.claimId,
    );
    if (turnState.mapper.graphTopology) {
      bridge.cascadeEffects = computeCascadeEffects(
        removedIds,
        turnState.mapper.graphTopology,
      );
    }
  }
  if (turnState?.antagonist?.structured_prompt) {
    bridge.openEdges = [turnState.antagonist.structured_prompt];
    if (turnState.antagonist.payoff) {
      bridge.openEdges.push(
        `Answering unlocks: ${turnState.antagonist.payoff}`,
      );
    }
  } else {
    if (turnState?.understand?.the_echo?.position) {
      bridge.openEdges.push(turnState.understand.the_echo.position);
    }
    if (turnState?.decide?.the_void) {
      bridge.openEdges.push(turnState.decide.the_void);
    }
  }
  bridge.nextStep =
    (turnState?.refiner?.the_step as any) ||
    (turnState?.decide?.the_answer?.next_step as any) ||
    null;
  return bridge;
}
