PART 1: Structural Literacy Annotations (Highest Priority)
xml<ide_agent_instructions>

## Task: Add Structural Literacy Annotations to Claims

### Context
Users currently see raw structural data (leverage: 8.2, cascade depth: 3) without understanding what it means. We need to surface these insights in plain language **at the point of interaction** (in claim cards and detail views).

### Problem We're Solving
- Users don't know that a claim with 1 supporter but 5 dependents is fragile
- Users don't know when a claim is a "keystone" that holds the structure together
- Raw numbers like "leverage: 8.2" are meaningless without context

### Files to Modify

**1. Create New Component: `src/components/StructuralInsight.tsx`**
```typescript
import React from 'react';

interface StructuralInsightProps {
  type: 'fragile_foundation' | 'keystone' | 'consensus_conflict' | 'high_leverage_singular' | 'cascade_risk';
  claim: {
    label: string;
    supporters: (string | number)[];
  };
  metadata?: {
    dependentCount?: number;
    dependentLabels?: string[];
    cascadeDepth?: number;
    conflictsWith?: string;
    leverageScore?: number;
  };
}

export const StructuralInsight: React.FC<StructuralInsightProps> = ({ type, claim, metadata }) => {
  const insights = {
    fragile_foundation: {
      icon: '⚠️',
      title: 'Fragile Foundation',
      description: `Only ${claim.supporters.length} supporter(s), but ${metadata?.dependentCount || 0} claim(s) depend on "${claim.label}". High impact if wrong.`,
      color: 'amber',
    },
    keystone: {
      icon: '🔑',
      title: 'Keystone Claim',
      description: `"${claim.label}" is the central pillar—${metadata?.dependentCount || 0} other claims build on this. If this fails, the structure collapses.`,
      color: 'purple',
    },
    consensus_conflict: {
      icon: '⚡',
      title: 'Consensus Conflict',
      description: `"${claim.label}" conflicts with "${metadata?.conflictsWith || 'another claim'}". Both have multiple supporters—models disagree on fundamentals.`,
      color: 'red',
    },
    high_leverage_singular: {
      icon: '💎',
      title: 'Overlooked Insight',
      description: `"${claim.label}" has only ${claim.supporters.length} supporter(s) but high structural importance (leverage: ${metadata?.leverageScore?.toFixed(1)}). May contain valuable perspective others missed.`,
      color: 'indigo',
    },
    cascade_risk: {
      icon: '⛓️',
      title: 'Deep Cascade',
      description: `Eliminating "${claim.label}" cascades through ${metadata?.dependentCount || 0} claims across ${metadata?.cascadeDepth || 0} levels. Handle with care.`,
      color: 'orange',
    },
  };

  const insight = insights[type];
  
  const colorClasses = {
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    purple: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    indigo: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400',
    orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
  };

  return (
    <div className={`flex gap-2 p-3 rounded-lg border ${colorClasses[insight.color]}`}>
      <span className="text-lg flex-shrink-0">{insight.icon}</span>
      <div className="min-w-0">
        <div className="font-semibold text-sm mb-1">{insight.title}</div>
        <div className="text-xs opacity-90 leading-relaxed">{insight.description}</div>
        {metadata?.dependentLabels && metadata.dependentLabels.length > 0 && (
          <div className="mt-2 text-[10px] opacity-70">
            <span className="font-medium">Affects:</span> {metadata.dependentLabels.slice(0, 3).join(', ')}
            {metadata.dependentLabels.length > 3 && ` +${metadata.dependentLabels.length - 3} more`}
          </div>
        )}
      </div>
    </div>
  );
};
```

**2. Modify: `src/components/decision/DecisionMapSheet.tsx` (DetailView)**

Find the `DetailView` component and add structural insights after the "Supported by" section:
```typescript
const DetailView: React.FC<DetailViewProps> = ({ node, narrativeExcerpt, citationSourceOrder, onBack, onOrbClick }) => {
  // ... existing code

  // NEW: Compute structural insights for this node
  const structuralInsights = useMemo(() => {
    if (!structural) return [];
    
    const insights: Array<{ type: any; metadata: any }> = [];
    
    // Check for fragile foundation
    const leverageInversion = structural.patterns.leverageInversions.find(inv => inv.claimId === node.id);
    if (leverageInversion && leverageInversion.reason === 'singular_foundation') {
      const cascade = structural.patterns.cascadeRisks.find(r => r.sourceId === node.id);
      insights.push({
        type: 'fragile_foundation',
        metadata: {
          dependentCount: leverageInversion.affectedClaims.length,
          dependentLabels: cascade?.dependentLabels || [],
        },
      });
    }
    
    // Check for keystone
    const claimWithLeverage = structural.claimsWithLeverage.find(c => c.id === node.id);
    if (claimWithLeverage && claimWithLeverage.leverage > 8) {
      const cascade = structural.patterns.cascadeRisks.find(r => r.sourceId === node.id);
      if (cascade && cascade.dependentIds.length >= 3) {
        insights.push({
          type: 'keystone',
          metadata: {
            dependentCount: cascade.dependentIds.length,
            dependentLabels: cascade.dependentLabels,
          },
        });
      }
    }
    
    // Check for consensus conflict
    const conflict = structural.patterns.conflicts.find(
      c => (c.claimA.id === node.id || c.claimB.id === node.id) && c.isBothConsensus
    );
    if (conflict) {
      const otherClaim = conflict.claimA.id === node.id ? conflict.claimB : conflict.claimA;
      insights.push({
        type: 'consensus_conflict',
        metadata: {
          conflictsWith: otherClaim.label,
        },
      });
    }
    
    // Check for high leverage singular
    if (leverageInversion && leverageInversion.reason === 'high_connectivity_low_support') {
      insights.push({
        type: 'high_leverage_singular',
        metadata: {
          leverageScore: claimWithLeverage?.leverage,
        },
      });
    }
    
    // Check for cascade risk
    const cascade = structural.patterns.cascadeRisks.find(r => r.sourceId === node.id);
    if (cascade && cascade.depth >= 3) {
      insights.push({
        type: 'cascade_risk',
        metadata: {
          dependentCount: cascade.dependentIds.length,
          cascadeDepth: cascade.depth,
          dependentLabels: cascade.dependentLabels,
        },
      });
    }
    
    return insights;
  }, [node.id, structural]);

  return (
    <m.div ...>
      {/* ... existing back button and header ... */}

      {/* Supported by row */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-text-muted mb-3">Supported by</h3>
        <SupporterOrbs ... />
      </div>

      {/* NEW: Structural Insights */}
      {structuralInsights.length > 0 && (
        <div className="mb-8 space-y-3">
          <h3 className="text-sm font-medium text-text-muted mb-3">Structural Analysis</h3>
          {structuralInsights.map((insight, idx) => (
            <StructuralInsight
              key={idx}
              type={insight.type}
              claim={node}
              metadata={insight.metadata}
            />
          ))}
        </div>
      )}

      {/* ... rest of component ... */}
    </m.div>
  );
};
```

**3. Modify: `src/components/MetricsRibbon.tsx` (Advanced Details Panel)**

Replace the current list-based display with annotated insights:
```typescript
// In the advanced details panel, replace raw metrics with annotated insights

{/* Leverage Inversions Section - REPLACE CURRENT */}
<div className="border border-border-subtle rounded-lg overflow-hidden">
  <div className="px-3 py-2 bg-surface-highlight/10 text-[11px] text-text-secondary flex items-center justify-between">
    <span>Structural Insights</span>
    <span className="opacity-70">{leverageInversionCount + cascadeRiskCount}</span>
  </div>
  <div className="px-3 py-2 space-y-2">
    {structural.patterns.leverageInversions.map((inv) => {
      const cascade = structural.patterns.cascadeRisks.find(r => r.sourceId === inv.claimId);
      const claimData = structural.claimsWithLeverage.find(c => c.id === inv.claimId);
      
      return (
        <StructuralInsight
          key={inv.claimId}
          type={inv.reason === 'singular_foundation' ? 'fragile_foundation' : 'high_leverage_singular'}
          claim={{ label: inv.claimLabel, supporters: Array(inv.supporterCount).fill(0) }}
          metadata={{
            dependentCount: inv.affectedClaims.length,
            dependentLabels: cascade?.dependentLabels || [],
            leverageScore: claimData?.leverage,
          }}
        />
      );
    })}
    
    {structural.patterns.cascadeRisks
      .filter(r => r.depth >= 3)
      .map((cascade) => (
        <StructuralInsight
          key={cascade.sourceId}
          type="cascade_risk"
          claim={{ label: cascade.sourceLabel, supporters: [] }}
          metadata={{
            dependentCount: cascade.dependentIds.length,
            cascadeDepth: cascade.depth,
            dependentLabels: cascade.dependentLabels,
          }}
        />
      ))}
  </div>
</div>
```

### Key Changes Summary

**Before:**
```
Leverage inversions: 2
- Epistemic Keystone Identification (1) — singular foundation → affects 2
```

**After:**
```
⚠️ Fragile Foundation
Only 1 supporter(s), but 2 claim(s) depend on "Epistemic Keystone Identification". 
High impact if wrong.
Affects: Structural Sensitivity Simulation, Evidence Gap Detection
```

### Testing Checklist

- [ ] Structural insights appear in claim detail view
- [ ] Insights use actual claim labels (not generic "this claim")
- [ ] Dependent claims are listed by name (up to 3, then "+N more")
- [ ] Icons and colors match insight severity
- [ ] Text is in plain language (no jargon like "leverage inversion")
- [ ] Insights appear in metrics ribbon advanced panel
- [ ] No insights shown for claims with no structural patterns

</ide_agent_instructions>

PART 2: High-Value Metrics Implementation
xml<ide_agent_instructions>

## Task: Add Four High-Value Structural Metrics

### Context
We're adding four new computed metrics that reveal structural properties our current leverage calculation misses:
1. **Keystone Score**: Identifies central pillar claims
2. **Evidence Gap Score**: Flags dangerous load-bearing assumptions
3. **Support Skew**: Detects false consensus and valuable outliers
4. **Structural Risk Score**: Combined risk assessment

### Files to Modify

**1. Extend Type Definitions in `src/components/MetricsRibbon.tsx`**

Update the `ClaimWithLeverage` type:
```typescript
type ClaimWithLeverage = {
  id: string;
  label: string;
  supporters: number[];
  type: string;
  role: string;
  leverage: number;
  leverageFactors: {
    supportWeight: number;
    roleWeight: number;
    connectivityWeight: number;
    positionWeight: number;
  };
  isLeverageInversion: boolean;
  
  // NEW METRICS
  keystoneScore: number;        // outDegree × supporters.length
  evidenceGapScore: number;     // blastRadius ÷ supporters.length
  supportSkew: number;          // max(supporters per model) ÷ total
  isKeystone: boolean;          // keystoneScore > threshold
  isEvidenceGap: boolean;       // evidenceGapScore > 3
  isOutlier: boolean;           // supportSkew > 0.6
};
```

**2. Modify `computeClaimLeverage` Function**

Add new calculations at the end of the function:
```typescript
const computeClaimLeverage = (claim: Claim, allEdges: Edge[], modelCountRaw: number): ClaimWithLeverage => {
  const safeModelCount = Math.max(modelCountRaw || 0, 1);
  const supporters = Array.isArray(claim.supporters) ? claim.supporters : [];
  
  // ... existing leverage calculation ...
  
  const outgoing = allEdges.filter((e) => e.from === claim.id);
  const incoming = allEdges.filter((e) => e.to === claim.id);
  
  // ... existing weights and leverage ...
  
  // NEW METRIC 1: Keystone Score
  const keystoneScore = outgoing.length * supporters.length;
  const isKeystone = keystoneScore >= (safeModelCount * 2); // Adaptive threshold
  
  // NEW METRIC 2: Evidence Gap Score (computed separately in patterns)
  const evidenceGapScore = 0; // Placeholder, computed in detectStructuralRisks
  const isEvidenceGap = false; // Will be set in pattern detection
  
  // NEW METRIC 3: Support Skew
  const supporterCounts = supporters.reduce((acc, s) => {
    const key = typeof s === 'number' ? s : String(s);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const maxFromSingleModel = Math.max(...Object.values(supporterCounts), 0);
  const supportSkew = supporters.length > 0 ? maxFromSingleModel / supporters.length : 0;
  const isOutlier = supportSkew > 0.6 && supporters.length >= 2;
  
  return {
    id: claim.id,
    label: claim.label,
    supporters,
    type: claim.type,
    role: claim.role,
    leverage,
    leverageFactors: {
      supportWeight,
      roleWeight,
      connectivityWeight,
      positionWeight,
    },
    isLeverageInversion,
    keystoneScore,
    evidenceGapScore,
    supportSkew,
    isKeystone,
    isEvidenceGap,
    isOutlier,
  };
};
```

**3. Add Evidence Gap Detection**

Modify the pattern detection section to compute evidence gaps:
```typescript
// After computing claimsWithLeverage, add evidence gap calculation
const claimsWithLeverageAndGaps = claimsWithLeverage.map(claim => {
  const cascade = detectCascadeRisks(edges, claimMap).find(r => r.sourceId === claim.id);
  
  let evidenceGapScore = 0;
  let isEvidenceGap = false;
  
  if (cascade && claim.supporters.length > 0) {
    evidenceGapScore = cascade.dependentIds.length / claim.supporters.length;
    isEvidenceGap = evidenceGapScore > 3;
  }
  
  return {
    ...claim,
    evidenceGapScore,
    isEvidenceGap,
  };
});

// Use claimsWithLeverageAndGaps instead of claimsWithLeverage going forward
```

**4. Update Problem Structure Detection (Spec → Code)**

These snippets are specifications for how we want to evolve the current logic, not a direct copy-paste of the existing implementation. The live code in `src/core/PromptService.ts` already uses a pattern-scoring approach; we are extending that with keystone-aware metrics.

Spec: modify `detectProblemStructure` to use keystone score and structural context instead of a simple binary threshold:
```typescript
// In detectProblemStructure function, replace keystone detection:

// OLD:
const keystoneCandidates = claims.filter(c => 
  c.leverage > 6 && 
  edges.filter(e => e.from === c.id).length >= 3
);

// NEW:
const cascadeRisks = patterns.cascadeRisks || [];

const keystoneCandidates = claims
  .filter(c => c.isKeystone)
  .map(c => {
    const cascade = cascadeRisks.find(r => r.sourceId === c.id);
    const dependentCount = cascade?.dependentIds.length ?? edges.filter(e => e.from === c.id).length;
    const cascadeDepth = cascade?.depth ?? 0;
    const supportRatio = c.supporters.length / Math.max(modelCount, 1);
    const gapPenalty = c.isEvidenceGap ? 0.25 : 0;
    const skewPenalty = c.supportSkew > 0.8 ? 0.15 : 0;

    const score =
      c.keystoneScore *
      (1 + supportRatio) *
      (1 + dependentCount / 5) *
      (1 - gapPenalty - skewPenalty);

    return { claim: c, score, dependentCount, cascadeDepth };
  })
  .sort((a, b) => b.score - a.score);

const bestKeystone = keystoneCandidates[0];

if (bestKeystone && bestKeystone.score >= modelCount * 2) {
  const keystone = bestKeystone.claim;
  return {
    primaryPattern: 'keystone',
    confidence: Math.min(0.95, 0.6 + (bestKeystone.score / (bestKeystone.score + 4))),
    evidence: [
      `"${keystone.label}" has keystone score ${keystone.keystoneScore.toFixed(1)}`,
      `${bestKeystone.dependentCount} claims depend on it (cascade depth ${bestKeystone.cascadeDepth})`,
      `${keystone.supporters.length} supporters (${(keystone.supportSkew * 100).toFixed(0)}% from single model)`,
      keystone.isEvidenceGap
        ? 'Load-bearing assumption with thin evidence'
        : 'Evidence spread is adequate for its impact'
    ],
    implications: {
      understand: 'Everything hinges on the keystone. The insight IS the keystone, not the branches.',
      gauntlet: 'Test the keystone ruthlessly. If it fails, the entire structure collapses.'
    }
  };
}
```

**5. Display New Metrics in Detail View**

Add to the structural insights in DetailView:
```typescript
// In DetailView, add new insight types:

// Evidence Gap
if (claimWithLeverage?.isEvidenceGap) {
  insights.push({
    type: 'evidence_gap',
    metadata: {
      gapScore: claimWithLeverage.evidenceGapScore,
      dependentCount: cascade?.dependentIds.length,
    },
  });
}

// Support Skew Outlier
if (claimWithLeverage?.isOutlier) {
  insights.push({
    type: 'support_outlier',
    metadata: {
      skew: claimWithLeverage.supportSkew,
      supporterCount: node.supporters.length,
    },
  });
}
```

**6. Add New Insight Types to StructuralInsight Component**
```typescript
// In StructuralInsight.tsx, add new insight definitions:

const insights = {
  // ... existing insights ...
  
  evidence_gap: {
    icon: '🎯',
    title: 'Load-Bearing Assumption',
    description: `"${claim.label}" enables ${metadata?.dependentCount || 0} downstream claim(s) but has only ${claim.supporters.length} supporter(s). Evidence gap score: ${metadata?.gapScore?.toFixed(1)}. Verify carefully.`,
    color: 'red',
  },
  
  support_outlier: {
    icon: '🔍',
    title: 'Model-Specific Insight',
    description: `${Math.round((metadata?.skew || 0) * 100)}% of support for "${claim.label}" comes from a single model. Either valuable outlier or model-specific bias.`,
    color: 'blue',
  },
};

// Add blue color class:
const colorClasses = {
  // ... existing ...
  blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
};
```

### Key Improvements

**1. Keystone Detection: Before vs After**

**Before:**
```typescript
leverage > 6 && outDegree >= 3
// Binary threshold, misses claims with leverage 5.9
```

**After:**
```typescript
keystoneScore = outDegree × supporters.length
isKeystone = keystoneScore >= (modelCount × 2)
// Continuous score, adaptive threshold
```

**2. Evidence Gap: New Capability**

**Before:** No detection of dangerous assumptions

**After:**
```
Claim: "Authentication via OAuth2" (1 supporter)
→ Enables 6 downstream claims
→ Evidence gap score: 6.0
→ FLAG: "Load-bearing assumption—verify carefully"
```

**3. Support Skew: New Capability**

**Before:** No detection of false consensus or outliers

**After:**
```
Claim A: [1,2,3,4,5] → skew: 0.2 → balanced
Claim B: [2,2,2,2,2] → skew: 1.0 → single-model insight
```

### Testing Checklist

- [ ] `keystoneScore` computed correctly (outDegree × supporters.length)
- [ ] `evidenceGapScore` computed for claims with cascades
- [ ] `supportSkew` computed correctly (max count ÷ total)
- [ ] Keystone detection uses new score (not binary threshold)
- [ ] Evidence gap insights appear in detail view
- [ ] Support outlier insights appear when skew > 0.6
- [ ] New metrics visible in metrics ribbon advanced panel
- [ ] Problem structure detection improved (fewer false negatives)

</ide_agent_instructions>

Summary
Part 1 (Structural Literacy): Implement first. Highest user-facing value. Makes existing data legible.
Part 2 (New Metrics): Implement second. Adds new detection capabilities that improve both UI insights and problem structure classification.
Both parts are additive - they don't break existing functionality, just enhance it with better data and better presentation.
