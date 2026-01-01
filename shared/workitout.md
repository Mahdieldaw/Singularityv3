Context
You are modifying ui/components/artifact/content-builders.ts and ui/components/artifact/ArtifactShowcase.tsx.

Goal: Create a reconciliation layer that ensures ALL options from options_inventory AND all structured claims from the artifact are displayed, with proper matching and metadata attachment.

Key files:

ui/components/artifact/content-builders.ts — add reconciliation logic
ui/components/artifact/ArtifactShowcase.tsx — consume reconciled data
shared/parsing-utils.ts — already has parsing utilities (read-only reference)
Task 1: Add Types for Reconciliation
File: ui/components/artifact/content-builders.ts

Add these types near the top, after the existing type definitions:

TypeScript

export interface ParsedInventoryItem {
  index: number;              // 1-based position in options_inventory
  label: string;              // The bold title
  summary: string;            // The description after colon
  citations: number[];        // Model indices [1, 2, 3]
  rawText: string;            // Original text for debugging
}

export interface UnifiedOption {
  id: string;                 // Stable ID: "unified-{index}"
  label: string;              // Display title
  summary: string;            // Full description
  citations: number[];        // Model indices
  
  // Source tracking
  source: 'matched' | 'inventory_only' | 'artifact_only';
  inventoryIndex?: number;    // Position in options_inventory (if from there)
  
  // From structured artifact (if matched)
  artifactData?: {
    type: 'consensus' | 'supplemental' | 'frame_challenger';
    originalId: string;       // "consensus-0" or "outlier-1"
    dimension?: string;
    applies_when?: string;
    support_count?: number;
    supporters?: number[];
    source?: string;          // For outliers
    challenges?: string;      // For frame_challengers
  };
  
  // Match metadata
  matchConfidence: 'exact' | 'high' | 'medium' | 'low' | 'none';
}

export interface ReconciliationResult {
  options: UnifiedOption[];
  stats: {
    totalOptions: number;
    matched: number;
    inventoryOnly: number;
    artifactOnly: number;
    matchQuality: 'good' | 'partial' | 'poor';
  };
}
Task 2: Create Options Inventory Parser
File: ui/components/artifact/content-builders.ts

Add this function after the type definitions:

TypeScript

/**
 * Parse options_inventory prose text into structured items.
 * Handles formats:
 *   1. **[Label]**: Summary [1, 2]
 *   - **Label**: Summary [1, 2]
 *   1. **Label**: Summary (Model 1, Model 2)
 */
export function parseOptionsInventory(text: string | null | undefined): ParsedInventoryItem[] {
  if (!text || typeof text !== 'string') return [];
  
  const items: ParsedInventoryItem[] = [];
  const lines = text.split('\n');
  
  let currentItem: Partial<ParsedInventoryItem> | null = null;
  let itemIndex = 0;
  
  const flushItem = () => {
    if (currentItem && currentItem.label) {
      items.push({
        index: currentItem.index ?? itemIndex,
        label: currentItem.label,
        summary: currentItem.summary || '',
        citations: currentItem.citations || [],
        rawText: currentItem.rawText || '',
      });
    }
    currentItem = null;
  };
  
  // Pattern for item start: numbered or bulleted with bold label
  const itemStartPattern = /^\s*(?:(\d+)\.)?\s*[-*•]?\s*\*\*\[?([^\]*]+)\]?\*\*\s*:?\s*(.*)$/;
  
  // Pattern for citations: [1, 2] or [1] or (Model 1, 2)
  const citationPattern = /\[(\d+(?:\s*,\s*\d+)*)\]|\((?:Model\s*)?(\d+(?:\s*,\s*\d+)*)\)/gi;
  
  const extractCitations = (text: string): number[] => {
    const citations: number[] = [];
    let match;
    while ((match = citationPattern.exec(text)) !== null) {
      const nums = (match[1] || match[2] || '').split(',').map(s => parseInt(s.trim(), 10));
      citations.push(...nums.filter(n => !isNaN(n)));
    }
    citationPattern.lastIndex = 0; // Reset for next use
    return [...new Set(citations)]; // Dedupe
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    const match = trimmed.match(itemStartPattern);
    if (match) {
      flushItem();
      itemIndex++;
      
      const num = match[1] ? parseInt(match[1], 10) : itemIndex;
      const label = match[2].trim();
      const rest = match[3].trim();
      
      currentItem = {
        index: num,
        label,
        summary: rest,
        citations: extractCitations(rest),
        rawText: trimmed,
      };
    } else if (currentItem) {
      // Continuation line - append to summary
      currentItem.summary = ((currentItem.summary || '') + ' ' + trimmed).trim();
      // Extract any additional citations
      const moreCitations = extractCitations(trimmed);
      if (moreCitations.length > 0) {
        currentItem.citations = [...new Set([...(currentItem.citations || []), ...moreCitations])];
      }
    }
  }
  
  flushItem();
  return items;
}
Task 3: Create Matching Logic
File: ui/components/artifact/content-builders.ts

Add this function after parseOptionsInventory:

TypeScript

/**
 * Match parsed inventory items to structured artifact claims.
 * Uses text similarity with fallback to citation overlap.
 */
export function matchInventoryToArtifact(
  inventory: ParsedInventoryItem[],
  artifact: MapperArtifact | null
): Map<number, { type: 'consensus' | 'outlier'; index: number; confidence: 'exact' | 'high' | 'medium' | 'low' }> {
  const matches = new Map<number, { type: 'consensus' | 'outlier'; index: number; confidence: 'exact' | 'high' | 'medium' | 'low' }>();
  
  if (!artifact || inventory.length === 0) return matches;
  
  // Build candidate pool from artifact
  interface Candidate {
    type: 'consensus' | 'outlier';
    index: number;
    text: string;
    supporters: number[];
    dimension?: string;
  }
  
  const candidates: Candidate[] = [];
  
  (artifact.consensus?.claims || []).forEach((claim, i) => {
    candidates.push({
      type: 'consensus',
      index: i,
      text: claim.text,
      supporters: claim.supporters || [],
      dimension: claim.dimension,
    });
  });
  
  (artifact.outliers || []).forEach((outlier, i) => {
    candidates.push({
      type: 'outlier',
      index: i,
      text: outlier.insight,
      supporters: typeof outlier.source_index === 'number' ? [outlier.source_index] : [],
      dimension: outlier.dimension,
    });
  });
  
  // Track which candidates have been matched (to prefer unique matches)
  const usedCandidates = new Set<string>();
  
  // Sort inventory by index to process in order
  const sortedInventory = [...inventory].sort((a, b) => a.index - b.index);
  
  for (const item of sortedInventory) {
    let bestMatch: { candidate: Candidate; confidence: 'exact' | 'high' | 'medium' | 'low' } | null = null;
    let bestScore = 0;
    
    for (const candidate of candidates) {
      const candidateKey = `${candidate.type}-${candidate.index}`;
      if (usedCandidates.has(candidateKey)) continue;
      
      // Calculate text similarity
      const similarity = textSimilarity(item.label, candidate.text);
      
      // Calculate citation overlap (normalize to 0-1)
      let citationScore = 0;
      if (item.citations.length > 0 && candidate.supporters.length > 0) {
        const overlap = item.citations.filter(c => candidate.supporters.includes(c)).length;
        const union = new Set([...item.citations, ...candidate.supporters]).size;
        citationScore = union > 0 ? overlap / union : 0;
      }
      
      // Combined score (text similarity weighted higher)
      const score = similarity * 0.7 + citationScore * 0.3;
      
      if (score > bestScore) {
        bestScore = score;
        
        // Determine confidence level
        let confidence: 'exact' | 'high' | 'medium' | 'low';
        if (similarity >= 0.95) confidence = 'exact';
        else if (similarity >= 0.7 || score >= 0.8) confidence = 'high';
        else if (score >= 0.55) confidence = 'medium';
        else confidence = 'low';
        
        bestMatch = { candidate, confidence };
      }
    }
    
    // Only accept matches above threshold
    if (bestMatch && bestScore >= 0.4) {
      const candidateKey = `${bestMatch.candidate.type}-${bestMatch.candidate.index}`;
      matches.set(item.index, {
        type: bestMatch.candidate.type,
        index: bestMatch.candidate.index,
        confidence: bestMatch.confidence,
      });
      usedCandidates.add(candidateKey);
    }
  }
  
  return matches;
}
Task 4: Create Reconciliation Function
File: ui/components/artifact/content-builders.ts

Add this as the main reconciliation entry point:

TypeScript

/**
 * Reconcile options_inventory with structured artifact data.
 * Produces a unified list where:
 *   - Every inventory item appears (with artifact metadata if matched)
 *   - Every artifact item appears (even if not in inventory)
 *   - Matched items have full metadata from both sources
 */
export function reconcileOptions(
  optionsInventoryText: string | null | undefined,
  artifact: MapperArtifact | null
): ReconciliationResult {
  const parsedInventory = parseOptionsInventory(optionsInventoryText);
  const matches = matchInventoryToArtifact(parsedInventory, artifact);
  
  const options: UnifiedOption[] = [];
  const matchedArtifactIds = new Set<string>();
  
  // 1. Process inventory items (primary source when available)
  for (const item of parsedInventory) {
    const match = matches.get(item.index);
    
    if (match) {
      // Matched item - combine inventory + artifact data
      const artifactId = `${match.type === 'consensus' ? 'consensus' : 'outlier'}-${match.index}`;
      matchedArtifactIds.add(artifactId);
      
      let artifactData: UnifiedOption['artifactData'];
      
      if (match.type === 'consensus') {
        const claim = artifact!.consensus.claims[match.index];
        artifactData = {
          type: 'consensus',
          originalId: artifactId,
          dimension: claim.dimension,
          applies_when: claim.applies_when,
          support_count: claim.support_count,
          supporters: claim.supporters,
        };
      } else {
        const outlier = artifact!.outliers[match.index];
        artifactData = {
          type: outlier.type === 'frame_challenger' ? 'frame_challenger' : 'supplemental',
          originalId: artifactId,
          dimension: outlier.dimension,
          applies_when: outlier.applies_when,
          source: outlier.source,
          challenges: outlier.challenges,
        };
      }
      
      options.push({
        id: `unified-${item.index}`,
        label: item.label,
        summary: item.summary,
        citations: item.citations.length > 0 
          ? item.citations 
          : (artifactData.supporters || []),
        source: 'matched',
        inventoryIndex: item.index,
        artifactData,
        matchConfidence: match.confidence,
      });
    } else {
      // Inventory-only item (not in structured artifact)
      options.push({
        id: `unified-${item.index}`,
        label: item.label,
        summary: item.summary,
        citations: item.citations,
        source: 'inventory_only',
        inventoryIndex: item.index,
        matchConfidence: 'none',
      });
    }
  }
  
  // 2. Process artifact items not matched to inventory
  if (artifact) {
    artifact.consensus.claims.forEach((claim, i) => {
      const id = `consensus-${i}`;
      if (matchedArtifactIds.has(id)) return;
      
      options.push({
        id: `unified-artifact-consensus-${i}`,
        label: claim.text,
        summary: '',
        citations: claim.supporters || [],
        source: 'artifact_only',
        artifactData: {
          type: 'consensus',
          originalId: id,
          dimension: claim.dimension,
          applies_when: claim.applies_when,
          support_count: claim.support_count,
          supporters: claim.supporters,
        },
        matchConfidence: 'none',
      });
    });
    
    artifact.outliers.forEach((outlier, i) => {
      const id = `outlier-${i}`;
      if (matchedArtifactIds.has(id)) return;
      
      options.push({
        id: `unified-artifact-outlier-${i}`,
        label: outlier.insight,
        summary: outlier.raw_context || '',
        citations: typeof outlier.source_index === 'number' ? [outlier.source_index] : [],
        source: 'artifact_only',
        artifactData: {
          type: outlier.type === 'frame_challenger' ? 'frame_challenger' : 'supplemental',
          originalId: id,
          dimension: outlier.dimension,
          applies_when: outlier.applies_when,
          source: outlier.source,
          challenges: outlier.challenges,
        },
        matchConfidence: 'none',
      });
    });
  }
  
  // 3. Calculate stats
  const matched = options.filter(o => o.source === 'matched').length;
  const inventoryOnly = options.filter(o => o.source === 'inventory_only').length;
  const artifactOnly = options.filter(o => o.source === 'artifact_only').length;
  
  let matchQuality: 'good' | 'partial' | 'poor';
  if (parsedInventory.length === 0 && artifact) {
    matchQuality = 'partial'; // No inventory to match against
  } else if (matched / Math.max(1, parsedInventory.length) >= 0.8) {
    matchQuality = 'good';
  } else if (matched / Math.max(1, parsedInventory.length) >= 0.5) {
    matchQuality = 'partial';
  } else {
    matchQuality = 'poor';
  }
  
  return {
    options,
    stats: {
      totalOptions: options.length,
      matched,
      inventoryOnly,
      artifactOnly,
      matchQuality,
    },
  };
}
Task 5: Create Unified-to-Showcase Converter
File: ui/components/artifact/content-builders.ts

Add this function to convert UnifiedOption[] into the format needed by processArtifactForShowcase:

TypeScript

/**
 * Convert UnifiedOption[] to SelectableShowcaseItem[] for processing.
 * This bridges the reconciliation layer with the existing showcase processor.
 */
export function unifiedOptionsToShowcaseItems(
  options: UnifiedOption[]
): SelectableShowcaseItem[] {
  return options.map((opt): SelectableShowcaseItem => {
    // Determine type from artifact data or default to consensus
    let type: ShowcaseItemType = 'consensus';
    if (opt.artifactData?.type === 'frame_challenger') {
      type = 'frame_challenger';
    } else if (opt.artifactData?.type === 'supplemental') {
      type = 'supplemental';
    } else if (opt.source === 'inventory_only') {
      // Inventory-only items default to supplemental (unknown structured type)
      type = 'supplemental';
    }
    
    return {
      id: opt.artifactData?.originalId || opt.id,
      text: opt.label,
      detail: opt.summary || undefined,
      type,
      dimension: opt.artifactData?.dimension,
      applies_when: opt.artifactData?.applies_when,
      source: opt.artifactData?.source,
      challenges: opt.artifactData?.challenges,
      graphSupportCount: opt.artifactData?.support_count || opt.citations.length,
      graphSupporters: opt.artifactData?.supporters || opt.citations,
    };
  });
}
Task 6: Update processArtifactForShowcase
File: ui/components/artifact/content-builders.ts

Modify processArtifactForShowcase to accept pre-reconciled items OR fall back to current behavior:

TypeScript

/**
 * Process artifact data into showcase structure.
 * 
 * @param artifact - The mapper artifact
 * @param graphTopology - Graph topology for edge-based grouping
 * @param preReconciledItems - Optional pre-reconciled items (preferred if available)
 */
export function processArtifactForShowcase(
  artifact: MapperArtifact,
  graphTopology?: GraphTopology | null,
  preReconciledItems?: SelectableShowcaseItem[]
): ProcessedShowcase {
  const nodes = Array.isArray(graphTopology?.nodes) ? graphTopology!.nodes : [];
  const edges = Array.isArray(graphTopology?.edges) ? graphTopology!.edges : [];

  // Use pre-reconciled items if provided, otherwise build from artifact
  let items: SelectableShowcaseItem[];
  
  if (preReconciledItems && preReconciledItems.length > 0) {
    items = preReconciledItems;
  } else {
    // Original behavior: build from artifact directly
    items = [];
    
    (artifact?.consensus?.claims || []).forEach((claim, i) => {
      const parsed = splitTitleDesc(claim.text);
      items.push({
        id: `consensus-${i}`,
        text: parsed.title,
        detail: parsed.desc,
        type: "consensus",
        dimension: claim.dimension,
        applies_when: claim.applies_when,
        graphSupportCount: claim.support_count,
        graphSupporters: claim.supporters,
      });
    });

    (artifact?.outliers || []).forEach((o, i) => {
      const parsed = splitTitleDesc(o.insight);
      items.push({
        id: `outlier-${i}`,
        text: parsed.title,
        detail: parsed.desc,
        type: o.type === "frame_challenger" ? "frame_challenger" : "supplemental",
        dimension: o.dimension,
        applies_when: o.applies_when,
        source: o.source,
        challenges: o.challenges,
      });
    });
  }

  // ... rest of function remains unchanged (graph matching, grouping, etc.)
Note: Only the function signature and the first block (item construction) changes. All the graph matching, bifurcation detection, bundle building, and sorting logic stays exactly the same.

Task 7: Update ArtifactShowcase Component
File: ui/components/artifact/ArtifactShowcase.tsx

Update the showcase to use reconciliation:

1. Add import:

TypeScript

import {
    // ... existing imports ...
    reconcileOptions,
    unifiedOptionsToShowcaseItems,
    type ReconciliationResult,
} from "./content-builders";
2. Add reconciliation memo (add after mapperOptionsText memo):

TypeScript

const reconciliation: ReconciliationResult | null = useMemo(() => {
    if (!artifactForDisplay) return null;
    return reconcileOptions(mapperOptionsText, artifactForDisplay);
}, [mapperOptionsText, artifactForDisplay]);

const reconciledItems = useMemo(() => {
    if (!reconciliation) return null;
    return unifiedOptionsToShowcaseItems(reconciliation.options);
}, [reconciliation]);
3. Update the processed memo to use reconciled items:

TypeScript

const processed: ProcessedShowcase | null = useMemo(() => {
    if (!artifactForDisplay) return null;
    // Pass reconciled items if available
    return processArtifactForShowcase(
        artifactForDisplay, 
        graphTopology,
        reconciledItems || undefined
    );
}, [artifactForDisplay, graphTopology, reconciledItems]);
4. Remove the separate detail attachment logic (processedWithDetails memo):

Since details are now attached during reconciliation, you can simplify:

TypeScript

// REMOVE this entire memo:
// const processedWithDetails: ProcessedShowcase | null = useMemo(() => { ... });

// REPLACE with:
const processedWithDetails = processed; // Details already attached
5. Optionally add a reconciliation quality indicator (in the header area):

TypeScript

{reconciliation && reconciliation.stats.matchQuality !== 'good' && (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-xs text-amber-300">
        ⚠️ Partial reconciliation ({reconciliation.stats.matched}/{reconciliation.stats.totalOptions})
    </span>
)}
Task 8: Update Selection Logic
File: ui/components/artifact/ArtifactShowcase.tsx

The selectedArtifacts memo needs to be updated to handle the new ID format:

TypeScript

const selectedArtifacts = useMemo(() => {
    const out: SelectedArtifact[] = [];
    const ids = Array.from(selectedIds);
    ids.sort();
    
    for (const id of ids) {
        // Handle both old ("consensus-0") and new ("unified-1") ID formats
        
        // Try to find in reconciliation first
        if (reconciliation) {
            const unified = reconciliation.options.find(o => 
                o.id === id || o.artifactData?.originalId === id
            );
            if (unified) {
                out.push({
                    id,
                    kind: unified.artifactData?.type === 'consensus' 
                        ? 'consensus_claim' 
                        : 'outlier',
                    text: unified.label,
                    dimension: unified.artifactData?.dimension,
                    source: unified.artifactData?.source,
                    meta: {
                        applies_when: unified.artifactData?.applies_when,
                        support_count: unified.artifactData?.support_count,
                        supporters: unified.artifactData?.supporters,
                        type: unified.artifactData?.type,
                        summary: unified.summary,
                    },
                });
                continue;
            }
        }
        
        // Fallback to direct artifact lookup (backward compatibility)
        if (id.startsWith("consensus-")) {
            const idx = Number(id.slice("consensus-".length));
            const claim = artifactForDisplay?.consensus?.claims?.[idx];
            if (!claim) continue;
            out.push({
                id,
                kind: "consensus_claim",
                text: claim.text,
                dimension: claim.dimension,
                meta: {
                    applies_when: claim.applies_when,
                    support_count: claim.support_count,
                    supporters: claim.supporters,
                },
            });
            continue;
        }
        
        if (id.startsWith("outlier-")) {
            const idx = Number(id.slice("outlier-".length));
            const o = artifactForDisplay?.outliers?.[idx];
            if (!o) continue;
            out.push({
                id,
                kind: "outlier",
                text: o.insight,
                dimension: o.dimension,
                source: o.source,
                meta: {
                    type: o.type,
                    raw_context: o.raw_context,
                    applies_when: o.applies_when,
                    source_index: o.source_index,
                },
            });
            continue;
        }
    }
    return out;
}, [artifactForDisplay, selectedIds, reconciliation]);
Verification
After implementation, test with these scenarios:

Scenario 1: More inventory items than structured claims
text

options_inventory: 11 items
consensus: 4 claims
outliers: 2 outliers
Expected: 11 unified options displayed (some marked as inventory_only)

Scenario 2: Fewer inventory items than structured claims
text

options_inventory: 5 items
consensus: 3 claims
outliers: 3 outliers (total 6)
Expected: 6 unified options displayed (1 marked as artifact_only)

Scenario 3: No options_inventory
text

options_inventory: null
consensus: 4 claims
outliers: 2 outliers
Expected: Falls back to current behavior, 6 items from artifact

Scenario 4: Good match
text

options_inventory: 6 items (all match structured claims)
consensus: 4 claims
outliers: 2 outliers
Expected: 6 unified options, all marked as 'matched', quality='good'

Summary of Changes
File	Change
content-builders.ts	Add types: ParsedInventoryItem, UnifiedOption, ReconciliationResult
content-builders.ts	Add function: parseOptionsInventory()
content-builders.ts	Add function: matchInventoryToArtifact()
content-builders.ts	Add function: reconcileOptions()
content-builders.ts	Add function: unifiedOptionsToShowcaseItems()
content-builders.ts	Modify: processArtifactForShowcase() to accept pre-reconciled items
ArtifactShowcase.tsx	Add memos: reconciliation, reconciledItems
ArtifactShowcase.tsx	Update memo: processed to use reconciled items
ArtifactShowcase.tsx	Remove: processedWithDetails memo (details now attached during reconciliation)
ArtifactShowcase.tsx	Update: selectedArtifacts memo for new ID handling