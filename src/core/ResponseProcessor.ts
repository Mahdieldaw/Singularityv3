
// ═══════════════════════════════════════════════════════════════════════════
// src/core/ResponseProcessor.ts
// Pure response processing - NO I/O
// ═══════════════════════════════════════════════════════════════════════════

import { parseRefinerOutput, RefinerOutput, parseMappingResponse, parseOptionTitles } from '../../shared/parsing-utils';
export type { RefinerOutput };

export interface ComposerResult {
    refinedPrompt: string;
    explanation: string;
    strategicTake?: string;
}

export interface AnalystResult {
    audit: string;
    variants: string[];
    guidance?: string;
}

export class ResponseProcessor {

    // ─────────────────────────────────────────────────────────────────────────
    // UNIVERSAL CONTENT EXTRACTION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Extract text content from any response format.
     * Handles: strings, { text: string }, { content: string }, objects
     */
    extractContent(raw: any): string {
        if (!raw) return "";

        // Direct string
        if (typeof raw === 'string') return raw.trim();

        // Object with text/content field
        if (typeof raw === 'object') {
            if (typeof raw.text === 'string') return raw.text.trim();
            if (typeof raw.content === 'string') return raw.content.trim();
            // Stringify as fallback
            try {
                return JSON.stringify(raw, null, 2);
            } catch {
                return "[Unserializable Object]";
            }
        }

        return String(raw).trim();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COMPOSER/ANALYST RESPONSE PARSERS
    // ─────────────────────────────────────────────────────────────────────────

    parseComposerResponse(text: string): ComposerResult {
        const result: ComposerResult = {
            refinedPrompt: text,
            explanation: "",
        };

        try {
            // Extract STRATEGIC TAKE (optional)
            const strategicMatch = text.match(/(?:^|\n)[*#]*\s*STRATEGIC\s*TAKE[*]*:?\s*([\s\S]*?)(?=(?:^|\n)[*#]*\s*REFINED|$)/i);
            if (strategicMatch?.[1]) {
                result.strategicTake = strategicMatch[1].trim();
            }

            // Extract REFINED_PROMPT
            const refinedRegex = /(?:^|\n)[*#]*\s*REFINED[_\s]*PROMPT[*]*:?\s*([\s\S]*?)(?=(?:^|\n)[*#]*\s*NOTES|$)/i;
            const refinedMatch = text.match(refinedRegex);
            if (refinedMatch?.[1]) {
                result.refinedPrompt = refinedMatch[1].trim();
            }

            // Extract NOTES
            const notesRegex = /(?:^|\n)[*#]*\s*NOTES[*]*:?\s*([\s\S]*?)$/i;
            const notesMatch = text.match(notesRegex);
            if (notesMatch?.[1]) {
                result.explanation = notesMatch[1].trim();
            }

            // Fallback: if no sections found, return whole text as prompt
            if (!refinedMatch && !notesMatch && !strategicMatch) {
                result.refinedPrompt = text.trim();
            }
        } catch (e) {
            console.warn("[ResponseProcessor] Failed to parse composer response:", e);
        }

        return result;
    }

    parseAnalystResponse(text: string): AnalystResult {
        const result: AnalystResult = {
            audit: "No audit available.",
            variants: [],
        };

        try {
            // Extract AUDIT section
            const auditRegex = /(?:^|\n)[*#]*\s*AUDIT[*]*:?\s*([\s\S]*?)(?=(?:^|\n)[*#]*\s*VARIANTS|$)/i;
            const auditMatch = text.match(auditRegex);
            if (auditMatch?.[1]) {
                result.audit = auditMatch[1].trim();
            }

            // Extract VARIANTS section
            const variantsRegex = /(?:^|\n)[*#]*\s*VARIANTS[*]*:?\s*([\s\S]*?)(?=(?:^|\n)[*#]*\s*GUIDANCE|$)/i;
            const variantsMatch = text.match(variantsRegex);
            if (variantsMatch?.[1]) {
                result.variants = this._parseVariantsList(variantsMatch[1].trim());
            }

            // Extract GUIDANCE section (optional)
            const guidanceRegex = /(?:^|\n)[*#]*\s*GUIDANCE[*]*:?\s*([\s\S]*?)$/i;
            const guidanceMatch = text.match(guidanceRegex);
            if (guidanceMatch?.[1]) {
                result.guidance = guidanceMatch[1].trim();
            }
        } catch (e) {
            console.warn("[ResponseProcessor] Failed to parse analyst response:", e);
        }

        return result;
    }

    private _parseVariantsList(variantsText: string): string[] {
        const variants: string[] = [];

        // Check for numbered list
        const hasNumberedList = /^(\d+[\.)]|-)\s+/m.test(variantsText);

        if (hasNumberedList) {
            const lines = variantsText.split('\n');
            let currentVariant = '';

            for (const line of lines) {
                const match = line.match(/^(\d+[\.)]|-)\s+(.*)/);
                if (match) {
                    if (currentVariant) variants.push(currentVariant.trim());
                    currentVariant = match[2];
                } else if (currentVariant) {
                    // Append continuation lines to current variant
                    currentVariant += '\n' + line;
                } else if (line.trim()) {
                    // ✅ RESTORED: Handle unnumbered lines at start
                    if (variants.length === 0) {
                        currentVariant = line.trim();
                    }
                }
            }
            if (currentVariant) variants.push(currentVariant.trim());
        } else {
            // Split by double newlines for unnumbered paragraphs
            const chunks = variantsText.split(/\n\s*\n/);
            for (const chunk of chunks) {
                if (chunk.trim()) variants.push(chunk.trim());
            }
        }

        return variants.length > 0 ? variants : (variantsText ? [variantsText] : []);
    }
    // ─────────────────────────────────────────────────────────────────────────
    // MAPPING RESPONSE PROCESSORS (from workflow-engine.js)
    // ─────────────────────────────────────────────────────────────────────────

    processMappingResponse(text: string): {
        text: string;
        topology: object | null;
        options: string | null;
        optionTitles: string[];
    } {
        const { narrative, graphTopology, options, optionTitles } = parseMappingResponse(text);

        return {
            text: narrative,
            topology: graphTopology,
            options,
            optionTitles,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REFINER RESPONSE PARSER
    // ─────────────────────────────────────────────────────────────────────────

    parseRefinerResponse(text: string): RefinerOutput {
        return parseRefinerOutput(text);
    }

    parseOptionTitles(text: string): string[] {
        return parseOptionTitles(text);
    }
}
