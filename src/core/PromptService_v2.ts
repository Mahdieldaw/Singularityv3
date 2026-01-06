import {
  ProblemStructure,
  StructuralAnalysis, // Imported from contract
} from "../../shared/contract";

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURAL ANALYSIS INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

// TradeoffPair and StructuralAnalysis removed - using types from shared/contract

// ═══════════════════════════════════════════════════════════════════════════
// THE STRUCTURAL BRIEF
// ═══════════════════════════════════════════════════════════════════════════

function buildStructuralBrief(analysis: StructuralAnalysis): string {
  const {
    shape,
    claimsWithLeverage: claims,
    patterns,
    graph,
    ratios,
    ghostAnalysis,
    landscape,
    edges
  } = analysis;

  let brief = '';

  // Shape
  brief += `## Shape: ${shape.primaryPattern.toUpperCase()} (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `${shape.implications.understand}\n\n`;
  brief += `**Evidence:**\n${shape.evidence.map(e => `• ${e}`).join('\n')}\n\n`;

  // Metrics
  brief += `## Metrics\n\n`;
  brief += `• Claims: ${landscape.claimCount} from ${landscape.modelCount} sources\n`;
  brief += `• Edges: ${edges.length}\n`;
  brief += `• Concentration: ${Math.round(ratios.concentration * 100)}%\n`;
  brief += `• Alignment: ${Math.round(ratios.alignment * 100)}%\n`;
  brief += `• Tension: ${Math.round(ratios.tension * 100)}%\n`;
  brief += `• Fragmentation: ${Math.round(ratios.fragmentation * 100)}%\n`;
  brief += `• Depth: ${Math.round(ratios.depth * 100)}%\n\n`;

  // Floor
  const floor = claims.filter(c => c.isHighSupport);
  brief += `## Floor (${floor.length})\n\n`;
  floor.forEach(c => {
    brief += `**${c.label}** [${c.supporters.length}/${landscape.modelCount}]\n`;
    brief += `${c.text}\n\n`;
  });
  if (floor.length === 0) brief += `None.\n\n`;

  // Tensions
  brief += `## Tensions\n\n`;
  if (patterns.conflicts.length > 0) {
    patterns.conflicts.forEach(c => {
      const q = c.isBothConsensus ? ' [both high-support]' : '';
      const d = c.dynamics === 'symmetric' ? ' (evenly split)' : ' (asymmetric)';
      brief += `• ${c.claimA.label} vs ${c.claimB.label}${q}${d}\n`;
    });
  }
  if (patterns.tradeoffs.length > 0) {
    patterns.tradeoffs.forEach(t => {
      brief += `• ${t.claimA.label} ↔ ${t.claimB.label} (${t.symmetry.replace('_', ' ')})\n`;
    });
  }
  if (patterns.conflicts.length === 0 && patterns.tradeoffs.length === 0) {
    brief += `None.\n`;
  }
  brief += `\n`;

  // Fragilities
  brief += `## Fragilities\n\n`;
  if (patterns.leverageInversions.length > 0) {
    patterns.leverageInversions.forEach(inv => {
      brief += `• ${inv.claimLabel}: ${inv.reason.replace(/_/g, ' ')}`;
      if (inv.affectedClaims.length > 0) brief += ` (affects ${inv.affectedClaims.length})`;
      brief += `\n`;
    });
  }
  if (patterns.cascadeRisks.filter(r => r.dependentIds.length >= 2).length > 0) {
    patterns.cascadeRisks.filter(r => r.dependentIds.length >= 2).forEach(r => {
      brief += `• ${r.sourceLabel} → ${r.dependentIds.length} dependents (depth ${r.depth})\n`;
    });
  }
  if (graph.articulationPoints.length > 0) {
    graph.articulationPoints.forEach(id => {
      const c = claims.find(c => c.id === id);
      if (c) brief += `• Bridge: ${c.label} [${c.supporters.length}]\n`;
    });
  }
  if (patterns.leverageInversions.length === 0 &&
    patterns.cascadeRisks.length === 0 &&
    graph.articulationPoints.length === 0) {
    brief += `None.\n`;
  }
  brief += `\n`;

  // Topology
  brief += `## Topology\n\n`;
  brief += `• Components: ${graph.componentCount}\n`;
  brief += `• Longest chain: ${graph.longestChain.length}\n`;
  brief += `• Cluster cohesion: ${Math.round(graph.clusterCohesion * 100)}%\n`;
  brief += `• Local coherence: ${Math.round(graph.localCoherence * 100)}%\n`;
  if (graph.hubClaim) {
    const hub = claims.find(c => c.id === graph.hubClaim);
    brief += `• Hub: ${hub?.label || graph.hubClaim} (${graph.hubDominance.toFixed(1)}x)\n`;
  }
  brief += `\n`;

  // Low-support
  const lowSupport = claims.filter(c => !c.isHighSupport);
  brief += `## Low-Support (${lowSupport.length})\n\n`;
  lowSupport.forEach(c => {
    const icon = c.role === 'challenger' ? '⚡' : c.isLeverageInversion ? '⚠' : '○';
    brief += `${icon} **${c.label}** [${c.supporters.length}/${landscape.modelCount}]\n`;
    brief += `${c.text}\n\n`;
  });
  if (lowSupport.length === 0) brief += `None.\n\n`;

  // Ghosts
  brief += `## Gaps\n\n`;
  brief += ghostAnalysis.count > 0
    ? `${ghostAnalysis.count} unaddressed area(s).${ghostAnalysis.mayExtendChallenger ? ' May extend challenger perspectives.' : ''}\n`
    : `None.\n`;
  brief += `\n`;

  // Convergence
  if (patterns.convergencePoints.length > 0) {
    brief += `## Convergence\n\n`;
    patterns.convergencePoints.forEach(cp => {
      brief += `• ${cp.targetLabel} ← ${cp.sourceLabels.join(', ')} (${cp.edgeType})\n`;
    });
    brief += `\n`;
  }

  // Isolated
  if (patterns.isolatedClaims.length > 0) {
    brief += `## Isolated\n\n`;
    patterns.isolatedClaims.forEach(id => {
      const c = claims.find(c => c.id === id);
      if (c) brief += `• ${c.label}\n`;
    });
    brief += `\n`;
  }

  return brief;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHAPE-SPECIFIC GUIDANCE
// ═══════════════════════════════════════════════════════════════════════════

function getShapeGuidance(shape: ProblemStructure): string {
  const guidance: Record<ProblemStructure['primaryPattern'], string> = {

    settled: `**Shape Guidance: SETTLED**
The landscape has strong agreement. Speak with confidence—the structure supports it.
Lead with the answer. If the user probes, challenge assumptions or explore edge cases.
Watch for blind spots in the consensus.`,

    contested: `**Shape Guidance: CONTESTED**
Genuine disagreement exists on a clear axis. Surface this tension naturally.
Present both sides as valid depending on priorities. Don't pick a side unless user gives context.
Help them see what choosing requires.`,

    keystone: `**Shape Guidance: KEYSTONE**
Everything hinges on one critical claim. Center your response around it.
Show what depends on it. If user asks "why" or "what if," stress-test the keystone.
If it fails, acknowledge the cascade.`,

    linear: `**Shape Guidance: LINEAR**
There's a clear sequence. Walk through steps in order.
Emphasize why order matters (prerequisites, dependencies).
Help user identify where they are in the chain.`,

    tradeoff: `**Shape Guidance: TRADEOFF**
Explicit tradeoffs exist. No universal best.
Map what is sacrificed for what is gained. Ask about priorities.
Don't force a choice—show consequences of each path.`,

    dimensional: `**Shape Guidance: DIMENSIONAL**
Multiple valid paths depending on context. Different situations require different approaches.
Ask which dimension matters to them. Present options tied to conditions.
Don't collapse prematurely.`,

    contextual: `**Shape Guidance: CONTEXTUAL**
The answer depends on specific external factors. Don't guess.
Ask for the missing context directly.
Explain why the answer changes based on that context.`,

    exploratory: `**Shape Guidance: EXPLORATORY**
Structure is sparse. Low confidence. Be honest about uncertainty.
Don't overstate. Ask clarifying questions that would collapse ambiguity.
Identify what context would help.`,
  };

  return guidance[shape.primaryPattern] || guidance.exploratory;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE PROMPT
// ═══════════════════════════════════════════════════════════════════════════

export function buildConciergePrompt(
  userMessage: string,
  analysis: StructuralAnalysis
): string {

  const structuralBrief = buildStructuralBrief(analysis);
  const shapeGuidance = getShapeGuidance(analysis.shape);

  return `You are Singularity—an intelligence that has drawn from multiple expert perspectives.

## The Query

"${userMessage}"

## What You Know

${structuralBrief}

## How To Respond

${shapeGuidance}

## Voice

- Direct. No preamble.
- Conviction when structure supports it
- Acknowledge uncertainty when fragile
- Surface tensions naturally
- End with forward motion

## Never

- Reference "models," "analysis," "structure"
- Hedge without explaining on what
- Be vague when you have signal

Respond.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// WORD SWAPPING
// ═══════════════════════════════════════════════════════════════════════════

const SWAPS: Array<[RegExp, string]> = [
  [/\bthe models\b/gi, 'the experts'],
  [/\bmodels\b/gi, 'perspectives'],
  [/\baccording to (the )?analysis\b/gi, 'from what I see'],
  [/\bbased on (the )?(structural )?analysis\b/gi, 'from the evidence'],
  [/\bthe analysis (shows|indicates|suggests)\b/gi, 'the evidence $1'],
  [/\bconsensus\b/gi, 'agreement'],
  [/\bclaim_\d+\b/gi, ''],
  [/\bstructural(ly)?\b/gi, ''],
  [/\bhigh-support claim/gi, 'strong position'],
  [/\blow-support claim/gi, 'minority view'],
];

export function postProcess(response: string): string {
  let out = response;
  SWAPS.forEach(([pattern, replacement]) => {
    out = out.replace(pattern, replacement);
  });
  return out.replace(/\s{2,}/g, ' ').trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// META HANDLING
// ═══════════════════════════════════════════════════════════════════════════

export function isMetaQuery(message: string): boolean {
  return [
    /how many (models|experts|sources)/i,
    /what (models|sources)/i,
    /show (me )?(the )?(structure|map|graph)/i,
    /how (do|does) (you|this) work/i,
    /where (does|did) this come from/i,
  ].some(p => p.test(message));
}

export function buildMetaResponse(analysis: StructuralAnalysis): string {
  const { landscape, patterns, shape, ghostAnalysis } = analysis;
  const highSupportCount = analysis.claimsWithLeverage.filter(c => c.isHighSupport).length;
  const tensionCount = patterns.conflicts.length + patterns.tradeoffs.length;

  return `I drew from ${landscape.modelCount} expert perspectives to form this view.

• **Pattern:** ${shape.primaryPattern} (${Math.round(shape.confidence * 100)}%)
• **Strong positions:** ${highSupportCount}
• **Tensions:** ${tensionCount}
• **Gaps:** ${ghostAnalysis.count}

${shape.implications.understand}

Want the full map, or shall we continue?`;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export async function handleTurn(
  userMessage: string,
  analysis: StructuralAnalysis,
  callLLM: (prompt: string) => Promise<string>
): Promise<string> {

  if (isMetaQuery(userMessage)) {
    return buildMetaResponse(analysis);
  }

  const prompt = buildConciergePrompt(userMessage, analysis);
  const raw = await callLLM(prompt);

  return postProcess(raw);
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAKAGE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export function detectMachineryLeakage(text: string): { leaked: boolean; violations: string[] } {
  const violations: string[] = [];
  const lower = text.toLowerCase();

  // Check for raw artifacts/IDs
  if (/claim_\d+/.test(text)) violations.push("raw_claim_id");
  if (/clustering_coefficient/.test(lower)) violations.push("raw_metric_name");

  // Check for forbidden terms from SWAPS that shouldn't appear even after swapping if the model outputs them directly
  // (We check the original text, but some might be valid in other contexts. 
  // Here we focus on things that clearly break the immersion)
  const FORBIDDEN_PHRASES = [
    "structural analysis",
    "graph topology",
    "according to the model",
    "based on the analysis",
    "high-support claim",
    "low-support claim"
  ];

  FORBIDDEN_PHRASES.forEach(phrase => {
    if (lower.includes(phrase)) {
      violations.push(`phrase: ${phrase}`);
    }
  });

  return {
    leaked: violations.length > 0,
    violations
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const ConciergeService = {
  buildConciergePrompt,
  postProcess,
  detectMachineryLeakage,
  isMetaQuery,
  buildMetaResponse,
  handleTurn,
};
