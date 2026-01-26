import { ConciergeService } from './ConciergeService/ConciergeService';
import { StructuralAnalysis } from '../shared/contract';
import { buildSemanticMapperPrompt, parseSemanticMapperOutput } from './ConciergeService/semanticMapper';

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

    it('should reject legacy semantic mapper edges field', () => {
        const raw = JSON.stringify({
            claims: [
                {
                    id: 'c_0',
                    label: 'do thing',
                    text: 'Do the thing.',
                    supporters: [1],
                    role: 'anchor',
                    challenges: null,
                },
            ],
            edges: { sequence: [], tension: [] },
            conditionals: [],
        });

        const result = parseSemanticMapperOutput(raw);
        expect(result.success).toBe(false);
        expect(result.errors?.some(e => e.field === 'edges')).toBe(true);
    });

    it('should accept semantic mapper conflicts without questions', () => {
        const raw = JSON.stringify({
            claims: [{
                id: 'c_0',
                label: 'do thing',
                text: 'Do the thing.',
                supporters: [1],
                role: 'anchor',
                challenges: null,
            }],
            edges: [{
                from: 'c_0',
                to: 'c_1',
                type: 'conflict',
            }],
            conditionals: [],
        });

        const result = parseSemanticMapperOutput(raw);
        expect(result.success).toBe(true);
        expect(result.output?.edges?.length).toBe(1);
        const e0 = result.output?.edges?.[0];
        expect(e0?.type).toBe('conflict');
        expect(((e0 as any)?.question ?? null)).toBeNull();
    });

    it('should accept semantic mapper V2 conflicts with questions', () => {
        const raw = JSON.stringify({
            claims: [{
                id: 'c_0',
                label: 'optimize for speed',
                text: 'Prioritize execution speed.',
                supporters: [1],
                role: 'anchor',
                challenges: null,
            }, {
                id: 'c_1',
                label: 'optimize for flexibility',
                text: 'Prioritize flexibility.',
                supporters: [2],
                role: 'anchor',
                challenges: null,
            }],
            edges: [{
                from: 'c_0',
                to: 'c_1',
                type: 'conflict',
                question: 'Which matters more: speed or flexibility?',
            }],
            conditionals: [],
        });

        const result = parseSemanticMapperOutput(raw);
        expect(result.success).toBe(true);
        expect(result.output?.edges?.length).toBe(1);
        const e0 = result.output?.edges?.[0];
        expect(e0?.type).toBe('conflict');
        if (e0 && e0.type === 'conflict') {
            expect(e0.question).toBe('Which matters more: speed or flexibility?');
        }
    });

    it('should serialize shadow paragraphs without duplicating statement text', () => {
        const paragraphs: any[] = [
            { id: 'p_0', modelIndex: 1, paragraphIndex: 0, _fullParagraph: 'Alpha' },
            { id: 'p_1', modelIndex: 2, paragraphIndex: 0, _fullParagraph: 'Beta' },
        ];

        const prompt = buildSemanticMapperPrompt('Q', paragraphs as any);
        const match = prompt.match(/<model_outputs>\s*([\s\S]*?)\s*<\/model_outputs>/);
        expect(match).not.toBeNull();
        const block = String(match?.[1] || '');
        expect(block).toContain('[Model 1]');
        expect(block).toContain('[Model 2]');
        expect(block).toContain('Alpha');
        expect(block).toContain('Beta');

        expect(block.match(/\bAlpha\b/g)?.length).toBe(1);
        expect(block.match(/\bBeta\b/g)?.length).toBe(1);
    });
});
