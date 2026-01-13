import {
    StatementType,
    INCLUSION_PATTERNS,
    getPriority
} from './StatementTypes';
import {
    EXCLUSION_RULES,
    ExclusionRule,
    getRulesForType
} from './ExclusionRules';

// ═══════════════════════════════════════════════════════════════════
// INTEGRATION POINT 1: REVERSE DEPENDENCY DETECTION (CRITICAL)
// "A runs after B" means B is prerequisite of A
// ═══════════════════════════════════════════════════════════════════

function detectReverseDependency(sentence: string): boolean {
    const reversePatterns = [
        /\b(runs?|executes?)\s+after\b/i,
        /\bfollows?\b/i,
        /\bsubsequent\s+to\b/i,
        /\b(?:comes?|happens?)\s+after\b/i
    ];

    // Note: bare "after" is already in prerequisite patterns,
    // but we flag it here for dependency direction awareness
    return reversePatterns.some(p => p.test(sentence));
}

// ═══════════════════════════════════════════════════════════════════
// OUTPUT TYPES
// ═══════════════════════════════════════════════════════════════════

export interface ShadowStatement {
    text: string;
    primaryType: StatementType;
    secondaryTypes: StatementType[];  // Other types that matched
    confidence: number;
    sourceModel: number;
    sentenceIndex: number;
    // Pass 1 details
    matchedPatterns: string[];
    // Pass 2 details
    softExclusions: string[];         // Soft rules that matched (confidence penalty)
    // INTEGRATION POINT 1: Reverse dependency flag
    reverseDependency?: boolean;      // Present only for prerequisites
}

export interface DisqualifiedStatement {
    text: string;
    attemptedType: StatementType;
    sourceModel: number;
    disqualifiedBy: string;
    reason: string;
}

export interface ShadowMap {
    prescriptive: ShadowStatement[];
    conflict: ShadowStatement[];
    prerequisite: ShadowStatement[];
    conditional: ShadowStatement[];
    assertive: ShadowStatement[];
}

export interface TwoPassResult {
    validated: ShadowMap;
    disqualified: DisqualifiedStatement[];
    stats: {
        totalSentences: number;
        pass1Candidates: number;
        pass2Validated: number;
        pass2Disqualified: number;
        survivalRate: number;
        byType: Record<StatementType, {
            pass1: number;
            pass2: number;
            disqualified: number;
        }>;
    };
    processingTime: number;
}



// ═══════════════════════════════════════════════════════════════════
// SENTENCE EXTRACTION
// ═══════════════════════════════════════════════════════════════════

function extractSentences(text: string): string[] {
    // Split on sentence boundaries
    // Handle: periods, exclamations, questions, and newlines that seem sentence-final
    const raw = text
        .split(/(?<=[.!?])\s+(?=[A-Z])|(?<=\n)(?=[A-Z])/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    // Filter out very short fragments and code blocks
    return raw.filter(s => {
        // Too short
        if (s.length < 15) return false;
        // Looks like code
        if (/^[{}\[\]<>]|^(const|let|var|function|import|export|class)\s/.test(s)) return false;
        // Mostly punctuation/symbols
        const alphaRatio = (s.match(/[a-zA-Z]/g) || []).length / s.length;
        if (alphaRatio < 0.5) return false;
        return true;
    });
}

// ═══════════════════════════════════════════════════════════════════
// PASS 1: INCLUSION MATCHING
// ═══════════════════════════════════════════════════════════════════

interface Pass1Match {
    type: StatementType;
    priority: number;
    patterns: string[];
}

function executePass1(sentence: string): Pass1Match[] {
    const matches: Pass1Match[] = [];

    for (const patternDef of INCLUSION_PATTERNS) {
        const matchedPatterns: string[] = [];

        for (const regex of patternDef.patterns) {
            if (regex.test(sentence)) {
                matchedPatterns.push(regex.source);
            }
        }

        if (matchedPatterns.length > 0) {
            matches.push({
                type: patternDef.type,
                priority: patternDef.priority,
                patterns: matchedPatterns
            });
        }
    }

    // Sort by priority (highest first)
    matches.sort((a, b) => b.priority - a.priority);

    return matches;
}

// ═══════════════════════════════════════════════════════════════════
// PASS 2: EXCLUSION CHECKING
// ═══════════════════════════════════════════════════════════════════

interface Pass2Result {
    survived: boolean;
    hardDisqualifier: ExclusionRule | null;
    softMatches: ExclusionRule[];
    adjustedConfidence: number;
}

function executePass2(
    sentence: string,
    candidateType: StatementType,
    baseConfidence: number
): Pass2Result {
    const rules = getRulesForType(candidateType);
    const softMatches: ExclusionRule[] = [];

    // Check all rules
    for (const rule of rules) {
        if (rule.pattern.test(sentence)) {
            if (rule.severity === 'hard') {
                // Instant disqualification
                return {
                    survived: false,
                    hardDisqualifier: rule,
                    softMatches: [],
                    adjustedConfidence: 0
                };
            } else {
                // Soft match - record for confidence penalty
                softMatches.push(rule);
            }
        }
    }

    // Calculate confidence penalty from soft matches
    // Each soft match reduces confidence by 15%
    const penaltyFactor = Math.pow(0.85, softMatches.length);
    const adjustedConfidence = baseConfidence * penaltyFactor;

    // ═══════════════════════════════════════════════════════════════════
    // INTEGRATION POINT 2: CONFIDENCE FLOOR ADJUSTMENT (RECOMMENDED)
    // Changed from 0.3 to 0.4 to eliminate marginal false positives
    // ═══════════════════════════════════════════════════════════════════
    if (adjustedConfidence < 0.4) {
        return {
            survived: false,
            hardDisqualifier: null,  // Died from soft penalties
            softMatches,
            adjustedConfidence
        };
    }

    return {
        survived: true,
        hardDisqualifier: null,
        softMatches,
        adjustedConfidence
    };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN TWO-PASS EXTRACTION
// ═══════════════════════════════════════════════════════════════════

export function executeShadowExtraction(
    batchResponses: Array<{ modelIndex: number; content: string }>
): TwoPassResult {
    const startTime = performance.now();

    // Initialize result structures
    const validated: ShadowMap = {
        prescriptive: [],
        conflict: [],
        prerequisite: [],
        conditional: [],
        assertive: []
    };
    const disqualified: DisqualifiedStatement[] = [];

    const stats = {
        totalSentences: 0,
        pass1Candidates: 0,
        pass2Validated: 0,
        pass2Disqualified: 0,
        survivalRate: 0,
        byType: {
            prescriptive: { pass1: 0, pass2: 0, disqualified: 0 },
            conflict: { pass1: 0, pass2: 0, disqualified: 0 },
            prerequisite: { pass1: 0, pass2: 0, disqualified: 0 },
            conditional: { pass1: 0, pass2: 0, disqualified: 0 },
            assertive: { pass1: 0, pass2: 0, disqualified: 0 }
        }
    };

    // Process each model's response
    for (const response of batchResponses) {
        const sentences = extractSentences(response.content);
        stats.totalSentences += sentences.length;

        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i];

            // ─────────────────────────────────────────────────────────────
            // PASS 1: What types does this match?
            // ─────────────────────────────────────────────────────────────
            const pass1Matches = executePass1(sentence);

            if (pass1Matches.length === 0) continue;  // No patterns matched

            stats.pass1Candidates++;

            // Primary type is highest priority
            const primaryMatch = pass1Matches[0];
            stats.byType[primaryMatch.type].pass1++;

            // Secondary types are the rest
            const secondaryTypes = pass1Matches.slice(1).map(m => m.type);

            // Calculate base confidence from pattern match count
            const baseConfidence = Math.min(
                0.5 + (primaryMatch.patterns.length * 0.1),
                0.9
            );

            // ─────────────────────────────────────────────────────────────
            // PASS 2: Is it disqualified?
            // ─────────────────────────────────────────────────────────────
            const pass2Result = executePass2(sentence, primaryMatch.type, baseConfidence);

            if (!pass2Result.survived) {
                stats.pass2Disqualified++;
                stats.byType[primaryMatch.type].disqualified++;

                disqualified.push({
                    text: sentence,
                    attemptedType: primaryMatch.type,
                    sourceModel: response.modelIndex,
                    disqualifiedBy: pass2Result.hardDisqualifier?.id || 'soft_penalty_accumulation',
                    reason: pass2Result.hardDisqualifier?.reason ||
                        `Too many soft penalties: ${pass2Result.softMatches.map(r => r.id).join(', ')}`
                });
                continue;
            }

            // ─────────────────────────────────────────────────────────────
            // VALIDATED: Add to appropriate bucket
            // ─────────────────────────────────────────────────────────────
            stats.pass2Validated++;
            stats.byType[primaryMatch.type].pass2++;

            const validatedStatement: ShadowStatement = {
                text: sentence,
                primaryType: primaryMatch.type,
                secondaryTypes,
                confidence: pass2Result.adjustedConfidence,
                sourceModel: response.modelIndex,
                sentenceIndex: i,
                matchedPatterns: primaryMatch.patterns,
                softExclusions: pass2Result.softMatches.map(r => r.id)
            };

            // ═══════════════════════════════════════════════════════════════════
            // INTEGRATION POINT 1: Flag reverse dependency for prerequisites
            // ═══════════════════════════════════════════════════════════════════
            if (primaryMatch.type === 'prerequisite') {
                const isReversed = detectReverseDependency(sentence);
                if (isReversed) {
                    validatedStatement.reverseDependency = true;
                }
            }

            validated[primaryMatch.type].push(validatedStatement);
        }
    }

    // Calculate final stats
    stats.survivalRate = stats.pass1Candidates > 0
        ? stats.pass2Validated / stats.pass1Candidates
        : 0;

    return {
        validated,
        disqualified,
        stats,
        processingTime: performance.now() - startTime
    };
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Get all validated statements as flat array
// ═══════════════════════════════════════════════════════════════════

export function flattenValidated(shadowMap: ShadowMap): ShadowStatement[] {
    return [
        ...shadowMap.prescriptive,
        ...shadowMap.conflict,
        ...shadowMap.prerequisite,
        ...shadowMap.conditional,
        ...shadowMap.assertive
    ];
}

// ═══════════════════════════════════════════════════════════════════
// HELPER: Count by type
// ═══════════════════════════════════════════════════════════════════

export function countByType(shadowMap: ShadowMap): Record<StatementType, number> {
    return {
        prescriptive: shadowMap.prescriptive.length,
        conflict: shadowMap.conflict.length,
        prerequisite: shadowMap.prerequisite.length,
        conditional: shadowMap.conditional.length,
        assertive: shadowMap.assertive.length
    };
}
