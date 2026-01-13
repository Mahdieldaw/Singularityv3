
// ═══════════════════════════════════════════════════════════════════════════
// src/core/ResponseProcessor.ts
// Pure response processing - NO I/O
// ═══════════════════════════════════════════════════════════════════════════

import { parseUnifiedMapperOutput } from '../../shared/parsing-utils';


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
        const { narrative, topology, options } = parseUnifiedMapperOutput(text);

        return {
            text: narrative,
            topology: topology || null,
            options: options || null,
            optionTitles: [],
        };
    }

    parseOptionTitles(text: string): string[] {
        return [];
    }
}
