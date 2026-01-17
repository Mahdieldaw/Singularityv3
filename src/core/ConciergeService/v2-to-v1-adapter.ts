/**
 * V2-to-V1 Adapter
 * Converts Semantic Mapper V2 output to Legacy V1 format
 * Preserves all new V2 features as metadata extensions
 */

// No external imports so this file is portable and easy to test independently

type V2Claim = any;
type SemanticMapperOutput = any;

type ShadowStatement = { id: string; modelIndex?: number };

export function mapStanceToType(stance: string) {
  switch (stance) {
    case 'prescriptive':
    case 'cautionary':
      return 'prescriptive';
    case 'prerequisite':
    case 'dependent':
      return 'conditional';
    case 'assertive':
      return 'factual';
    case 'uncertain':
      return 'speculative';
    default:
      return 'factual';
  }
}

export function detectChallengerRole(claim: V2Claim, allClaims: V2Claim[]) {
  // Default
  let role: 'challenger' | 'anchor' | null = null;
  let challenges: string | null = null;

  try {
    const hasTension = Array.isArray(claim.edges?.tension) && claim.edges.tension.length > 0;

    if (claim.stance === 'cautionary' && hasTension) {
      role = 'challenger';
      challenges = claim.edges.tension[0]?.targetClaimId || null;
    } else if (hasTension) {
      // If it has tension edges but not explicitly cautionary, treat as competing anchor
      role = 'anchor';
      challenges = null;
    }
  } catch (e) { }
  // Optionally log in development: console.warn('detectChallengerRole error:', e);

  return { role, challenges };
}

export function extractSupporterModels(claim: V2Claim, shadowStatements: ShadowStatement[] = []) {
  const modelSet = new Set<number>();
  try {
    const srcIds = claim.sourceStatementIds || [];
    for (const stmtId of srcIds) {
      const stmt = shadowStatements.find(s => s.id === stmtId);
      if (stmt && typeof stmt.modelIndex === 'number') {
        modelSet.add(stmt.modelIndex);
      } else {
        // Try to parse model index from id (e.g., s_0 or stmt_1)
        const m = String(stmtId || '').match(/(\d+)$/);
        if (m) modelSet.add(Number(m[1]) + 1 - 1); // keep raw index if present
      }
    }
  } catch (_) { }
  return Array.from(modelSet).sort((a, b) => a - b);
}

export function gatesToEdges(claim: V2Claim) {
  const edges: any[] = [];
  try {
    const prereqs = (claim.gates && claim.gates.prerequisites) || [];
    for (const gate of prereqs) {
      edges.push({
        from: gate.claimId,
        to: claim.id,
        type: 'prerequisite',
        _v2: {
          sourceStatementIds: gate.sourceStatementIds || [],
          gateType: 'prerequisite'
        }
      });
    }
  } catch (_) { }
  return edges;
}

export function convertV2toV1(v2Output: SemanticMapperOutput, shadowStatements: ShadowStatement[] = [], metadata: { query: string; turn: number; model_count: number; }) {
  const v1Claims: any[] = [];
  const v1Edges: any[] = [];

  const allClaims = Array.isArray(v2Output?.claims) ? v2Output.claims : [];

  for (const v2Claim of allClaims) {
    const supporters = extractSupporterModels(v2Claim, shadowStatements);
    const { role, challenges } = detectChallengerRole(v2Claim, allClaims);

    v1Claims.push({
      id: v2Claim.id,
      label: v2Claim.label || v2Claim.title || v2Claim.id,
      text: v2Claim.description || v2Claim.label || v2Claim.title || '',
      supporters: supporters,
      type: mapStanceToType(v2Claim.stance),
      role: role,
      challenges: challenges,
      // Preserve V2 data
      _v2: {
        stance: v2Claim.stance,
        gates: v2Claim.gates,
        sourceStatementIds: v2Claim.sourceStatementIds,
        description: v2Claim.description,
        raw: v2Claim
      }
    });
  }

  for (const v2Claim of allClaims) {
    // Sequence edges -> supports
    const seq = (v2Claim.edges && v2Claim.edges.sequence) || [];
    for (const seqEdge of seq) {
      v1Edges.push({
        from: v2Claim.id,
        to: seqEdge.targetClaimId,
        type: 'supports',
        _v2: {
          sourceStatementIds: seqEdge.sourceStatementIds || [],
          edgeType: 'sequence'
        }
      });
    }

    // Tension edges -> conflicts or tradeoff
    const tension = (v2Claim.edges && v2Claim.edges.tension) || [];
    for (const tEdge of tension) {
      const targetClaim = allClaims.find((c: any) => c.id === tEdge.targetClaimId);
      const isTradeoff = v2Claim.stance === 'prescriptive' && targetClaim?.stance === 'prescriptive';
      v1Edges.push({
        from: v2Claim.id,
        to: tEdge.targetClaimId,
        type: isTradeoff ? 'tradeoff' : 'conflicts',
        _v2: {
          sourceStatementIds: tEdge.sourceStatementIds || [],
          edgeType: 'tension'
        }
      });
    }

    // Gates -> prerequisite edges
    const gateEdges = gatesToEdges(v2Claim);
    for (const ge of gateEdges) v1Edges.push(ge);
  }

  const artifact = {
    id: `artifact-${Date.now()}`,
    claims: v1Claims,
    edges: v1Edges,
    ghosts: [],
    query: metadata.query,
    turn: metadata.turn,
    timestamp: new Date().toISOString(),
    model_count: metadata.model_count,
    _v2: {
      fullSemanticOutput: v2Output
    }
  };

  return artifact;
}
