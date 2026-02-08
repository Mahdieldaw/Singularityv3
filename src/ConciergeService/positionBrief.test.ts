import { computeTargetedAnalysis, formatTargetedInsights, TargetedAnalysis } from './positionBrief';
import { EnrichedClaim, Edge } from '../../shared/contract';
import { TraversalGraph, TraversalState } from '../utils/cognitive/traversalEngine';

describe('positionBrief - Targeted Analysis Cleanup', () => {
    const mockClaims: EnrichedClaim[] = [
        { id: 'c_1', label: 'Claim 1', text: 'Text 1', supportRatio: 0.8, inDegree: 1, outDegree: 1, isHighSupport: true, isContested: false, isConditional: false, isChallenger: false, isIsolated: false, supporters: [1, 2], type: 'factual', role: 'anchor', challenges: null },
        { id: 'c_2', label: 'Claim 2', text: 'Text 2', supportRatio: 0.2, inDegree: 1, outDegree: 1, isHighSupport: false, isContested: true, isConditional: false, isChallenger: true, isIsolated: false, supporters: [3], type: 'contested', role: 'challenger', challenges: 'c_1' }
    ];

    const mockGraph: TraversalGraph = {
        claims: mockClaims,
        edges: [
            { from: 'c_1', to: 'c_2', type: 'conflict' }
        ],
        tiers: [],
        maxTier: 0,
        roots: ['c_1'],
        cycles: [],
        tensions: []
    };

    const mockState: TraversalState = {
        resolutions: new Map([
            ['conf_1', { type: 'conflict', selectedClaimId: 'c_1', question: 'Q' }]
        ]),
        claimStatuses: new Map(),
        unavailableReasons: new Map(),
        conditionalAnswers: new Map()
    };

    it('computeTargetedAnalysis should no longer return keystones', () => {
        const analysis = computeTargetedAnalysis(mockClaims, mockState, mockGraph);
        expect((analysis as any).keystones).toBeUndefined();
        expect(analysis.dissent).toBeDefined();
        expect(analysis.fragilePaths).toBeDefined();
    });

    it('formatTargetedInsights should not include keystone notes', () => {
        // Even if we force a keystone-like object (for legacy check), it shouldn't render
        const analysis: any = {
            keystones: [{ claim: mockClaims[0], dependentCount: 5, userConfirmed: true }],
            dissent: [],
            fragilePaths: []
        };
        const insights = formatTargetedInsights(analysis as TargetedAnalysis, mockState);
        expect(insights).not.toContain('keystone');
        expect(insights).toBe('');
    });
});
