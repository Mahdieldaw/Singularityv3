/**
 * Shared Parsing Utilities for ALL_AVAILABLE_OPTIONS and GRAPH_TOPOLOGY
 * 
 * Single source of truth for parsing mapping responses.
 * Used by both backend (workflow-engine.js) and frontend (DecisionMapSheet.tsx).
 */

// ============================================================================
// NORMALIZATION
// ============================================================================

/**
 * Normalize markdown escapes and unicode variants
 */
export function normalizeText(text: string): string {
    return text
        .replace(/\\=/g, '=')
        .replace(/\\_/g, '_')
        .replace(/\\\*/g, '*')
        .replace(/\\-/g, '-')
        .replace(/[＝═⁼˭꓿﹦]/g, '=')
        .replace(/[‗₌]/g, '=')
        .replace(/\u2550/g, '=')
        .replace(/\uFF1D/g, '=');
}

// ============================================================================
// GRAPH_TOPOLOGY PARSING
// ============================================================================

/**
 * Pattern to match GRAPH_TOPOLOGY headers in various formats
 */
const GRAPH_TOPOLOGY_PATTERN = /\n#{1,3}\s*[^\w\n].*?GRAPH[_\s]*TOPOLOGY|\n?[🔬📊🗺️]*\s*={0,}GRAPH[_\s]*TOPOLOGY={0,}|\n?[🔬📊🗺️]\s*GRAPH[_\s]*TOPOLOGY|={3,}\s*GRAPH[_\s]*TOPOLOGY\s*={3,}/i;

/**
 * Find position of GRAPH_TOPOLOGY header in text
 */
export function findGraphTopologyPosition(text: string): number {
    const match = text.match(GRAPH_TOPOLOGY_PATTERN);
    return match && typeof match.index === 'number' ? match.index : -1;
}

/**
 * Extract GRAPH_TOPOLOGY JSON from text and return cleaned text
 */
export function extractGraphTopologyAndStrip(text: string): { text: string; topology: any | null } {
    if (!text || typeof text !== 'string') return { text: text || '', topology: null };

    const normalized = normalizeText(text);
    const match = normalized.match(/={3,}\s*GRAPH[_\s]*TOPOLOGY\s*={3,}/i);

    if (!match || typeof match.index !== 'number') {
        return { text: normalized, topology: null };
    }

    const start = match.index + match[0].length;
    let rest = normalized.slice(start).trim();

    // Handle code block wrapped JSON
    const codeBlockMatch = rest.match(/^```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
        rest = codeBlockMatch[1].trim();
    }

    // Find JSON object
    let i = 0;
    while (i < rest.length && rest[i] !== '{') i++;
    if (i >= rest.length) return { text: normalized.slice(0, match.index).trim(), topology: null };

    // Parse JSON with balanced braces
    let depth = 0;
    let inStr = false;
    let esc = false;

    for (let j = i; j < rest.length; j++) {
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
                try {
                    let jsonText = rest.slice(i, j + 1);
                    // Fix unquoted S in supporters arrays
                    jsonText = jsonText.replace(/("supporters"\s*:\s*\[)\s*S\s*([,\]])/g, '$1"S"$2');
                    const topology = JSON.parse(jsonText);
                    const before = normalized.slice(0, match.index).trim();
                    const after = rest.slice(j + 1).trim();
                    const newText = after ? `${before}\n${after}` : before;
                    return { text: newText, topology };
                } catch {
                    break;
                }
            }
        }
    }

    return { text: normalized.slice(0, match.index).trim(), topology: null };
}

// ============================================================================
// ALL_AVAILABLE_OPTIONS PARSING
// ============================================================================

/**
 * Patterns to match ALL_AVAILABLE_OPTIONS headers
 */
const OPTIONS_PATTERNS = [
    // Markdown H2/H3 header with any emoji prefix: ## 🛠️ ALL_AVAILABLE_OPTIONS
    { re: /\n#{1,3}\s*[^\w\n].*?ALL[_\s]*AVAILABLE[_\s]*OPTIONS.*?\n/i, minPosition: 0.15 },

    // Emoji-prefixed format (🛠️ ALL_AVAILABLE_OPTIONS) - standalone
    { re: /\n?[🛠️🔧⚙️🛠]\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*\n/i, minPosition: 0.15 },

    // Standard delimiter with === wrapper
    { re: /\n?={2,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={2,}\n?/i, minPosition: 0 },
    { re: /\n?={2,}\s*ALL[_\s]*OPTIONS\s*={2,}\n?/i, minPosition: 0 },

    // Markdown wrapped variants
    { re: /\n\*\*\s*={2,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={2,}\s*\*\*\n?/i, minPosition: 0 },
    { re: /\n###\s*={2,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={2,}\n?/i, minPosition: 0 },

    // Heading styles
    { re: /\n\*\*All Available Options:?\*\*\n/i, minPosition: 0.25 },
    { re: /\n## All Available Options:?\n/i, minPosition: 0.25 },
    { re: /\n### All Available Options:?\n/i, minPosition: 0.25 },

    // Looser patterns
    { re: /\nAll Available Options:\n/i, minPosition: 0.3 },
    { re: /\n\*\*Options:?\*\*\n/i, minPosition: 0.3 },
    { re: /\n## Options:?\n/i, minPosition: 0.3 },
];

/**
 * Clean narrative text by removing trailing separators and leftover header fragments
 */
export function cleanNarrativeText(text: string): string {
    return text
        .replace(/\n---+\s*$/, '')
        .replace(/\n#{1,3}\s*[🛠️🔧⚙️🛠]?\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS.*$/i, '')
        .replace(/\n#{1,3}\s*[🛠️🔧⚙️🛠]\s*$/i, '')
        .replace(/[🛠️🔧⚙️🛠]\s*$/i, '')
        .trim();
}

/**
 * Clean options text by removing trailing GRAPH_TOPOLOGY header
 */
export function cleanOptionsText(text: string): string {
    const graphTopoPos = findGraphTopologyPosition(text);
    if (graphTopoPos > 0) {
        return text.slice(0, graphTopoPos).trim();
    }
    return text.trim();
}

/**
 * Extract ALL_AVAILABLE_OPTIONS from text and return cleaned narrative
 */
export function extractOptionsAndStrip(text: string): { text: string; options: string | null } {
    if (!text || typeof text !== 'string') return { text: text || '', options: null };

    let normalized = normalizeText(text);

    // First, find and strip GRAPH_TOPOLOGY section
    const graphTopoStart = findGraphTopologyPosition(normalized);
    if (graphTopoStart > 0) {
        normalized = normalized.slice(0, graphTopoStart).trim();
    }

    // Find best matching options delimiter
    let bestMatch: { index: number; length: number } | null = null;
    let bestScore = -1;

    for (const pattern of OPTIONS_PATTERNS) {
        const match = normalized.match(pattern.re);
        if (match && typeof match.index === 'number') {
            const position = match.index / normalized.length;
            if (position < pattern.minPosition) continue;
            const score = position * 100;
            if (score > bestScore) {
                bestScore = score;
                bestMatch = { index: match.index, length: match[0].length };
            }
        }
    }

    if (!bestMatch) return { text: normalized, options: null };

    const afterDelimiter = normalized.substring(bestMatch.index + bestMatch.length).trim();
    const listPreview = afterDelimiter.slice(0, 400);

    // Validate that what follows looks like structured content
    const hasListStructure = /^\s*[-*•]\s+|\n\s*[-*•]\s+|^\s*\d+\.\s+|\n\s*\d+\.\s+|^\s*\*\*[^*]+\*\*|^\s*Theme\s*:|^\s*###?\s+|^\s*[A-Z][^:\n]{2,}:|^[\u{1F300}-\u{1FAD6}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/iu.test(listPreview);
    const hasSubstantiveContent = afterDelimiter.length > 50 && (afterDelimiter.includes('\n') || afterDelimiter.includes(':'));

    if (!hasListStructure && !hasSubstantiveContent) {
        return { text: normalized, options: null };
    }

    const narrative = cleanNarrativeText(normalized.substring(0, bestMatch.index));
    const options = cleanOptionsText(afterDelimiter);

    return { text: narrative, options: options || null };
}

/**
 * Parse mapping response - convenience function that extracts both options and topology
 */
export function parseMappingResponse(response: string | null | undefined): {
    narrative: string;
    options: string | null;
    graphTopology: any | null;
} {
    if (!response) return { narrative: '', options: null, graphTopology: null };

    // First extract graph topology
    const { text: textWithoutTopology, topology } = extractGraphTopologyAndStrip(response);

    // Then extract options from remaining text
    const { text: narrative, options } = extractOptionsAndStrip(textWithoutTopology);

    return {
        narrative: cleanNarrativeText(narrative),
        options: options ? cleanOptionsText(options) : null,
        graphTopology: topology,
    };
}
