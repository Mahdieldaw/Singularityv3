
// ═══════════════════════════════════════════════════════════════════════════
// src/core/ResponseProcessor.ts
// Pure response processing - NO I/O
// ═══════════════════════════════════════════════════════════════════════════

import { parseRefinerOutput, RefinerOutput, parseMappingResponse, parseOptionTitles } from '../../shared/parsing-utils';
export type { RefinerOutput };


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
