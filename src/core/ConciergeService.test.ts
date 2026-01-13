import { ConciergeService } from './ConciergeService';
import { StructuralAnalysis } from '../../shared/contract';

describe('ConciergeService', () => {
    const mockAnalysis: StructuralAnalysis = {
        edges: [],
        landscape: {
            dominantType: 'factual',
            typeDistribution: {},
            dominantRole: 'anchor',
            roleDistribution: {},
            claimCount: 0,
            modelCount: 1,
            convergenceRatio: 0
        },
        claimsWithLeverage: [],
        patterns: {
            leverageInversions: [],
            cascadeRisks: [],
            conflicts: [],
            tradeoffs: [],
            convergencePoints: [],
            isolatedClaims: []
        },
        ghostAnalysis: {
            count: 0,
            mayExtendChallenger: false,
            challengerIds: []
        },
        graph: {
            componentCount: 0,
            components: [],
            longestChain: [],
            chainCount: 0,
            hubClaim: null,
            hubDominance: 0,
            articulationPoints: [],
            clusterCohesion: 0,
            localCoherence: 0
        },
        ratios: {
            concentration: 0,
            alignment: 0,
            tension: 0,
            fragmentation: 0,
            depth: 0
        },
        shape: {
            primary: 'convergent',
            confidence: 0.8,
            patterns: [],
            peaks: [],
            peakRelationship: 'none',
            evidence: [],
            transferQuestion: "Why?"
        }
    };

    it('should build prompt without capabilities or signal instructions', () => {
        const prompt = ConciergeService.buildConciergePrompt('Hello', mockAnalysis, {
            isFirstTurn: false
        });

        expect(prompt).not.toContain('## Capabilities');
        expect(prompt).not.toContain('## Signal Format');
        expect(prompt).not.toContain('<<<SINGULARITY_BATCH_REQUEST>>>');
    });

    it('should include active workflow if provided', () => {
         const prompt = ConciergeService.buildConciergePrompt('Hello', mockAnalysis, {
            isFirstTurn: false,
            activeWorkflow: {
                goal: 'Test Goal',
                steps: [{
                    id: '1',
                    title: 'Step 1',
                    description: 'Do it',
                    doneWhen: 'Done',
                    status: 'active'
                }],
                currentStepIndex: 0
            }
        });

        expect(prompt).toContain('## Active Workflow');
        expect(prompt).toContain('Step 1');
    });
});
