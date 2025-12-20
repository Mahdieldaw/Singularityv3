/**
 * Shared Parsing Utilities for ALL_AVAILABLE_OPTIONS and GRAPH_TOPOLOGY
 * 
 * Single source of truth for parsing mapping responses.
 * Used by both backend (workflow-engine.js) and frontend (DecisionMapSheet.tsx).
 */

// ============================================================================
// TYPES
// ============================================================================

export interface GraphNode {
    id: string;
    label: string;
    theme: string;
    supporters: (string | number)[];
    support_count: number;
}

export interface GraphEdge {
    source: string;
    target: string;
    reason: string;
    type: 'conflicts' | 'complements' | 'prerequisite' | string;
}

export interface GraphTopology {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

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
export function extractGraphTopologyAndStrip(text: string): { text: string; topology: GraphTopology | null } {
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

// ============================================================================
// REFINER OUTPUT PARSING (NEW STRUCTURE)
// ============================================================================

export type LeapAction = "proceed" | "verify" | "reframe" | "research";

export interface Gem {
    insight: string;
    source: string;
    impact: string;
}

export interface Outlier {
    position: string;
    source: string;
    why: string;
}

export interface Attribution {
    claim: string;
    source: string;
}

export interface Leap {
    action: LeapAction;
    target: string;
    why: string;
}

export interface RefinerOutput {
    synthesisPlus: string | null;  // Enhanced answer with inline [ModelName] attributions

    gem: Gem | null;

    outlier: Outlier | null;

    attributions: Attribution[];

    leap: Leap;

    // rawText is essential for UI display
    rawText?: string;
}

/**
 * Parse Refiner output from markdown text or JSON
 */
export function parseRefinerOutput(text: string): RefinerOutput {
    if (!text || typeof text !== 'string') {
        return createEmptyRefinerOutput();
    }

    const normalized = normalizeText(text);

    // 1. Try JSON parsing first (for robustness)
    const jsonResult = tryParseJsonRefinerOutput(normalized);
    if (jsonResult) {
        return { ...jsonResult, rawText: text };
    }

    // 2. Fallback to Regex extraction with robust patterns
    return {
        synthesisPlus: extractSynthesisPlus(normalized),
        gem: extractGem(normalized),
        outlier: extractOutlier(normalized),
        attributions: extractAttributions(normalized),
        leap: extractLeap(normalized),
        rawText: text,
    };
}

function createEmptyRefinerOutput(rawText: string = ''): RefinerOutput {
    return {
        synthesisPlus: null,
        gem: null,
        outlier: null,
        attributions: [],
        leap: { action: 'proceed', target: '', why: '' },
        rawText,
    };
}


// ============================================================================
// JSON PARSING
// ============================================================================

function tryParseJsonRefinerOutput(text: string): Omit<RefinerOutput, 'rawText'> | null {
    try {
        let jsonText = text.trim();

        // Handle code blocks
        const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (codeBlockMatch) {
            jsonText = codeBlockMatch[1].trim();
        }

        // Handle double-stringified JSON
        if (jsonText.startsWith('"') && jsonText.endsWith('"')) {
            try {
                const unquoted = JSON.parse(jsonText);
                if (typeof unquoted === 'string') {
                    jsonText = unquoted.trim();
                } else if (typeof unquoted === 'object') {
                    return normalizeRefinerObject(unquoted);
                }
            } catch {
                // Continue with original text
            }
        }

        // Find JSON boundaries
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1) return null;

        const candidate = jsonText.substring(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(candidate);

        if (parsed && typeof parsed === 'object') {
            return normalizeRefinerObject(parsed);
        }
    } catch {
        // Silent failure, fall back to regex parsing
    }
    return null;
}

function normalizeRefinerObject(parsed: any): Omit<RefinerOutput, 'rawText'> | null {
    // Validate it looks like a refiner output (new structure)
    if (!('synthesisPlus' in parsed) && !('gem' in parsed) && !('leap' in parsed)) {
        return null;
    }

    // Normalize synthesisPlus
    const synthesisPlus = parsed.synthesisPlus ? String(parsed.synthesisPlus) : null;

    // Normalize gem
    let gem: Gem | null = null;
    if (parsed.gem && typeof parsed.gem === 'object') {
        gem = {
            insight: String(parsed.gem.insight || ''),
            source: String(parsed.gem.source || ''),
            impact: String(parsed.gem.impact || '')
        };
    }

    // Normalize outlier
    let outlier: Outlier | null = null;
    if (parsed.outlier && typeof parsed.outlier === 'object') {
        outlier = {
            position: String(parsed.outlier.position || ''),
            source: String(parsed.outlier.source || ''),
            why: String(parsed.outlier.why || '')
        };
    }

    // Normalize attributions
    const attributions: Attribution[] = Array.isArray(parsed.attributions)
        ? parsed.attributions.map((a: any) => ({
            claim: String(a.claim || ''),
            source: String(a.source || '')
        }))
        : [];

    // Normalize leap
    const leap: Leap = {
        action: (['proceed', 'verify', 'reframe', 'research'].includes(parsed.leap?.action)
            ? parsed.leap.action
            : 'proceed') as LeapAction,
        target: String(parsed.leap?.target || ''),
        why: String(parsed.leap?.why || '')
    };

    return {
        synthesisPlus,
        gem,
        outlier,
        attributions,
        leap,
    };
}


// ============================================================================
// CORE HELPERS
// ============================================================================

/**
 * Extract a named section from markdown text.
 * Handles: ## Header, ### Header, **Header**:, Header:, etc.
 */
function extractSection(text: string, sectionName: string): string {
    if (!text || !sectionName) return '';

    const escapedName = sectionName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    // Patterns from strictest to loosest for main section
    const patterns = [
        // ## Section Name or ### Section Name
        new RegExp(
            `(?:^|\\n)#{1,3}\\s*[^\\w\\n]*${escapedName}[^\\n]*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s|\\n---\\s*\\n|$)`,
            'i'
        ),
        // **Section Name**: or **Section Name**
        new RegExp(
            `\\*\\*\\s*${escapedName}\\s*\\*\\*[:\\s]*\\n?([\\s\\S]*?)(?=\\n\\*\\*[A-Z]|\\n#{1,3}\\s|\\n---\\s*\\n|$)`,
            'i'
        ),
        // Section Name: (plain)
        new RegExp(
            `(?:^|\\n)${escapedName}[:\\s]+\\n?([\\s\\S]*?)(?=\\n[A-Z][a-z]+[:\\s]+\\n|\\n#{1,3}\\s|\\n---\\s*\\n|$)`,
            'i'
        ),
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]?.trim()) {
            return match[1].trim();
        }
    }

    return '';
}

/**
 * Extract a labeled value from text.
 * Handles: **Label**: value, - **Label**: value, Label: value
 */
function extractLabeledValue(text: string, label: string): string | null {
    if (!text || !label) return null;

    const escaped = label.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    const patterns = [
        // - **Label**: value (list item with bold)
        new RegExp(`[-*•]\\s*\\*\\*${escaped}\\*\\*[:\\s]*([^\\n]+)`, 'i'),
        // **Label**: value (inline bold)
        new RegExp(`\\*\\*${escaped}\\*\\*[:\\s]*([^\\n]+)`, 'i'),
        // Label: value (plain)
        new RegExp(`(?:^|\\n)${escaped}[:\\s]+([^\\n]+)`, 'i'),
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]?.trim()) {
            return match[1].trim();
        }
    }

    return null;
}


// ============================================================================
// NEW EXTRACTORS
// ============================================================================

/**
 * Extract synthesisPlus content from text
 */
function extractSynthesisPlus(text: string): string | null {
    const section = extractSection(text, 'Synthesis+') ||
        extractSection(text, 'SynthesisPlus') ||
        extractSection(text, 'Enhanced Synthesis') ||
        extractSection(text, 'Enhanced Answer');

    return section || null;
}

/**
 * Extract gem insight from text
 */
function extractGem(text: string): Gem | null {
    const section = extractSection(text, 'Gem') ||
        extractSection(text, 'Key Insight') ||
        extractSection(text, 'Hidden Gem');

    if (!section) return null;

    const insight = extractLabeledValue(section, 'insight') ||
        extractLabeledValue(section, 'finding') ||
        section.split('\n')[0]?.trim() || '';
    const source = extractLabeledValue(section, 'source') || '';
    const impact = extractLabeledValue(section, 'impact') || '';

    if (!insight) return null;

    return { insight, source, impact };
}

/**
 * Extract outlier position from text
 */
function extractOutlier(text: string): Outlier | null {
    const section = extractSection(text, 'Outlier') ||
        extractSection(text, 'Dissenting View') ||
        extractSection(text, 'Contrary Position');

    if (!section) return null;

    const position = extractLabeledValue(section, 'position') ||
        extractLabeledValue(section, 'view') ||
        section.split('\n')[0]?.trim() || '';
    const source = extractLabeledValue(section, 'source') || '';
    const why = extractLabeledValue(section, 'why') ||
        extractLabeledValue(section, 'reason') || '';

    if (!position) return null;

    return { position, source, why };
}

/**
 * Extract attributions from text
 */
function extractAttributions(text: string): Attribution[] {
    const section = extractSection(text, 'Attributions') ||
        extractSection(text, 'Sources') ||
        extractSection(text, 'Claims');

    if (!section) return [];

    const attributions: Attribution[] = [];

    // Pattern: - Claim text (Source) or - **Claim**: Source
    const pattern = /[-*•]\s*(?:\*\*)?([^*:\n(]+)(?:\*\*)?[:\s]*(?:\(([^)]+)\)|([^\n]+))?/gi;
    let match;
    while ((match = pattern.exec(section)) !== null) {
        const claim = match[1].trim();
        const source = (match[2] || match[3] || '').trim();
        if (claim) {
            attributions.push({ claim, source });
        }
    }

    return attributions;
}

/**
 * Extract leap (next step) from text
 */
function extractLeap(text: string): Leap {
    const section = extractSection(text, 'Leap') ||
        extractSection(text, 'Next Step') ||
        extractSection(text, 'Recommended Action') ||
        extractSection(text, 'Action');

    const defaultLeap: Leap = { action: 'proceed', target: '', why: '' };

    if (!section) return defaultLeap;

    // Try to extract structured format
    const actionMatch = section.match(/\*?\*?(proceed|verify|reframe|research)\*?\*?[:\s]+(.+)/i);

    if (actionMatch) {
        const action = actionMatch[1].toLowerCase() as LeapAction;
        const rest = actionMatch[2].trim();

        // Try to split into target and why
        const whyMatch = rest.match(/(.+?)(?:\s*[—\-]+\s*(?:because|why)[:\s]*(.+))?$/i);

        return {
            action,
            target: whyMatch?.[1]?.trim() || rest,
            why: whyMatch?.[2]?.trim() || ''
        };
    }

    // Try labeled values
    const actionValue = extractLabeledValue(section, 'action');
    const action: LeapAction = (['proceed', 'verify', 'reframe', 'research'].includes(actionValue?.toLowerCase() || '')
        ? actionValue!.toLowerCase()
        : 'proceed') as LeapAction;
    const target = extractLabeledValue(section, 'target') || '';
    const why = extractLabeledValue(section, 'why') || extractLabeledValue(section, 'reason') || '';

    if (target) {
        return { action, target, why };
    }

    // Fallback: use first sentence as target, infer action from keywords
    const firstSentence = section.split(/[.!?]\s/)[0];
    let inferredAction: LeapAction = 'proceed';
    if (/verify|check|confirm|validate/i.test(section)) inferredAction = 'verify';
    if (/reframe|rephrase|reconsider/i.test(section)) inferredAction = 'reframe';
    if (/research|investigate|explore|look into/i.test(section)) inferredAction = 'research';

    return {
        action: inferredAction,
        target: firstSentence?.trim() || section.slice(0, 100),
        why: ''
    };
}
