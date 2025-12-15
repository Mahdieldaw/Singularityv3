
// ═══════════════════════════════════════════════════════════════════════════
// src/core/ResponseProcessor.ts
// Pure response processing - NO I/O
// ═══════════════════════════════════════════════════════════════════════════

import { parseRefinerOutput, RefinerOutput, normalizeText } from '../../shared/parsing-utils';
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

    extractGraphTopology(text: string): { text: string; topology: object | null } {
        if (!text || typeof text !== 'string') return { text, topology: null };

        // Normalize markdown escapes (LLMs often escape special chars)
        const normalized = normalizeText(text);

        const match = normalized.match(/={3,}\s*GRAPH_TOPOLOGY\s*={3,}/i);
        if (!match || typeof match.index !== 'number') return { text, topology: null };
        const start = match.index + match[0].length;
        let rest = normalized.slice(start).trim();

        // Strip markdown code fence if present (```json ... ```)
        const codeBlockMatch = rest.match(/^```(?:json)?\s*\n([\s\S]*?)\n```/);
        if (codeBlockMatch) {
            rest = codeBlockMatch[1].trim();
        }

        let i = 0;
        while (i < rest.length && rest[i] !== '{') i++;
        if (i >= rest.length) return { text, topology: null };
        let depth = 0;
        let inStr = false;
        let esc = false;
        let jsonStart = i;
        let jsonEnd = -1;
        for (let j = jsonStart; j < rest.length; j++) {
            const ch = rest[j];
            if (inStr) {
                if (esc) {
                    esc = false;
                } else if (ch === '\\') {
                    esc = true;
                } else if (ch === '"') {
                    inStr = false;
                }
                continue;
            }
            if (ch === '"') {
                inStr = true;
                continue;
            }
            if (ch === '{') {
                depth++;
            } else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    jsonEnd = j;
                    break;
                }
            }
        }
        if (jsonEnd === -1) return { text, topology: null };
        let jsonText = rest.slice(jsonStart, jsonEnd + 1);

        // FIX: Replace unquoted S in supporter arrays (common LLM error)
        // Pattern: "supporters": [S, 1, 2] -> "supporters": ["S", 1, 2]
        jsonText = jsonText.replace(/("supporters"\s*:\s*\[)\s*S\s*([,\]])/g, '$1"S"$2');

        let topology = null;
        try {
            topology = JSON.parse(jsonText);
        } catch (e) {
            console.warn('[extractGraphTopology] JSON parse failed:', e instanceof Error ? e.message : String(e));
            return { text, topology: null };
        }
        const before = normalized.slice(0, match.index).trim();
        const after = rest.slice(jsonEnd + 1).trim();
        const newText = after ? `${before}\n${after}` : before;
        return { text: newText, topology };
    }

    extractOptions(text: string): { text: string; options: string | null } {
        if (!text || typeof text !== 'string') return { text, options: null };

        // Normalize markdown escapes AND unicode variants using shared utility
        const normalized = normalizeText(text);

        // First, check for GRAPH_TOPOLOGY delimiter and strip it to avoid contaminating options
        // The options section ends before GRAPH_TOPOLOGY if present
        let graphTopoStart = -1;
        // Match various GRAPH_TOPOLOGY formats including markdown headers: ## 📊 GRAPH_TOPOLOGY
        const graphTopoMatch = normalized.match(/\n#{1,3}\s*[^\w\n].*?GRAPH[_\s]*TOPOLOGY|\n?[🔬📊🗺️]*\s*={0,}GRAPH[_\s]*TOPOLOGY={0,}|\n?[🔬📊🗺️]\s*GRAPH[_\s]*TOPOLOGY/i);
        if (graphTopoMatch && typeof graphTopoMatch.index === 'number') {
            graphTopoStart = graphTopoMatch.index;
        }

        // Patterns ordered by strictness (stricter first)
        // NOTE: Use ={2,} to match 2+ equals signs (models sometimes output ==, not ===)
        const patterns = [
            // Markdown H2/H3 header with any emoji prefix: ## 🛠️ ALL_AVAILABLE_OPTIONS
            // Uses [^\w\n] to match emoji or any non-word char without specifying exact emoji
            { re: /\n#{1,3}\s*[^\w\n].*?ALL[_\s]*AVAILABLE[_\s]*OPTIONS.*?\n/i, minPosition: 0.15 },

            // Emoji-prefixed format (🛠️ ALL_AVAILABLE_OPTIONS) - standalone without markdown header
            { re: /\n?[🛠️🔧⚙️🛠]\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*\n/i, minPosition: 0.15 },

            // Standard delimiter with 2+ equals signs, optional leading newline
            { re: /\n?={2,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={2,}\n?/i, minPosition: 0 },
            { re: /\n?={2,}\s*ALL[_\s]*OPTIONS\s*={2,}\n?/i, minPosition: 0 },

            // Markdown wrapped variants
            { re: /\n\*\*\s*={2,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={2,}\s*\*\*\n?/i, minPosition: 0 },
            { re: /\n###\s*={2,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={2,}\n?/i, minPosition: 0 },

            // Heading styles (require newline before) - can appear mid-document
            { re: /\n\*\*All Available Options:?\*\*\n/i, minPosition: 0.25 },
            { re: /\n## All Available Options:?\n/i, minPosition: 0.25 },
            { re: /\n### All Available Options:?\n/i, minPosition: 0.25 },

            // Looser patterns - require at least 30% through document to avoid narrative mentions
            { re: /\nAll Available Options:\n/i, minPosition: 0.3 },
            { re: /\n\*\*Options:?\*\*\n/i, minPosition: 0.3 },
            { re: /\n## Options:?\n/i, minPosition: 0.3 },
            { re: /^Options:\n/im, minPosition: 0.3 },
        ];

        let bestMatch = null;
        let bestScore = -1;

        for (const pattern of patterns) {
            const m = normalized.match(pattern.re);
            if (m && typeof m.index === 'number') {
                const position = m.index / normalized.length;

                // Reject matches that are too early in the text
                if (position < pattern.minPosition) continue;

                // Score based on position (later is better) and pattern strictness
                const score = position * 100 + (patterns.indexOf(pattern) === 0 ? 50 : 0);

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = { index: m.index, length: m[0].length };
                }
            }
        }

        if (!bestMatch) return { text: normalized, options: null };

        const idx = bestMatch.index;
        const len = bestMatch.length;

        // Extract what comes after the delimiter, but stop before GRAPH_TOPOLOGY if present
        let afterDelimiter = normalized.slice(idx + len).trim();

        // If there's a GRAPH_TOPOLOGY section after our options, we need to cut before it
        if (graphTopoStart > idx) {
            // Find the relative position of GRAPH_TOPOLOGY in the afterDelimiter string
            const relativeGraphStart = graphTopoStart - (idx + len);
            if (relativeGraphStart > 0 && relativeGraphStart < afterDelimiter.length) {
                afterDelimiter = afterDelimiter.slice(0, relativeGraphStart).trim();
                console.log('[extractOptionsAndStrip] Cut options before GRAPH_TOPOLOGY, new length:', afterDelimiter.length);
            }
        }

        // Validation
        const listPreview = afterDelimiter.slice(0, 400);
        const hasListStructure = /^\s*[-*•]\s+|\n\s*[-*•]\s+|^\s*\d+\.\s+|\n\s*\d+\.\s+|^\s*\*\*[^*]+\*\*|^\s*Theme\s*:|^\s*###?\s+|^\s*[A-Z][^:\n]{2,}:|^[\u{1F300}-\u{1FAD6}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/iu.test(listPreview);

        const hasSubstantiveContent = afterDelimiter.length > 50 && (afterDelimiter.includes('\n') || afterDelimiter.includes(':'));

        if (!hasListStructure && !hasSubstantiveContent) {
            console.warn('[extractOptionsAndStrip] Matched delimiter but no list structure found, rejecting match at position', idx);
            return { text: normalized, options: null };
        }

        let before = normalized.slice(0, idx).trim();
        // Clean up trailing horizontal rules, leftover ALL_AVAILABLE_OPTIONS header text and emojis
        before = before
            .replace(/\n---+\s*$/, '')
            .replace(/\n#{1,3}\s*[🛠️🔧⚙️🛠]\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS.*$/i, '')
            .replace(/\n#{1,3}\s*[🛠️🔧⚙️🛠]\s*$/i, '')
            .replace(/[🛠️🔧⚙️🛠]\s*$/i, '')
            .trim();
        const after = afterDelimiter;
        return { text: before, options: after };
    }

    parseOptionTitles(optionsText: string): string[] {
        if (!optionsText) return [];
        const titles: string[] = [];
        const lines = optionsText.split('\n');
        for (const line of lines) {
            // Match: **Bold Title** (with optional colon/dash after)
            const match = line.match(/\*\*([^*]+)\*\*/);
            if (match) {
                const title = match[1].trim();
                // Avoid duplicates
                if (title && !titles.includes(title)) {
                    titles.push(title);
                }
            }
        }
        return titles;
    }

    /**
     * Full mapping response pipeline
     */
    processMappingResponse(text: string): {
        text: string;
        topology: object | null;
        options: string | null;
        optionTitles: string[];
    } {
        const step1 = this.extractGraphTopology(text);
        const step2 = this.extractOptions(step1.text);
        const titles = step2.options ? this.parseOptionTitles(step2.options) : [];

        return {
            text: step2.text,
            topology: step1.topology,
            options: step2.options,
            optionTitles: titles,
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REFINER RESPONSE PARSER
    // ─────────────────────────────────────────────────────────────────────────

    parseRefinerResponse(text: string): RefinerOutput {
        return parseRefinerOutput(text);
    }
}
