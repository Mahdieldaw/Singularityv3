// ui/components/AiTurnBlock.tsx - FIXED ALIGNMENT
import React, {
  useMemo,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { useSetAtom, useAtomValue, useAtom } from "jotai";
import {
  toastAtom,
  activeSplitPanelAtom,
  isDecisionMapOpenAtom,
  synthesisProviderAtom,
  includePromptInCopyAtom,
  isReducedMotionAtom,
  showSourceOutputsFamily,
  activeRecomputeStateAtom,
  turnStreamingStateFamily,
  mappingProviderAtom,
  chatInputValueAtom,
} from "../state/atoms";
import { useClipActions } from "../hooks/useClipActions";
import { AiTurn, ProviderResponse, AppStep } from "../types";
import MarkdownDisplay from "./MarkdownDisplay";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import { ChevronDownIcon, ChevronUpIcon, SettingsIcon } from "./Icons";
import { CouncilOrbs } from "./CouncilOrbs";
import { CopyButton } from "./CopyButton";
import { formatSynthesisForMd, formatTurnForMd } from "../utils/copy-format-utils";
import {
  normalizeResponseArray,
  getLatestResponse,
} from "../utils/turn-helpers";
import clsx from "clsx";
import ProviderErrorCard from "./ProviderErrorCard";
import { useRetryProvider } from "../hooks/useRetryProvider";
import {
  providerErrorsAtom,
  retryableProvidersAtom,
  activeAiTurnIdAtom,
  isLoadingAtom,
  workflowProgressAtom
} from "../state/atoms";
import { useRefinerOutput } from "../hooks/useRefinerOutput";
import { RefinerSynthesisAccuracy } from "./refinerui/RefinerCardsSection";
import { ConfidenceBadge } from "./refinerui/ConfidenceBadge";
import { ReframingBanner } from "./refinerui/ReframingBanner";
import { HeaderGuidance } from "./refinerui/HeaderGuidance";
import { BottomLineCard } from "./refinerui/BottomLineCard";
import { getStructuredAssessment, getGapCounts } from "../utils/refiner-helpers";

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



interface AiTurnBlockProps {
  aiTurn: AiTurn;
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
}) => {
  // --- CONNECTED STATE LOGIC ---
  const streamingState = useAtomValue(turnStreamingStateFamily(aiTurn.id));
  const { isLoading, appStep: currentAppStep } = streamingState;
  const isLive = isLoading && currentAppStep !== "initial";

  const [isReducedMotion] = useAtom(isReducedMotionAtom);
  const synthesisProvider = useAtomValue(synthesisProviderAtom);
  const mappingProvider = useAtomValue(mappingProviderAtom);
  const { handleClipClick } = useClipActions();
  const [globalActiveRecomputeState] = useAtom(activeRecomputeStateAtom);
  const providerErrors = useAtomValue(providerErrorsAtom);
  const retryableProviders = useAtomValue(retryableProvidersAtom);
  const { retryProviders } = useRetryProvider();

  // Streaming UX: determine if this is the active running turn
  const activeAiTurnId = useAtomValue(activeAiTurnIdAtom);
  const globalIsLoading = useAtomValue(isLoadingAtom);
  const workflowProgress = useAtomValue(workflowProgressAtom);
  const isThisTurnActive = activeAiTurnId === aiTurn.id && globalIsLoading;

  const { output: refinerOutput } = useRefinerOutput(aiTurn.id);
  const assessment = useMemo(() => getStructuredAssessment(refinerOutput), [refinerOutput]);
  const gapCounts = useMemo(() => getGapCounts(refinerOutput), [refinerOutput]);

  const setChatInput = useSetAtom(chatInputValueAtom);

  const handleAskReframed = useCallback((question: string) => {
    setChatInput(question);
    const input = document.querySelector('textarea[name="chat-input"]') as HTMLTextAreaElement | null;
    if (input) {
      input.focus();
    }
  }, [setChatInput]);

  const getProviderName = useCallback((pid: string) => {
    const cfg = LLM_PROVIDERS_CONFIG.find(p => String(p.id) === pid);
    return cfg?.name || pid;
  }, []);


  const onClipClick = useCallback(
    (type: "synthesis" | "mapping", pid: string) => {
      void handleClipClick(aiTurn.id, type, pid);
    },
    [handleClipClick, aiTurn.id]
  );


  // Filter activeRecomputeState to only include synthesis/mapping (AiTurnBlock doesn't handle batch)
  const activeRecomputeState = useMemo(() => {
    if (!globalActiveRecomputeState) return null;
    if (globalActiveRecomputeState.stepType === 'batch') return null;
    return globalActiveRecomputeState as { aiTurnId: string; stepType: "synthesis" | "mapping"; providerId: string; };
  }, [globalActiveRecomputeState]);

  // Use global synthesis provider, or fall back to the provider used for generation
  const activeSynthesisClipProviderId = synthesisProvider || aiTurn.meta?.synthesizer;

  // For mapping, if no explicit global selection and meta.mapper is missing,
  // default to the first provider that has mapping responses
  const activeMappingClipProviderId = (() => {
    // Global selection
    if (mappingProvider) return mappingProvider;

    // Fallback to meta.mapper from backend
    if (aiTurn.meta?.mapper) return aiTurn.meta.mapper;

    // Final fallback: first provider with mapping responses
    const mappingProviders = Object.keys(aiTurn.mappingResponses || {});
    if (mappingProviders.length > 0) {
      return mappingProviders[0];
    }
    return undefined;
  })();

  // Derive mapStatus for Decision Map indicator (per-turn, no new atoms)
  const mapStatus: "idle" | "streaming" | "ready" | "error" = (() => {
    if (!activeMappingClipProviderId) return "idle";

    const mappingResponsesForProvider = aiTurn.mappingResponses?.[activeMappingClipProviderId];
    if (!mappingResponsesForProvider || mappingResponsesForProvider.length === 0) {
      return "idle";
    }

    // Get latest mapping response for active provider
    const latestMapping = Array.isArray(mappingResponsesForProvider)
      ? mappingResponsesForProvider[mappingResponsesForProvider.length - 1]
      : mappingResponsesForProvider;

    // Check if this turn's mapping is being recomputed
    const isMappingTarget =
      activeRecomputeState?.aiTurnId === aiTurn.id &&
      activeRecomputeState?.stepType === "mapping" &&
      activeRecomputeState?.providerId === activeMappingClipProviderId;

    // Determine status
    if (latestMapping.status === "error") return "error";

    if (
      latestMapping.status === "streaming" ||
      latestMapping.status === "pending" ||
      isMappingTarget
    ) {
      return "streaming";
    }

    if (latestMapping.status === "completed" && latestMapping.text) {
      return "ready";
    }

    return "idle";
  })();

  // Extract graph topology from mapping response metadata (if available)
  const graphTopology = useMemo(() => {
    if (!activeMappingClipProviderId) {
      return null;
    }

    const mappingResponsesForProvider = aiTurn.mappingResponses?.[activeMappingClipProviderId];
    if (!mappingResponsesForProvider || mappingResponsesForProvider.length === 0) {
      return null;
    }

    const latestMapping = Array.isArray(mappingResponsesForProvider)
      ? mappingResponsesForProvider[mappingResponsesForProvider.length - 1]
      : mappingResponsesForProvider;

    // Check if topology exists in meta (preferred)
    const metaTopology = (latestMapping as any)?.meta?.graphTopology;
    if (metaTopology) {
      return metaTopology;
    }

    // FALLBACK: Extract from raw text for historical responses that weren't parsed
    const rawText = (latestMapping as any)?.text;
    if (!rawText || typeof rawText !== 'string') {
      return null;
    }

    try {
      // Normalize escapes like backend does
      let normalized = rawText
        .replace(/\\=/g, '=')
        .replace(/\\_/g, '_')
        .replace(/\\\*/g, '*')
        .replace(/\\-/g, '-');

      const match = normalized.match(/={3,}\s*GRAPH[_\s]*TOPOLOGY\s*={3,}/i);
      if (!match || typeof match.index !== 'number') {
        return null;
      }

      const start = match.index + match[0].length;
      let rest = normalized.slice(start).trim();

      // Strip markdown code fence if present (```json ... ```)
      const codeBlockMatch = rest.match(/^```(?:json)?\s*\n([\s\S]*?)\n```/);
      if (codeBlockMatch) {
        rest = codeBlockMatch[1].trim();
      }

      // Find opening brace
      let i = 0;
      while (i < rest.length && rest[i] !== '{') i++;
      if (i >= rest.length) return null;

      // Extract JSON object
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

            // FIX: Replace unquoted S in supporter arrays (common LLM error)
            // Pattern: "supporters": [S, 1, 2] -> "supporters": ["S", 1, 2]
            jsonText = jsonText.replace(/("supporters"\s*:\s*\[)\s*S\s*([,\]])/g, '$1"S"$2');

            const parsed = JSON.parse(jsonText);
            // console.log('[AiTurnBlock] Extracted graph topology from historical response for turn:', aiTurn.id);
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('[AiTurnBlock] Failed to extract graph topology from turn ' + aiTurn.id + ':', e);
    }

    return null;
  }, [activeMappingClipProviderId, aiTurn.mappingResponses, aiTurn.id]);


  // --- PRESENTATION LOGIC ---

  const setToast = useSetAtom(toastAtom);
  const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
  const setIsDecisionMapOpen = useSetAtom(isDecisionMapOpenAtom);
  const isDecisionMapOpen = useAtomValue(isDecisionMapOpenAtom);
  const [includePromptInCopy, setIncludePromptInCopy] = useAtom(includePromptInCopyAtom);

  // State for Claude artifact overlay
  const [selectedArtifact, setSelectedArtifact] = useState<{
    title: string;
    identifier: string;
    content: string;
  } | null>(null);


  // --- SYNTHESIS TABS LOGIC ---
  const synthesisTabs = useMemo(() => {
    if (!aiTurn.synthesisResponses) return [];

    interface SynthTab {
      id: string; // unique: providerId + index
      providerId: string;
      index: number;
      label: string;
      response: ProviderResponse;
      isLatest: boolean;
    }

    const tabs: SynthTab[] = [];
    const providersWithResponses = Object.entries(aiTurn.synthesisResponses)
      .filter(([_, resps]) => Array.isArray(resps) && resps.length > 0);

    // Sort providers by predetermined order or alphabetical
    // This ensures tabs are stable
    const sortedProviders = providersWithResponses.sort((a, b) => {
      const idxA = LLM_PROVIDERS_CONFIG.findIndex(p => String(p.id) === a[0]);
      const idxB = LLM_PROVIDERS_CONFIG.findIndex(p => String(p.id) === b[0]);
      return idxA - idxB;
    });

    sortedProviders.forEach(([pid, resps]) => {
      const providerConfig = LLM_PROVIDERS_CONFIG.find(p => String(p.id) === pid);
      const name = providerConfig?.name || pid;

      const respsArray = Array.isArray(resps) ? resps : [resps];
      // Filter out empty responses unless they are streaming/error
      const validResps = respsArray.filter(r => r.text || r.status === 'streaming' || r.status === 'error');

      validResps.forEach((resp, idx) => {
        // If there's more than one response for this provider, append number
        const count = validResps.length;
        const label = count > 1 ? `${name} ${idx + 1}` : name;

        tabs.push({
          id: `${pid}-${idx}`,
          providerId: pid,
          index: idx,
          label,
          response: resp,
          isLatest: idx === validResps.length - 1
        });
      });
    });

    return tabs;
  }, [aiTurn.synthesisResponses, aiTurn.synthesisVersion]);

  // Track active tab ID. Default to the very last (latest) tab.
  // We use a ref to detect new arrivals and auto-switch if needed.
  const [activeSynthTabId, setActiveSynthTabId] = useState<string | null>(null);
  const prevTabsLengthRef = useRef(0);

  // Auto-select latest tab on mount or when new tabs arrive
  useEffect(() => {
    if (synthesisTabs.length > 0) {
      // If first load (active is null) OR new tabs added (recompute finished)
      if (activeSynthTabId === null || synthesisTabs.length > prevTabsLengthRef.current) {
        // Find the "recompute target" if exists, else just the last one
        const lastTab = synthesisTabs[synthesisTabs.length - 1];

        // If we have a specific active recompute target, prioritize that
        if (activeRecomputeState?.stepType === "synthesis" && activeRecomputeState.aiTurnId === aiTurn.id) {
          const targetTab = synthesisTabs.slice().reverse().find(t => t.providerId === activeRecomputeState.providerId);
          if (targetTab) {
            setActiveSynthTabId(targetTab.id);
          } else {
            setActiveSynthTabId(lastTab.id);
          }
        } else {
          setActiveSynthTabId(lastTab.id);
        }
      }
    }
    prevTabsLengthRef.current = synthesisTabs.length;
  }, [synthesisTabs, activeRecomputeState, aiTurn.id]); // activeSynthTabId excluded to allow manual switch

  // Derive the effectively active tab (for orbs and display)
  const effectiveActiveSynthTab = useMemo(() => {
    if (synthesisTabs.length === 0) return null;
    return synthesisTabs.find(t => t.id === activeSynthTabId) || synthesisTabs[synthesisTabs.length - 1];
  }, [synthesisTabs, activeSynthTabId]);



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
    return sources;
  }, [aiTurn.batchResponses]);

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

  const globalSynthesisProvider = useAtomValue(synthesisProviderAtom);

  const activeSynthPid = useMemo(() => {
    // 1. Clip Override (Highest Priority interaction)
    if (activeSynthesisClipProviderId) return activeSynthesisClipProviderId;

    // 2. Global State
    if (globalSynthesisProvider) return globalSynthesisProvider;

    // 3. Persisted Metadata
    const metaSynth = (aiTurn.meta as any)?.synthesizer;
    if (metaSynth) return metaSynth;

    // 4. Fallback: Check for any completed synthesis response
    for (const p of LLM_PROVIDERS_CONFIG) {
      const pid = String(p.id);
      const responses = synthesisResponses[pid];
      if (responses?.some(r => r.status === 'completed' || (r.text && r.status !== 'error'))) {
        return pid;
      }
    }

    return undefined;
  }, [activeSynthesisClipProviderId, globalSynthesisProvider, aiTurn.meta, synthesisResponses]);

  // The provider ID to show as "Voice" (Crown) on the historical orbs
  const displayedVoicePid = effectiveActiveSynthTab?.providerId || activeSynthPid || "";

  const visibleProviderIds = useMemo(() => {
    const ids = new Set(Object.keys(allSources));
    if (activeSynthPid) ids.add(activeSynthPid);
    if (effectiveActiveSynthTab?.providerId) ids.add(effectiveActiveSynthTab.providerId);
    if ((aiTurn.meta as any)?.mapper) ids.add((aiTurn.meta as any).mapper);
    return Array.from(ids);
  }, [allSources, activeSynthPid, effectiveActiveSynthTab, aiTurn.meta]);
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

  const handleCopyFullTurn = useCallback(() => {
    const md = formatTurnForMd(
      aiTurn.id,
      userPrompt,
      effectiveActiveSynthTab?.response?.text || null,
      effectiveActiveSynthTab?.providerId,
      hasMapping && activeMappingPid ? { narrative: displayedMappingText, options: getOptions(), topology: graphTopology } : null,
      allSources,
      includePromptInCopy
    );
    navigator.clipboard.writeText(md);
  }, [
    aiTurn.id,
    userPrompt,
    effectiveActiveSynthTab?.response?.text,
    effectiveActiveSynthTab?.providerId,
    hasMapping,
    activeMappingPid,
    displayedMappingText,
    getOptions,
    graphTopology,
    allSources,
    includePromptInCopy
  ]);

  // --- NEW: Crown Move Handler (Recompute) - REMOVED for historical turns ---
  // The crown is now static for historical turns. Recompute is handled via the button below.


  return (
    <div className="turn-block pb-32 mt-4">
      {userPrompt && (
        <div className="user-prompt-block mt-24 mb-8">
          <div className="text-xs text-text-muted mb-1.5">
            Your Prompt
          </div>
          <div className="bg-surface border border-border-subtle rounded-lg p-3 text-text-secondary">
            {userPrompt}
          </div>
        </div>
      )}

      <div className="ai-turn-block relative group/turn">


        <div className="ai-turn-content flex flex-col gap-3">

          {/* SHARED LAYOUT CONTAINER */}
          <div className="flex justify-center w-full transition-all duration-300 px-4">
            <div className="w-full">

              {/* LEFT: Synthesis Block with Orbs Inside */}
              <div className="flex-1 flex flex-col relative min-w-0" style={{ maxWidth: '820px', margin: '0 auto' }}>

                {/* Synthesis Bubble */}
                <div
                  className={clsx(
                    "synthesis-bubble bg-surface rounded-3xl border border-border-subtle shadow-sm relative z-10 transition-all duration-300"
                  )}
                  style={{ padding: '28px 40px 88px' }}
                >
                  {/* Use padding top to accommodate banner if present? No, standard padding is fine */}
                  {refinerOutput?.reframingSuggestion && (
                    <div className="mb-6 relative z-30 pointer-events-auto mx-[-12px]">
                      <ReframingBanner
                        suggestion={refinerOutput.reframingSuggestion}
                        onApply={handleAskReframed}
                      />
                    </div>
                  )}

                  {/* OVERLAY: Floating Controls (Fade in on Group Hover) */}
                  <div className="absolute inset-0 pointer-events-none z-20">
                    <div className="flex flex-col justify-between h-full px-8 py-6 opacity-0 group-hover/turn:opacity-100 focus-within:opacity-100 transition-opacity duration-300 ease-out">

                      {/* Top-Right: Copy Synthesis */}
                      {effectiveActiveSynthTab?.response?.text && (
                        <div className="self-end pointer-events-auto">
                          <CopyButton
                            text={formatSynthesisForMd(
                              effectiveActiveSynthTab.response.text,
                              effectiveActiveSynthTab.label
                            )}
                            label="Copy Synthesis"
                            variant="icon"
                            className="bg-surface/95 backdrop-blur-sm shadow-lg rounded-full"
                          />
                        </div>
                      )}

                      {/* Bottom: Copy Turn + Settings + (centered stuff will be pointer-events-auto) */}
                      <div className="flex justify-between items-end mt-auto w-full pointer-events-auto">
                        {/* Left: Copy Turn + Settings */}
                        <div className="flex items-center gap-3">
                          <CopyButton
                            onCopy={handleCopyFullTurn}
                            label="Copy full turn"
                            className="bg-surface/95 backdrop-blur-sm shadow-lg rounded-lg text-xs font-medium px-3 py-1.5"
                          >
                            Copy Turn
                          </CopyButton>

                          <button
                            className="bg-surface/95 backdrop-blur-sm shadow-lg rounded-full p-2 text-text-muted hover:text-text-primary transition-colors"
                            onClick={() => setIncludePromptInCopy(!includePromptInCopy)}
                            title={includePromptInCopy ? "Include User Prompt: ON" : "Include User Prompt: OFF"}
                          >
                            <SettingsIcon className={clsx("w-4 h-4", includePromptInCopy && "text-brand-400")} />
                          </button>
                        </div>

                        {/* Right: empty (orbs are centered absolutely) */}
                      </div>
                    </div>
                  </div>

                  {/* SYNTHESIS TABS UI */}
                  {synthesisTabs.length > 0 && (
                    <div className="relative z-10 flex gap-2 overflow-x-auto pb-4 px-2 mb-2 no-scrollbar border-b border-border-subtle/50">
                      {synthesisTabs.map((tab) => {
                        const isActive = tab.id === activeSynthTabId;
                        const isStreaming = tab.response.status === 'streaming';
                        const isError = tab.response.status === 'error';

                        return (
                          <button
                            key={tab.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveSynthTabId(tab.id);
                              // Also move split panel if needed (optional)
                            }}
                            className={clsx(
                              "relative px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap border",
                              isActive
                                ? "bg-surface-raised border-brand-400 text-text-primary shadow-sm"
                                : "bg-transparent border-transparent text-text-muted hover:bg-surface-highlight hover:text-text-secondary"
                            )}
                          >
                            <span className="flex items-center gap-2">
                              {tab.label}
                              {isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-intent-warning animate-pulse" />}
                              {isError && <span className="w-1.5 h-1.5 rounded-full bg-intent-danger" />}
                            </span>
                            {isActive && (
                              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-brand-500 rounded-t-full" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {(() => {
                    if (!wasSynthRequested)
                      return (
                        <div className="text-text-muted/70 italic text-center relative z-10">
                          Synthesis not enabled for this turn.
                        </div>
                      );

                    // --- USE ACTIVE TAB INSTEAD OF GLOBAL ACTIVE PID ---
                    const activeTab = synthesisTabs.find(t => t.id === activeSynthTabId) || synthesisTabs[synthesisTabs.length - 1]; // Fallback to last

                    // Fallback to old behavior if no tabs (shouldn't happen if responses exist)
                    const latest = activeTab
                      ? activeTab.response
                      : (activeSynthPid ? getLatestResponse(synthesisResponses[activeSynthPid]) : undefined);

                    // Derive isGenerating from the SPECIFIC response status
                    const isGenerating = latest && (latest.status === "streaming" || latest.status === "pending");

                    // If specifically targeting synthesis recompute for a provider NOT yet in tabs (rare race condition), show loader
                    if (!activeTab && isSynthesisTarget) {
                      return (
                        <div className="flex items-center justify-center gap-2 text-text-muted relative z-10">
                          <span className="italic">
                            Starting synthesis...
                          </span>
                          <span className="streaming-dots" />
                        </div>
                      );
                    }

                    // ONLY show placeholder if we have NO text yet
                    if (isGenerating && !latest?.text)
                      return (
                        <div className="flex items-center justify-center gap-2 text-text-muted relative z-10">
                          <span className="italic">
                            Synthesis generating
                          </span>
                          <span className="streaming-dots" />
                        </div>
                      );

                    if (activeTab) {
                      const take = activeTab.response;

                      if (take && take.status === "error") {
                        return (
                          <div className="bg-intent-danger/15 border border-intent-danger text-intent-danger rounded-lg p-3 relative z-10">
                            <div className="text-xs mb-2">
                              {activeTab.label} · error
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
                          <div className="text-text-muted relative z-10">
                            No synthesis content.
                          </div>
                        );

                      return (
                        <div className="animate-in fade-in duration-300 relative z-10">
                          {(() => {
                            const cleanText = take.text || '';
                            const artifacts = take.artifacts || [];

                            // DEBUG: Before rendering HeaderGuidance/BottomLineCard
                            console.log('[AiTurnBlock] refinerOutput:', refinerOutput);
                            console.log('[AiTurnBlock] assessment:', assessment);

                            return (
                              <>
                                {/* Header Guidance */}
                                {refinerOutput && typeof refinerOutput.confidenceScore === 'number' && (
                                  <HeaderGuidance
                                    confidenceScore={refinerOutput.confidenceScore}
                                    biggestRisk={assessment?.biggestRisk}
                                    presentationStrategy={refinerOutput.presentationStrategy}
                                    strategyRationale={refinerOutput.strategyRationale}
                                    className="mb-6 mx-[-12px] sm:mx-0"
                                  />
                                )}

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

                          {refinerOutput && (
                            <div className="mt-8">
                              <BottomLineCard
                                recommendedNextStep={assessment?.recommendedNextStep}
                                reliabilitySummary={assessment?.reliabilitySummary}
                                gapCount={gapCounts.total}
                                foundationalGapCount={gapCounts.foundational}
                                hasVerificationTriggers={!!refinerOutput.verificationTriggers?.length}
                                className="mb-4"
                              />

                              <div className="pt-6 border-t border-border-subtle">
                                <RefinerSynthesisAccuracy output={refinerOutput} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-center justify-center h-full text-text-muted italic relative z-10">
                        Choose a model.
                      </div>
                    );
                  })()}

                  {/* Provider Errors (if any) */}
                  {Object.entries(providerErrors || {}).length > 0 && (
                    <div className="provider-errors-section mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-text-secondary">⚠️ Some providers encountered issues</span>
                        {retryableProviders.length > 0 && aiTurn.sessionId && (
                          <button
                            onClick={() => retryProviders(aiTurn.sessionId as string, aiTurn.id, retryableProviders)}
                            className="provider-error-card__retry-btn"
                          >
                            🔄 Retry All ({retryableProviders.length})
                          </button>
                        )}
                      </div>
                      {Object.entries(providerErrors).map(([pid, error]) => (
                        <ProviderErrorCard
                          key={pid}
                          providerId={pid}
                          providerName={getProviderName(pid)}
                          error={error as any}
                          onRetry={(error as any)?.retryable && aiTurn.sessionId ? () => retryProviders(aiTurn.sessionId as string, aiTurn.id, [pid]) : undefined}
                        />
                      ))}
                    </div>
                  )}

                  {/* BOTTOM TRAY: Council Orbs - Centered */}
                  <div
                    className={clsx(
                      "absolute bottom-4 left-0 right-0 flex items-center justify-center z-30 transition-opacity duration-300 ease-out pointer-events-none",
                      isThisTurnActive
                        ? "opacity-100"
                        : "opacity-0 group-hover/turn:opacity-100 focus-within:opacity-100"
                    )}
                  >
                    <div className="pointer-events-auto translate-x-5">
                      <CouncilOrbs
                        turnId={aiTurn.id}
                        providers={LLM_PROVIDERS_CONFIG}
                        voiceProviderId={displayedVoicePid}
                        visibleProviderIds={visibleProviderIds}
                        onOrbClick={(pid) => setActiveSplitPanel({ turnId: aiTurn.id, providerId: pid })}
                        // onCrownMove disabled for historical
                        onTrayExpand={() => setIsDecisionMapOpen({ turnId: aiTurn.id })}
                        isTrayExpanded={isDecisionMapOpen?.turnId === aiTurn.id}
                        variant="historical"
                        workflowProgress={isThisTurnActive ? workflowProgress as any : undefined}
                      />
                    </div>

                    {/* Hint text for active orbs */}
                    {isThisTurnActive && (
                      <div className="absolute top-full mt-2 text-[11px] text-text-muted opacity-60 pointer-events-none whitespace-nowrap">
                        Click a glowing orb to see that response
                      </div>
                    )}
                  </div>

                  {/* BOTTOM RIGHT: Recompute Icon Button */}
                  {!isThisTurnActive && (
                    <div className="absolute bottom-6 right-10 z-30 pointer-events-auto opacity-0 group-hover/turn:opacity-100 focus-within:opacity-100 transition-opacity duration-300">
                      <div className="relative group/recompute">
                        <button
                          className="flex items-center justify-center w-8 h-8 bg-surface-raised/80 border border-border-subtle rounded-full text-sm hover:bg-surface-highlight hover:scale-110 transition-all shadow-sm"
                          title="Recompute synthesis"
                        >
                          <span className="text-brand-400">⚡</span>
                        </button>

                        {/* Hover/Focus Dropdown */}
                        <div className="absolute bottom-full right-0 mb-2 min-w-[140px] bg-surface-raised border border-border-subtle rounded-xl shadow-elevated p-1.5 hidden group-hover/recompute:block transition-all animate-in fade-in zoom-in-95 duration-150">
                          <div className="text-[10px] text-text-muted px-2 py-1 font-medium uppercase tracking-wider">Recompute</div>
                          {LLM_PROVIDERS_CONFIG.map(p => (
                            <button
                              key={p.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onClipClick) onClipClick("synthesis", String(p.id));
                              }}
                              className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-surface-highlight text-text-secondary hover:text-text-primary flex items-center gap-2"
                            >
                              <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: p.color || '#ccc' }} />
                              {p.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                </div>

              </div>
            </div>
          </div>

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
