import {
  ProblemStructure,
  StructuralAnalysis,
  SettledShapeData,
  LinearShapeData,
  KeystoneShapeData,
  ContestedShapeData,
  TradeoffShapeData,
  DimensionalShapeData,
  ExploratoryShapeData,
  ContextualShapeData,
} from "../../shared/contract";

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURAL ANALYSIS INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

// TradeoffPair and StructuralAnalysis removed - using types from shared/contract

// ═══════════════════════════════════════════════════════════════════════════
// SHAPE-SPECIFIC BRIEF BUILDERS
// ═══════════════════════════════════════════════════════════════════════════

function buildSettledBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, ratios } = analysis;
  const data = shape.data as SettledShapeData;

  if (!data || data.pattern !== 'settled') {
    return buildGenericBrief(analysis);
  }

  let brief = '';

  // Header
  brief += `## Shape: SETTLED (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Strong agreement exists. The floor is established.\n\n`;

  // Floor strength indicator
  brief += `**Floor Strength**: ${data.floorStrength.toUpperCase()}\n`;
  brief += `**Claims**: ${landscape.claimCount} from ${landscape.modelCount} sources\n`;
  brief += `**Concentration**: ${Math.round(ratios.concentration * 100)}%\n\n`;

  // The Floor
  brief += `## The Floor\n\n`;
  if (data.floor.length > 0) {
    data.floor.forEach(c => {
      const contested = c.isContested ? ' ⚠️ CONTESTED' : '';
      brief += `**${c.label}** [${c.supportCount}/${landscape.modelCount}]${contested}\n`;
      brief += `${c.text}\n\n`;
    });
  } else {
    brief += `No strong consensus claims.\n\n`;
  }

  // Challengers
  if (data.challengers.length > 0) {
    brief += `## Challengers\n\n`;
    data.challengers.forEach(c => {
      brief += `⚡ **${c.label}** [${c.supportCount}/${landscape.modelCount}]\n`;
      brief += `${c.text}\n`;
      if (c.challenges) {
        brief += `*Challenges: ${c.challenges}*\n`;
      }
      brief += `\n`;
    });
  }

  // Blind Spots
  if (data.blindSpots.length > 0) {
    brief += `## Blind Spots\n\n`;
    data.blindSpots.forEach(g => {
      brief += `• ${g}\n`;
    });
    brief += `\n`;
  }

  // Warning if floor is contested
  const contestedFloor = data.floor.filter(c => c.isContested);
  if (contestedFloor.length > 0) {
    brief += `## ⚠️ Warning\n\n`;
    brief += `${contestedFloor.length} floor claim(s) are under challenge. Settlement may be fragile.\n`;
  }

  return brief;
}

function buildLinearBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, ratios } = analysis;
  const data = shape.data as LinearShapeData;

  if (!data || data.pattern !== 'linear') {
    return buildGenericBrief(analysis);
  }

  let brief = '';

  // Header
  brief += `## Shape: LINEAR (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `There's a sequence of ${data.chainLength} steps. Order matters.\n\n`;

  // Metrics
  brief += `**Chain Length**: ${data.chainLength} steps\n`;
  brief += `**Weak Links**: ${data.weakLinks.length}\n`;
  brief += `**Depth**: ${Math.round(ratios.depth * 100)}%\n\n`;

  // The Chain
  brief += `## The Chain\n\n`;
  data.chain.forEach((step, idx) => {
    const weakIcon = step.isWeakLink ? ' ⚠️ WEAK' : '';
    const arrow = idx < data.chain.length - 1 ? ' →' : ' (terminal)';

    brief += `### Step ${idx + 1}: ${step.label}${weakIcon}\n`;
    brief += `[${step.supportCount}/${landscape.modelCount}]${arrow}\n\n`;
    brief += `${step.text}\n\n`;

    if (step.isWeakLink && step.weakReason) {
      brief += `*⚠️ ${step.weakReason}*\n\n`;
    }
  });

  // Weak Links Summary
  if (data.weakLinks.length > 0) {
    brief += `## Cascade Risks\n\n`;
    data.weakLinks.forEach(wl => {
      brief += `• **${wl.step.label}** — If this fails, ${wl.cascadeSize} downstream step(s) fail\n`;
    });
    brief += `\n`;
  }

  return brief;
}

function buildKeystoneBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape } = analysis;
  const data = shape.data as KeystoneShapeData;

  if (!data || data.pattern !== 'keystone') {
    return buildGenericBrief(analysis);
  }

  let brief = '';

  // Header
  brief += `## Shape: KEYSTONE (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Everything hinges on one critical claim.\n\n`;

  // The Keystone
  const fragileIcon = data.keystone.isFragile ? ' ⚠️ FRAGILE' : ' ✓ SOLID';
  brief += `## The Keystone${fragileIcon}\n\n`;
  brief += `**${data.keystone.label}** [${data.keystone.supportCount}/${landscape.modelCount}]\n`;
  brief += `${data.keystone.text}\n\n`;
  brief += `**Dominance**: ${data.keystone.dominance.toFixed(1)}x more connected than next claim\n`;
  brief += `**Cascade Size**: ${data.cascadeSize} dependent claims\n\n`;

  // Dependencies
  if (data.dependencies.length > 0) {
    brief += `## Dependencies\n\n`;
    brief += `These claims require the keystone to hold:\n\n`;
    data.dependencies.forEach(d => {
      brief += `• **${d.label}** (${d.relationship})\n`;
    });
    brief += `\n`;
  }

  // If Keystone Fails
  brief += `## If Keystone Fails\n\n`;
  if (data.keystone.isFragile) {
    brief += `⚠️ **HIGH RISK**: The keystone has only ${data.keystone.supportCount} supporter(s).\n`;
    brief += `If it falls, ${data.cascadeSize} claims collapse with it.\n\n`;
  } else {
    brief += `The keystone has solid support, but still carries ${data.cascadeSize} dependents.\n\n`;
  }

  // Challengers to Keystone
  if (data.challengers.length > 0) {
    brief += `## Challengers to Keystone\n\n`;
    data.challengers.forEach(c => {
      brief += `⚡ **${c.label}** [${c.supportCount}/${landscape.modelCount}]\n`;
      brief += `${c.text}\n\n`;
    });
  }

  return brief;
}

function buildContestedBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, ratios, patterns } = analysis;
  const data = shape.data as ContestedShapeData;

  if (!data || data.pattern !== 'contested') {
    return buildGenericBrief(analysis);
  }

  let brief = '';

  // Header
  brief += `## Shape: CONTESTED (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `There is genuine disagreement. The axis is: **${data.centralConflict.axis}**\n\n`;

  // Metrics
  brief += `**Tension**: ${Math.round(ratios.tension * 100)}%\n`;
  brief += `**Conflicts**: ${patterns.conflicts.length}\n\n`;

  // Central Conflict
  brief += `## The Central Conflict\n\n`;

  if (data.centralConflict.type === 'cluster') {
    const cc = data.centralConflict;

    brief += `### Target Position\n`;
    brief += `**${cc.target.claim.label}** [${cc.target.claim.supportCount}/${landscape.modelCount}]\n`;
    brief += `${cc.target.claim.text}\n\n`;

    brief += `### Challenger Positions (${cc.challengers.claims.length})\n`;
    cc.challengers.claims.forEach(c => {
      brief += `⚡ **${c.label}** [${c.supportCount}/${landscape.modelCount}]\n`;
      brief += `${c.text}\n\n`;
    });

    brief += `**Common Theme**: ${cc.challengers.commonTheme}\n\n`;

  } else {
    const cc = data.centralConflict;

    brief += `### Position A\n`;
    brief += `**${cc.positionA.claim.label}** [${cc.positionA.claim.supportCount}/${landscape.modelCount}]\n`;
    brief += `${cc.positionA.claim.text}\n\n`;

    brief += `### Position B\n`;
    brief += `**${cc.positionB.claim.label}** [${cc.positionB.claim.supportCount}/${landscape.modelCount}]\n`;
    brief += `${cc.positionB.claim.text}\n\n`;

    brief += `**Dynamics**: ${cc.dynamics}\n`;
  }

  // Stakes
  brief += `\n## Stakes\n\n`;
  if (data.centralConflict.type === 'cluster') {
    brief += `• ${data.centralConflict.stakes.acceptingTarget}\n`;
    brief += `• ${data.centralConflict.stakes.acceptingChallengers}\n\n`;
  } else {
    brief += `• ${data.centralConflict.stakes.choosingA}\n`;
    brief += `• ${data.centralConflict.stakes.choosingB}\n\n`;
  }

  // Secondary Conflicts
  if (data.secondaryConflicts.length > 0) {
    brief += `## Secondary Conflicts\n\n`;
    data.secondaryConflicts.slice(0, 3).forEach(c => {
      brief += `• ${c.claimA.label} vs ${c.claimB.label}\n`;
    });
    brief += `\n`;
  }

  // Weak Floor
  if (data.floor.exists) {
    brief += `## Weak Floor (Outside Conflict)\n\n`;
    data.floor.claims.forEach(c => {
      brief += `• **${c.label}** [${c.supportCount}]\n`;
    });
    brief += `\n`;
  }

  // Collapsing Question
  if (data.collapsingQuestion) {
    brief += `## The Question\n\n`;
    brief += `${data.collapsingQuestion}\n`;
  }

  return brief;
}

function buildTradeoffBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, ratios } = analysis;
  const data = shape.data as TradeoffShapeData;

  if (!data || data.pattern !== 'tradeoff') {
    return buildGenericBrief(analysis);
  }

  let brief = '';

  // Header
  brief += `## Shape: TRADEOFF (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Explicit tradeoffs exist. No universal best.\n\n`;

  // Metrics
  brief += `**Tradeoffs**: ${data.tradeoffs.length}\n`;
  brief += `**Tension**: ${Math.round(ratios.tension * 100)}%\n\n`;

  // Each Tradeoff
  data.tradeoffs.forEach((t, idx) => {
    brief += `## Tradeoff ${idx + 1}\n\n`;

    brief += `### Option A: ${t.optionA.label}\n`;
    brief += `[${t.optionA.supportCount}/${landscape.modelCount}]\n`;
    brief += `${t.optionA.text}\n\n`;

    brief += `### Option B: ${t.optionB.label}\n`;
    brief += `[${t.optionB.supportCount}/${landscape.modelCount}]\n`;
    brief += `${t.optionB.text}\n\n`;

    brief += `**Symmetry**: ${t.symmetry.replace('_', ' ')}\n`;
    if (t.governingFactor) {
      brief += `**Governing Factor**: ${t.governingFactor}\n`;
    }
    brief += `\n`;
  });

  // Dominated Options
  if (data.dominatedOptions.length > 0) {
    brief += `## Dominated Options\n\n`;
    data.dominatedOptions.forEach(d => {
      brief += `• ${d.dominated} is dominated by ${d.dominatedBy}\n`;
      brief += `  *${d.reason}*\n`;
    });
    brief += `\n`;
  }

  // Floor
  if (data.floor.length > 0) {
    brief += `## Agreed Ground (Not In Tradeoff)\n\n`;
    data.floor.forEach(c => {
      brief += `• **${c.label}** [${c.supportCount}]\n`;
    });
    brief += `\n`;
  }

  return brief;
}

function buildDimensionalBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, graph } = analysis;
  const data = shape.data as DimensionalShapeData;

  if (!data || data.pattern !== 'dimensional') {
    return buildGenericBrief(analysis);
  }

  let brief = '';

  // Header
  brief += `## Shape: DIMENSIONAL (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Multiple independent factors determine the answer.\n\n`;

  // Metrics
  brief += `**Dimensions**: ${data.dimensions.length}\n`;
  brief += `**Components**: ${graph.componentCount}\n`;
  brief += `**Local Coherence**: ${Math.round(graph.localCoherence * 100)}%\n\n`;

  // Each Dimension
  data.dimensions.forEach((dim) => {
    brief += `## ${dim.theme}\n\n`;
    dim.claims.forEach(c => {
      brief += `• **${c.label}** [${c.supportCount}/${landscape.modelCount}]\n`;
      brief += `  ${c.text}\n\n`;
    });
  });

  // Interactions
  if (data.interactions.length > 0) {
    brief += `## Dimension Interactions\n\n`;
    data.interactions.forEach(i => {
      const icon = i.relationship === 'conflicting' ? '⚡' : i.relationship === 'overlapping' ? '↔' : '○';
      brief += `${icon} ${i.dimensionA} — ${i.dimensionB}: ${i.relationship}\n`;
    });
    brief += `\n`;
  }

  // Governing Conditions
  if (data.governingConditions.length > 0) {
    brief += `## Governing Conditions\n\n`;
    data.governingConditions.forEach(c => {
      brief += `• ${c}\n`;
    });
    brief += `\n`;
  }

  // Gaps
  if (data.gaps.length > 0) {
    brief += `## Unexplored Combinations\n\n`;
    data.gaps.forEach(g => {
      brief += `• ${g}\n`;
    });
    brief += `\n`;
  }

  return brief;
}

function buildExploratoryBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, ratios, patterns, ghostAnalysis } = analysis;
  const data = shape.data as ExploratoryShapeData;

  if (!data || data.pattern !== 'exploratory') {
    return buildGenericBrief(analysis);
  }

  let brief = '';

  // Header
  brief += `## Shape: EXPLORATORY (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Structure is sparse. Low confidence. Be honest about uncertainty.\n\n`;

  // Metrics
  brief += `**Signal Strength**: ${Math.round(data.signalStrength * 100)}%\n`;
  brief += `**Claims**: ${landscape.claimCount} (${patterns.isolatedClaims.length} isolated)\n`;
  brief += `**Fragmentation**: ${Math.round(ratios.fragmentation * 100)}%\n\n`;

  // Strongest Signals
  if (data.strongestSignals.length > 0) {
    brief += `## Strongest Signals\n\n`;
    data.strongestSignals.forEach(s => {
      brief += `**${s.label}** [${s.supportCount}/${landscape.modelCount}] — ${s.reason}\n`;
      brief += `${s.text}\n\n`;
    });
  }

  // Loose Clusters
  if (data.looseClusters.length > 0) {
    brief += `## Loose Clusters\n\n`;
    data.looseClusters.forEach(c => {
      const labels = c.claims.map(cl => cl.label).join(', ');
      brief += `• **${c.theme}**: ${labels}\n`;
    });
    brief += `\n`;
  }

  // Isolated Claims
  if (data.isolatedClaims.length > 0) {
    brief += `## Isolated Claims\n\n`;
    data.isolatedClaims.forEach(c => {
      brief += `○ **${c.label}**\n`;
      brief += `  ${c.text}\n\n`;
    });
  }

  // Clarifying Questions
  if (data.clarifyingQuestions.length > 0) {
    brief += `## To Collapse Ambiguity\n\n`;
    data.clarifyingQuestions.forEach(q => {
      brief += `• ${q}\n`;
    });
    brief += `\n`;
  }

  // Ghosts
  if (ghostAnalysis.count > 0) {
    brief += `## Gaps\n\n`;
    brief += `${ghostAnalysis.count} unaddressed area(s).\n`;
  }

  return brief;
}

function buildContextualBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape } = analysis;
  const data = shape.data as ContextualShapeData;

  if (!data || data.pattern !== 'contextual') {
    return buildGenericBrief(analysis);
  }

  let brief = '';

  // Header
  brief += `## Shape: CONTEXTUAL (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `The answer depends on specific external factors.\n\n`;

  // Governing Condition
  brief += `## The Fork\n\n`;
  brief += `**Governing Condition**: ${data.governingCondition}\n\n`;

  // Branches
  if (data.branches.length > 0) {
    brief += `## Branches\n\n`;
    data.branches.forEach((branch) => {
      brief += `### ${branch.condition}\n\n`;
      branch.claims.forEach(c => {
        brief += `• **${c.label}** [${c.supportCount}/${landscape.modelCount}]\n`;
        brief += `  ${c.text}\n\n`;
      });
    });
  }

  // Default Path
  if (data.defaultPath?.exists) {
    brief += `## Default Path (Highest Support)\n\n`;
    data.defaultPath.claims.forEach(c => {
      brief += `• **${c.label}** [${c.supportCount}]\n`;
    });
    brief += `\n`;
  }

  // Missing Context
  if (data.missingContext.length > 0) {
    brief += `## Missing Context\n\n`;
    brief += `To give a specific answer, I need to know:\n\n`;
    data.missingContext.forEach(m => {
      brief += `• ${m}\n`;
    });
    brief += `\n`;
  }

  return brief;
}

// Generic fallback
function buildGenericBrief(analysis: StructuralAnalysis): string {
  const { shape, claimsWithLeverage: claims, landscape, ratios, ghostAnalysis } = analysis;

  let brief = '';

  brief += `## Shape: ${shape.primaryPattern.toUpperCase()} (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `${shape.implications.understand}\n\n`;

  // Metrics
  brief += `## Metrics\n\n`;
  brief += `• Claims: ${landscape.claimCount} from ${landscape.modelCount} sources\n`;
  brief += `• Concentration: ${Math.round(ratios.concentration * 100)}%\n`;
  brief += `• Tension: ${Math.round(ratios.tension * 100)}%\n\n`;

  // Floor
  const floor = claims.filter(c => c.isHighSupport);
  if (floor.length > 0) {
    brief += `## Floor (${floor.length})\n\n`;
    floor.forEach(c => {
      brief += `**${c.label}** [${c.supporters.length}/${landscape.modelCount}]\n`;
      brief += `${c.text}\n\n`;
    });
  }

  // Low support
  const lowSupport = claims.filter(c => !c.isHighSupport);
  if (lowSupport.length > 0) {
    brief += `## Other Claims (${lowSupport.length})\n\n`;
    lowSupport.slice(0, 5).forEach(c => {
      const icon = c.role === 'challenger' ? '⚡' : '○';
      brief += `${icon} **${c.label}** [${c.supporters.length}]\n`;
    });
    if (lowSupport.length > 5) {
      brief += `... and ${lowSupport.length - 5} more\n`;
    }
    brief += `\n`;
  }

  // Ghosts
  if (ghostAnalysis.count > 0) {
    brief += `## Gaps\n\n`;
    brief += `${ghostAnalysis.count} unaddressed area(s).\n`;
  }

  return brief;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════

function buildStructuralBrief(analysis: StructuralAnalysis): string {
  const { shape } = analysis;

  // If no shape data, use generic
  if (!shape.data) {
    return buildGenericBrief(analysis);
  }

  switch (shape.primaryPattern) {
    case 'settled':
      return buildSettledBrief(analysis);
    case 'linear':
      return buildLinearBrief(analysis);
    case 'keystone':
      return buildKeystoneBrief(analysis);
    case 'contested':
      return buildContestedBrief(analysis);
    case 'tradeoff':
      return buildTradeoffBrief(analysis);
    case 'dimensional':
      return buildDimensionalBrief(analysis);
    case 'contextual':
      return buildContextualBrief(analysis);
    case 'exploratory':
    default:
      return buildExploratoryBrief(analysis);
  }
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
