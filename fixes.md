Good catch. Let me consolidate everything into one comprehensive set of instructions that includes all the robustness improvements.

---

# Artifact Showcase: Complete Parsing & Container Fix Instructions

## Overview

Two critical issues need fixing:

1. **Parsing failures** — Tag extraction for unified mapper output fails when the mapper uses escaped brackets (`\<tag\>`), markdown headers (`### 1. \<tag\>`), or other variations. When parsing fails, the fallback uses short graph labels instead of full claim text.

2. **Container views replacing content** — When a `containerType` is detected (e.g., `direct_answer`), the full container component renders and obscures or replaces the selectable Relationship Rivers items.

---

## Part 1: Parsing Logic Fixes

### File: `shared/parsing-utils.ts`

#### 1.1 Add Pattern Collections for Tag Extraction

Add these pattern collections near the top of the file, after existing pattern definitions like `OPTIONS_PATTERNS` and `GRAPH_TOPOLOGY_PATTERN`:

```typescript
// ============================================================================
// UNIFIED TAG PATTERNS
// ============================================================================

/**
 * Pattern variations for extracting <narrative_summary> content.
 * Handles escaped brackets, markdown headers, various delimiters.
 */
const NARRATIVE_SUMMARY_PATTERNS: RegExp[] = [
    // Standard: <narrative_summary>content</narrative_summary>
    /<narrative_summary>([\s\S]*?)<\/narrative_summary>/i,
    // Escaped: \<narrative_summary\>content\</narrative_summary\>
    /\\<narrative_summary\\>([\s\S]*?)\\<\/narrative_summary\\>/i,
    // Markdown header with tag: ### <narrative_summary> or ### 1. <narrative_summary>
    /#{1,3}\s*(?:\d+\.)?\s*\\?<narrative_summary\\?>\s*\n([\s\S]*?)(?=#{1,3}\s*(?:\d+\.)?\s*\\?<|$)/i,
    // Markdown header with closing tag
    /#{1,3}\s*(?:\d+\.)?\s*\\?<narrative_summary\\?>\s*\n([\s\S]*?)\\?<\/narrative_summary\\?>/i,
    // Tag name as header without brackets: ### narrative_summary
    /#{1,3}\s*(?:\d+\.)?\s*narrative[_\s]*summary\s*\n([\s\S]*?)(?=#{1,3}\s*(?:\d+\.)?\s*(?:options|mapper|graph)|$)/i,
    // Bold variant: **narrative_summary** or **Narrative Summary**
    /\*\*narrative[_\s]*summary\*\*[:\s]*\n([\s\S]*?)(?=\*\*(?:options|mapper|graph)|#{1,3}|$)/i,
];

/**
 * Pattern variations for extracting <options_inventory> content.
 */
const OPTIONS_INVENTORY_PATTERNS: RegExp[] = [
    // Standard
    /<options_inventory>([\s\S]*?)<\/options_inventory>/i,
    // Escaped
    /\\<options_inventory\\>([\s\S]*?)\\<\/options_inventory\\>/i,
    // Markdown header with tag
    /#{1,3}\s*(?:\d+\.)?\s*\\?<options_inventory\\?>\s*\n([\s\S]*?)(?=#{1,3}\s*(?:\d+\.)?\s*\\?<|$)/i,
    // Markdown header with closing tag
    /#{1,3}\s*(?:\d+\.)?\s*\\?<options_inventory\\?>\s*\n([\s\S]*?)\\?<\/options_inventory\\?>/i,
    // Tag name as header
    /#{1,3}\s*(?:\d+\.)?\s*options[_\s]*inventory\s*\n([\s\S]*?)(?=#{1,3}\s*(?:\d+\.)?\s*(?:narrative|mapper|graph)|$)/i,
    // Bold variant
    /\*\*options[_\s]*inventory\*\*[:\s]*\n([\s\S]*?)(?=\*\*(?:narrative|mapper|graph)|#{1,3}|$)/i,
];

/**
 * Pattern variations for extracting <mapper_artifact> content.
 */
const MAPPER_ARTIFACT_PATTERNS: RegExp[] = [
    // Standard
    /<mapper_artifact>([\s\S]*?)<\/mapper_artifact>/i,
    // Escaped
    /\\<mapper_artifact\\>([\s\S]*?)\\<\/mapper_artifact\\>/i,
    // Markdown header with tag
    /#{1,3}\s*(?:\d+\.)?\s*\\?<mapper_artifact\\?>\s*\n([\s\S]*?)(?=#{1,3}\s*(?:\d+\.)?\s*\\?<|$)/i,
    // Markdown header with closing tag
    /#{1,3}\s*(?:\d+\.)?\s*\\?<mapper_artifact\\?>\s*\n([\s\S]*?)(?:\\?<\/mapper_artifact\\?>|(?=#{1,3}\s*(?:\d+\.)?\s*(?:graph|$)))/i,
    // Tag name as header
    /#{1,3}\s*(?:\d+\.)?\s*mapper[_\s]*artifact\s*\n([\s\S]*?)(?=#{1,3}\s*(?:\d+\.)?\s*(?:narrative|options|graph)|$)/i,
    // Bold variant
    /\*\*mapper[_\s]*artifact\*\*[:\s]*\n([\s\S]*?)(?=\*\*(?:narrative|options|graph)|#{1,3}|$)/i,
    // Fallback: JSON block containing "consensus" and "claims" after any mapper mention
    /mapper[_\s]*artifact[:\s]*\n*```(?:json)?\s*\n?(\{[\s\S]*?"consensus"[\s\S]*?"claims"[\s\S]*?\})\s*\n?```/i,
];

/**
 * Pattern variations for extracting <graph_topology> tag content (JSON format).
 */
const GRAPH_TOPOLOGY_TAG_PATTERNS: RegExp[] = [
    // Standard
    /<graph_topology>([\s\S]*?)<\/graph_topology>/i,
    // Escaped
    /\\<graph_topology\\>([\s\S]*?)\\<\/graph_topology\\>/i,
    // Markdown header with tag
    /#{1,3}\s*(?:\d+\.)?\s*\\?<graph_topology\\?>\s*\n([\s\S]*?)(?=#{1,3}\s*(?:\d+\.)?\s*\\?<|$)/i,
    // Markdown header with closing tag
    /#{1,3}\s*(?:\d+\.)?\s*\\?<graph_topology\\?>\s*\n([\s\S]*?)\\?<\/graph_topology\\?>/i,
    // Tag name as header
    /#{1,3}\s*(?:\d+\.)?\s*graph[_\s]*topology\s*\n([\s\S]*?)(?=#{1,3}\s|$)/i,
    // Bold variant
    /\*\*graph[_\s]*topology\*\*[:\s]*\n([\s\S]*?)(?=\*\*|#{1,3}|$)/i,
];
```

#### 1.2 Add Helper Functions

Add these helper functions:

```typescript
/**
 * Try multiple regex patterns to extract content.
 * Returns the first successful match's captured group, or null.
 */
function tryPatterns(text: string, patterns: RegExp[]): string | null {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]?.trim()) {
            return match[1].trim();
        }
    }
    return null;
}

/**
 * Extract JSON from content that may be wrapped in code fences.
 * Handles ```json ... ```, ``` ... ```, and raw JSON.
 */
function extractJsonFromContent(content: string | null): any | null {
    if (!content) return null;
    
    let jsonText = content.trim();
    
    // Remove markdown code fence wrappers
    const codeFenceMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeFenceMatch) {
        jsonText = codeFenceMatch[1].trim();
    }
    
    // Find JSON object boundaries
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
            return JSON.parse(jsonText.substring(firstBrace, lastBrace + 1));
        } catch (e) {
            // JSON parse failed, continue
        }
    }
    
    // Try parsing the whole content as JSON
    try {
        return JSON.parse(jsonText);
    } catch (e) {
        return null;
    }
}
```

#### 1.3 Add Prose Graph Topology Parser

Add this function to parse prose-style graph format (which is already working for you):

```typescript
/**
 * Parse prose-style graph topology into structured format.
 * Handles formats like:
 * - **Node A** --[complements]--> **Node B**
 * - - Node A --[prerequisite]--> Node B
 * - "Node A" --[conflicts]--> "Node B"
 * 
 * This handles the case where the mapper outputs human-readable prose
 * instead of JSON for the graph topology section.
 */
export function parseProseGraphTopology(text: string): GraphTopology | null {
    if (!text) return null;
    
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeMap = new Map<string, string>(); // normalized label -> id
    let nodeCounter = 1;
    
    const normalizeLabel = (label: string): string => {
        return label
            .trim()
            .replace(/^\*\*|\*\*$/g, '') // Remove bold markers
            .replace(/^["']|["']$/g, '') // Remove quotes
            .trim();
    };
    
    const getOrCreateNodeId = (rawLabel: string): string => {
        const label = normalizeLabel(rawLabel);
        if (!label) return '';
        
        if (nodeMap.has(label)) {
            return nodeMap.get(label)!;
        }
        
        const id = `opt_${nodeCounter++}`;
        nodeMap.set(label, id);
        nodes.push({
            id,
            label,
            theme: '',
            supporters: [],
            support_count: 1
        });
        return id;
    };
    
    // Multiple patterns to catch different prose formats
    const edgePatterns = [
        // **Source** --[type]--> **Target**
        /\*\*([^*]+)\*\*\s*--\[(\w+)\]-->\s*\*\*([^*\n]+)\*\*/g,
        // Source --[type]--> Target (possibly with list marker, no bold)
        /^[-*•]?\s*([A-Z][^-\n]*?)\s*--\[(\w+)\]-->\s*([^\n]+)/gm,
        // "Source" --[type]--> "Target" (quoted)
        /["']([^"']+)["']\s*--\[(\w+)\]-->\s*["']([^"'\n]+)["']/g,
        // Looser: any text --[type]--> any text
        /([^-\n\[\]]{3,}?)\s*--\[(\w+)\]-->\s*([^\n]+)/g,
    ];
    
    for (const pattern of edgePatterns) {
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;
        
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const sourceLabel = match[1];
            const edgeType = match[2].toLowerCase();
            const targetLabel = match[3];
            
            const sourceId = getOrCreateNodeId(sourceLabel);
            const targetId = getOrCreateNodeId(targetLabel);
            
            if (sourceId && targetId) {
                // Check for duplicate edges
                const edgeExists = edges.some(e => 
                    e.source === sourceId && 
                    e.target === targetId && 
                    e.type === edgeType
                );
                
                if (!edgeExists) {
                    edges.push({
                        source: sourceId,
                        target: targetId,
                        type: edgeType as GraphEdge['type'],
                        reason: ''
                    });
                }
            }
        }
    }
    
    // Only return if we found meaningful content
    if (nodes.length === 0 || edges.length === 0) {
        return null;
    }
    
    return { nodes, edges };
}
```

#### 1.4 Update `parseUnifiedMapperOutput` to Use Pattern Collections

Replace or modify the existing `parseUnifiedMapperOutput` function to use the pattern collections:

```typescript
/**
 * Parse Unified Mapper Output
 * Extracts content from <narrative_summary>, <options_inventory>, <mapper_artifact>, and <graph_topology> tags.
 * Uses robust multi-pattern matching to handle various formats and escaping.
 */
export function parseUnifiedMapperOutput(text: string): {
    narrative: string;
    options: string | null;
    artifact: MapperArtifact | null;
    topology: GraphTopology | null;
} {
    if (!text) {
        return { narrative: "", options: null, artifact: null, topology: null };
    }

    // Create normalized version with escaped brackets converted
    const normalizedText = text
        .replace(/\\</g, '<')
        .replace(/\\>/g, '>');
    
    // Helper to try patterns on both original and normalized text
    const extractWithPatterns = (patterns: RegExp[]): string | null => {
        // Try normalized text first (handles escaped brackets)
        let result = tryPatterns(normalizedText, patterns);
        if (result) return result;
        
        // Try original text as fallback
        result = tryPatterns(text, patterns);
        return result;
    };

    // Extract each section using pattern collections
    const narrativeSummary = extractWithPatterns(NARRATIVE_SUMMARY_PATTERNS);
    const optionsInventory = extractWithPatterns(OPTIONS_INVENTORY_PATTERNS);
    const mapperArtifactRaw = extractWithPatterns(MAPPER_ARTIFACT_PATTERNS);
    const graphTopologyRaw = extractWithPatterns(GRAPH_TOPOLOGY_TAG_PATTERNS);

    // Parse mapper artifact JSON
    let artifact: MapperArtifact | null = null;
    if (mapperArtifactRaw) {
        const parsed = extractJsonFromContent(mapperArtifactRaw);
        if (parsed && typeof parsed === 'object' && parsed.consensus) {
            artifact = {
                ...createEmptyMapperArtifact(),
                ...parsed,
                consensus: {
                    ...createEmptyMapperArtifact().consensus,
                    ...(parsed.consensus || {})
                }
            };
        }
    }

    // If we still don't have an artifact, search for embedded JSON anywhere
    if (!artifact) {
        const embeddedPatterns = [
            // JSON in code fence with consensus/claims
            /```(?:json)?\s*\n?(\{[\s\S]*?"consensus"[\s\S]*?"claims"[\s\S]*?\})\s*\n?```/,
            // Raw JSON object with consensus structure
            /(\{[\s\S]*?"consensus"\s*:\s*\{[\s\S]*?"claims"\s*:\s*\[[\s\S]*?\][\s\S]*?\}[\s\S]*?\})/,
        ];
        
        for (const pattern of embeddedPatterns) {
            const match = normalizedText.match(pattern);
            if (match) {
                const parsed = extractJsonFromContent(match[1]);
                if (parsed?.consensus?.claims?.length > 0) {
                    // Verify claims have full text (not just short labels)
                    const hasFullText = parsed.consensus.claims.some(
                        (c: any) => c.text && c.text.split(' ').length > 5
                    );
                    if (hasFullText) {
                        artifact = {
                            ...createEmptyMapperArtifact(),
                            ...parsed,
                            consensus: {
                                ...createEmptyMapperArtifact().consensus,
                                ...(parsed.consensus || {})
                            }
                        };
                        break;
                    }
                }
            }
        }
    }

    // Parse graph topology - try JSON from tags first
    let topology: GraphTopology | null = null;
    if (graphTopologyRaw) {
        const parsed = extractJsonFromContent(graphTopologyRaw);
        if (parsed && Array.isArray(parsed.nodes)) {
            topology = parsed as GraphTopology;
        } else {
            // Tag content might be prose format, try parsing it
            topology = parseProseGraphTopology(graphTopologyRaw);
        }
    }

    // If no topology from tags, try prose parsing on the whole text
    if (!topology) {
        topology = parseProseGraphTopology(text);
    }

    // Determine if we got useful content from tags
    const hasUsefulTagContent = narrativeSummary || optionsInventory || artifact;
    
    // Only fall back to full legacy parsing if we have NOTHING from tags
    if (!hasUsefulTagContent) {
        const legacy = parseMappingResponse(text);
        const legacyArtifact = parseV1MapperToArtifact(text, { graphTopology: legacy.graphTopology });
        return {
            narrative: legacy.narrative || text,
            options: legacy.options,
            artifact: legacyArtifact,
            topology: legacy.graphTopology || topology
        };
    }

    return {
        narrative: narrativeSummary || "",
        options: optionsInventory,
        artifact,
        topology
    };
}
```

#### 1.5 Update `parseMappingResponse` to Detect Escaped Tags

Modify the existing function to check for escaped bracket variants:

```typescript
/**
 * Parse mapping response - convenience function that extracts both options and topology
 */
export function parseMappingResponse(response: string | null | undefined): {
    narrative: string;
    options: string | null;
    optionTitles: string[];
    graphTopology: any | null;
} {
    if (!response) return { narrative: '', options: null, optionTitles: [], graphTopology: null };

    // Check for Unified Tagged Output - handle both escaped and unescaped
    const hasUnifiedTags = 
        response.includes('<narrative_summary>') || 
        response.includes('<options_inventory>') ||
        response.includes('<mapper_artifact>') ||
        response.includes('\\<narrative_summary\\>') ||
        response.includes('\\<options_inventory\\>') ||
        response.includes('\\<mapper_artifact\\>') ||
        // Also check for markdown header variants
        /#{1,3}\s*(?:\d+\.)?\s*\\?<(?:narrative_summary|options_inventory|mapper_artifact)\\?>/i.test(response) ||
        // And plain header variants
        /#{1,3}\s*(?:\d+\.)?\s*(?:narrative_summary|options_inventory|mapper_artifact)\s*\n/i.test(response);

    if (hasUnifiedTags) {
        const unified = parseUnifiedMapperOutput(response);
        const optionTitles = unified.options ? parseOptionTitles(unified.options) : [];
        return {
            narrative: unified.narrative || response,
            options: unified.options,
            optionTitles,
            graphTopology: unified.topology,
        };
    }

    // Continue with legacy delimiter-based parsing...
    const { text: textWithoutTopology, topology } = extractGraphTopologyAndStrip(response);
    const { text: narrative, options } = extractOptionsAndStrip(textWithoutTopology);
    const optionTitles = options ? parseOptionTitles(options) : [];

    return {
        narrative: cleanNarrativeText(narrative),
        options: options ? cleanOptionsText(options) : null,
        optionTitles,
        graphTopology: topology,
    };
}
```

#### 1.6 Update `parseV1MapperToArtifact` to Check for Embedded JSON First

Modify the existing function to look for embedded artifact JSON before falling back to graph-based parsing:

```typescript
export function parseV1MapperToArtifact(
    v1Output: string,
    options: { graphTopology?: any; query?: string; turn?: number; timestamp?: string } = {},
): MapperArtifact {
    // 1. Check for Unified Tagged Output first
    if (v1Output && (
        v1Output.includes('<mapper_artifact>') || 
        v1Output.includes('\\<mapper_artifact\\>')
    )) {
        const unified = parseUnifiedMapperOutput(v1Output);
        if (unified.artifact) {
            return {
                ...unified.artifact,
                query: options.query || unified.artifact.query || "",
                turn: options.turn || unified.artifact.turn || 0,
                timestamp: options.timestamp || unified.artifact.timestamp || new Date().toISOString()
            };
        }
    }

    // 2. Try to find embedded mapper artifact JSON anywhere in the text
    const normalizedOutput = v1Output.replace(/\\</g, '<').replace(/\\>/g, '>');
    const artifactJsonPatterns = [
        /```(?:json)?\s*(\{[\s\S]*?"consensus"[\s\S]*?"claims"[\s\S]*?\})\s*```/,
        /(\{[\s\S]*?"consensus"\s*:\s*\{[\s\S]*?"claims"\s*:\s*\[[\s\S]*?\][\s\S]*?\})/,
    ];
    
    for (const pattern of artifactJsonPatterns) {
        const match = normalizedOutput.match(pattern);
        if (match) {
            try {
                const parsed = JSON.parse(match[1]);
                if (parsed?.consensus?.claims?.length > 0) {
                    // Verify claims have full text (not just short labels)
                    const hasFullText = parsed.consensus.claims.some(
                        (c: any) => c.text && c.text.split(' ').length > 5
                    );
                    if (hasFullText) {
                        return {
                            ...createEmptyMapperArtifact(),
                            ...parsed,
                            query: options.query || parsed.query || "",
                            turn: options.turn || parsed.turn || 0,
                            timestamp: options.timestamp || parsed.timestamp || new Date().toISOString()
                        };
                    }
                }
            } catch { }
        }
    }

    // 3. Existing V1 graph-based parsing (last resort)
    // ... keep the rest of the existing function unchanged ...
```

#### 1.7 Update `extractGraphTopologyAndStrip` to Try Prose Parsing

Modify the existing function to fall back to prose parsing when JSON isn't found:

```typescript
export function extractGraphTopologyAndStrip(text: string): { text: string; topology: GraphTopology | null } {
    if (!text || typeof text !== 'string') return { text: text || '', topology: null };

    const normalized = normalizeText(text);
    const match = normalized.match(GRAPH_TOPOLOGY_PATTERN);

    if (!match || typeof match.index !== 'number') {
        // No header found, but try prose parsing on the whole text as last resort
        const proseTopology = parseProseGraphTopology(normalized);
        return { text: normalized, topology: proseTopology };
    }

    const start = match.index + match[0].length;
    let rest = normalized.slice(start).trim();

    // Handle code block wrapped JSON
    const codeBlockMatch = rest.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
        rest = codeBlockMatch[1].trim();
    }

    // Try JSON parsing first
    const firstBrace = rest.indexOf('{');
    if (firstBrace !== -1) {
        // ... existing JSON parsing logic with balanced braces ...
        // (keep this section unchanged)
    }
    
    // If no JSON found, try prose parsing on the section content
    const proseTopology = parseProseGraphTopology(rest);
    if (proseTopology) {
        const before = normalized.slice(0, match.index).trim();
        return { text: before, topology: proseTopology };
    }

    return { text: normalized.slice(0, match.index).trim(), topology: null };
}
```

---

## Part 2: Container Preview Fix

### File: `ui/components/artifact/previews/ContainerPreviews.tsx` (NEW FILE)

Create this new file with lightweight preview components:

```tsx
import React from 'react';

interface PreviewWrapperProps {
    label: string;
    colorClass: string;
    children: React.ReactNode;
}

const PreviewWrapper: React.FC<PreviewWrapperProps> = ({ label, colorClass, children }) => (
    <div className={`bg-${colorClass}-500/5 border border-${colorClass}-500/20 rounded-xl overflow-hidden mb-4`}>
        <div className={`px-4 py-2 border-b border-${colorClass}-500/10 flex items-center justify-between`}>
            <span className={`text-xs font-semibold text-${colorClass}-400 uppercase tracking-wide`}>
                {label}
            </span>
            <span className="text-[10px] text-text-muted">
                ↓ All claims selectable below
            </span>
        </div>
        <div className="p-4">{children}</div>
    </div>
);

export const DirectAnswerPreview: React.FC<{ content: { answer: string; additional_context?: any[] } }> = ({ content }) => (
    <PreviewWrapper label="Consensus Answer" colorClass="emerald">
        <p className="text-sm text-text-primary font-medium leading-relaxed">{content.answer}</p>
        {content.additional_context && content.additional_context.length > 0 && (
            <p className="text-xs text-text-muted mt-2">+{content.additional_context.length} supporting points</p>
        )}
    </PreviewWrapper>
);

export const DecisionTreePreview: React.FC<{ content: { default_path: string; conditions: any[]; frame_challenger?: any } }> = ({ content }) => (
    <PreviewWrapper label="Decision Path" colorClass="blue">
        <div className="space-y-2">
            <div>
                <span className="text-[10px] text-blue-400 uppercase">Default:</span>
                <p className="text-sm text-text-primary font-medium">{content.default_path}</p>
            </div>
            {content.conditions.length > 0 && (
                <p className="text-xs text-text-muted">{content.conditions.length} conditional branches</p>
            )}
            {content.frame_challenger && (
                <p className="text-xs text-amber-400 mt-1">⚡ Frame challenger present</p>
            )}
        </div>
    </PreviewWrapper>
);

export const ComparisonMatrixPreview: React.FC<{ content: { dimensions: any[] } }> = ({ content }) => (
    <PreviewWrapper label="Comparison Matrix" colorClass="purple">
        <div className="space-y-1">
            {content.dimensions.slice(0, 3).map((dim: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">{dim.name}</span>
                    <span className="text-text-primary font-medium truncate max-w-[60%]">{dim.winner}</span>
                </div>
            ))}
            {content.dimensions.length > 3 && (
                <p className="text-xs text-text-muted pt-1">+{content.dimensions.length - 3} more</p>
            )}
        </div>
    </PreviewWrapper>
);

export const ExplorationSpacePreview: React.FC<{ content: { paradigms: any[]; common_thread?: string } }> = ({ content }) => (
    <PreviewWrapper label="Exploration Space" colorClass="violet">
        {content.common_thread && (
            <p className="text-xs text-text-secondary italic mb-2">"{content.common_thread}"</p>
        )}
        <div className="flex flex-wrap gap-1.5">
            {content.paradigms.slice(0, 4).map((p: any, i: number) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded bg-violet-500/10 text-violet-300">
                    {p.name}
                </span>
            ))}
            {content.paradigms.length > 4 && (
                <span className="text-xs text-text-muted">+{content.paradigms.length - 4}</span>
            )}
        </div>
    </PreviewWrapper>
);
```

### File: `ui/components/artifact/ArtifactShowcase.tsx`

1. **Add import** for the new preview components:

```tsx
import {
    DirectAnswerPreview,
    DecisionTreePreview,
    ComparisonMatrixPreview,
    ExplorationSpacePreview
} from './previews/ContainerPreviews';
```

2. **Replace the `renderContainerPreview` function** to use the lightweight previews:

```tsx
const renderContainerPreview = () => {
    if (!artifactForDisplay || !analysis?.containerType) return null;
    
    switch (analysis.containerType) {
        case "direct_answer":
            return <DirectAnswerPreview content={buildDirectAnswerContent(artifactForDisplay, analysis)} />;
        case "decision_tree":
            return <DecisionTreePreview content={buildDecisionTreeContent(artifactForDisplay, analysis)} />;
        case "comparison_matrix":
            return <ComparisonMatrixPreview content={buildComparisonContent(artifactForDisplay, analysis)} />;
        case "exploration_space":
            return <ExplorationSpacePreview content={buildExplorationContent(artifactForDisplay, analysis)} />;
        default:
            return null;
    }
};
```

3. **Remove the old `ContainerPreview` wrapper component** if it exists inline in the file (the one that was wrapping full container components).

4. **Verify render order** — The container preview should appear BEFORE the Relationship Rivers but NOT replace it:

```tsx
{/* Container PREVIEW (lightweight summary) */}
{renderContainerPreview()}

{/* Relationship Rivers (ALWAYS renders - this is the primary selectable content) */}
{processed && (
    <div className="space-y-4 mt-2">
        {processed.frameChallengers.length > 0 && ...}
        {processed.bifurcations.length > 0 && ...}
        {processed.bundles.length > 0 && ...}
        {processed.independentAnchors.length > 0 && ...}
        {processed.ghost && <GhostDivider ghost={processed.ghost} />}
    </div>
)}
```

---

## Summary of All Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `shared/parsing-utils.ts` | ADD | Pattern collections: `NARRATIVE_SUMMARY_PATTERNS`, `OPTIONS_INVENTORY_PATTERNS`, `MAPPER_ARTIFACT_PATTERNS`, `GRAPH_TOPOLOGY_TAG_PATTERNS` |
| `shared/parsing-utils.ts` | ADD | Helper function: `tryPatterns()` |
| `shared/parsing-utils.ts` | ADD | Helper function: `extractJsonFromContent()` |
| `shared/parsing-utils.ts` | ADD | Function: `parseProseGraphTopology()` |
| `shared/parsing-utils.ts` | MODIFY | Function: `parseUnifiedMapperOutput()` — use pattern collections, try normalized text |
| `shared/parsing-utils.ts` | MODIFY | Function: `parseMappingResponse()` — detect escaped tags |
| `shared/parsing-utils.ts` | MODIFY | Function: `parseV1MapperToArtifact()` — check for embedded JSON before graph fallback |
| `shared/parsing-utils.ts` | MODIFY | Function: `extractGraphTopologyAndStrip()` — try prose parsing when JSON not found |
| `ui/components/artifact/previews/ContainerPreviews.tsx` | NEW | Lightweight preview components |
| `ui/components/artifact/ArtifactShowcase.tsx` | MODIFY | Import new previews, replace `renderContainerPreview()` |

## Expected Outcome

After these changes:

1. **Tags will be extracted correctly** even when mapper outputs `\<narrative_summary\>` or `### 1. \<mapper_artifact\>`
2. **Full claim text will appear** like "Relational Clustering: Group items connected by edges into shared visual containers..."
3. **Prose graph topology will parse** so edges like `**A** --[complements]--> **B**` create proper graph relationships
4. **Containers will be small previews** with "↓ All claims selectable below" hint
5. **Relationship Rivers will always render** below the preview with Frame Challengers, Bifurcations, Bundles, and Independent Anchors