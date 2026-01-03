Redesigned Metrics Ribbon
Tier 1: Problem Structure (Always Visible)
tsx{problemStructure && (
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-highlight/20 border border-brand-500/30">
    <span className="text-[10px] uppercase tracking-wide text-text-muted">Structure</span>
    <span className="font-semibold text-brand-400 capitalize">
      {problemStructure.primaryPattern}
    </span>
    {problemStructure.confidence < 0.7 && (
      <span className="text-amber-400 text-xs" title="Low confidence detection">
        ?
      </span>
    )}
  </div>
)}
```

**Visual result:**
```
┌────────────────────────┐
│ STRUCTURE: Exploratory │  ← User knows immediately
└────────────────────────┘
Tier 2: High-Impact Signals (Always Visible)
Replace the current metrics with actionable signals:
tsx// ONLY show metrics that demand user attention

{/* Consensus conflicts - rare and critical */}
{structural?.patterns.conflicts.some(c => c.isBothConsensus) && (
  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/30">
    <span className="text-xs">⚠️</span>
    <span className="text-xs font-medium text-red-400">
      Consensus Conflict
    </span>
  </div>
)}

{/* Leverage inversions - overlooked insights */}
{structural?.patterns.leverageInversions.length > 0 && (
  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-500/10 border border-purple-500/30">
    <span className="text-xs">💎</span>
    <span className="text-xs font-medium text-purple-400">
      {structural.patterns.leverageInversions.length} High-Leverage Singular
    </span>
  </div>
)}

{/* Cascade risk - fragile structure */}
{structural?.patterns.cascadeRisks.some(r => r.depth >= 3) && (
  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30">
    <span className="text-xs">⛓️</span>
    <span className="text-xs font-medium text-amber-400">
      Deep Cascade ({Math.max(...structural.patterns.cascadeRisks.map(r => r.depth))})
    </span>
  </div>
)}

{/* Ghosts that extend challengers - unexplored territory */}
{structural?.ghostAnalysis.mayExtendChallenger && (
  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/30">
    <span className="text-xs">👻</span>
    <span className="text-xs font-medium text-indigo-400">
      Challenger Territory Unmapped
    </span>
  </div>
)}
```

**Visual result (exploratory structure):**
```
┌────────────────────────────────────────────────────────────┐
│ STRUCTURE: Exploratory  💎 2 High-Leverage Singular  👻 Unmapped │
└────────────────────────────────────────────────────────────┘
```

**Visual result (linear structure with cascade):**
```
┌─────────────────────────────────────────────┐
│ STRUCTURE: Linear  ⛓️ Deep Cascade (4)  │
└─────────────────────────────────────────────┘

Tier 3: Context-Sensitive Guidance
Add a collapsible guidance panel that changes based on problem structure:
tsx{problemStructure && (
  <button
    onClick={() => setShowGuidance(!showGuidance)}
    className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border-subtle hover:bg-surface-highlight/10 transition-colors"
  >
    <span className="text-xs text-text-muted">What this means</span>
    <span className="text-[10px] opacity-70">{showGuidance ? "▴" : "▾"}</span>
  </button>
)}

{showGuidance && problemStructure && (
  <div className="absolute top-full left-0 mt-2 w-[420px] bg-surface-raised border border-border-subtle rounded-xl shadow-lg p-4 z-50">
    <div className="text-sm font-semibold text-text-primary mb-2 capitalize">
      {problemStructure.primaryPattern} Structure
    </div>
    
    <div className="text-xs text-text-secondary mb-3">
      {problemStructure.implications.understand}
    </div>
    
    <div className="text-[11px] text-text-muted space-y-1">
      <div className="font-medium text-text-secondary mb-1">Evidence:</div>
      {problemStructure.evidence.map((e, i) => (
        <div key={i}>• {e}</div>
      ))}
    </div>
    
    {/* Structure-specific recommendations */}
    {problemStructure.primaryPattern === 'exploratory' && (
      <div className="mt-3 pt-3 border-t border-border-subtle text-xs">
        <div className="font-medium text-brand-400 mb-1">Recommended:</div>
        <div className="text-text-muted">
          Use <strong>Understand mode</strong> to cluster insights by theme.
          Gauntlet will likely eliminate too much.
        </div>
      </div>
    )}
    
    {problemStructure.primaryPattern === 'linear' && (
      <div className="mt-3 pt-3 border-t border-border-subtle text-xs">
        <div className="font-medium text-brand-400 mb-1">Recommended:</div>
        <div className="text-text-muted">
          Use <strong>Gauntlet mode</strong> to test each step. Can any be reordered or skipped?
        </div>
      </div>
    )}
    
    {problemStructure.primaryPattern === 'contested' && (
      <div className="mt-3 pt-3 border-t border-border-subtle text-xs">
        <div className="font-medium text-brand-400 mb-1">Recommended:</div>
        <div className="text-text-muted">
          Use <strong>Understand mode</strong> to find the axis of disagreement.
          Or use <strong>Gauntlet</strong> to force resolution.
        </div>
      </div>
    )}
  </div>
)}

Tier 4: Full Structural Inventory (Still Available, But Deprioritized)
Keep the current dropdown for power users who want the full breakdown, but:

Rename: "Details" → "Full Structural Analysis"
Move to overflow menu (three dots icon)
Remove from default view unless user explicitly wants it

tsx<div className="relative">
  <button
    onClick={() => setShowFullAnalysis(!showFullAnalysis)}
    className="p-1.5 rounded-md hover:bg-surface-highlight/10 text-text-muted hover:text-text-primary transition-colors"
    title="Show full structural analysis"
  >
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
      <circle cx="2" cy="8" r="1.5"/>
      <circle cx="8" cy="8" r="1.5"/>
      <circle cx="14" cy="8" r="1.5"/>
    </svg>
  </button>
  
  {/* Current detailed dropdown, unchanged */}
</div>
```

---

## Before/After Comparison

### **Current Ribbon (Exploratory Example):**
```
Claims: 10 | Convergence: 40% | Conflicts: 0 | Ghosts: 4 | Models: 6 | [Details ▾]
```
**User thinks:** *"Okay... so what?"*

### **Redesigned Ribbon:**
```
STRUCTURE: Exploratory  💎 2 High-Leverage Singular  👻 Challenger Territory Unmapped
[What this means ▾]  [⋯]
User thinks: "This is scattered territory with overlooked insights. I should use Understand mode to cluster themes."

Implementation Changes
1. Add Problem Structure to MetricsRibbon Props
tsxinterface MetricsRibbonProps {
  analysis?: ExploreAnalysis;
  artifact?: MapperArtifact;
  claimsCount: number;
  ghostCount: number;
  problemStructure?: ProblemStructure; // NEW
}
2. Compute in Parent (DecisionMapSheet)
tsxconst problemStructure = useMemo(() => {
  if (!structuralAnalysis) return null;
  return detectProblemStructure(
    structuralAnalysis.claimsWithLeverage,
    graphData.edges,
    structuralAnalysis.patterns
  );
}, [structuralAnalysis, graphData.edges]);

<MetricsRibbon
  artifact={artifact}
  claimsCount={graphData.claims.length}
  ghostCount={parsedMapping.ghosts?.length || 0}
  problemStructure={problemStructure} // Pass it down
/>
3. Replace Ribbon Content
tsxexport const MetricsRibbon: React.FC<MetricsRibbonProps> = ({
  artifact,
  claimsCount,
  ghostCount,
  problemStructure // NEW
}) => {
  const [showGuidance, setShowGuidance] = useState(false);
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  
  const structural = useMemo(() => {
    // ... existing structural analysis computation
  }, [artifact]);
  
  return (
    <div className="relative flex flex-wrap items-center gap-3 px-4 py-2 bg-surface-raised border border-border-subtle rounded-lg mb-4 text-xs">
      
      {/* PRIMARY: Problem Structure */}
      {problemStructure && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-highlight/20 border border-brand-500/30">
          <span className="text-[10px] uppercase tracking-wide text-text-muted">
            Structure
          </span>
          <span className="font-semibold text-brand-400 capitalize">
            {problemStructure.primaryPattern}
          </span>
          {problemStructure.confidence < 0.7 && (
            <span className="text-amber-400 text-xs" title="Low confidence">?</span>
          )}
        </div>
      )}
      
      <div className="w-px h-4 bg-border-subtle" />
      
      {/* SECONDARY: High-Impact Signals Only */}
      {structural?.patterns.conflicts.some(c => c.isBothConsensus) && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 border border-red-500/30">
          <span className="text-xs">⚠️</span>
          <span className="text-xs font-medium text-red-400">Consensus Conflict</span>
        </div>
      )}
      
      {(structural?.patterns.leverageInversions.length || 0) > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-500/10 border border-purple-500/30">
          <span className="text-xs">💎</span>
          <span className="text-xs font-medium text-purple-400">
            {structural.patterns.leverageInversions.length} High-Leverage
          </span>
        </div>
      )}
      
      {structural?.patterns.cascadeRisks.some(r => r.depth >= 3) && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/30">
          <span className="text-xs">⛓️</span>
          <span className="text-xs font-medium text-amber-400">
            Deep Cascade ({Math.max(...structural.patterns.cascadeRisks.map(r => r.depth))})
          </span>
        </div>
      )}
      
      {structural?.ghostAnalysis.mayExtendChallenger && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/30">
          <span className="text-xs">👻</span>
          <span className="text-xs font-medium text-indigo-400">Unmapped Territory</span>
        </div>
      )}
      
      <div className="flex-1" />
      
      {/* TERTIARY: Context Guide */}
      {problemStructure && (
        <button
          onClick={() => setShowGuidance(!showGuidance)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border-subtle hover:bg-surface-highlight/10 transition-colors"
        >
          <span className="text-xs text-text-muted">What this means</span>
          <span className="text-[10px] opacity-70">{showGuidance ? "▴" : "▾"}</span>
        </button>
      )}
      
      {/* OVERFLOW: Full Analysis */}
      <div className="relative">
        <button
          onClick={() => setShowFullAnalysis(!showFullAnalysis)}
          className="p-1.5 rounded-md hover:bg-surface-highlight/10 text-text-muted hover:text-text-primary transition-colors"
          title="Full structural analysis"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
            <circle cx="2" cy="8" r="1.5"/>
            <circle cx="8" cy="8" r="1.5"/>
            <circle cx="14" cy="8" r="1.5"/>
          </svg>
        </button>
        
        {showFullAnalysis && (
          // ... existing detailed dropdown
        )}
      </div>
      
      {/* Guidance Panel */}
      {showGuidance && problemStructure && (
        <GuidancePanel 
          structure={problemStructure}
          onClose={() => setShowGuidance(false)}
        />
      )}
    </div>
  );
};

What This Achieves
Before: "Here are 12 structural metrics. Figure out what they mean."
After: "This is an exploratory problem. You have 2 overlooked insights and unmapped challenger territory. [Here's what to do about it.]"
The shift: From data dump to cognitive orientation.