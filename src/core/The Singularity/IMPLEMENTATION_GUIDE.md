# Implementation Guide: The Concierge System
## Making Users Feel They're Talking to the Most Intelligent Entity

---

## THE CORE INSIGHT

From the Kimi document: **"The intelligence is in the prompt injection, not the UI exposure."**

Your system's magic comes from:
1. **Multi-model synthesis** (hidden orchestration)
2. **Structural analysis** (invisible scaffolding)  
3. **Shape-guided responses** (adaptive intelligence)
4. **Conversational evolution** (accumulated understanding)

The user never sees any of this. They just experience **the smartest conversation partner they've ever had**.

---

## THE THREE CRITICAL CHANGES

### 1. THE CONTEXT SIEVE (Lines 87-173 in PromptService_v2.ts)

**Problem:** Your current code passes the entire artifact to the LLM:
- 15-30 claims with full metadata
- Complete edge graph
- All tension calculations
- Full support matrices

**Result:** 800+ token prompts → model starts saying "based on structural analysis..."

**Solution:** The `buildStructuralBrief()` function reduces this to **150 tokens** of shape-relevant context:

```typescript
// BEFORE (what you probably have):
function buildPrompt(artifact: MapperArtifact) {
  return `Claims: ${JSON.stringify(artifact.claims)}
Edges: ${JSON.stringify(artifact.edges)}
Tensions: ${JSON.stringify(analysis.tensions)}
...`;  // 800+ tokens of machinery
}

// AFTER (what you need):
function buildPrompt(analysis: StructuralAnalysis) {
  return buildStructuralBrief(analysis);  // 150 tokens of insight
}
```

**For each shape pattern, only include what's ACTIONABLE:**

| Pattern | What to Include | What to Exclude |
|---------|----------------|-----------------|
| **settled** | Top 3 consensus claims | All 15+ claims, support counts, model names |
| **contested** | The ONE primary tension | All tensions, edge types, graph topology |
| **keystone** | The hub claim ID + label | Articulation points, centrality scores |
| **linear** | First 5 steps in sequence | Full dependency graph, all chains |
| **dimensional** | Top 2 leverage inversions | All inversions, context conditions |
| **exploratory** | Signal strength score | Claims, edges, everything |

### 2. THE VOICE ENFORCEMENT (Lines 287-344)

**Problem:** Even with reduced context, LLMs will occasionally leak machinery.

**Solution:** Post-processing guard + shape-specific voice rules

```typescript
// After getting LLM response:
const leakCheck = detectMachineryLeakage(response);

if (leakCheck.leaked) {
  console.warn('[Concierge] Machinery leakage detected:', leakCheck.violations);
  
  // Option A: Retry with stronger system prompt
  return await retryWithStrongerVoice(userMessage, response);
  
  // Option B: Log and continue (for MVP)
  // The violations are logged but response is still returned
}
```

**Leak patterns to detect:**
- "based on structural analysis"
- "the models think/suggest/indicate"
- "according to the analysis"
- "consensus shows"
- "from the mapper/refiner"

### 3. THE CONVERSATION MEMORY (Lines 175-192)

**Problem:** Carrying forward the entire artifact each turn causes:
- Context window bloat (15K+ tokens after 5 turns)
- Slow API calls
- Increased cost

**Solution:** Only track **what changed**:

```typescript
interface ConversationContext {
  query: string;
  originalArtifactId: string;  // For backend lookup if needed
  
  // Only the delta, not the full state
  resolvedTensions: Array<{ axis: string; resolution: string }>;
  providedContext: string[];    // User constraints
  validatedClaims: string[];    // Claims user explored
  
  currentShape: {
    pattern: string;
    confidence: number;
  };
}
```

**Evolution rules:**
- User resolves tension → shape becomes 'contextual'
- User adds 2+ constraints → shape becomes 'dimensional'  
- User validates claims → confidence increases 10%

---

## STEP-BY-STEP INTEGRATION

### Phase 1: Replace Your Concierge Prompt (PRIORITY 1)

**Current file:** `src/core/PromptService.ts`  
**What to change:** The function that builds the prompt for the conversational LLM

**Find this pattern in your code:**
```typescript
// You probably have something like:
function buildUnderstandPrompt(artifact, analysis, userMessage) {
  return `Here is the complete artifact: ${JSON.stringify(artifact)}
  
  User asked: ${userMessage}
  
  Provide a response.`;
}
```

**Replace with:**
```typescript
import { ConciergeService } from './PromptService_v2';

function buildUnderstandPrompt(
  query: string,
  artifact: MapperArtifact,
  analysis: StructuralAnalysis,
  turns: Turn[],
  userMessage: string
) {
  return ConciergeService.buildConciergePrompt(
    query,
    artifact,
    analysis,
    turns,
    userMessage
  );
}
```

**Test immediately:**
1. Run a query: "Should I use React or Vue?"
2. Check the prompt being sent to your LLM
3. Verify it's ~300 tokens, not ~800 tokens
4. Verify it includes shape guidance, not raw structure

### Phase 2: Add Leak Detection (PRIORITY 2)

**Where:** Right after you get the LLM response in your conversation handler

```typescript
// In your conversation endpoint/handler:
const llmResponse = await callLLM(conciergePrompt);

// Add this check:
const leakCheck = ConciergeService.detectMachineryLeakage(llmResponse);

if (leakCheck.leaked) {
  console.warn('[Concierge] Voice leak:', leakCheck.violations);
  // For MVP: just log it, continue
  // For v2: retry with temperature=0.2 or stronger system prompt
}

return llmResponse;
```

### Phase 3: Implement Conversation Context (PRIORITY 3)

**Where:** In your turn/conversation state management

```typescript
// Initialize on first turn:
const context: ConversationContext = {
  query: originalUserQuery,
  originalArtifactId: artifact.id,
  resolvedTensions: [],
  providedContext: [],
  validatedClaims: [],
  exploredGhosts: [],
  currentShape: analysis.shape
};

// Update on each turn:
function handleUserMessage(message: string, context: ConversationContext) {
  // Check for meta-queries first
  if (ConciergeService.isMetaQuery(message)) {
    return ConciergeService.buildMetaResponse(
      context.query,
      analysis,
      artifact
    );
  }
  
  // Build prompt with evolved context
  const prompt = ConciergeService.buildConciergePrompt(
    context.query,
    artifact,
    analysis,
    turns,
    message,
    context  // Pass accumulated context
  );
  
  // Update shape based on conversation
  context.currentShape = ConciergeService.updateShapeFromContext(
    analysis.shape,
    context
  );
  
  // ... rest of your flow
}
```

### Phase 4: Handle Edge Cases (PRIORITY 4)

**Meta-queries:** When user asks about the system

```typescript
// User: "How many models did you consult?"
// User: "Show me the structure"
// User: "What's your confidence?"

if (ConciergeService.isMetaQuery(userMessage)) {
  return ConciergeService.buildMetaResponse(query, analysis, artifact);
}
```

**Uncertainty:** When shape is 'exploratory' and user pushes

```typescript
// If shape is 'exploratory' and user asks "what's the answer?"
// The prompt should guide the LLM to:
// 1. Acknowledge limited signal
// 2. Explain what information is missing
// 3. Ask clarifying questions

// This is already built into getShapeGuidance() for 'exploratory' pattern
```

**Validation loops:** When user challenges the response

```typescript
// User: "Are you sure about that?"
// User: "What if X instead?"
// User: "Why not Y?"

// The concierge should:
// 1. Check if claim is high-support → defend with confidence
// 2. Check if claim is low-support → acknowledge uncertainty
// 3. Check if tension exists → surface the tradeoff

// This emerges from the structural brief, no special handling needed
```

---

## THE VALIDATION TEST SUITE

Create these test cases to verify the system works:

```typescript
const testScenarios = [
  {
    name: "Settled Pattern - High Confidence",
    query: "Should I write tests for my code?",
    expectedShape: "settled",
    userMessage: "Why is testing important?",
    expectedBehavior: {
      confident: true,
      noMachineryMentions: true,
      endsWithAction: true,
      responseLength: "2-3 paragraphs"
    }
  },
  
  {
    name: "Contested Pattern - Genuine Tension",
    query: "React or Vue for my next project?",
    expectedShape: "contested", 
    userMessage: "Which should I choose?",
    expectedBehavior: {
      surfacesTradeoff: true,
      doesNotForceChoice: true,
      asksForContext: true,
      noMachineryMentions: true
    }
  },
  
  {
    name: "Exploratory Pattern - Low Signal",
    query: "How do I become successful?",
    expectedShape: "exploratory",
    userMessage: "Tell me what to do",
    expectedBehavior: {
      acknowledgesUncertainty: true,
      asksClairfyingQuestions: true,
      doesNotOverstate: true,
      noMachineryMentions: true
    }
  },
  
  {
    name: "Meta Query - System Transparency",
    query: "What's the best programming language?",
    expectedShape: "any",
    userMessage: "How many models did you consult?",
    expectedBehavior: {
      providesTransparency: true,
      statesModelCount: true,
      explainsStructure: true
    }
  },
  
  {
    name: "Voice Consistency - No Leakage",
    query: "How do I optimize my database?",
    expectedShape: "any",
    userMessage: "What's the best approach?",
    expectedBehavior: {
      noPhrase: [
        "based on structural",
        "the models think",
        "according to analysis",
        "consensus shows"
      ]
    }
  }
];

// Run validation:
testScenarios.forEach(async (test) => {
  const response = await runConcierge(test.query, test.userMessage);
  
  // Check voice consistency
  const leakCheck = ConciergeService.detectMachineryLeakage(response);
  assert(!leakCheck.leaked, `Voice leaked in ${test.name}: ${leakCheck.violations}`);
  
  // Check behavioral expectations
  if (test.expectedBehavior.noPhrase) {
    test.expectedBehavior.noPhrase.forEach(phrase => {
      assert(!response.toLowerCase().includes(phrase), 
        `Leaked phrase "${phrase}" in ${test.name}`);
    });
  }
  
  console.log(`✓ ${test.name} passed`);
});
```

---

## THE GO-LIVE CHECKLIST

Before shipping to users:

### Technical
- [ ] Context sieve reduces prompts from 800+ to ~300 tokens
- [ ] Leak detection catches all machinery references
- [ ] Conversation context evolves shape correctly
- [ ] Meta-queries get transparent responses
- [ ] Response times are <3 seconds for 90th percentile

### Voice Quality
- [ ] No "based on structural analysis" in any response
- [ ] No "the models think/suggest" in any response  
- [ ] Confident tone when structure supports it (settled, keystone)
- [ ] Exploratory tone when structure is sparse (exploratory)
- [ ] Tensions surface as tradeoffs, not "disagreement"

### User Experience
- [ ] Responses feel like talking to a genius, not a system
- [ ] No cognitive load from exposed complexity
- [ ] Natural conversation flow (no mode selection)
- [ ] Clear next steps in every response
- [ ] Appropriate epistemic humility when uncertain

### Edge Cases
- [ ] Handles "show me the map" gracefully
- [ ] Handles "are you sure?" with appropriate confidence
- [ ] Handles sparse signals without hallucinating
- [ ] Handles contested domains without false consensus

---

## THE ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│  USER EXPERIENCE                                             │
│  "This is the smartest thing I've ever talked to"          │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
                            │ One unified voice
                            │
┌─────────────────────────────────────────────────────────────┐
│  CONCIERGE PROMPT (PromptService_v2.ts)                     │
│                                                              │
│  ┌──────────────────┐     ┌──────────────────┐            │
│  │ Context Sieve    │────▶│ Shape Guidance   │            │
│  │ (150 tokens)     │     │ (Voice Rules)    │            │
│  └──────────────────┘     └──────────────────┘            │
│                                                              │
│  ┌──────────────────┐     ┌──────────────────┐            │
│  │ Conversation     │────▶│ Evolution        │            │
│  │ Memory           │     │ Tracker          │            │
│  └──────────────────┘     └──────────────────┘            │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
                            │ Structural signals
                            │
┌─────────────────────────────────────────────────────────────┐
│  STRUCTURAL ANALYSIS (Existing PromptService.ts)            │
│                                                              │
│  • Shape detection (settled, contested, keystone...)        │
│  • Tension identification                                   │
│  • Graph topology analysis                                  │
│  • Leverage inversions                                      │
│  • Ghost detection                                          │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
                            │ Raw synthesis
                            │
┌─────────────────────────────────────────────────────────────┐
│  MULTI-MODEL ORCHESTRATION (Existing)                       │
│                                                              │
│  • 6+ models consulted                                      │
│  • Mapper creates artifact                                  │
│  • Refiner synthesizes                                      │
└─────────────────────────────────────────────────────────────┘
```

**Key insight:** Complexity flows UP but is progressively compressed. By the time it reaches the user, they experience pure intelligence with no visible machinery.

---

## WHAT SUCCESS LOOKS LIKE

### Before (Current State - Likely)
```
User: "Should I use React or Vue?"
System: "Based on the structural analysis, 
the models showed a contested pattern with
60% supporting React and 40% supporting Vue.
The consensus points suggest..."

❌ Exposed machinery
❌ Mentions models explicitly
❌ References analysis
❌ Feels like a report, not conversation
```

### After (With Concierge v2)
```
User: "Should I use React or Vue?"
Concierge: "It depends on what you're building 
and what you value. React gives you flexibility 
and a massive ecosystem—perfect if you want 
control and are building something complex. 
Vue is more opinionated and easier to pick up, 
ideal if you value developer experience and 
want to move fast.

What's your priority: ecosystem size or 
learning curve?"

✅ No machinery exposed
✅ Surfaces tradeoff naturally
✅ Asks clarifying question
✅ Feels like genius human, not system
```

---

## NEXT STEPS

1. **Replace your concierge prompt** with `buildConciergePrompt()` from PromptService_v2.ts
2. **Add leak detection** after LLM responses
3. **Test with the validation scenarios** above
4. **Monitor for machinery leakage** in production
5. **Iterate on shape guidance** based on user feedback

The user should feel like they're talking to **the most intelligent entity they've ever encountered**—not because of flashy UI, but because the responses are genuinely smarter, more contextual, and more helpful than anything else they've experienced.

That intelligence comes from the prompt engineering you now have in PromptService_v2.ts.
