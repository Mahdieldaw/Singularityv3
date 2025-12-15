
// Simulation of PromptRefinerService logic

// Robust extraction specifically for Refiner Analysis to ensure full raw text capture
// without risking side-effects on Composer/Analyst flows
function _extractRefinerRawText(text) {
    if (!text) return "";

    // 1. Direct string - Return EXACTLY as is (no JSON unwrapping)
    if (typeof text === 'string') {
        return text.trim();
    }

    // 2. Object with text/content field (Adapter response unwrapping)
    if (typeof text === 'object') {
        if (typeof text.text === 'string') return text.text.trim();
        if (typeof text.content === 'string') return text.content.trim();
        // Worst case: stringify the object so we don't get "[object Object]"
        try {
            return JSON.stringify(text, null, 2);
        } catch (e) {
            return "[Unserializable Object]";
        }
    }

    // 3. Fallback
    return String(text).trim();
}

// Mock parsing
function parseRefinerOutput(text) {
    return { parsed: true, source: text };
}

async function runRefinerAnalysis(mockResponseRaw) {
    const responseText = _extractRefinerRawText(mockResponseRaw?.text || '');
    const parsed = parseRefinerOutput(responseText);
    return {
        rawText: responseText,
        parsed: parsed
    };
}

async function test() {
    console.log("--- Test 1: Normal Markdown ---");
    const res1 = await runRefinerAnalysis({ text: "# Markdown" });
    console.log("rawText:", typeof res1.rawText, JSON.stringify(res1.rawText));
    console.log("parsed:", res1.parsed);

    console.log("\n--- Test 2: JSON String ---");
    const res2 = await runRefinerAnalysis({ text: '{"some": "json"}' });
    console.log("rawText:", typeof res2.rawText, JSON.stringify(res2.rawText));

    console.log("\n--- Test 3: Object (Bad Adapter) ---");
    const res3 = await runRefinerAnalysis({ text: { some: "object" } });
    console.log("rawText:", typeof res3.rawText, JSON.stringify(res3.rawText));

    console.log("\n--- Test 4: Undefined Text ---");
    const res4 = await runRefinerAnalysis({});
    console.log("rawText:", typeof res4.rawText, JSON.stringify(res4.rawText));
}

test();
