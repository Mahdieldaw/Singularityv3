import { MapperArtifact } from "../../shared/contract";
import type {
  ContextBridge,
} from "../types/context-bridge";

/**
 * Context Bridge - Simplified for Concierge/Singularity flow
 * 
 * The context bridge now focuses on passing forward only what's needed
 * for the next turn's batch responses:
 *   1. The narrative (user's query/message)
 *   2. The singularity response from the last turn
 *   3. The particular brief from the mapper that singularity used
 */

/**
 * Build the context bridge for the next turn.
 * This extracts and packages the essential context from the completed turn
 * to inform the next turn's batch responses.
 */
export function buildContextBridge(turnState: any): ContextBridge {
  const bridge: ContextBridge = {
    query: turnState?.query || "",
    established: { positive: [], negative: [] },
    openEdges: [],
    nextStep: null,
    landscape: turnState?.mapper?.artifact || null,
    turnId: String(turnState?.turnId || ""),
  };

  // Extract the singularity output for context on next turn
  if (turnState?.singularityOutput) {
    bridge.singularityContext = {
      response: turnState.singularityOutput.response || turnState.singularityOutput.text || null,
      brief: turnState.singularityOutput.brief || null,
      narrative: turnState.singularityOutput.narrative || null,
    };
  }

  // Optionally capture the mapper brief if available separately
  if (turnState?.mapperBrief) {
    bridge.mapperBrief = turnState.mapperBrief;
  }

  return bridge;
}

/**
 * @deprecated - Use the full MapperArtifact directly
 * Kept for backwards compatibility during migration
 */
export function buildMinimalMapperArtifact(
  fullArtifact: MapperArtifact,
): MapperArtifact {
  return fullArtifact;
}
