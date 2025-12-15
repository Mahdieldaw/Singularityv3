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

    // Updated: now includes inMapperOptions flag
    synthesisAccuracy?: {
        preserved: string[];
        overclaimed: string[];
        missed: Record<string, string[]>; // Legacy format
        missedFromSynthesis?: Array<{
            insight: string;
            provider: string;
            inMapperOptions: boolean;
        }>;
    };

    // Updated: now includes category
    gaps: Array<{
        title: string;
        explanation: string;
        category?: 'foundational' | 'tactical';
    }>;

    metaPattern?: string;

    // Updated: now structured (string for backward compat)
    honestAssessment: string | {
        reliabilitySummary: string;
        biggestRisk: string;
        recommendedNextStep: string;
    };

    // NEW: mapper audit field
    mapperAudit?: {
        complete: boolean;
        unlistedOptions: Array<{
            title: string;
            description: string;
            sourceProvider: string;
        }>;
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

    // 1. Try JSON parsing first (for robustness)
    const jsonResult = tryParseJsonRefinerOutput(normalized);
    if (jsonResult) {
        return jsonResult;
    }

    // 2. Fallback to Regex extraction
    return {
        confidenceScore: extractConfidenceScore(normalized),
        rationale: extractSection(normalized, 'rationale'),
        presentationStrategy: extractPresentationStrategy(normalized),
        strategyRationale: extractSection(normalized, 'presentation strategy', 'why'),
        gaps: extractGaps(normalized),
        honestAssessment: extractHonestAssessmentStructured(normalized),
        metaPattern: extractSection(normalized, 'meta-pattern') || undefined,
        synthesisAccuracy: extractSynthesisAccuracy(normalized),
        verificationTriggers: extractVerificationTriggers(normalized),
        reframingSuggestion: extractReframingSuggestion(normalized),
        mapperAudit: extractMapperAudit(normalized),
    };
}


function tryParseJsonRefinerOutput(text: string): RefinerOutput | null {
    try {
        let jsonText = text.trim();

        // Handle code blocks
        const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (codeBlockMatch) {
            jsonText = codeBlockMatch[1].trim();
        }

        // Handle stringified JSON (starts and ends with quote)
        if (jsonText.startsWith('"') && jsonText.endsWith('"')) {
            try {
                // First parse to unescape the string
                const unquoted = JSON.parse(jsonText);
                if (typeof unquoted === 'string') {
                    jsonText = unquoted.trim();
                } else if (typeof unquoted === 'object') {
                    // It was just a quoted JSON object? Rare but possible
                    return normalizeRefinerObject(unquoted);
                }
            } catch {
                // If failed, assume it wasn't a valid stringified JSON, continue
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
    } catch (e) {
        // Silent failure for JSON parsing, fallback to regex
    }
    return null;
}

function normalizeRefinerObject(parsed: any): RefinerOutput | null {
    if (!('confidenceScore' in parsed) && !('honestAssessment' in parsed) && !('presentationStrategy' in parsed)) {
        return null;
    }

    // Normalize synthesisAccuracy.missed
    let synthesisAccuracy = parsed.synthesisAccuracy;
    if (synthesisAccuracy && synthesisAccuracy.missed) {
        if (Array.isArray(synthesisAccuracy.missed)) {
            synthesisAccuracy = {
                ...synthesisAccuracy,
                missed: {
                    "global": synthesisAccuracy.missed.map(String)
                }
            };
        }
    }

    // Normalize honestAssessment - ensure it's string or proper object
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

    return {
        confidenceScore: typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : 0.5,
        rationale: parsed.rationale || '',
        presentationStrategy: parsed.presentationStrategy || 'confident_with_caveats',
        strategyRationale: parsed.strategyRationale || '',
        gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
        honestAssessment,
        metaPattern: parsed.metaPattern,
        synthesisAccuracy: synthesisAccuracy,
        verificationTriggers: parsed.verificationTriggers,
        reframingSuggestion: parsed.reframingSuggestion,
        mapperAudit: parsed.mapperAudit  // ← Also add this missing field
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
    const escapedName = sectionName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    if (subsection) {
        const escapedSub = subsection.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const parentHeader = new RegExp(`(?:^|\\n)#{1,3}\\s*${escapedName}[^\\n]*\\n([\\s\\S]*?)(?=\\n#{1,3}|$)`, 'i');
        const parentMatch = text.match(parentHeader);
        const scope = parentMatch?.[1] || text;
        const labelInline = new RegExp(`\\*{0,2}\\s*${escapedSub}\\s*\\*{0,2}\\s*:?\\s*([\\s\\S]*?)(?=\\n\\*\\*|\\n#{1,3}|\\n---|$)`, 'i');
        const inlineMatch = scope.match(labelInline);
        return inlineMatch?.[1]?.trim() || '';
    }

    const inline = new RegExp(`\\*{0,2}\\s*${escapedName}\\s*\\*{0,2}\\s*:?\\s*([\\s\\S]*?)(?=\\n\\*\\*|\\n#{1,3}|\\n---|$)`, 'i');
    const inlineMatch = text.match(inline);
    if (inlineMatch && inlineMatch[1]) return inlineMatch[1].trim();

    const header = new RegExp(`(?:^|\\n)#{1,3}\\s*${escapedName}[^\\n]*\\n([\\s\\S]*?)(?=\\n#{1,3}|\\n\\*\\*[A-Z]|\\n---|$)`, 'i');
    const headerMatch = text.match(header);
    return headerMatch?.[1]?.trim() || '';
}

function extractGaps(text: string): Array<{ title: string; explanation: string; category?: 'foundational' | 'tactical' }> {
    const gaps: Array<{ title: string; explanation: string; category?: 'foundational' | 'tactical' }> = [];

    // Find Gap Detection section
    const gapSection = text.match(/gap\s+detection[:\s]*([\s\S]*?)(?=\n#{1,3}|\n\*\*[A-Z]|$)/i);
    if (!gapSection) return gaps;

    const content = gapSection[1];

    // Check for "Unusually complete" case
    if (/unusually complete/i.test(content)) {
        return gaps;
    }

    // Match: **Gap N [foundational/tactical]**: Title — explanation
    // or legacy: **Gap 1: Title** — explanation
    const gapPatternWithCategory = /gap\s+\d+\s*\[(foundational|tactical)\][:\s]*\*?\*?([^*—\n]+)\*?\*?\s*[—-]\s*([^\n]+)/gi;
    const gapPatternLegacy = /gap\s+\d+[:\s]*\*?\*?([^*—\n\[]+)\*?\*?\s*[—-]\s*([^\n]+)/gi;

    let match;
    // Try new format first
    while ((match = gapPatternWithCategory.exec(content)) !== null) {
        gaps.push({
            category: match[1].toLowerCase() as 'foundational' | 'tactical',
            title: match[2].trim(),
            explanation: match[3].trim(),
        });
    }

    // If no matches with category, try legacy format
    if (gaps.length === 0) {
        while ((match = gapPatternLegacy.exec(content)) !== null) {
            gaps.push({
                title: match[1].trim(),
                explanation: match[2].trim(),
            });
        }
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

// Fallback parser: when bullets are not present, treat each non-empty line as an item
function parseListFlexible(text: string): string[] {
    const bullets = parseBulletPoints(text);
    if (bullets.length > 0) return bullets;

    const raw = String(text || '').trim();
    const lines = raw
        .split(/\n/)
        .map(l => l.trim())
        .filter(l => l.length > 0);

    if (lines.length > 1) return lines;
    if (!raw) return [];

    const bySeparators = raw
        .split(/\s*[;|•·]+\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

    if (bySeparators.length > 1) return bySeparators;

    return [raw];
}

function parseMissedEvents(text: string): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    if (!text) return result;

    const rawItems = parseListFlexible(text);
    for (const raw of rawItems) {
        const segments = raw
            .split(/\s*;\s*|\s*\|\s*/)
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const seg of segments) {
            const line = seg.trim();
            if (!line) continue;

            let match = line.match(/^\*\*?([a-zA-Z0-9_\-\.\s]+)\*\*?:?\s*(.+)$/);
            if (!match) match = line.match(/^([a-zA-Z0-9_\-\.]+)'s\s+(.+)$/);

            if (match) {
                const providerRaw = match[1].trim();
                const content = match[2].trim();
                const providerKey = providerRaw.toLowerCase();
                if (!result[providerKey]) result[providerKey] = [];
                if (!result[providerKey].includes(content)) result[providerKey].push(content);
            } else {
                if (!result['global']) result['global'] = [];
                if (!result['global'].includes(line)) result['global'].push(line);
            }
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
        preserved: preservedBlock ? parseListFlexible(preservedBlock[1]) : [],
        overclaimed: overclaimedBlock ? parseListFlexible(overclaimedBlock[1]) : [],
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

function extractMapperAudit(text: string): RefinerOutput['mapperAudit'] {
    const section = text.match(/mapper\s+audit[:\s]*([\s\S]*?)(?=\n#{1,3}|\n\*\*[A-Z]|$)/i);

    if (!section) return undefined;

    const content = section[1];

    // Check for "Complete—no unlisted options" case
    if (/complete.*no unlisted/i.test(content)) {
        return {
            complete: true,
            unlistedOptions: []
        };
    }

    // Parse unlisted options
    // Pattern: **Unlisted option**: [Title] — [description] — Source: [Provider]
    const optionPattern = /\*\*unlisted\s+option\*\*[:\s]*([^—\n]+)\s*—\s*([^—\n]+)\s*—\s*source[:\s]*([^\n]+)/gi;
    const unlistedOptions: Array<{ title: string; description: string; sourceProvider: string }> = [];

    let match;
    while ((match = optionPattern.exec(content)) !== null) {
        unlistedOptions.push({
            title: match[1].trim(),
            description: match[2].trim(),
            sourceProvider: match[3].trim()
        });
    }

    return {
        complete: unlistedOptions.length === 0,
        unlistedOptions
    };
}

function extractHonestAssessmentStructured(text: string): RefinerOutput['honestAssessment'] {
    const section = text.match(/honest\s+assessment[:\s]*([\s\S]*?)(?=\n#{1,3}|\n\*\*[A-Z]|$)/i);
    if (!section) return '';

    const content = section[1];

    // Try to extract structured format
    const reliabilitySummary = content.match(/\*\*reliability\s+summary\*\*[:\s]*([^\n]+)/i);
    const biggestRisk = content.match(/\*\*biggest\s+risk\*\*[:\s]*([^\n]+)/i);
    const recommendedNextStep = content.match(/\*\*recommended\s+next\s+step\*\*[:\s]*([^\n]+)/i);

    // If we found structured format, return object
    if (reliabilitySummary || biggestRisk || recommendedNextStep) {
        return {
            reliabilitySummary: reliabilitySummary?.[1]?.trim() || '',
            biggestRisk: biggestRisk?.[1]?.trim() || '',
            recommendedNextStep: recommendedNextStep?.[1]?.trim() || ''
        };
    }

    // Otherwise return as string for backward compat
    return content.trim();
}
