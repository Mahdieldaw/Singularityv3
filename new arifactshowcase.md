# Artifact Showcase Redesign: Implementation Instructions

## Overview

The Artifact Showcase needs to be refactored from a flat list of consensus/outlier cards to a **Relationship Rivers** layout. The core change: graph edges (from `graph_topology`) now drive layout structure, not item type (consensus vs outlier).

**Current state:** Two separate expandable cards (ConsensusCard, OutlierCard) that users select from independently.

**Target state:** A unified view where all items (consensus + outliers) are organized by their graph relationships into: Frame Challengers → Bifurcations → Relationship Bundles → Independent Anchors.

---

## Core Principles

1. **Edges drive layout, not item type.** Whether something is consensus or outlier doesn't determine where it renders. Its graph edges do.

2. **Consensus and outliers are equals.** No visual treatment implies one is "more correct" than the other. Support count is metadata, not prominence.

3. **All items are always selectable.** Containers (DirectAnswer, DecisionTree, etc.) are previews at the top—they never replace or hide the selectable items below.

4. **Spatial grammar communicates relationships:**
   - Vertical flow = prerequisite/dependency
   - Horizontal split = conflict/choice
   - Shared container = complement/synergy
   - Standalone card = independence (no edges)

5. **Frame challengers are structurally notable**, not "better." They render first because they challenge consensus—that's a structural property worth highlighting.

---

## Data Model

### Input: What We Have

```typescript
// From MapperArtifact
interface MapperArtifact {
  consensus: {
    claims: Array<{
      text: string;
      supporters: number[];
      support_count: number;
      dimension?: string;
      applies_when?: string;
    }>;
    quality: "resolved" | "conventional" | "deflected";
    strength: number;
  };
  outliers: Array<{
    insight: string;
    source: string;
    source_index: number;
    type: "supplemental" | "frame_challenger";
    dimension?: string;
    applies_when?: string;
    challenges?: string; // What consensus claim this contradicts
  }>;
  ghost: string | null;
  // ... other fields
}

// From graph_topology (in mapping output or analysis)
interface GraphTopology {
  nodes: Array<{
    id: string;           // e.g., "opt_1"
    label: string;
    theme?: string;
    supporters: number[];
    support_count: number;
  }>;
  edges: Array<{
    source: string;       // node id
    target: string;       // node id
    type: "complements" | "prerequisite" | "conflicts" | "bifurcation";
    reason?: string;
  }>;
}
```

### Output: What We Need

```typescript
interface ProcessedShowcase {
  frameChallengers: SelectableItem[];
  bifurcations: Array<{
    left: SelectableItem;
    right: SelectableItem;
    axis?: string;        // From edge.reason
  }>;
  bundles: Array<{
    items: SelectableItem[];
    edges: GraphEdge[];   // For rendering relationship indicators
  }>;
  independentAnchors: SelectableItem[];
  ghost: string | null;
}

interface SelectableItem {
  id: string;              // "consensus-0" or "outlier-1"
  text: string;
  type: "consensus" | "supplemental" | "frame_challenger";
  dimension?: string;
  applies_when?: string;
  source?: string;         // For outliers
  challenges?: string;     // For frame_challengers
  graphNodeId?: string;    // If matched to a graph node
}
```

---

## Processing Algorithm

Create a new utility function (e.g., `processArtifactForDisplay.ts`):

```typescript
function processArtifactForDisplay(
  artifact: MapperArtifact,
  graphTopology?: GraphTopology
): ProcessedShowcase {
  const graphNodes = graphTopology?.nodes || [];
  const graphEdges = graphTopology?.edges || [];
  
  // STEP 1: Build unified item list from consensus + outliers
  const allItems: SelectableItem[] = [];
  
  artifact.consensus.claims.forEach((claim, i) => {
    allItems.push({
      id: `consensus-${i}`,
      text: claim.text,
      type: "consensus",
      dimension: claim.dimension,
      applies_when: claim.applies_when,
    });
  });
  
  artifact.outliers.forEach((outlier, i) => {
    allItems.push({
      id: `outlier-${i}`,
      text: outlier.insight,
      type: outlier.type === "frame_challenger" ? "frame_challenger" : "supplemental",
      dimension: outlier.dimension,
      applies_when: outlier.applies_when,
      source: outlier.source,
      challenges: outlier.challenges,
    });
  });
  
  // STEP 2: Match items to graph nodes
  // Use fuzzy text matching since node.label may differ from item.text
  allItems.forEach(item => {
    const matchingNode = graphNodes.find(n => 
      textSimilarity(n.label, item.text) > 0.6 // threshold TBD
    );
    if (matchingNode) {
      item.graphNodeId = matchingNode.id;
    }
  });
  
  // STEP 3: Extract frame challengers (always separate section)
  const frameChallengers = allItems.filter(i => i.type === "frame_challenger");
  const remaining = allItems.filter(i => i.type !== "frame_challenger");
  
  // STEP 4: Find conflict pairs → bifurcations
  const conflictEdges = graphEdges.filter(e => 
    e.type === "conflicts" || e.type === "bifurcation"
  );
  const bifurcations: ProcessedShowcase["bifurcations"] = [];
  const usedInConflict = new Set<string>();
  
  for (const edge of conflictEdges) {
    const left = remaining.find(i => i.graphNodeId === edge.source);
    const right = remaining.find(i => i.graphNodeId === edge.target);
    if (left && right) {
      bifurcations.push({ left, right, axis: edge.reason });
      usedInConflict.add(left.id);
      usedInConflict.add(right.id);
    }
  }
  
  // STEP 5: Find connected components → bundles
  const positiveEdges = graphEdges.filter(e => 
    e.type === "complements" || e.type === "prerequisite"
  );
  const availableForBundling = remaining.filter(i => !usedInConflict.has(i.id));
  const bundles = findConnectedComponents(availableForBundling, positiveEdges);
  
  // STEP 6: Remaining items with no edges → independent anchors
  const inBundle = new Set(bundles.flatMap(b => b.items.map(i => i.id)));
  const independentAnchors = remaining.filter(i => 
    !usedInConflict.has(i.id) && !inBundle.has(i.id)
  );
  
  return {
    frameChallengers,
    bifurcations,
    bundles,
    independentAnchors,
    ghost: artifact.ghost,
  };
}
```

### Helper: Find Connected Components

```typescript
function findConnectedComponents(
  items: SelectableItem[],
  edges: GraphEdge[]
): Array<{ items: SelectableItem[]; edges: GraphEdge[] }> {
  const itemsByNodeId = new Map(
    items.filter(i => i.graphNodeId).map(i => [i.graphNodeId!, i])
  );
  
  const visited = new Set<string>();
  const components: Array<{ items: SelectableItem[]; edges: GraphEdge[] }> = [];
  
  for (const item of items) {
    if (!item.graphNodeId || visited.has(item.graphNodeId)) continue;
    
    // BFS to find all connected items
    const component: SelectableItem[] = [];
    const componentEdges: GraphEdge[] = [];
    const queue = [item.graphNodeId];
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      
      const connectedItem = itemsByNodeId.get(nodeId);
      if (connectedItem) component.push(connectedItem);
      
      // Find connected nodes via edges
      for (const edge of edges) {
        if (edge.source === nodeId || edge.target === nodeId) {
          componentEdges.push(edge);
          const neighbor = edge.source === nodeId ? edge.target : edge.source;
          if (!visited.has(neighbor) && itemsByNodeId.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }
    }
    
    if (component.length > 1) {
      // Sort by dependency order: prerequisites first
      const sorted = sortByDependencyOrder(component, componentEdges);
      components.push({ items: sorted, edges: componentEdges });
    }
  }
  
  return components;
}
```

### Helper: Sort by Dependency Order

```typescript
function sortByDependencyOrder(
  items: SelectableItem[],
  edges: GraphEdge[]
): SelectableItem[] {
  // Topological sort: prerequisites come before dependents
  const prereqEdges = edges.filter(e => e.type === "prerequisite");
  
  // Build dependency graph
  const dependsOn = new Map<string, Set<string>>();
  items.forEach(i => {
    if (i.graphNodeId) dependsOn.set(i.graphNodeId, new Set());
  });
  
  for (const edge of prereqEdges) {
    // edge.source is prerequisite OF edge.target
    // so edge.target depends on edge.source
    const deps = dependsOn.get(edge.target);
    if (deps) deps.add(edge.source);
  }
  
  // Kahn's algorithm for topological sort
  const result: SelectableItem[] = [];
  const remaining = [...items];
  
  while (remaining.length > 0) {
    // Find item with no unprocessed dependencies
    const idx = remaining.findIndex(item => {
      if (!item.graphNodeId) return true;
      const deps = dependsOn.get(item.graphNodeId)!;
      return [...deps].every(d => 
        result.some(r => r.graphNodeId === d)
      );
    });
    
    if (idx === -1) {
      // Cycle or no dependencies - just add remaining
      result.push(...remaining);
      break;
    }
    
    result.push(remaining.splice(idx, 1)[0]);
  }
  
  return result;
}
```

---

## Component Structure

### Main Component: ArtifactShowcase

Replace the current rendering logic. The new structure:

```tsx
// ArtifactShowcase.tsx

export const ArtifactShowcase: React.FC<Props> = ({
  mapperArtifact,
  analysis,
  narrative,
  graphTopology,
  turn,
  onUnderstand,
  onDecide,
  isLoading,
}) => {
  const [selectedIds, setSelectedIds] = useAtom(selectedArtifactsAtom);
  
  // Process artifact into display structure
  const processed = useMemo(() => {
    if (!mapperArtifact) return null;
    return processArtifactForDisplay(mapperArtifact, graphTopology);
  }, [mapperArtifact, graphTopology]);
  
  const toggleSelection = (id: string) => {
    setSelectedIds(draft => {
      if (draft.has(id)) draft.delete(id);
      else draft.add(id);
    });
  };
  
  if (!mapperArtifact || !processed) {
    return <LoadingState />;
  }
  
  return (
    <div className="w-full max-w-3xl mx-auto space-y-0 pb-12">
      {/* 1. Header */}
      <ArtifactHeader 
        topology={mapperArtifact.topology}
        modelCount={mapperArtifact.model_count}
        dimensionCount={mapperArtifact.dimensions_found?.length || 0}
      />
      
      {/* 2. Souvenir */}
      {mapperArtifact.souvenir && (
        <SouvenirHeadline content={mapperArtifact.souvenir} />
      )}
      
      {/* 3. Narrative (collapsed) */}
      {narrative && <NarrativeContext narrative={narrative} />}
      
      {/* 4. Container Preview (if applicable) - NEVER hides items below */}
      {analysis?.containerType && (
        <ContainerPreview 
          containerType={analysis.containerType}
          content={analysis.containerContent}
        />
      )}
      
      {/* 5. THE RELATIONSHIP RIVERS - always visible, always selectable */}
      <div className="space-y-4 mt-6">
        {/* Frame Challengers */}
        {processed.frameChallengers.map(fc => (
          <FrameChallengerCard
            key={fc.id}
            item={fc}
            isSelected={selectedIds.has(fc.id)}
            onToggle={() => toggleSelection(fc.id)}
          />
        ))}
        
        {/* Bifurcations (conflicts) */}
        {processed.bifurcations.map((bif, i) => (
          <BifurcationSlot
            key={`bif-${i}`}
            left={bif.left}
            right={bif.right}
            axis={bif.axis}
            selectedIds={selectedIds}
            onToggle={toggleSelection}
          />
        ))}
        
        {/* Relationship Bundles */}
        {processed.bundles.map((bundle, i) => (
          <RelationshipBundle
            key={`bundle-${i}`}
            items={bundle.items}
            edges={bundle.edges}
            selectedIds={selectedIds}
            onToggle={toggleSelection}
          />
        ))}
        
        {/* Independent Anchors */}
        {processed.independentAnchors.map(item => (
          <IndependentAnchor
            key={item.id}
            item={item}
            isSelected={selectedIds.has(item.id)}
            onToggle={() => toggleSelection(item.id)}
          />
        ))}
      </div>
      
      {/* 6. Ghost */}
      {processed.ghost && <GhostDivider ghost={processed.ghost} />}
      
      {/* 7. Disclosure sections */}
      <DisclosureSection 
        dimensionCount={mapperArtifact.dimensions_found?.length}
        responseCount={Object.keys(turn?.batchResponses || {}).length}
      />
      
      {/* 8. Action Footer */}
      <ActionFooter
        selectedCount={selectedIds.size}
        onUnderstand={onUnderstand}
        onDecide={onDecide}
        isLoading={isLoading}
      />
    </div>
  );
};
```

---

## New Components to Create

### 1. FrameChallengerCard

**Location:** `ui/components/artifact/cards/FrameChallengerCard.tsx`

**Visual:** Premium card with amber/orange accent bar on left. Shows the `challenges` field prominently.

```tsx
interface FrameChallengerCardProps {
  item: SelectableItem;
  isSelected: boolean;
  onToggle: () => void;
}
```

**Key features:**
- Amber gradient background
- Left accent bar (1px wide, gradient from amber to orange)
- Checkbox for selection
- `challenges` field in a highlighted sub-box
- DimensionBadge in corner

### 2. BifurcationSlot

**Location:** `ui/components/artifact/cards/BifurcationSlot.tsx`

**Visual:** Two options side-by-side in a split container. Selecting one dims the other.

```tsx
interface BifurcationSlotProps {
  left: SelectableItem;
  right: SelectableItem;
  axis?: string;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}
```

**Key features:**
- `grid grid-cols-2` layout
- Optional axis label centered above
- Each side independently selectable
- When one is selected, the other gets `opacity-50`
- Border between the two sides

### 3. RelationshipBundle

**Location:** `ui/components/artifact/cards/RelationshipBundle.tsx`

**Visual:** Shared container with emerald accent. Items stacked vertically with relationship indicators between them.

```tsx
interface RelationshipBundleProps {
  items: SelectableItem[];
  edges: GraphEdge[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}
```

**Key features:**
- Emerald border/background tint
- Left accent bar spanning full height
- Items separated by `divide-y`
- Between items: show `↓ enables` for prerequisites, `↔` for complements
- Each item individually selectable

### 4. IndependentAnchor

**Location:** `ui/components/artifact/cards/IndependentAnchor.tsx`

**Visual:** Simple standalone card, neutral styling.

```tsx
interface IndependentAnchorProps {
  item: SelectableItem;
  isSelected: boolean;
  onToggle: () => void;
}
```

**Key features:**
- Standard card styling (surface-base, border-subtle)
- Checkbox + text + dimension badge
- No special accent (the lack of bundling IS the signal)

### 5. ContainerPreview

**Location:** `ui/components/artifact/ContainerPreview.tsx`

**Visual:** Summary box that appears ABOVE the Relationship Rivers but NEVER replaces them.

```tsx
interface ContainerPreviewProps {
  containerType: "direct_answer" | "decision_tree" | "comparison_matrix" | "exploration_space";
  content: any; // Type depends on containerType
}
```

**Key behavior:**
- Renders the appropriate preview (DirectAnswerPreview, DecisionTreePreview, etc.)
- Always includes text like "↓ See all claims below to select"
- NEVER hides or replaces the items below

### 6. Supporting Components

- **DimensionBadge:** Small muted tag showing dimension. Already exists, keep it simple.
- **SouvenirHeadline:** The 💎 one-liner at top.
- **NarrativeContext:** Collapsed `<details>` with the narrative.
- **GhostDivider:** Non-interactive void with diagonal hatch texture.
- **ArtifactHeader:** Topology badge + model count + CouncilOrbs.

---

## Files to Modify/Remove

### Remove or Deprecate:
- `ConsensusCard.tsx` — replaced by unified item rendering
- `OutlierCard.tsx` — replaced by unified item rendering
- The current container rendering logic that replaces items

### Modify:
- `ArtifactShowcase.tsx` — major refactor as described above
- Container components (DecisionTreeContainer, etc.) — convert to preview-only versions

### Create:
- `processArtifactForDisplay.ts` — the processing algorithm
- `FrameChallengerCard.tsx`
- `BifurcationSlot.tsx`
- `RelationshipBundle.tsx`
- `IndependentAnchor.tsx`
- `ContainerPreview.tsx` — wrapper that routes to preview components

---

## Critical Rules

1. **NEVER hide selectable items.** Containers are previews only.

2. **Frame challengers can participate in edges.** If a frame challenger has a `complements` or `conflicts` edge, it should still render in the Frame Challengers section at top, but the edge information could be shown as annotation.

3. **Items without graph matches become Independent Anchors.** If an item can't be matched to any graph node, it has no edges and renders standalone.

4. **Support count is quiet metadata.** Show it as small dots or a number, but it doesn't affect sizing, ordering, or visual prominence.

5. **The bifurcation dimming is interaction-based.** Only dim the other option AFTER user selects one. Don't pre-dim anything.

6. **Selection state is unified.** Use the existing `selectedArtifactsAtom` — the selected IDs should work with both old and new item ID formats.

---

## Testing Considerations

1. **No graph topology:** If `graphTopology` is undefined or empty, all items become Independent Anchors. The view should still work.

2. **No frame challengers:** Skip that section entirely if `frameChallengers.length === 0`.

3. **No bifurcations:** Skip that section if no conflict edges found.

4. **Single-item bundles:** If a component has only one item (no actual clustering), render it as an Independent Anchor instead.

5. **Large bundles:** If a bundle has 5+ items, ensure it remains scrollable/readable. May need progressive disclosure within the bundle.

---

## Visual Reference

```
┌─────────────────────────────────────────────────────────────┐
│ [dimensional]  6 models · 4 dimensions      [CouncilOrbs]   │
├─────────────────────────────────────────────────────────────┤
│ 💎 "The map transforms from a list into a proto-strategy"   │
├─────────────────────────────────────────────────────────────┤
│ 📖 THE LANDSCAPE ▸ "The territory reveals..."               │
├─────────────────────────────────────────────────────────────┤
│ ┌─ CONTAINER PREVIEW (if any) ────────────────────────────┐ │
│ │ ✓ Consensus Answer: [summary]                           │ │
│ │ ↓ See all claims below to select                        │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ⚡ [☐] Frame Challenger: "Refiner is generative..."         │
│       Challenges: structured extraction making it redundant │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────┬───────────────────────────────────┐ │
│ │ [☐] Dimensional     │ [☐] Dimension as Metadata Badge   │ │
│ │     Headers         │                                   │ │
│ └─────────────────────┴───────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ ┌─ Bundle ────────────────────────────────────────────────┐ │
│ │ [☐] Sequential Prerequisite Flow                       │ │
│ │     ↔                                                   │ │
│ │ [☐] Relational Clusters                                 │ │
│ │     ↔                                                   │ │
│ │ [☐] Selection Radiance                                  │ │
│ └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ [☐] Independent Anchor: Some standalone option              │
├─────────────────────────────────────────────────────────────┤
│ 👻 The Ghost — The Unaddressed Path                         │
│ ░░ [ghost text] ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
├─────────────────────────────────────────────────────────────┤
│ ▸ View by dimension (4)                                     │
│ ▸ Raw responses (6)                                         │
├─────────────────────────────────────────────────────────────┤
│ [Model ▾]  3 selected   [🧠 Understand] [⚡ Decide]          │
└─────────────────────────────────────────────────────────────┘
```