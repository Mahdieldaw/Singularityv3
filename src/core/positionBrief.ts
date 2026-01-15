// ═══════════════════════════════════════════════════════════════════════════
// POSITION BRIEF - Spatial Arrangement of Claims for Concierge
// ═══════════════════════════════════════════════════════════════════════════
//
// Philosophy: Shape data builders computed the intelligence (what's floor vs
// outlier, what's the central conflict, what's dominated, etc.). We USE that
// computation to determine WHICH claims to show and WHERE to position them.
//
// Concierge sees: Spatially arranged positions (side-by-side, indented, divided)
// Concierge does NOT see: Labels, percentages, rankings, shape names, pattern names
//
// Two paths:
// A) Shape-Aware Spatial Brief - uses shape.data to intelligently arrange
// B) Edge-Based Fallback - builds from edge relationships when shape.data missing
// ═══════════════════════════════════════════════════════════════════════════

import type {
    StructuralAnalysis,
    EnrichedClaim,
    Edge,
    SettledShapeData,
    ContestedShapeData,
    TradeoffShapeData,
    DimensionalShapeData,
    ExploratoryShapeData,
} from '../../shared/contract';

// ═══════════════════════════════════════════════════════════════════════════
// FORMATTING UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wrap text to specified width, returning array of lines
 */
function wrapText(text: string, width: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
        if ((current + ' ' + word).trim().length <= width) {
            current = (current + ' ' + word).trim();
        } else {
            if (current) lines.push(current);
            current = word;
        }
    }
    if (current) lines.push(current);
    return lines;
}

/**
 * Format two claims side-by-side in box format
 * Visual implies: These are alternatives/tensions
 */
function formatSideBySide(a: { text: string }, b: { text: string }): string {
    const width = 38;
    const aLines = wrapText(a.text, width);
    const bLines = wrapText(b.text, width);
    const maxLines = Math.max(aLines.length, bLines.length);

    let result = "┌" + "─".repeat(width + 2) + "┬" + "─".repeat(width + 2) + "┐\n";
    for (let i = 0; i < maxLines; i++) {
        const aLine = (aLines[i] || "").padEnd(width);
        const bLine = (bLines[i] || "").padEnd(width);
        result += `│ ${aLine} │ ${bLine} │\n`;
    }
    result += "└" + "─".repeat(width + 2) + "┴" + "─".repeat(width + 2) + "┘\n\n";
    return result;
}

/**
 * Format two claims side-by-side with their supporting claims indented below
 */
function formatSideBySideWithSupport(
    claimA: { text: string },
    supportsA: Array<{ label: string }>,
    claimB: { text: string },
    supportsB: Array<{ label: string }>
): string {
    // Main claims side-by-side
    let result = formatSideBySide(claimA, claimB);

    // Supporting claims indented below
    const maxSupports = Math.max(supportsA.length, supportsB.length);
    if (maxSupports > 0) {
        for (let i = 0; i < maxSupports; i++) {
            const suppA = supportsA[i];
            const suppB = supportsB[i];
            if (suppA) result += `  ${suppA.label}\n`;
            if (suppB) result += `  ${suppB.label}\n`;
        }
        result += "\n";
    }

    return result;
}

/**
 * Format a chain of claims vertically with connectors
 * Visual implies: Sequential/dependency relationship
 */
function formatChain(chainIds: string[], claims: EnrichedClaim[]): string {
    let result = "";
    for (let i = 0; i < chainIds.length; i++) {
        const claim = claims.find(c => c.id === chainIds[i]);
        if (!claim) continue;
        result += `${claim.text}\n`;
        if (i < chainIds.length - 1) result += "  ↔\n";
    }
    return result + "\n";
}

/**
 * Format an anchor claim with its supporters indented below
 * Visual implies: Elaboration/support relationship
 */
function formatBundle(bundle: { anchor: EnrichedClaim; supporting: EnrichedClaim[] }): string {
    let result = `${bundle.anchor.text}\n`;
    for (const s of bundle.supporting) {
        result += `  ${s.text}\n`;
    }
    return result + "\n";
}

/**
 * Interleave secondary items among primary items (scatter assumptions among floor)
 */
function interleave<T>(primary: T[], secondary: T[]): T[] {
    const result: T[] = [];
    const step = Math.max(1, Math.floor(primary.length / (secondary.length + 1)));

    let secIdx = 0;
    for (let i = 0; i < primary.length; i++) {
        result.push(primary[i]);
        if ((i + 1) % step === 0 && secIdx < secondary.length) {
            result.push(secondary[secIdx++]);
        }
    }
    // Add remaining secondary
    while (secIdx < secondary.length) {
        result.push(secondary[secIdx++]);
    }
    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// SHAPE-AWARE SPATIAL BRIEFS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CONVERGENT: Floor + Assumptions (scattered) + Challengers + Gaps
 * 
 * Includes: Floor, assumptions (scattered), ALL challengers, blind spots
 * Excludes: floorStrength label, outlier ranking labels, support percentages
 */
function buildConvergentBrief(data: SettledShapeData): string {
    let brief = "";

    // Floor claims with assumptions scattered (no grouping label)
    const floorTexts = data.floor.map(f => f.text);
    const floorWithAssumptions = interleave(floorTexts, data.floorAssumptions);

    for (const text of floorWithAssumptions) {
        brief += `${text}\n\n`;
    }

    // Divider before minority voices
    brief += "───\n\n";

    // Strongest outlier first (3-tier selection already computed)
    if (data.strongestOutlier) {
        brief += `${data.strongestOutlier.claim.text}\n\n`;
    }

    // ALL other challengers (not just strongest)
    for (const challenger of data.challengers) {
        if (challenger.id !== data.strongestOutlier?.claim.id) {
            brief += `${challenger.text}\n\n`;
        }
    }

    // Blind spots at end (gaps)
    if (data.blindSpots.length > 0) {
        brief += "───\n\n";
        for (const gap of data.blindSpots) {
            brief += `${gap}\n\n`;
        }
    }

    return brief;
}

/**
 * FORKED: Central Conflict + Supporting Claims + Secondary + Floor
 * 
 * Includes: Central conflict positions, supporting claims (indented), secondary conflicts, floor, fragilities
 * Excludes: Stakes labels, dynamics labels, significance scores
 */
function buildForkedBrief(data: ContestedShapeData): string {
    let brief = "";
    const conflict = data.centralConflict;

    if (conflict.type === 'individual') {
        // Two positions side-by-side with supporting claims
        brief += formatSideBySideWithSupport(
            conflict.positionA.claim,
            conflict.positionA.supportingClaims,
            conflict.positionB.claim,
            conflict.positionB.supportingClaims
        );
    } else {
        // One target vs multiple challengers
        brief += `${conflict.target.claim.text}\n`;
        for (const support of conflict.target.supportingClaims) {
            brief += `  ${support.label}\n`;
        }
        brief += "\n───\n\n";
        for (const challenger of conflict.challengers.claims) {
            brief += `${challenger.text}\n\n`;
        }
    }

    // Secondary conflicts (other tensions beyond central)
    for (const secondary of data.secondaryConflicts.slice(0, 2)) {
        brief += formatSideBySide(
            { text: secondary.claimA.text },
            { text: secondary.claimB.text }
        );
    }

    // Floor (agreed context)
    if (data.floor.exists && data.floor.claims.length > 0) {
        brief += "───\n\n";
        for (const floor of data.floor.claims) {
            brief += `${floor.text}\n\n`;
        }
    }

    // Fragilities (leverage inversions) - use claimLabel field
    if (data.fragilities.leverageInversions.length > 0) {
        brief += "───\n\n";
        for (const inv of data.fragilities.leverageInversions) {
            brief += `${inv.claimLabel}\n\n`;
        }
    }

    return brief;
}

/**
 * CONSTRAINED: Tradeoffs (Non-Dominated) + Floor + Dominated
 * 
 * Includes: Non-dominated tradeoffs, floor, dominated options (at end, no reason)
 * Excludes: Domination reason strings, symmetry labels
 */
function buildConstrainedBrief(data: TradeoffShapeData): string {
    let brief = "";
    const dominatedIds = new Set(data.dominatedOptions.map(d => d.dominated));

    // Non-dominated tradeoffs side-by-side
    for (const tradeoff of data.tradeoffs) {
        const aIsDom = dominatedIds.has(tradeoff.optionA.id);
        const bIsDom = dominatedIds.has(tradeoff.optionB.id);

        if (!aIsDom && !bIsDom) {
            brief += formatSideBySide(
                { text: tradeoff.optionA.text },
                { text: tradeoff.optionB.text }
            );
        } else if (!aIsDom) {
            brief += `${tradeoff.optionA.text}\n\n`;
        } else if (!bIsDom) {
            brief += `${tradeoff.optionB.text}\n\n`;
        }
    }

    // Floor (non-tradeoff context)
    if (data.floor.length > 0) {
        brief += "───\n\n";
        for (const floor of data.floor) {
            brief += `${floor.text}\n\n`;
        }
    }

    // Dominated options at end (no reason why)
    const dominated = data.dominatedOptions;
    if (dominated.length > 0) {
        brief += "───\n\n";
        for (const dom of dominated) {
            const claim = data.tradeoffs
                .flatMap(t => [t.optionA, t.optionB])
                .find(o => o.id === dom.dominated);
            if (claim) {
                brief += `${claim.text}\n\n`;
            }
        }
    }

    return brief;
}

/**
 * PARALLEL: Governing Conditions + Dimensions + Gaps
 * 
 * Includes: Governing conditions, all dimensions, gaps
 * Excludes: Theme labels, "dominant"/"hidden" labels, cohesion scores, interaction labels
 * 
 * Note: Hidden dimension is positioned LAST after dividers. Position implies it's different without labeling.
 */
function buildParallelBrief(data: DimensionalShapeData): string {
    let brief = "";

    // Governing conditions first (conditional claims that affect all dimensions)
    if (data.governingConditions.length > 0) {
        for (const cond of data.governingConditions) {
            brief += `${cond}\n\n`;
        }
        brief += "───\n\n";
    }

    // All dimensions EXCEPT hidden (show hidden last)
    const hiddenId = data.hiddenDimension?.id;
    const visibleDimensions = data.dimensions.filter(d => d.id !== hiddenId);

    for (let i = 0; i < visibleDimensions.length; i++) {
        const dim = visibleDimensions[i];

        for (const claim of dim.claims) {
            brief += `${claim.text}\n\n`;
        }

        if (i < visibleDimensions.length - 1) {
            brief += "───\n\n";
        }
    }

    // Hidden dimension LAST (implies overlooked without label)
    if (data.hiddenDimension && data.hiddenDimension.claims.length > 0) {
        brief += "───\n\n";
        for (const claim of data.hiddenDimension.claims) {
            brief += `${claim.text}\n\n`;
        }
    }

    // Gaps at end
    if (data.gaps.length > 0) {
        brief += "───\n\n";
        for (const gap of data.gaps) {
            brief += `${gap}\n\n`;
        }
    }

    return brief;
}

/**
 * SPARSE: Coverage Note + Signals + Clusters + Isolated + Boundary
 * 
 * Includes: Coverage note (factual), signals, clusters, isolated, boundary
 * Excludes: sparsityReasons (explanations), clarifyingQuestions
 * 
 * Note: Field is `outerBoundary`, not `outerBoundaryClaim`
 */
function buildSparseBrief(data: ExploratoryShapeData): string {
    let brief = "";

    // Minimal coverage note (factual, one line)
    if (data.signalStrength < 0.4) {
        brief += "Coverage is thin.\n\n";
    }

    // Strongest signals (by computed strength and connectivity)
    for (const signal of data.strongestSignals) {
        brief += `${signal.text}\n\n`;
    }

    // Loose clusters
    for (const cluster of data.looseClusters) {
        if (cluster.claims.length > 0) {
            brief += "───\n\n";
            for (const claim of cluster.claims) {
                brief += `${claim.text}\n\n`;
            }
        }
    }

    // Isolated claims
    if (data.isolatedClaims.length > 0) {
        brief += "───\n\n";
        for (const claim of data.isolatedClaims.slice(0, 3)) {
            brief += `${claim.text}\n\n`;
        }
    }

    // Outer boundary (the edge of what's known)
    if (data.outerBoundary) {
        brief += "───\n\n";
        brief += `${data.outerBoundary.text}\n\n`;
    }

    return brief;
}

// ═══════════════════════════════════════════════════════════════════════════
// EDGE-BASED FALLBACK (Geometry Only - no shape data)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build tension pairs from conflict/tradeoff edges
 */
function buildTensionPairs(
    claims: EnrichedClaim[],
    tensionEdges: Edge[]
): Array<[EnrichedClaim, EnrichedClaim]> {
    const pairs: Array<[EnrichedClaim, EnrichedClaim]> = [];
    const usedIds = new Set<string>();

    for (const edge of tensionEdges) {
        if (usedIds.has(edge.from) || usedIds.has(edge.to)) continue;
        const a = claims.find(c => c.id === edge.from);
        const b = claims.find(c => c.id === edge.to);
        if (a && b) {
            pairs.push([a, b]);
            usedIds.add(a.id);
            usedIds.add(b.id);
        }
    }
    return pairs;
}

/**
 * Build prerequisite chains from edges
 */
function buildPrerequisiteChains(
    claims: EnrichedClaim[],
    prereqEdges: Edge[]
): string[][] {
    const chains: string[][] = [];
    const hasIncoming = new Set(prereqEdges.map(e => e.to));
    const roots = claims.filter(c => !hasIncoming.has(c.id));
    const visited = new Set<string>();

    function follow(id: string): string[] {
        if (visited.has(id)) return [];
        visited.add(id);
        const chain = [id];
        const next = prereqEdges.filter(e => e.from === id);
        if (next.length > 0) {
            // Explore all branches and pick the longest one
            let longestBranch: string[] = [];
            for (const edge of next) {
                const branch = follow(edge.to);
                if (branch.length > longestBranch.length) {
                    longestBranch = branch;
                }
            }
            chain.push(...longestBranch);
        }
        return chain;
    }

    for (const root of roots) {
        const chain = follow(root.id);
        if (chain.length >= 2) chains.push(chain);
    }
    return chains;
}

/**
 * Build support bundles from edges
 */
function buildSupportBundles(
    claims: EnrichedClaim[],
    supportEdges: Edge[]
): Array<{ anchor: EnrichedClaim; supporting: EnrichedClaim[] }> {
    const bundles: Array<{ anchor: EnrichedClaim; supporting: EnrichedClaim[] }> = [];
    const byTarget = new Map<string, string[]>();

    for (const edge of supportEdges) {
        const existing = byTarget.get(edge.to) || [];
        existing.push(edge.from);
        byTarget.set(edge.to, existing);
    }

    byTarget.forEach((supporterIds, targetId) => {
        const anchor = claims.find(c => c.id === targetId);
        const supporting = supporterIds
            .map(id => claims.find(c => c.id === id))
            .filter((c): c is EnrichedClaim => !!c);
        if (anchor && supporting.length > 0) {
            bundles.push({ anchor, supporting });
        }
    });
    return bundles;
}

/**
 * Find minority voices without shape-specific context
 */
function findMinorityVoices(claims: EnrichedClaim[]): EnrichedClaim[] {
    return claims
        .filter(c =>
            c.isLeverageInversion ||
            (c.role === 'challenger' && c.supporters.length >= 1) ||
            (c.isIsolated && c.supporters.length >= 2)
        )
        .sort((a, b) => b.leverage - a.leverage)
        .slice(0, 3);
}

/**
 * Edge-based fallback when shape.data is missing
 * Builds spatial brief purely from edge relationships
 */
function buildEdgeBasedBrief(analysis: StructuralAnalysis): string {
    const { claimsWithLeverage: claims, edges } = analysis;

    if (claims.length === 0) return "";

    let brief = "";
    const usedClaimIds = new Set<string>();

    const supports = edges.filter(e => e.type === 'supports');
    const prereqs = edges.filter(e => e.type === 'prerequisite');
    const tensions = edges.filter(e => e.type === 'conflicts' || e.type === 'tradeoff');

    // Tension pairs (side-by-side)
    const tensionPairs = buildTensionPairs(claims, tensions);
    for (const [a, b] of tensionPairs) {
        brief += formatSideBySide(a, b);
        usedClaimIds.add(a.id);
        usedClaimIds.add(b.id);
    }

    // Prerequisite chains (vertical with ↔)
    const chains = buildPrerequisiteChains(claims, prereqs);
    for (const chain of chains) {
        const unused = chain.filter(id => !usedClaimIds.has(id));
        if (unused.length > 1) {
            brief += formatChain(unused, claims);
            unused.forEach(id => usedClaimIds.add(id));
        }
    }

    // Support bundles (indented)
    const bundles = buildSupportBundles(claims, supports);
    for (const bundle of bundles) {
        if (!usedClaimIds.has(bundle.anchor.id)) {
            brief += formatBundle(bundle);
            usedClaimIds.add(bundle.anchor.id);
            bundle.supporting.forEach(s => usedClaimIds.add(s.id));
        }
    }

    // Independent claims
    const independent = claims.filter(c => !usedClaimIds.has(c.id));
    for (const claim of independent) {
        brief += `${claim.text}\n\n`;
    }

    // Minority voices (no label explaining why)
    const minorities = findMinorityVoices(claims);
    if (minorities.length > 0) {
        brief += "───\n\n";
        for (const voice of minorities) {
            if (!usedClaimIds.has(voice.id)) {
                brief += `${voice.text}\n\n`;
            }
        }
    }

    return brief;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DISPATCHER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build position brief for concierge - the main dispatcher
 * 
 * If shape.data exists, uses shape-aware spatial formatting
 * Otherwise falls back to edge-based geometry
 */
export function buildPositionBrief(analysis: StructuralAnalysis): string {
    const { shape } = analysis;
    const data = shape.data;

    // If shape data exists, use shape-aware formatting
    // Otherwise fall back to edge-based geometry
    if (!data) {
        return buildEdgeBasedBrief(analysis);
    }

    switch (shape.primary) {
        case 'convergent':
            return buildConvergentBrief(data as SettledShapeData);
        case 'forked':
            return buildForkedBrief(data as ContestedShapeData);
        case 'constrained':
            return buildConstrainedBrief(data as TradeoffShapeData);
        case 'parallel':
            return buildParallelBrief(data as DimensionalShapeData);
        case 'sparse':
        default:
            return buildSparseBrief(data as ExploratoryShapeData);
    }
}
