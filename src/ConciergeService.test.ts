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
        const shadowStatements: any[] = [
            { id: 's_1', text: 'Statement', stance: 'prescriptive', signals: { sequence: false, tension: false, conditional: false } },
        ];

        const raw = JSON.stringify({
            claims: [
                {
                    id: 'c_0',
                    label: 'do thing',
                    stance: 'prescriptive',
                    gates: {
                        conditionals: [
                            {
                                id: 'cg_0',
                                condition: 'if X',
                                question: 'Does X apply?',
                                sourceStatementIds: ['s_1'],
                            },
                        ],
                        prerequisites: [],
                    },
                    edges: { sequence: [], tension: [] },
                    sourceStatementIds: ['s_1'],
                },
            ],
        });

        const result = parseSemanticMapperOutput(raw, shadowStatements as any);
        expect(result.success).toBe(false);
        expect(result.errors?.some(e => e.field === 'claim[0].edges')).toBe(true);
    });

    it('should reject semantic mapper gates missing question', () => {
        const shadowStatements: any[] = [
            { id: 's_1', text: 'Statement', stance: 'prescriptive', signals: { sequence: false, tension: false, conditional: true } },
        ];

        const raw = JSON.stringify({
            claims: [
                {
                    id: 'c_0',
                    label: 'do thing',
                    stance: 'prescriptive',
                    gates: {
                        conditionals: [
                            {
                                id: 'cg_0',
                                condition: 'if X',
                                sourceStatementIds: ['s_1'],
                            },
                        ],
                        prerequisites: [],
                    },
                    enables: [],
                    conflicts: [],
                    sourceStatementIds: ['s_1'],
                },
            ],
        });

        const result = parseSemanticMapperOutput(raw, shadowStatements as any);
        expect(result.success).toBe(false);
        expect(result.errors?.some(e => e.field === 'claim[0].gates.conditionals[0].question')).toBe(true);
    });

    it('should accept semantic mapper V2 conflicts with questions', () => {
        const shadowStatements: any[] = [
            { id: 's_1', text: 'Statement', stance: 'prescriptive', signals: { sequence: false, tension: true, conditional: false } },
        ];

        const raw = JSON.stringify({
            claims: [
                {
                    id: 'c_0',
                    label: 'optimize for speed',
                    stance: 'prescriptive',
                    gates: { conditionals: [], prerequisites: [] },
                    enables: [],
                    conflicts: [
                        {
                            claimId: 'c_1',
                            question: 'Which matters more: speed or flexibility?',
                            sourceStatementIds: ['s_1'],
                            nature: 'optimization',
                        },
                    ],
                    sourceStatementIds: ['s_1'],
                },
                {
                    id: 'c_1',
                    label: 'optimize for flexibility',
                    stance: 'prescriptive',
                    gates: { conditionals: [], prerequisites: [] },
                    enables: [],
                    conflicts: [],
                    sourceStatementIds: ['s_1'],
                },
            ],
        });

        const result = parseSemanticMapperOutput(raw, shadowStatements as any);
        expect(result.success).toBe(true);
        expect(result.output?.claims?.[0]?.conflicts?.length).toBe(1);
        expect(result.output?.claims?.[0]?.conflicts?.[0]?.question).toBe('Which matters more: speed or flexibility?');
    });

    it('should serialize shadow paragraphs without duplicating statement text', () => {
        const shadowStatements: any[] = [
            { id: 's_0', modelIndex: 1, text: 'Alpha', stance: 'assertive', signals: { sequence: false, tension: true, conditional: false } },
            { id: 's_1', modelIndex: 2, text: 'Beta', stance: 'cautionary', signals: { sequence: true, tension: false, conditional: true } },
        ];

        const prompt = buildSemanticMapperPrompt('Q', shadowStatements as any);
        const match = prompt.match(/<statements>\s*([\s\S]*?)\s*<\/statements>/);
        expect(match).not.toBeNull();
        const block = String(match?.[1] || '');
        expect(block).toContain('s_0|A|Alpha');
        expect(block).toContain('s_1|C|Beta');

        expect(block.match(/\bAlpha\b/g)?.length).toBe(1);
        expect(block.match(/\bBeta\b/g)?.length).toBe(1);
    });
});
