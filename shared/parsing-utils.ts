import { MapperArtifact, ExploreOutput, GauntletOutput, UnderstandOutput } from './contract';

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
    const match = normalized.match(GRAPH_TOPOLOGY_PATTERN);

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

    // Standard delimiter with === or --- or unicode equivalent wrapper
    { re: /\n?[=\-─━═＝]{2,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*[=\-─━═＝]{2,}\n?/i, minPosition: 0 },
    { re: /\n?[=\-─━═＝]{2,}\s*ALL[_\s]*OPTIONS\s*[=\-─━═＝]{2,}\n?/i, minPosition: 0 },

    // Markdown wrapped variants or multi-char blocks
    { re: /\n\*\*\s*[=\-─━═＝]{2,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*[=\-─━═＝]{2,}\s*\*\*\n?/i, minPosition: 0 },
    { re: /\n\*{0,2}[=\-─━═＝]{3,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*[=\-─━═＝]{3,}\*{0,2}\n/i, minPosition: 0 },
    { re: /\n###\s*[=\-─━═＝]{2,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*[=\-─━═＝]{2,}\n?/i, minPosition: 0 },

    // Heading styles
    { re: /\n\*\*\s*All\s+Available\s+Options:?\s*\*\*\n/i, minPosition: 0.25 },
    { re: /\n##\s+All\s+Available\s+Options:?\n/i, minPosition: 0.25 },
    { re: /\n###\s+All\s+Available\s+Options:?\n/i, minPosition: 0.25 },

    // Looser patterns
    { re: /\nAll\s+Available\s+Options:\n/i, minPosition: 0.3 },
    { re: /\n\*\*\s*Options:?\s*\*\*\n/i, minPosition: 0.3 },
    { re: /\n##\s+Options:?\n/i, minPosition: 0.3 },
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
    const hasListStructure = /^\s*[-*•]\s+|\n\s*[-*•]\s+|^\s*\d+\.\s+|\n\s*\d+\.\s+|^\s*\*\*[^*]+\*\*|^\s*Theme\s*:|^\s*###?\s+|^\s*[A-Z][^:\n]{2,}:|[🌀🗿😀🙏🚀🛩]/i.test(listPreview);
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
    optionTitles: string[];
    graphTopology: any | null;
} {
    if (!response) return { narrative: '', options: null, optionTitles: [], graphTopology: null };

    // First extract graph topology
    const { text: textWithoutTopology, topology } = extractGraphTopologyAndStrip(response);

    // Then extract options from remaining text
    const { text: narrative, options } = extractOptionsAndStrip(textWithoutTopology);

    // Extract option titles if options were found
    const optionTitles = options ? parseOptionTitles(options) : [];

    return {
        narrative: cleanNarrativeText(narrative),
        options: options ? cleanOptionsText(options) : null,
        optionTitles,
        graphTopology: topology,
    };
}

/**
 * Extract bold titles from options text
 */
export function parseOptionTitles(optionsText: string): string[] {
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

// ============================================================================
// REFINER OUTPUT PARSING (NEW STRUCTURE)
// ============================================================================

export type LeapAction = "proceed" | "verify" | "reframe" | "research";

export type SignalPriority = "blocker" | "risk" | "enhancement";

export type NextStepAction = LeapAction;

export interface Gem {
    insight: string;
    source: string;
    impact: string;
    action?: string;
}

export interface Signal {
    type: string;
    content: string;
    source?: string;
    priority: SignalPriority;
    impact?: string;
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
    action: string;
    rationale: string;
}

export interface RefinerOutput {
    synthesisPlus: string | null;
    gem: Gem | null;
    outlier: Outlier | null;
    attributions: Attribution[];
    leap: Leap;
    signals?: Signal[];
    unlistedOptions?: Array<{ title: string; description: string; source?: string }>;
    reframe?: { issue?: string; suggestion: string; unlocks?: string } | null;
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
        leap: { action: '', rationale: '' },
        signals: [],
        unlistedOptions: [],
        reframe: null,
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
    const hasLegacyShape = 'synthesisPlus' in parsed || 'gem' in parsed || 'leap' in parsed;
    const hasSignalShape = 'final_word' in parsed || 'the_one' in parsed || 'the_step' in parsed || 'the_echo' in parsed;

    if (!hasLegacyShape && !hasSignalShape) {
        return null;
    }

    const rawFinalWord = parsed.synthesisPlus ?? parsed.final_word ?? null;
    const synthesisPlus = rawFinalWord != null ? String(rawFinalWord) : null;

    const gemSource = parsed.gem || parsed.the_one || null;
    let gem: Gem | null = null;
    if (gemSource && typeof gemSource === 'object') {
        gem = {
            insight: String(gemSource.insight || ''),
            source: String(gemSource.source || ''),
            impact: String(gemSource.impact || ''),
            action: gemSource.action ? String(gemSource.action) : undefined,
        };
    }

    const outlierSource = parsed.outlier || parsed.the_echo || null;
    let outlier: Outlier | null = null;
    if (outlierSource && typeof outlierSource === 'object') {
        outlier = {
            position: String(outlierSource.position || ''),
            source: String(outlierSource.source || ''),
            why: String(outlierSource.why || ''),
        };
    }

    const attributions: Attribution[] = Array.isArray(parsed.attributions)
        ? parsed.attributions.map((a: any) => ({
            claim: String(a.claim || ''),
            source: String(a.source || ''),
        }))
        : [];

    const stepSource = parsed.the_step || parsed.leap || {};
    const action = stepSource.action || stepSource.answer || "";
    const rationale = stepSource.rationale || stepSource.why || stepSource.justification || "";

    const leap: Leap = {
        action: String(action),
        rationale: String(rationale),
    };

    const signals: Signal[] = Array.isArray(parsed.signals)
        ? parsed.signals.map((s: any) => ({
            type: String(s.type || ''),
            content: String(s.content || ''),
            source: s.source ? String(s.source) : undefined,
            priority: (s.priority as SignalPriority) || 'enhancement',
            impact: s.impact ? String(s.impact) : undefined,
        }))
        : [];

    const unlistedOptions: Array<{ title: string; description: string; source?: string }> = Array.isArray(parsed.unlistedOptions)
        ? parsed.unlistedOptions.map((opt: any) => ({
            title: String(opt.title || ''),
            description: String(opt.description || ''),
            source: opt.source ? String(opt.source) : undefined,
        }))
        : [];

    const reframe = parsed.reframe && typeof parsed.reframe === 'object'
        ? {
            issue: parsed.reframe.issue ? String(parsed.reframe.issue) : undefined,
            suggestion: String(parsed.reframe.suggestion || ''),
            unlocks: parsed.reframe.unlocks ? String(parsed.reframe.unlocks) : undefined,
        }
        : null;

    return {
        synthesisPlus,
        gem,
        outlier,
        attributions,
        leap,
        signals,
        unlistedOptions,
        reframe,
    };
}


// ============================================================================
// MAPPER ARTIFACT PARSING
// ============================================================================

/**
 * Create empty MapperArtifact
 */
export function createEmptyMapperArtifact(): MapperArtifact {
    return {
        consensus: {
            claims: [],
            quality: "conventional",
            strength: 0
        },
        outliers: [],
        topology: "high_confidence",
        ghost: null,
        query: "",
        turn: 0,
        timestamp: new Date().toISOString(),
        model_count: 0,
        souvenir: ""
    };
}

/**
 * Parse MapperArtifact from text.
 * Expects sections: ===CONSENSUS===, ===OUTLIERS===, ===METADATA===
 */
export function parseMapperArtifact(text: string): MapperArtifact {
    if (!text) return createEmptyMapperArtifact();

    const normalized = normalizeText(text);
    const artifact = createEmptyMapperArtifact();

    // 1. Try JSON parsing first
    try {
        const jsonMatch = normalized.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || normalized.match(/^\{[\s\S]*\}$/);
        if (jsonMatch) {
            const jsonText = jsonMatch[1] || jsonMatch[0];
            const parsed = JSON.parse(jsonText);
            if (parsed && typeof parsed === 'object') {
                return {
                    ...artifact,
                    ...parsed,
                    consensus: { ...artifact.consensus, ...(parsed.consensus || {}) },
                };
            }
        }
    } catch (e) {
        // Fallback to regex
    }

    // Helper for Mapper sections with === headers
    const extractMapperSection = (name: string) => {
        // Match === NAME === or ## NAME or **NAME**
        // We prioritize the === format as per prompt
        const pattern = new RegExp(`={3,}\\s*${name}\\s*={3,}\\n([\\s\\S]*?)(?=\\n={3,}|$)`, 'i');
        const match = normalized.match(pattern);
        return match ? match[1].trim() : extractSection(normalized, name);
    };

    const consensusText = extractMapperSection('CONSENSUS');
    const outliersText = extractMapperSection('OUTLIERS');
    const metadataText = extractMapperSection('METADATA');

    // Parse Consensus
    if (consensusText) {
        // Extract claims (lines starting with - or *)
        const claims: Array<{ text: string; supporters: number[]; support_count: number }> = [];
        const lines = consensusText.split('\n');
        for (const line of lines) {
            const match = line.match(/^[-*•]\s*(.+)$/);
            if (match) {
                // Simplified: entire line is text. 
                // In a real implementation, we'd parse supporters from the text if present e.g. "(Models 1,2)"
                claims.push({
                    text: match[1].trim(),
                    supporters: [],
                    support_count: 0
                });
            }
        }
        if (claims.length > 0) artifact.consensus.claims = claims;

        const quality = extractLabeledValue(consensusText, 'quality');
        if (quality) artifact.consensus.quality = quality.toLowerCase() as any;

        const strength = extractLabeledValue(consensusText, 'strength');
        if (strength) artifact.consensus.strength = parseFloat(strength);
    }

    // Parse Outliers
    if (outliersText) {
        // Flexible parsing for outliers
        const outlierBlocks = outliersText.split(/\n\s*[-*•]\s+/).filter(Boolean);
        for (const block of outlierBlocks) {
            // Very basic heuristic for now
            const parts = block.split('\n');
            if (parts.length > 0) {
                artifact.outliers.push({
                    insight: parts[0].trim(),
                    source: "unknown",
                    source_index: -1,
                    type: "supplemental",
                    raw_context: parts.slice(1).join(' ').trim()
                });
            }
        }
    }

    // Parse Metadata
    if (metadataText) {
        const topology = extractLabeledValue(metadataText, 'topology');
        if (topology) artifact.topology = topology.toLowerCase() as any; // Ensure case matches

        const ghost = extractLabeledValue(metadataText, 'ghost');
        if (ghost && ghost.toLowerCase() !== 'none') artifact.ghost = ghost;

        const query = extractLabeledValue(metadataText, 'query');
        if (query) artifact.query = query;
    }

    // Parse Souvenir (can be its own section or in metadata)
    const souvenirText = extractMapperSection('SOUVENIR');
    if (souvenirText) {
        artifact.souvenir = souvenirText;
    } else if (metadataText) {
        const souvenir = extractLabeledValue(metadataText, 'souvenir');
        if (souvenir) artifact.souvenir = souvenir;
    }

    return artifact;
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
    const action = extractLabeledValue(section, 'action') || undefined;

    if (!insight) return null;

    return { insight, source, impact, action };
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
 * Helper to infer LeapAction from text
 */
function inferAction(text: string): LeapAction {
    if (/verify|check|confirm|validate/i.test(text)) return 'verify';
    if (/reframe|rephrase|reconsider/i.test(text)) return 'reframe';
    if (/research|investigate|explore|look into/i.test(text)) return 'research';
    return 'proceed';
}

/**
 * Extract leap (next step) from text
 */
export function extractLeap(text: string): Leap {
    const section = extractSection(text, 'Leap') ||
        extractSection(text, 'Next Step') ||
        extractSection(text, 'Recommended Action') ||
        extractSection(text, 'Action');

    const defaultLeap: Leap = { action: 'proceed', rationale: '' };

    if (!section) return defaultLeap;

    // Try to extract structured format
    const actionMatch = section.match(/\*?\*?(proceed|verify|reframe|research)\*?\*?[:\s]+(.+)/i);

    if (actionMatch) {
        const action = actionMatch[1].toLowerCase() as LeapAction;
        const rest = actionMatch[2].trim();

        // Try to split into rationale and why
        const whyMatch = rest.match(/(.+?)(?:\s*[—\-]+\s*(?:because|why)[:\s]*(.+))?$/i);
        const rationale = whyMatch ? (whyMatch[2] || whyMatch[1]).trim() : rest;

        return {
            action,
            rationale,
        };
    }

    const actionValue = extractLabeledValue(section, 'action');
    const action: LeapAction = (['proceed', 'verify', 'reframe', 'research'].includes(actionValue?.toLowerCase() || '')
        ? actionValue!.toLowerCase()
        : 'proceed') as LeapAction;
    const rationale = extractLabeledValue(section, 'rationale') || extractLabeledValue(section, 'why') || extractLabeledValue(section, 'reason') || '';

    if (rationale) {
        return { action, rationale };
    }

    // Fallback: use first sentence as rationale, infer action from keywords
    const firstSentence = section.split(/[.!?]\s/)[0];
    const inferredAction = inferAction(section);

    return {
        action: inferredAction,
        rationale: firstSentence?.trim() || section.slice(0, 100),
    };
}

// ============================================================================
// ANTAGONIST OUTPUT PARSING
// ============================================================================

export interface AntagonistDimension {
    variable: string;
    options: string;
    why: string;
}

export interface ParsedBracket {
    variable: string;
    options: string[];
    startIndex: number;
    endIndex: number;
    fullMatch: string;
}

export interface AntagonistOutput {
    the_prompt: {
        text: string | null;
        dimensions: AntagonistDimension[];
        grounding: string | null;
        payoff: string | null;
    };
    the_audit: {
        missed: Array<{ approach: string; source: string }>;
    };
    rawText?: string;
}

/**
 * Create empty antagonist output
 */
export function createEmptyAntagonistOutput(rawText: string = ''): AntagonistOutput {
    return {
        the_prompt: {
            text: null,
            dimensions: [],
            grounding: null,
            payoff: null,
        },
        the_audit: {
            missed: [],
        },
        rawText,
    };
}

/**
 * Parse Antagonist output from raw text (JSON or markdown)
 */
export function parseAntagonistOutput(raw: string): AntagonistOutput | null {
    if (!raw || typeof raw !== 'string') {
        return null;
    }

    try {
        // Try direct JSON parse
        const parsed = JSON.parse(raw);
        return validateAntagonistOutput(parsed, raw);
    } catch {
        // Try extracting JSON from markdown code blocks
        const jsonMatch = raw.match(/```json?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                return validateAntagonistOutput(parsed, raw);
            } catch {
                // Fall through to brace extraction
            }
        }

        // Try finding JSON object boundaries
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            try {
                const candidate = raw.substring(firstBrace, lastBrace + 1);
                const parsed = JSON.parse(candidate);
                return validateAntagonistOutput(parsed, raw);
            } catch {
                // Failed to parse
            }
        }

        return null;
    }
}

/**
 * Validate and normalize antagonist output structure
 */
function validateAntagonistOutput(obj: any, rawText: string): AntagonistOutput | null {
    // Check required structure exists
    if (!obj || typeof obj !== 'object') return null;
    if (!obj.the_prompt || !obj.the_audit) return null;

    // Normalize null states (when decision is already obvious)
    if (obj.the_prompt.text === null) {
        return {
            the_prompt: {
                text: null,
                dimensions: [],
                grounding: null,
                payoff: null,
            },
            the_audit: {
                missed: Array.isArray(obj.the_audit.missed) ? obj.the_audit.missed : [],
            },
            rawText,
        };
    }

    // Validate dimensions array
    const dimensions: AntagonistDimension[] = Array.isArray(obj.the_prompt.dimensions)
        ? obj.the_prompt.dimensions.map((d: any) => ({
            variable: String(d.variable || ''),
            options: String(d.options || ''),
            why: String(d.why || ''),
        }))
        : [];

    // Validate missed array
    const missed: Array<{ approach: string; source: string }> = Array.isArray(obj.the_audit.missed)
        ? obj.the_audit.missed.map((m: any) => ({
            approach: String(m.approach || ''),
            source: String(m.source || ''),
        }))
        : [];

    return {
        the_prompt: {
            text: obj.the_prompt.text != null ? String(obj.the_prompt.text) : null,
            dimensions,
            grounding: obj.the_prompt.grounding != null ? String(obj.the_prompt.grounding) : null,
            payoff: obj.the_prompt.payoff != null ? String(obj.the_prompt.payoff) : null,
        },
        the_audit: {
            missed,
        },
        rawText,
    };
}

/**
 * Parse bracketed variables from antagonist prompt text
 * Format: [variable: option1 / option2 / option3]
 */
export function parseBrackets(text: string): ParsedBracket[] {
    if (!text) return [];

    const regex = /\[([^:]+):\s*([^\]]+)\]/g;
    const brackets: ParsedBracket[] = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        brackets.push({
            variable: match[1].trim(),
            options: match[2].split('/').map(o => o.trim()),
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            fullMatch: match[0],
        });
    }

    return brackets;
}

/**
 * Build final prompt by filling in user selections
 */
export function buildFinalPrompt(text: string, selections: Record<string, string>): string {
    let result = text;

    Object.entries(selections).forEach(([variable, value]) => {
        // Replace [variable: option1 / option2] with just the selected value
        const regex = new RegExp(`\\[${variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:[^\\]]+\\]`, 'gi');
        result = result.replace(regex, value);
    });

    return result;
}

/**
 * Clean antagonist response for user-facing display.
 * Extracts the user-facing prompt text and strips out the metadata JSON.
 */
export function cleanAntagonistResponse(text: string): string {
    if (!text || typeof text !== 'string') return '';

    // Antagonist responses are often JSON blobs.
    // If it looks like JSON, try to parse and extract the prompt text.
    if (text.trim().startsWith('{')) {
        try {
            const parsed = parseAntagonistOutput(text);
            if (parsed && parsed.the_prompt && parsed.the_prompt.text) {
                return parsed.the_prompt.text;
            }
        } catch (e) {
            // Fall back to original text if parsing fails
        }
    }

    return text;
}

// ============================================================================
// EXPLORE OUTPUT PARSING
// ============================================================================


export function createEmptyExploreOutput(): ExploreOutput {
    return {
        container: "direct_answer",
        content: { answer: "", additional_context: [] },
        souvenir: "",
        alternatives: [],
        artifact_id: ""
    };
}

export function parseExploreOutput(text: string): ExploreOutput {
    if (!text) return createEmptyExploreOutput();

    const normalized = normalizeText(text);

    // 1. Try JSON parsing first (primary method)
    try {
        const jsonMatch = normalized.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || normalized.match(/^\{[\s\S]*\}$/);
        if (jsonMatch) {
            const jsonText = jsonMatch[1] || jsonMatch[0];
            const parsed = JSON.parse(jsonText);
            if (parsed && typeof parsed === 'object' && parsed.container && parsed.content) {
                return {
                    container: parsed.container,
                    content: parsed.content,
                    souvenir: parsed.souvenir || "",
                    alternatives: parsed.alternatives || [],
                    artifact_id: parsed.artifact_id || `explore-${Date.now()}`
                } as ExploreOutput;
            }
        }
    } catch (e) {
        // JSON parsing failed
    }

    // 2. Fallback: Parse markdown if JSON fails (implementing a basic graceful degradation)
    // For now, if JSON parsing fails, we default to a direct answer with the raw text
    return {
        container: "direct_answer",
        content: {
            answer: text, // Fallback: treat the whole text as the answer
            additional_context: []
        },
        souvenir: "Exploration provided as raw text",
        alternatives: [],
        artifact_id: `explore-fallback-${Date.now()}`
    };
}

// ============================================================================
// GAUNTLET OUTPUT PARSING
// ============================================================================

export function createEmptyGauntletOutput(): GauntletOutput {
    return {
        the_answer: { statement: "", reasoning: "", next_step: "" },
        survivors: {
            primary: { claim: "", survived_because: "" },
            supporting: [],
            conditional: []
        },
        eliminated: {
            from_consensus: [],
            from_outliers: [],
            ghost: null
        },
        confidence: { score: 0, display: "", notes: [] },
        souvenir: "",
        artifact_id: ""
    };
}

export function parseGauntletOutput(text: string): GauntletOutput {
    if (!text) return createEmptyGauntletOutput();

    const normalized = normalizeText(text);

    // 1. Try JSON First
    try {
        const jsonMatch = normalized.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || normalized.match(/^\{[\s\S]*\}$/);
        if (jsonMatch) {
            const jsonText = jsonMatch[1] || jsonMatch[0];
            const parsed = JSON.parse(jsonText);
            if (parsed && typeof parsed === 'object' && parsed.the_answer) {
                // Calculate display dots derived from score if missing
                const score = parsed.confidence?.score || 0;
                const display = parsed.confidence?.display || "•".repeat(Math.round(score * 5)) || "•";

                return {
                    ...createEmptyGauntletOutput(),
                    ...parsed,
                    confidence: {
                        ...parsed.confidence,
                        display
                    },
                    artifact_id: parsed.artifact_id || `gauntlet-${Date.now()}`
                };
            }
        }
    } catch (e) {
        console.warn("[parsing-utils] Gauntlet JSON parse failed, falling back to heuristics", e);
    }

    // 2. Fallback: Detailed Heuristics
    const output = createEmptyGauntletOutput();

    const extractSectionFlexible = (names: string[]): string => {
        for (const name of names) {
            const pattern = new RegExp(`(?:={3,}|#{1,6}|\\*\\*)\\s*${name}\\s*(?:={3,}|\\*\\*)?:?\\n([\\s\\S]*?)(?=\\n(?:={3,}|#{1,6}|\\*\\*)|$)`, 'i');
            const match = normalized.match(pattern);
            if (match && match[1]) return match[1].trim();
        }
        return '';
    };

    // THE ANSWER
    const answerText = extractSectionFlexible(['THE_ANSWER', 'THE ANSWER', 'VERDICT', 'DECISION']);
    if (answerText) {
        const lines = answerText.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
            output.the_answer.statement = lines[0].replace(/^[-*•]\s*/, '').trim();
            output.the_answer.reasoning = lines.slice(1).join(' ').trim();
        }
    }

    // SURVIVORS
    const survivorsText = extractSectionFlexible(['SURVIVORS', 'SURVIVING CLAIMS', 'THE SURVIVORS']);
    if (survivorsText) {
        const lines = survivorsText.split('\n').filter(l => l.trim().match(/^[-*•]/));
        if (lines.length > 0) {
            output.survivors.primary.claim = lines[0].replace(/^[-*•]\s*/, '').trim();
            output.survivors.primary.survived_because = "Highest confidence claim.";

            output.survivors.supporting = lines.slice(1).map(l => ({
                claim: l.replace(/^[-*•]\s*/, '').trim(),
                relationship: "Corroborates"
            }));
        }
    }

    // ELIMINATED
    const eliminatedText = extractSectionFlexible(['ELIMINATED', 'KILLED', 'THE CULL', 'DISCARDED']);
    if (eliminatedText) {
        const lines = eliminatedText.split('\n').filter(l => l.trim().match(/^[-*•]/));
        output.eliminated.from_consensus = lines.map(l => {
            const line = l.replace(/^[-*•]\s*/, '').trim();
            const parts = line.split(/[:—]|\bbecause\b/i);
            return {
                claim: parts[0].trim(),
                killed_because: parts.length > 1 ? parts.slice(1).join(' ').trim() : "Failed stress-test."
            };
        });
    }

    // CONFIDENCE
    const confidenceText = extractSectionFlexible(['CONFIDENCE', 'SCORE', 'RELIABILITY']);
    if (confidenceText) {
        const scoreMatch = confidenceText.match(/([\d.]+(?:\/\d+)?)/);
        if (scoreMatch) {
            let val = parseFloat(scoreMatch[1]);
            if (scoreMatch[1].includes('/')) {
                const parts = scoreMatch[1].split('/');
                val = parseFloat(parts[0]) / parseFloat(parts[1]);
            }
            if (!isNaN(val)) {
                if (val > 1) val = val / 10;
                output.confidence.score = Math.min(Math.max(val, 0), 1);
            }
        }
    }

    // Normalize display
    output.confidence.display = "•".repeat(Math.round(output.confidence.score * 5)) || "•••";
    output.souvenir = extractSectionFlexible(['SOUVENIR', 'TAKEAWAY', 'MANTRA']) || "The gauntlet has been run.";
    output.artifact_id = `gauntlet-heuristic-${Date.now()}`;

    return output;
}

// ============================================================================
// UNDERSTAND OUTPUT PARSING
// ============================================================================

export function createEmptyUnderstandOutput(): UnderstandOutput {
    return {
        short_answer: "",
        long_answer: "",
        the_one: null,
        the_echo: null,
        souvenir: "",
        artifact_id: ""
    };
}

export function parseUnderstandOutput(text: string): UnderstandOutput {
    if (!text) return createEmptyUnderstandOutput();

    const normalized = normalizeText(text);

    // 1. Try JSON parsing first
    try {
        const jsonMatch = normalized.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || normalized.match(/^\{[\s\S]*\}$/);
        if (jsonMatch) {
            const jsonText = jsonMatch[1] || jsonMatch[0];
            const parsed = JSON.parse(jsonText);
            if (parsed && typeof parsed === 'object') {
                return {
                    ...createEmptyUnderstandOutput(),
                    ...parsed,
                    artifact_id: parsed.artifact_id || `understand-${Date.now()}`
                };
            }
        }
    } catch (e) {
        // JSON parsing failed
    }

    // 2. Fallback: Parse markdown (minimal placeholder for now)
    return {
        ...createEmptyUnderstandOutput(),
        short_answer: text,
        souvenir: "Understand output provided as raw text",
        artifact_id: `understand-fallback-${Date.now()}`
    };
}
