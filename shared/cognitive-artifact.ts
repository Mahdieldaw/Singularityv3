export function buildCognitiveArtifact(
  mapper?: any,
  pipeline?: any,
): any | null {
  if (!mapper && !pipeline) return null;

  // If mapper is already a CognitiveArtifact (has .semantic), pass through
  if (mapper?.semantic?.claims) {
    return mapper;
  }

  const substrateGraph = pipeline?.substrate?.graph;
  const traversalGraph = mapper?.traversalGraph;

  return {
    shadow: {
      statements:
        pipeline?.shadow?.extraction?.statements ??
        mapper?.shadow?.statements ??
        [],
      paragraphs: pipeline?.paragraphProjection?.paragraphs ?? [],
      audit: mapper?.shadow?.audit ?? {},
      delta: pipeline?.shadow?.delta ?? null,
    },
    geometry: {
      embeddingStatus: pipeline?.substrate ? 'computed' : 'failed',
      substrate: {
        nodes: substrateGraph?.nodes ?? [],
        edges: substrateGraph?.edges ?? [],
      },
      preSemantic: pipeline?.preSemantic
        ? { hint: pipeline.preSemantic.lens?.shape ?? 'sparse' }
        : undefined,
    },
    semantic: {
      claims: mapper?.claims ?? [],
      edges: mapper?.edges ?? [],
      conditionals: mapper?.conditionals ?? [],
      narrative: mapper?.narrative,
      ghosts: Array.isArray(mapper?.ghosts) ? mapper.ghosts : undefined,
    },
    traversal: {
      forcingPoints: mapper?.forcingPoints ?? [],
      graph: traversalGraph
        ? {
          claims: traversalGraph.claims ?? [],
          tensions: traversalGraph.tensions ?? [],
          tiers: traversalGraph.tiers ?? [],
          maxTier: traversalGraph.maxTier ?? 0,
          roots: traversalGraph.roots ?? [],
          cycles: traversalGraph.cycles ?? [],
        }
        : {
          claims: [],
          tensions: [],
          tiers: [],
          maxTier: 0,
          roots: [],
          cycles: [],
        },
    },
    meta: {
      modelCount: mapper?.model_count ?? mapper?.modelCount ?? undefined,
      query: mapper?.query ?? undefined,
      turn: mapper?.turn ?? undefined,
      timestamp: mapper?.timestamp ?? undefined,
    },
  };
}
