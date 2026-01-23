import React, { useMemo, useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { isDecisionMapOpenAtom, turnByIdAtom, mappingProviderAtom, activeSplitPanelAtom, providerAuthStatusAtom, singularityProviderAtom } from "../state/atoms";
import { useClipActions } from "../hooks/useClipActions";
import { m, AnimatePresence, LazyMotion, domAnimation } from "framer-motion";
import { safeLazy } from "../utils/safeLazy";
const DecisionMapGraph = safeLazy(() => import("./DecisionMapGraph"));
import { adaptGraphTopology } from "../utils/graphAdapter";
import MarkdownDisplay from "./MarkdownDisplay";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import { getLatestResponse, normalizeResponseArray } from "../utils/turn-helpers";
import { getProviderColor, getProviderConfig } from "../utils/provider-helpers";
import type { AiTurn, ProviderResponse } from "../types";
import clsx from "clsx";
import { CopyButton } from "./CopyButton";
import { formatDecisionMapForMd, formatGraphForMd } from "../utils/copy-format-utils";

// ============================================================================
// PARSING UTILITIES - Import from shared module (single source of truth)
// ============================================================================

import {
  parseUnifiedMapperOutput,

} from "../../shared/parsing-utils";
import { computeProblemStructureFromArtifact, computeStructuralAnalysis } from "../../src/core/PromptMethods";
import type { StructuralAnalysis } from "../../shared/contract";
const StructuralDebugPanel = safeLazy(() => import("./debug/StructuralDebugPanel").then(m => ({ default: m.StructuralDebugPanel })));
const ConciergePipelinePanel = safeLazy(() => import("./debug/ConciergePipelinePanel").then(m => ({ default: m.ConciergePipelinePanel })));

import { normalizeProviderId } from "../utils/provider-id-mapper";

import { useSingularityOutput } from "../hooks/useSingularityOutput";

import { StructuralInsight } from "./StructuralInsight";

const DEBUG_DECISION_MAP_SHEET = false;
const decisionMapSheetDbg = (...args: any[]) => {
  if (DEBUG_DECISION_MAP_SHEET) console.debug("[DecisionMapSheet]", ...args);
};



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

/**
 * Build themes from claims - supports BOTH role-based AND type-based grouping
 * Role takes priority (anchor, challenger, supplement, branch) because it maps 
 * to structural significance, falling back to type for classification
 */
function buildThemesFromClaims(claims: any[]): ParsedTheme[] {
  if (!Array.isArray(claims) || claims.length === 0) return [];

  const themesByName = new Map<string, ParsedTheme>();

  const getThemeNameForClaim = (claim: any): string => {
    // First check for structural role (from peaks/hills analysis)
    const role = String(claim?.role || '').toLowerCase();
    if (role === 'anchor') return 'Anchors';
    if (role === 'challenger') return 'Challengers';
    if (role === 'supplement') return 'Supplements';
    if (role === 'branch') return 'Branches';

    // Fall back to claim type
    switch (claim.type) {
      case 'factual': return 'Facts';
      case 'prescriptive': return 'Recommendations';
      case 'conditional': return 'Conditions';
      case 'contested': return 'Contested';
      case 'speculative': return 'Possibilities';
      default: return 'Positions';
    }
  };

  for (const claim of claims) {
    if (!claim) continue;
    const themeName = getThemeNameForClaim(claim);
    if (!themesByName.has(themeName)) {
      themesByName.set(themeName, { name: themeName, options: [] });
    }
    const theme = themesByName.get(themeName)!;

    const rawId = claim.id != null ? String(claim.id) : '';
    const cleanId = rawId.replace(/^claim_?/i, "").trim();
    const formattedId = cleanId ? `#${cleanId}` : "";
    const rawLabel = typeof claim.label === 'string' ? claim.label : '';

    const titleParts: string[] = [];
    if (formattedId) titleParts.push(formattedId);
    if (rawLabel.trim()) titleParts.push(rawLabel.trim());
    const title = titleParts.length > 0 ? titleParts.join(' ') : 'Claim';

    const description = typeof claim.text === 'string' ? claim.text : '';
    const supporters = Array.isArray(claim.supporters) ? claim.supporters : [];

    theme.options.push({
      title,
      description,
      citations: supporters,
    });
  }

  return Array.from(themesByName.values());
}

/**
 * Parse raw options text into themes - RESTORED fallback parser
 * Handles:
 * - Emoji-prefixed themes: "📐 Architecture & Pipeline"
 * - "Theme:" prefix: "Theme: Defining the Interactive Role"
 * - Markdown headers as themes
 * - Bullet points with bold titles as options
 */
function parseOptionsIntoThemes(optionsText: string | null): ParsedTheme[] {
  if (!optionsText) return [];

  const lines = optionsText.split('\n');
  const themes: ParsedTheme[] = [];
  let currentTheme: ParsedTheme | null = null;

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

  const paragraphs = narrativeText.split(/\n\n+/);
  const matchingParagraphs: string[] = [];
  const labelLower = label.toLowerCase();

  for (const para of paragraphs) {
    if (para.toLowerCase().includes(labelLower)) {
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

function tryParseJsonObject(text: string): any | null {
  if (!text) return null;
  let t = String(text).trim();
  const codeBlockMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) t = codeBlockMatch[1].trim();
  const firstBrace = t.indexOf('{');
  const lastBrace = t.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    return JSON.parse(t.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
}

function normalizeGraphTopologyCandidate(value: any): any | null {
  if (!value) return null;
  let candidate: any = value;
  if (typeof candidate === 'string') {
    candidate = tryParseJsonObject(candidate);
  }
  if (!candidate || typeof candidate !== 'object') return null;
  if (Array.isArray(candidate.nodes) && Array.isArray(candidate.edges)) return candidate;
  if (candidate.topology && Array.isArray(candidate.topology.nodes) && Array.isArray(candidate.topology.edges)) return candidate.topology;
  if (candidate.graphTopology && Array.isArray(candidate.graphTopology.nodes) && Array.isArray(candidate.graphTopology.edges)) return candidate.graphTopology;
  return null;
}

// ============================================================================
// SUPPORTER ORBS COMPONENT
// ============================================================================

interface SupporterOrbsProps {
  supporters: (string | number)[];
  citationSourceOrder?: Record<string | number, string>;
  onOrbClick?: (providerId: string) => void;
  size?: 'small' | 'large';
}

const SupporterOrbs: React.FC<SupporterOrbsProps> = ({ supporters, citationSourceOrder, onOrbClick, size = 'large' }) => {
  const getProviderFromSupporter = (s: string | number) => {
    if ((typeof s === 'number' || !isNaN(Number(s))) && citationSourceOrder) {
      const num = Number(s);
      const providerId = citationSourceOrder[num];
      if (providerId) {
        return getProviderConfig(providerId) || null;
      }
    }
    if (typeof s === 'string' && isNaN(Number(s))) {
      return getProviderConfig(s) || null;
    }
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
        const color = getProviderColor(provider?.id || 'default');
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
  mapperAudit?: { complete: boolean; unlistedOptions: Array<{ title: string; description: string; source: string }>; };
}

const OptionsTab: React.FC<OptionsTabProps> = ({ themes, citationSourceOrder, onCitationClick, mapperAudit }) => {
  const [expandedThemes, setExpandedThemes] = useState<Set<number>>(new Set([0]));

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
      {mapperAudit && (
        <div className="mb-4 bg-surface rounded-lg border border-border-subtle p-3">
          {mapperAudit.complete ? (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <span>✓</span>
              <span>Mapper coverage complete — all approaches represented</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-amber-600 text-sm">
                <span>⚠</span>
                <span className="font-medium">{mapperAudit.unlistedOptions.length} unlisted options found</span>
              </div>
              {mapperAudit.unlistedOptions.length > 0 && (
                <ul className="text-xs text-text-secondary space-y-1 pl-4">
                  {mapperAudit.unlistedOptions.map((opt, idx) => (
                    <li key={idx}><strong>{opt.title}</strong>: {opt.description}{opt.source ? (<span className="text-text-muted"> — {opt.source}</span>) : null}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
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
                        onOrbClick={(providerId) => onCitationClick(providerId)}
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
  structural: any | null;
}

const DetailView: React.FC<DetailViewProps> = ({ node, narrativeExcerpt, citationSourceOrder, onBack, onOrbClick, structural }) => {
  const getNodeColor = () => {
    if (!node.supporters || node.supporters.length === 0) return '#8b5cf6';
    const first = node.supporters[0];
    let providerId: string | undefined;

    if ((typeof first === 'number' || !isNaN(Number(first))) && citationSourceOrder) {
      providerId = citationSourceOrder[Number(first)];
    } else if (typeof first === 'string' && isNaN(Number(first))) {
      providerId = first;
    }

    return getProviderColor(providerId || 'default');
  };

  const nodeColor = getNodeColor();

  const structuralInsights = React.useMemo(() => {
    if (!structural) return [];

    const insights: Array<{ type: any; metadata: any }> = [];

    const leverageInversion = structural.patterns.leverageInversions.find((inv: any) => inv.claimId === node.id);

    if (leverageInversion && leverageInversion.reason === "singular_foundation") {
      const cascade = structural.patterns.cascadeRisks.find((r: any) => r.sourceId === node.id);
      insights.push({
        type: "fragile_foundation",
        metadata: {
          dependentCount: leverageInversion.affectedClaims.length,
          dependentLabels: cascade?.dependentLabels || [],
        },
      });
    }

    const claimWithLeverage = structural.claimsWithLeverage.find((c: any) => c.id === node.id);
    if (claimWithLeverage && claimWithLeverage.leverage > 8) {
      const cascade = structural.patterns.cascadeRisks.find((r: any) => r.sourceId === node.id);
      if (cascade && cascade.dependentIds.length >= 3) {
        insights.push({
          type: "keystone",
          metadata: {
            dependentCount: cascade.dependentIds.length,
            dependentLabels: cascade.dependentLabels,
          },
        });
      }
    }

    const conflict = structural.patterns.conflicts.find(
      (c: any) =>
        (c.claimA.id === node.id || c.claimB.id === node.id) && c.isBothConsensus
    );
    if (conflict) {
      const otherClaim = conflict.claimA.id === node.id ? conflict.claimB : conflict.claimA;
      insights.push({
        type: "consensus_conflict",
        metadata: {
          conflictsWith: otherClaim.label,
        },
      });
    }

    if (leverageInversion && leverageInversion.reason === "high_connectivity_low_support") {
      insights.push({
        type: "high_leverage_singular",
        metadata: {
          leverageScore: claimWithLeverage?.leverage,
        },
      });
    }

    const cascade = structural.patterns.cascadeRisks.find((r: any) => r.sourceId === node.id);
    if (cascade && cascade.depth >= 3) {
      insights.push({
        type: "cascade_risk",
        metadata: {
          dependentCount: cascade.dependentIds.length,
          cascadeDepth: cascade.depth,
          dependentLabels: cascade.dependentLabels,
        },
      });
    }

    if (claimWithLeverage && claimWithLeverage.isEvidenceGap) {
      const gapCascade = structural.patterns.cascadeRisks.find((r: any) => r.sourceId === node.id);
      insights.push({
        type: "evidence_gap",
        metadata: {
          gapScore: claimWithLeverage.evidenceGapScore,
          dependentCount: gapCascade?.dependentIds.length || 0,
          dependentLabels: gapCascade?.dependentLabels || [],
        },
      });
    }

    if (claimWithLeverage && claimWithLeverage.isOutlier) {
      insights.push({
        type: "support_outlier",
        metadata: {
          skew: claimWithLeverage.supportSkew,
          supporterCount: node.supporters.length,
        },
      });
    }

    return insights;
  }, [node.id, node.supporters.length, structural]);

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="h-full flex flex-col p-6 overflow-y-auto"
    >
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

      <div className="flex flex-col items-center mb-8">
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

      <div className="mb-8">
        <h3 className="text-sm font-medium text-text-muted mb-3">Supported by</h3>
        <SupporterOrbs
          supporters={node.supporters || []}
          citationSourceOrder={citationSourceOrder}
          onOrbClick={onOrbClick}
          size="large"
        />
      </div>

      {structuralInsights.length > 0 && (
        <div className="mb-8 space-y-3">
          <h3 className="text-sm font-medium text-text-muted mb-3">Structural Analysis</h3>
          {structuralInsights.map((insight, idx) => (
            <StructuralInsight
              key={idx}
              type={insight.type}
              claim={node}
              metadata={insight.metadata}
            />
          ))}
        </div>
      )}

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
    </m.div>
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

  const activeProvider = activeProviderId ? getProviderConfig(activeProviderId) : null;
  const providers = useMemo(() => LLM_PROVIDERS_CONFIG.filter(p => p.id !== 'system'), []);

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
              const isUnauthorized = authStatus && authStatus[pid] === false;
              const isDisabled = isUnauthorized;

              return (
                <button key={pid} onClick={() => { if (!isDisabled) { handleClipClick(aiTurn.id, "mapping", pid); setIsOpen(false); } }} disabled={isDisabled} className={clsx("w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors", pid === activeProviderId ? "bg-brand-500/10 text-brand-500" : "hover:bg-surface-highlight text-text-secondary", isDisabled && "opacity-60 cursor-not-allowed")}>
                  <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: getProviderColor(pid) }} />
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

const SingularitySelector: React.FC<{ aiTurn: AiTurn, activeProviderId?: string, onSelect: (pid: string) => void }> = ({ aiTurn, activeProviderId, onSelect }) => {
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

  const activeProvider = activeProviderId ? getProviderConfig(activeProviderId) : null;
  const providers = useMemo(() => LLM_PROVIDERS_CONFIG.filter(p => p.id !== 'system'), []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-sm font-medium text-text-primary"
      >
        <span className="text-base">🕳️</span>
        <span className="opacity-70 text-xs uppercase tracking-wide">Concierge</span>
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
              const latestResp = getLatestResponse(aiTurn.singularityResponses?.[pid]);
              const hasError = latestResp?.status === 'error';
              const errorMessage = hasError ? (latestResp?.meta?._rawError || "Failed") : null;
              const isDisabled = isUnauthorized;

              return (
                <button
                  key={pid}
                  onClick={() => { if (!isDisabled) { onSelect(pid); handleClipClick(aiTurn.id, "singularity", pid); setIsOpen(false); } }}
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
                    style={{ backgroundColor: getProviderColor(pid) }}
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
  const singularityProvider = useAtomValue(singularityProviderAtom);
  const setSingularityProvider = useSetAtom(singularityProviderAtom);
  const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);

  const [activeTab, setActiveTab] = useState<'graph' | 'narrative' | 'options' | 'pipeline' | 'debug' | 'concierge'>('graph');
  const [selectedNode, setSelectedNode] = useState<{ id: string; label: string; supporters: (string | number)[]; theme?: string } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: window.innerWidth, h: 400 });
  const activeSingularityPid = singularityProvider;
  const [sheetHeightRatio, setSheetHeightRatio] = useState(0.5);
  const [structuralAnalysis, setStructuralAnalysis] = useState<StructuralAnalysis | null>(null);
  const [structuralTurnId, setStructuralTurnId] = useState<string | null>(null);
  const [structuralLoading, setStructuralLoading] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<string>('pipeline_shadow_extraction');
  const resizeRef = useRef<{ active: boolean; startY: number; startRatio: number; moved: boolean }>({
    active: false,
    startY: 0,
    startRatio: 0.5,
    moved: false,
  });

  useEffect(() => {
    if (openState) {
      setActiveTab(openState.tab || 'graph');
      setSelectedNode(null);
      setSheetHeightRatio(0.5);
      setPipelineStage('pipeline_shadow_extraction');
    }
  }, [openState?.turnId, openState?.tab]);

  useEffect(() => {
    if (!openState?.turnId) {
      setStructuralAnalysis(null);
      setStructuralTurnId(null);
      setStructuralLoading(false);
      return;
    }
    if (structuralTurnId && structuralTurnId !== openState.turnId) {
      setStructuralAnalysis(null);
      setStructuralTurnId(null);
      setStructuralLoading(false);
    }
  }, [openState?.turnId, structuralTurnId]);

  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const min = 0.25;
    const max = 0.9;
    resizeRef.current = { active: true, startY: e.clientY, startRatio: sheetHeightRatio, moved: false };

    const onMove = (ev: PointerEvent) => {
      if (!resizeRef.current.active) return;
      const delta = resizeRef.current.startY - ev.clientY;
      if (Math.abs(delta) > 4) resizeRef.current.moved = true;
      const next = resizeRef.current.startRatio + delta / Math.max(1, window.innerHeight);
      const clamped = Math.min(max, Math.max(min, next));
      setSheetHeightRatio(clamped);
    };

    const onUp = () => {
      const moved = resizeRef.current.moved;
      resizeRef.current.active = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!moved) setOpenState(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [setOpenState, sheetHeightRatio]);

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (el) {
        setDims({ w: el.clientWidth, h: el.clientHeight });
      } else {
        setDims({ w: window.innerWidth, h: Math.floor(window.innerHeight * sheetHeightRatio) - 100 });
      }
    };

    update();
    const raf = requestAnimationFrame(update);
    const timeout = setTimeout(update, 350);

    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [openState, sheetHeightRatio]);

  const aiTurn: AiTurn | null = useMemo(() => {
    const tid = openState?.turnId;
    const t = tid ? turnGetter(tid) : undefined;
    return t && (t as any).type === 'ai' ? (t as AiTurn) : null;
  }, [openState, turnGetter]);

  const singularityState = useSingularityOutput(aiTurn?.id || null);

  const userMessage = useMemo(() => {
    if (!aiTurn?.userTurnId) return null;
    const t = turnGetter(aiTurn.userTurnId);
    if (!t || (t as any).type !== 'user') return null;
    return (t as any).text || "";
  }, [aiTurn?.userTurnId, turnGetter]);

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
    const availableKeys = Object.keys(aiTurn.mappingResponses || {});
    const hasData = (pid: string | undefined) => {
      if (!pid) return false;
      return (mappingResponses[pid]?.length || 0) > 0;
    };

    if (mappingProvider && hasData(mappingProvider)) return mappingProvider;
    if (aiTurn.meta?.mapper && hasData(aiTurn.meta.mapper)) return aiTurn.meta.mapper;

    const firstWithData = availableKeys.find((k) => hasData(k));
    if (firstWithData) return firstWithData;
    return availableKeys.length > 0 ? availableKeys[0] : undefined;
  }, [aiTurn, mappingProvider, mappingResponses]);

  const latestMapping = useMemo(() => {
    if (!activeMappingPid) return undefined;
    return getLatestResponse(mappingResponses[activeMappingPid]);
  }, [activeMappingPid, mappingResponses]);

  const parsedMapping = useMemo(() => {
    const fromMeta = String((latestMapping?.meta as any)?.rawMappingText || '');
    const fromText = String(latestMapping?.text || '');
    const rawText =
      fromMeta && fromMeta.length >= fromText.length ? fromMeta : fromText;
    return parseUnifiedMapperOutput(String(rawText));
  }, [latestMapping]);

  const rawMappingText = useMemo(() => {
    const fromMeta = String((latestMapping?.meta as any)?.rawMappingText || '');
    const fromText = String(latestMapping?.text || '');
    return fromMeta && fromMeta.length >= fromText.length ? fromMeta : fromText;
  }, [latestMapping]);

  const semanticMapperPrompt = useMemo(() => {
    const v = (latestMapping?.meta as any)?.semanticMapperPrompt;
    return typeof v === 'string' && v.trim() ? v : null;
  }, [latestMapping]);

  const graphTopology = useMemo(() => {
    const meta: any = latestMapping?.meta || null;
    const fromMeta =
      normalizeGraphTopologyCandidate(meta?.graphTopology) ||
      normalizeGraphTopologyCandidate(meta?.graph_topology) ||
      normalizeGraphTopologyCandidate(meta?.topology) ||
      null;
    const fromParsed = normalizeGraphTopologyCandidate(parsedMapping.topology) || null;
    const picked = fromMeta || fromParsed || null;
    decisionMapSheetDbg("graphTopology source", {
      fromMeta: Boolean(fromMeta),
      fromParsed: Boolean(fromParsed),
      nodes: picked ? (picked as any)?.nodes?.length : 0,
      edges: picked ? (picked as any)?.edges?.length : 0,
    });
    return picked;
  }, [latestMapping, parsedMapping.topology]);

  const graphData = useMemo(() => {
    const claimsFromMap = Array.isArray(parsedMapping.map?.claims) ? parsedMapping.map!.claims : null;
    const edgesFromMap = Array.isArray(parsedMapping.map?.edges) ? parsedMapping.map!.edges : null;

    const claims = claimsFromMap || (Array.isArray(parsedMapping.claims) ? parsedMapping.claims : []);
    const edges = edgesFromMap || (Array.isArray(parsedMapping.edges) ? parsedMapping.edges : []);

    if (claims.length > 0 || edges.length > 0) {
      decisionMapSheetDbg("graphData source", {
        source: claimsFromMap || edgesFromMap ? "map" : "parsed",
        claims: claims.length,
        edges: edges.length,
      });
      return { claims, edges };
    }

    decisionMapSheetDbg("graphData source", {
      source: "topology",
      claims: 0,
      edges: 0,
    });
    return adaptGraphTopology(graphTopology);
  }, [parsedMapping, graphTopology]);

  const artifactForStructure = useMemo(() => {
    const artifact =
      (aiTurn as any)?.mapperArtifact ||
      (parsedMapping as any)?.artifact ||
      (graphData.claims.length > 0 || graphData.edges.length > 0
        ? {
          claims: graphData.claims,
          edges: graphData.edges,
          ghosts: Array.isArray((parsedMapping as any)?.ghosts) ? (parsedMapping as any).ghosts : null,
          query: (latestMapping as any)?.meta?.query || null,
        }
        : null);

    if (!artifact || !Array.isArray((artifact as any).claims) || (artifact as any).claims.length === 0) return null;
    return artifact;
  }, [aiTurn, parsedMapping, graphData, latestMapping]);

  useEffect(() => {
    if (activeTab !== 'debug' && activeTab !== 'concierge') return;
    if (!artifactForStructure || !openState?.turnId) return;
    if (structuralTurnId === openState.turnId && structuralAnalysis) return;
    let cancelled = false;
    setStructuralLoading(true);

    // Defer heavy computation to next tick
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      try {
        const analysis = computeStructuralAnalysis(artifactForStructure as any);
        if (!cancelled) {
          setStructuralAnalysis(analysis);
          setStructuralTurnId(openState.turnId);
        }
      } catch (e) {
        console.warn("[DecisionMapSheet] structuralAnalysis compute failed", e);
        if (!cancelled) {
          setStructuralAnalysis(null);
          setStructuralTurnId(openState.turnId);
        }
      } finally {
        if (!cancelled) {
          setStructuralLoading(false);
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };

  }, [activeTab, artifactForStructure, openState?.turnId, structuralTurnId, structuralAnalysis]);

  const problemStructure = useMemo(() => {
    if (!artifactForStructure) return null;
    try {
      const structure = computeProblemStructureFromArtifact(artifactForStructure as any);
      decisionMapSheetDbg("problemStructure", structure);
      return structure;
    } catch (e) {
      console.warn("[DecisionMapSheet] problemStructure compute failed", e);
      return null;
    }
  }, [artifactForStructure]);

  const claimThemes = useMemo(() => {
    if (!artifactForStructure || !Array.isArray((artifactForStructure as any).claims)) return [];
    return buildThemesFromClaims((artifactForStructure as any).claims);
  }, [artifactForStructure]);

  const mappingText = useMemo(() => {
    return parsedMapping.narrative || '';
  }, [parsedMapping.narrative]);

  const optionsText = useMemo(() => {
    const meta: any = latestMapping?.meta || null;
    let fromMeta = meta?.allAvailableOptions || meta?.all_available_options || meta?.options || null;
    if (fromMeta) {
      return fromMeta;
    }
    return parsedMapping.options ?? null;
  }, [latestMapping, parsedMapping.options]);

  // Options now built directly from claims - no separate parsing needed, but fallback to text parsing if needed
  const parsedThemes = useMemo(() => {
    if (claimThemes.length > 0) return claimThemes;
    return parseOptionsIntoThemes(optionsText);
  }, [claimThemes, optionsText]);

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
      let providerId: string | undefined;
      const metaOrder = latestMapping?.meta?.citationSourceOrder || null;

      const isNumeric = typeof modelNumber === 'number' || (!isNaN(parseInt(modelNumber, 10)) && /^\d+$/.test(modelNumber));

      if (isNumeric) {
        const num = typeof modelNumber === 'number' ? modelNumber : parseInt(modelNumber, 10);
        if (metaOrder && typeof metaOrder === 'object') {
          providerId = (metaOrder as any)[num];
        }
        if (!providerId && aiTurn) {
          const activeOrdered = LLM_PROVIDERS_CONFIG.map((p) => String(p.id)).filter((pid) => !!(aiTurn.batchResponses || {})[pid]);
          providerId = activeOrdered[num - 1];
        }
      } else if (typeof modelNumber === 'string') {
        providerId = normalizeProviderId(modelNumber.toLowerCase());
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
      theme: node.type || node.theme
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
        <a href={href} {...props} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300 underline decoration-brand-400/30 hover:decoration-brand-400 transition-colors">
          {children}
        </a>
      );
    },
  }), [handleCitationClick]);

  const transformCitations = useCallback((text: string) => {
    if (!text) return "";
    let t = text;
    t = t.replace(/\[\[CITE:(\d+)\]\]/gi, "[↗$1](#cite-$1)");
    t = t.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/gi, (_m, grp) => {
      const items = String(grp)
        .split(/\s*,\s*/)
        .map((n) => n.trim())
        .filter(Boolean);
      return " " + items.map((n) => `[↗${n}](#cite-${n})`).join(" ") + " ";
    });
    return t;
  }, []);

  const resolvedPipelineArtifacts = useMemo(() => {
    const fromTurn = (aiTurn as any)?.pipelineArtifacts || null;
    const fromMeta = (latestMapping?.meta as any)?.pipelineArtifacts || null;
    return fromTurn || fromMeta || null;
  }, [aiTurn, latestMapping?.meta]);

  const pipelineStages = useMemo(() => {
    const mapperArtifact =
      (aiTurn as any)?.mapperArtifact ||
      (parsedMapping as any)?.artifact ||
      (graphData.claims.length > 0 || graphData.edges.length > 0
        ? {
          claims: graphData.claims,
          edges: graphData.edges,
          ghosts: Array.isArray((parsedMapping as any)?.ghosts) ? (parsedMapping as any).ghosts : null,
          query: (latestMapping as any)?.meta?.query || null,
        }
        : null);

    const singularityOutput = (aiTurn as any)?.singularityOutput || singularityState.output || null;

    const hasValue = (value: any, kind: 'json' | 'text') => {
      if (value == null) return false;
      if (kind === 'text') return String(value).trim().length > 0;
      return true;
    };

    const p = resolvedPipelineArtifacts as any;

    return [
      { key: 'pipeline_shadow_extraction', label: 'Shadow Extraction', kind: 'json' as const, value: p?.shadow?.extraction ?? null, group: 'Shadow', disabled: !hasValue(p?.shadow?.extraction, 'json') },
      { key: 'pipeline_shadow_delta', label: 'Shadow Delta', kind: 'json' as const, value: p?.shadow?.delta ?? null, group: 'Shadow', disabled: !hasValue(p?.shadow?.delta, 'json') },
      { key: 'pipeline_shadow_top_unreferenced', label: 'Top Unreferenced', kind: 'json' as const, value: p?.shadow?.topUnreferenced ?? null, group: 'Shadow', disabled: !hasValue(p?.shadow?.topUnreferenced, 'json') },
      { key: 'pipeline_shadow_referenced_ids', label: 'Referenced IDs', kind: 'json' as const, value: p?.shadow?.referencedIds ?? null, group: 'Shadow', disabled: !hasValue(p?.shadow?.referencedIds, 'json') },

      { key: 'pipeline_paragraph_projection', label: 'Paragraph Projection', kind: 'json' as const, value: p?.paragraphProjection ?? null, group: 'Projection', disabled: !hasValue(p?.paragraphProjection, 'json') },

      { key: 'pipeline_clustering_result', label: 'Clustering Result', kind: 'json' as const, value: p?.clustering?.result ?? null, group: 'Clustering', disabled: !hasValue(p?.clustering?.result, 'json') },
      { key: 'pipeline_clustering_summary', label: 'Clustering Summary', kind: 'json' as const, value: p?.clustering?.summary ?? null, group: 'Clustering', disabled: !hasValue(p?.clustering?.summary, 'json') },

      { key: 'pipeline_substrate_summary', label: 'Substrate Summary', kind: 'json' as const, value: p?.substrate?.summary ?? null, group: 'Substrate', disabled: !hasValue(p?.substrate?.summary, 'json') },
      { key: 'pipeline_substrate_degeneracy', label: 'Substrate Degeneracy', kind: 'json' as const, value: p?.substrate ?? null, group: 'Substrate', disabled: !hasValue(p?.substrate, 'json') },

      { key: 'pipeline_presemantic', label: 'Pre-Semantic Interpretation', kind: 'json' as const, value: p?.preSemantic ?? null, group: 'Interpretation', disabled: !hasValue(p?.preSemantic, 'json') },
      { key: 'pipeline_validation', label: 'Structural Validation', kind: 'json' as const, value: p?.validation ?? null, group: 'Validation', disabled: !hasValue(p?.validation, 'json') },

      { key: 'pipeline_semantic_mapper_prompt', label: 'Semantic Mapper Prompt', kind: 'text' as const, value: p?.prompts?.semanticMapperPrompt || semanticMapperPrompt || '', group: 'Prompts', disabled: !hasValue(p?.prompts?.semanticMapperPrompt || semanticMapperPrompt || '', 'text') },
      { key: 'pipeline_raw_mapping_text', label: 'Raw Mapping Text', kind: 'text' as const, value: p?.prompts?.rawMappingText || rawMappingText || '', group: 'Prompts', disabled: !hasValue(p?.prompts?.rawMappingText || rawMappingText || '', 'text') },

      { key: 'mapper_artifact', label: 'Mapper Artifact', kind: 'json' as const, value: mapperArtifact, group: 'Mapper', disabled: !hasValue(mapperArtifact, 'json') },
      { key: 'traversal_graph', label: 'Traversal Graph', kind: 'json' as const, value: (mapperArtifact as any)?.traversalGraph || null, group: 'Mapper', disabled: !hasValue((mapperArtifact as any)?.traversalGraph || null, 'json') },
      { key: 'forcing_points', label: 'Forcing Points', kind: 'json' as const, value: (mapperArtifact as any)?.forcingPoints || null, group: 'Mapper', disabled: !hasValue((mapperArtifact as any)?.forcingPoints || null, 'json') },

      { key: 'singularity_output', label: 'Singularity Output', kind: 'json' as const, value: singularityOutput, group: 'Singularity', disabled: !hasValue(singularityOutput, 'json') },
      { key: 'singularity_pipeline', label: 'Singularity Pipeline', kind: 'json' as const, value: (singularityOutput as any)?.pipeline || null, group: 'Singularity', disabled: !hasValue((singularityOutput as any)?.pipeline || null, 'json') },
    ];
  }, [aiTurn, parsedMapping, graphData, latestMapping, singularityState.output, semanticMapperPrompt, rawMappingText, resolvedPipelineArtifacts]);

  const pipelineStageGroups = useMemo(() => {
    const groups: Array<{ label: string; stages: typeof pipelineStages }> = [];
    const order = ['Shadow', 'Projection', 'Clustering', 'Substrate', 'Interpretation', 'Validation', 'Prompts', 'Mapper', 'Singularity'];
    order.forEach((label) => {
      const stages = pipelineStages.filter((s: any) => s.group === label);
      if (stages.length > 0) groups.push({ label, stages } as any);
    });
    return groups;
  }, [pipelineStages]);

  const activePipelineStage = useMemo(() => {
    return pipelineStages.find((s) => s.key === pipelineStage) || pipelineStages[0];
  }, [pipelineStages, pipelineStage]);

  const pipelineStageText = useMemo(() => {
    const stage = activePipelineStage;
    if (!stage) return '';
    if (stage.kind === 'text') return String(stage.value || '');
    try {
      if (stage.value == null) return '';
      return JSON.stringify(stage.value, null, 2);
    } catch {
      return String(stage.value || '');
    }
  }, [activePipelineStage]);

  const tabConfig = [
    { key: 'graph' as const, label: 'Graph', activeClass: 'decision-tab-active-graph' },
    { key: 'narrative' as const, label: 'Narrative', activeClass: 'decision-tab-active-narrative' },
    { key: 'options' as const, label: 'Options', activeClass: 'decision-tab-active-options' },
    { key: 'pipeline' as const, label: 'Pipeline Artifacts', activeClass: 'decision-tab-active-options' },
    { key: 'debug' as const, label: '🔬 Structural Analysis Debug', activeClass: 'decision-tab-active-options' },
    { key: 'concierge' as const, label: 'Concierge Pipeline', activeClass: 'decision-tab-active-singularity' }
  ];

  const sheetHeightPx = Math.max(260, Math.round(window.innerHeight * sheetHeightRatio));

  return (
    <AnimatePresence>
      {openState && (
        <LazyMotion features={domAnimation}>
          <m.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 decision-sheet-bg border-t border-border-strong shadow-elevated z-[3500] rounded-t-2xl flex flex-col pointer-events-auto"
            style={{ height: sheetHeightPx }}
          >
            {/* Drag handle */}
            <div className="h-8 flex items-center justify-center border-b border-white/10 hover:bg-white/5 transition-colors rounded-t-2xl relative z-10">
              <div className="flex-1 h-full cursor-ns-resize" onPointerDown={handleResizePointerDown} />
              <button type="button" className="h-full px-6 cursor-pointer flex items-center justify-center" onClick={() => setOpenState(null)}>
                <div className="w-12 h-1.5 bg-white/20 rounded-full" />
              </button>
              <div className="flex-1 h-full cursor-ns-resize" onPointerDown={handleResizePointerDown} />
            </div>

            {/* Header Row: Mapper Selector (Left) + Tabs (Center) */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 relative z-20">

              {/* Left: Provider Selector (Mapper or Refiner based on tab) */}
              <div className="w-1/3 flex justify-start">
                {aiTurn && activeTab !== 'concierge' && (
                  <MapperSelector
                    aiTurn={aiTurn}
                    activeProviderId={activeMappingPid}
                  />
                )}
                {aiTurn && activeTab === 'concierge' && (
                  <SingularitySelector
                    aiTurn={aiTurn}
                    activeProviderId={activeSingularityPid || undefined}
                    onSelect={(pid) => setSingularityProvider(pid as any)}
                  />
                )}
              </div>

              {/* Center: Tabs */}
              <div className="flex items-center justify-center gap-4">
                {tabConfig.map(({ key, label, activeClass }) => {
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
                    graphData.claims,
                    graphData.edges,
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
                  <m.div
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
                    {problemStructure && (
                      <div className="absolute top-4 left-4 z-50 px-3 py-1.5 rounded-full bg-black/70 border border-white/10 text-xs font-medium text-white/90">
                        <span className="opacity-60 mr-2">Structure:</span>
                        <span className="capitalize">{problemStructure.primary}</span>
                        {/* Show secondary patterns count if any */}
                        {(problemStructure.patterns?.length ?? 0) > 0 && (
                          <span className="ml-2 text-purple-400">
                            +{problemStructure.patterns.length}
                          </span>
                        )}
                        {problemStructure.confidence < 0.7 && (
                          <span className="ml-2 text-amber-400">(?)</span>
                        )}
                      </div>
                    )}
                    <Suspense fallback={<div className="w-full h-full flex items-center justify-center opacity-50"><div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" /></div>}>
                      <DecisionMapGraph
                        claims={graphData.claims}
                        edges={graphData.edges}
                        problemStructure={problemStructure || undefined}
                        citationSourceOrder={citationSourceOrder}
                        width={dims.w}
                        height={dims.h}
                        onNodeClick={handleNodeClick}
                      />
                    </Suspense>
                  </m.div>
                )}

                {activeTab === 'graph' && selectedNode && (
                  <m.div
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
                      structural={structuralAnalysis}
                    />
                  </m.div>
                )}

                {activeTab === 'narrative' && (
                  <m.div
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
                  </m.div>
                )}

                {activeTab === 'options' && (
                  <m.div
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
                    <div className="px-6 pb-6 pt-2">
                      <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Graph topology</div>
                      {graphTopology ? (
                        <div className="bg-surface border border-border-subtle rounded-xl p-4">
                          <MarkdownDisplay content={formatGraphForMd(graphTopology)} />
                        </div>
                      ) : (
                        <div className="text-text-muted text-sm">No graph topology available.</div>
                      )}
                    </div>
                  </m.div>
                )}

                {activeTab === 'pipeline' && (
                  <m.div
                    key="pipeline"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full overflow-y-auto relative custom-scrollbar p-6"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🧪</span>
                        <div>
                          <div className="text-sm font-semibold">Pipeline Artifacts</div>
                          <div className="text-xs text-text-muted">Raw JSON/text captured for this turn</div>
                        </div>
                      </div>
                      <CopyButton
                        text={pipelineStageText}
                        label="Copy artifact"
                        buttonText="Copy"
                        className="mr-1"
                      />
                    </div>

                    <div className="space-y-4 mb-4">
                      {pipelineStageGroups.map((group) => (
                        <div key={group.label}>
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                            {group.label}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {group.stages.map((s: any) => (
                              <button
                                key={s.key}
                                type="button"
                                disabled={!!s.disabled}
                                onClick={() => setPipelineStage(s.key)}
                                className={clsx(
                                  "px-3 py-1.5 rounded-full border text-xs transition-colors",
                                  s.disabled
                                    ? "opacity-40 cursor-not-allowed bg-transparent border-white/10 text-text-muted"
                                    : pipelineStage === s.key
                                      ? "bg-white/10 border-white/20 text-text-primary"
                                      : "bg-transparent border-white/10 text-text-muted hover:bg-white/5 hover:text-text-primary"
                                )}
                              >
                                {s.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-surface border border-border-subtle rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                          {activePipelineStage?.label || 'Artifact'}
                        </div>
                        <div className="text-[11px] text-text-muted font-mono">
                          {pipelineStageText ? `${pipelineStageText.length.toLocaleString()} chars` : '—'}
                        </div>
                      </div>
                      {pipelineStageText ? (
                        <pre className="text-[11px] leading-snug overflow-x-auto whitespace-pre-wrap">
                          {pipelineStageText}
                        </pre>
                      ) : (
                        <div className="text-text-muted text-sm">No artifact captured for this stage.</div>
                      )}
                    </div>
                  </m.div>
                )}

                {activeTab === 'debug' && (
                  <m.div
                    key="debug"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full"
                  >
                    {structuralLoading || !structuralAnalysis ? (
                      <div className="w-full h-full flex items-center justify-center opacity-70 text-xs text-text-muted">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                          <div>Computing structural analysis for this turn…</div>
                        </div>
                      </div>
                    ) : (
                      <Suspense fallback={<div className="w-full h-full flex items-center justify-center opacity-50"><div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" /></div>}>
                        <StructuralDebugPanel analysis={structuralAnalysis} semanticMapperPrompt={semanticMapperPrompt} rawMappingText={rawMappingText} />
                      </Suspense>
                    )}
                  </m.div>
                )}

                {activeTab === 'concierge' && (
                  <m.div
                    key="concierge"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full"
                  >
                    <Suspense fallback={<div className="w-full h-full flex items-center justify-center opacity-50"><div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" /></div>}>
                      <ConciergePipelinePanel
                        state={singularityState}
                        analysis={structuralAnalysis || null}
                        userMessage={userMessage}
                      />
                    </Suspense>
                  </m.div>
                )}
              </AnimatePresence>
            </div>
          </m.div>
        </LazyMotion>
      )}
    </AnimatePresence>
  );
});
