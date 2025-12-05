import React, { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { isDecisionMapOpenAtom, turnByIdAtom, mappingProviderAtom, activeSplitPanelAtom } from "../state/atoms";
import { motion, AnimatePresence } from "framer-motion";
import DecisionMapGraph from "./experimental/DecisionMapGraph";
import { adaptGraphTopology } from "./experimental/graphAdapter";
import MarkdownDisplay from "./MarkdownDisplay";
import { LLM_PROVIDERS_CONFIG, PROVIDER_COLORS } from "../constants";
import { getLatestResponse, normalizeResponseArray } from "../utils/turn-helpers";
import { getProviderById } from "../providers/providerRegistry";
import type { AiTurn, ProviderResponse } from "../types";
import clsx from "clsx";

// ============================================================================
// PARSING UTILITIES
// ============================================================================

function parseMappingResponse(response?: string | null) {
  if (!response) return { mapping: "", options: null };
  let normalized = response
    .replace(/\\=/g, '=')
    .replace(/\\_/g, '_')
    .replace(/\\\*/g, '*')
    .replace(/\\-/g, '-')
    .replace(/[＝═⁼˭꓿﹦]/g, '=')
    .replace(/[‗₌]/g, '=')
    .replace(/\u2550/g, '=')
    .replace(/\uFF1D/g, '=');
  const topoMatch = normalized.match(/={3,}\s*GRAPH[_\s]*TOPOLOGY\s*={3,}/i);
  if (topoMatch && typeof topoMatch.index === 'number') {
    normalized = normalized.slice(0, topoMatch.index).trim();
  }
  const optionsPatterns = [
    { re: /\n?={3,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={3,}\n?/i, minPosition: 0 },
    { re: /\n?[=\-─━═＝]{3,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*[=\-─━═＝]{3,}\n?/i, minPosition: 0 },
    { re: /\n?\*{0,2}={3,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={3,}\*{0,2}\n?/i, minPosition: 0 },
    { re: /\n#{1,3}\s*All\s+Available\s+Options:?\n/i, minPosition: 0.25 },
    { re: /\n\*{2}All\s+Available\s+Options:?\*{2}\n/i, minPosition: 0.25 },
    { re: /\nAll\s+Available\s+Options:\n/i, minPosition: 0.3 },
  ];
  let bestMatch: { index: number; length: number } | null = null;
  let bestScore = -1;
  for (const pattern of optionsPatterns) {
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
  if (bestMatch) {
    const afterDelimiter = normalized.substring(bestMatch.index + bestMatch.length).trim();
    const listPreview = afterDelimiter.slice(0, 200);
    const hasListStructure = /^\s*[-*•]\s+|\n\s*[-*•]\s+|^\s*\d+\.\s+|\n\s*\d+\.\s+|^\s*\*\*[^*]+\*\*|^\s*Theme\s*:|^\s*[A-Z][^:\n]{2,}:/i.test(listPreview);
    if (hasListStructure) {
      const mapping = normalized.substring(0, bestMatch.index).trim();
      const options = afterDelimiter || null;
      return { mapping, options };
    }
  }
  return { mapping: normalized, options: null };
}

function extractGraphTopologyFromText(rawText?: string | null) {
  if (!rawText || typeof rawText !== 'string') return null;
  try {
    let normalized = rawText
      .replace(/\\=/g, '=')
      .replace(/\\_/g, '_')
      .replace(/\\\*/g, '*')
      .replace(/\\-/g, '-');
    const match = normalized.match(/={3,}\s*GRAPH[_\s]*TOPOLOGY\s*={3,}/i);
    if (!match || typeof match.index !== 'number') return null;
    const start = match.index + match[0].length;
    let rest = normalized.slice(start).trim();
    const codeBlockMatch = rest.match(/^```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      rest = codeBlockMatch[1].trim();
    }
    let i = 0;
    while (i < rest.length && rest[i] !== '{') i++;
    if (i >= rest.length) return null;
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
          let jsonText = rest.slice(i, j + 1);
          jsonText = jsonText.replace(/("supporters"\s*:\s*\[)\s*S\s*([,\]])/g, '$1"S"$2');
          const parsed = JSON.parse(jsonText);
          return parsed;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

// ============================================================================
// OPTIONS PARSING - Handle both emoji-prefixed themes and "Theme:" headers
// ============================================================================

interface ParsedOption {
  title: string;
  description: string;
  citations: number[];
}

interface ParsedTheme {
  name: string;
  options: ParsedOption[];
}

function parseOptionsIntoThemes(optionsText: string | null): ParsedTheme[] {
  if (!optionsText) return [];

  const lines = optionsText.split('\n');
  const themes: ParsedTheme[] = [];
  let currentTheme: ParsedTheme | null = null;

  // Patterns for theme headers:
  // 1. Emoji-prefixed: "📐 Architecture & Pipeline" or "💻 Visualization..."
  // 2. "Theme:" prefix: "Theme: Defining the Interactive Role"
  const themePatterns = [
    /^([^\w\s][\u{1F300}-\u{1FAD6}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]?)\s*(.+?)$/u, // Emoji start
    /^Theme:\s*(.+)$/i, // "Theme:" prefix
    /^#+\s*(.+)$/, // Markdown headers
  ];

  // Pattern for option items (bold title followed by colon)
  const optionPattern = /^\s*[-*•]?\s*\*?\*?([^:*]+)\*?\*?:\s*(.*)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this is a theme header
    let isTheme = false;
    let themeName = '';

    // Check emoji-prefixed (starts with emoji)
    if (/^[\u{1F300}-\u{1FAD6}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(trimmed)) {
      isTheme = true;
      themeName = trimmed;
    }
    // Check "Theme:" prefix
    else if (/^Theme:\s*/i.test(trimmed)) {
      isTheme = true;
      themeName = trimmed.replace(/^Theme:\s*/i, '').trim();
    }
    // Check markdown header that doesn't look like an option
    else if (/^#+\s*/.test(trimmed) && !optionPattern.test(trimmed)) {
      isTheme = true;
      themeName = trimmed.replace(/^#+\s*/, '').trim();
    }

    if (isTheme && themeName) {
      currentTheme = { name: themeName, options: [] };
      themes.push(currentTheme);
      continue;
    }

    // Check if this is an option item
    const optionMatch = trimmed.match(/^\s*[-*•]?\s*\*{0,2}([^:]+?)\*{0,2}:\s*(.+)$/);
    if (optionMatch && currentTheme) {
      const title = optionMatch[1].trim().replace(/^\*\*|\*\*$/g, '');
      const rest = optionMatch[2].trim();

      // Extract citation numbers [1], [2, 3], etc.
      const citations: number[] = [];
      const citationMatches = rest.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g);
      for (const cm of citationMatches) {
        const nums = cm[1].split(/\s*,\s*/).map(n => parseInt(n.trim(), 10));
        citations.push(...nums.filter(n => !isNaN(n)));
      }

      // Remove citations from description
      const description = rest.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '').trim();

      currentTheme.options.push({ title, description, citations });
    } else if (currentTheme && currentTheme.options.length > 0) {
      // Continuation of previous option description
      const lastOption = currentTheme.options[currentTheme.options.length - 1];
      lastOption.description += ' ' + trimmed.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '').trim();
    }
  }

  // If no themes were detected, create a default theme
  if (themes.length === 0 && optionsText.trim()) {
    const defaultTheme: ParsedTheme = { name: 'Options', options: [] };
    // Try to parse all lines as options
    for (const line of lines) {
      const optionMatch = line.trim().match(/^\s*[-*•]?\s*\*{0,2}([^:]+?)\*{0,2}:\s*(.+)$/);
      if (optionMatch) {
        const title = optionMatch[1].trim().replace(/^\*\*|\*\*$/g, '');
        const rest = optionMatch[2].trim();
        const citations: number[] = [];
        const citationMatches = rest.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g);
        for (const cm of citationMatches) {
          const nums = cm[1].split(/\s*,\s*/).map(n => parseInt(n.trim(), 10));
          citations.push(...nums.filter(n => !isNaN(n)));
        }
        const description = rest.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '').trim();
        defaultTheme.options.push({ title, description, citations });
      }
    }
    if (defaultTheme.options.length > 0) {
      themes.push(defaultTheme);
    }
  }

  return themes;
}

// ============================================================================
// NARRATIVE EXTRACTION - Find paragraphs containing canonical label
// ============================================================================

function extractNarrativeExcerpt(narrativeText: string, label: string): string {
  if (!narrativeText || !label) return '';

  // Split into sentences/paragraphs
  const paragraphs = narrativeText.split(/\n\n+/);
  const matchingParagraphs: string[] = [];

  // Simple case-insensitive search for the label
  const labelLower = label.toLowerCase();

  for (const para of paragraphs) {
    if (para.toLowerCase().includes(labelLower)) {
      // Highlight the matching part
      const highlighted = para.replace(
        new RegExp(`(${escapeRegex(label)})`, 'gi'),
        '**$1**'
      );
      matchingParagraphs.push(highlighted);
    }
  }

  return matchingParagraphs.join('\n\n');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// SUPPORTER ORBS COMPONENT
// ============================================================================

interface SupporterOrbsProps {
  supporters: (string | number)[];
  citationSourceOrder?: Record<number, string>; // Maps citation number -> provider ID
  onOrbClick?: (providerId: string) => void;
  size?: 'small' | 'large';
}

const SupporterOrbs: React.FC<SupporterOrbsProps> = ({ supporters, citationSourceOrder, onOrbClick, size = 'large' }) => {
  // Map supporter numbers/ids to provider configs using citationSourceOrder when available
  const getProviderFromSupporter = (s: string | number) => {
    // Handle 'S' as synthesizer identifier
    if (s === 'S' || s === 's') {
      // For synthesizer, return the synthesis provider from metadata or use gemini as fallback
      const synthProviderId = (citationSourceOrder as any)?.['S'] || 'gemini';
      return getProviderById(synthProviderId) || null;
    }
    // If it's a number and we have citationSourceOrder, use it
    if ((typeof s === 'number' || !isNaN(Number(s))) && citationSourceOrder) {
      const num = Number(s);
      const providerId = citationSourceOrder[num];
      if (providerId) {
        return getProviderById(providerId) || null;
      }
    }
    // If it's a string, try direct lookup by provider ID
    if (typeof s === 'string' && isNaN(Number(s))) {
      return getProviderById(s) || null;
    }
    // Fallback: no mapping available
    return null;
  };

  const getInitials = (name: string) => {
    const words = name.split(/\s+/);
    if (words.length === 1) return name.slice(0, 2).toUpperCase();
    return words.slice(0, 2).map(w => w[0]).join('').toUpperCase();
  };

  const orbSize = size === 'large' ? 40 : 28;

  return (
    <div className="flex gap-2 flex-wrap">
      {supporters.map((s, idx) => {
        const provider = getProviderFromSupporter(s);
        const color = provider ? PROVIDER_COLORS[provider.id] || PROVIDER_COLORS['default'] : '#64748b';
        const name = provider?.name || `Model ${s}`;
        const initials = getInitials(name);

        return (
          <button
            key={idx}
            type="button"
            className="decision-orb-badge"
            style={{
              '--orb-color': color,
              width: orbSize,
              height: orbSize,
              fontSize: size === 'large' ? 11 : 9
            } as React.CSSProperties}
            onClick={() => onOrbClick?.(provider?.id || String(s))}
            title={name}
          >
            <span>{initials}</span>
          </button>
        );
      })}
    </div>
  );
};

// ============================================================================
// OPTIONS TAB - COLLAPSIBLE THEME SECTIONS
// ============================================================================

interface OptionsTabProps {
  themes: ParsedTheme[];
  citationSourceOrder?: Record<number, string>;
  onCitationClick: (num: number) => void;
}

const OptionsTab: React.FC<OptionsTabProps> = ({ themes, citationSourceOrder, onCitationClick }) => {
  const [expandedThemes, setExpandedThemes] = useState<Set<number>>(new Set([0])); // First expanded by default

  const toggleTheme = (idx: number) => {
    setExpandedThemes(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  if (themes.length === 0) {
    return <div className="text-text-muted text-sm p-4">No options available.</div>;
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      {themes.map((theme, tIdx) => (
        <div key={tIdx} className="options-theme-section">
          <div
            className="options-theme-header"
            onClick={() => toggleTheme(tIdx)}
          >
            <span className="options-theme-title">{theme.name}</span>
            <svg
              className={clsx("options-theme-chevron w-5 h-5", expandedThemes.has(tIdx) && "expanded")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {expandedThemes.has(tIdx) && (
            <div className="options-theme-content">
              {theme.options.map((opt, oIdx) => (
                <div key={oIdx} className="option-card">
                  <div className="option-card-title">{opt.title}</div>
                  <div className="option-card-description">{opt.description}</div>
                  {opt.citations.length > 0 && (
                    <div className="option-card-supporters">
                      <SupporterOrbs
                        supporters={opt.citations}
                        citationSourceOrder={citationSourceOrder}
                        onOrbClick={(pid) => onCitationClick(opt.citations[0])}
                        size="small"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// DETAIL VIEW COMPONENT
// ============================================================================

interface DetailViewProps {
  node: { id: string; label: string; supporters: (string | number)[]; theme?: string };
  narrativeExcerpt: string;
  citationSourceOrder?: Record<number, string>;
  onBack: () => void;
  onOrbClick: (providerId: string) => void;
}

const DetailView: React.FC<DetailViewProps> = ({ node, narrativeExcerpt, citationSourceOrder, onBack, onOrbClick }) => {
  // Get color from first supporter using citationSourceOrder
  const getNodeColor = () => {
    if (!node.supporters || node.supporters.length === 0) return '#8b5cf6';
    const first = node.supporters[0];
    let providerId: string | undefined;

    if ((typeof first === 'number' || !isNaN(Number(first))) && citationSourceOrder) {
      providerId = citationSourceOrder[Number(first)];
    } else if (typeof first === 'string' && isNaN(Number(first))) {
      providerId = first;
    }

    return providerId ? (PROVIDER_COLORS[providerId] || '#8b5cf6') : '#8b5cf6';
  };

  const nodeColor = getNodeColor();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="h-full flex flex-col p-6 overflow-y-auto"
    >
      {/* Back button - top left */}
      <button
        type="button"
        className="decision-back-btn self-start mb-6"
        onClick={onBack}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Graph
      </button>

      {/* Node as large centered header */}
      <div className="flex flex-col items-center mb-8">
        {/* Node visual (120px) */}
        <div
          className="w-[120px] h-[120px] rounded-full mb-4 flex items-center justify-center"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${nodeColor}88, ${nodeColor}22)`,
            boxShadow: `0 0 40px ${nodeColor}44`,
            border: `2px solid ${nodeColor}88`
          }}
        >
          <span className="text-2xl font-bold text-white text-center px-2" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
            {node.label.length > 20 ? node.label.slice(0, 20) + '…' : node.label}
          </span>
        </div>

        {/* Full label */}
        <h2
          className="decision-detail-header"
          style={{ color: nodeColor }}
        >
          {node.label}
        </h2>

        {node.theme && (
          <span className="text-sm text-text-muted mt-2">{node.theme}</span>
        )}
      </div>

      {/* Supported by row */}
      <div className="mb-8">
        <h3 className="text-sm font-medium text-text-muted mb-3">Supported by</h3>
        <SupporterOrbs
          supporters={node.supporters || []}
          citationSourceOrder={citationSourceOrder}
          onOrbClick={onOrbClick}
          size="large"
        />
      </div>

      {/* Narrative excerpt */}
      {narrativeExcerpt && (
        <div className="flex-1">
          <h3 className="text-sm font-medium text-text-muted mb-3">From the Narrative</h3>
          <div className="narrative-highlight">
            <MarkdownDisplay content={narrativeExcerpt} />
          </div>
        </div>
      )}

      {!narrativeExcerpt && (
        <div className="text-text-muted text-sm italic">
          No matching narrative excerpt found for this option.
        </div>
      )}
    </motion.div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const DecisionMapSheet = React.memo(() => {
  const [openState, setOpenState] = useAtom(isDecisionMapOpenAtom);
  const turnGetter = useAtomValue(turnByIdAtom);
  const mappingProvider = useAtomValue(mappingProviderAtom);
  const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);

  const [activeTab, setActiveTab] = useState<'graph' | 'narrative' | 'options'>('graph');
  const [selectedNode, setSelectedNode] = useState<{ id: string; label: string; supporters: (string | number)[]; theme?: string } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: window.innerWidth, h: 400 });

  // Reset to graph tab when sheet opens
  useEffect(() => {
    if (openState) {
      setActiveTab('graph');
      setSelectedNode(null);
    }
  }, [openState?.turnId]);

  // Measure container dimensions after render and on resize
  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (el) {
        setDims({ w: el.clientWidth, h: el.clientHeight });
      } else {
        // Fallback to window-based calculation
        setDims({ w: window.innerWidth, h: Math.floor(window.innerHeight * 0.7) - 100 });
      }
    };

    // Initial update + delayed update after animation
    update();
    const raf = requestAnimationFrame(update);
    const timeout = setTimeout(update, 350); // After spring animation

    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [openState]);

  const aiTurn: AiTurn | null = useMemo(() => {
    const tid = openState?.turnId;
    const t = tid ? turnGetter(tid) : undefined;
    return t && (t as any).type === 'ai' ? (t as AiTurn) : null;
  }, [openState, turnGetter]);

  const mappingResponses = useMemo(() => {
    const out: Record<string, ProviderResponse[]> = {};
    LLM_PROVIDERS_CONFIG.forEach((p) => (out[String(p.id)] = []));
    if (!aiTurn) return out;
    const map = aiTurn.mappingResponses || {};
    Object.entries(map).forEach(([pid, resp]) => {
      out[pid] = normalizeResponseArray(resp);
    });
    return out;
  }, [aiTurn?.id, aiTurn?.mappingVersion]);

  const activeMappingPid = useMemo(() => {
    if (!aiTurn) return undefined;
    if (mappingProvider) return mappingProvider;
    if (aiTurn.meta?.mapper) return aiTurn.meta.mapper;
    const keys = Object.keys(aiTurn.mappingResponses || {});
    return keys.length > 0 ? keys[0] : undefined;
  }, [aiTurn, mappingProvider]);

  const latestMapping = useMemo(() => {
    if (!activeMappingPid) return undefined;
    return getLatestResponse(mappingResponses[activeMappingPid]);
  }, [activeMappingPid, mappingResponses]);

  const graphTopology = useMemo(() => {
    const fromMeta = (latestMapping as any)?.meta?.graphTopology || null;
    if (fromMeta) return fromMeta;
    const rawText = (latestMapping as any)?.text || null;
    return extractGraphTopologyFromText(rawText);
  }, [latestMapping]);

  const adapted = useMemo(() => adaptGraphTopology(graphTopology), [graphTopology]);

  const mappingText = useMemo(() => {
    const t = latestMapping?.text || '';
    const { mapping } = parseMappingResponse(String(t));
    return mapping;
  }, [latestMapping]);

  const optionsText = useMemo(() => {
    const fromMeta = (latestMapping as any)?.meta?.allAvailableOptions || null;
    if (fromMeta) return fromMeta;
    const t = latestMapping?.text || '';
    const { options } = parseMappingResponse(String(t));
    return options;
  }, [latestMapping]);

  const parsedThemes = useMemo(() => parseOptionsIntoThemes(optionsText), [optionsText]);

  // Extract citation source order from mapping metadata for correct citation-to-model mapping
  const citationSourceOrder = useMemo(() => {
    const metaOrder = (latestMapping as any)?.meta?.citationSourceOrder || null;
    if (metaOrder && typeof metaOrder === 'object') {
      return metaOrder as Record<number, string>;
    }
    // Fallback: build from active batch responses in order
    if (aiTurn) {
      const activeOrdered = LLM_PROVIDERS_CONFIG.map((p) => String(p.id)).filter((pid) => !!(aiTurn.batchResponses || {})[pid]);
      const order: Record<number, string> = {};
      activeOrdered.forEach((pid, idx) => {
        order[idx + 1] = pid;
      });
      return order;
    }
    return undefined;
  }, [latestMapping, aiTurn]);

  const handleCitationClick = useCallback((modelNumber: number) => {
    try {
      const metaOrder = (latestMapping as any)?.meta?.citationSourceOrder || null;
      let providerId: string | undefined;
      if (metaOrder && typeof metaOrder === 'object') {
        providerId = metaOrder[modelNumber];
      }
      if (!providerId && aiTurn) {
        const activeOrdered = LLM_PROVIDERS_CONFIG.map((p) => String(p.id)).filter((pid) => !!(aiTurn.batchResponses || {})[pid]);
        providerId = activeOrdered[modelNumber - 1];
      }
      if (!providerId || !aiTurn) return;
      setActiveSplitPanel({ turnId: aiTurn.id, providerId });
    } catch { }
  }, [latestMapping, aiTurn, setActiveSplitPanel]);

  const handleNodeClick = useCallback((node: any) => {
    setSelectedNode({
      id: node.id,
      label: node.label,
      supporters: node.supporters || [],
      theme: node.theme
    });
  }, []);

  const handleDetailOrbClick = useCallback((providerId: string) => {
    if (!aiTurn) return;
    setActiveSplitPanel({ turnId: aiTurn.id, providerId });
  }, [aiTurn, setActiveSplitPanel]);

  const narrativeExcerpt = useMemo(() => {
    if (!selectedNode) return '';
    return extractNarrativeExcerpt(mappingText, selectedNode.label);
  }, [selectedNode, mappingText]);

  const markdownComponents = useMemo(() => ({
    a: ({ href, children, ...props }: any) => {
      if (href && href.startsWith("#cite-")) {
        const idStr = href.replace("#cite-", "");
        const num = parseInt(idStr, 10);
        return (
          <button
            type="button"
            className="citation-link"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCitationClick(num);
            }}
            title={`View Source ${idStr}`}
          >
            [{children}]
          </button>
        );
      }
      return (
        <a href={href} {...props} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
  }), [handleCitationClick]);

  const transformCitations = useCallback((text: string) => {
    if (!text) return "";
    let t = text;
    // Handle [[CITE:X]] format (including S for synthesizer)
    t = t.replace(/\[\[CITE:([\dS])\]\]/gi, "[↗$1](#cite-$1)");
    // Handle [1], [2, 3], [1, S] format citations
    t = t.replace(/\[([\dS](?:\s*,\s*[\dS])*)\](?!\()/gi, (_m, grp) => {
      const items = String(grp)
        .split(/\s*,\s*/)
        .map((n) => n.trim())
        .filter(Boolean);
      return " " + items.map((n) => `[↗${n}](#cite-${n})`).join(" ") + " ";
    });
    return t;
  }, []);

  const tabConfig = [
    { key: 'graph' as const, label: 'Graph', activeClass: 'decision-tab-active-graph' },
    { key: 'narrative' as const, label: 'Narrative', activeClass: 'decision-tab-active-narrative' },
    { key: 'options' as const, label: 'Options', activeClass: 'decision-tab-active-options' },
  ];

  return (
    <AnimatePresence>
      {openState && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed inset-x-0 bottom-0 h-[70vh] decision-sheet-bg border-t border-border-strong shadow-elevated z-[3500] rounded-t-2xl flex flex-col pointer-events-auto"
        >
          {/* Drag handle */}
          <div
            className="h-8 flex items-center justify-center cursor-grab active:cursor-grabbing border-b border-white/10 hover:bg-white/5 transition-colors rounded-t-2xl relative z-10"
            onClick={() => setOpenState(null)}
          >
            <div className="w-12 h-1.5 bg-white/20 rounded-full" />
          </div>

          {/* Tabs */}
          <div className="flex items-center justify-center gap-4 px-8 py-4 border-b border-white/10 relative z-10">
            {tabConfig.map(({ key, label, activeClass }) => (
              <button
                key={key}
                type="button"
                className={clsx(
                  "decision-tab-pill",
                  activeTab === key && activeClass
                )}
                onClick={() => {
                  setActiveTab(key);
                  if (key !== 'graph') setSelectedNode(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden relative z-10" onClick={(e) => e.stopPropagation()}>
            <AnimatePresence mode="wait">
              {activeTab === 'graph' && !selectedNode && (
                <motion.div
                  key="graph"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  ref={containerRef}
                  className="w-full h-full"
                >
                  <DecisionMapGraph
                    nodes={adapted.nodes}
                    edges={adapted.edges}
                    citationSourceOrder={citationSourceOrder}
                    width={dims.w}
                    height={dims.h}
                    onNodeClick={handleNodeClick}
                  />
                </motion.div>
              )}

              {activeTab === 'graph' && selectedNode && (
                <motion.div
                  key="detail"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full"
                >
                  <DetailView
                    node={selectedNode}
                    narrativeExcerpt={narrativeExcerpt}
                    citationSourceOrder={citationSourceOrder}
                    onBack={() => setSelectedNode(null)}
                    onOrbClick={handleDetailOrbClick}
                  />
                </motion.div>
              )}

              {activeTab === 'narrative' && (
                <motion.div
                  key="narrative"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-6 h-full overflow-y-auto"
                >
                  {mappingText ? (
                    <div className="narrative-prose">
                      <MarkdownDisplay content={transformCitations(mappingText)} components={markdownComponents} />
                    </div>
                  ) : (
                    <div className="text-text-muted text-sm text-center py-8">No narrative available.</div>
                  )}
                </motion.div>
              )}

              {activeTab === 'options' && (
                <motion.div
                  key="options"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full overflow-y-auto"
                >
                  <OptionsTab themes={parsedThemes} citationSourceOrder={citationSourceOrder} onCitationClick={handleCitationClick} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
