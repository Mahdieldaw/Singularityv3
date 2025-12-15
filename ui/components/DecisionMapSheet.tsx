import React, { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { isDecisionMapOpenAtom, turnByIdAtom, mappingProviderAtom, activeSplitPanelAtom, providerAuthStatusAtom, refinerProviderAtom } from "../state/atoms";
import { useClipActions } from "../hooks/useClipActions";
import { motion, AnimatePresence } from "framer-motion";
import DecisionMapGraph from "./experimental/DecisionMapGraph";
import { adaptGraphTopology } from "./experimental/graphAdapter";
import MarkdownDisplay from "./MarkdownDisplay";
import { LLM_PROVIDERS_CONFIG, PROVIDER_COLORS } from "../constants";
import { getLatestResponse, normalizeResponseArray } from "../utils/turn-helpers";
import { getProviderById } from "../providers/providerRegistry";
import type { AiTurn, ProviderResponse } from "../types";
import clsx from "clsx";
import { CopyButton } from "./CopyButton";
import { formatDecisionMapForMd, formatGraphForMd } from "../utils/copy-format-utils";

// ============================================================================
// PARSING UTILITIES - Import from shared module (single source of truth)
// ============================================================================

import {
  parseMappingResponse as sharedParseMappingResponse,
  extractGraphTopologyAndStrip,
  cleanOptionsText,
} from "../../shared/parsing-utils";

// Wrapper to maintain existing API (returns { mapping, options })
function parseMappingResponse(response?: string | null) {
  if (!response) return { mapping: "", options: null };
  const result = sharedParseMappingResponse(response);
  return { mapping: result.narrative, options: result.options };
}

// Wrapper to extract just the topology from raw text
function extractGraphTopologyFromText(rawText?: string | null) {
  if (!rawText) return null;
  const { topology } = extractGraphTopologyAndStrip(rawText);
  return topology;
}



import { useRefinerOutput } from "../hooks/useRefinerOutput";
import { RefinerEpistemicAudit } from "./refinerui/RefinerCardsSection";

// ============================================================================
// OPTIONS PARSING - Handle both emoji-prefixed themes and "Theme:" headers
// ============================================================================

interface ParsedOption {
  title: string;
  description: string;
  citations: (number | string)[];
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
  citationSourceOrder?: Record<string | number, string>; // Maps citation number (or 'S') -> provider ID
  onOrbClick?: (providerId: string) => void;
  size?: 'small' | 'large';
}

const SupporterOrbs: React.FC<SupporterOrbsProps> = ({ supporters, citationSourceOrder, onOrbClick, size = 'large' }) => {
  // Map supporter numbers/ids to provider configs using citationSourceOrder when available
  const getProviderFromSupporter = (s: string | number) => {
    // Handle 'S' as synthesizer identifier
    if (s === 'S' || s === 's') {
      // For synthesizer, return the synthesis provider from metadata or use gemini as fallback
      const synthProviderId = citationSourceOrder?.['S'] || 'gemini';
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
  onCitationClick: (num: number | string) => void;
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
// MAPPER SELECTOR COMPONENT
// ============================================================================

interface MapperSelectorProps {
  aiTurn: AiTurn;
  activeProviderId?: string;
}

const MapperSelector: React.FC<MapperSelectorProps> = ({ aiTurn, activeProviderId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { handleClipClick } = useClipActions();
  const authStatus = useAtomValue(providerAuthStatusAtom);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const activeProvider = activeProviderId ? getProviderById(activeProviderId) : null;

  // Filter out system provider
  const providers = useMemo(() => LLM_PROVIDERS_CONFIG.filter(p => p.id !== 'system'), []);

  const handleSelect = (providerId: string) => {
    handleClipClick(aiTurn.id, "mapping", providerId);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-sm font-medium text-text-primary"
      >
        <span className="text-base">🧩</span>
        <span className="opacity-70 text-xs uppercase tracking-wide">Mapper</span>
        <span className="w-px h-3 bg-white/20 mx-1" />
        <span className={clsx(!activeProvider && "text-text-muted italic")}>
          {activeProvider?.name || "Select Model"}
        </span>
        <svg
          className={clsx("w-3 h-3 text-text-muted transition-transform", isOpen && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-surface-raised border border-border-subtle rounded-xl shadow-elevated overflow-hidden z-[3600] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-2 grid gap-1">
            {providers.map(p => {
              const pid = String(p.id);
              const isActive = pid === activeProviderId;
              const isUnauthorized = authStatus && authStatus[pid] === false;

              // Check for previous error (e.g. input length)
              const latestResp = getLatestResponse(aiTurn.mappingResponses?.[pid]);
              const hasError = latestResp?.status === 'error';
              const errorMessage = hasError ? (latestResp?.meta?._rawError || "Failed") : null;

              // Determine if we should disable interaction
              // We disable if unauthorized, but maybe we allow retry on error? 
              // User asked to "shortcircuit" if failed for input length.
              // We'll show it as disabled-ish but maybe clickable if they really want to try? 
              // User said "failed for input length... grey them out with a tooltip".

              const isDisabled = isUnauthorized; // Strict disable for auth
              const isDimmed = hasError; // Visual dim for error

              return (
                <button key={pid} onClick={() => { if (!isUnauthorized) { handleClipClick(aiTurn.id, "mapping", pid); setIsOpen(false); } }} disabled={isUnauthorized} className={clsx("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors", pid === activeProviderId ? "bg-brand-500/10 text-brand-500" : "hover:bg-surface-highlight text-text-secondary", isUnauthorized && "opacity-60 cursor-not-allowed")}>
                  <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: PROVIDER_COLORS[pid] || PROVIDER_COLORS.default }} />
                  <span className="flex-1 text-xs font-medium">{p.name}</span>
                  {pid === activeProviderId && <span>✓</span>}
                  {isUnauthorized && <span>🔒</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// FIXED: Added missing closing div in RefinerSelector structure
const RefinerSelector: React.FC<{ aiTurn: AiTurn, activeProviderId?: string, onSelect: (pid: string) => void }> = ({ aiTurn, activeProviderId, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { handleClipClick } = useClipActions();
  const authStatus = useAtomValue(providerAuthStatusAtom);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const activeProvider = activeProviderId ? getProviderById(activeProviderId) : null;
  const providers = useMemo(() => LLM_PROVIDERS_CONFIG.filter(p => p.id !== 'system'), []);

  const handleProviderSelect = (providerId: string) => {
    // 1. Update local view state
    onSelect(providerId);
    // 2. Trigger recompute/persistence
    handleClipClick(aiTurn.id, "refiner", providerId);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-sm font-medium text-text-primary"
      >
        <span className="text-base">🔒</span>
        <span className="opacity-70 text-xs uppercase tracking-wide">Auditor</span>
        <span className="w-px h-3 bg-white/20 mx-1" />
        <span className={clsx(!activeProvider && "text-text-muted italic")}>
          {activeProvider?.name || "Select Model"}
        </span>
        <svg
          className={clsx("w-3 h-3 text-text-muted transition-transform", isOpen && "rotate-180")}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-surface-raised border border-border-subtle rounded-xl shadow-elevated overflow-hidden z-[3600] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-2 grid gap-1">
            {providers.map(p => {
              const pid = String(p.id);
              const isActive = pid === activeProviderId;
              const isUnauthorized = authStatus && authStatus[pid] === false;
              const latestResp = getLatestResponse(aiTurn.refinerResponses?.[pid]);
              const hasError = latestResp?.status === 'error';
              const errorMessage = hasError ? (latestResp?.meta?._rawError || "Failed") : null;
              const isDisabled = isUnauthorized;

              return (
                <button
                  key={pid}
                  onClick={() => { if (!isDisabled) { onSelect(pid); handleClipClick(aiTurn.id, "refiner", pid); setIsOpen(false); } }}
                  disabled={isDisabled}
                  className={clsx(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors relative group",
                    isActive ? "bg-brand-500/10 text-brand-500" : "hover:bg-surface-highlight text-text-secondary",
                    (isDisabled || hasError) && "opacity-60",
                    isDisabled && "cursor-not-allowed",
                  )}
                  title={errorMessage && typeof errorMessage === 'string' ? errorMessage : undefined}
                >
                  <div
                    className="w-2 h-2 rounded-full shadow-sm"
                    style={{ backgroundColor: PROVIDER_COLORS[pid] || PROVIDER_COLORS.default }}
                  />
                  <div className="flex-1 flex flex-col">
                    <span className="text-xs font-medium">{p.name}</span>
                  </div>
                  {hasError && (
                    <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 hidden group-hover:block z-50 w-48 bg-black/90 text-white text-[10px] p-2 rounded shadow-lg pointer-events-none">
                      {typeof errorMessage === 'string' ? errorMessage : "Previous generation failed"}
                    </div>
                  )}
                  {isActive && <span>✓</span>}
                  {isUnauthorized && <span>🔒</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const DecisionMapSheet = React.memo(() => {
  const [openState, setOpenState] = useAtom(isDecisionMapOpenAtom);
  const turnGetter = useAtomValue(turnByIdAtom);
  const mappingProvider = useAtomValue(mappingProviderAtom);
  const setRefinerProvider = useSetAtom(refinerProviderAtom);
  const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);

  const [activeTab, setActiveTab] = useState<'graph' | 'narrative' | 'options' | 'audit'>('graph');
  const [selectedNode, setSelectedNode] = useState<{ id: string; label: string; supporters: (string | number)[]; theme?: string } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: window.innerWidth, h: 400 });
  const [activeRefinerPid, setActiveRefinerPid] = useState<string | null>(null);

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

  // If no refiner PID is active locally, try to find one from the turn data
  useEffect(() => {
    if (aiTurn && !activeRefinerPid) {
      const keys = Object.keys(aiTurn.refinerResponses || {});
      if (keys.length > 0) setActiveRefinerPid(keys[keys.length - 1]);
    }
  }, [aiTurn, activeRefinerPid]);

  const { output: refinerOutput, rawText: refinerRawText, providerId: currentRefinerPid } = useRefinerOutput(aiTurn?.id || null, activeRefinerPid);

  // Sync refiner selection
  useEffect(() => {
    if (currentRefinerPid && currentRefinerPid !== activeRefinerPid) {
      setActiveRefinerPid(currentRefinerPid);
    }
  }, [currentRefinerPid]);

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
    const fromMeta = latestMapping?.meta?.graphTopology || null;
    if (fromMeta) return fromMeta;
    const rawText = latestMapping?.text || null;
    return extractGraphTopologyFromText(rawText);
  }, [latestMapping]);

  const adapted = useMemo(() => adaptGraphTopology(graphTopology), [graphTopology]);

  const mappingText = useMemo(() => {
    const t = latestMapping?.text || '';
    const { mapping } = parseMappingResponse(String(t));
    return mapping;
  }, [latestMapping]);

  const optionsText = useMemo(() => {
    let fromMeta = latestMapping?.meta?.allAvailableOptions || null;
    if (fromMeta) {
      // Use shared cleanup function to strip any trailing GRAPH_TOPOLOGY
      return cleanOptionsText(fromMeta);
    }
    const t = latestMapping?.text || '';
    const { options } = parseMappingResponse(String(t));
    return options;
  }, [latestMapping]);

  const parsedThemes = useMemo(() => {
    const themes = parseOptionsIntoThemes(optionsText);

    // Merge in refiner-found unlisted options
    if (refinerOutput?.mapperAudit?.unlistedOptions?.length) {
      const refinerOptions = refinerOutput.mapperAudit.unlistedOptions.map(opt => ({
        title: opt.title,
        description: opt.description,
        citations: [opt.source]
      }));

      themes.push({
        name: "🔍 Found by Epistemic Audit",
        options: refinerOptions
      });
    }

    return themes;
  }, [optionsText, refinerOutput]);

  // Extract citation source order from mapping metadata for correct citation-to-model mapping
  const citationSourceOrder = useMemo(() => {
    const metaOrder = latestMapping?.meta?.citationSourceOrder || null;
    if (metaOrder && typeof metaOrder === 'object') {
      return metaOrder as Record<string | number, string>;
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

  const handleCitationClick = useCallback((modelNumber: number | string) => {
    try {
      // If it's a string, it's a direct provider ID from Refiner unlisted options
      if (typeof modelNumber === 'string') {
        setActiveSplitPanel({ turnId: aiTurn?.id || '', providerId: modelNumber });
        return;
      }

      const metaOrder = latestMapping?.meta?.citationSourceOrder || null;
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
    { key: 'audit' as const, label: 'Epistemic Audit', activeClass: 'decision-tab-active-audit' }
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

          {/* Header Row: Mapper Selector (Left) + Tabs (Center) */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 relative z-20">

            {/* Left: Provider Selector (Mapper or Refiner based on tab) */}
            <div className="w-1/3 flex justify-start">
              {aiTurn && activeTab !== 'audit' && (
                <MapperSelector
                  aiTurn={aiTurn}
                  activeProviderId={activeMappingPid}
                />
              )}
              {aiTurn && activeTab === 'audit' && (
                <RefinerSelector
                  aiTurn={aiTurn}
                  activeProviderId={activeRefinerPid || undefined}
                  onSelect={(pid) => {
                    setRefinerProvider(pid);
                    setActiveRefinerPid(pid);
                  }}
                />
              )}
            </div>

            {/* Center: Tabs */}
            <div className="flex items-center justify-center gap-4">
              {tabConfig.map(({ key, label, activeClass }) => {
                // Hide audit tab if no data (optional, but requested to always show)
                // if (key === 'audit' && !refinerOutput) return null;
                return (
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
                );
              })}
            </div>

            {/* Right: Spacer/Close (keeps tabs centered) */}
            <div className="w-1/3 flex justify-end items-center gap-2">
              <CopyButton
                text={formatDecisionMapForMd(
                  mappingText,
                  optionsText,
                  graphTopology
                )}
                label="Copy full decision map"
                buttonText="Copy Map"
                className="mr-2"
              />
              <button
                onClick={() => setOpenState(null)}
                className="p-2 text-text-muted hover:text-text-primary hover:bg-white/5 rounded-full transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
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
                  className="w-full h-full relative"
                >
                  {graphTopology && (
                    <div className="absolute top-4 right-4 z-50">
                      <CopyButton
                        text={formatGraphForMd(graphTopology)}
                        label="Copy graph as list"
                        variant="icon"
                      />
                    </div>
                  )}
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
                  className="p-6 h-full overflow-y-auto relative"
                >
                  {mappingText && (
                    <div className="absolute top-4 right-4 z-10">
                      <CopyButton
                        text={mappingText}
                        label="Copy narrative"
                        variant="icon"
                      />
                    </div>
                  )}
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
                  className="h-full overflow-y-auto relative"
                >
                  {optionsText && (
                    <div className="absolute top-4 right-4 z-10">
                      <CopyButton
                        text={optionsText}
                        label="Copy options"
                        variant="icon"
                      />
                    </div>
                  )}
                  <OptionsTab themes={parsedThemes} citationSourceOrder={citationSourceOrder} onCitationClick={handleCitationClick} />
                </motion.div>
              )}

              {activeTab === 'audit' && (
                <motion.div
                  key="audit"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full overflow-y-auto relative custom-scrollbar"
                >
                  {refinerOutput ? (
                    <RefinerEpistemicAudit output={refinerOutput!} rawText={refinerRawText} />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-text-muted text-sm gap-2 opacity-60">
                      <span>🔒</span>
                      <span>No epistemic audit available. Run Refiner to generate.</span>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

