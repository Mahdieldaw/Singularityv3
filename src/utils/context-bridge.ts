import { MapperArtifact } from "../../shared/contract";
import type {
  MinimalMapperArtifact,
  EstablishedFacts,
  ContextBridge,
} from "../types/context-bridge";
import { computeCascadeEffects } from "./cascade-effects";

export function buildMinimalMapperArtifact(
  fullArtifact: MapperArtifact,
): MinimalMapperArtifact {
  const claims = [
    ...fullArtifact.consensus.claims.map((c) => ({
      text: c.text,
      dimension: c.dimension || undefined,
      applies_when: c.applies_when || undefined,
      isFrameChallenger: false,
    })),
    ...fullArtifact.outliers.map((o) => ({
      text: o.insight,
      dimension: o.dimension || undefined,
      applies_when: o.applies_when || undefined,
      isFrameChallenger: o.type === "frame_challenger",
    })),
  ];

  const tensions = (fullArtifact.tensions || []).map((t) => ({
    pair: [t.between[0], t.between[1]] as [string, string],
    axis: t.axis,
  }));

  return {
    claims,
    dimensions: fullArtifact.dimensions_found || [],
    tensions,
    ghost: fullArtifact.ghost || null,
    claimCount: claims.length,
  };
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
        const text = (claim as any).text || (claim as any).insight || String(claim);
        established.negative.push({ text, source: "removal" });
      }
    }
  }
  return established;
}

function findClaimById(
  claimId: string,
  artifact: MapperArtifact,
): { text?: string; insight?: string } | null {
  const consensusClaim = artifact.consensus?.claims?.find(
    (c: any) => c.id === claimId || c.text === claimId,
  );
  if (consensusClaim) return consensusClaim as any;
  const outlier = artifact.outliers?.find(
    (o: any) => o.id === claimId || o.insight === claimId,
  );
  if (outlier) return outlier as any;
  return null;
}

export function buildContextBridge(turnState: any): ContextBridge {
  const bridge: ContextBridge = {
    query: turnState.query,
    established: extractEstablishedFacts(turnState),
    openEdges: [],
    nextStep: null,
    landscape: buildMinimalMapperArtifact(turnState.mapper.artifact),
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
