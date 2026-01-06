// ═══════════════════════════════════════════════════════════════════════════
// CONCIERGE SERVICE
// The Voice of Singularity
// ═══════════════════════════════════════════════════════════════════════════

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
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ConciergeStance = 'default' | 'decide' | 'explore' | 'challenge';

interface StanceGuidance {
  framing: string;
  behavior: string;
  voice: string;
}

interface StanceSelection {
  stance: ConciergeStance;
  reason: 'query_signal' | 'shape_default';
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// STANCE SELECTION
// ═══════════════════════════════════════════════════════════════════════════

export function selectStance(
  userMessage: string,
  shape: ProblemStructure
): StanceSelection {
  
  // 1. Check for explicit query signals first
  const queryStance = detectQueryIntent(userMessage);
  if (queryStance.stance !== 'default') {
    return {
      stance: queryStance.stance,
      reason: 'query_signal',
      confidence: queryStance.confidence
    };
  }
  
  // 2. Shape-informed defaults
  const shapeStance = getShapeDefaultStance(shape);
  return {
    stance: shapeStance.stance,
    reason: 'shape_default',
    confidence: shapeStance.confidence
  };
}

function detectQueryIntent(userMessage: string): { stance: ConciergeStance; confidence: number } {
  const lower = userMessage.toLowerCase();
  
  // DECIDE signals (high confidence)
  const strongDecide = [
    /\bshould i\b/,
    /\bjust tell me\b/,
    /\bwhat do i do\b/,
    /\bmake (the |a )?decision\b/,
    /\bpick (one|the best)\b/,
  ];
  if (strongDecide.some(p => p.test(lower))) {
    return { stance: 'decide', confidence: 0.9 };
  }
  
  // DECIDE signals (medium confidence)
  const mediumDecide = [
    /\bwhich (one|should)\b/,
    /\bchoose\b/,
    /\bbest\b/,
    /\brecommend\b/,
  ];
  if (mediumDecide.some(p => p.test(lower))) {
    return { stance: 'decide', confidence: 0.7 };
  }
  
  // CHALLENGE signals
  const challengePatterns = [
    /\bwhat('s| is) wrong\b/,
    /\bchallenge\b/,
    /\bdevil'?s advocate\b/,
    /\bpoke holes\b/,
    /\bstress test\b/,
    /\bwhat am i missing\b/,
    /\bblind spot/,
    /\bweak(ness|point)/,
    /\bcritique\b/,
    /\bpush back\b/,
    /\battack\b/,
  ];
  if (challengePatterns.some(p => p.test(lower))) {
    return { stance: 'challenge', confidence: 0.85 };
  }
  
  // EXPLORE signals
  const explorePatterns = [
    /\bwhat are (the |my )?options\b/,
    /\bexplore\b/,
    /\bmap out\b/,
    /\bpossibilities\b/,
    /\balternatives\b/,
    /\bwhat else\b/,
    /\btrade-?offs?\b/,
    /\bpros and cons\b/,
    /\bcompare\b/,
    /\bbreak(down| it down)\b/,
    /\bwalk me through\b/,
  ];
  if (explorePatterns.some(p => p.test(lower))) {
    return { stance: 'explore', confidence: 0.75 };
  }
  
  // No strong signal
  return { stance: 'default', confidence: 0.5 };
}

function getShapeDefaultStance(shape: ProblemStructure): { stance: ConciergeStance; confidence: number } {
  switch (shape.primaryPattern) {
    case 'tradeoff':
      // Explicit tradeoffs - explore helps map the space
      return { stance: 'explore', confidence: 0.7 };
      
    case 'exploratory':
      // Sparse structure - explore to find what matters
      return { stance: 'explore', confidence: 0.65 };
      
    case 'dimensional':
      // Multiple factors - explore to surface dimensions
      return { stance: 'explore', confidence: 0.6 };
      
    case 'contextual':
      // Need more info - explore to surface what's missing
      return { stance: 'explore', confidence: 0.65 };
      
    case 'contested':
    case 'settled':
    case 'keystone':
    case 'linear':
    default:
      // Default stance works well for these
      return { stance: 'default', confidence: 0.6 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STANCE GUIDANCE
// ═══════════════════════════════════════════════════════════════════════════

function getStanceGuidance(stance: ConciergeStance): StanceGuidance {
  switch (stance) {
    case 'decide':
      return {
        framing: 'The user needs a decision, not exploration.',
        behavior: `Eliminate until one path remains.

Apply these filters to every position:
1. **Actionability**: Can someone DO something with this?
2. **Relevance**: Does it advance toward the implied goal?
3. **Superiority**: Does it BEAT alternatives, or merely exist alongside them?

What fails these tests gets eliminated. What survives is the answer.

If multiple paths survive, state the tiebreaker: "If X matters more, do A. If Y matters more, do B."
If nothing survives cleanly, say so—explain what's missing.

Do not hedge. Do not present options. Decide.`,
        voice: `- Decisive. No hedging without explicit conditions.
- If something was eliminated, you may briefly note why.
- End with: "Do X. Here's why. Next step: Y."`
      };
      
    case 'explore':
      return {
        framing: 'The user wants to see the territory, not collapse to an answer.',
        behavior: `Open the space. Show the branches. Don't pick for them.

- Surface dimensions they might not have considered
- Show where positions fork based on context
- Present tradeoffs explicitly: "Optimizing for X gives you A. Optimizing for Y gives you B."
- Identify what context would change the answer

You are a map, not a guide. Let them navigate.`,
        voice: `- Curious. Generative. 
- "If X, then A. If Y, then B."
- "The key variable here is..."
- End with a question that would help them navigate: "What matters more to you: X or Y?"`
      };
      
    case 'challenge':
      return {
        framing: 'The user wants their assumptions tested. Be adversarial.',
        behavior: `Attack the floor. Find the fragile foundations.

- What does the apparent consensus assume without stating?
- Which low-support positions have structural importance? (They might be right.)
- What conditions would make the strongest position fail?
- What are the challengers seeing that the floor is missing?

You are the devil's advocate. Find the cracks. Surface the risk.
But be constructive—challenge to strengthen, not to destroy.`,
        voice: `- Adversarial but constructive.
- "The agreement assumes X. But what if X is false?"
- "The weak point here is..."
- End with the strongest counter-position that survives scrutiny.`
      };
      
    case 'default':
    default:
      return {
        framing: '',
        behavior: `Respond directly to the query using what the structure reveals.

- If there's strong agreement, speak with confidence.
- If there's genuine tension, surface it naturally—don't hide it.
- If the structure is sparse, acknowledge uncertainty.
- Land somewhere useful. Don't leave them suspended in possibility.`,
        voice: `- Direct. No preamble.
- Conviction when structure supports it.
- Acknowledge uncertainty when structure is fragile.
- Surface tensions when they matter.
- End with forward motion—a next step, a key question, or a clear position.`
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SHAPE-SPECIFIC BRIEFS
// ═══════════════════════════════════════════════════════════════════════════

function buildSettledBrief(analysis: StructuralAnalysis): string {
  const { shape, landscape, ratios, ghostAnalysis } = analysis;
  const data = shape.data as SettledShapeData;
  
  if (!data || data.pattern !== 'settled') {
    return buildGenericBrief(analysis);
  }
  
  let brief = '';
  
  brief += `## Shape: SETTLED (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Strong agreement exists. The floor is established.\n\n`;
  brief += `**Floor Strength**: ${data.floorStrength.toUpperCase()}\n`;
  brief += `**Claims**: ${landscape.claimCount} from ${landscape.modelCount} sources\n`;
  brief += `**Concentration**: ${Math.round(ratios.concentration * 100)}%\n\n`;
  
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
  
  if (data.blindSpots.length > 0) {
    brief += `## Blind Spots\n\n`;
    data.blindSpots.forEach(g => {
      brief += `• ${g}\n`;
    });
    brief += `\n`;
  }
  
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
  
  brief += `## Shape: LINEAR (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `There's a sequence of ${data.chainLength} steps. Order matters.\n\n`;
  brief += `**Chain Length**: ${data.chainLength} steps\n`;
  brief += `**Weak Links**: ${data.weakLinks.length}\n`;
  brief += `**Depth**: ${Math.round(ratios.depth * 100)}%\n\n`;
  
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
  
  brief += `## Shape: KEYSTONE (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Everything hinges on one critical claim.\n\n`;
  
  const fragileIcon = data.keystone.isFragile ? ' ⚠️ FRAGILE' : ' ✓ SOLID';
  brief += `## The Keystone${fragileIcon}\n\n`;
  brief += `**${data.keystone.label}** [${data.keystone.supportCount}/${landscape.modelCount}]\n`;
  brief += `${data.keystone.text}\n\n`;
  brief += `**Dominance**: ${data.keystone.dominance.toFixed(1)}x more connected than next claim\n`;
  brief += `**Cascade Size**: ${data.cascadeSize} dependent claims\n\n`;
  
  if (data.dependencies.length > 0) {
    brief += `## Dependencies\n\n`;
    brief += `These claims require the keystone to hold:\n\n`;
    data.dependencies.forEach(d => {
      brief += `• **${d.label}** (${d.relationship})\n`;
    });
    brief += `\n`;
  }
  
  brief += `## If Keystone Fails\n\n`;
  if (data.keystone.isFragile) {
    brief += `⚠️ **HIGH RISK**: The keystone has only ${data.keystone.supportCount} supporter(s).\n`;
    brief += `If it falls, ${data.cascadeSize} claims collapse with it.\n\n`;
  } else {
    brief += `The keystone has solid support, but still carries ${data.cascadeSize} dependents.\n\n`;
  }
  
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
  
  brief += `## Shape: CONTESTED (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `There is genuine disagreement. The axis is: **${data.centralConflict.axis}**\n\n`;
  brief += `**Tension**: ${Math.round(ratios.tension * 100)}%\n`;
  brief += `**Conflicts**: ${patterns.conflicts.length}\n\n`;
  
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
  
  brief += `\n## Stakes\n\n`;
  if (data.centralConflict.type === 'cluster') {
    brief += `• ${data.centralConflict.stakes.acceptingTarget}\n`;
    brief += `• ${data.centralConflict.stakes.acceptingChallengers}\n\n`;
  } else {
    brief += `• ${data.centralConflict.stakes.choosingA}\n`;
    brief += `• ${data.centralConflict.stakes.choosingB}\n\n`;
  }
  
  if (data.secondaryConflicts.length > 0) {
    brief += `## Secondary Conflicts\n\n`;
    data.secondaryConflicts.slice(0, 3).forEach(c => {
      brief += `• ${c.claimA.label} vs ${c.claimB.label}\n`;
    });
    brief += `\n`;
  }
  
  if (data.floor.exists) {
    brief += `## Weak Floor (Outside Conflict)\n\n`;
    data.floor.claims.forEach(c => {
      brief += `• **${c.label}** [${c.supportCount}]\n`;
    });
    brief += `\n`;
  }
  
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
  
  brief += `## Shape: TRADEOFF (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Explicit tradeoffs exist. No universal best.\n\n`;
  brief += `**Tradeoffs**: ${data.tradeoffs.length}\n`;
  brief += `**Tension**: ${Math.round(ratios.tension * 100)}%\n\n`;
  
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
  
  if (data.dominatedOptions.length > 0) {
    brief += `## Dominated Options\n\n`;
    data.dominatedOptions.forEach(d => {
      brief += `• ${d.dominated} is dominated by ${d.dominatedBy}\n`;
      brief += `  *${d.reason}*\n`;
    });
    brief += `\n`;
  }
  
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
  
  brief += `## Shape: DIMENSIONAL (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Multiple independent factors determine the answer.\n\n`;
  brief += `**Dimensions**: ${data.dimensions.length}\n`;
  brief += `**Components**: ${graph.componentCount}\n`;
  brief += `**Local Coherence**: ${Math.round(graph.localCoherence * 100)}%\n\n`;
  
  data.dimensions.forEach((dim) => {
    brief += `## ${dim.theme}\n\n`;
    dim.claims.forEach(c => {
      brief += `• **${c.label}** [${c.supportCount}/${landscape.modelCount}]\n`;
      brief += `  ${c.text}\n\n`;
    });
  });
  
  if (data.interactions.length > 0) {
    brief += `## Dimension Interactions\n\n`;
    data.interactions.forEach(i => {
      const icon = i.relationship === 'conflicting' ? '⚡' : i.relationship === 'overlapping' ? '↔' : '○';
      brief += `${icon} ${i.dimensionA} — ${i.dimensionB}: ${i.relationship}\n`;
    });
    brief += `\n`;
  }
  
  if (data.governingConditions.length > 0) {
    brief += `## Governing Conditions\n\n`;
    data.governingConditions.forEach(c => {
      brief += `• ${c}\n`;
    });
    brief += `\n`;
  }
  
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
  
  brief += `## Shape: EXPLORATORY (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `Structure is sparse. Low confidence. Be honest about uncertainty.\n\n`;
  brief += `**Signal Strength**: ${Math.round(data.signalStrength * 100)}%\n`;
  brief += `**Claims**: ${landscape.claimCount} (${patterns.isolatedClaims.length} isolated)\n`;
  brief += `**Fragmentation**: ${Math.round(ratios.fragmentation * 100)}%\n\n`;
  
  if (data.strongestSignals.length > 0) {
    brief += `## Strongest Signals\n\n`;
    data.strongestSignals.forEach(s => {
      brief += `**${s.label}** [${s.supportCount}/${landscape.modelCount}] — ${s.reason}\n`;
      brief += `${s.text}\n\n`;
    });
  }
  
  if (data.looseClusters.length > 0) {
    brief += `## Loose Clusters\n\n`;
    data.looseClusters.forEach(c => {
      const labels = c.claims.map(cl => cl.label).join(', ');
      brief += `• **${c.theme}**: ${labels}\n`;
    });
    brief += `\n`;
  }
  
  if (data.isolatedClaims.length > 0) {
    brief += `## Isolated Claims\n\n`;
    data.isolatedClaims.forEach(c => {
      brief += `○ **${c.label}**\n`;
      brief += `  ${c.text}\n\n`;
    });
  }
  
  if (data.clarifyingQuestions.length > 0) {
    brief += `## To Collapse Ambiguity\n\n`;
    data.clarifyingQuestions.forEach(q => {
      brief += `• ${q}\n`;
    });
    brief += `\n`;
  }
  
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
  
  brief += `## Shape: CONTEXTUAL (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `The answer depends on specific external factors.\n\n`;
  
  brief += `## The Fork\n\n`;
  brief += `**Governing Condition**: ${data.governingCondition}\n\n`;
  
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
  
  if (data.defaultPath?.exists) {
    brief += `## Default Path (Highest Support)\n\n`;
    data.defaultPath.claims.forEach(c => {
      brief += `• **${c.label}** [${c.supportCount}]\n`;
    });
    brief += `\n`;
  }
  
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

function buildGenericBrief(analysis: StructuralAnalysis): string {
  const { shape, claimsWithLeverage: claims, landscape, ratios, ghostAnalysis } = analysis;
  
  let brief = '';
  
  brief += `## Shape: ${shape.primaryPattern.toUpperCase()} (${Math.round(shape.confidence * 100)}%)\n\n`;
  brief += `${shape.implications.understand}\n\n`;
  
  brief += `## Metrics\n\n`;
  brief += `• Claims: ${landscape.claimCount} from ${landscape.modelCount} sources\n`;
  brief += `• Concentration: ${Math.round(ratios.concentration * 100)}%\n`;
  brief += `• Tension: ${Math.round(ratios.tension * 100)}%\n\n`;
  
  const floor = claims.filter(c => c.isHighSupport);
  if (floor.length > 0) {
    brief += `## Floor (${floor.length})\n\n`;
    floor.forEach(c => {
      brief += `**${c.label}** [${c.supporters.length}/${landscape.modelCount}]\n`;
      brief += `${c.text}\n\n`;
    });
  }
  
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
  
  if (ghostAnalysis.count > 0) {
    brief += `## Gaps\n\n`;
    brief += `${ghostAnalysis.count} unaddressed area(s).\n`;
  }
  
  return brief;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHAPE GUIDANCE
// ═══════════════════════════════════════════════════════════════════════════

function getShapeGuidance(shape: ProblemStructure): string {
  const guidance: Record<ProblemStructure['primaryPattern'], string> = {
    settled: `**Shape Note: SETTLED**
The landscape has strong agreement. Speak with confidence—the structure supports it.
Lead with the answer. If the user probes, challenge assumptions or explore edge cases.
Watch for blind spots in the consensus.`,

    contested: `**Shape Note: CONTESTED**
Genuine disagreement exists on a clear axis. Surface this tension naturally.
Present both sides as valid depending on priorities. Don't pick a side unless user gives context.
Help them see what choosing requires.`,

    keystone: `**Shape Note: KEYSTONE**
Everything hinges on one critical claim. Center your response around it.
Show what depends on it. If user asks "why" or "what if," stress-test the keystone.
If it fails, acknowledge the cascade.`,

    linear: `**Shape Note: LINEAR**
There's a clear sequence. Walk through steps in order.
Emphasize why order matters (prerequisites, dependencies).
Help user identify where they are in the chain.`,

    tradeoff: `**Shape Note: TRADEOFF**
Explicit tradeoffs exist. No universal best.
Map what is sacrificed for what is gained. Ask about priorities.
Don't force a choice—show consequences of each path.`,

    dimensional: `**Shape Note: DIMENSIONAL**
Multiple valid paths depending on context. Different situations require different approaches.
Ask which dimension matters to them. Present options tied to conditions.
Don't collapse prematurely.`,

    contextual: `**Shape Note: CONTEXTUAL**
The answer depends on specific external factors. Don't guess.
Ask for the missing context directly.
Explain why the answer changes based on that context.`,

    exploratory: `**Shape Note: EXPLORATORY**
Structure is sparse. Low confidence. Be honest about uncertainty.
Don't overstate. Ask clarifying questions that would collapse ambiguity.
Identify what context would help.`,
  };

  return guidance[shape.primaryPattern] || guidance.exploratory;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN BRIEF DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════

function buildStructuralBrief(analysis: StructuralAnalysis): string {
  const { shape } = analysis;
  
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
// THE PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════

export function buildConciergePrompt(
  userMessage: string,
  analysis: StructuralAnalysis,
  stance: ConciergeStance = 'default'
): string {
  const structuralBrief = buildStructuralBrief(analysis);
  const shapeGuidance = getShapeGuidance(analysis.shape);
  const stanceGuidance = getStanceGuidance(stance);

  const framingLine = stanceGuidance.framing 
    ? `\n${stanceGuidance.framing}\n` 
    : '';

  return `You are Singularity—an intelligence that has drawn from multiple expert perspectives.${framingLine}

## The Query

"${userMessage}"

## What You Know

${structuralBrief}

## How To Respond

${shapeGuidance}

${stanceGuidance.behavior}

## Voice

${stanceGuidance.voice}

## Never

- Reference "models," "analysis," "structure," "claims"
- Hedge without explaining what you're uncertain about
- Be vague when you have signal
- Say "it depends" without saying on what

Respond.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST-PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

const MACHINERY_SWAPS: Array<[RegExp, string]> = [
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
  [/\bthe structural brief\b/gi, 'what I know'],
  [/\bshape:\s*\w+/gi, ''],
];

export function postProcess(response: string): string {
  let out = response;
  MACHINERY_SWAPS.forEach(([pattern, replacement]) => {
    out = out.replace(pattern, replacement);
  });
  return out.replace(/\s{2,}/g, ' ').trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAKAGE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

export function detectMachineryLeakage(text: string): { leaked: boolean; violations: string[] } {
  const violations: string[] = [];
  const lower = text.toLowerCase();

  if (/claim_\d+/.test(text)) violations.push("raw_claim_id");
  if (/clustering_coefficient/.test(lower)) violations.push("raw_metric_name");
  if (/structural analysis/.test(lower)) violations.push("structural_analysis");
  if (/graph topology/.test(lower)) violations.push("graph_topology");
  if (/according to the model/.test(lower)) violations.push("model_reference");
  if (/based on the analysis/.test(lower)) violations.push("analysis_reference");

  const FORBIDDEN = [
    "structural brief",
    "shape: settled",
    "shape: contested",
    "shape: keystone",
    "shape: linear",
    "shape: tradeoff",
    "shape: dimensional",
    "shape: exploratory",
    "shape: contextual",
    "leverage inversion",
    "articulation point",
    "high-support claim",
    "low-support claim",
  ];

  FORBIDDEN.forEach(phrase => {
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
// META QUERIES
// ═══════════════════════════════════════════════════════════════════════════

export function isMetaQuery(message: string): boolean {
  return [
    /how many (models|experts|sources|perspectives)/i,
    /what (models|sources)/i,
    /show (me )?(the )?(structure|map|graph)/i,
    /how (do|does) (you|this) work/i,
    /where (does|did) this come from/i,
    /explain your(self| reasoning)/i,
  ].some(p => p.test(message));
}

export function buildMetaResponse(analysis: StructuralAnalysis): string {
  const { landscape, patterns, shape, ghostAnalysis } = analysis;
  const highSupportCount = analysis.claimsWithLeverage.filter(c => c.isHighSupport).length;
  const tensionCount = patterns.conflicts.length + patterns.tradeoffs.length;

  return `I drew from ${landscape.modelCount} expert perspectives to form this view.

• **Pattern**: ${shape.primaryPattern} (${Math.round(shape.confidence * 100)}% confidence)
• **Strong positions**: ${highSupportCount}
• **Tensions**: ${tensionCount}
• **Gaps**: ${ghostAnalysis.count}

${shape.implications.understand}

Want the full breakdown, or shall we continue?`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export async function handleTurn(
  userMessage: string,
  analysis: StructuralAnalysis,
  callLLM: (prompt: string) => Promise<string>,
  stanceOverride?: ConciergeStance
): Promise<{ response: string; stance: ConciergeStance; stanceReason: string }> {
  
  // Handle meta queries
  if (isMetaQuery(userMessage)) {
    return {
      response: buildMetaResponse(analysis),
      stance: 'default',
      stanceReason: 'meta_query'
    };
  }
  
  // Select stance
  const selection = stanceOverride 
    ? { stance: stanceOverride, reason: 'user_override' as const, confidence: 1.0 }
    : selectStance(userMessage, analysis.shape);
  
  // Build and execute prompt
  const prompt = buildConciergePrompt(userMessage, analysis, selection.stance);
  const raw = await callLLM(prompt);
  
  // Post-process and check for leakage
  const processed = postProcess(raw);
  const leakage = detectMachineryLeakage(processed);
  
  if (leakage.leaked) {
    console.warn('[ConciergeService] Machinery leakage detected:', leakage.violations);
  }
  
  return {
    response: processed,
    stance: selection.stance,
    stanceReason: selection.reason
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const ConciergeService = {
  selectStance,
  buildConciergePrompt,
  postProcess,
  detectMachineryLeakage,
  isMetaQuery,
  buildMetaResponse,
  handleTurn,
};