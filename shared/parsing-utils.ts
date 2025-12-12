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

// ============================================================================
// REFINER OUTPUT PARSING
// ============================================================================

export interface RefinerOutput {
    confidenceScore: number;
    rationale: string;
    presentationStrategy: string;
    strategyRationale: string;
    gaps: Array<{ title: string; explanation: string }>;
    honestAssessment: string;
    metaPattern?: string;
    synthesisAccuracy?: {
        preserved: string[];
        overclaimed: string[];
        missed: Record<string, string[]>;
    };
    verificationTriggers?: Array<{
        claim: string;
        why: string;
        sourceType: string;
    }>;
    reframingSuggestion?: {
        issue: string;
        betterQuestion: string;
        unlocks: string;
    };
}

/**
 * Parse Refiner output from markdown text
 */
export function parseRefinerOutput(text: string): RefinerOutput {
    if (!text || typeof text !== 'string') {
        return createEmptyRefinerOutput();
    }

    const normalized = normalizeText(text);

    return {
        confidenceScore: extractConfidenceScore(normalized),
        rationale: extractSection(normalized, 'rationale'),
        presentationStrategy: extractPresentationStrategy(normalized),
        strategyRationale: extractSection(normalized, 'why', 'strategy'),
        gaps: extractGaps(normalized),
        honestAssessment: extractSection(normalized, 'honest assessment'),
        metaPattern: extractSection(normalized, 'meta-pattern') || undefined,
        synthesisAccuracy: extractSynthesisAccuracy(normalized),
        verificationTriggers: extractVerificationTriggers(normalized),
        reframingSuggestion: extractReframingSuggestion(normalized),
    };
}

function createEmptyRefinerOutput(): RefinerOutput {
    return {
        confidenceScore: 0.5,
        rationale: 'No refiner output available',
        presentationStrategy: 'confident_with_caveats',
        strategyRationale: '',
        gaps: [],
        honestAssessment: '',
    };
}

function extractConfidenceScore(text: string): number {
    // Match: **Confidence Score: 0.82** or Confidence Score: [0.82]
    const match = text.match(/confidence\s+score[:\s]*\*?\*?[\[\(]?(\d+\.?\d*)/i);
    if (match && match[1]) {
        const score = parseFloat(match[1]);
        return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
    }
    return 0.5;
}

function extractPresentationStrategy(text: string): string {
    // Match: **Recommended**: confident_with_caveats
    const match = text.match(/recommended[:\s]*\*?\*?\s*([a-z_]+)/i);
    return match?.[1] || 'confident_with_caveats';
}

function extractSection(text: string, sectionName: string, subsection?: string): string {
    // Build regex to find section header and capture content until next header
    const escapedName = sectionName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    // Match: ### Section Name or **Section Name** with optional subsection
    let pattern;
    if (subsection) {
        const escapedSub = subsection.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        pattern = new RegExp(
            `(?:^|\\n)[#*\\s]*${escapedName}[#*\\s]*\\n?[\\s\\S]*?${escapedSub}[:\\s]*([^\\n]+)`,
            'i'
        );
    } else {
        pattern = new RegExp(
            `(?:^|\\n)[#*\\s]*${escapedName}[#*\\s]*:?\\s*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s|\\n\\*\\*[A-Z]|$)`,
            'i'
        );
    }

    const match = text.match(pattern);
    return match?.[1]?.trim() || '';
}

function extractGaps(text: string): Array<{ title: string; explanation: string }> {
    const gaps: Array<{ title: string; explanation: string }> = [];

    // Find Gap Detection section
    const gapSection = text.match(/gap\s+detection[:\s]*([\s\S]*?)(?=\n#{1,3}|\n\*\*[A-Z]|$)/i);
    if (!gapSection) return gaps;

    const content = gapSection[1];

    // Match: **Gap 1: Title** — explanation or Gap 1: **Title** — explanation
    const gapPattern = /gap\s+\d+[:\s]*\*?\*?([^*—\n]+)\*?\*?\s*[—-]\s*([^\n]+)/gi;

    let match;
    while ((match = gapPattern.exec(content)) !== null) {
        gaps.push({
            title: match[1].trim(),
            explanation: match[2].trim(),
        });
    }

    return gaps;
}

function parseBulletPoints(text: string): string[] {
    if (!text) return [];
    return text
        .split(/\n/)
        .map(line => line.trim())
        .filter(line => line.match(/^[-*•]\s+/))
        .map(line => line.replace(/^[-*•]\s+/, '').trim())
        .filter(line => line.length > 0);
}

function parseMissedEvents(text: string): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    if (!text) return result;

    const lines = parseBulletPoints(text);
    for (const line of lines) {
        // Try to match provider pattern: **Provider**: Content or Provider: Content
        // Match start of line
        const match = line.match(/^\*\*?([a-zA-Z0-9_\-\.\s]+)\*\*?:?\s*(.+)$/);
        if (match) {
            const providerName = match[1].trim().toLowerCase(); // Normalize for matching?
            // Ideally we keep original case or map to ID. 
            // Since we don't have the config here, we use the extracted string as key.
            // UI will need to fuzzy match or prompt should use exact IDs.
            const content = match[2].trim();
            if (!result[providerName]) result[providerName] = [];
            result[providerName].push(content);
        } else {
            // Fallback for unassigned points -> 'unknown' or 'global'
            if (!result['global']) result['global'] = [];
            result['global'].push(line);
        }
    }
    return result;
}

function extractSynthesisAccuracy(text: string): RefinerOutput['synthesisAccuracy'] {
    const section = text.match(/synthesis\s+accuracy[:\s]*([\s\S]*?)(?=\n#{1,3}|\n\*\*[A-Z]|$)/i);
    if (!section) return undefined;

    const content = section[1];

    const preservedBlock = content.match(/preserved[:\s]*([^\n]*(?:\n(?!overclaimed|missed)[^\n]*)*)/i);
    const overclaimedBlock = content.match(/overclaimed[:\s]*([^\n]*(?:\n(?!preserved|missed)[^\n]*)*)/i);
    const missedBlock = content.match(/missed[:\s]*([^\n]*(?:\n(?!preserved|overclaimed)[^\n]*)*)/i);

    if (!preservedBlock && !overclaimedBlock && !missedBlock) return undefined;

    return {
        preserved: preservedBlock ? parseBulletPoints(preservedBlock[1]) : [],
        overclaimed: overclaimedBlock ? parseBulletPoints(overclaimedBlock[1]) : [],
        missed: missedBlock ? parseMissedEvents(missedBlock[1]) : {},
    };
}

function extractVerificationTriggers(text: string): RefinerOutput['verificationTriggers'] {
    const section = text.match(/verification\s+triggers[:\s]*([\s\S]*?)(?=\n#{1,3}|\n\*\*[A-Z]|$)/i);
    if (!section) return undefined;

    const content = section[1];

    // Check for "None required" or similar
    if (/none\s+(?:required|needed)/i.test(content)) return undefined;

    const triggers: Array<{ claim: string; why: string; sourceType: string }> = [];

    // Match trigger blocks (claim/why/source can be in any order)
    const blocks = content.split(/\n\s*\n/);

    for (const block of blocks) {
        const claim = block.match(/claim[:\s]*[""]?([^""]+)[""]?/i);
        const why = block.match(/why[:\s]*([^\n]+)/i);
        const sourceType = block.match(/source(?:\s+type)?[:\s]*([^\n]+)/i);

        if (claim || why || sourceType) {
            triggers.push({
                claim: claim?.[1]?.trim() || '',
                why: why?.[1]?.trim() || '',
                sourceType: sourceType?.[1]?.trim() || '',
            });
        }
    }

    return triggers.length > 0 ? triggers : undefined;
}

function extractReframingSuggestion(text: string): RefinerOutput['reframingSuggestion'] {
    const section = text.match(/reframing\s+suggestion[:\s]*([\s\S]*?)(?=\n#{1,3}|\n\*\*[A-Z]|$)/i);
    if (!section) return undefined;

    const content = section[1];

    // Check for "Only if query is flawed" or similar skip indicators
    if (/only\s+if|not\s+needed/i.test(content) && content.length < 100) return undefined;

    const issue = content.match(/issue[:\s]*([^\n]+)/i);
    const betterQuestion = content.match(/better\s+question[:\s]*[""]?([^""]+)[""]?/i);
    const unlocks = content.match(/unlocks[:\s]*([^\n]+)/i);

    if (!issue && !betterQuestion && !unlocks) return undefined;

    return {
        issue: issue?.[1]?.trim() || '',
        betterQuestion: betterQuestion?.[1]?.trim() || '',
        unlocks: unlocks?.[1]?.trim() || '',
    };
}
