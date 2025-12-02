// ui/components/experimental/mockData.ts

import { GraphTopology } from '../../types';

/** 
 * Generate mock topology data for testing the decision graph visualization.
 * This simulates the JSON output from the mapper's ===GRAPH_TOPOLOGY=== section.
 */
export function generateMockTopology(): GraphTopology {
    return {
        nodes: [
            {
                id: 'opt_1',
                label: 'Microservices Architecture',
                theme: 'Architecture',
                supporters: [1, 2, 4],
                support_count: 3,
            },
            {
                id: 'opt_2',
                label: 'Monolith Architecture',
                theme: 'Architecture',
                supporters: [3, 5, 6],
                support_count: 3,
            },
            {
                id: 'opt_3',
                label: 'Cloud Hosting',
                theme: 'Infrastructure',
                supporters: [1, 2, 3, 4],
                support_count: 4,
            },
            {
                id: 'opt_4',
                label: 'On-Premises Deployment',
                theme: 'Infrastructure',
                supporters: [5, 6],
                support_count: 2,
            },
            {
                id: 'opt_5',
                label: 'PostgreSQL Database',
                theme: 'Database',
                supporters: [1, 3, 4, 5, 6],
                support_count: 5,
            },
            {
                id: 'opt_6',
                label: 'NoSQL Database',
                theme: 'Database',
                supporters: [2],
                support_count: 1,
            },
        ],
        edges: [
            {
                source: 'opt_1',
                target: 'opt_3',
                type: 'complements',
                reason: 'Microservices scale well with cloud infrastructure',
            },
            {
                source: 'opt_2',
                target: 'opt_4',
                type: 'complements',
                reason: 'Monoliths are simpler to deploy on-premises',
            },
            {
                source: 'opt_1',
                target: 'opt_2',
                type: 'conflicts',
                reason: 'Fundamentally different architectural approaches',
            },
            {
                source: 'opt_3',
                target: 'opt_4',
                type: 'conflicts',
                reason: 'Cloud vs on-prem hosting are mutually exclusive',
            },
            {
                source: 'opt_4',
                target: 'opt_3',
                type: 'prerequisite',
                reason: 'On-prem requires existing infrastructure setup',
            },
            {
                source: 'opt_5',
                target: 'opt_1',
                type: 'complements',
                reason: 'PostgreSQL works well in microservices environments',
            },
        ],
    };
}
