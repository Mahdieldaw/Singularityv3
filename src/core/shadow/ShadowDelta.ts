import {
    ShadowStatement,
    TwoPassResult,
    flattenValidated,
    countByType
} from './ShadowExtractor';
import { StatementType } from './StatementTypes';
import { MapperArtifact, Claim } from '../../../shared/contract';

// ═══════════════════════════════════════════════════════════════════
// OUTPUT TYPES
// ═══════════════════════════════════════════════════════════════════

export interface UnindexedStatement {
    text: string;
    type: StatementType;
    secondaryTypes: StatementType[];
    confidence: number;
    queryRelevance: number;
    adjustedScore: number;  // confidence × queryRelevance × typeWeight
    sourceModels: number[];
    reason: 'validated_by_shadow_not_in_primary';
}

export interface ShadowAudit {
    // Two-pass stats
    extraction: {
        totalSentences: number;
        pass1Candidates: number;
        pass2Validated: number;
        pass2Disqualified: number;
        survivalRate: number;
    };

    // Counts by type (validated only)
    shadowCounts: Record<StatementType, number>;

    // What Primary produced
    primaryCounts: {
        claims: number;
        conflictEdges: number;
        prerequisiteEdges: number;
        supportEdges: number;
        tradeoffEdges: number;
    };

    // Gap analysis
    gaps: {
        conflicts: number;       // Shadow conflicts - Primary conflict edges
        prerequisites: number;
        prescriptive: number;    // Primary doesn't have this category
    };

    // Type survival rates (how much filtering happened)
    typeSurvival: Record<StatementType, {
        beforePass2: number;
        afterPass2: number;
        survivalRate: number;
    }>;
}

export interface DeltaResult {
    audit: ShadowAudit;
    unindexed: UnindexedStatement[];
    processingTime: number;
}

// ═══════════════════════════════════════════════════════════════════
// TEXT MATCHING (Shadow statement vs Primary claim)
// ═══════════════════════════════════════════════════════════════════

function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function wordOverlap(a: string, b: string): number {
    const wordsA = new Set(normalizeText(a).split(' ').filter(w => w.length > 2));
    const wordsB = new Set(normalizeText(b).split(' ').filter(w => w.length > 2));

    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let overlap = 0;
    wordsA.forEach(word => {
        if (wordsB.has(word)) overlap++;
    });

    // Jaccard-like: overlap / union
    const unionSet = new Set(Array.from(wordsA).concat(Array.from(wordsB)));
    return overlap / unionSet.size;
}

// ═══════════════════════════════════════════════════════════════════
// INTEGRATION POINT 3: LENGTH-ADJUSTED WORD OVERLAP (RECOMMENDED)
// Longer sentences need lower Jaccard thresholds to prevent false negatives
// ═══════════════════════════════════════════════════════════════════

function findMatchingClaim(
    shadowText: string,
    primaryClaims: Claim[],
    baseThreshold: number = 0.4
): Claim | null {
    const shadowWords = normalizeText(shadowText).split(' ').filter(w => w.length > 2);

    // Adjust threshold for sentence length
    // Longer sentences naturally have lower Jaccard scores
    const threshold = shadowWords.length > 20
        ? baseThreshold * 0.75   // 0.30 for long sentences
        : shadowWords.length > 15
            ? baseThreshold * 0.85   // 0.34 for medium sentences
            : baseThreshold;          // 0.40 for short sentences

    let bestMatch: Claim | null = null;
    let bestScore = 0;

    for (const claim of primaryClaims) {
        const score = wordOverlap(shadowText, claim.text);
        if (score > bestScore && score >= threshold) {
            bestScore = score;
            bestMatch = claim;
        }
    }

    return bestMatch;
}

// ═══════════════════════════════════════════════════════════════════
// QUERY RELEVANCE SCORING
// ═══════════════════════════════════════════════════════════════════

interface QueryIntent {
    type: 'decision' | 'feasibility' | 'mechanism' | 'exploration';
    typeWeights: Record<StatementType, number>;
}

function detectQueryIntent(query: string): QueryIntent {
    const lower = query.toLowerCase();

    // Decision queries → conditional + conflict matter most (structural relationships)
    if (/\bshould\s+(i|we)\b/.test(lower) || /\bwhich\s+(is|should|would)\b/.test(lower)) {
        return {
            type: 'decision',
            typeWeights: {
                conditional: 1.5,     // Scope boundaries critical for decisions
                conflict: 1.4,        // Opposition matters
                prerequisite: 1.2,    // Dependencies matter
                prescriptive: 1.0,    // Advice is relevant
                assertive: 0.5        // Facts less useful here
            }
        };
    }

    // Feasibility queries → conditional + prerequisite matter most
    if (/\b(does|can|is\s+it)\b.*\b(work|possible|feasible|viable)\b/.test(lower)) {
        return {
            type: 'feasibility',
            typeWeights: {
                conditional: 1.5,     // Context is everything
                prerequisite: 1.4,    // Dependencies critical
                assertive: 1.2,       // Facts matter
                conflict: 0.7,        // Opposition less relevant
                prescriptive: 0.6     // Advice less relevant
            }
        };
    }

    // Mechanism queries → prerequisite + conditional matter most
    if (/\bhow\s+(does|do|can|to|would)\b/.test(lower)) {
        return {
            type: 'mechanism',
            typeWeights: {
                prerequisite: 1.5,    // Order matters
                conditional: 1.4,     // Context matters
                assertive: 1.0,       // Facts relevant
                conflict: 0.6,        // Opposition less relevant
                prescriptive: 0.5     // Advice less relevant
            }
        };
    }

    // Default: exploration (equal weights)
    return {
        type: 'exploration',
        typeWeights: {
            conditional: 1.0,
            prerequisite: 1.0,
            conflict: 1.0,
            prescriptive: 1.0,
            assertive: 1.0
        }
    };
}

function calculateQueryRelevance(text: string, query: string): number {
    return wordOverlap(text, query);
}

// ═══════════════════════════════════════════════════════════════════
// MAIN DELTA FUNCTION
// ═══════════════════════════════════════════════════════════════════

export function executeShadowDelta(
    shadowResult: TwoPassResult,
    primaryArtifact: MapperArtifact,
    userQuery: string
): DeltaResult {
    const startTime = performance.now();

    // ─────────────────────────────────────────────────────────────────
    // 1. Build Primary counts
    // ─────────────────────────────────────────────────────────────────
    const primaryCounts = {
        claims: primaryArtifact.claims.length,
        conflictEdges: primaryArtifact.edges.filter(e => e.type === 'conflicts').length,
        prerequisiteEdges: primaryArtifact.edges.filter(e => e.type === 'prerequisite').length,
        supportEdges: primaryArtifact.edges.filter(e => e.type === 'supports').length,
        tradeoffEdges: primaryArtifact.edges.filter(e => e.type === 'tradeoff').length
    };

    // ─────────────────────────────────────────────────────────────────
    // 2. Build Shadow counts (validated only)
    // ─────────────────────────────────────────────────────────────────
    const shadowCounts = countByType(shadowResult.validated);

    // ─────────────────────────────────────────────────────────────────
    // 3. Calculate gaps
    // ─────────────────────────────────────────────────────────────────
    const gaps = {
        conflicts: Math.max(0, shadowCounts.conflict - primaryCounts.conflictEdges),
        prerequisites: Math.max(0, shadowCounts.prerequisite - primaryCounts.prerequisiteEdges),
        prescriptive: shadowCounts.prescriptive  // Primary doesn't track this
    };

    // ─────────────────────────────────────────────────────────────────
    // 4. Build type survival data
    // ─────────────────────────────────────────────────────────────────
    const typeSurvival: Record<StatementType, { beforePass2: number; afterPass2: number; survivalRate: number }> = {
        prescriptive: { beforePass2: 0, afterPass2: 0, survivalRate: 0 },
        conflict: { beforePass2: 0, afterPass2: 0, survivalRate: 0 },
        prerequisite: { beforePass2: 0, afterPass2: 0, survivalRate: 0 },
        conditional: { beforePass2: 0, afterPass2: 0, survivalRate: 0 },
        assertive: { beforePass2: 0, afterPass2: 0, survivalRate: 0 }
    };

    for (const type of Object.keys(typeSurvival) as StatementType[]) {
        const before = shadowResult.stats.byType[type].pass1;
        const after = shadowResult.stats.byType[type].pass2;
        typeSurvival[type] = {
            beforePass2: before,
            afterPass2: after,
            survivalRate: before > 0 ? after / before : 0
        };
    }

    // ─────────────────────────────────────────────────────────────────
    // 5. Find unindexed statements (validated by Shadow, not in Primary)
    // ─────────────────────────────────────────────────────────────────
    const queryIntent = detectQueryIntent(userQuery);
    const allValidated = flattenValidated(shadowResult.validated);

    // Group by normalized text (dedup across models)
    const textGroups = new Map<string, ShadowStatement[]>();
    for (const stmt of allValidated) {
        const key = normalizeText(stmt.text);
        const group = textGroups.get(key) || [];
        group.push(stmt);
        textGroups.set(key, group);
    }

    const unindexed: UnindexedStatement[] = [];

    textGroups.forEach((statements) => {
        const representative = statements[0];

        // Check if Primary has this
        const matchedClaim = findMatchingClaim(representative.text, primaryArtifact.claims);

        if (!matchedClaim) {
            // Not in Primary → this is a gap
            const queryRelevance = calculateQueryRelevance(representative.text, userQuery);
            const typeWeight = queryIntent.typeWeights[representative.primaryType];
            const avgConfidence = statements.reduce((sum, s) => sum + s.confidence, 0) / statements.length;

            unindexed.push({
                text: representative.text,
                type: representative.primaryType,
                secondaryTypes: representative.secondaryTypes,
                confidence: avgConfidence,
                queryRelevance,
                adjustedScore: avgConfidence * queryRelevance * typeWeight,
                sourceModels: Array.from(new Set(statements.map(s => s.sourceModel))),
                reason: 'validated_by_shadow_not_in_primary'
            });
        }
    });

    // Sort by adjusted score (highest first)
    unindexed.sort((a, b) => b.adjustedScore - a.adjustedScore);

    // ─────────────────────────────────────────────────────────────────
    // 6. Assemble audit
    // ─────────────────────────────────────────────────────────────────
    const audit: ShadowAudit = {
        extraction: {
            totalSentences: shadowResult.stats.totalSentences,
            pass1Candidates: shadowResult.stats.pass1Candidates,
            pass2Validated: shadowResult.stats.pass2Validated,
            pass2Disqualified: shadowResult.stats.pass2Disqualified,
            survivalRate: shadowResult.stats.survivalRate
        },
        shadowCounts,
        primaryCounts,
        gaps,
        typeSurvival
    };

    return {
        audit,
        unindexed,
        processingTime: performance.now() - startTime
    };
}
