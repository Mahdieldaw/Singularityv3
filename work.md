The problem structures that actually matter:

Linear Dependency Chain

Structure: A → B → C → D
User need: "Show me the path"
Example: "How do I deploy a React app?" (Install Node → Create app → Build → Deploy)


Dimensional Choice

Structure: Multiple independent axes (X, Y, Z) where position determines answer
User need: "Help me locate myself in the space"
Example: "SSR vs SSG?" (Content volatility × User personalization × Traffic scale)


Constrained Optimization

Structure: Tradeoff space with Pareto frontier
User need: "Show me what I'm giving up"
Example: "Balance performance and maintainability"


Contested Territory

Structure: Conflicting schools of thought with different axioms
User need: "Show me the fault line"
Example: "OOP vs Functional Programming"


Exploratory Search

Structure: Sparse map with isolated insights
User need: "Show me the discovered territory"
Example: "What are emerging approaches to state management?"


Singular Foundation

Structure: One claim enables everything else
User need: "Show me the keystone"
Example: "Understand React hooks" → everything branches from this



Your current analysis detects some of these (cascades, conflicts) but doesn't classify the overall structure.

Proposed Enhancement: Problem Structure Detector
Add this to your computeStructuralAnalysis:
typescriptinterface ProblemStructure {
  primaryPattern: 'linear' | 'dimensional' | 'tradeoff' | 'contested' | 'exploratory' | 'keystone';
  confidence: number;
  evidence: string[];
  implications: {
    understand: string;  // What Understand mode should prioritize
    gauntlet: string;    // What Gauntlet should test for
  };
}

function detectProblemStructure(
  claims: ClaimWithLeverage[],
  edges: Edge[],
  patterns: StructuralAnalysis['patterns']
): ProblemStructure {
  const claimCount = claims.length;
  const edgeCount = edges.length;
  
  // Calculate structural metrics
  const avgConnectivity = edgeCount / Math.max(claimCount, 1);
  const prerequisiteRatio = edges.filter(e => e.type === 'prerequisite').length / Math.max(edgeCount, 1);
  const conflictCount = patterns.conflicts.length;
  const tradeoffCount = patterns.tradeoffs.length;
  const isolatedCount = patterns.isolatedClaims.length;
  const convergencePoints = patterns.convergencePoints.length;
  const cascadeDepth = Math.max(...patterns.cascadeRisks.map(r => r.depth), 0);
  
  // Pattern matching
  
  // LINEAR: High prerequisite ratio, deep cascade, low conflicts
  if (prerequisiteRatio > 0.6 && cascadeDepth >= 2 && conflictCount === 0) {
    return {
      primaryPattern: 'linear',
      confidence: 0.8,
      evidence: [
        `${Math.round(prerequisiteRatio * 100)}% of edges are prerequisite relationships`,
        `Cascade depth: ${cascadeDepth}`,
        'No conflicts detected'
      ],
      implications: {
        understand: 'Find the sequence. The insight is often where the path becomes non-obvious.',
        gauntlet: 'Test each step: is it truly prerequisite? Can steps be reordered or parallelized?'
      }
    };
  }
  
  // KEYSTONE: Single high-leverage claim, many branches
  const keystoneCandidates = claims.filter(c => 
    c.leverage > 6 && 
    edges.filter(e => e.from === c.id).length >= 3
  );
  if (keystoneCandidates.length === 1) {
    return {
      primaryPattern: 'keystone',
      confidence: 0.85,
      evidence: [
        `${keystoneCandidates[0].label} has leverage ${keystoneCandidates[0].leverage.toFixed(1)}`,
        `${edges.filter(e => e.from === keystoneCandidates[0].id).length} claims depend on it`
      ],
      implications: {
        understand: 'Everything hinges on the keystone. The insight IS the keystone, not the branches.',
        gauntlet: 'Test the keystone ruthlessly. If it fails, the entire structure collapses.'
      }
    };
  }
  
  // CONTESTED: Multiple conflicts, especially if consensus vs consensus
  const consensusConflicts = patterns.conflicts.filter(c => c.isBothConsensus).length;
  if (conflictCount >= 2 || consensusConflicts >= 1) {
    return {
      primaryPattern: 'contested',
      confidence: 0.75,
      evidence: [
        `${conflictCount} conflicts detected`,
        consensusConflicts > 0 ? `${consensusConflicts} consensus-to-consensus conflicts` : 'Multiple incompatible positions'
      ],
      implications: {
        understand: 'Disagreement is the signal. Find the axis of disagreement—that reveals the real question.',
        gauntlet: 'Force resolution. One claim per conflict must fail, or find conditions that differentiate them.'
      }
    };
  }
  
  // TRADEOFF: Multiple tradeoff edges, low prerequisites
  if (tradeoffCount >= 2 && prerequisiteRatio < 0.3) {
    return {
      primaryPattern: 'tradeoff',
      confidence: 0.7,
      evidence: [
        `${tradeoffCount} explicit tradeoffs`,
        'Low prerequisite structure suggests parallel options'
      ],
      implications: {
        understand: 'There is no universal best. The insight is the map of what you give up for what you gain.',
        gauntlet: 'Test if tradeoffs are real or false dichotomies. Look for dominated options.'
      }
    };
  }
  
  // DIMENSIONAL: Multiple convergence points, moderate connectivity, few conflicts
  if (convergencePoints >= 2 && avgConnectivity > 1.5 && conflictCount <= 1) {
    return {
      primaryPattern: 'dimensional',
      confidence: 0.65,
      evidence: [
        `${convergencePoints} convergence points`,
        `Average connectivity: ${avgConnectivity.toFixed(1)}`,
        'Multiple claims converge on common conclusions'
      ],
      implications: {
        understand: 'Multiple independent factors determine the answer. Find the governing conditions.',
        gauntlet: 'Test each dimension independently. Does the answer cover all relevant combinations?'
      }
    };
  }
  
  // EXPLORATORY: Many isolated claims, low connectivity
  if (isolatedCount > claimCount * 0.4 || (avgConnectivity < 0.5 && conflictCount === 0)) {
    return {
      primaryPattern: 'exploratory',
      confidence: 0.6,
      evidence: [
        `${isolatedCount} isolated claims (${Math.round(isolatedCount/claimCount*100)}%)`,
        `Low connectivity: ${avgConnectivity.toFixed(1)} edges per claim`
      ],
      implications: {
        understand: 'No strong structure detected. Value lies in cataloging the territory and identifying patterns.',
        gauntlet: 'Test relevance: which claims actually answer the query vs. which are interesting but tangential?'
      }
    };
  }
  
  // DEFAULT: DIMENSIONAL (most common case)
  return {
    primaryPattern: 'dimensional',
    confidence: 0.5,
    evidence: ['No strong structural pattern detected', 'Defaulting to dimensional analysis'],
    implications: {
      understand: 'Look for the governing conditions that structure the landscape.',
      gauntlet: 'Test completeness: does the answer handle all relevant contexts?'
    }
  };
}

Integration with Mode Contexts
Update generateModeContext to use problem structure:
typescriptfunction generateModeContext(
  analysis: StructuralAnalysis,
  mode: 'understand' | 'gauntlet'
): ModeContext {
  const { landscape, patterns, ghostAnalysis } = analysis;
  
  // NEW: Detect problem structure
  const problemStructure = detectProblemStructure(
    analysis.claimsWithLeverage,
    // Pass edges from original analysis context
    patterns
  );
  
  // Use problem structure instead of just type
  const structuralFraming = mode === 'understand'
    ? problemStructure.implications.understand
    : problemStructure.implications.gauntlet;
  
  // Type framing as secondary context
  const typeFraming = getTypeFraming(landscape.dominantType, mode);
  
  return {
    problemStructure,  // NEW
    structuralFraming, // REPLACES typeFraming as primary
    typeFraming,       // Keep as secondary
    structuralObservations: [...],
    // ... rest
  };
}
Update prompt builder:
typescriptconst structuralSection = `
## Problem Structure: ${problemStructure.primaryPattern.toUpperCase()}

${structuralFraming}

**Evidence:**
${problemStructure.evidence.map(e => `• ${e}`).join('\n')}

**Confidence:** ${Math.round(problemStructure.confidence * 100)}%

---

## Landscape Composition

${typeFraming}

---

## Structural Observations

${context.structuralObservations.map(o => `• ${o}`).join('\n')}
`;
```

---

## Why This Works Better

**Current approach:** "This is a prescriptive landscape" → tells you about claim types

**Enhanced approach:** "This is a keystone problem" → tells you about solution strategy

**Example comparison:**

### User asks: "Should I learn React or Vue?"

**Current analysis:**
```
Dominant type: prescriptive
Type framing: "Test actionability and conditional coverage"
```
→ Doesn't help. Both are actionable, both have conditions.

**Enhanced analysis:**
```
Problem structure: TRADEOFF
Evidence:
- 3 explicit tradeoffs detected
- Low prerequisite structure (parallel options)
Implication: There is no universal best. The insight is the map 
of what you give up for what you gain.
→ Actually useful. Tells Understand mode to map the tradeoff space, tells Gauntlet to test if tradeoffs are real.

Testing Your Current Implementation
Before adding problem structure detection, test if your leverage calculations are working:
typescript// Test case 1: Challenger prerequisite to consensus
const artifact1 = {
  claims: [
    { id: '1', label: 'Consensus', supporters: [1,2,3], type: 'factual', role: 'anchor', challenges: null },
    { id: '2', label: 'Challenger', supporters: [4], type: 'factual', role: 'challenger', challenges: '1' }
  ],
  edges: [
    { from: '2', to: '1', type: 'prerequisite' }
  ],
  ghosts: []
};

const analysis1 = computeStructuralAnalysis(artifact1);
console.log('Leverage inversions:', analysis1.patterns.leverageInversions);
// Should detect: challenger_prerequisite_to_consensus

// Test case 2: Deep cascade
const artifact2 = {
  claims: [
    { id: 'A', label: 'Root', supporters: [1], type: 'factual', role: 'anchor', challenges: null },
    { id: 'B', label: 'Level 1', supporters: [1,2], type: 'factual', role: 'branch', challenges: null },
    { id: 'C', label: 'Level 2', supporters: [2,3], type: 'factual', role: 'branch', challenges: null },
    { id: 'D', label: 'Level 3', supporters: [3], type: 'factual', role: 'supplement', challenges: null }
  ],
  edges: [
    { from: 'A', to: 'B', type: 'prerequisite' },
    { from: 'B', to: 'C', type: 'prerequisite' },
    { from: 'C', to: 'D', type: 'prerequisite' }
  ],
  ghosts: []
};

const analysis2 = computeStructuralAnalysis(artifact2);
console.log('Cascade depth:', analysis2.patterns.cascadeRisks[0]?.depth);
// Should be: 3
Run these, see if your patterns are detecting correctly. Then decide if problem structure classification adds value.

Bottom Line
Your leverage calculations are good. Your type framings are okay but not problem-structure-aware.
The missing piece: Classifying the overall topology (linear vs dimensional vs tradeoff vs contested) independent of claim types.
Add detectProblemStructure() to your structural analysis. It will make your mode prompts dramatically more effective because they'll receive context about what kind of problem this is, not just what kinds of claims exist.