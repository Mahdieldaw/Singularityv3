import type { CascadeEffects } from "../types/context-bridge";
import type { GraphTopology } from "../../shared/contract";

export function computeCascadeEffects(
  removedClaimIds: string[],
  graphTopology: GraphTopology,
): CascadeEffects {
  const effects: CascadeEffects = {
    orphanedClaims: [],
    freedClaims: [],
    resolvedConflicts: [],
    brokenComplements: [],
  };

  if (!graphTopology?.nodes || !graphTopology?.edges) {
    return effects;
  }

  const nodeMap = new Map(graphTopology.nodes.map((n) => [n.id, n]));
  const removedNodeIds = new Set<string>();
  for (const claimId of removedClaimIds) {
    const node = graphTopology.nodes.find(
      (n) => n.label === claimId || n.id === claimId,
    );
    if (node) removedNodeIds.add(node.id);
  }

  for (const edge of graphTopology.edges) {
    const sourceRemoved = removedNodeIds.has(edge.source);
    const targetRemoved = removedNodeIds.has(edge.target);
    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    switch (edge.type) {
      case "prerequisite": {
        if (sourceRemoved && !targetRemoved) {
          effects.orphanedClaims.push({
            claimId: edge.target,
            claimText: targetNode.label,
            lostPrerequisite: sourceNode.label,
            action: "flag",
          });
        }
        if (targetRemoved && !sourceRemoved) {
          effects.freedClaims.push({
            claimId: edge.source,
            claimText: sourceNode.label,
          });
        }
        break;
      }
      case "conflicts": {
        if (sourceRemoved && !targetRemoved) {
          effects.resolvedConflicts.push({
            survivingClaim: targetNode.label,
            eliminatedClaim: sourceNode.label,
          });
        } else if (targetRemoved && !sourceRemoved) {
          effects.resolvedConflicts.push({
            survivingClaim: sourceNode.label,
            eliminatedClaim: targetNode.label,
          });
        }
        break;
      }
      case "complements": {
        if (sourceRemoved !== targetRemoved) {
          const orphanNode = sourceRemoved ? targetNode : sourceNode;
          const lostNode = sourceRemoved ? sourceNode : targetNode;
          effects.brokenComplements.push({
            orphanedClaim: orphanNode.label,
            lostComplement: lostNode.label,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return effects;
}
