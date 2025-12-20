## Overview

Update the synthesis bubble to:

1. Move council orbs between short and long answer
2. Add decision map button and risk badge to orb strip
3. Connect new refiner output structure to UI
4. Update trust panel with new meta fields

---

## New Refiner Output Structure

The refiner now outputs this structure:

TypeScript

```
interface RefinerOutput {
  signals: Array<{
    type: "divergence" | "overclaim" | "gap" | "blindspot";
    priority: "blocker" | "risk" | "enhancement";
    content: string;
    source: string;
    impact: string;
  }>;
  
  unlistedOptions: Array<{
    title: string;
    description: string;
    source: string;
  }>;
  
  nextStep: {
    action: "proceed" | "verify" | "reframe" | "research";
    target: string;
    why: string;
  };
  
  reframe: {
    issue: string;
    suggestion: string;
    unlocks: string;
  } | null;
  
  meta: {
    reliabilitySummary: string;
    biggestRisk: string;
    strategicPattern: string | null;
    honestAssessment: string;
  };
}
```

---

```

---

## Synthesis Bubble Layout

New structure:

text

```
┌──────────────────────────────────────────────────────┐
│ ⛔ Cannot proceed without:          ← BLOCKER BANNER │
│    • [blocker signal]                  (if any)     │
├──────────────────────────────────────────────────────┤
│                                                      │
│  [SHORT ANSWER]                                      │
│  1-2 paragraphs, always above fold                   │
│                                                      │
├──────────────────────────────────────────────────────┤
│               📊    🔍³              │
│                map  trust           │
├──────────────────────────────────────────────────────┤
│                                                      │
│  [LONG ANSWER]                                       │
│  Full reasoning, scrollable                          │
│                                                      │
├──────────────────────────────────────────────────────┤
│  → Verify: [target]                ← NEXT STEP       │
│    [why]                                             │
└──────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────┐
│  ◉ ◉ ◉ 👑 ◉ ◉                                             ⚡    │
│  └─ orbs ────┘                                   
│                                                                         redo   │
└──────────────────────────────────────────────────────┘

```

---

## Part 1: Blocker Banner

**Location:** Above short answer (top of synthesis bubble)

**Visibility:** Only if `blockerSignals.length > 0`

**Design:**

text

```
┌──────────────────────────────────────────────────────┐
│ ⛔ Cannot proceed without:                           │
│                                                      │
│ • [signal.content]                                   │
│   [signal.source]                               [→]  │
│                                                      │
│ • [another blocker if exists]                   [→]  │
└──────────────────────────────────────────────────────┘
```

**Styling:**

- Background: Red subtle
- Left border: 3px solid red
- Border radius: 6px
- Padding: 12px 16px

**Behavior:**

- Each signal row is clickable
- Click → Opens trust panel scrolled to that signal

---
### Part 2: Refiner Controls Strip (New)

**Location:** Between short answer and long answer

**Contains:**

- Decision map button (`📊`)
- Trust icon with badge (`🔍³`)

**Does NOT contain:**

- Council orbs (stay at bottom)
- Recompute button (stays with orbs)

**Layout:**

text

```
┌──────────────────────────────────────────────────────┐
│                      📊 Map    🔍³ Trust             │
└──────────────────────────────────────────────────────┘
```

**CSS:**

CSS

```
.refiner-strip {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 12px 0;
  border-top: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
  margin: 16px 0;
}

.refiner-strip-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--surface-subtle);
  border-radius: 16px;
  cursor: pointer;
  font-size: 13px;
}

.refiner-strip-button:hover {
  background: var(--surface-hover);
}
```

---

## What Stays Unchanged

|Element|Status|
|---|---|
|Council orbs position|Unchanged — bottom of bubble|
|Orb click behavior|Unchanged — opens split pane|
|Recompute button position|Unchanged — with orbs|
|Invisible strip click|Remove — replaced by explicit map button|

---

## Benefits

1. **Less disruption** — Orbs stay where users expect them
2. **Clear separation** — Model responses (orbs) vs refiner analysis (new strip)
3. **Simpler change** — Just adding one new element, not relocating existing ones
4. **Logical grouping** — Recompute stays with orbs (it reruns models, not refiner)
## Part 2: Orb Strip Relocation


---

## Part 3: Orb Strip Elements


### 3B: Decision Map Button (new)

**Icon:** `📊` (or similar graph icon from your design system)

**Behavior:**

- Click → Opens decision map sheet
- Replaces the invisible strip click behavior

**Styling:**

CSS

```
.map-button {
  padding: 6px;
  background: var(--surface-subtle);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.map-button:hover {
  background: var(--surface-hover);
}
```

### 3C: Trust Icon with Badge (updated)

**Icon:** `🔍` (or existing trust icon)

**Badge logic:**

TypeScript

```
function getTrustBadge(signals: Signal[]) {
  const { blockerSignals, riskSignals } = categorizeSignals(signals);
  
  if (blockerSignals.length > 0) {
    return { count: blockerSignals.length, type: 'blocker' };
  }
  
  if (riskSignals.length > 0) {
    return { count: riskSignals.length, type: 'risk' };
  }
  
  return null;
}
```

**Display states:**

|State|Display|
|---|---|
|No signals|`🔍` (no badge)|
|Has risks|`🔍` with amber badge showing count|
|Has blockers|`🔍` with red badge showing count|
|Loading|`🔍` with subtle pulse animation|

**Behavior:**

- Click → Opens trust panel

**Badge styling:**

CSS

```
.trust-icon-container {
  position: relative;
  cursor: pointer;
}

.trust-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.trust-badge--risk {
  background: var(--amber);
}

.trust-badge--blocker {
  background: var(--red);
}

.trust-badge--loading {
  background: var(--gray);
  animation: pulse 1.5s infinite;
}
```

### 3D: Recompute Button (existing)

Keep existing `⚡` button and behavior.

---

## Part 4: NextStepFooter Component update with colors

**Location:** Bottom of synthesis bubble, after long answer

**Props:**

TypeScript

```
interface NextStepFooterProps {
  nextStep: {
    action: "proceed" | "verify" | "reframe" | "research";
    target: string;
    why: string;
  } | null;
  isLoading?: boolean;
}
```

**Design:**

text

```
┌──────────────────────────────────────────────────────┐
│ → Verify: Your budget constraints and timeline       │
│   Core recommendation depends on resources assumed   │
└──────────────────────────────────────────────────────┘
```

**Action word styling:**

|Action|Color|
|---|---|
|proceed|Green|
|verify|Amber|
|reframe|Blue|
|research|Purple|

**CSS:**

CSS

```
.next-step-footer {
  padding: 12px 16px;
  background: var(--surface-subtle);
  border-left: 3px solid var(--accent);
  border-radius: 0 6px 6px 0;
  margin-top: 16px;
}

.next-step-action {
  font-weight: 600;
}

.next-step-target {
  font-weight: 400;
}

.next-step-why {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}
```

**Loading state:**

text

```
┌──────────────────────────────────────────────────────┐
│ → ...                                                │
└──────────────────────────────────────────────────────┘
```

---

## Part 5: Trust Panel Updates

### Structure

text

```
┌─────────────────────────────────────────────────────┐
│ TRUST PANEL                                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Risks (3)                       ← if riskSignals    │
│ ┌─────────────────────────────────────────────────┐ │
│ │ [SignalCard - risk 1]                           │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ [SignalCard - risk 2]                           │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ [SignalCard - risk 3]                           │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Additional Context (4)          ← enhancementSignals│
│ ┌─────────────────────────────────────────────────┐ │
│ │ [SignalCard - enhancement 1]                    │ │
│ ├─────────────────────────────────────────────────┤ │
│ │ [SignalCard - enhancement 2]                    │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
├─────────────────────────────────────────────────────┤
│ 
├─────────────────────────────────────────────────────┤
│                                                     │
│ Refiner's Take                  ← meta (NEW)        │
│ ┌─────────────────────────────────────────────────┐ │
│ │                                                 │ │
│ │ [meta.reliabilitySummary]                       │ │
│ │ Full paragraph text...                          │ │
│ │                                                 │ │
│ ├─────────────────────────────────────────────────┤ │
│ │                                                 │ │
│ │ Strategic Pattern            ← if not null      │ │
│ │ [meta.strategicPattern]                         │ │
│ │ Full paragraph text...                          │ │
│ │                                                 │ │
│ ├─────────────────────────────────────────────────┤ │
│ │                                                 │ │
│ │ Biggest Risk                                    │ │
│ │ [meta.biggestRisk]                              │ │
│ │                                                 │ │
│ ├─────────────────────────────────────────────────┤ │
│ │                                                 │ │
│ │ Honest Assessment                               │ │
│ │ [meta.honestAssessment]                         │ │
│ │                                                 │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
├─────────────────────────────────────────────────────┤
│ ▶ Raw Output (Debug - collapsed)                   │
└─────────────────────────────────────────────────────┘
```

### Section Visibility

|Section|Show When|
|---|---|
|Risks|`riskSignals.length > 0`|
|Additional Context|`enhancementSignals.length > 0`|
|Refiner's Take|Always (meta always present)|
|Raw Output|Always (collapsed by default)|

---

## Part 6: SignalCard Component

Reusable component for displaying any signal.

**Props:**

TypeScript

```
interface SignalCardProps {
  signal: {
    type: "divergence" | "overclaim" | "gap" | "blindspot";
    priority: "blocker" | "risk" | "enhancement";
    content: string;
    source: string;
    impact: string;
  };
  onClick?: () => void;
}
```

**Design:**

text

```
┌─────────────────────────────────────────────────────┐
│ ⚠️ Models disagreed                    ← type label │
│                                                     │
│ [content text]                                      │
│                                                     │
│ → [impact text]                                     │
│                                                     │
│ Source: [source]                              [→]   │
└─────────────────────────────────────────────────────┘
```

**Type labels:**

|Type|Icon|Label|
|---|---|---|
|divergence|⚠️|"Models disagreed"|
|overclaim|⚠️|"May be overstated"|
|gap|💡|"Context dropped"|
|blindspot|🕳|"Not addressed"|

**Priority colors:**

|Priority|Background|Border|
|---|---|---|
|blocker|Red subtle|Red|
|risk|Amber subtle|Amber|
|enhancement|Blue subtle|Blue|

**CSS:**

CSS

```
.signal-card {
  padding: 12px 16px;
  border-radius: 6px;
  border-left: 3px solid;
  cursor: pointer;
}

.signal-card--blocker {
  background: var(--red-subtle);
  border-color: var(--red);
}

.signal-card--risk {
  background: var(--amber-subtle);
  border-color: var(--amber);
}

.signal-card--enhancement {
  background: var(--blue-subtle);
  border-color: var(--blue);
}

.signal-card-type {
  font-weight: 500;
  font-size: 13px;
  margin-bottom: 8px;
}

.signal-card-content {
  font-size: 14px;
  margin-bottom: 8px;
}

.signal-card-impact {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.signal-card-source {
  font-size: 12px;
  color: var(--text-tertiary);
  display: flex;
  justify-content: space-between;
}
```

**Behavior:**

- Click → Opens split pane to source model (if source is specific model)
- Click → Scrolls to relevant section (if source is "all" or "none")

---

## Part 7: ReframeBanner Updates

Update existing ReframingBanner to use new prop structure.

**Old props:**

TypeScript

```
{
  issue: string;
  betterQuestion: string;  // OLD
  unlocks: string;
}
```

**New props:**

TypeScript

```
{
  issue: string;
  suggestion: string;  // NEW - renamed
  unlocks: string;
}
```

**Change:** Rename `betterQuestion` to `suggestion` throughout component.

**Location:** Above blocker banner (very top of synthesis bubble if present)

---

## Part 8: Parser Updates double check old signals no changes, add new

Update the refiner output parser to extract new structure.

**Keep:** Dual-mode parsing (JSON detection + freeform text extraction)

**New fields to extract:**

|Field|Type|Required|
|---|---|---|
|signals|Array|Yes (can be empty)|
|signals[].type|String|Yes|
|signals[].priority|String|Yes|
|signals[].content|String|Yes|
|signals[].source|String|Yes|
|signals[].impact|String|Yes|
|unlistedOptions|Array|Yes (can be empty)|
|nextStep|Object|Yes|
|nextStep.action|String|Yes|
|nextStep.target|String|Yes|
|nextStep.why|String|Yes|
|reframe|Object or null|Yes|
|meta|Object|Yes|
|meta.reliabilitySummary|String|Yes|
|meta.biggestRisk|String|Yes|
|meta.strategicPattern|String or null|Yes|
|meta.honestAssessment|String|Yes|

---

## Part 9: Remove/Update Existing Components

### Remove

|Component|Reason|
|---|---|

|Invisible strip click in council orbs|Replaced by explicit map button|

### Update

|Component|Change|
|---|---|
|ReframingBanner|Rename prop `betterQuestion` → `suggestion`|
|TrustSignalsPanel|New structure with signals + meta sections| 
|Council orbs decision map new icon|Move from bottom to between short/long answer|

---

## Part 10: Loading States

|Element|Loading State|
|---|---|
|Trust badge|Subtle pulse animation, no count|
|Blocker banner|Not shown until refiner completes|
|NextStepFooter|`→ ...` placeholder|
|Trust panel|"Analyzing..." in Refiner's Take section|
|SignalCards|Not shown until refiner completes|

---

## Summary

|Create|Purpose|
|---|---|

|Trust badge logic|Shows risk/blocker count on trust icon|

|Update|Change|
|---|---|
|
Add map button, update trust icon with badge|
|Trust panel|Add Risks, Additional Context, Refiner's Take sections|
|ReframeBanner|Rename prop|
|Parser|New output structure|

|Remove|Reason|
|---|---|
|Invisible strip click|Replaced by button|