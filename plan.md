Implementing Fixes 2-6
Let me work through each one with actual code.

Fix 3: Chain Depth (PromptMethods.ts)
This is foundational—other fixes depend on correct chain depth.

TypeScript

// ═══════════════════════════════════════════════════════════════════════════
// FIX 3: CHAIN DEPTH COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute actual depth for each claim based on longest chain position
 * and general DAG depth from roots
 */
const computeChainDepths = (
    claimIds: string[],
    edges: Edge[],
    longestChain: string[]
): Map<string, number> => {
    const depths = new Map<string, number>();
    
    // Initialize all to -1 (unvisited)
    claimIds.forEach(id => depths.set(id, -1));
    
    // Build prerequisite graph (from → to means "from" must come before "to")
    const prereqEdges = edges.filter(e => e.type === 'prerequisite');
    const children = new Map<string, string[]>();
    const hasIncoming = new Set<string>();
    
    claimIds.forEach(id => children.set(id, []));
    prereqEdges.forEach(e => {
        children.get(e.from)?.push(e.to);
        hasIncoming.add(e.to);
    });
    
    // Find roots (no incoming prerequisites)
    const roots = claimIds.filter(id => !hasIncoming.has(id));
    
    // BFS from roots to compute depth
    const queue: Array<{ id: string; depth: number }> = roots.map(id => ({ id, depth: 0 }));
    
    while (queue.length > 0) {
        const { id, depth } = queue.shift()!;
        
        // Only update if we haven't visited or found a longer path
        const current = depths.get(id) ?? -1;
        if (depth > current) {
            depths.set(id, depth);
            
            const next = children.get(id) ?? [];
            next.forEach(childId => {
                queue.push({ id: childId, depth: depth + 1 });
            });
        }
    }
    
    // For claims in longest chain, use chain position as authoritative
    longestChain.forEach((id, idx) => {
        depths.set(id, idx);
    });
    
    // Claims with no path from roots get depth 0
    claimIds.forEach(id => {
        if (depths.get(id) === -1) {
            depths.set(id, 0);
        }
    });
    
    return depths;
};
Update assignPercentileFlags to use it:

TypeScript

const assignPercentileFlags = (
    claims: Array<ReturnType<typeof computeClaimRatios>>,
    edges: Edge[],
    cascadeRisks: CascadeRisk[],
    topClaimIds: Set<string>,
    longestChain: string[]  // ADD THIS PARAMETER
): EnrichedClaim[] => {

    // ... existing code ...

    // Compute actual chain depths
    const chainDepths = computeChainDepths(
        claims.map(c => c.id),
        edges,
        longestChain
    );

    return claims.map(claim => {
        // ... existing flag computation ...

        // FIX: Use actual computed depth
        const chainDepth = chainDepths.get(claim.id) ?? 0;

        return {
            ...claim,
            evidenceGapScore,
            isHighSupport,
            isLeverageInversion,
            isKeystone,
            isEvidenceGap,
            isOutlier,
            isContested: hasConflict,
            isConditional: hasIncomingPrereq,
            isChallenger,
            isIsolated,
            chainDepth,  // Now actually meaningful
        };
    });
};
Update the call site in computeStructuralAnalysis:

TypeScript

// Step 5: Assign percentile-based flags (add longestChain parameter)
const claimsWithLeverage = assignPercentileFlags(
    claimsWithRatios, 
    edges, 
    cascadeRisks, 
    topClaimIds,
    graph.longestChain  // ADD THIS
);
Fix 5: Stance Conflict Detection (ConciergeService.ts)
Replace the current first-match-wins with confidence-based selection:

TypeScript

// ═══════════════════════════════════════════════════════════════════════════
// FIX 5: MULTI-SIGNAL STANCE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

interface StanceMatch {
    stance: ConciergeStance;
    confidence: number;
    pattern: string;  // For debugging
}

function detectAllQueryIntents(userMessage: string): StanceMatch[] {
    const lower = userMessage.toLowerCase();
    const matches: StanceMatch[] = [];

    // DECIDE signals
    const decidePatterns: Array<{ pattern: RegExp; confidence: number; name: string }> = [
        { pattern: /\bshould i\b/, confidence: 0.9, name: 'should_i' },
        { pattern: /\bjust tell me\b/, confidence: 0.9, name: 'just_tell_me' },
        { pattern: /\bwhat do i do\b/, confidence: 0.9, name: 'what_do_i_do' },
        { pattern: /\bmake (the |a )?decision\b/, confidence: 0.9, name: 'make_decision' },
        { pattern: /\bpick (one|the best)\b/, confidence: 0.9, name: 'pick_one' },
        { pattern: /\bwhich (one|should)\b/, confidence: 0.7, name: 'which_one' },
        { pattern: /\bchoose\b/, confidence: 0.7, name: 'choose' },
        { pattern: /\bbest\b/, confidence: 0.6, name: 'best' },
        { pattern: /\brecommend\b/, confidence: 0.7, name: 'recommend' },
    ];

    decidePatterns.forEach(({ pattern, confidence, name }) => {
        if (pattern.test(lower)) {
            matches.push({ stance: 'decide', confidence, pattern: name });
        }
    });

    // CHALLENGE signals
    const challengePatterns: Array<{ pattern: RegExp; confidence: number; name: string }> = [
        { pattern: /\bwhat('s| is) wrong\b/, confidence: 0.85, name: 'whats_wrong' },
        { pattern: /\bchallenge\b/, confidence: 0.85, name: 'challenge' },
        { pattern: /\bdevil'?s advocate\b/, confidence: 0.9, name: 'devils_advocate' },
        { pattern: /\bpoke holes\b/, confidence: 0.85, name: 'poke_holes' },
        { pattern: /\bstress test\b/, confidence: 0.85, name: 'stress_test' },
        { pattern: /\bwhat am i missing\b/, confidence: 0.85, name: 'what_missing' },
        { pattern: /\bblind spot/, confidence: 0.8, name: 'blind_spot' },
        { pattern: /\bweak(ness|point)/, confidence: 0.8, name: 'weakness' },
        { pattern: /\bcritique\b/, confidence: 0.8, name: 'critique' },
        { pattern: /\bpush back\b/, confidence: 0.85, name: 'push_back' },
        { pattern: /\battack\b/, confidence: 0.75, name: 'attack' },
    ];

    challengePatterns.forEach(({ pattern, confidence, name }) => {
        if (pattern.test(lower)) {
            matches.push({ stance: 'challenge', confidence, pattern: name });
        }
    });

    // EXPLORE signals
    const explorePatterns: Array<{ pattern: RegExp; confidence: number; name: string }> = [
        { pattern: /\bwhat are (the |my )?options\b/, confidence: 0.8, name: 'what_options' },
        { pattern: /\bexplore\b/, confidence: 0.8, name: 'explore' },
        { pattern: /\bmap out\b/, confidence: 0.8, name: 'map_out' },
        { pattern: /\bpossibilities\b/, confidence: 0.75, name: 'possibilities' },
        { pattern: /\balternatives\b/, confidence: 0.75, name: 'alternatives' },
        { pattern: /\bwhat else\b/, confidence: 0.7, name: 'what_else' },
        { pattern: /\btrade-?offs?\b/, confidence: 0.8, name: 'tradeoffs' },
        { pattern: /\bpros and cons\b/, confidence: 0.8, name: 'pros_cons' },
        { pattern: /\bcompare\b/, confidence: 0.7, name: 'compare' },
        { pattern: /\bbreak(down| it down)\b/, confidence: 0.75, name: 'breakdown' },
        { pattern: /\bwalk me through\b/, confidence: 0.75, name: 'walk_through' },
    ];

    explorePatterns.forEach(({ pattern, confidence, name }) => {
        if (pattern.test(lower)) {
            matches.push({ stance: 'explore', confidence, pattern: name });
        }
    });

    return matches;
}

function resolveStanceConflicts(matches: StanceMatch[]): { stance: ConciergeStance; confidence: number; reason: string } {
    if (matches.length === 0) {
        return { stance: 'default', confidence: 0.5, reason: 'no_signal' };
    }

    if (matches.length === 1) {
        return { 
            stance: matches[0].stance, 
            confidence: matches[0].confidence, 
            reason: `single_match:${matches[0].pattern}` 
        };
    }

    // Multiple matches - group by stance and sum confidence
    const byStance = new Map<ConciergeStance, { totalConfidence: number; patterns: string[] }>();
    
    matches.forEach(m => {
        const existing = byStance.get(m.stance) || { totalConfidence: 0, patterns: [] };
        existing.totalConfidence += m.confidence;
        existing.patterns.push(m.pattern);
        byStance.set(m.stance, existing);
    });

    // Find winner by total confidence
    let winner: ConciergeStance = 'default';
    let maxConfidence = 0;
    let winnerPatterns: string[] = [];

    byStance.forEach((data, stance) => {
        if (data.totalConfidence > maxConfidence) {
            maxConfidence = data.totalConfidence;
            winner = stance;
            winnerPatterns = data.patterns;
        }
    });

    // Check for close competition (within 0.2)
    const sorted = Array.from(byStance.entries()).sort((a, b) => b[1].totalConfidence - a[1].totalConfidence);
    const runnerUp = sorted[1];
    
    if (runnerUp && (maxConfidence - runnerUp[1].totalConfidence) < 0.2) {
        // Close call - note the conflict
        return {
            stance: winner,
            confidence: Math.min(0.7, maxConfidence / matches.length),  // Reduce confidence
            reason: `conflict_resolved:${winner}>${runnerUp[0]}:${winnerPatterns.join(',')}`
        };
    }

    return {
        stance: winner,
        confidence: Math.min(0.95, maxConfidence / matches.length),
        reason: `multi_match:${winnerPatterns.join(',')}`
    };
}

// Updated main detection function
function detectQueryIntent(userMessage: string): { stance: ConciergeStance; confidence: number; reason?: string } {
    const matches = detectAllQueryIntents(userMessage);
    const resolved = resolveStanceConflicts(matches);
    return { 
        stance: resolved.stance, 
        confidence: resolved.confidence,
        reason: resolved.reason
    };
}
Fix 2: Shape × Stance Conflict Handling (ConciergeService.ts)
Add explicit reconciliation for problematic combinations:

TypeScript

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2: SHAPE × STANCE CONFLICT RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

type ShapeStanceConflict = {
    resolution: 'override_stance' | 'modify_guidance' | 'add_caveat';
    newStance?: ConciergeStance;
    guidance?: string;
    caveat?: string;
};

function detectShapeStanceConflict(
    shape: ProblemStructure,
    stance: ConciergeStance
): ShapeStanceConflict | null {
    
    const pattern = shape.primaryPattern;
    const confidence = shape.confidence;
    
    // EXPLORATORY + DECIDE: Can't decide without structure
    if (pattern === 'exploratory' && stance === 'decide') {
        if (confidence < 0.3) {
            // Very sparse - refuse to decide
            return {
                resolution: 'modify_guidance',
                guidance: `The user wants a decision, but the evidence is too sparse to justify one.

Be honest: "I don't have enough signal to make this call for you."

Instead:
1. State the strongest signal you DO have (if any)
2. Identify the 1-2 questions that would unlock a decision
3. If forced, give a conditional: "If X is true, then Y. Otherwise, I can't say."

Do not pretend confidence you don't have.`
            };
        } else {
            // Some structure - use strongest signal
            return {
                resolution: 'add_caveat',
                caveat: `Structure is sparse. Base your decision on the strongest signal, but flag the uncertainty explicitly.`
            };
        }
    }
    
    // CONTEXTUAL + DECIDE: Missing info needed for decision
    if (pattern === 'contextual' && stance === 'decide') {
        return {
            resolution: 'modify_guidance',
            guidance: `The user wants a decision, but the answer genuinely depends on context you don't have.

Give a CONDITIONAL decision:
"If [condition A], do X. If [condition B], do Y."

Then ask the clarifying question that would collapse it to one answer.

Do not guess the context. Do not hedge. Give branching instructions.`
        };
    }
    
    // CONTESTED + DECIDE: Need to pick a side
    if (pattern === 'contested' && stance === 'decide') {
        return {
            resolution: 'modify_guidance',
            guidance: `The user wants a decision, but there's genuine disagreement in the evidence.

You must still decide. Here's how:
1. Acknowledge the axis of disagreement (briefly)
2. Apply eliminatory logic: Which position survives scrutiny better?
3. If truly 50/50, use the user's implied values from their query to break the tie
4. State your pick clearly, then explain what would change your mind

Do not present both sides equally. The user asked you to choose.`
        };
    }
    
    // SETTLED + CHALLENGE: Challenge the solid floor
    if (pattern === 'settled' && stance === 'challenge') {
        return {
            resolution: 'modify_guidance',
            guidance: `The user wants their thinking challenged, but the floor is solid.

Attack the edges, not the foundation:
1. What assumptions does the consensus require that aren't stated?
2. What edge cases or contexts would break the consensus?
3. What are the blind spots in the agreement?
4. Is the consensus right for the wrong reasons?

Find the cracks without pretending the structure is weak.`
        };
    }
    
    // KEYSTONE + EXPLORE: Exploration should center the keystone
    if (pattern === 'keystone' && stance === 'explore') {
        return {
            resolution: 'add_caveat',
            caveat: `Everything branches from the keystone. Explore outward from it—what depends on it, what challenges it, what alternatives exist if it fails.`
        };
    }

    return null;
}

function reconcileShapeStanceGuidance(
    shape: ProblemStructure,
    stance: ConciergeStance,
    originalStanceGuidance: StanceGuidance
): StanceGuidance {
    
    const conflict = detectShapeStanceConflict(shape, stance);
    
    if (!conflict) {
        return originalStanceGuidance;
    }
    
    switch (conflict.resolution) {
        case 'modify_guidance':
            return {
                ...originalStanceGuidance,
                behavior: conflict.guidance!
            };
            
        case 'add_caveat':
            return {
                ...originalStanceGuidance,
                behavior: `${conflict.caveat}\n\n${originalStanceGuidance.behavior}`
            };
            
        case 'override_stance':
            // Get guidance for the new stance
            return getStanceGuidance(conflict.newStance!);
            
        default:
            return originalStanceGuidance;
    }
}
Update buildConciergePrompt to use it:

TypeScript

export function buildConciergePrompt(
    userMessage: string,
    analysis: StructuralAnalysis,
    stance: ConciergeStance = 'default'
): string {
    const structuralBrief = buildStructuralBrief(analysis);
    const shapeGuidance = getShapeGuidance(analysis.shape);
    
    // FIX 2: Reconcile shape×stance conflicts
    const rawStanceGuidance = getStanceGuidance(stance);
    const stanceGuidance = reconcileShapeStanceGuidance(
        analysis.shape,
        stance,
        rawStanceGuidance
    );

    const framingLine = stanceGuidance.framing
        ? `\n${stanceGuidance.framing}\n`
        : '';

    return `You are Singularity—an intelligence that has drawn from multiple expert perspectives.${framingLine}

## The Query

"${userMessage}"

## What You Know

${structuralBrief}

## How To Respond

${shapeGuidance}

${stanceGuidance.behavior}

## Voice

${stanceGuidance.voice}

## Never

- Reference "models," "analysis," "structure," "claims"
- Hedge without explaining what you're uncertain about
- Be vague when you have signal
- Say "it depends" without saying on what

Respond.`;
}
Fix 4: Surface Leverage Inversions in All Shapes (ConciergeService.ts)
Add a utility function and integrate into brief builders:

TypeScript

// ═══════════════════════════════════════════════════════════════════════════
// FIX 4: LEVERAGE INVERSION SURFACING
// ═══════════════════════════════════════════════════════════════════════════

function buildFragileFoundationsSection(
    patterns: StructuralAnalysis['patterns'],
    claims: StructuralAnalysis['claimsWithLeverage'],
    landscape: StructuralAnalysis['landscape']
): string | null {
    
    const inversions = patterns.leverageInversions;
    
    if (inversions.length === 0) {
        return null;
    }
    
    let section = `## ⚠️ Fragile Foundations\n\n`;
    section += `These positions have few supporters but high structural importance:\n\n`;
    
    inversions.forEach(inv => {
        const claim = claims.find(c => c.id === inv.claimId);
        if (!claim) return;
        
        const reasonLabel = {
            'challenger_prerequisite_to_consensus': 'challenges the floor',
            'singular_foundation': 'enables other claims',
            'high_connectivity_low_support': 'high connectivity hub',
        }[inv.reason] || inv.reason;
        
        section += `**${inv.claimLabel}** [${inv.supporterCount}/${landscape.modelCount}] — ${reasonLabel}\n`;
        
        if (inv.affectedClaims.length > 0) {
            const affectedLabels = inv.affectedClaims
                .map(id => claims.find(c => c.id === id)?.label)
                .filter(Boolean)
                .slice(0, 3);
            section += `  → Affects: ${affectedLabels.join(', ')}${inv.affectedClaims.length > 3 ? '...' : ''}\n`;
        }
        section += `\n`;
    });
    
    section += `*If any of these are wrong, the landscape shifts.*\n`;
    
    return section;
}
Update each brief builder to include it:

TypeScript

function buildSettledBrief(analysis: StructuralAnalysis): string {
    const { shape, landscape, ratios, patterns, claimsWithLeverage } = analysis;
    const data = shape.data as SettledShapeData;

    if (!data || data.pattern !== 'settled') {
        return buildGenericBrief(analysis);
    }

    let brief = '';

    brief += `## Shape: SETTLED (${Math.round(shape.confidence * 100)}%)\n\n`;
    // ... existing code ...

    // FIX 4: Add fragile foundations
    const fragileSection = buildFragileFoundationsSection(patterns, claimsWithLeverage, landscape);
    if (fragileSection) {
        brief += fragileSection;
    }

    const contestedFloor = data.floor.filter(c => c.isContested);
    if (contestedFloor.length > 0) {
        brief += `## ⚠️ Warning\n\n`;
        brief += `${contestedFloor.length} floor claim(s) are under challenge. Settlement may be fragile.\n`;
    }

    return brief;
}

function buildLinearBrief(analysis: StructuralAnalysis): string {
    const { shape, landscape, ratios, patterns, claimsWithLeverage } = analysis;
    const data = shape.data as LinearShapeData;

    if (!data || data.pattern !== 'linear') {
        return buildGenericBrief(analysis);
    }

    let brief = '';

    brief += `## Shape: LINEAR (${Math.round(shape.confidence * 100)}%)\n\n`;
    // ... existing chain display code ...

    if (data.weakLinks.length > 0) {
        brief += `## Cascade Risks\n\n`;
        data.weakLinks.forEach(wl => {
            brief += `• **${wl.step.label}** — If this fails, ${wl.cascadeSize} downstream step(s) fail\n`;
        });
        brief += `\n`;
    }

    // FIX 4: Add fragile foundations (beyond just weak links)
    const fragileSection = buildFragileFoundationsSection(patterns, claimsWithLeverage, landscape);
    if (fragileSection) {
        brief += fragileSection;
    }

    return brief;
}

function buildKeystoneBrief(analysis: StructuralAnalysis): string {
    const { shape, landscape, patterns, claimsWithLeverage } = analysis;
    const data = shape.data as KeystoneShapeData;

    if (!data || data.pattern !== 'keystone') {
        return buildGenericBrief(analysis);
    }

    let brief = '';

    brief += `## Shape: KEYSTONE (${Math.round(shape.confidence * 100)}%)\n\n`;
    // ... existing keystone display code ...

    if (data.challengers.length > 0) {
        brief += `## Challengers to Keystone\n\n`;
        data.challengers.forEach(c => {
            brief += `⚡ **${c.label}** [${c.supportCount}/${landscape.modelCount}]\n`;
            brief += `${c.text}\n\n`;
        });
    }

    // FIX 4: Surface inversions that aren't the keystone itself
    const nonKeystoneInversions = patterns.leverageInversions.filter(
        inv => inv.claimId !== data.keystone.id
    );
    
    if (nonKeystoneInversions.length > 0) {
        const fragileSection = buildFragileFoundationsSection(
            { ...patterns, leverageInversions: nonKeystoneInversions },
            claimsWithLeverage,
            landscape
        );
        if (fragileSection) {
            brief += fragileSection;
        }
    }

    return brief;
}

// Also add to Dimensional and Tradeoff for completeness
function buildDimensionalBrief(analysis: StructuralAnalysis): string {
    // ... existing code ...
    
    // FIX 4: Add at end
    const fragileSection = buildFragileFoundationsSection(patterns, claimsWithLeverage, landscape);
    if (fragileSection) {
        brief += fragileSection;
    }
    
    return brief;
}

function buildTradeoffBrief(analysis: StructuralAnalysis): string {
    // ... existing code ...
    
    // FIX 4: Add at end
    const fragileSection = buildFragileFoundationsSection(patterns, claimsWithLeverage, landscape);
    if (fragileSection) {
        brief += fragileSection;
    }
    
    return brief;
}
Fix 6: Populate or Remove Empty Shape Data Fields (PromptMethods.ts)
6a. Alternative Chains for Linear Shape
TypeScript

const buildLinearShapeData = (
    claims: EnrichedClaim[],
    edges: Edge[],
    graph: GraphAnalysis,
    cascadeRisks: CascadeRisk[]
): LinearShapeData => {

    const prereqEdges = edges.filter(e => e.type === 'prerequisite');
    
    // Find all chain roots (no incoming prerequisites, has outgoing)
    const hasIncoming = new Set<string>();
    const hasOutgoing = new Set<string>();
    prereqEdges.forEach(e => {
        hasIncoming.add(e.to);
        hasOutgoing.add(e.from);
    });
    
    const chainRoots = claims
        .filter(c => !hasIncoming.has(c.id) && hasOutgoing.has(c.id))
        .map(c => c.id);

    // FIX 6: Build alternative chains from each root
    const buildChainFromRoot = (rootId: string): string[] => {
        const chain: string[] = [rootId];
        const visited = new Set<string>([rootId]);
        
        let current = rootId;
        while (true) {
            const next = prereqEdges
                .filter(e => e.from === current && !visited.has(e.to))
                .map(e => e.to);
            
            if (next.length === 0) break;
            
            // Follow highest-support path
            const nextClaim = next
                .map(id => claims.find(c => c.id === id))
                .filter(Boolean)
                .sort((a, b) => b!.supporters.length - a!.supporters.length)[0];
            
            if (!nextClaim) break;
            
            chain.push(nextClaim.id);
            visited.add(nextClaim.id);
            current = nextClaim.id;
        }
        
        return chain;
    };

    const allChains = chainRoots.map(root => buildChainFromRoot(root));
    const longestChainIds = new Set(graph.longestChain);
    
    // Alternative chains: not the main chain, length >= 2
    const alternativeChains = allChains
        .filter(chain => 
            chain.length >= 2 && 
            !chain.every(id => longestChainIds.has(id))
        )
        .map(chainIds => chainIds.map((id, idx) => {
            const claim = claims.find(c => c.id === id);
            return {
                id,
                label: claim?.label || id,
                text: claim?.text || '',
                supportCount: claim?.supporters.length || 0,
                supportRatio: claim?.supportRatio || 0,
                position: idx,
                enables: prereqEdges.filter(e => e.from === id).map(e => e.to),
                isWeakLink: (claim?.supporters.length || 0) <= 1,
                weakReason: null
            };
        }));

    // ... rest of existing buildLinearShapeData code, but replace:
    // alternativeChains: []
    // with:
    // alternativeChains: alternativeChains.slice(0, 3)  // Cap at 3
    
    // ... existing chain building for main chain ...

    return {
        pattern: 'linear',
        chain,
        chainLength: chain.length,
        weakLinks,
        alternativeChains: alternativeChains.slice(0, 3),  // FIX 6
        terminalClaim
    };
};
6b. Articulation Points for Contested Shape
TypeScript

const buildContestedShapeData = (
    claims: EnrichedClaim[],
    patterns: StructuralAnalysis['patterns'],
    conflictInfos: ConflictInfo[],
    conflictClusters: ConflictCluster[],
    graph: GraphAnalysis  // ADD THIS PARAMETER
): ContestedShapeData => {

    // ... existing centralConflict building ...

    // FIX 6: Populate articulation points
    const articulationPointClaims = graph.articulationPoints
        .map(id => claims.find(c => c.id === id))
        .filter(Boolean)
        .map(c => ({
            id: c!.id,
            label: c!.label,
            supportCount: c!.supporters.length,
            isLowSupport: !c!.isHighSupport
        }));

    return {
        pattern: 'contested',
        centralConflict,
        secondaryConflicts,
        floor: {
            exists: floorClaims.length > 0,
            claims: floorClaims.map(c => ({ /* ... */ })),
            strength: floorClaims.length > 2 ? 'strong' : floorClaims.length > 0 ? 'weak' : 'absent',
            isContradictory: false
        },
        fragilities: {
            leverageInversions: patterns.leverageInversions,
            articulationPoints: articulationPointClaims  // FIX 6
        },
        collapsingQuestion: `What matters more: ${centralConflict.axis}?`
    };
};
Update the call site:

TypeScript

case 'contested':
    shape.data = buildContestedShapeData(
        claimsWithLeverage,
        patterns,
        enrichedConflicts,
        conflictClusters,
        graph  // ADD THIS
    );
    break;
6c. Governing Factor for Tradeoffs (Heuristic)
TypeScript

const inferGoverningFactor = (
    optionA: EnrichedClaim,
    optionB: EnrichedClaim
): string | null => {
    // Look for conditional claims that might govern
    if (optionA.type === 'conditional') {
        // Extract condition from text (simple heuristic)
        const match = optionA.text.match(/^if\s+(.+?),/i);
        if (match) return match[1];
    }
    if (optionB.type === 'conditional') {
        const match = optionB.text.match(/^if\s+(.+?),/i);
        if (match) return match[1];
    }
    
    // Look for common discriminating words
    const discriminators = [
        { pattern: /\b(speed|fast|quick)\b/i, factor: 'speed vs thoroughness' },
        { pattern: /\b(cost|cheap|expensive|budget)\b/i, factor: 'cost constraints' },
        { pattern: /\b(simple|complex|sophisticated)\b/i, factor: 'complexity tolerance' },
        { pattern: /\b(scale|growth|small)\b/i, factor: 'scale requirements' },
        { pattern: /\b(risk|safe|conservative)\b/i, factor: 'risk tolerance' },
        { pattern: /\b(short.?term|long.?term)\b/i, factor: 'time horizon' },
    ];
    
    for (const { pattern, factor } of discriminators) {
        const aMatch = pattern.test(optionA.text);
        const bMatch = pattern.test(optionB.text);
        if (aMatch !== bMatch) {  // One has it, other doesn't
            return factor;
        }
    }
    
    return null;
};

const buildTradeoffShapeData = (
    claims: EnrichedClaim[],
    tradeoffPairs: TradeoffPair[]
): TradeoffShapeData => {

    const tradeoffs = tradeoffPairs.map((t, idx) => {
        const claimA = claims.find(c => c.id === t.claimA.id);
        const claimB = claims.find(c => c.id === t.claimB.id);

        // FIX 6: Infer governing factor
        const governingFactor = claimA && claimB 
            ? inferGoverningFactor(claimA, claimB)
            : null;

        return {
            id: `tradeoff_${idx}`,
            optionA: { /* ... */ },
            optionB: { /* ... */ },
            symmetry: t.symmetry as 'both_high' | 'both_low' | 'asymmetric',
            governingFactor  // FIX 6
        };
    });

    // ... rest unchanged
};
6d. Dimension Themes (Heuristic)
TypeScript

const inferDimensionTheme = (claims: EnrichedClaim[]): string => {
    // Count word frequencies across claim labels
    const wordCounts = new Map<string, number>();
    
    claims.forEach(c => {
        const words = c.label.toLowerCase().split(/\s+/);
        words.forEach(w => {
            if (w.length > 3) {  // Skip short words
                wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
            }
        });
    });
    
    // Find most common meaningful word
    const sorted = Array.from(wordCounts.entries())
        .filter(([word]) => !['the', 'and', 'for', 'with', 'that', 'this'].includes(word))
        .sort((a, b) => b[1] - a[1]);
    
    if (sorted.length > 0 && sorted[0][1] >= 2) {
        // Capitalize first letter
        const theme = sorted[0][0];
        return theme.charAt(0).toUpperCase() + theme.slice(1);
    }
    
    // Fallback: use first claim's first significant word
    if (claims.length > 0) {
        const firstWords = claims[0].label.split(/\s+/);
        const significant = firstWords.find(w => w.length > 3);
        if (significant) {
            return significant.charAt(0).toUpperCase() + significant.slice(1);
        }
    }
    
    return 'Factor';
};

const buildDimensionalShapeData = (
    claims: EnrichedClaim[],
    edges: Edge[],
    graph: GraphAnalysis,
    ghosts: string[]
): DimensionalShapeData => {

    const dimensions: DimensionCluster[] = graph.components
        .filter(comp => comp.length >= 2)
        .map((componentIds, idx) => {
            const componentClaims = claims.filter(c => componentIds.includes(c.id));

            // FIX 6: Infer theme from claims
            const theme = inferDimensionTheme(componentClaims);

            // ... rest unchanged
            
            return {
                id: `dim_${idx}`,
                theme,  // FIX 6: Now meaningful
                claims: componentClaims.map(c => ({ /* ... */ })),
                cohesion,
                avgSupport
            };
        });

    // ... rest unchanged
};
Summary of Changes
Fix	File	What Changed
2	ConciergeService.ts	Added detectShapeStanceConflict() and reconcileShapeStanceGuidance()
3	PromptMethods.ts	Added computeChainDepths(), updated assignPercentileFlags()
4	ConciergeService.ts	Added buildFragileFoundationsSection(), integrated into all brief builders
5	ConciergeService.ts	Replaced detectQueryIntent() with multi-match + conflict resolution
6	PromptMethods.ts	Populated alternativeChains, articulationPoints, governingFactor, theme