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

export interface RefinerOutput {
    confidenceScore: number;
    rationale: string;
    presentationStrategy: string;
    strategyRationale: string;

    verificationTriggers?: {
        required: boolean;
        reason?: string;
        items: Array<{ claim: string; why: string; sourceType: string }>;
    };

    reframingSuggestion?: {
        issue: string;
        betterQuestion: string;
        unlocks: string;
    };

    synthesisAccuracy?: {
        preserved: string[];
        overclaimed: string[];
        // Updated to structured format while maintaining backward compat where possible
        missed: Array<{ insight: string; source: string; inMapperOptions: boolean }>;
    };

    gaps: Array<{
        title: string;
        explanation: string;
        category?: 'foundational' | 'tactical';
    }>;

    metaPattern?: string;

    honestAssessment: {
        reliabilitySummary: string;
        biggestRisk: string;
        recommendedNextStep: string;
    } | string;

    mapperAudit?: {
        complete: boolean;
        unlistedOptions: Array<{ title: string; description: string; source: string }>;
    };

    // rawText is essential for UI display
    rawText?: string;
}

/**
 * Parse Refiner output from markdown text
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
        confidenceScore: extractConfidenceScore(normalized),
        rationale: extractRationale(normalized),
        presentationStrategy: extractPresentationStrategy(normalized),
        strategyRationale: extractStrategyRationale(normalized),
        verificationTriggers: extractVerificationTriggers(normalized),
        reframingSuggestion: extractReframingSuggestion(normalized),
        synthesisAccuracy: extractSynthesisAccuracy(normalized),
        gaps: extractGaps(normalized),
        metaPattern: extractMetaPattern(normalized),
        honestAssessment: extractHonestAssessment(normalized),
        mapperAudit: extractMapperAudit(normalized),
        rawText: text,
    };
}

function createEmptyRefinerOutput(rawText: string = ''): RefinerOutput {
    return {
        confidenceScore: 0.5,
        rationale: 'No refiner output available',
        presentationStrategy: 'confident_with_caveats',
        strategyRationale: '',
        gaps: [],
        honestAssessment: '',
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
    // Validate it looks like a refiner output
    if (!('confidenceScore' in parsed) && !('honestAssessment' in parsed) && !('presentationStrategy' in parsed)) {
        return null;
    }

    // Normalize synthesisAccuracy.missed from array to structured format
    let synthesisAccuracy = parsed.synthesisAccuracy;
    if (synthesisAccuracy?.missed) {
        if (Array.isArray(synthesisAccuracy.missed)) {
            // Check if it's already structured or string
            synthesisAccuracy = {
                ...synthesisAccuracy,
                missed: synthesisAccuracy.missed.map((item: any) => {
                    if (typeof item === 'string') {
                        return { insight: item, source: 'unknown', inMapperOptions: false };
                    }
                    return item;
                })
            };
        }
    }

    // Normalize honestAssessment
    let honestAssessment: RefinerOutput['honestAssessment'] = '';
    if (parsed.honestAssessment) {
        if (typeof parsed.honestAssessment === 'string') {
            honestAssessment = parsed.honestAssessment;
        } else if (typeof parsed.honestAssessment === 'object') {
            honestAssessment = {
                reliabilitySummary: String(parsed.honestAssessment.reliabilitySummary || ''),
                biggestRisk: String(parsed.honestAssessment.biggestRisk || ''),
                recommendedNextStep: String(parsed.honestAssessment.recommendedNextStep || '')
            };
        }
    }

    // Normalize verificationTriggers
    let verificationTriggers = parsed.verificationTriggers;
    if (Array.isArray(verificationTriggers)) {
        verificationTriggers = {
            required: verificationTriggers.length > 0,
            items: verificationTriggers
        };
    }

    return {
        confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0.5,
        rationale: parsed.rationale || '',
        presentationStrategy: parsed.presentationStrategy || 'confident_with_caveats',
        strategyRationale: parsed.strategyRationale || '',
        gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
        honestAssessment,
        metaPattern: parsed.metaPattern,
        synthesisAccuracy,
        verificationTriggers,
        reframingSuggestion: parsed.reframingSuggestion,
        mapperAudit: parsed.mapperAudit
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

function extractVerificationTriggers(text: string): RefinerOutput['verificationTriggers'] {
    const section = extractSection(text, 'Verification Triggers');
    if (!section) return undefined;

    // Check for "none required" case
    if (/none\s+(?:required|needed)|not\s+required|no\s+verification/i.test(section)) {
        return {
            required: false,
            reason: section.replace(/\*\*/g, '').trim(),
            items: [],
        };
    }

    const items: Array<{ claim: string; why: string; sourceType: string }> = [];

    // Split by double newline OR by **Claim** headers
    const blocks = section.split(/\n\s*\n+|(?=\*\*Claim\*\*)/i).filter(b => b.trim());

    for (const block of blocks) {
        // Extract claim - handle quoted and unquoted
        let claim = extractLabeledValue(block, 'claim') || '';
        claim = claim.replace(/^[""]|[""]$/g, ''); // Strip quotes

        const why = extractLabeledValue(block, 'why') || '';
        const sourceType = extractLabeledValue(block, 'source(?:\\s+type)?') || '';

        if (claim || why) {
            items.push({ claim, why, sourceType });
        }
    }

    return {
        required: items.length > 0,
        items,
    };
}

function extractReframingSuggestion(text: string): RefinerOutput['reframingSuggestion'] {
    const section = extractSection(text, 'Reframing Suggestion');
    if (!section) return undefined;

    // Check for skip indicators
    if (/omit|n\/a|not\s+(?:needed|required|applicable)|query\s+(?:is\s+)?(?:fine|good|ok)/i.test(section)
        && section.length < 100) {
        return undefined;
    }

    const issue = extractLabeledValue(section, 'issue');
    const betterQuestion = extractLabeledValue(section, 'better question');
    const unlocks = extractLabeledValue(section, 'unlocks');

    if (!betterQuestion) return undefined;

    return {
        issue: issue || '',
        betterQuestion: betterQuestion.replace(/^[""]|[""]$/g, ''),
        unlocks: unlocks || '',
    };
}

function extractSynthesisAccuracy(text: string): RefinerOutput['synthesisAccuracy'] {
    const section = extractSection(text, 'Synthesis Accuracy');
    if (!section) return undefined;

    // Helper to get subsection content
    function getSubsectionContent(label: string): string {
        // Try **Label**: content (until next **Label** or end)
        const pattern = new RegExp(
            `\\*\\*${label}\\*\\*[:\\s]*([\\s\\S]*?)(?=\\*\\*(?:Preserved|Overclaimed|Missed)|$)`,
            'i'
        );
        const match = section.match(pattern);
        return match?.[1]?.trim() || '';
    }

    const preservedRaw = getSubsectionContent('Preserved');
    const overclaimedRaw = getSubsectionContent('Overclaimed');
    // Handle both "Missed" and "Missed from synthesis"
    const missedRaw = getSubsectionContent('Missed(?:\\s+from\\s+synthesis)?');

    // Parse preserved/overclaimed - can be paragraph or list
    const preserved = parseListOrParagraph(preservedRaw);
    const overclaimed = parseListOrParagraph(overclaimedRaw);

    // Parse missed - extract source attribution
    const missed: Array<{ insight: string; source: string; inMapperOptions: boolean }> = [];
    const missedItems = parseList(missedRaw);

    for (const item of missedItems) {
        // Format 1: **Model's** point about X
        const modelPossessive = item.match(/^\*?\*?([A-Za-z]+(?:\s+[A-Za-z]+)?)'s\*?\*?\s+(.+)$/i);
        if (modelPossessive) {
            missed.push({
                insight: modelPossessive[2].trim(),
                source: modelPossessive[1].trim(),
                inMapperOptions: false,
            });
            continue;
        }

        // Format 2: **Title** (Model N, in/not in options): Description
        const structured = item.match(/^\*?\*?([^*()]+)\*?\*?\s*\(([^)]+)\)[:\s]*(.+)$/);
        if (structured) {
            const sourceInfo = structured[2];
            const inMapperOptions = /in\s+(?:mapper\s+)?options/i.test(sourceInfo) &&
                !/not\s+in/i.test(sourceInfo);
            missed.push({
                insight: structured[1].trim() + ': ' + structured[3].trim(),
                source: sourceInfo.replace(/,?\s*(not\s+)?in\s+(?:mapper\s+)?options/i, '').trim(),
                inMapperOptions,
            });
            continue;
        }

        // Fallback: plain text
        missed.push({
            insight: item.replace(/^\*\*|\*\*$/g, '').trim(),
            source: 'unknown',
            inMapperOptions: false,
        });
    }

    if (!preserved.length && !overclaimed.length && !missed.length) {
        return undefined;
    }

    return { preserved, overclaimed, missed };
}

function extractGaps(text: string): RefinerOutput['gaps'] {
    const section = extractSection(text, 'Gap Detection');
    if (!section) return [];

    // Check for "no gaps" case
    if (/unusually\s+complete|no\s+gaps?\s+(?:found|identified|detected)/i.test(section)) {
        return [];
    }

    const gaps: Array<{ title: string; explanation: string; category?: 'foundational' | 'tactical' }> = [];

    // Format 1: **Gap N [category]: Title**\nExplanation (multi-line with category)
    const multiLineWithCategory = /\*\*gap\s+\d+\s*\[(foundational|tactical)\][:\s]*([^*\n]+)\*\*\s*\n+([^\n*]+(?:\n(?!\*\*gap|\n\n|---|##)[^\n*]*)*)/gi;

    let match;
    while ((match = multiLineWithCategory.exec(section)) !== null) {
        gaps.push({
            category: match[1].toLowerCase() as 'foundational' | 'tactical',
            title: match[2].trim(),
            explanation: match[3].trim().replace(/\s+/g, ' '),
        });
    }

    // Format 2: **Gap N: Title** — Explanation (no category, with em-dash separator)
    if (gaps.length === 0) {
        const withEmDash = /\*\*gap\s+\d+[:\s]*([^*—\-]+)\*\*\s*[—\-]+\s*([^\n]+(?:\n(?!\*\*gap|\n\n|---|##)[^\n]*)*)/gi;
        while ((match = withEmDash.exec(section)) !== null) {
            gaps.push({
                title: match[1].trim(),
                explanation: match[2].trim().replace(/\s+/g, ' '),
            });
        }
    }

    // Format 3: **Gap N [category]: Title** — Explanation (single line with category)
    if (gaps.length === 0) {
        const singleLineWithCat = /\*\*?gap\s+\d+\s*\[(foundational|tactical)\][:\s]*([^*—\-\n]+)\*?\*?\s*[—\-]+\s*([^\n]+)/gi;
        while ((match = singleLineWithCat.exec(section)) !== null) {
            gaps.push({
                category: match[1].toLowerCase() as 'foundational' | 'tactical',
                title: match[2].trim(),
                explanation: match[3].trim(),
            });
        }
    }

    // Format 4: **Gap N: Title**\nExplanation (multi-line, no category, no em-dash)
    if (gaps.length === 0) {
        const multiLineNoCat = /\*\*gap\s+\d+[:\s]*([^*\n]+)\*\*\s*\n+([^\n*]+(?:\n(?!\*\*gap|\n\n|---|##)[^\n*]*)*)/gi;
        while ((match = multiLineNoCat.exec(section)) !== null) {
            gaps.push({
                title: match[1].trim(),
                explanation: match[2].trim().replace(/\s+/g, ' '),
            });
        }
    }

    // Format 5: Numbered list without "Gap" prefix
    if (gaps.length === 0) {
        const numberedList = /\d+[.)]\s*\*?\*?\[?(foundational|tactical)?\]?\s*([^:*\n—\-]+)[:\s]*[—\-]?\s*([^\n]+)/gi;
        while ((match = numberedList.exec(section)) !== null) {
            gaps.push({
                category: match[1]?.toLowerCase() as 'foundational' | 'tactical' | undefined,
                title: match[2].trim(),
                explanation: match[3].trim(),
            });
        }
    }

    return gaps;
}

function extractMetaPattern(text: string): string | undefined {
    return extractSection(text, 'Meta-Pattern') ||
        extractSection(text, 'Meta Pattern') ||
        undefined;
}

function extractHonestAssessment(text: string): RefinerOutput['honestAssessment'] {
    const section = extractSection(text, 'Honest Assessment');
    if (!section) return '';

    // Try to extract structured fields
    // Handle multiple label variations
    const biggestRisk = extractLabeledValue(section, 'biggest risk');

    // "What I'd do next" is alternate for "Recommended next step"
    const nextStep = extractLabeledValue(section, 'recommended next step') ||
        extractLabeledValue(section, "what I'd do next") ||
        extractLabeledValue(section, "what i'd do next") ||
        extractLabeledValue(section, 'next step');

    // Reliability summary might be labeled or might be opening paragraph
    let reliabilitySummary = extractLabeledValue(section, 'reliability summary');

    if (!reliabilitySummary) {
        // Try to get opening text before first **Label**:
        const openingMatch = section.match(/^([^*]+?)(?=\*\*|$)/s);
        if (openingMatch?.[1]?.trim() && openingMatch[1].trim().length > 20) {
            reliabilitySummary = openingMatch[1].trim();
        }
    }

    // If we got at least one structured field, return object
    if (reliabilitySummary || biggestRisk || nextStep) {
        return {
            reliabilitySummary: reliabilitySummary || '',
            biggestRisk: biggestRisk || '',
            recommendedNextStep: nextStep || '',
        };
    }

    // Fallback: return entire section as string
    return section;
}

function extractMapperAudit(text: string): RefinerOutput['mapperAudit'] {
    const section = extractSection(text, 'Mapper Audit');
    if (!section) return undefined;

    // Check for "complete" indicators
    const isComplete = /\*\*complete\*\*|complete[—\-:]\s*(?:no|all)|all\s+(?:approaches|options)\s+(?:are\s+)?represented/i.test(section);

    const unlistedOptions: Array<{ title: string; description: string; source: string }> = [];

    if (!isComplete) {
        const patterns = [
            // **Unlisted option**: Title — Description — Source: Provider
            /\*\*unlisted\s+option\*\*[:\s]*([^—\-\n]+)[—\-]+\s*([^—\-\n]+)[—\-]+\s*source[:\s]*([^\n]+)/gi,
            // - Title (Source): Description
            /[-*•]\s*\*?\*?([^*:(]+)\*?\*?\s*\(([^)]+)\)[:\s]*([^\n]+)/gi,
            // + "Title" — Description — Source
            /[+]\s*[""]([^""]+)[""]\s*[—\-]+\s*([^—\-\n]+)[—\-]+\s*([^\n]+)/gi,
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(section)) !== null) {
                unlistedOptions.push({
                    title: match[1].trim(),
                    description: match[2].trim(),
                    source: match[3].replace(/^source[:\s]*/i, '').trim(),
                });
            }
            if (unlistedOptions.length > 0) break;
        }
    }

    return {
        complete: isComplete && unlistedOptions.length === 0,
        unlistedOptions,
    };
}
