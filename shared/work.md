# **Diagnosis: MapSnapshot is Not a "Miniature" — It's a Broken Reimplementation**

---

## **The Core Problem**

Your agent built **MapSnapshot** as if it were a separate graph engine, when it should be **a static preview that hints at structure**, not renders it.

### **Current Implementation (Document 6 - MapSnapshot.tsx)**
```typescript
// ❌ WRONG: Tries to be a tiny physics simulator
const cols = Math.ceil(Math.sqrt(claims.length));
const totalRows = Math.ceil(claims.length / cols);

const nodePositions = claims.map((claim, i) => {
  const row = Math.floor(i / cols);
  const col = i % cols;
  return {
    x: (col + 0.5) * (width / cols),
    y: (row + 0.5) * (height / totalRows),
    radius: 4 + supportCount * 2,
  };
});
```

**Why this fails:**
1. **Grid layout ≠ problem structure**: A keystone graph becomes a boring grid
2. **No semantic meaning**: User sees random dots, not topology
3. **Blurred/ugly**: Tries to compress detail that shouldn't exist
4. **Reimplements layout**: Should reuse existing logic from `DecisionMapGraph`

---

## **What You Actually Want**

### **Design Goal: "Constellation Hint"**

A **static, geometric abstraction** that says:
- **Linear**: ` ○ → ○ → ○ → ○ ` (sequential)
- **Keystone**: `  ○  ` with satellites around it
              `○ ● ○`
- **Contested**: `○ ⚡ ○` (two opposed clusters)
- **Tradeoff**: `○ ↔ ○` (balanced symmetry)
- **Exploratory**: `○  ○  ○` (scattered points)

**Not a graph.** A **glyph** that encodes structure.

---

## **The Correct Implementation**

### **Step 1: Kill MapSnapshot, Replace with StructureGlyph**

```typescript
// src/components/StructureGlyph.tsx

import React from "react";
import { ProblemStructure } from "../../shared/contract";

interface StructureGlyphProps {
  pattern: ProblemStructure["primaryPattern"];
  claimCount: number;
  width?: number;
  height?: number;
  onClick?: () => void;
}

const StructureGlyph: React.FC<StructureGlyphProps> = ({
  pattern,
  claimCount,
  width = 120,
  height = 80,
  onClick,
}) => {
  const cx = width / 2;
  const cy = height / 2;

  // Render pattern-specific geometry
  const renderPattern = () => {
    switch (pattern) {
      case "linear": {
        // Sequential chain
        const nodes = Math.min(claimCount, 5);
        const spacing = width / (nodes + 1);
        return (
          <>
            {Array.from({ length: nodes }).map((_, i) => {
              const x = spacing * (i + 1);
              return (
                <g key={i}>
                  <circle cx={x} cy={cy} r={4} fill="rgba(139, 92, 246, 0.6)" />
                  {i < nodes - 1 && (
                    <line
                      x1={x + 4}
                      y1={cy}
                      x2={x + spacing - 4}
                      y2={cy}
                      stroke="rgba(139, 92, 246, 0.3)"
                      strokeWidth={1.5}
                      markerEnd="url(#arrow)"
                    />
                  )}
                </g>
              );
            })}
          </>
        );
      }

      case "keystone": {
        // Center node + satellites
        const satellites = Math.min(claimCount - 1, 6);
        const radius = Math.min(width, height) * 0.3;
        return (
          <>
            {/* Center keystone */}
            <circle cx={cx} cy={cy} r={8} fill="rgba(139, 92, 246, 0.8)" />
            {/* Satellites */}
            {Array.from({ length: satellites }).map((_, i) => {
              const angle = (i / satellites) * Math.PI * 2;
              const x = cx + Math.cos(angle) * radius;
              const y = cy + Math.sin(angle) * radius;
              return (
                <g key={i}>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={x}
                    y2={y}
                    stroke="rgba(139, 92, 246, 0.2)"
                    strokeWidth={1}
                  />
                  <circle cx={x} cy={y} r={3} fill="rgba(139, 92, 246, 0.5)" />
                </g>
              );
            })}
          </>
        );
      }

      case "contested": {
        // Two opposed clusters with conflict edge
        const leftX = width * 0.25;
        const rightX = width * 0.75;
        return (
          <>
            {/* Left cluster */}
            <circle cx={leftX} cy={cy} r={6} fill="rgba(139, 92, 246, 0.6)" />
            <circle cx={leftX - 8} cy={cy - 8} r={3} fill="rgba(139, 92, 246, 0.4)" />
            <circle cx={leftX - 8} cy={cy + 8} r={3} fill="rgba(139, 92, 246, 0.4)" />
            
            {/* Conflict edge */}
            <line
              x1={leftX + 6}
              y1={cy}
              x2={rightX - 6}
              y2={cy}
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="3,2"
              markerStart="url(#arrowRed)"
              markerEnd="url(#arrowRed)"
            />
            
            {/* Right cluster */}
            <circle cx={rightX} cy={cy} r={6} fill="rgba(139, 92, 246, 0.6)" />
            <circle cx={rightX + 8} cy={cy - 8} r={3} fill="rgba(139, 92, 246, 0.4)" />
            <circle cx={rightX + 8} cy={cy + 8} r={3} fill="rgba(139, 92, 246, 0.4)" />
          </>
        );
      }

      case "tradeoff": {
        // Balanced opposition with bidirectional edge
        const leftX = width * 0.3;
        const rightX = width * 0.7;
        return (
          <>
            <circle cx={leftX} cy={cy} r={6} fill="rgba(139, 92, 246, 0.6)" />
            <line
              x1={leftX + 6}
              y1={cy}
              x2={rightX - 6}
              y2={cy}
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="2,2"
              markerStart="url(#arrowOrange)"
              markerEnd="url(#arrowOrange)"
            />
            <circle cx={rightX} cy={cy} r={6} fill="rgba(139, 92, 246, 0.6)" />
          </>
        );
      }

      case "dimensional": {
        // Grid pattern suggesting axes
        return (
          <>
            {[0.3, 0.5, 0.7].map((xRatio, i) =>
              [0.3, 0.5, 0.7].map((yRatio, j) => (
                <circle
                  key={`${i}-${j}`}
                  cx={width * xRatio}
                  cy={height * yRatio}
                  r={3}
                  fill="rgba(139, 92, 246, 0.5)"
                />
              ))
            )}
          </>
        );
      }

      case "exploratory":
      default: {
        // Scattered points
        const positions = [
          [0.2, 0.3],
          [0.5, 0.2],
          [0.7, 0.5],
          [0.3, 0.7],
          [0.8, 0.8],
        ];
        return (
          <>
            {positions.slice(0, Math.min(claimCount, 5)).map(([x, y], i) => (
              <circle
                key={i}
                cx={width * x}
                cy={height * y}
                r={3}
                fill="rgba(139, 92, 246, 0.5)"
              />
            ))}
          </>
        );
      }
    }
  };

  return (
    <div
      className="relative cursor-pointer group"
      onClick={onClick}
      title={`${pattern} structure — click to explore`}
    >
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(139, 92, 246, 0.6)" />
          </marker>
          <marker
            id="arrowRed"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
          </marker>
          <marker
            id="arrowOrange"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f97316" />
          </marker>
        </defs>
        {renderPattern()}
      </svg>
      
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
        <span className="text-xs font-medium text-brand-400">
          Click to explore →
        </span>
      </div>
    </div>
  );
};

export default StructureGlyph;
```

---

### **Step 2: Update ArtifactShowcase.tsx**

Replace the `MapSnapshot` usage:

```typescript
// OLD (Document 7, line ~395):
<MapSnapshot
  claims={graphData.claims}
  edges={graphData.edges}
  problemStructure={problemStructure}
  onClick={() => setIsDecisionMapOpen({ turnId: currentTurnId })}
  width={320}
  height={200}
/>

// NEW:
{problemStructure && (
  <div className="space-y-3">
    {/* Structure Badge */}
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-highlight/20 border border-brand-500/30">
        <span className="text-[10px] uppercase tracking-wide text-text-muted">
          Structure
        </span>
        <span className="font-semibold text-brand-400 capitalize">
          {problemStructure.primaryPattern}
        </span>
        {problemStructure.confidence < 0.7 && (
          <span className="text-amber-400 text-xs">?</span>
        )}
      </div>
      
      <span className="text-xs text-text-muted">
        {Math.round((problemStructure.confidence ?? 0) * 100)}% confidence
      </span>
    </div>

    {/* Guidance Line */}
    <div className="text-sm text-text-secondary px-4 py-2 bg-surface-highlight/10 rounded-lg border border-border-subtle/50">
      {getStructureGuidance(problemStructure.primaryPattern)}
    </div>

    {/* Structure Glyph */}
    <StructureGlyph
      pattern={problemStructure.primaryPattern}
      claimCount={graphData.claims.length}
      width={280}
      height={120}
      onClick={() => setIsDecisionMapOpen({ turnId: currentTurnId })}
    />
  </div>
)}
```

**Add helper function at top of file:**
```typescript
function getStructureGuidance(pattern: string): string {
  const guidance: Record<string, string> = {
    linear: "Follow the steps in order; one step unlocks the next.",
    keystone: "Everything hangs on one key idea.",
    contested: "Two incompatible worldviews collide here.",
    tradeoff: "You must give up X to gain Y.",
    dimensional: "The answer depends on conditions.",
    exploratory: "This is open terrain with scattered findings.",
  };
  return guidance[pattern] || guidance.exploratory;
}
```

---

### **Step 3: Remove MapSnapshot.tsx**

```bash
rm src/components/MapSnapshot.tsx
```

Update imports in files that reference it:
```typescript
// Remove this line from ArtifactShowcase.tsx:
import MapSnapshot from "../MapSnapshot";

// Add this instead:
import StructureGlyph from "../StructureGlyph";
```

---

## **Why This Works**

### **Before (MapSnapshot)**
- ❌ Tries to render actual nodes/edges in tiny space
- ❌ Grid layout destroys semantic structure
- ❌ Blurry, cramped, meaningless
- ❌ Reimplements graph logic poorly

### **After (StructureGlyph)**
- ✅ **Semantic glyphs** that encode topology
- ✅ **Pattern-specific geometry** (not generic grid)
- ✅ **Clean, crisp, intentional** visual design
- ✅ **Zero layout bugs** (static SVG)
- ✅ **Instant comprehension**: "Oh, this is a keystone problem"

---

## **Visual Comparison**

### **Current MapSnapshot Output** (Grid Hell)
```
┌─────────────────┐
│ ○  ○  ○  ○  ○  │  ← Meaningless grid
│ ○  ○  ○  ○  ○  │
│ ○  ○  ○  ○  ○  │
└─────────────────┘
```
**User reaction:** "What am I looking at?"

### **New StructureGlyph Output** (Keystone)
```
┌─────────────────┐
│     ○           │
│   ○ ● ○         │  ← Instantly recognizable
│     ○           │
└─────────────────┘
```
**User reaction:** "Oh, one central idea with branches. Got it."

---

## **Implementation Checklist**

### **Priority 1: Replace MapSnapshot**
- [ ] Create `src/components/StructureGlyph.tsx` (code above)
- [ ] Add `getStructureGuidance()` helper to `ArtifactShowcase.tsx`
- [ ] Replace `<MapSnapshot>` with new structure section
- [ ] Remove `MapSnapshot.tsx` file
- [ ] Test all 6 structure patterns render correctly

### **Priority 2: DecisionMapSheet (Document 5)**
No changes needed — it already has full graph. The inline preview was the only problem.

### **Priority 3: Ensure StructureGlyph Clickability**
Make sure `onClick={() => setIsDecisionMapOpen({ turnId })}` works from `StructureGlyph`.

---

## **Bottom Line**

**Your agent built a "miniature graph renderer" when you needed a "structure hint icon."**

The fix:
1. **Kill MapSnapshot** (grid layout disaster)
2. **Add StructureGlyph** (semantic topology glyphs)
3. **Add guidance text** (one-sentence framing)
4. **Keep it static** (no physics, no zoom, no labels)

Result: Users instantly understand **"This is a tradeoff problem"** without squinting at tiny dots.