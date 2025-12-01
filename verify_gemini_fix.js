
const fs = require('fs');

// Mock the GeminiSessionApi class to test the logic in isolation
class GeminiSessionApi {
    constructor() {
        this._logs = true;
    }

    _throw(type, details) {
        throw new Error(`${type}: ${JSON.stringify(details)}`);
    }

    processResponse(parsedLines) {
        let u = null;
        let p = null;

        // Pass 2: Fallback (if no text found) - look for any valid payload structure
        if (!u) {
            for (const L of parsedLines) {
                const found = L.find((entry) => {
                    try {
                        if (typeof entry[2] !== "string") return false;
                        const t = JSON.parse(entry[2]);

                        if (!t[4] || !Array.isArray(t[4])) return false;

                        const text = t[0]?.[0] || t[4]?.[0]?.[1]?.[0] || "";
                        const baseCursor = Array.isArray(t?.[1]) ? t[1] : [];
                        const tail = t?.[4]?.[0]?.[0];
                        const cursor = tail !== undefined ? [...baseCursor, tail] : baseCursor;

                        u = { text, cursor };
                        return true;
                    } catch (e) { return false; }
                });
                if (found) break;
            }
        }

        if (!u) {
            this._throw("failedToReadResponse", { step: "answer", error: p });
        }

        // --- Immersive Content Extraction ---
        const immersiveContent = [];
        for (const L of parsedLines) {
            L.forEach((entry) => {
                try {
                    if (typeof entry[2] !== "string") return;
                    const t = JSON.parse(entry[2]);
                    this._findImmersiveContent(t, immersiveContent);
                } catch (e) { }
            });
        }

        if (immersiveContent.length > 0) {
            immersiveContent.forEach((item) => {
                if (!u.text.includes(`identifier="${item.identifier}"`)) {
                    u.text += `\n\n<document title="${item.title}" identifier="${item.identifier}">\n${item.content}\n</document>`;
                }
            });
        }

        return {
            text: u.text,
            immersiveItems: immersiveContent.length
        };
    }

    _findImmersiveContent(obj, results) {
        if (!obj || typeof obj !== "object") return;

        if (Array.isArray(obj)) {
            // Check signature: [filename, id, title, null, content]
            if (
                obj.length >= 5 &&
                typeof obj[0] === "string" &&
                (obj[0].includes(".") || obj[0].length > 0) && // Relaxed check
                typeof obj[2] === "string" && // Title
                typeof obj[4] === "string" // Content
            ) {
                if (!results.find((r) => r.identifier === obj[0])) {
                    results.push({
                        identifier: obj[0],
                        title: obj[2],
                        content: obj[4],
                    });
                }
            }
            obj.forEach((child) => this._findImmersiveContent(child, results));
        }
    }
}

// Test Data - Second Case provided by user
const innerJson = [
    null,
    ["c_7de00e5a34293198", "r_fb12268357714a3a"],
    null,
    null,
    [
        ["rc_a19f0ad08e92f1a9", ["I understand. Defining the Refiner as a **Cognitive State Manager** that preserves the \"soul\" of the synthesis is critical for maintaining coherence across branching turns.\n\nHere is the complete, production-ready system prompt for this hybrid role.\n\n\nhttp://googleusercontent.com/immersive_entry_chip/0\n\nThis prompt establishes the Refiner's role as a generative component that uses the full context of the `PREVIOUS_STATE` to produce a new, self-contained query, ensuring that nuance and unresolved tensions are carried forward effectively."]]
    ],
    null,
    null,
    null,
    null,
    true,
    null,
    [2],
    "en",
    null,
    null,
    [
        null, null, null, null, null, null, [0], [], null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
        // The immersive entry chip
        [[["http://googleusercontent.com/immersive_entry_chip/0"], "c_7de00e5a34293198_refiner_system_prompt.txt", null, "Refiner System Prompt: Cognitive State Manager", "ebc266ce-2520-46f3-8d2e-ec4a208b2daf", [1764197299, 622722715], true, 1]],
        null, null, null, null, null, [1, 3]
    ],
    null,
    null,
    true,
    null,
    null,
    null,
    null,
    null,
    [false],
    null,
    false,
    [],
    true,
    null,
    null,
    [],
    null,
    // The content block
    [[
        "c_7de00e5a34293198_refiner_system_prompt.txt",
        "ebc266ce-2520-46f3-8d2e-ec4a208b2daf",
        "Refiner System Prompt: Cognitive State Manager",
        null,
        "You are the **Cognitive State Manager** and **Guardian of Conversational Coherence**..."
    ]]
];

const rawLine = JSON.stringify([
    "wrb.fr",
    null,
    JSON.stringify(innerJson)
]);

const parsedLines = [[JSON.parse(rawLine)]];

async function run() {
    const api = new GeminiSessionApi();
    const result = api.processResponse(parsedLines);

    console.log("Immersive Items Found:", result.immersiveItems);
    console.log("Final Text:\n", result.text);

    if (result.text.includes("<document title=\"Refiner System Prompt: Cognitive State Manager\"")) {
        console.log("SUCCESS: Document tag found in text.");
    } else {
        console.error("FAILURE: Document tag NOT found in text.");
        process.exit(1);
    }
}

run();
