// ═══════════════════════════════════════════════════════════════════════════
// CLAIM ASSEMBLY - TRAVERSAL ANALYSIS LAYER
// ═══════════════════════════════════════════════════════════════════════════

import { Stance, ShadowParagraph, ShadowStatement } from '../shadow';
import type { EnrichedClaim, MapperClaim, MapperEdge } from '../../shared/contract';
import type { Region, RegionProfile } from '../geometry/interpretation/types';
import { cosineSimilarity } from '../clustering/distance';
import { generateTextEmbeddings } from '../clustering/embeddings';
import {
    Claim,
    ConditionalGate,
    PrerequisiteGate,
    ConflictEdge,
    SemanticMapperOutput
} from './contract';

export async function reconstructProvenance(
    claims: MapperClaim[],
    statements: ShadowStatement[],
    paragraphs: ShadowParagraph[],
    paragraphEmbeddings: Map<string, Float32Array>,
    regions: Region[],
    regionProfiles: RegionProfile[],
    totalModelCount: number,
    edges: MapperEdge[] = []
): Promise<EnrichedClaim[]> {
    const statementsById = new Map(statements.map(s => [s.id, s]));
    const claimTexts = claims.map(c => `${c.label}. ${c.text || ''}`);
    const claimEmbeddings = await generateTextEmbeddings(claimTexts);

    const paragraphToRegionIds = new Map<string, string[]>();
    for (const region of regions) {
        if (!Array.isArray(region.nodeIds)) continue;
        for (const nodeId of region.nodeIds) {
            const existing = paragraphToRegionIds.get(nodeId);
            if (existing) {
                existing.push(region.id);
            } else {
                paragraphToRegionIds.set(nodeId, [region.id]);
            }
        }
    }

    const regionProfileById = new Map(regionProfiles.map(r => [r.regionId, r]));

    const rolesByClaimId = (() => {
        const byId = new Map<string, EnrichedClaim['role']>();
        for (const c of claims) byId.set(c.id, 'anchor');

        const supportCountById = new Map<string, number>();
        for (const c of claims) {
            const supporters = Array.isArray(c.supporters) ? c.supporters : [];
            supportCountById.set(c.id, supporters.length);
        }

        const prereqOutCount = new Map<string, number>();
        for (const e of edges || []) {
            if (!e || e.type !== 'prerequisite') continue;
            prereqOutCount.set(e.from, (prereqOutCount.get(e.from) || 0) + 1);
        }

        const seenPairs = new Set<string>();
        for (const e of edges || []) {
            if (!e || e.type !== 'conflict') continue;
            const a = String(e.from || '');
            const b = String(e.to || '');
            if (!a || !b) continue;
            const key = [a, b].sort().join('::');
            if (seenPairs.has(key)) continue;
            seenPairs.add(key);

            const aCount = supportCountById.get(a) || 0;
            const bCount = supportCountById.get(b) || 0;
            const denom = Math.max(1, totalModelCount || 1);
            const aRatio = aCount / denom;
            const bRatio = bCount / denom;

            const aIsFoundation = (prereqOutCount.get(a) || 0) > 0;
            const bIsFoundation = (prereqOutCount.get(b) || 0) > 0;
            const aIsHighSupport = aRatio >= 0.25;
            const bIsHighSupport = bRatio >= 0.25;

            const supportDeltaRatio = Math.abs(aRatio - bRatio);

            if (supportDeltaRatio >= 0.15) {
                const highId = aRatio >= bRatio ? a : b;
                const lowId = aRatio >= bRatio ? b : a;
                const highIsStable = (prereqOutCount.get(highId) || 0) > 0 || (supportCountById.get(highId) || 0) / denom >= 0.25;
                if (highIsStable) {
                    byId.set(lowId, 'challenger');
                }
            } else {
                if ((aIsFoundation || aIsHighSupport) && byId.get(a) !== 'challenger') byId.set(a, 'anchor');
                if ((bIsFoundation || bIsHighSupport) && byId.get(b) !== 'challenger') byId.set(b, 'anchor');
            }
        }

        return byId;
    })();

    return claims.map((claim, idx) => {
        const claimEmbedding = claimEmbeddings.get(String(idx));

        const supporters = Array.isArray(claim.supporters) ? claim.supporters : [];
        const candidateParagraphs = paragraphs.filter(p => supporters.includes(p.modelIndex));
        const scored: Array<{ paragraph: ShadowParagraph; similarity: number }> = [];

        if (claimEmbedding) {
            for (const paragraph of candidateParagraphs) {
                const paragraphEmbedding = paragraphEmbeddings.get(paragraph.id);
                if (!paragraphEmbedding) continue;

                const similarity = cosineSimilarity(claimEmbedding, paragraphEmbedding);
                if (similarity > 0.5) {
                    scored.push({ paragraph, similarity });
                }
            }
        }

        scored.sort((a, b) => {
            if (b.similarity !== a.similarity) return b.similarity - a.similarity;
            return a.paragraph.id.localeCompare(b.paragraph.id);
        });

        const matched = scored.slice(0, 5);

        const sourceStatementIdSet = new Set<string>();
        for (const { paragraph } of matched) {
            for (const sid of paragraph.statementIds) sourceStatementIdSet.add(sid);
        }

        const sourceStatementIds = Array.from(sourceStatementIdSet).sort();
        const sourceStatements = sourceStatementIds
            .map(id => statementsById.get(id))
            .filter((s): s is ShadowStatement => s !== undefined);

        const supportRatio = totalModelCount > 0 ? supporters.length / totalModelCount : 0;

        const hasConditionalSignal = sourceStatements.some(s => s.signals.conditional);
        const hasSequenceSignal = sourceStatements.some(s => s.signals.sequence);
        const hasTensionSignal = sourceStatements.some(s => s.signals.tension);

        const matchedRegionIds = new Set<string>();
        for (const { paragraph } of matched) {
            const regionIds = paragraphToRegionIds.get(paragraph.id) || [];
            for (const rid of regionIds) matchedRegionIds.add(rid);
        }

        const sourceRegionIds = Array.from(matchedRegionIds).sort();
        const matchedRegionProfiles = sourceRegionIds
            .map(rid => regionProfileById.get(rid))
            .filter((r): r is RegionProfile => r !== undefined);

        const avgGeometricConfidence = matchedRegionProfiles.length > 0
            ? matchedRegionProfiles.reduce((sum, r) => sum + r.tierConfidence, 0) / matchedRegionProfiles.length
            : 0;

        const geometricSignals = {
            backedByPeak: matchedRegionProfiles.some(r => r.tier === 'peak'),
            backedByHill: matchedRegionProfiles.some(r => r.tier === 'hill'),
            backedByFloor: matchedRegionProfiles.some(r => r.tier === 'floor'),
            avgGeometricConfidence,
            sourceRegionIds,
        };

        const claimTypeRaw = (claim as unknown as { type?: unknown }).type;
        const type: EnrichedClaim['type'] =
            claimTypeRaw === 'factual' ||
                claimTypeRaw === 'prescriptive' ||
                claimTypeRaw === 'conditional' ||
                claimTypeRaw === 'contested' ||
                claimTypeRaw === 'speculative'
                ? claimTypeRaw
                : 'speculative';

        const role: EnrichedClaim['role'] = rolesByClaimId.get(claim.id) || 'anchor';

        return {
            id: claim.id,
            label: claim.label,
            text: claim.text,
            supporters: Array.isArray(claim.supporters) ? claim.supporters : [],
            type,
            role,
            challenges: null,
            support_count: Array.isArray(claim.supporters) ? claim.supporters.length : 0,

            sourceStatementIds,
            sourceStatements,
            hasConditionalSignal,
            hasSequenceSignal,
            hasTensionSignal,
            geometricSignals,
            supportRatio,

            leverage: 0,
            leverageFactors: {
                supportWeight: 0,
                roleWeight: 0,
                connectivityWeight: 0,
                positionWeight: 0,
            },
            keystoneScore: 0,
            evidenceGapScore: 0,
            supportSkew: 0,
            inDegree: 0,
            outDegree: 0,
            isChainRoot: false,
            isChainTerminal: false,
            isHighSupport: false,
            isLeverageInversion: false,
            isKeystone: false,
            isEvidenceGap: false,
            isOutlier: false,
            isContested: type === 'contested',
            isConditional: type === 'conditional',
            isChallenger: role === 'challenger',
            isIsolated: false,
            chainDepth: 0,
        };
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// ASSEMBLED CLAIM (enriched with provenance)
// ═══════════════════════════════════════════════════════════════════════════

export interface AssembledClaim {
    id: string;
    label: string;
    description?: string;
    stance: Stance;

    // Gates (from mapper)
    gates: {
        conditionals: ConditionalGate[];
        prerequisites: PrerequisiteGate[];
    };

    // Relationships (from mapper)
    enables: string[];
    conflicts: ConflictEdge[];

    // Provenance (enriched)
    sourceStatementIds: string[];
    sourceStatements: ShadowStatement[];  // Resolved from IDs

    // Support metrics (computed)
    supporterModels: number[];
    supportRatio: number;

    // Signals (aggregated from sources)
    hasConditionalSignal: boolean;
    hasSequenceSignal: boolean;
    hasTensionSignal: boolean;

    // Computed during traversal graph building
    tier: number;
}

export interface ClaimAssemblyResult {
    claims: AssembledClaim[];

    meta: {
        totalClaims: number;
        conditionalGateCount: number;
        prerequisiteGateCount: number;
        conflictCount: number;
        modelCount: number;
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ASSEMBLY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

export function assembleClaims(
    mapperOutput: SemanticMapperOutput,
    shadowStatements: ShadowStatement[],
    modelCount: number
): ClaimAssemblyResult {

    const statementMap = new Map(shadowStatements.map(s => [s.id, s]));

    // First pass: assemble claims
    const claims: AssembledClaim[] = mapperOutput.claims.map(claim => {
        // Resolve source statements
        const sourceStatements = claim.sourceStatementIds
            .map(id => statementMap.get(id))
            .filter((s): s is ShadowStatement => s !== undefined);

        // Compute support
        const supporterModels = Array.from(new Set(sourceStatements.map(s => s.modelIndex)));
        const supportRatio = modelCount > 0 ? supporterModels.length / modelCount : 0;

        // Aggregate signals from sources
        const hasConditionalSignal = sourceStatements.some(s => s.signals.conditional);
        const hasSequenceSignal = sourceStatements.some(s => s.signals.sequence);
        const hasTensionSignal = sourceStatements.some(s => s.signals.tension);

        return {
            id: claim.id,
            label: claim.label,
            description: claim.description,
            stance: claim.stance,

            gates: claim.gates,
            enables: claim.enables || [],
            conflicts: claim.conflicts || [],

            sourceStatementIds: claim.sourceStatementIds,
            sourceStatements,

            supporterModels,
            supportRatio,

            hasConditionalSignal,
            hasSequenceSignal,
            hasTensionSignal,

            tier: 0,     // Computed in traversal
        };
    });

    // Second pass: compute inverse relationships (enables)
    const claimMap = new Map(claims.map(c => [c.id, c]));

    for (const claim of claims) {
        // For each prerequisite gate, the required claim "enables" this claim
        for (const prereq of claim.gates.prerequisites) {
            const requiredClaim = claimMap.get(prereq.claimId);
            if (requiredClaim && !requiredClaim.enables.includes(claim.id)) {
                requiredClaim.enables.push(claim.id);
            }
        }
        // Explicit enables from mapper are already on claim.enables
    }

    // Deduplicate enables for all claims
    for (const claim of claims) {
        claim.enables = Array.from(new Set(claim.enables));
    }

    // Compute meta
    const conditionalGateCount = claims.reduce(
        (sum, c) => sum + c.gates.conditionals.length, 0
    );
    const prerequisiteGateCount = claims.reduce(
        (sum, c) => sum + c.gates.prerequisites.length, 0
    );
    const conflictCount = claims.reduce(
        (sum, c) => sum + c.conflicts.length, 0
    );

    return {
        claims,
        meta: {
            totalClaims: claims.length,
            conditionalGateCount,
            prerequisiteGateCount,
            conflictCount,
            modelCount,
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROVENANCE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get provenance for a specific gate
 */
export function getGateProvenance(
    gate: ConditionalGate | PrerequisiteGate,
    statementMap: Map<string, ShadowStatement>
): ShadowStatement[] {
    return gate.sourceStatementIds
        .map(id => statementMap.get(id))
        .filter((s): s is ShadowStatement => s !== undefined);
}

/**
 * Get provenance for a specific edge
 */
export function getConflictProvenance(
    conflict: ConflictEdge,
    statementMap: Map<string, ShadowStatement>
): ShadowStatement[] {
    return conflict.sourceStatementIds
        .map(id => statementMap.get(id))
        .filter((s): s is ShadowStatement => s !== undefined);
}

/**
 * Validate all provenance references exist
 */
export function validateProvenance(
    claims: Claim[],
    statementMap: Map<string, ShadowStatement>
): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const claim of claims) {
        // Check claim source statements
        for (const id of claim.sourceStatementIds) {
            if (!statementMap.has(id)) missing.push(id);
        }

        // Check gate provenance
        for (const gate of claim.gates.conditionals) {
            for (const id of gate.sourceStatementIds) {
                if (!statementMap.has(id)) missing.push(id);
            }
        }
        for (const gate of claim.gates.prerequisites) {
            for (const id of gate.sourceStatementIds) {
                if (!statementMap.has(id)) missing.push(id);
            }
        }

        // Check conflict provenance
        for (const conflict of (claim.conflicts || [])) {
            for (const id of conflict.sourceStatementIds) {
                if (!statementMap.has(id)) missing.push(id);
            }
        }
    }

    return {
        valid: missing.length === 0,
        missing: Array.from(new Set(missing)),
    };
}

/**
 * Format claim evidence for synthesis (from source statements)
 */
export function formatClaimEvidence(
    claim: AssembledClaim,
    maxStatements: number = 3
): string {
    return claim.sourceStatements
        .slice(0, maxStatements)
        .map(s => `> "${s.text}"`)
        .join('\n');
}
