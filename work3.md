# V3.1 UI Updates

## Summary of Changes Needed

| Component | Change |
|-----------|--------|
| `shared/contract.ts` | Add `settled` pattern, export new types |
| `DecisionMapGraph.tsx` | Use computed graph analysis, add visual indicators |
| `StructuralInsight.tsx` | Add new insight types, update terminology |
| New: `RatiosPanel.tsx` | Display the 5 core ratios |

---

## 1. Update `shared/contract.ts`

```typescript
// Add to existing types

export interface CoreRatios {
  concentration: number;      // Max support / modelCount (0-1)
  alignment: number;          // Reinforcing edges between top claims (0-1)
  tension: number;            // Conflict + tradeoff edges / total (0-1)
  fragmentation: number;      // Disconnected components (0-1)
  depth: number;              // Longest chain / claim count (0-1)
}

export interface GraphAnalysis {
  componentCount: number;
  components: string[][];
  longestChain: string[];
  chainCount: number;
  hubClaim: string | null;
  hubDominance: number;
}

// Update ProblemStructure - add 'settled'
export interface ProblemStructure {
  primaryPattern: "linear" | "dimensional" | "tradeoff" | "contested" | "exploratory" | "keystone" | "settled";
  confidence: number;
  evidence: string[];
  implications: {
    understand: string;
    gauntlet: string;
  };
}

// Update Claim to match V3.1 EnrichedClaim fields available to UI
export interface EnrichedClaim extends Claim {
  supportRatio: number;
  isHighSupport: boolean;
  leverage: number;
  keystoneScore: number;
  evidenceGapScore: number;
  supportSkew: number;
  isLeverageInversion: boolean;
  isKeystone: boolean;
  isEvidenceGap: boolean;
  isOutlier: boolean;
  isContested: boolean;
  isConditional: boolean;
  isChallenger: boolean;
  isIsolated: boolean;
  inDegree: number;
  outDegree: number;
  chainDepth: number;
  isChainRoot: boolean;
  isChainTerminal: boolean;
}
```

---

## 2. Update `DecisionMapGraph.tsx`

### Add Props for V3.1 Data

```typescript
interface Props {
    claims: Claim[];
    edges: Edge[];
    problemStructure?: ProblemStructure;
    // NEW: V3.1 graph analysis
    graphAnalysis?: GraphAnalysis;
    enrichedClaims?: EnrichedClaim[];
    citationSourceOrder?: Record<number, string>;
    onNodeClick?: (node: GraphNode) => void;
    selectedClaimIds?: string[];
    width?: number;
    height?: number;
}
```

### Use Pre-computed Hub and Chain

Replace `pickKeystoneId` with the pre-computed value:

```typescript
// BEFORE (computing keystone ourselves)
const keystoneId = pickKeystoneId(provisionalNodes, inputEdges);

// AFTER (use pre-computed from V3.1)
const keystoneId = graphAnalysis?.hubClaim || null;
```

Replace `computePrereqDepths` with pre-computed chain:

```typescript
// BEFORE
const depths = computePrereqDepths(nodeIds, inputEdges);

// AFTER - use graphAnalysis.longestChain for ordering
const longestChain = graphAnalysis?.longestChain || [];
const chainPositions = new Map<string, number>();
longestChain.forEach((id, idx) => chainPositions.set(id, idx));

// For linear layout, use chain position
if (problemStructure?.primaryPattern === 'linear' && longestChain.length > 0) {
    const maxPos = longestChain.length - 1;
    longestChain.forEach((id, idx) => {
        const y = padding + (maxPos === 0 ? usableH / 2 : (idx / maxPos) * usableH);
        targets.set(id, { x: width / 2, y });
    });
    
    // Position non-chain nodes off to the side
    nodeIds.filter(id => !chainPositions.has(id)).forEach((id, idx) => {
        targets.set(id, { 
            x: padding + 50, 
            y: padding + (idx / Math.max(1, nodeIds.length - longestChain.length)) * usableH 
        });
    });
}
```

### Add `settled` Pattern Layout

```typescript
// Add to the layout logic
if (problemStructure?.primaryPattern === 'settled') {
    // Settled = high agreement, cluster tightly in center
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(usableW, usableH) * 0.25;
    
    nodeIds.forEach((id, idx) => {
        const angle = (idx / nodeIds.length) * Math.PI * 2;
        targets.set(id, {
            x: centerX + Math.cos(angle) * radius * 0.5,
            y: centerY + Math.sin(angle) * radius * 0.5,
        });
    });
}
```

### Visual Indicators for V3.1 Flags

Update node rendering to show new flags:

```typescript
// In the nodes rendering section
{nodes.map(node => {
    const x = node.x || 0;
    const y = node.y || 0;
    const radius = getNodeRadius(node.support_count);
    const isHovered = hoveredNode === node.id;
    const isSelected = Array.isArray(selectedClaimIds) && selectedClaimIds.includes(node.id);
    
    // Find enriched data for this node
    const enriched = enrichedClaims?.find(c => c.id === node.id);
    
    // Determine color based on V3.1 flags
    const color = enriched?.isKeystone ? '#8b5cf6' :     // Purple for keystone
                  enriched?.isChallenger ? '#f59e0b' :    // Amber for challenger
                  enriched?.isEvidenceGap ? '#ef4444' :   // Red for evidence gap
                  enriched?.isHighSupport ? '#3b82f6' :   // Blue for high support
                  '#6b7280';                               // Gray for others
    
    // Show warning indicator for risky nodes
    const showWarning = enriched?.isEvidenceGap || enriched?.isLeverageInversion;
    
    return (
        <g key={node.id} /* ... existing props ... */>
            {/* Existing node rendering */}
            
            {/* NEW: Warning indicator for evidence gaps / leverage inversions */}
            {showWarning && (
                <g transform={`translate(${-radius * 0.6}, ${-radius * 0.6})`}>
                    <circle r={8} fill="#ef4444" stroke="#fff" strokeWidth={1} />
                    <text 
                        textAnchor="middle" 
                        dy={4} 
                        fill="#fff" 
                        fontSize={10} 
                        fontWeight="bold"
                    >
                        !
                    </text>
                </g>
            )}
            
            {/* NEW: Keystone crown indicator */}
            {enriched?.isKeystone && (
                <text 
                    y={-radius - 8} 
                    textAnchor="middle" 
                    fontSize={14}
                >
                    👑
                </text>
            )}
            
            {/* NEW: Chain position indicator for linear patterns */}
            {problemStructure?.primaryPattern === 'linear' && enriched?.chainDepth !== undefined && (
                <text 
                    y={-radius - 6} 
                    textAnchor="middle" 
                    fill="rgba(255,255,255,0.6)" 
                    fontSize={9}
                >
                    Step {enriched.chainDepth + 1}
                </text>
            )}
            
            {/* Existing support count badge, labels, etc. */}
        </g>
    );
})}
```

### Color Components Differently (Optional)

```typescript
// If you want to visually distinguish disconnected components
const getComponentColor = (claimId: string): string => {
    if (!graphAnalysis?.components) return 'transparent';
    
    const componentColors = [
        'rgba(59, 130, 246, 0.1)',   // Blue
        'rgba(16, 185, 129, 0.1)',   // Green
        'rgba(245, 158, 11, 0.1)',   // Amber
        'rgba(139, 92, 246, 0.1)',   // Purple
    ];
    
    const componentIdx = graphAnalysis.components.findIndex(c => c.includes(claimId));
    return componentColors[componentIdx % componentColors.length];
};

// Then add background circles per component if fragmentation > 0
{graphAnalysis?.componentCount > 1 && graphAnalysis.components.map((component, idx) => {
    // Calculate bounding box for this component
    const componentNodes = nodes.filter(n => component.includes(n.id));
    if (componentNodes.length === 0) return null;
    
    const xs = componentNodes.map(n => n.x || 0);
    const ys = componentNodes.map(n => n.y || 0);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const radius = Math.max(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys)
    ) / 2 + 60;
    
    return (
        <circle
            key={`component-${idx}`}
            cx={centerX}
            cy={centerY}
            r={radius}
            fill={componentColors[idx % componentColors.length]}
            stroke={componentColors[idx % componentColors.length].replace('0.1', '0.3')}
            strokeWidth={1}
            strokeDasharray="4,4"
        />
    );
})}
```

---

## 3. Update `StructuralInsight.tsx`

### Add New Insight Types

```typescript
interface StructuralInsightProps {
  type:
    | "fragile_foundation"
    | "keystone"
    | "consensus_conflict"    // Keep but rename internally to "high_support_conflict"
    | "high_leverage_singular"
    | "cascade_risk"
    | "evidence_gap"
    | "support_outlier"
    // NEW V3.1 types
    | "leverage_inversion"
    | "challenger_threat"
    | "orphan"
    | "chain_root"
    | "hub_dominance";
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
    gapScore?: number;
    skew?: number;
    supporterCount?: number;
    // NEW V3.1 metadata
    supportRatio?: number;
    inversionReason?: "challenger_prerequisite_to_consensus" | "singular_foundation" | "high_connectivity_low_support";
    hubDominance?: number;
    chainLength?: number;
  };
}

export const StructuralInsight: React.FC<StructuralInsightProps> = ({
  type,
  claim,
  metadata,
}) => {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  
  const insights = {
    fragile_foundation: {
      icon: "⚠️",
      title: "Fragile Foundation",
      description: `Only ${pct(metadata?.supportRatio || 0)} support, but ${
        metadata?.dependentCount || 0
      } claim(s) depend on "${claim.label}". High impact if wrong.`,
      color: "amber" as const,
    },
    keystone: {
      icon: "👑",
      title: "Keystone Claim",
      description: `"${claim.label}" is the structural hub—${
        metadata?.dependentCount || 0
      } other claim(s) build on this.${
        metadata?.hubDominance ? ` Dominance: ${metadata.hubDominance.toFixed(1)}x.` : ''
      }`,
      color: "purple" as const,
    },
    consensus_conflict: {
      icon: "⚡",
      title: "High-Support Conflict",
      description: `"${claim.label}" conflicts with "${
        metadata?.conflictsWith || "another claim"
      }". Both are in the top 30% by support—fundamental disagreement.`,
      color: "red" as const,
    },
    high_leverage_singular: {
      icon: "💎",
      title: "Overlooked Insight",
      description: `"${claim.label}" has low support (${pct(metadata?.supportRatio || 0)}) but high structural importance (leverage: ${
        metadata?.leverageScore?.toFixed(1) || "?"
      }). May contain what others missed.`,
      color: "indigo" as const,
    },
    cascade_risk: {
      icon: "⛓️",
      title: "Cascade Risk",
      description: `Eliminating "${claim.label}" cascades through ${
        metadata?.dependentCount || 0
      } claim(s) across ${metadata?.cascadeDepth || 0} level(s).`,
      color: "orange" as const,
    },
    evidence_gap: {
      icon: "🎯",
      title: "Load-Bearing Assumption",
      description: `"${claim.label}" enables ${
        metadata?.dependentCount || 0
      } downstream claims but has only ${pct(metadata?.supportRatio || 0)} support. Gap score: ${
        metadata?.gapScore?.toFixed(1) || "?"
      }.`,
      color: "red" as const,
    },
    support_outlier: {
      icon: "🔍",
      title: "Model-Specific Insight",
      description: `${pct(metadata?.skew || 0)} of support for "${claim.label}" comes from one model. Either valuable outlier or bias.`,
      color: "blue" as const,
    },
    // NEW V3.1 TYPES
    leverage_inversion: {
      icon: "🔄",
      title: "Leverage Inversion",
      description: (() => {
        const reason = metadata?.inversionReason;
        if (reason === "challenger_prerequisite_to_consensus") {
          return `"${claim.label}" is a challenger that high-support claims depend on. The floor may rest on contested ground.`;
        }
        if (reason === "singular_foundation") {
          return `"${claim.label}" enables ${metadata?.dependentCount || 0} claims with minimal support. Single point of failure.`;
        }
        return `"${claim.label}" has high connectivity but low support. Structural importance exceeds evidential backing.`;
      })(),
      color: "amber" as const,
    },
    challenger_threat: {
      icon: "⚔️",
      title: "Challenger Threat",
      description: `"${claim.label}" questions the premise with only ${pct(metadata?.supportRatio || 0)} support. May be noise—or the key insight.`,
      color: "orange" as const,
    },
    orphan: {
      icon: "🏝️",
      title: "Isolated Claim",
      description: `"${claim.label}" has no connections to other claims. May be tangential or an unexplored dimension.`,
      color: "gray" as const,
    },
    chain_root: {
      icon: "🌱",
      title: "Chain Root",
      description: `"${claim.label}" is the start of a ${metadata?.chainLength || 0}-step prerequisite chain. Everything downstream depends on this.`,
      color: "green" as const,
    },
    hub_dominance: {
      icon: "🎯",
      title: "Dominant Hub",
      description: `"${claim.label}" has ${metadata?.hubDominance?.toFixed(1) || "?"}x more outgoing connections than the next claim. This is the structural center.`,
      color: "purple" as const,
    },
  } as const;

  const insight = insights[type];

  const colorClasses: Record<string, string> = {
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-400",
    purple: "bg-purple-500/10 border-purple-500/30 text-purple-400",
    red: "bg-red-500/10 border-red-500/30 text-red-400",
    indigo: "bg-indigo-500/10 border-indigo-500/30 text-indigo-400",
    orange: "bg-orange-500/10 border-orange-500/30 text-orange-400",
    blue: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    green: "bg-green-500/10 border-green-500/30 text-green-400",
    gray: "bg-gray-500/10 border-gray-500/30 text-gray-400",
  };

  return (
    <div className={`flex gap-2 p-3 rounded-lg border ${colorClasses[insight.color]}`}>
      <span className="text-lg flex-shrink-0">{insight.icon}</span>
      <div className="min-w-0">
        <div className="font-semibold text-sm mb-1">{insight.title}</div>
        <div className="text-xs opacity-90 leading-relaxed">
          {insight.description}
        </div>
        {metadata?.dependentLabels && metadata.dependentLabels.length > 0 && (
          <div className="mt-2 text-[10px] opacity-70">
            <span className="font-medium">Affects:</span>{" "}
            {metadata.dependentLabels.slice(0, 3).join(", ")}
            {metadata.dependentLabels.length > 3 &&
              ` +${metadata.dependentLabels.length - 3} more`}
          </div>
        )}
      </div>
    </div>
  );
};
```

---

## 4. New Component: `RatiosPanel.tsx`

```typescript
import React from 'react';
import { CoreRatios, GraphAnalysis, ProblemStructure } from '../../shared/contract';

interface RatiosPanelProps {
  ratios: CoreRatios;
  graph: GraphAnalysis;
  pattern: ProblemStructure;
  claimCount: number;
}

const RatioBar: React.FC<{ 
  label: string; 
  value: number; 
  color: string;
  description: string;
}> = ({ label, value, color, description }) => (
  <div className="mb-3">
    <div className="flex justify-between text-xs mb-1">
      <span className="text-gray-400">{label}</span>
      <span className="text-white font-medium">{Math.round(value * 100)}%</span>
    </div>
    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
      <div 
        className="h-full rounded-full transition-all duration-500"
        style={{ 
          width: `${Math.round(value * 100)}%`,
          backgroundColor: color 
        }}
      />
    </div>
    <div className="text-[10px] text-gray-500 mt-0.5">{description}</div>
  </div>
);

export const RatiosPanel: React.FC<RatiosPanelProps> = ({ 
  ratios, 
  graph, 
  pattern,
  claimCount 
}) => {
  const { concentration, alignment, tension, fragmentation, depth } = ratios;
  
  return (
    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Structural Ratios</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          pattern.primaryPattern === 'settled' ? 'bg-green-500/20 text-green-400' :
          pattern.primaryPattern === 'contested' ? 'bg-red-500/20 text-red-400' :
          pattern.primaryPattern === 'keystone' ? 'bg-purple-500/20 text-purple-400' :
          pattern.primaryPattern === 'linear' ? 'bg-blue-500/20 text-blue-400' :
          'bg-gray-500/20 text-gray-400'
        }`}>
          {pattern.primaryPattern.toUpperCase()}
        </span>
      </div>
      
      <RatioBar 
        label="Concentration" 
        value={concentration}
        color="#3b82f6"
        description="How focused support is on top claims"
      />
      
      <RatioBar 
        label="Alignment" 
        value={alignment}
        color="#10b981"
        description="How much top claims reinforce each other"
      />
      
      <RatioBar 
        label="Tension" 
        value={tension}
        color="#ef4444"
        description="Proportion of conflict/tradeoff edges"
      />
      
      <RatioBar 
        label="Fragmentation" 
        value={fragmentation}
        color="#f59e0b"
        description="How disconnected the graph is"
      />
      
      <RatioBar 
        label="Depth" 
        value={depth}
        color="#8b5cf6"
        description="Longest chain relative to total claims"
      />
      
      {/* Graph Summary */}
      <div className="mt-4 pt-4 border-t border-gray-800">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-500">Components</span>
            <span className="text-white">{graph.componentCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Longest Chain</span>
            <span className="text-white">{graph.longestChain.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Chain Count</span>
            <span className="text-white">{graph.chainCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Hub Dominance</span>
            <span className="text-white">
              {graph.hubClaim ? `${graph.hubDominance.toFixed(1)}x` : '—'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Confidence */}
      <div className="mt-4 pt-4 border-t border-gray-800">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Pattern Confidence</span>
          <span className="text-white font-medium">{Math.round(pattern.confidence * 100)}%</span>
        </div>
        <div className="mt-2 text-[10px] text-gray-500 italic">
          {pattern.implications.understand}
        </div>
      </div>
    </div>
  );
};
```

---

## 5. Generate Insights from V3.1 Analysis

Create a function to produce `StructuralInsight` entries from the V3.1 analysis:

```typescript
// utils/generateInsightsFromAnalysis.ts

import { 
  EnrichedClaim, 
  GraphAnalysis, 
  CascadeRisk, 
  ConflictPair, 
  LeverageInversion 
} from '../../shared/contract';

interface InsightData {
  type: string;
  claim: { label: string; supporters: number[] };
  metadata: Record<string, any>;
}

export function generateInsightsFromAnalysis(
  claims: EnrichedClaim[],
  patterns: {
    leverageInversions: LeverageInversion[];
    cascadeRisks: CascadeRisk[];
    conflicts: ConflictPair[];
  },
  graph: GraphAnalysis
): InsightData[] {
  const insights: InsightData[] = [];
  
  // Keystone / Hub
  if (graph.hubClaim) {
    const hub = claims.find(c => c.id === graph.hubClaim);
    if (hub) {
      insights.push({
        type: 'keystone',
        claim: { label: hub.label, supporters: hub.supporters },
        metadata: {
          dependentCount: hub.outDegree,
          hubDominance: graph.hubDominance,
          supportRatio: hub.supportRatio,
        }
      });
    }
  }
  
  // Leverage Inversions
  for (const inv of patterns.leverageInversions) {
    const claim = claims.find(c => c.id === inv.claimId);
    if (claim) {
      insights.push({
        type: 'leverage_inversion',
        claim: { label: claim.label, supporters: claim.supporters },
        metadata: {
          supportRatio: claim.supportRatio,
          inversionReason: inv.reason,
          dependentCount: inv.affectedClaims.length,
          leverageScore: claim.leverage,
        }
      });
    }
  }
  
  // Evidence Gaps
  for (const claim of claims.filter(c => c.isEvidenceGap)) {
    const cascade = patterns.cascadeRisks.find(r => r.sourceId === claim.id);
    insights.push({
      type: 'evidence_gap',
      claim: { label: claim.label, supporters: claim.supporters },
      metadata: {
        supportRatio: claim.supportRatio,
        gapScore: claim.evidenceGapScore,
        dependentCount: cascade?.dependentIds.length || 0,
        dependentLabels: cascade?.dependentLabels || [],
      }
    });
  }
  
  // High-Support Conflicts
  for (const conflict of patterns.conflicts.filter(c => c.isBothConsensus)) {
    insights.push({
      type: 'consensus_conflict',
      claim: { label: conflict.claimA.label, supporters: [] },
      metadata: {
        conflictsWith: conflict.claimB.label,
      }
    });
  }
  
  // Challengers
  for (const claim of claims.filter(c => c.isChallenger)) {
    insights.push({
      type: 'challenger_threat',
      claim: { label: claim.label, supporters: claim.supporters },
      metadata: {
        supportRatio: claim.supportRatio,
      }
    });
  }
  
  // Orphans (isolated claims)
  for (const claim of claims.filter(c => c.isIsolated)) {
    insights.push({
      type: 'orphan',
      claim: { label: claim.label, supporters: claim.supporters },
      metadata: {}
    });
  }
  
  // Chain Roots
  const chainRoots = claims.filter(c => c.isChainRoot);
  if (graph.longestChain.length >= 3) {
    for (const root of chainRoots.filter(c => graph.longestChain[0] === c.id)) {
      insights.push({
        type: 'chain_root',
        claim: { label: root.label, supporters: root.supporters },
        metadata: {
          chainLength: graph.longestChain.length,
        }
      });
    }
  }
  
  // Cascade Risks (deep ones)
  for (const risk of patterns.cascadeRisks.filter(r => r.depth >= 3)) {
    const claim = claims.find(c => c.id === risk.sourceId);
    if (claim) {
      insights.push({
        type: 'cascade_risk',
        claim: { label: claim.label, supporters: claim.supporters },
        metadata: {
          dependentCount: risk.dependentIds.length,
          cascadeDepth: risk.depth,
          dependentLabels: risk.dependentLabels,
        }
      });
    }
  }
  
  // Support Outliers
  for (const claim of claims.filter(c => c.isOutlier)) {
    insights.push({
      type: 'support_outlier',
      claim: { label: claim.label, supporters: claim.supporters },
      metadata: {
        skew: claim.supportSkew,
        supportRatio: claim.supportRatio,
      }
    });
  }
  
  return insights;
}
```

---

## Summary Checklist

```
□ Update shared/contract.ts with new types
□ Add 'settled' pattern handling to DecisionMapGraph
□ Replace pickKeystoneId with graphAnalysis.hubClaim
□ Replace computePrereqDepths with graphAnalysis.longestChain
□ Add visual indicators for isKeystone, isEvidenceGap, isChallenger
□ Update StructuralInsight with new insight types
□ Add RatiosPanel component
□ Create generateInsightsFromAnalysis utility
□ Wire up enrichedClaims and graphAnalysis as props
□ Update terminology from "consensus" to "high-support"
```