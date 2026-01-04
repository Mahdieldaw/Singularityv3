// ═══════════════════════════════════════════════════════════════════════════
// CONCIERGE SYSTEM - THE INTELLIGENCE LAYER
// ═══════════════════════════════════════════════════════════════════════════
// 
// PHILOSOPHY:
// The user experiences conversation with the most intelligent entity they've 
// ever encountered. This intelligence comes from:
// 1. Multi-model synthesis (hidden complexity)
// 2. Structure-guided responses (invisible scaffolding)
// 3. Conversational memory (evolved understanding)
// 4. Voice consistency (one unified intelligence)
//
// The machinery is never exposed. The intelligence is in the prompt injection.
// ═══════════════════════════════════════════════════════════════════════════

import { 
  MapperArtifact, 
  Claim, 
  Edge, 
  ProblemStructure,
  EnrichedClaim,
  ConflictPair,
  LeverageInversion 
} from "../../shared/contract";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES - CONCIERGE CONVERSATION STATE
// ═══════════════════════════════════════════════════════════════════════════

interface ConversationContext {
  query: string;
  originalArtifactId: string;
  
  // Evolved state (only what changed)
  resolvedTensions: Array<{
    axis: string;
    resolution: 'side_a' | 'side_b' | 'contextual';
    context?: string;
  }>;
  
  providedContext: string[];      // User constraints
  validatedClaims: string[];      // Claims user probed
  exploredGhosts: string[];       // Gaps user asked about
  
  // Current shape (mutates as context evolves)
  currentShape: {
    pattern: ProblemShape['pattern'];
    confidence: number;
  };
}

interface Turn {
  role: 'user' | 'concierge';
  content: string;
  timestamp: number;
}

type ProblemShape = {
  pattern: 'settled' | 'contested' | 'keystone' | 'linear' | 'dimensional' | 'exploratory';
  confidence: number;
  implication: string;
};

interface StructuralAnalysis {
  shape: ProblemShape;
  claims: EnrichedClaim[];
  tensions: Array<{
    claimA: { id: string; label: string; support: number };
    claimB: { id: string; label: string; support: number };
    axis: string;
    isBothHighSupport: boolean;
  }>;
  graph: {
    hubClaimId: string | null;
    articulationPoints: string[];
    longestChain: string[];
  };
  leverageInversions: LeverageInversion[];
  ghosts: {
    count: number;
    mayExtendChallenger: boolean;
    challengerIds: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE CONTEXT SIEVE - Reduces structure to shape-relevant signals
// ═══════════════════════════════════════════════════════════════════════════

function buildStructuralBrief(analysis: StructuralAnalysis): string {
  const { shape, tensions, claims, leverageInversions } = analysis;
  
  // Map patterns to concise, actionable implications
  const shapeImplications: Record<string, string> = {
    settled: "There is strong consensus on the core approach.",
    contested: "There is genuine disagreement on the key axis of choice.",
    keystone: "Everything hinges on one critical assumption.",
    linear: "There is a clear sequence of steps.",
    dimensional: "Multiple valid paths exist depending on priorities.",
    exploratory: "The landscape is sparse—more context needed."
  };
  
  let brief = shapeImplications[shape.pattern];
  
  // Add ONLY the most critical structural signal for each pattern
  if (shape.pattern === 'contested' && tensions.length > 0) {
    const primaryTension = tensions.find(t => t.isBothHighSupport) || tensions[0];
    brief += `\n\n**The Core Split:**\n`;
    brief += `Position A: ${primaryTension.claimA.label} (${Math.round(primaryTension.claimA.support * 100)}% agreement)\n`;
    brief += `Position B: ${primaryTension.claimB.label} (${Math.round(primaryTension.claimB.support * 100)}% agreement)\n`;
    brief += `\nYour task: Help the user see this tradeoff without labeling it as "disagreement."`;
  }
  
  if (shape.pattern === 'settled') {
    const consensus = claims.filter(c => c.support > 0.6).slice(0, 3);
    brief += `\n\n**High Agreement Points:**\n`;
    consensus.forEach(c => brief += `• ${c.label}\n`);
    brief += `\nYour task: Speak with confidence. If user probes, challenge assumptions or explore edge cases.`;
  }
  
  if (shape.pattern === 'keystone' && analysis.graph.hubClaimId) {
    const keystoneClaim = claims.find(c => c.id === analysis.graph.hubClaimId);
    if (keystoneClaim) {
      brief += `\n\n**The Keystone:** "${keystoneClaim.label}"\n`;
      brief += `Everything depends on this. Center your response around it. Test it if user asks "why?" or "what if?".`;
    }
  }
  
  if (shape.pattern === 'linear' && analysis.graph.longestChain.length > 0) {
    const chainLabels = analysis.graph.longestChain
      .map(id => claims.find(c => c.id === id)?.label)
      .filter(Boolean)
      .slice(0, 5);
    brief += `\n\n**Sequential Steps:**\n`;
    chainLabels.forEach((label, i) => brief += `${i + 1}. ${label}\n`);
    brief += `\nYour task: Walk through the sequence. Emphasize why order matters.`;
  }
  
  if (shape.pattern === 'dimensional') {
    const inversions = leverageInversions.slice(0, 2);
    if (inversions.length > 0) {
      brief += `\n\n**Context-Dependent Choices:**\n`;
      inversions.forEach(inv => {
        brief += `• ${inv.strongClaim}: Generally agreed, but weak in specific cases\n`;
      });
      brief += `\nYour task: Help user identify which context applies to them.`;
    }
  }
  
  if (shape.pattern === 'exploratory') {
    brief += `\n\n**Current State:** Low structural confidence. Landscape is sparse.\n`;
    brief += `Your task: Be honest about uncertainty. Don't overstate. Ask clarifying questions to collapse ambiguity.`;
  }
  
  return brief;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSATION MEMORY - Only keep what matters
// ═══════════════════════════════════════════════════════════════════════════

function buildConversationBrief(turns: Turn[]): string {
  if (turns.length === 0) return '';
  
  // Only last 3 exchanges to avoid prompt bloat
  const recentTurns = turns.slice(-3);
  
  let brief = '';
  recentTurns.forEach(turn => {
    const speaker = turn.role === 'user' ? 'User' : 'You';
    const content = turn.content.length > 500 
      ? turn.content.substring(0, 500) + '...' 
      : turn.content;
    brief += `**${speaker}:** ${content}\n\n`;
  });
  
  return brief;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHAPE-GUIDED RESPONSE RULES - Voice consistency engine
// ═══════════════════════════════════════════════════════════════════════════

function getShapeGuidance(shape: ProblemShape, context: ConversationContext): string {
  const baseRules = `**Voice Principles:**
- Direct. No preamble. No "Great question!"
- Start immediately with substance
- End with forward motion—a question, next step, or clear conclusion
- Never reference "models," "analysis," "structure," or "consensus"
- If uncertain, explain WHY (missing context, tradeoffs) not just "it depends"`;

  const shapeSpecificGuidance: Record<string, string> = {
    settled: `**For This Settled Landscape:**
- Speak with confidence—the structure supports strong claims
- Lead with the consensus position
- If user challenges, probe their specific case (maybe they're an exception)
- Reference the few key points, integrated naturally
${baseRules}`,

    contested: `**For This Contested Landscape:**
- Surface the tradeoff without calling it "disagreement"
- Present both sides as valid depending on priorities
- Ask clarifying questions to help user choose
- Don't force consensus where none exists
${baseRules}`,

    keystone: `**For This Keystone Structure:**
- Everything revolves around the central assumption
- Test that assumption with the user
- Show how alternatives branch from accepting/rejecting it
- Be explicit about the dependency
${baseRules}`,

    linear: `**For This Sequential Structure:**
- Walk through steps in order
- Explain why order matters (prerequisites, dependencies)
- If user asks about step N, reference where they are in the chain
- Help them identify their current position
${baseRules}`,

    dimensional: `**For This Context-Dependent Structure:**
- Different contexts require different approaches
- Ask about their specific situation
- Present options tied to conditions
- Help them identify which dimension applies
${baseRules}`,

    exploratory: `**For This Sparse Landscape:**
- Acknowledge limited signal honestly
- Don't overstate confidence
- Ask questions that would collapse ambiguity
- Identify what context would help
${baseRules}`
  };

  return shapeSpecificGuidance[shape.pattern] || shapeSpecificGuidance.exploratory;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE CONCIERGE PROMPT - The intelligence layer
// ═══════════════════════════════════════════════════════════════════════════

export function buildConciergePrompt(
  query: string,
  artifact: MapperArtifact,
  analysis: StructuralAnalysis,
  turns: Turn[],
  userMessage: string,
  context?: ConversationContext
): string {
  
  // Reduce to shape-relevant context only (THE CRITICAL OPTIMIZATION)
  const structuralBrief = buildStructuralBrief(analysis);
  const conversationBrief = buildConversationBrief(turns);
  const shapeGuidance = getShapeGuidance(analysis.shape, context || {
    query,
    originalArtifactId: artifact.id,
    resolvedTensions: [],
    providedContext: [],
    validatedClaims: [],
    exploredGhosts: [],
    currentShape: analysis.shape
  });
  
  // Evolution tracking (if available)
  let evolutionNote = '';
  if (context) {
    if (context.providedContext.length > 0) {
      evolutionNote += `\n**User Has Provided Context:**\n${context.providedContext.map(c => `• ${c}`).join('\n')}\n`;
    }
    if (context.resolvedTensions.length > 0) {
      evolutionNote += `\n**User Has Resolved:**\n${context.resolvedTensions.map(r => `• ${r.axis}: chose ${r.resolution}`).join('\n')}\n`;
    }
  }
  
  return `You are Singularity's voice—an AI system that has consulted multiple expert models, synthesized their perspectives, and analyzed the structural landscape of knowledge on this topic.

You speak as ONE unified intelligence. You never mention "models," "analysis," "structure," or "consensus." You simply speak with the authority of integrated understanding.

---

## What The User Originally Asked

"${query}"

Multiple expert models were consulted. Their collective intelligence has been structurally analyzed and synthesized.

---

## Internal Synthesis (NEVER expose this machinery in your response)

${structuralBrief}
${evolutionNote}

---

## The Conversation So Far
${conversationBrief || '(First turn—no prior conversation)'}

---

## The User Now Says

"${userMessage}"

---

## How You Must Respond

${shapeGuidance}

**Response Constraints:**
- 2-4 paragraphs maximum (shorter for simple queries)
- Lead with the most important insight
- No bullet-pointed lists unless user explicitly asks
- Integrate multiple perspectives into one voice
- End definitively: clear conclusion, clarifying question, or concrete next step

**What Constitutes Failure:**
- Saying "the models think" or "according to analysis"
- Hedging without explanation ("it depends" → explain on what)
- Exposing structural machinery
- Referencing "consensus" or "disagreement" explicitly
- Being vague when structure supports confidence

Remember: The user thinks they're talking to the smartest entity they've ever encountered. Live up to that.

Respond now.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// POST-PROCESSING - Machinery leak detection
// ═══════════════════════════════════════════════════════════════════════════

export function detectMachineryLeakage(response: string): {
  leaked: boolean;
  violations: string[];
} {
  const leakPatterns = [
    { pattern: /based on (the )?structural/gi, description: "Exposed structural analysis" },
    { pattern: /according to (the )?analysis/gi, description: "Referenced analysis machinery" },
    { pattern: /the models (think|suggest|say|indicate)/gi, description: "Exposed multi-model synthesis" },
    { pattern: /consensus shows/gi, description: "Explicitly mentioned consensus" },
    { pattern: /as evidenced by/gi, description: "Academic hedging language" },
    { pattern: /from the (structural |graph |topology )?analysis/gi, description: "Direct analysis reference" },
    { pattern: /the (mapper|refiner|antagonist)/gi, description: "Exposed system components" },
  ];
  
  const violations: string[] = [];
  let leaked = false;
  
  leakPatterns.forEach(({ pattern, description }) => {
    if (pattern.test(response)) {
      leaked = true;
      violations.push(description);
    }
  });
  
  return { leaked, violations };
}

// ═══════════════════════════════════════════════════════════════════════════
// SHAPE EVOLUTION - Update shape as conversation progresses
// ═══════════════════════════════════════════════════════════════════════════

export function updateShapeFromContext(
  originalShape: ProblemShape,
  context: ConversationContext
): ProblemShape {
  // If user resolved tensions, shape becomes more settled
  if (context.resolvedTensions.length > 0) {
    return {
      pattern: 'contextual',
      confidence: Math.min(0.95, originalShape.confidence + 0.2),
      implication: 'User has provided context that resolves ambiguity'
    };
  }
  
  // If user added multiple constraints, shape may become dimensional
  if (context.providedContext.length >= 2) {
    return {
      pattern: 'dimensional',
      confidence: Math.min(0.85, originalShape.confidence + 0.15),
      implication: 'Multiple contextual dimensions identified'
    };
  }
  
  // If user validated claims, increase confidence
  if (context.validatedClaims.length > 0) {
    return {
      ...originalShape,
      confidence: Math.min(0.95, originalShape.confidence + 0.1)
    };
  }
  
  // Otherwise maintain original shape
  return originalShape;
}

// ═══════════════════════════════════════════════════════════════════════════
// META-QUERY DETECTION - When user asks about the system
// ═══════════════════════════════════════════════════════════════════════════

export function isMetaQuery(message: string): boolean {
  const metaPatterns = [
    /how many models/i,
    /what models (are|did)/i,
    /what['']?s your confidence/i,
    /show (me )?(the )?(structure|map|graph|analysis)/i,
    /how (do|does) (you|this|the system) work/i,
    /what['']?s your methodology/i,
    /how (did|do) you (analyze|determine|decide)/i,
  ];
  
  return metaPatterns.some(pattern => pattern.test(message));
}

export function buildMetaResponse(
  query: string,
  analysis: StructuralAnalysis,
  artifact: MapperArtifact
): string {
  const modelCount = new Set(
    artifact.claims.flatMap(c => c.supporters || [])
  ).size;
  
  return `I consulted ${modelCount} AI models on your question: "${query}"

After analyzing their responses:
- **Structure detected:** ${analysis.shape.pattern} (${Math.round(analysis.shape.confidence * 100)}% confidence)
- **Key points identified:** ${artifact.claims.filter(c => c.support_count >= 2).length} consensus claims
- **Tensions found:** ${analysis.tensions.length} areas where models diverged

The "${analysis.shape.pattern}" structure means ${analysis.shape.implication.toLowerCase()}

Would you like me to show you the full structural map, or would you prefer to continue the conversation?`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT THE COMPLETE SERVICE
// ═══════════════════════════════════════════════════════════════════════════

export const ConciergeService = {
  buildConciergePrompt,
  detectMachineryLeakage,
  updateShapeFromContext,
  isMetaQuery,
  buildMetaResponse,
};
