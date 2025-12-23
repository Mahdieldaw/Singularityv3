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
  activeRecomputeStateAtom,
  mappingProviderAtom,
  chatInputValueAtom,
  trustPanelFocusAtom,
} from "../state/atoms";
import { useClipActions } from "../hooks/useClipActions";
import { AiTurn, ProviderResponse } from "../types";
import MarkdownDisplay from "./MarkdownDisplay";
import { LLM_PROVIDERS_CONFIG } from "../constants";
import { CouncilOrbs } from "./CouncilOrbs";
import { formatTurnForMd } from "../utils/copy-format-utils";
import {
  normalizeResponseArray,
  getLatestResponse,
} from "../utils/turn-helpers";
import { useRetryProvider } from "../hooks/providers/useRetryProvider";
import {
  providerErrorsAtom,
  retryableProvidersAtom,
  activeAiTurnIdAtom,
  isLoadingAtom,
  workflowProgressAtom,
  antagonistProviderAtom,
} from "../state/atoms";
import { useRefinerOutput } from "../hooks/useRefinerOutput";
import { parseMappingResponse } from "../../shared/parsing-utils";

import { SynthesisBubble } from "./SynthesisBubble";

// --- Helper Functions ---

interface AiTurnBlockProps {
  aiTurn: AiTurn;
}


const AiTurnBlock: React.FC<AiTurnBlockProps> = ({
  aiTurn,
}) => {
  const renderCount = useRef(0);
  renderCount.current += 1;

  useEffect(() => {
    console.log(`[AiTurnBlock] Rendered ${renderCount.current} times. ID: ${aiTurn.id}`);
  });

  // --- CONNECTED STATE LOGIC ---

  const synthesisProvider = useAtomValue(synthesisProviderAtom);
  const mappingProvider = useAtomValue(mappingProviderAtom);
  const { handleClipClick } = useClipActions();
  const [globalActiveRecomputeState] = useAtom(activeRecomputeStateAtom);
  const providerErrors = useAtomValue(providerErrorsAtom);
  const retryableProviders = useAtomValue(retryableProvidersAtom);
  const { retryProviders } = useRetryProvider();

  // Streaming UX: determine if this is the active running turn
  const activeAntagonistPid = useAtomValue(antagonistProviderAtom);
  const activeAiTurnId = useAtomValue(activeAiTurnIdAtom);
  const globalIsLoading = useAtomValue(isLoadingAtom);
  const workflowProgress = useAtomValue(workflowProgressAtom);
  const isThisTurnActive = activeAiTurnId === aiTurn.id && globalIsLoading;

  const { output: refinerOutput, isLoading: isRefinerLoading } = useRefinerOutput(aiTurn.id);

  const setChatInput = useSetAtom(chatInputValueAtom);
  const setTrustPanelFocus = useSetAtom(trustPanelFocusAtom);

  const [showEcho, setShowEcho] = useState(false);


  const getProviderName = useCallback((pid: string) => {
    const cfg = LLM_PROVIDERS_CONFIG.find(p => String(p.id) === pid);
    return cfg?.name || pid;
  }, []);


  const onClipClick = useCallback(
    (type: "synthesis" | "mapping" | "antagonist", pid: string) => {
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

    const keys = Object.keys(aiTurn.mappingResponses || {});
    return keys[0] || null;
  })();

  const mapperResp = activeMappingClipProviderId ? getLatestResponse(aiTurn.mappingResponses?.[activeMappingClipProviderId]) : null;
  const isMappingError = mapperResp?.status === 'error';
  const isMappingLoading = mapperResp?.status === 'pending' || mapperResp?.status === 'streaming';


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

    // FALLBACK: Extract from raw text using shared utility
    const rawText = (latestMapping as any)?.text;
    if (!rawText || typeof rawText !== 'string') {
      return null;
    }

    const { graphTopology } = parseMappingResponse(rawText);
    return graphTopology;
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
    const providerOrder = new Map(
      LLM_PROVIDERS_CONFIG.map((p, idx) => [String(p.id), idx] as const)
    );
    const providersWithResponses = Object.entries(aiTurn.synthesisResponses)
      .filter(([_, resps]) => Array.isArray(resps) && resps.length > 0);

    // Sort providers by predetermined order or alphabetical
    // This ensures tabs are stable
    const sortedProviders = providersWithResponses.sort((a, b) => {
      const idxA = providerOrder.get(a[0]) ?? Number.POSITIVE_INFINITY;
      const idxB = providerOrder.get(b[0]) ?? Number.POSITIVE_INFINITY;
      if (idxA !== idxB) return idxA - idxB;
      return String(a[0]).localeCompare(String(b[0]));
    });

    sortedProviders.forEach(([pid, resps]) => {
      const name = getProviderName(pid);

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
    const out = LLM_PROVIDERS_CONFIG.reduce<Record<string, ProviderResponse[]>>(
      (acc, p) => {
        acc[String(p.id)] = [];
        return acc;
      },
      {}
    );
    Object.entries(aiTurn.synthesisResponses).forEach(([pid, resp]) => {
      out[pid] = normalizeResponseArray(resp);
    });
    return out;
  }, [aiTurn.id, aiTurn.synthesisVersion]);

  const mappingResponses = useMemo(() => {
    const map = aiTurn.mappingResponses || {};
    const out = LLM_PROVIDERS_CONFIG.reduce<Record<string, ProviderResponse[]>>(
      (acc, p) => {
        acc[String(p.id)] = [];
        return acc;
      },
      {}
    );
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

  const getMappingAndOptions = useCallback(
    (take: ProviderResponse | undefined) => {
      if (!take?.text) return { narrative: "", options: null, graphTopology: null };
      return parseMappingResponse(String(take.text));
    },
    []
  );

  const getOptions = useCallback((): string | null => {
    if (!activeMappingPid) return null;
    const take = getLatestResponse(mappingResponses[activeMappingPid]);
    const fromMeta = (take as any)?.meta?.allAvailableOptions || null;
    if (fromMeta) return String(fromMeta);
    const { options } = getMappingAndOptions(take);
    return options;
  }, [activeMappingPid, mappingResponses, getMappingAndOptions]);

  const displayedMappingTake = useMemo(() => {
    if (!activeMappingPid) return undefined;
    return getLatestResponse(mappingResponses[activeMappingPid]);
  }, [activeMappingPid, mappingResponses]);

  const displayedMappingText = useMemo(() => {
    if (!displayedMappingTake?.text) return "";
    return String(getMappingAndOptions(displayedMappingTake).narrative ?? "");
  }, [displayedMappingTake, getMappingAndOptions]);


  const hasMapping = !!(activeMappingPid && displayedMappingTake?.text);


  const requestedSynth = (aiTurn.meta as any)?.requestedFeatures?.synthesis;
  const wasSynthRequested =
    requestedSynth === undefined ? true : !!requestedSynth;


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
          <div className="flex justify-center w-full transition-all duration-300 px-4">
            <div className="w-full max-w-7xl">
              <div className="flex-1 flex flex-col relative min-w-0" style={{ maxWidth: '820px', margin: '0 auto' }}>

                <SynthesisBubble
                  aiTurn={aiTurn}
                  effectiveActiveSynthTab={effectiveActiveSynthTab}
                  synthesisTabs={synthesisTabs}
                  activeSynthTabId={activeSynthTabId}
                  onTabChange={setActiveSynthTabId}
                  refinerOutput={refinerOutput}
                  isRefinerLoading={isRefinerLoading}
                  showEcho={showEcho}
                  setShowEcho={setShowEcho}
                  onDecisionMapOpen={() => setIsDecisionMapOpen({ turnId: aiTurn.id })}
                  onTrustPanelOpen={() => setActiveSplitPanel({ turnId: aiTurn.id, providerId: '__trust__' })}
                  onGemActionClick={(action) => {
                    setChatInput(action);
                    setTrustPanelFocus({ turnId: aiTurn.id, section: 'context' });
                  }}
                  wasSynthRequested={wasSynthRequested}
                  isSynthesisTarget={isSynthesisTarget}
                  isMappingError={isMappingError}
                  isMappingLoading={isMappingLoading}
                  activeMappingClipProviderId={activeMappingClipProviderId}
                  onClipClick={onClipClick}
                  latestSynthResponseFallback={activeSynthPid ? getLatestResponse(synthesisResponses[activeSynthPid]) : undefined}
                  displayedVoicePid={displayedVoicePid}
                  visibleProviderIds={visibleProviderIds}
                  isThisTurnActive={isThisTurnActive}
                  workflowProgress={workflowProgress as any}
                  onOrbClick={(pid) => setActiveSplitPanel({ turnId: aiTurn.id, providerId: pid })}
                  isDecisionMapOpen={isDecisionMapOpen?.turnId === aiTurn.id}
                  onCopyFullTurn={handleCopyFullTurn}
                  includePromptInCopy={includePromptInCopy}
                  onToggleIncludePrompt={() => setIncludePromptInCopy(!includePromptInCopy)}
                  activeAntagonistPid={activeAntagonistPid}
                  providersConfig={LLM_PROVIDERS_CONFIG}
                  onArtifactClick={(artifact) => setSelectedArtifact(artifact)}
                  providerErrors={providerErrors}
                  retryableProviders={retryableProviders}
                  onRetryAll={() => aiTurn.sessionId && retryProviders(aiTurn.sessionId as string, aiTurn.id, retryableProviders)}
                  getProviderName={getProviderName}
                  onRetryProvider={(pid) => aiTurn.sessionId && retryProviders(aiTurn.sessionId as string, aiTurn.id, [pid])}
                  CouncilOrbs={CouncilOrbs}
                />

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
