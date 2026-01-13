import { computeProblemStructureFromArtifact } from "./PromptMethods";
import { MapperArtifact, Claim, Edge } from "../../shared/contract";

// Mock helper
const createClaim = (id: string, supporters: number[], role: Claim["role"] = "branch"): Claim => ({
    id,
    label: `Claim ${id}`,
    text: `Text for ${id}`,
    supporters,
    type: "factual",
    role,
    challenges: null,
});

const createEdge = (from: string, to: string, type: Edge["type"] = "supports"): Edge => ({
    from,
    to,
    type,
});

// Scenario 1: Settled / Keystone
// One main claim with many supporters, others supporting it.
const scenario1: MapperArtifact = {
    claims: [
        createClaim("C1", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "anchor"), // High support
        createClaim("C2", [11], "supplement"),
        createClaim("C3", [12], "supplement"),
    ],
    edges: [
        createEdge("C2", "C1", "supports"),
        createEdge("C3", "C1", "supports"),
    ],
    ghosts: [],
    narrative: "Scenario 1",
    anchors: [],
    model_count: 20
};

// Scenario 2: Leverage Inversion & Contested
// C1 has low support but high leverage (supports many others or acts as bridge).
// C2 has high support but is challenged by C1.
const scenario2: MapperArtifact = {
    claims: [
        createClaim("C1", [1], "challenger"), // Low support
        createClaim("C2", [2, 3, 4, 5, 6], "anchor"), // High support
        createClaim("C3", [7], "branch"),
        createClaim("C4", [8], "branch"),
    ],
    edges: [
        createEdge("C1", "C2", "conflicts"), // C1 challenges C2
        createEdge("C3", "C1", "supports"),  // C3 supports C1 (giving C1 leverage)
        createEdge("C4", "C1", "supports"),  // C4 supports C1
    ],
    ghosts: [],
    narrative: "Scenario 2",
    anchors: [],
    model_count: 10
};

console.log("\n--- RUNNING SCENARIO 1 (Settled/Keystone) ---");
const result1 = computeProblemStructureFromArtifact(scenario1);
console.log("Primary Shape:", result1.primary);
console.log("Evidence:", result1.evidence);

console.log("\n--- RUNNING SCENARIO 2 (Leverage/Contested) ---");
const result2 = computeProblemStructureFromArtifact(scenario2);
console.log("Primary Shape:", result2.primary);
console.log("Evidence:", result2.evidence);
