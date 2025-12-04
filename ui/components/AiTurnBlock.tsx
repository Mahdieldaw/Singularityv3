// ui/components/AiTurnBlock.tsx - FIXED ALIGNMENT
import React, {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { useSetAtom, useAtomValue } from "jotai";
import { toastAtom, activeSplitPanelAtom, isDecisionMapOpenAtom } from "../state/atoms";
import { AiTurn, ProviderResponse, AppStep } from "../types";
import MarkdownDisplay from "./MarkdownDisplay";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import ClipsCarousel from "./ClipsCarousel";
import { ChevronDownIcon, ChevronUpIcon, ListIcon } from "./Icons";
import { CouncilOrbs } from "./CouncilOrbs";
import { adaptGraphTopology } from "./experimental/graphAdapter";
import { GraphTopology } from "../types";
import {
  normalizeResponseArray,
  getLatestResponse,
} from "../utils/turn-helpers";
import clsx from "clsx";

// --- Helper Functions ---
function parseMappingResponse(response?: string | null) {
  if (!response) return { mapping: "", options: null };

  let normalized = response
    .replace(/\\=/g, '=')      // \= → =
    .replace(/\\_/g, '_')      // \_ → _
    .replace(/\\\*/g, '*')     // \* → *
    .replace(/\\-/g, '-')     // \- → -
    .replace(/[＝═⁼˭꓿﹦]/g, '=')
    .replace(/[‗₌]/g, '=')
    .replace(/\u2550/g, '=')
    .replace(/\uFF1D/g, '=');

  const topoMatch = normalized.match(/={3,}\s*GRAPH[_\s]*TOPOLOGY\s*={3,}/i);
  if (topoMatch && typeof topoMatch.index === 'number') {
    normalized = normalized.slice(0, topoMatch.index).trim();
  }

  // Context-aware patterns with position constraints
  const optionsPatterns = [
    // Strict delimiters (can appear anywhere)
    { re: /\n={3,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={3,}\n/i, minPosition: 0 },
    { re: /\n[=\-─━═＝]{3,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*[=\-─━═＝]{3,}\n/i, minPosition: 0 },
    { re: /\n\*{0,2}={3,}\s*ALL[_\s]*AVAILABLE[_\s]*OPTIONS\s*={3,}\*{0,2}\n/i, minPosition: 0 },

    // Markdown headings (require newline, can appear mid-document)
    { re: /\n#{1,3}\s*All\s+Available\s+Options:?\n/i, minPosition: 0.25 },
    { re: /\n\*{2}All\s+Available\s+Options:?\*{2}\n/i, minPosition: 0.25 },

    // Loose patterns - require at least 30% through to avoid narrative mentions
    { re: /\nAll\s+Available\s+Options:\n/i, minPosition: 0.3 },
  ];

  let bestMatch = null;
  let bestScore = -1;

  for (const pattern of optionsPatterns) {
    const match = normalized.match(pattern.re);
    if (match && typeof match.index === 'number') {
      const position = match.index / normalized.length;

      // Reject matches too early in text
      if (position < pattern.minPosition) continue;

      // Score: later position is better
      const score = position * 100;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = { index: match.index, length: match[0].length };
      }
    }
  }

  if (bestMatch) {
    const afterDelimiter = normalized.substring(bestMatch.index + bestMatch.length).trim();

    // Validate: check for list structure
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

// extractClaudeArtifacts removed - handled by backend


interface AiTurnBlockProps {
  aiTurn: AiTurn;
  isLive?: boolean;
  isReducedMotion?: boolean;
  isLoading?: boolean;
  activeRecomputeState?: {
    aiTurnId: string;
    stepType: "synthesis" | "mapping";
    providerId: string;
  } | null;
  currentAppStep?: AppStep;
  showSourceOutputs?: boolean;
  onToggleSourceOutputs?: () => void;
  activeSynthesisClipProviderId?: string;
  activeMappingClipProviderId?: string;
  onClipClick?: (type: "synthesis" | "mapping", providerId: string) => void;

  mapStatus?: "idle" | "streaming" | "ready" | "error";
  graphTopology?: GraphTopology | null;
  aiTurnId?: string;
  children?: React.ReactNode;
}

interface ProviderSelectorProps {
  providers: typeof LLM_PROVIDERS_CONFIG;
  responsesMap: Record<string, ProviderResponse[]>;
  activeProviderId?: string;
  onSelect: (providerId: string) => void;
  type: "synthesis" | "mapping";
}

const ProviderSelector: React.FC<ProviderSelectorProps> = ({
  providers,
  responsesMap,
  activeProviderId,
  onSelect,
  type,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const activeProvider = providers.find((p) => String(p.id) === activeProviderId);

  // Filter out the active provider from the strip
  const otherProviders = providers.filter((p) => String(p.id) !== activeProviderId);

  return (
    <div className="relative inline-flex items-center">
      {/* Backdrop to close on outside click */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
          }}
        />
      )}

      {/* Trigger Button - Shows Active Model */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`flex items-center gap-1.5 px-2.5 py-1 bg-surface-raised hover:bg-surface-highlight border border-border-subtle text-xs font-medium text-text-secondary transition-all ${isOpen
          ? "rounded-l-full border-r-0"
          : "rounded-full shadow-sm"
          }`}
      >
        {isOpen ? (
          <ChevronUpIcon className="w-3 h-3" />
        ) : (
          <ChevronDownIcon className="w-3 h-3" />
        )}
        <span>{activeProvider?.name || "Select Model"}</span>
      </button>

      {/* Horizontal Strip - Other Models + Arrow at End */}
      {isOpen && (
        <div className="relative z-50 inline-flex items-center gap-1 bg-surface-raised border border-border-subtle border-l-0 rounded-r-full pl-2 pr-2 py-1 shadow-lg animate-in slide-in-from-left-2 duration-200">
          {otherProviders.map((p) => {
            const pid = String(p.id);
            const responses = responsesMap[pid] || [];
            const latest = getLatestResponse(responses);
            const isStreaming = latest?.status === "streaming";
            const hasError = latest?.status === "error";

            return (
              <button
                key={pid}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(pid);
                  setIsOpen(false);
                }}
                className="px-2.5 py-0.5 rounded-full text-xs flex items-center gap-1.5 transition-all whitespace-nowrap text-text-secondary hover:bg-surface-highlight"
              >
                <span>{p.name}</span>
                {isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-intent-warning animate-pulse" />}
                {hasError && <span className="w-1.5 h-1.5 rounded-full bg-intent-danger" />}
              </button>
            );
          })}
          {/* Close at the end - up chevron */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
            className="opacity-70 ml-1 cursor-pointer hover:opacity-100 transition-opacity p-1"
            aria-label="Collapse"
            title="Collapse"
          >
            <ChevronUpIcon className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};

const AiTurnBlock: React.FC<AiTurnBlockProps> = ({
  aiTurn,
  onToggleSourceOutputs,
  showSourceOutputs = false,
  isReducedMotion = false,
  isLoading = false,
  isLive = false,
  currentAppStep,
  activeRecomputeState = null,
  activeSynthesisClipProviderId,
  activeMappingClipProviderId,
  onClipClick,

  mapStatus = "idle",
  graphTopology = null,
  aiTurnId,
  children,
}) => {

  const setToast = useSetAtom(toastAtom);
  const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
  const setIsDecisionMapOpen = useSetAtom(isDecisionMapOpenAtom);
  const isDecisionMapOpen = useAtomValue(isDecisionMapOpenAtom);

  // State for Claude artifact overlay
  const [selectedArtifact, setSelectedArtifact] = useState<{
    title: string;
    identifier: string;
    content: string;
  } | null>(null);

  const synthesisResponses = useMemo(() => {
    if (!aiTurn.synthesisResponses) aiTurn.synthesisResponses = {};
    const out: Record<string, ProviderResponse[]> = {};
    LLM_PROVIDERS_CONFIG.forEach((p) => (out[String(p.id)] = []));
    Object.entries(aiTurn.synthesisResponses).forEach(([pid, resp]) => {
      out[pid] = normalizeResponseArray(resp);
    });
    return out;
  }, [aiTurn.id, aiTurn.synthesisVersion]);

  const mappingResponses = useMemo(() => {
    const map = aiTurn.mappingResponses || {};
    const out: Record<string, ProviderResponse[]> = {};
    LLM_PROVIDERS_CONFIG.forEach((p) => (out[String(p.id)] = []));
    Object.entries(map).forEach(([pid, resp]) => {
      out[pid] = normalizeResponseArray(resp);
    });
    return out;
  }, [aiTurn.id, aiTurn.mappingVersion]);

  const allSources = useMemo(() => {
    const sources: Record<string, ProviderResponse> = {};
    // Take latest element from each provider's array
    Object.entries(aiTurn.batchResponses || {}).forEach(([pid, resp]) => {
      const arr = Array.isArray(resp) ? resp : [resp as any];
      if (arr.length > 0) {
        const latest = arr[arr.length - 1] as ProviderResponse;
        sources[pid] = latest;
      }
    });
    if (aiTurn.hiddenBatchOutputs) {
      Object.entries(aiTurn.hiddenBatchOutputs).forEach(
        ([providerId, response]) => {
          if (!sources[providerId]) {
            const typedResponse = response as ProviderResponse;
            sources[providerId] = {
              providerId,
              text: typedResponse.text || "",
              status: "completed" as const,
              createdAt: typedResponse.createdAt || Date.now(),
              updatedAt: typedResponse.updatedAt || Date.now(),
            } as ProviderResponse;
          }
        }
      );
    }
    return sources;
  }, [aiTurn.batchResponses, aiTurn.hiddenBatchOutputs]);

  const hasSources = Object.keys(allSources).length > 0;
  const providerIds = useMemo(
    () => LLM_PROVIDERS_CONFIG.map((p) => String(p.id)),
    []
  );

  const computeActiveProvider = useCallback(
    (explicit: string | undefined, map: Record<string, ProviderResponse[]>) => {
      if (explicit) return explicit;
      for (const pid of providerIds) {
        const arr = map[pid];
        if (arr && arr.length > 0) return pid;
      }
      return undefined;
    },
    [providerIds]
  );

  const activeSynthPid = computeActiveProvider(
    activeSynthesisClipProviderId,
    synthesisResponses
  );
  const activeMappingPid = computeActiveProvider(
    activeMappingClipProviderId,
    mappingResponses
  );

  const isSynthesisTarget = !!(
    activeRecomputeState &&
    activeRecomputeState.aiTurnId === aiTurn.id &&
    activeRecomputeState.stepType === "synthesis" &&
    (!activeSynthPid || activeRecomputeState.providerId === activeSynthPid)
  );
  const isMappingTarget = !!(
    activeRecomputeState &&
    activeRecomputeState.aiTurnId === aiTurn.id &&
    activeRecomputeState.stepType === "mapping" &&
    (!activeMappingPid || activeRecomputeState.providerId === activeMappingPid)
  );

  const getMappingAndOptions = useCallback(
    (take: ProviderResponse | undefined) => {
      if (!take?.text) return { mapping: "", options: null };
      return parseMappingResponse(String(take.text));
    },
    []
  );

  const getOptions = useCallback((): string | null => {
    if (!activeMappingPid) return null;
    const take = getLatestResponse(mappingResponses[activeMappingPid]);
    const { options } = getMappingAndOptions(take);
    return options;
  }, [activeMappingPid, mappingResponses, getMappingAndOptions]);

  const displayedMappingTake = useMemo(() => {
    if (!activeMappingPid) return undefined;
    return getLatestResponse(mappingResponses[activeMappingPid]);
  }, [activeMappingPid, mappingResponses]);

  const displayedMappingText = useMemo(() => {
    if (!displayedMappingTake?.text) return "";
    return String(getMappingAndOptions(displayedMappingTake).mapping ?? "");
  }, [displayedMappingTake, getMappingAndOptions]);


  const hasMapping = !!(activeMappingPid && displayedMappingTake?.text);
  const hasSynthesis = !!(
    activeSynthPid &&
    getLatestResponse(synthesisResponses[activeSynthPid])?.text
  );

  const requestedSynth = (aiTurn.meta as any)?.requestedFeatures?.synthesis;
  const requestedMap = (aiTurn.meta as any)?.requestedFeatures?.mapping;
  const wasSynthRequested =
    requestedSynth === undefined ? true : !!requestedSynth;
  const wasMapRequested = requestedMap === undefined ? true : !!requestedMap;

  // --- 1. DEFINITION: Citation Click Logic (First) ---
  const handleCitationClick = useCallback(
    (modelNumber: number) => {
      try {
        const take = activeMappingPid
          ? getLatestResponse(mappingResponses[activeMappingPid])
          : undefined;
        const metaOrder = (take as any)?.meta?.citationSourceOrder || null;
        let providerId: string | undefined;
        if (metaOrder && typeof metaOrder === "object") {
          providerId = metaOrder[modelNumber];
        }
        if (!providerId) {
          const activeOrdered = LLM_PROVIDERS_CONFIG.map((p) =>
            String(p.id)
          ).filter((pid) => !!(aiTurn.batchResponses || {})[pid]);
          providerId = activeOrdered[modelNumber - 1];
        }
        if (!providerId) return;

        // NEW: Open slide-in panel instead of scrolling
        setActiveSplitPanel({ turnId: aiTurn.id, providerId });

      } catch (e) {
        console.warn("[AiTurnBlock] Citation click failed", e);
      }
    },
    [
      activeMappingPid,
      mappingResponses,
      aiTurn.id,
      aiTurn.batchResponses,
      setActiveSplitPanel
    ]
  );

  // --- 2. DEFINITION: Custom Markdown Components (Depends on 1) ---
  const markdownComponents = useMemo(
    () => ({
      a: ({ href, children, ...props }: any) => {
        // Check for our specific hash pattern
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

        // Normal links behave normally
        return (
          <a href={href} {...props} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      },
    }),
    [handleCitationClick]
  );

  // --- 3. DEFINITION: Transformation Logic (Uses Hash Strategy) ---
  const transformCitations = useCallback((text: string) => {
    if (!text) return "";
    let t = text;

    // A. [[CITE:N]] -> [↗N](#cite-N)
    t = t.replace(/\[\[CITE:(\d+)\]\]/g, "[↗$1](#cite-$1)");

    // B. [1], [1, 2] -> [↗1](#cite-1) [↗2](#cite-2)
    // FIX: Added closing parenthesis to lookahead: (?!\()
    t = t.replace(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, (_m, grp) => {
      const nums = String(grp)
        .split(/\s*,\s*/)
        .map((n) => n.trim())
        .filter(Boolean);
      return " " + nums.map((n) => `[↗${n}](#cite-${n})`).join(" ") + " ";
    });

    return t;
  }, []);

  const userPrompt: string | null =
    (aiTurn as any)?.userPrompt ??
    (aiTurn as any)?.prompt ??
    (aiTurn as any)?.input ??
    null;

  // --- NEW: Crown Move Handler (Recompute) ---
  const handleCrownMove = useCallback((providerId: string) => {
    if (onClipClick) {
      onClipClick("synthesis", providerId);
    }
  }, [onClipClick]);

  return (
    <div className="turn-block pb-8 border-b border-border-subtle mb-4">
      {userPrompt && (
        <div className="user-prompt-block mb-2">
          <div className="text-xs text-text-muted mb-1.5">
            User
          </div>
          <div className="bg-surface border border-border-subtle rounded-lg p-3 text-text-secondary">
            {userPrompt}
          </div>
        </div>
      )}

      <div className="ai-turn-block">
        <div className="ai-turn-content flex flex-col gap-3">

          {/* SHARED LAYOUT CONTAINER */}
          <div className="flex justify-center w-full transition-all duration-300 px-4">
            <div className="w-full">

              {/* LEFT: Synthesis Block with Orbs Inside */}
              <div className="flex-1 flex flex-col relative min-w-0" style={{ maxWidth: '820px', margin: '0 auto' }}>

                {/* Synthesis Bubble */}
                <div className="synthesis-bubble bg-surface rounded-3xl border border-border-subtle shadow-sm relative" style={{ padding: '28px 40px 96px' }}>
                  {(() => {
                    if (!wasSynthRequested)
                      return (
                        <div className="text-text-muted/70 italic text-center">
                          Synthesis not enabled for this turn.
                        </div>
                      );
                    const latest = activeSynthPid
                      ? getLatestResponse(
                        synthesisResponses[activeSynthPid]
                      )
                      : undefined;
                    const isGenerating =
                      (latest &&
                        (latest.status === "streaming" ||
                          latest.status === "pending")) ||
                      isSynthesisTarget;
                    if (isGenerating)
                      return (
                        <div className="flex items-center justify-center gap-2 text-text-muted">
                          <span className="italic">
                            Synthesis generating
                          </span>
                          <span className="streaming-dots" />
                        </div>
                      );
                    if (activeSynthPid) {
                      const take = getLatestResponse(
                        synthesisResponses[activeSynthPid]
                      );
                      if (take && take.status === "error") {
                        return (
                          <div className="bg-intent-danger/15 border border-intent-danger text-intent-danger rounded-lg p-3">
                            <div className="text-xs mb-2">
                              {activeSynthPid} · error
                            </div>
                            <div className="prose prose-sm max-w-none dark:prose-invert leading-7 text-sm">
                              <MarkdownDisplay
                                content={String(
                                  take.text || "Synthesis failed"
                                )}
                              />
                            </div>
                          </div>
                        );
                      }
                      if (!take)
                        return (
                          <div className="text-text-muted">
                            No synthesis yet.
                          </div>
                        );
                      return (
                        <div>
                          {(() => {
                            const cleanText = take.text || '';
                            const artifacts = take.artifacts || [];

                            return (
                              <>
                                <div className="text-base leading-relaxed text-text-primary">
                                  <MarkdownDisplay
                                    content={String(cleanText || take.text || "")}
                                    components={markdownComponents}
                                  />
                                </div>

                                {/* Artifact badges */}
                                {artifacts.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2 justify-center">
                                    {artifacts.map((artifact, idx) => (
                                      <button
                                        key={idx}
                                        onClick={() => setSelectedArtifact(artifact)}
                                        className="bg-gradient-to-br from-brand-500 to-brand-600 border border-brand-400 rounded-lg px-3 py-2 text-text-primary text-sm font-medium cursor-pointer flex items-center gap-1.5 hover:-translate-y-px hover:shadow-glow-brand-soft transition-all"
                                      >
                                        📄 {artifact.title}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-center justify-center h-full text-text-muted italic">
                        Choose a model.
                      </div>
                    );
                  })()}

                  {/* BOTTOM TRAY: Council Orbs INSIDE bubble - 28px from bottom */}
                  <div className="absolute bottom-0 left-0 right-0" style={{ paddingBottom: '28px' }}>
                    <CouncilOrbs
                      turnId={aiTurn.id}
                      providers={LLM_PROVIDERS_CONFIG}
                      voiceProviderId={activeSynthPid || ""}
                      onOrbClick={(pid) => setActiveSplitPanel({ turnId: aiTurn.id, providerId: pid })}
                      onCrownMove={handleCrownMove}
                      onTrayExpand={() => setIsDecisionMapOpen({ turnId: aiTurn.id })}
                      isTrayExpanded={isDecisionMapOpen?.turnId === aiTurn.id}
                      variant="tray"
                    />
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Hidden Grid (Dev Only) */}
          {showSourceOutputs && (
            <div className="batch-filler mt-3">
              <div className="sources-wrapper">
                <div className="sources-content">
                  {children}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Artifact Overlay Modal */}
      {selectedArtifact && (
        <div className="fixed inset-0 bg-overlay-backdrop z-[9999] flex items-center justify-center p-5" onClick={() => setSelectedArtifact(null)}>
          <div className="bg-surface-raised border border-border-strong rounded-2xl max-w-[900px] w-full max-h-[90vh] flex flex-col shadow-elevated" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <div>
                <h3 className="m-0 text-lg text-text-primary font-semibold">
                  📄 {selectedArtifact.title}
                </h3>
                <div className="text-xs text-text-muted mt-1">
                  {selectedArtifact.identifier}
                </div>
              </div>
              <button
                onClick={() => setSelectedArtifact(null)}
                className="bg-transparent border-none text-text-muted text-2xl cursor-pointer px-2 py-1"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 bg-surface">
              <MarkdownDisplay content={selectedArtifact.content} />
            </div>
            <div className="flex gap-3 p-4 border-t border-border-subtle justify-end">
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(selectedArtifact.content);
                    setToast({ id: Date.now(), message: 'Copied artifact', type: 'info' });
                  } catch (err) {
                    console.error("Failed to copy artifact:", err);
                    setToast({ id: Date.now(), message: 'Failed to copy', type: 'error' });
                  }
                }}
                className="bg-surface-raised border border-border-subtle rounded-md px-4 py-2 text-text-secondary text-sm cursor-pointer flex items-center gap-1.5 hover:bg-surface-highlight transition-all"
              >
                📋 Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(AiTurnBlock);
