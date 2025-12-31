# Implementation Instructions for IDE Agent

Copy this entire block as context for your agent.

---

## Context

You are working on `shared/parsing-utils.ts`, a parsing utility file for a Chrome extension that processes LLM outputs. The file currently has ~1200 lines of parsing logic that has been built up over time.

**Key principles:**
1. ALL changes are ADDITIVE—do not delete existing patterns or logic
2. Existing parsing must continue to work; improvements wrap or extend
3. The file parses outputs from multiple LLM providers with varying format compliance
4. Fallback chains are critical: JSON → code block → brace extraction → heuristics → empty

**Files involved:**
- `shared/parsing-utils.ts` (primary target)
- `shared/contract.ts` (type definitions—read only, do not modify)
- Prompt files in `src/core/prompts/` (reference only)

---

## Phase 1: Foundation (Centralization + JSON Repair)

### Task 1.1: Create Centralized JSON Extraction

**Location**: Add near the top of the file, after the type definitions.

**Purpose**: Consolidate the repeated brace-matching and code-fence-stripping logic that appears in multiple parsers.

**Requirements**:

1. Create a `repairJson(text: string): string` function that fixes common LLM JSON mistakes:
   - Remove trailing commas before `}` or `]`
   - Remove JavaScript-style comments (`//` and `/* */`)
   - Handle unquoted keys (convert `{ key: value }` to `{ "key": value }`)
   - Be conservative—don't break valid JSON

2. Create an `extractJsonObject(text: string): { json: any | null; path: string }` function that:
   - Strips markdown code fences (```json ... ```)
   - Handles double-stringified JSON (when the whole response is wrapped in quotes)
   - Finds JSON boundaries using the existing brace-matching logic
   - Applies `repairJson` before parsing
   - Returns which extraction path succeeded (for telemetry)
   - Returns `{ json: null, path: 'none' }` on failure

3. The `path` return value should be one of:
   - `'direct'` - parsed as-is
   - `'code_block'` - extracted from code fence
   - `'brace_match'` - found via brace matching
   - `'repaired'` - needed JSON repair
   - `'none'` - all attempts failed

**After implementation**: Update `tryParseJsonRefinerOutput`, `parseGauntletOutput`, `parseUnderstandOutput`, `parseExploreOutput`, and `parseUnifiedMapperOutput` to use this centralized function. Keep the existing fallback logic intact—only replace the JSON extraction portion.

---

### Task 1.2: Create Centralized Pattern Matching with Scoring

**Location**: Add after the JSON extraction utilities.

**Purpose**: Replace first-match semantics with best-match semantics while keeping all existing patterns.

**Requirements**:

1. Create a type:
```typescript
interface PatternMatch {
  content: string;
  patternIndex: number;
  position: number;      // where in text the match starts
  length: number;        // length of matched content
}
```

2. Create `tryPatternsScored(text: string, patterns: RegExp[]): string | null` that:
   - Runs ALL patterns against the text (not just until first match)
   - Collects all successful matches
   - Scores matches by: (a) pattern priority (earlier = higher), (b) content length (longer = better), (c) position in text (respects minPosition if present)
   - Returns the highest-scoring match's content
   - Returns null if no matches

3. Scoring formula suggestion:
```typescript
score = (patterns.length - patternIndex) * 100  // priority weight
      + Math.min(content.length, 500) * 0.1     // length bonus (capped)
      - position * 0.01;                         // slight preference for earlier matches
```

4. Keep the existing `tryPatterns` function unchanged. Add `tryPatternsScored` as a new function.

5. Create a wrapper `trySectionExtraction(text: string, sectionName: string, patterns: RegExp[]): string | null` that:
   - Calls `tryPatternsScored`
   - If no match, falls back to the existing `extractSection` function
   - Returns the best available result

**After implementation**: Update `parseUnifiedMapperOutput` to use `trySectionExtraction` for its four section types. This should fix the issue where graph topology fallback is used even when mapper_artifact has better data.

---

## Phase 2: Validation Layer

### Task 2.1: Add Lightweight Schema Validation


---

**If Option B (Hand-rolled):**

1. Create validator functions in `parsing-utils.ts`:

```typescript
function validateGauntletOutput(obj: any): { valid: boolean; data: GauntletOutput; errors: string[] }
function validateUnderstandOutput(obj: any): { valid: boolean; data: UnderstandOutput; errors: string[] }
// ... etc
```

2. Each validator should:
   - Check required fields exist
   - Coerce types where safe (number to string, etc.)
   - Fill missing fields from the `createEmpty*` functions
   - Collect error messages for logging

3. Update each parser to call validation after JSON extraction.

---

## Phase 3: Telemetry and Logging

### Task 3.1: Add Parse Result Tracking

**Purpose**: Track which parsing paths succeed/fail to identify prompt issues.

**Requirements**:

1. Create a type:
```typescript
interface ParseAttempt {
  parser: 'mapper' | 'gauntlet' | 'understand' | 'refiner' | 'antagonist' | 'explore';
  paths: Array<{
    path: string;           // 'json_direct' | 'json_codeblock' | 'json_repaired' | 'heuristic_sections' | 'empty'
    attempted: boolean;
    succeeded: boolean;
    error?: string;
  }>;
  finalPath: string;
  inputLength: number;
  outputValid: boolean;
}
```

2. Create a `logParseAttempt(attempt: ParseAttempt): void` function that:
   - In development: logs to console with structured format
   - Stores in a circular buffer (last 100 attempts) for debugging
   - Exposes via `getRecentParseAttempts(): ParseAttempt[]` for diagnostics

3. Update each parser function to build and log a `ParseAttempt` as it progresses through its fallback chain.

4. Add a `getParseStats(): { byParser: Record<string, { total: number; jsonSuccess: number; heuristicSuccess: number; failures: number }> }` function that aggregates the buffer.

---

### Task 3.2: Add Per-Parser Error Context

**Purpose**: When parsing fails, capture enough context to debug the prompt.

**Requirements**:

1. Create `captureParseFailure(parser: string, input: string, error: string): void` that:
   - Stores the first 2000 chars of input
   - Stores the error message
   - Stores a timestamp
   - Limits stored failures to last 20 per parser type

2. Add a `getRecentFailures(parser?: string): Array<{ parser: string; timestamp: number; inputPreview: string; error: string }>` function.

3. In each parser, when falling back to heuristics or empty, call `captureParseFailure` with:
   - The parser name
   - The raw input text
   - A description of why JSON parsing failed

---

## Phase 4: Consistency Improvements

### Task 4.1: Improve Understand Fallback

**Problem**: `parseUnderstandOutput` has minimal fallback compared to `parseGauntletOutput`.

**Requirements**:

1. Add heuristic section extraction to `parseUnderstandOutput`:
   - Extract "Short Answer" from sections named: `SHORT_ANSWER`, `SUMMARY`, `TL;DR`, `THE FRAME`
   - Extract "Long Answer" from sections named: `LONG_ANSWER`, `FULL_ANSWER`, `DETAILED_ANSWER`, `EXPLANATION`
   - Extract "The One" from sections named: `THE_ONE`, `KEY_INSIGHT`, `PIVOT`
   - Extract "The Echo" from sections named: `THE_ECHO`, `DISSENT`, `CONTRARIAN`

2. Follow the same pattern as `parseGauntletOutput`:
   - Try JSON first
   - Fall back to section extraction
   - Fill missing fields from `createEmptyUnderstandOutput()`

3. Add the same telemetry hooks as other parsers.

---

### Task 4.2: Document Format Contracts

**Purpose**: Add JSDoc comments documenting expected formats for each parser.

**Requirements**:

For each parse function, add a JSDoc comment block that includes:

1. The expected JSON structure (copy from the prompt's output specification) /src/core/PromptService.ts
2. Known format variants the parser handles
3. Fallback behavior description
4. Example of a valid input

Example format:
```typescript
/**
 * Parse Gauntlet output from LLM response.
 * 
 * ## Expected Format
 * ```json
 * {
 *   "optimal_end": "string",
 *   "the_answer": { "statement": "string", "reasoning": "string", "next_step": "string" },
 *   ...
 * }
 * ```
 * 
 * ## Fallback Handling
 * - Extracts from === SECTION === headers if JSON fails
 * - Parses bullet lists for survivors/eliminated
 * - Accepts confidence as X/10 or 0.X format
 * 
 * ## Known Variants
 * - Some models wrap in markdown code blocks
 * - Some models use **Bold** section headers instead of ===
 */
export function parseGauntletOutput(text: string): GauntletOutput { ... }
```

---

## Phase 5: Testing Harness (Optional but Recommended)

### Task 5.1: Create Parser Test Fixtures

**Purpose**: Capture real failing outputs for regression testing.

**Requirements**:

1. Create `shared/__tests__/parsing-fixtures/` directory

2. Create a `saveParseFixture(parser: string, input: string, expectedOutput: any): void` function that:
   - Saves the input as `{parser}-{timestamp}.input.txt`
   - Saves expected output as `{parser}-{timestamp}.expected.json`
   - Only runs in development mode

3. Add a mechanism to run all fixtures through parsers and report pass/fail.

This is lower priority but valuable for preventing regressions when you modify parsing logic.

---

## Implementation Order

**Recommended sequence**:

1. **Phase 1.1** (JSON extraction) - Foundation, enables everything else
2. **Phase 3.1** (telemetry) - Helps you see what's working
3. **Phase 1.2** (pattern scoring) - Fixes your graph topology issue
4. **Phase 4.1** (Understand fallback) - Consistency
5. **Phase 2** (validation) - Safety net
6. **Phase 3.2** (error capture) - Debugging aid
7. **Phase 4.2** (documentation) - Maintainability
8. **Phase 5** (testing) - Long-term stability

---

## Constraints

- Do NOT delete any existing regex patterns
- Do NOT modify `shared/contract.ts`
- Do NOT change function signatures of exported functions (add new functions instead)
- All new functions should be exported
- Maintain the existing fallback-to-empty behavior for all parsers
- Console logging should be gated behind a `DEBUG_PARSING` flag or similar

---

## Verification

After implementation, verify:

1. Run the existing application—all parsing should continue to work
2. Check that `getParseStats()` returns meaningful data after a few parse operations
3. Confirm that the graph topology issue (using fallback when artifact exists) is resolved


---

End of instructions.