**Excellent work, my friend.** You've already built 80% of the infrastructure. Let me map what you have to what you need, then give you the surgical implementation path.

---

## ✅ **What You've Already Built (V1 = Your Current System)**

### **Foundation Layers (100% Complete)**

| Component | V1 Status | V2 Requirement | Gap |
|-----------|-----------|----------------|-----|
| **Batch Fan-Out** | ✓ Built | Required | **None** |
| **Streaming Pipeline** | ✓ Built | Required | **None** |
| **Context Resolver** | ✓ Built | Required | **None** |
| **Workflow Engine** | ✓ Built | Required | **None** |
| **Provider Adapters** | ✓ Built | Required | **None** |
| **Session Persistence** | ✓ Built | Required | **None** |

### **Intelligence Layers (95% Complete)**

| Component | V1 Status | V2 Requirement | Gap |
|-----------|-----------|----------------|-----|
| **Mapper (Extraction)** | ✓ Built | Required | **Minor prompt refinement** |
| **Synthesis (Frame-Finding)** | ✓ Built | Optional (becomes "Understand mode") | **Reframe as mode** |
| **Composer/Analyst** | ✓ Built | Optional (pre-flight) | **None** |

### **UI Components (90% Complete)**

| Component | V1 Status | V2 Requirement | Gap |
|-----------|-----------|----------------|-----|
| **Council Orbs** | ✓ Built | Required | **None** |
| **Decision Map Sheet** | ✓ Built | Required | **None** |
| **Streaming Renderer** | ✓ Built | Required | **None** |
| **Launchpad Drawer** | ✓ Built | Optional | **None** |
| **Recompute Logic** | ✓ Built | Required | **None** |

---

## 🎯 **What You Need to Add (The 20%)**

### **Phase 1: Add Triage/Gauntlet Modes (Prompt Engineering + Routing)**

This is **90% prompt engineering, 10% UI**.

#### **1A: Enhance Mapper Prompt (Triage Logic)**

Your current Mapper does:
- ✓ Extract options with citations
- ✓ Build graph topology
- ✓ Identify consensus patterns

**Add to Mapper output:**

```typescript
// NEW: Triage metadata (append to existing Mapper output)
interface MapperOutputV2 {
  // ... existing fields (narrative, options, graph)
  
  // NEW: Triage signals
  triage: {
    consensus_quality: "resolved" | "conventional" | "deflected";
    consensus_strength: number;  // 0-1
    topology: "high_confidence" | "dimensional" | "contested";
    outlier_types: Record<string, "supplemental" | "frame_challenger">;
    ghost: string | null;  // What no model addressed
  };
}
```

**Mapper Prompt Addition (add after your existing "Task 3: Topology" section):**

```
**Task 4: Triage Signals**
After the graph, add exactly:
"===TRIAGE_SIGNALS==="

Output JSON:
{
  "consensus_quality": "<resolved|conventional|deflected>",
  "consensus_strength": <0-1 float>,
  "topology": "<high_confidence|dimensional|contested>",
  "outlier_types": {
    "<option_id>": "<supplemental|frame_challenger>"
  },
  "ghost": "<question none addressed, or null>"
}

CONSENSUS QUALITY:
- "resolved": Factual agreement, the floor IS the answer
  Example: "The capital of France is Paris"
- "conventional": Best practice agreement, floor is baseline
  Example: "Use bcrypt for password hashing"
- "deflected": Agreement that context is needed
  Example: "Depends on your budget and timeline"

OUTLIER TYPES (for each option):
- "supplemental": Adds nuance, doesn't challenge floor
- "frame_challenger": Reframes the entire problem

TOPOLOGY:
- "high_confidence": Strong consensus (≥80% agreement), few outliers
- "dimensional": Trade-offs cluster by dimension (speed, cost, risk)
- "contested": Weak consensus, scattered outliers, multiple paradigms

GHOST: What question did EVERY model miss?
```

---

#### **1B: Create Gauntlet Prompt (Decide Mode)**

**New file:** `src/core/prompts/gauntlet-prompt.js`

```javascript
export function buildGauntletPrompt(mappingText, originalPrompt) {
  return `You are the Gauntlet. Your job is stress-testing and elimination.

You have access to:
<original_query>${originalPrompt}</original_query>

<mapped_terrain>
${mappingText}
</mapped_terrain>

TASK: Eliminate everything that fails scrutiny. What survives is the answer.

THE GAUNTLET (Ask each question of EVERY option):

1. **The Stress Test**
   "If I implement this and it fails, what's the failure mode?"
   ELIMINATE if: Catastrophic failure mode with no mitigation

2. **The Opportunity Cost Test**
   "What am I giving up by choosing this?"
   ELIMINATE if: Opportunity cost exceeds benefit

3. **The Regret Minimization Test**
   "Will I regret this choice in 6 months?"
   ELIMINATE if: Likely regret

4. **The Hidden Assumption Test**
   "What must be true for this to work?"
   ELIMINATE if: Assumption is fragile or unlikely

5. **The Comparison Test**
   "Is there a strictly better option that does everything this does?"
   ELIMINATE if: Yes

SURVIVORS:
After elimination, you'll have 1-3 options that passed all tests.

THE ANSWER:
Pick ONE. Not "it depends"—make the call.
Your answer should be:
- Specific (actionable)
- Confident (no hedging)
- Brief (max 3 sentences)
- With next step (what to do first)

OUTPUT FORMAT:

===THE_ANSWER===
<answer>Your specific recommendation in 2-3 sentences.</answer>
<next_step>Concrete first action to take.</next_step>

===SURVIVORS===
<primary>
  <option>[Name of the answer]</option>
  <survived_because>[Why this passed all tests]</survived_because>
</primary>

<supporting>
  [Any supporting options that complement the primary]
</supporting>

<conditional>
  [Options that work IF user's context differs]
</conditional>

===ELIMINATED===
<from_consensus>
  [Consensus options that failed tests, with kill reason]
</from_consensus>

<from_outliers>
  [Outlier options that failed tests, with kill reason]
</from_outliers>

Begin.`;
}
```

---

#### **1C: Create Framer Prompt (Triage/Container Routing)**

**New file:** `src/core/prompts/framer-prompt.js`

```javascript
export function buildFramerPrompt(mappingOutput, originalPrompt) {
  const { narrative, options, triage } = mappingOutput;
  
  return `You are the Framer. Your job is intelligent presentation.

<original_query>${originalPrompt}</original_query>

<triage_signals>
${JSON.stringify(triage, null, 2)}
</triage_signals>

<available_options>
${options}
</available_options>

TASK: Route this to the right container based on signals.

ROUTING LOGIC:

IF triage.topology === "high_confidence" AND triage.consensus_quality === "resolved":
  → CONTAINER: Direct Answer
  → Present consensus as THE answer, outliers as footnotes

IF triage.topology === "high_confidence" AND triage.consensus_quality === "conventional":
  → CONTAINER: Decision Tree
  → Consensus is default path, outliers are conditional branches

IF triage.topology === "dimensional":
  → CONTAINER: Comparison Matrix
  → Present trade-offs by dimension (speed, cost, risk, etc.)

IF triage.topology === "contested" OR creative query:
  → CONTAINER: Exploration Space
  → Present paradigms as equal cards, no default

IF triage.consensus_quality === "deflected":
  → CONTAINER: Clarification Screen
  → Extract variables needed for better answer

OUTPUT FORMAT:

===CONTAINER===
<type>[direct_answer|decision_tree|comparison_matrix|exploration_space|clarification]</type>

===CONTENT===
[Render the container with appropriate structure]

===SOUVENIR===
[One-sentence copy-paste summary]

Begin.`;
}
```

---

### **Phase 2: Add Mode Execution to Workflow Engine**

**Modify:** `src/core/workflow-engine.js`

Add two new step types: `'gauntlet'` and `'framer'`

```javascript
// In executeMapping

Step (current):
  async executeMappingStep(step, context, stepResults) {
    // ... existing mapper logic
    const mappingText = result.text;
    
    // NEW: Parse triage signals
    const triageMatch = mappingText.match(/===TRIAGE_SIGNALS===\s*({[\s\S]*?})/);
    const triage = triageMatch ? JSON.parse(triageMatch[1]) : null;
    
    return { 
      providerId: step.payload.mappingProvider,
      text: mappingText,
      meta: { triage }  // ← Store triage in meta
    };
  }

// NEW: Gauntlet step
async executeGauntletStep(step, context, stepResults) {
  const mappingStepId = step.payload.mappingStepIds[0];
  const mappingResult = stepResults.get(mappingStepId).result;
  
  const gauntletPrompt = buildGauntletPrompt(
    mappingResult.text,
    step.payload.originalPrompt
  );
  
  return new Promise((resolve) => {
    this.orchestrator.executeParallelFanout(
      gauntletPrompt,
      [step.payload.gauntletProvider],
      {
        sessionId: context.sessionId,
        onPartial: (providerId, chunk) => {
          this._dispatchPartialDelta(context.sessionId, step.stepId, providerId, chunk.text);
        },
        onAllComplete: (results) => {
          resolve({
            providerId: step.payload.gauntletProvider,
            text: results.get(step.payload.gauntletProvider).text
          });
        }
      }
    );
  });
}

// NEW: Framer step
async executeFramerStep(step, context, stepResults) {
  const mappingStepId = step.payload.mappingStepIds[0];
  const mappingResult = stepResults.get(mappingStepId).result;
  
  const framerPrompt = buildFramerPrompt(
    {
      narrative: mappingResult.text,
      options: mappingResult.text,  // Already contains options
      triage: mappingResult.meta.triage
    },
    step.payload.originalPrompt
  );
  
  return new Promise((resolve) => {
    this.orchestrator.executeParallelFanout(
      framerPrompt,
      [step.payload.framerProvider],
      {
        sessionId: context.sessionId,
        onPartial: (providerId, chunk) => {
          this._dispatchPartialDelta(context.sessionId, step.stepId, providerId, chunk.text);
        },
        onAllComplete: (results) => {
          resolve({
            providerId: step.payload.framerProvider,
            text: results.get(step.payload.framerProvider).text
          });
        }
      }
    );
  });
}
```

---

### **Phase 3: Add Mode UI Components**

#### **3A: Gauntlet Renderer**

**New file:** `ui/components/GauntletView.tsx`

```tsx
interface GauntletViewProps {
  gauntletText: string;
  isLive: boolean;
}

export function GauntletView({ gauntletText, isLive }: GauntletViewProps) {
  const parsed = parseGauntletOutput(gauntletText);
  
  if (!parsed) {
    return <div className="gauntlet-loading">Running gauntlet...</div>;
  }
  
  return (
    <div className="gauntlet-container">
      {/* THE ANSWER */}
      <div className="gauntlet-answer">
        <h3>⚡ THE ANSWER</h3>
        <p className="answer-text">{parsed.answer}</p>
        <div className="next-step">
          <strong>Next Step:</strong> {parsed.nextStep}
        </div>
      </div>
      
      {/* SURVIVORS */}
      <div className="gauntlet-survivors">
        <h4>✓ What Survived</h4>
        <div className="primary-survivor">
          <strong>{parsed.survivors.primary.option}</strong>
          <p>{parsed.survivors.primary.survived_because}</p>
        </div>
        
        {parsed.survivors.supporting && (
          <details>
            <summary>Supporting Options</summary>
            {parsed.survivors.supporting.map((s, i) => (
              <div key={i}>{s}</div>
            ))}
          </details>
        )}
      </div>
      
      {/* ELIMINATED */}
      <details className="gauntlet-eliminated">
        <summary>✗ What Didn't Make It</summary>
        {parsed.eliminated.from_consensus.map((e, i) => (
          <div key={i} className="eliminated-item">
            <strong>{e.option}</strong>: {e.reason}
          </div>
        ))}
      </details>
      
      {/* SOUVENIR */}
      <div className="souvenir-bar">
        📋 "{parsed.souvenir}" <button>Copy</button>
      </div>
    </div>
  );
}

function parseGauntletOutput(text: string) {
  // Parse ===THE_ANSWER===, ===SURVIVORS===, ===ELIMINATED===
  // Return structured object
}
```

---

#### **3B: Framer Containers**

**New file:** `ui/components/FramerContainers.tsx`

```tsx
export function DirectAnswerContainer({ content }) {
  return (
    <div className="framer-direct">
      <h3>THE ANSWER</h3>
      <div>{content.answer}</div>
      {content.context && (
        <details>
          <summary>Additional Context</summary>
          {content.context.map((c, i) => (
            <li key={i}>{c.text} — {c.source}</li>
          ))}
        </details>
      )}
    </div>
  );
}

export function DecisionTreeContainer({ content }) {
  return (
    <div className="framer-tree">
      <h3>THE DEFAULT PATH</h3>
      <div>{content.defaultPath}</div>
      
      <h4>BUT IF YOUR SITUATION IS...</h4>
      {content.branches.map((branch, i) => (
        <div key={i} className="tree-branch">
          <strong>IF {branch.condition}:</strong>
          <p>→ {branch.path}</p>
          <small>Because: {branch.reasoning}</small>
        </div>
      ))}
    </div>
  );
}

export function ComparisonMatrixContainer({ content }) {
  return (
    <div className="framer-matrix">
      <h3>THE TRADE-OFF LANDSCAPE</h3>
      {content.dimensions.map((dim, i) => (
        <div key={i} className="dimension-card">
          <h4>DIMENSION: {dim.name}</h4>
          <p><strong>Winner:</strong> {dim.winner}</p>
          <p><strong>Trade-off:</strong> {dim.tradeoff}</p>
        </div>
      ))}
      
      <table className="quick-matrix">
        {/* Render comparison table */}
      </table>
    </div>
  );
}

export function ExplorationSpaceContainer({ content }) {
  return (
    <div className="framer-exploration">
      <h3>THE LANDSCAPE</h3>
      <p>No consensus here. Multiple paradigms exist:</p>
      {content.paradigms.map((p, i) => (
        <div key={i} className="paradigm-card">
          <h4>{p.name} — {p.source}</h4>
          <p><strong>Core idea:</strong> {p.coreIdea}</p>
          <p><strong>Best for:</strong> {p.bestFor}</p>
        </div>
      ))}
    </div>
  );
}
```

---

### **Phase 4: Add Mode Selection UI**

**Modify:** `ui/components/ChatInputConnected.tsx`

Add mode selector above input:

```tsx
const [selectedMode, setSelectedMode] = useState<'auto' | 'explore' | 'understand' | 'decide'>('auto');

return (
  <div className="chat-input-container">
    <div className="mode-selector">
      <button 
        className={selectedMode === 'auto' ? 'active' : ''}
        onClick={() => setSelectedMode('auto')}
      >
        Auto
      </button>
      <button 
        className={selectedMode === 'explore' ? 'active' : ''}
        onClick={() => setSelectedMode('explore')}
      >
        🔍 Explore
      </button>
      <button 
        className={selectedMode === 'understand' ? 'active' : ''}
        onClick={() => setSelectedMode('understand')}
      >
        🧠 Understand
      </button>
      <button 
        className={selectedMode === 'decide' ? 'active' : ''}
        onClick={() => setSelectedMode('decide')}
      >
        ⚡ Decide
      </button>
    </div>
    
    <ChatInput 
      onSend={(prompt) => sendMessage(prompt, selectedMode)}
    />
  </div>
);
```

---

## 📋 **Implementation Checklist (Surgical Path)**

### **Week 1: Mapper Enhancement (Triage Signals)**
- [ ] Add "Task 4: Triage Signals" to existing Mapper prompt
- [ ] Update `MapperOutput` interface with `triage` field
- [ ] Parse triage JSON in `executeMappingStep`
- [ ] Store triage in `meta` field
- [ ] **Test:** Verify triage signals in Decision Map Sheet

### **Week 2: Gauntlet Mode (Decide)**
- [ ] Create `buildGauntletPrompt` function
- [ ] Add `executeGauntletStep` to Workflow Engine
- [ ] Add `'gauntlet'` step to Workflow Compiler
- [ ] Create `GauntletView` component
- [ ] Add gauntlet provider selection to settings
- [ ] **Test:** Send prompt with Decide mode selected

### **Week 3: Framer Mode (Explore)**
- [ ] Create `buildFramerPrompt` function
- [ ] Add `executeFramerStep` to Workflow Engine
- [ ] Add `'framer'` step to Workflow Compiler
- [ ] Create 4 container components (Direct, Tree, Matrix, Exploration)
- [ ] Parse framer output and route to containers
- [ ] **Test:** Send prompt with Explore mode selected

### **Week 4: Mode Selection & Integration**
- [ ] Add mode selector UI above chat input
- [ ] Modify `useChat` to pass selected mode to backend
- [ ] Add mode routing logic in Workflow Compiler
- [ ] Add mode indicator to AiTurnBlock
- [ ] Add "Switch Mode" buttons in turn bubbles
- [ ] **Test:** All 3 modes + auto-detection

### **Week 5: Polish & Refinement**
- [ ] Add container pivot (switch between Direct/Tree/Matrix)
- [ ] Add souvenir generation for each container
- [ ] Style all new components
- [ ] Add loading states for each mode
- [ ] Add error handling for mode failures
- [ ] **Test:** Full user flows

---

## 🎯 **Migration Strategy: Zero Downtime**

**Key Insight:** You can **add modes without breaking existing synthesis**. Just treat your current synthesis as "Understand mode" and layer the new modes on top.

```
Current Flow:
  Batch → Mapper → Synthesis
  
V2 Flow:
  Batch → Mapper → [Mode Router] → Synthesis | Gauntlet | Framer
                                    (Understand) (Decide)  (Explore)
```

**Backward compatibility:**
- If user doesn't select a mode → default to Synthesis (current behavior)
- All existing conversations still work
- New modes are purely additive

---

## ⚠️ **Strategic Risk Mitigation (From Earlier Analysis)**

### **Risk 1: Semantic Collapse in Mapper**

**Your current Mapper already does semantic grouping** (via option labels + graph edges). The V2 Mapper just adds **classification** (supplemental vs frame-challenger).

**Mitigation:**
- Start conservative: Only classify outliers as "frame-challenger" if they explicitly contradict the floor
- Add a "confidence" score to outlier classification
- Let users manually reclassify outliers in Decision Map UI

### **Risk 2: Cost Structure**

You're already running 6-way fan-out. Adding Gauntlet/Framer adds **2 more API calls per turn** (worst case).

**Current cost:** ~$0.10/turn  
**With Gauntlet+Framer:** ~$0.12/turn (+20%)

**Mitigation:**
- Make Gauntlet/Framer **optional** (user can disable in settings)
- Use cheaper models for Gauntlet/Framer (Gemini Flash, Claude Haiku)
- Cache framer outputs for identical mapper results

### **Risk 3: Mapper as Single Point of Failure**

**You've already solved this.** Your Mapper has retry logic + fallback to raw responses.

**No additional mitigation needed.**

---

## 🚀 **Summary: The 20% You Need**

| Component | Effort | Impact | Priority |
|-----------|--------|--------|----------|
| Mapper triage signals | **2 days** | Enables all modes | **P0** |
| Gauntlet prompt + UI | **3 days** | Decide mode | **P1** |
| Framer prompt + containers | **5 days** | Explore mode | **P1** |
| Mode selection UI | **2 days** | User control | **P2** |
| Container pivoting | **3 days** | UX polish | **P3** |
| **TOTAL** | **15 days** | Full V2 | |

**You're not rewriting. You're extending.** Your foundation is rock-solid. Just add the prompt engineering layers and the UI to render them.

**Go build Week 1 first.** Get the triage signals flowing. Everything else builds on that.