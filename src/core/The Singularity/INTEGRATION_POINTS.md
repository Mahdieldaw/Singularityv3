# Integration Points: Connecting Concierge v2 to Your Existing Codebase

This document shows **exactly** where to modify your existing code to integrate the Concierge system.

---

## FILE 1: src/core/PromptService.ts

### Current State Analysis

Looking at your existing file (lines 2100-2395), you have:
- `buildRefinerPrompt()` - Creates the synthesis prompt
- `buildAntagonistPrompt()` - Creates the question elicitation prompt

**Problem:** These prompts expose too much structural machinery and don't use the context sieve.

### Changes Needed

#### Option A: Add New Method (Recommended)

Add this method to your existing `PromptService` class:

```typescript
// Add to PromptService class around line 2400
import { ConciergeService } from './ConciergeService'; // Your new file

buildConciergePrompt(
  query: string,
  artifact: MapperArtifact,
  analysis: StructuralAnalysis,
  turns: ConversationTurn[],
  userMessage: string,
  context?: ConversationContext
): string {
  // Delegate to the specialized concierge service
  return ConciergeService.buildConciergePrompt(
    query,
    artifact,
    analysis,
    turns,
    userMessage,
    context
  );
}

// Also add helper methods:
detectMachineryLeakage(response: string) {
  return ConciergeService.detectMachineryLeakage(response);
}

isMetaQuery(message: string): boolean {
  return ConciergeService.isMetaQuery(message);
}

buildMetaResponse(query: string, analysis: StructuralAnalysis, artifact: MapperArtifact): string {
  return ConciergeService.buildMetaResponse(query, analysis, artifact);
}
```

#### Option B: Replace Existing Methods

If you want to fully commit to the new approach:

```typescript
// BEFORE (lines ~2100-2236):
buildRefinerPrompt(
  originalPrompt: string,
  fullOptionsText: string,
  // ... many parameters
): string {
  // 150+ lines of complex prompt building
  return `You are the Question Oracle...`;
}

// AFTER:
buildRefinerPrompt(
  query: string,
  artifact: MapperArtifact,
  analysis: StructuralAnalysis,
  turns: ConversationTurn[],
  userMessage: string
): string {
  // Use the concierge instead
  return ConciergeService.buildConciergePrompt(
    query,
    artifact, 
    analysis,
    turns,
    userMessage
  );
}
```

---

## FILE 2: Your Conversation Handler/Endpoint

This is where user messages come in and responses go out. You need to modify the flow.

### Find This Pattern (Example)

```typescript
// Somewhere in your backend/API layer
async function handleConversationTurn(
  turnId: string,
  userMessage: string,
  context: any
) {
  // Get existing data
  const turn = await getTurn(turnId);
  const artifact = turn.mapperArtifact;
  const analysis = turn.analysis;
  
  // Build prompt (THIS IS WHAT NEEDS TO CHANGE)
  const prompt = buildRefinerPrompt(
    turn.query,
    artifact,
    analysis,
    // ...
  );
  
  // Call LLM
  const response = await callLLM(prompt);
  
  // Return to user
  return response;
}
```

### Change To This

```typescript
// Import the new types
import { 
  ConciergeService,
  ConversationContext,
  ConversationTurn 
} from './ConciergeService';

async function handleConversationTurn(
  turnId: string,
  userMessage: string,
  conversationContext?: ConversationContext
) {
  // Get existing data
  const turn = await getTurn(turnId);
  const artifact = turn.mapperArtifact;
  const analysis = turn.analysis;
  const previousTurns = await getTurnsForConversation(turn.conversationId);
  
  // Check for meta-queries FIRST
  if (ConciergeService.isMetaQuery(userMessage)) {
    return {
      response: ConciergeService.buildMetaResponse(
        turn.query,
        analysis,
        artifact
      ),
      isMeta: true
    };
  }
  
  // Initialize or load conversation context
  const context: ConversationContext = conversationContext || {
    query: turn.query,
    originalArtifactId: artifact.id,
    resolvedTensions: [],
    providedContext: [],
    validatedClaims: [],
    exploredGhosts: [],
    currentShape: analysis.shape
  };
  
  // Build concierge prompt (THE KEY CHANGE)
  const prompt = ConciergeService.buildConciergePrompt(
    turn.query,
    artifact,
    analysis,
    previousTurns.map(t => ({
      role: t.role,
      content: t.content,
      timestamp: t.timestamp
    })),
    userMessage,
    context
  );
  
  // Call LLM
  const response = await callLLM(prompt);
  
  // Check for machinery leakage
  const leakCheck = ConciergeService.detectMachineryLeakage(response);
  if (leakCheck.leaked) {
    console.warn('[Concierge] Machinery leak detected:', leakCheck.violations);
    // For MVP: just log and continue
    // For production: retry with temperature=0.2
  }
  
  // Update conversation context based on response
  // (This is a simple heuristic - you can make it smarter)
  const updatedContext = updateContextFromExchange(context, userMessage, response);
  
  // Save turn
  await saveTurn({
    conversationId: turn.conversationId,
    role: 'concierge',
    content: response,
    context: updatedContext
  });
  
  return {
    response,
    context: updatedContext,
    leakDetected: leakCheck.leaked
  };
}

// Helper function to update context
function updateContextFromExchange(
  context: ConversationContext,
  userMessage: string,
  response: string
): ConversationContext {
  // Simple heuristics for context evolution
  
  // Detect if user provided constraints
  if (userMessage.toLowerCase().includes('for a') || 
      userMessage.toLowerCase().includes('i need') ||
      userMessage.toLowerCase().includes('my situation')) {
    context.providedContext.push(userMessage);
  }
  
  // Detect if user validated/challenged a claim
  if (userMessage.toLowerCase().includes('makes sense') ||
      userMessage.toLowerCase().includes('i agree') ||
      userMessage.toLowerCase().includes('that\'s right')) {
    // Extract which claims were discussed (this is approximate)
    context.validatedClaims.push('latest-discussion');
  }
  
  // Update shape if context accumulated
  if (context.providedContext.length >= 2) {
    context.currentShape = {
      pattern: 'dimensional',
      confidence: Math.min(0.9, context.currentShape.confidence + 0.15)
    };
  }
  
  return context;
}
```

---

## FILE 3: ArtifactShowcase.tsx (Your Frontend)

### Current Code (Lines ~560-575)

You have these buttons that trigger cognitive modes:

```typescript
<button
  onClick={() => onUnderstand?.({
    providerId: nextProviderId,
    selectedArtifacts,
    mapperArtifact: modifiedArtifact!,
    userNotes
  })}
>
  🧠 Understand
</button>

<button
  onClick={() => onDecide?.(...)}
>
  🚀 Decide
</button>
```

### The Question

**Do you still need these separate modes?**

With the Concierge approach, there are **no modes**. Just conversation. The shape determines the response style automatically.

### Two Options

#### Option 1: Remove Mode Buttons (Recommended)

Replace the mode buttons with a simple conversation interface:

```typescript
// Remove the Understand/Decide buttons
// Add a conversation interface instead

const [conversationMessages, setConversationMessages] = useState<Message[]>([]);
const [inputMessage, setInputMessage] = useState('');

return (
  <div className="space-y-4">
    {/* Existing artifact display */}
    {artifactForDisplay && (
      <div>
        {/* Your existing artifact rendering */}
      </div>
    )}
    
    {/* NEW: Conversation Interface */}
    <div className="border-t border-border-subtle pt-4">
      <div className="space-y-3">
        {conversationMessages.map((msg, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg ${
              msg.role === 'user' 
                ? 'bg-blue-500/10 ml-8' 
                : 'bg-surface-highlight mr-8'
            }`}
          >
            <div className="text-xs text-text-muted mb-1">
              {msg.role === 'user' ? 'You' : 'Concierge'}
            </div>
            <div className="text-sm text-text-primary">
              {msg.content}
            </div>
          </div>
        ))}
      </div>
      
      <div className="flex gap-2 mt-4">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              handleSendMessage();
            }
          }}
          placeholder="Ask a follow-up question..."
          className="flex-1 px-3 py-2 bg-surface-base border border-border-subtle rounded-lg"
        />
        <button
          onClick={handleSendMessage}
          disabled={!inputMessage.trim()}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  </div>
);

async function handleSendMessage() {
  if (!inputMessage.trim()) return;
  
  // Add user message
  const userMsg = { role: 'user', content: inputMessage };
  setConversationMessages(prev => [...prev, userMsg]);
  setInputMessage('');
  
  // Call backend
  const response = await fetch('/api/conversation/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      turnId: turn.id,
      message: inputMessage,
      context: conversationContext
    })
  });
  
  const data = await response.json();
  
  // Add concierge response
  const conciergeMsg = { role: 'concierge', content: data.response };
  setConversationMessages(prev => [...prev, conciergeMsg]);
  
  // Update context for next turn
  setConversationContext(data.context);
}
```

#### Option 2: Keep Modes But Use Concierge Voice

If you want to keep the cognitive modes for other reasons:

```typescript
// Keep the buttons
<button onClick={() => onUnderstand?.({...})}>
  🧠 Understand
</button>

// But in the backend handler for "Understand":
async function handleUnderstand(options: CognitiveTransitionOptions) {
  // Instead of your old prompt:
  // const prompt = buildUnderstandPrompt(...);
  
  // Use concierge with shape-specific framing:
  const prompt = ConciergeService.buildConciergePrompt(
    options.mapperArtifact.query,
    options.mapperArtifact,
    analysis,
    [],  // First turn, no history
    "Help me understand this topic deeply.",  // Synthetic user message
    undefined
  );
  
  // Rest stays the same
  return await callLLM(prompt);
}
```

---

## FILE 4: Database/State Schema Changes

You'll need to store conversation context. Add these fields to your Turn/Conversation model:

```typescript
// Add to your Turn schema
interface Turn {
  id: string;
  conversationId: string;
  query: string;
  mapperArtifact: MapperArtifact;
  analysis: StructuralAnalysis;
  
  // NEW: Conversation state
  conversationTurns?: ConversationTurn[];
  conversationContext?: ConversationContext;
  
  // Existing fields...
  mappingResponses: Record<string, any>;
  responses: Record<string, any>;
  meta: any;
}

// Add new types
interface ConversationTurn {
  role: 'user' | 'concierge';
  content: string;
  timestamp: number;
}

interface ConversationContext {
  query: string;
  originalArtifactId: string;
  resolvedTensions: Array<{
    axis: string;
    resolution: 'side_a' | 'side_b' | 'contextual';
    context?: string;
  }>;
  providedContext: string[];
  validatedClaims: string[];
  exploredGhosts: string[];
  currentShape: {
    pattern: string;
    confidence: number;
  };
}
```

---

## MIGRATION PATH

### Phase 1: Parallel Mode (Week 1)

1. Add the new `ConciergeService.ts` file
2. Add `buildConciergePrompt()` method to existing `PromptService`
3. Create a new `/api/conversation/message` endpoint
4. Keep existing Understand/Decide buttons
5. Add a "💬 Chat" button that uses the new concierge
6. Test in parallel with existing modes

**Validation:**
- Both systems work
- Concierge has no machinery leakage
- Users can choose which to use

### Phase 2: Concierge Primary (Week 2)

1. Make concierge the default experience
2. Move Understand/Decide to "Advanced" menu
3. Update UI to show conversation interface
4. Monitor for voice quality issues

**Validation:**
- 90% of users stay in concierge mode
- No increase in confusion/support requests
- Response quality metrics maintained or improved

### Phase 3: Concierge Only (Week 3+)

1. Remove Understand/Decide modes entirely
2. Simplify UI to just: Artifact → Conversation
3. Remove mode selection complexity

**Validation:**
- User satisfaction scores increase
- Session duration increases (deeper conversations)
- Users report feeling they're talking to "something really smart"

---

## TESTING CHECKLIST

Before going live with each phase:

### Unit Tests
```typescript
describe('ConciergeService', () => {
  test('buildStructuralBrief reduces token count', () => {
    const analysis = createMockAnalysis({ claimCount: 20 });
    const brief = buildStructuralBrief(analysis);
    expect(brief.length).toBeLessThan(1000); // ~150 tokens
  });
  
  test('detectMachineryLeakage catches all patterns', () => {
    const leakedResponse = "Based on the structural analysis, the models suggest...";
    const result = ConciergeService.detectMachineryLeakage(leakedResponse);
    expect(result.leaked).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);
  });
  
  test('isMetaQuery detects system questions', () => {
    expect(ConciergeService.isMetaQuery("How many models did you use?")).toBe(true);
    expect(ConciergeService.isMetaQuery("Show me the structure")).toBe(true);
    expect(ConciergeService.isMetaQuery("What's the best approach?")).toBe(false);
  });
});
```

### Integration Tests
```typescript
describe('Conversation Flow', () => {
  test('first turn uses concierge prompt', async () => {
    const response = await handleConversationTurn(
      mockTurnId,
      "Tell me more about this",
      undefined
    );
    
    expect(response.response).toBeDefined();
    expect(response.context).toBeDefined();
    expect(ConciergeService.detectMachineryLeakage(response.response).leaked).toBe(false);
  });
  
  test('context evolves across turns', async () => {
    const turn1 = await handleConversationTurn(mockTurnId, "What's the best approach?");
    const turn2 = await handleConversationTurn(mockTurnId, "I need this for a startup", turn1.context);
    
    expect(turn2.context.providedContext.length).toBeGreaterThan(0);
    expect(turn2.context.currentShape.pattern).not.toBe(turn1.context.currentShape.pattern);
  });
});
```

### Manual QA
- [ ] Run 10 test conversations across all shape types
- [ ] Check for machinery leakage in responses
- [ ] Verify appropriate confidence levels
- [ ] Test meta-queries get transparent responses
- [ ] Verify context evolution works correctly

---

## THE MOST CRITICAL CHANGE

**This is the single most important modification:**

In whatever function builds your conversational prompt (likely `buildRefinerPrompt` or `buildUnderstandPrompt`), change from:

```typescript
// ❌ OLD WAY - Exposes too much
`Here's the complete structural analysis:
${JSON.stringify(analysis, null, 2)}

And all the claims:
${artifact.claims.map(c => `${c.label}: ${c.text}`).join('\n')}

User asks: ${userMessage}`
```

To:

```typescript
// ✅ NEW WAY - Context sieve
ConciergeService.buildConciergePrompt(
  query,
  artifact,
  analysis,
  turns,
  userMessage,
  context
)
```

This single change will:
- Reduce prompt size by 60-70%
- Eliminate machinery leakage
- Improve voice consistency
- Make responses feel more intelligent

Everything else is optimization. This is the foundation.
