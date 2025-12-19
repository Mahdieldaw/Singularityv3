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
// REFINER OUTPUT PARSING
// ============================================================================

export type SignalType = "divergence" | "overclaim" | "gap" | "blindspot";
export type SignalPriority = "blocker" | "risk" | "enhancement";
export type NextStepAction = "proceed" | "verify" | "reframe" | "research";

export interface Signal {
    type: SignalType;
    priority: SignalPriority;
    content: string;
    source: string;
    impact: string;
}

export interface RefinerOutput {
    signals: Signal[];

    unlistedOptions: Array<{
        title: string;
        description: string;
        source: string;
    }>;

    nextStep: {
        action: NextStepAction;
        target: string;
        why: string;
    } | null;

    reframe: {
        issue: string;
        suggestion: string;
        unlocks: string;
    } | null;

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
        signals: extractSignals(normalized),
        unlistedOptions: extractUnlistedOptions(normalized),
        nextStep: extractNextStep(normalized),
        reframe: extractReframe(normalized),
        rawText: text,
    };
}

function createEmptyRefinerOutput(rawText: string = ''): RefinerOutput {
    return {
        signals: [],
        unlistedOptions: [],
        nextStep: null,
        reframe: null,
        rawText,
    };
}


// ============================================================================
// JSON PARSING (FALLBACK)
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
    // Validate it looks like a refiner output (new structure uses signals)
    if (!('signals' in parsed) && !('nextStep' in parsed) && !('reframe' in parsed)) {
        return null;
    }

    // Normalize signals array
    const signals: Signal[] = Array.isArray(parsed.signals)
        ? parsed.signals.map((s: any) => ({
            type: s.type || 'gap',
            priority: s.priority || 'enhancement',
            content: String(s.content || ''),
            source: String(s.source || ''),
            impact: String(s.impact || '')
        }))
        : [];

    // Normalize unlistedOptions
    const unlistedOptions = Array.isArray(parsed.unlistedOptions)
        ? parsed.unlistedOptions.map((opt: any) => ({
            title: String(opt.title || ''),
            description: String(opt.description || ''),
            source: String(opt.source || '')
        }))
        : [];

    // Normalize nextStep
    let nextStep: RefinerOutput['nextStep'] = null;
    if (parsed.nextStep && typeof parsed.nextStep === 'object') {
        nextStep = {
            action: parsed.nextStep.action || 'proceed',
            target: String(parsed.nextStep.target || ''),
            why: String(parsed.nextStep.why || '')
        };
    }

    // Normalize reframe
    let reframe: RefinerOutput['reframe'] = null;
    if (parsed.reframe && typeof parsed.reframe === 'object') {
        reframe = {
            issue: String(parsed.reframe.issue || ''),
            suggestion: String(parsed.reframe.suggestion || ''),
            unlocks: String(parsed.reframe.unlocks || '')
        };
    }

    return {
        signals,
        unlistedOptions,
        nextStep,
        reframe
    };
}


// ============================================================================
// CORE HELPERS (Extracted from parsed.ts)
// ============================================================================

/**
 * Extract a named section from markdown text.
 * Handles: ## Header, ### Header, **Header**:, Header:, etc.
 */
function extractSection(text: string, sectionName: string, subsection?: string): string {
    if (!text || !sectionName) return '';

    const escapedName = sectionName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    if (subsection) {
        // Extract subsection from within parent section
        const parentSection = extractSection(text, sectionName);
        if (!parentSection) return '';

        const escapedSub = subsection.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        // Look for **Subsection**: or similar within the parent text
        const pattern = new RegExp(`\\*{0,2}\\s*${escapedSub}\\s*\\*{0,2}\\s*:?\\s*([\\s\\S]*?)(?=\\n\\*\\*|\\n#{1,3}|\\n---|$)`, 'i');
        const match = parentSection.match(pattern);
        return match?.[1]?.trim() || '';
    }

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

/**
 * Parse any list format into array of strings.
 * Handles: - item, * item, • item, 1. item, paragraphs
 */
function parseList(text: string): string[] {
    if (!text?.trim()) return [];

    const lines = text.split('\n');
    const items: string[] = [];
    let currentItem = '';

    const listMarkerPattern = /^(\s*)([-*•]|\d+[.)]\s*)\s*/;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            if (currentItem) {
                items.push(currentItem.trim());
                currentItem = '';
            }
            continue;
        }

        const markerMatch = line.match(listMarkerPattern);
        if (markerMatch) {
            if (currentItem) items.push(currentItem.trim());
            currentItem = line.replace(listMarkerPattern, '').trim();
        } else if (currentItem) {
            currentItem += ' ' + trimmed;
        } else {
            currentItem = trimmed;
        }
    }

    if (currentItem) items.push(currentItem.trim());

    // Fallback: split by double newlines if no list markers found
    if (items.length === 0) {
        return text.split(/\n\s*\n/).filter(c => c.trim()).map(c => c.trim());
    }

    return items;
}

/**
 * Parse text that could be either a list OR a single paragraph
 */
function parseListOrParagraph(text: string): string[] {
    if (!text?.trim()) return [];

    // Check if it contains list markers
    const hasListMarkers = /^[-*•]\s+|\n[-*•]\s+|^\d+[.)]\s+|\n\d+[.)]\s+/m.test(text);

    if (hasListMarkers) {
        return parseList(text);
    }

    // It's a paragraph - return as single item
    return [text.trim()];
}

// ============================================================================
// FIELD EXTRACTORS
// ============================================================================

function extractConfidenceScore(text: string): number {
    const patterns = [
        /confidence\s+score[:\s]*\*?\*?[\[\(]?(\d+\.?\d*)/i,
        /\*\*(\d+\.?\d*)\*\*\s*confidence/i,
        /score[:\s]*(\d+\.?\d*)/i,
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) {
            const score = parseFloat(match[1]);
            if (!isNaN(score)) {
                return score > 1 ? score / 100 : Math.max(0, Math.min(1, score));
            }
        }
    }

    return 0.5;
}

function extractRationale(text: string): string {
    // Try within Reliability Assessment section first
    const section = extractSection(text, 'Reliability Assessment');
    if (section) {
        const rationale = extractLabeledValue(section, 'rationale');
        if (rationale) return rationale;
    }

    // Try standalone
    return extractSection(text, 'Rationale') || '';
}

function extractPresentationStrategy(text: string): string {
    const section = extractSection(text, 'Presentation Strategy');
    if (!section) return 'confident_with_caveats';

    // Handle: **Recommended**: **value** OR **Recommended**: value
    const patterns = [
        /\*\*recommended\*\*[:\s]*\*{0,2}([a-z_]+)\*{0,2}/i,
        /recommended[:\s]+\*{0,2}([a-z_]+)\*{0,2}/i,
    ];

    const validStrategies = [
        'definitive', 'confident_with_caveats', 'options_forward',
        'context_dependent', 'low_confidence', 'needs_verification',
        'query_problematic'
    ];

    for (const pattern of patterns) {
        const match = section.match(pattern);
        if (match?.[1]) {
            const value = match[1].toLowerCase();
            if (validStrategies.includes(value)) return value;
        }
    }

    return 'confident_with_caveats';
}

function extractStrategyRationale(text: string): string {
    const section = extractSection(text, 'Presentation Strategy');
    if (!section) return '';
    return extractLabeledValue(section, 'why') || '';
}

// ============================================================================
// DEPRECATED EXTRACT FUNCTIONS REMOVED
// The following functions were removed as they referenced fields no longer
// in the new signal-based RefinerOutput structure:
// - extractVerificationTriggers
// - extractReframingSuggestion  
// - extractSynthesisAccuracy
// - extractGaps
// - extractMetaPattern
// - extractHonestAssessment
// - extractMapperAudit
// ============================================================================

// ============================================================================
// NEW SIGNAL-BASED EXTRACTORS
// ============================================================================

/**
 * Extract signals from freeform text.
 * Looks for patterns like:
 * - **[BLOCKER]** Type: Content
 * - ⚠️ Divergence: Content
 * - Signal sections with type/priority/content
 */
function extractSignals(text: string): Signal[] {
    const signals: Signal[] = [];

    // Try to extract from a "Signals" section
    const signalsSection = extractSection(text, 'Signals');
    const textToSearch = signalsSection || text;

    // Pattern 1: **[PRIORITY]** Type: Content — Source — Impact
    const patternWithBrackets = /\*\*\[(blocker|risk|enhancement)\]\*\*\s*(divergence|overclaim|gap|blindspot)[:\s]+([^—\n]+)(?:[—\-]+\s*source[:\s]*([^—\n]+))?(?:[—\-]+\s*impact[:\s]*([^\n]+))?/gi;
    let match;
    while ((match = patternWithBrackets.exec(textToSearch)) !== null) {
        signals.push({
            priority: match[1].toLowerCase() as SignalPriority,
            type: match[2].toLowerCase() as SignalType,
            content: match[3].trim(),
            source: (match[4] || '').trim(),
            impact: (match[5] || '').trim()
        });
    }

    // Pattern 2: Emoji-prefixed lines: Content after warning/lightbulb emoji
    if (signals.length === 0) {
        // Use unicode ranges for emoji detection instead of literal emojis in regex
        const lines = textToSearch.split('\n');
        for (const line of lines) {
            // Check if line starts with an emoji (warning, lightbulb, or hole)
            if (/^[\u26A0\u{1F4A1}\u{1F573}]/u.test(line) || /^[⚠💡]/.test(line)) {
                const content = line.replace(/^[\u26A0\uFE0F\u{1F4A1}\u{1F573}⚠💡🕳️]+\s*/u, '').trim();
                if (content.length > 5) {
                    // Infer type from content keywords
                    let type: SignalType = 'gap';
                    if (/diverge|disagree|conflict|differ/i.test(line)) type = 'divergence';
                    if (/overclaim|overstat|exagger/i.test(line)) type = 'overclaim';
                    if (/blind|miss|omit/i.test(line)) type = 'blindspot';

                    signals.push({
                        priority: 'enhancement',
                        type,
                        content,
                        source: '',
                        impact: ''
                    });
                }
            }
        }
    }


    // Pattern 3: List items with priority markers
    if (signals.length === 0) {
        const listPattern = /[-*•]\s*(?:\*\*)?(blocker|risk|enhancement)?(?:\*\*)?\s*[:\-]?\s*([^\n]+)/gi;
        while ((match = listPattern.exec(textToSearch)) !== null) {
            const priority = (match[1] || 'enhancement').toLowerCase() as SignalPriority;
            const content = match[2].trim();

            if (content.length > 10) { // Skip very short items
                signals.push({
                    priority,
                    type: 'gap',
                    content,
                    source: '',
                    impact: ''
                });
            }
        }
    }

    return signals;
}

/**
 * Extract unlisted options from freeform text.
 */
function extractUnlistedOptions(text: string): RefinerOutput['unlistedOptions'] {
    const section = extractSection(text, 'Unlisted Options') ||
        extractSection(text, 'Additional Options') ||
        extractSection(text, 'Mapper Audit');

    if (!section) return [];

    const options: RefinerOutput['unlistedOptions'] = [];

    // Pattern: - **Title**: Description (Source)
    const pattern = /[-*•]\s*\*?\*?([^*:\n]+)\*?\*?[:\s]+([^(\n]+)(?:\(([^)]+)\))?/gi;
    let match;
    while ((match = pattern.exec(section)) !== null) {
        options.push({
            title: match[1].trim(),
            description: match[2].trim(),
            source: (match[3] || '').trim()
        });
    }

    return options;
}

/**
 * Extract next step recommendation from freeform text.
 */
function extractNextStep(text: string): RefinerOutput['nextStep'] {
    const section = extractSection(text, 'Next Step') ||
        extractSection(text, 'Recommended Next Step') ||
        extractSection(text, 'Action');

    if (!section) return null;

    // Try to extract structured format
    const actionMatch = section.match(/\*?\*?(proceed|verify|reframe|research)\*?\*?[:\s]+(.+)/i);

    if (actionMatch) {
        const action = actionMatch[1].toLowerCase() as NextStepAction;
        const rest = actionMatch[2].trim();

        // Try to split into target and why
        const whyMatch = rest.match(/(.+?)(?:\s*[—\-]+\s*(?:because|why)[:\s]*(.+))?$/i);

        return {
            action,
            target: whyMatch?.[1]?.trim() || rest,
            why: whyMatch?.[2]?.trim() || ''
        };
    }

    // Fallback: use first sentence as target
    const firstSentence = section.split(/[.!?]\s/)[0];

    // Infer action from keywords
    let action: NextStepAction = 'proceed';
    if (/verify|check|confirm|validate/i.test(section)) action = 'verify';
    if (/reframe|rephrase|reconsider/i.test(section)) action = 'reframe';
    if (/research|investigate|explore|look into/i.test(section)) action = 'research';

    return {
        action,
        target: firstSentence?.trim() || section.slice(0, 100),
        why: ''
    };
}

/**
 * Extract reframe suggestion from freeform text.
 */
function extractReframe(text: string): RefinerOutput['reframe'] {
    const section = extractSection(text, 'Reframe') ||
        extractSection(text, 'Reframing Suggestion') ||
        extractSection(text, 'Better Question');

    if (!section) return null;

    // Check for skip indicators
    if (/omit|n\/a|not\s+(?:needed|required|applicable)|query\s+(?:is\s+)?(?:fine|good|ok)/i.test(section)
        && section.length < 100) {
        return null;
    }

    const issue = extractLabeledValue(section, 'issue') || '';
    const suggestion = extractLabeledValue(section, 'suggestion') ||
        extractLabeledValue(section, 'better question') || '';
    const unlocks = extractLabeledValue(section, 'unlocks') || '';

    if (!suggestion) {
        // Try to get the main content as suggestion
        const mainContent = section.replace(/^\s*\*?\*?issue\*?\*?[:\s]*.*/im, '')
            .replace(/^\s*\*?\*?unlocks\*?\*?[:\s]*.*/im, '')
            .trim();
        if (mainContent) {
            return {
                issue,
                suggestion: mainContent.replace(/^[""]|[""]$/g, ''),
                unlocks
            };
        }
        return null;
    }

    return {
        issue,
        suggestion: suggestion.replace(/^[""]|[""]$/g, ''),
        unlocks
    };
}
