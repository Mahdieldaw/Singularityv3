Markdown

## Fix 1: Dot Visibility States

The dot should be visible from the moment synthesis renders, not just when refiner completes.

**States:**
| State | Appearance |
|-------|------------|
| Synthesis rendered, refiner pending | Subtle gray dot, barely visible |
| Refiner loading | Subtle pulse animation |
| Refiner complete, no gem | Subtle dot, slightly more visible |
| Refiner complete, has gem | Lit up, pearly white with dark border |

**CSS:**
```css
.refiner-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.3s ease;
}

.refiner-dot--pending {
  background: rgba(128, 128, 128, 0.2);
  border: 1px solid rgba(128, 128, 128, 0.1);
}

.refiner-dot--loading {
  background: rgba(128, 128, 128, 0.3);
  border: 1px solid rgba(128, 128, 128, 0.2);
  animation: pulse 1.5s infinite;
}

.refiner-dot--active {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(0, 0, 0, 0.25);
  box-shadow: 0 0 6px rgba(255, 255, 255, 0.4);
}
Logic:

TypeScript

function getDotState(refinerLoading: boolean, refiner: RefinerOutput | null): string {
  if (!refiner && !refinerLoading) return 'pending';
  if (refinerLoading) return 'loading';
  if (refiner?.gem) return 'active';
  return 'pending';
}
Fix 2: Dot and Map Spacing
The dot and map icon need clear visual separation.

Layout:

text

┌──────────────────────────────────────────────────────┐
│                        📊          ●                 │
│                        Map    [gap]   Dot            │
└──────────────────────────────────────────────────────┘
CSS:

CSS

.refiner-strip {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 24px;  /* Increase gap between elements */
}
Minimum 20-24px gap between map icon and dot.

Fix 3: Gem Flash Text
The gem insight text that appears briefly should be:

Truncated (max 60-80 characters)
Positioned BELOW the strip, not overlapping
Fade in, hold 2.5s, fade out
Layout:

text

┌──────────────────────────────────────────────────────┐
│                        📊          ●                 │
├──────────────────────────────────────────────────────┤
│  "Build Knowledge Instability Alerts by tracking..." │  ← appears here
└──────────────────────────────────────────────────────┘
Implementation:

TypeScript

function truncateGem(insight: string, maxLength: number = 70): string {
  if (insight.length <= maxLength) return insight;
  return insight.substring(0, maxLength).trim() + '...';
}
CSS:

CSS

.gem-flash {
  text-align: center;
  font-size: 13px;
  color: var(--text-secondary);
  padding: 8px 16px;
  max-width: 400px;
  margin: 0 auto;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.gem-flash--visible {
  opacity: 1;
}
Animation:

TypeScript

function handleGemReveal(gem: Gem) {
  const truncated = truncateGem(gem.insight, 70);
  setGemFlashText(truncated);
  setGemFlashVisible(true);
  
  setTimeout(() => {
    setGemFlashVisible(false);
  }, 2500);
}
Fix 4: Attribution Click Handler
Clicking [ModelName] in synthesisPlus should open that model's response panel.

Problem: Panel opens empty because the click handler isn't finding the model response.

Fix:

TypeScript

function handleAttributionClick(modelName: string) {
  // Normalize model name for matching
  const normalized = modelName.toLowerCase().trim();
  
  // Find matching model from batch responses
  const modelResponse = batchResponses.find(response => 
    response.provider.toLowerCase().includes(normalized) ||
    response.modelName.toLowerCase().includes(normalized)
  );
  
  if (modelResponse) {
    openSplitPane(modelResponse.provider);
  } else {
    console.warn(`No response found for model: ${modelName}`);
  }
}
Parse attributions in synthesisPlus:

TypeScript

function renderSynthesisPlus(content: string) {
  // Match [ModelName] patterns
  const parts = content.split(/(\[[^\]]+\])/g);
  
  return parts.map((part, index) => {
    const match = part.match(/^\[([^\]]+)\]$/);
    if (match) {
      const modelName = match[1];
      return (
        <span 
          key={index}
          className="attribution-link"
          onClick={() => handleAttributionClick(modelName)}
        >
          {part}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}
CSS for attribution links:

CSS

.attribution-link {
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
}

.attribution-link:hover {
  text-decoration-style: solid;
}
Fix 5: Gem vs Outlier Differentiation
The problem: synthesisPlus has many [ModelName] attributions throughout. How does the user know which is THE gem vs just an attribution?

Solution: Highlight the gem at the start

Before the synthesisPlus text, show the gem as a distinct callout:

text

┌──────────────────────────────────────────────────────┐
│ 💎 The Insight                                       │
│                                                      │
│ "Build Knowledge Instability Alerts by tracking      │
│  consensus entropy — when model agreement decays,    │
│  flag it as destabilizing."                          │
│                                                      │
│ — Qwen                                   [See full →]│
├──────────────────────────────────────────────────────┤
│                                                      │
│ [synthesisPlus content follows...]                   │
│                                                      │
└──────────────────────────────────────────────────────┘
Trust Panel Structure:

React

<div className="trust-panel">
  {/* Gem Callout - if gem exists */}
  {refiner.gem && (
    <div className="gem-callout">
      <div className="gem-header">💎 The Insight</div>
      <div className="gem-content">{refiner.gem.insight}</div>
      <div className="gem-source">
        — {refiner.gem.source}
        <span 
          className="gem-link"
          onClick={() => handleAttributionClick(refiner.gem.source)}
        >
          See full →
        </span>
      </div>
    </div>
  )}
  
  {/* Synthesis+ Content */}
  <div className="synthesis-plus-content">
    {renderSynthesisPlus(refiner.synthesisPlus)}
  </div>
  
  {/* Debug - collapsed */}
  <details className="raw-output">
    <summary>Raw Output</summary>
    <pre>{JSON.stringify(refiner, null, 2)}</pre>
  </details>
</div>
Gem Callout CSS:

CSS

.gem-callout {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(255, 255, 255, 0.05));
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.gem-header {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
}

.gem-content {
  font-size: 15px;
  line-height: 1.5;
  margin-bottom: 8px;
}

.gem-source {
  font-size: 13px;
  color: var(--text-secondary);
  display: flex;
  justify-content: space-between;
}

.gem-link {
  color: var(--accent);
  cursor: pointer;
}
For outlier: The outlier is woven into synthesisPlus naturally. It doesn't need special highlighting — its value is in being part of the enhanced answer, not in being called out separately.

Summary
Fix	Change
Dot visibility	Show subtle dot from synthesis render, not just refiner complete
Spacing	24px gap between map icon and dot
Gem flash	Truncate to ~70 chars, position below strip, no overlap
Attribution clicks	Fix handler to find model in batch responses
Gem distinction	Show gem as highlighted callout at top of trust panel
Outlier	No separate display — already integrated in synthesisPlus
Visual Summary
Refiner Strip:

text

           📊                    ●
          Map       [24px gap]   Dot
Gem Flash (below strip, temporary):

text

    "Build Knowledge Instability Alerts by tracking..."
Trust Panel:

text

┌─────────────────────────────────────────────────────┐
│ 💎 The Insight                                      │
│ "Build Knowledge Instability Alerts..."             │
│ — Qwen                              [See full →]    │
├─────────────────────────────────────────────────────┤
│                                                     │
│ [synthesisPlus with clickable attributions]         │
│                                                     │
├─────────────────────────────────────────────────────┤
│ ▶ Raw Output                                        │
└─────────────────────────────────────────────────────┘