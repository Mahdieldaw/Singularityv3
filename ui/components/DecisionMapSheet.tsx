import React, { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { isDecisionMapOpenAtom, turnByIdAtom, mappingProviderAtom, activeSplitPanelAtom } from "../state/atoms";
import { motion, AnimatePresence } from "framer-motion";
import DecisionMapGraph from "./experimental/DecisionMapGraph";
import { adaptGraphTopology } from "./experimental/graphAdapter";
import MarkdownDisplay from "./MarkdownDisplay";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import { getLatestResponse, normalizeResponseArray } from "../utils/turn-helpers";
import type { AiTurn, ProviderResponse } from "../types";
import clsx from "clsx";

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
    { re: /\n={3,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={3,}\n/i, minPosition: 0 },
    { re: /\n[=\-─━═＝]{3,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*[=\-─━═＝]{3,}\n/i, minPosition: 0 },
    { re: /\n\*{0,2}={3,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={3,}\*{0,2}\n/i, minPosition: 0 },
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
    const listPreview = afterDelimiter.slice(0, 100);
    const hasListStructure = /^\s*[-*•]\s+|\n\s*[-*•]\s+|^\s*\d+\.\s+|\n\s*\d+\.\s+/.test(listPreview);
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

export const DecisionMapSheet = React.memo(() => {
  const [openState, setOpenState] = useAtom(isDecisionMapOpenAtom);
  const turnGetter = useAtomValue(turnByIdAtom);
  const mappingProvider = useAtomValue(mappingProviderAtom);
  const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);

  const [activeTab, setActiveTab] = useState<'graph' | 'narrative' | 'options'>('graph');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 800, h: 400 });

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      setDims({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    const onResize = () => update();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
    const t = latestMapping?.text || '';
    const { options } = parseMappingResponse(String(t));
    return options;
  }, [latestMapping]);

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
    } catch {}
  }, [latestMapping, aiTurn, setActiveSplitPanel]);

  const markdownComponents = useMemo(() => ({
    a: ({ href, children, ...props }: any) => {
      if (href && href.startsWith("#cite-")) {
        const idStr = href.replace("#cite-", "");
        const num = parseInt(idStr, 10);
        return (
          <button
            type="button"
            className="inline-flex items-center gap-1 px-1.5 mx-0.5 bg-chip-active border border-border-brand rounded-pill text-text-primary text-sm font-bold leading-snug cursor-pointer no-underline"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCitationClick(num);
            }}
            title={`View Source ${idStr}`}
          >
            {children}
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
    t = t.replace(/\[\[CITE:(\d+)\]\]/g, "[↗$1](#cite-$1)");
    t = t.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, (_m, grp) => {
      const nums = String(grp)
        .split(/\s*,\s*/)
        .map((n) => n.trim())
        .filter(Boolean);
      return " " + nums.map((n) => `[↗${n}](#cite-${n})`).join(" ") + " ";
    });
    return t;
  }, []);

  return (
    <AnimatePresence>
      {openState && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed inset-x-0 bottom-0 h-[70vh] bg-surface-raised border-t border-border-strong shadow-elevated z-[2000] rounded-t-2xl flex flex-col"
        >
          <div
            className="h-8 flex items-center justify-center cursor-grab active:cursor-grabbing border-b border-border-subtle hover:bg-surface-highlight transition-colors rounded-t-2xl"
            onClick={() => setOpenState(null)}
          >
            <div className="w-12 h-1.5 bg-border-subtle rounded-full" />
          </div>

          <div className="flex items-center gap-2 px-4 py-2 border-b border-border-subtle">
            {[
              { key: 'graph', label: 'Graph' },
              { key: 'narrative', label: 'Narrative' },
              { key: 'options', label: 'All Available Options' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={clsx(
                  "text-xs px-3 py-1.5 rounded-full border transition-all",
                  activeTab === (key as any)
                    ? "bg-chip-active border-brand-300 text-text-primary"
                    : "bg-surface-highest border-border-subtle text-text-secondary hover:bg-surface-highlight"
                )}
                onClick={() => setActiveTab(key as any)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden relative">
            {activeTab === 'graph' && (
              <div ref={containerRef} className="w-full h-full">
                <DecisionMapGraph nodes={adapted.nodes} edges={adapted.edges} width={dims.w} height={dims.h} />
              </div>
            )}

            {activeTab === 'narrative' && (
              <div className="p-4 h-full overflow-y-auto">
                {mappingText ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert leading-7 text-sm">
                    <MarkdownDisplay content={transformCitations(mappingText)} components={markdownComponents} />
                  </div>
                ) : (
                  <div className="text-text-muted text-sm">No narrative available.</div>
                )}
              </div>
            )}

            {activeTab === 'options' && (
              <div className="p-4 h-full overflow-y-auto">
                {optionsText ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert leading-7 text-sm">
                    <MarkdownDisplay content={optionsText} />
                  </div>
                ) : (
                  <div className="text-text-muted text-sm">No options available.</div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
