// ui/components/AiTurnBlockConnected.tsx
import React, { useCallback, useMemo } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import AiTurnBlock from "./AiTurnBlock";
import ProviderResponseBlockConnected from "./ProviderResponseBlockConnected";

import {
  isReducedMotionAtom,
  showSourceOutputsFamily,
  activeClipsAtom,
  activeRecomputeStateAtom,
  aiTurnSynthesisExpandedFamily,
  aiTurnMappingExpandedFamily,
  aiTurnSynthExpandedFamily,
  aiTurnMapExpandedFamily,
  aiTurnMappingTabFamily,
  aiTurnPrimaryViewFamily,
  turnStreamingStateFamily,
} from "../state/atoms";
import { useClipActions } from "../hooks/useClipActions";
import { useEligibility } from "../hooks/useEligibility";
import type { AiTurn } from "../types";

interface AiTurnBlockConnectedProps {
  aiTurn: AiTurn;
}

export default function AiTurnBlockConnected({
  aiTurn,
}: AiTurnBlockConnectedProps) {
  // Per-turn streaming state (only active turn sees changing values)
  const streamingState = useAtomValue(turnStreamingStateFamily(aiTurn.id));
  const { isLoading, appStep: currentAppStep } = streamingState;

  const [isReducedMotion] = useAtom(isReducedMotionAtom);
  const [showSourceOutputs, setShowSourceOutputs] = useAtom(
    showSourceOutputsFamily(aiTurn.id),
  );
  const [activeClips] = useAtom(activeClipsAtom);
  const { handleClipClick } = useClipActions();
  const { eligibilityMaps } = useEligibility();
  const [activeRecomputeState] = useAtom(activeRecomputeStateAtom);
  const [isSynthesisExpanded, setIsSynthesisExpanded] = useAtom(
    aiTurnSynthesisExpandedFamily(aiTurn.id),
  );
  const [isMappingExpanded, setIsMappingExpanded] = useAtom(
    aiTurnMappingExpandedFamily(aiTurn.id),
  );
  const [synthExpanded, setSynthExpanded] = useAtom(
    aiTurnSynthExpandedFamily(aiTurn.id),
  );
  const [mapExpanded, setMapExpanded] = useAtom(
    aiTurnMapExpandedFamily(aiTurn.id),
  );
  const [mappingTab, setMappingTab] = useAtom(aiTurnMappingTabFamily(aiTurn.id));
  const [primaryView, setPrimaryView] = useAtom(aiTurnPrimaryViewFamily(aiTurn.id));

  // Determine if this turn is currently streaming (for isLive prop)
  const isLive = isLoading && currentAppStep !== "initial";

  const turnClips = activeClips[aiTurn.id] || {};

  // Use user-selected clip, or fall back to the provider used for generation
  // This fixes the issue where "stale" providers are shown if the user changes selection
  // but hasn't clicked a clip yet for the new turn.
  const activeSynthesisClipProviderId =
    turnClips.synthesis || aiTurn.meta?.synthesizer;

  // For mapping, if no explicit selection and meta.mapper is missing,
  // default to the first provider that has mapping responses
  const activeMappingClipProviderId = (() => {
    // User explicitly selected a provider
    if (turnClips.mapping) return turnClips.mapping;

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
            console.log('[AiTurnBlockConnected] Extracted graph topology from historical response for turn:', aiTurn.id);
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('[AiTurnBlockConnected] Failed to extract graph topology from turn ' + aiTurn.id + ':', e);
    }

    return null;
  }, [activeMappingClipProviderId, aiTurn.mappingResponses, aiTurn.id]);

  // Filter activeRecomputeState to only include synthesis/mapping (AiTurnBlock doesn't handle batch)
  const filteredRecomputeState = useMemo(() => {
    if (!activeRecomputeState) return null;
    if (activeRecomputeState.stepType === 'batch') return null;
    return activeRecomputeState as { aiTurnId: string; stepType: "synthesis" | "mapping"; providerId: string; };
  }, [activeRecomputeState]);

  return (
    <AiTurnBlock
      aiTurn={aiTurn}
      isLive={isLive}
      isReducedMotion={isReducedMotion}
      isLoading={isLoading}
      activeRecomputeState={filteredRecomputeState}
      currentAppStep={currentAppStep}
      showSourceOutputs={showSourceOutputs}
      onToggleSourceOutputs={useCallback(
        () => setShowSourceOutputs((prev) => !prev),
        [setShowSourceOutputs],
      )}
      isSynthesisExpanded={isSynthesisExpanded}
      onToggleSynthesisExpanded={useCallback(
        () => setIsSynthesisExpanded((prev) => !prev),
        [setIsSynthesisExpanded],
      )}
      isMappingExpanded={isMappingExpanded}
      onToggleMappingExpanded={useCallback(
        () => setIsMappingExpanded((prev) => !prev),
        [setIsMappingExpanded],
      )}
      synthExpanded={synthExpanded}
      onSetSynthExpanded={useCallback(
        (v: boolean) => setSynthExpanded(v),
        [setSynthExpanded],
      )}
      mapExpanded={mapExpanded}
      onSetMapExpanded={useCallback(
        (v: boolean) => setMapExpanded(v),
        [setMapExpanded],
      )}
      mappingTab={mappingTab}
      onSetMappingTab={useCallback(
        (t: "map" | "options" | "graph") => setMappingTab(t),
        [setMappingTab],
      )}
      activeSynthesisClipProviderId={activeSynthesisClipProviderId}
      activeMappingClipProviderId={activeMappingClipProviderId}
      onClipClick={useCallback(
        (type: "synthesis" | "mapping", pid: string) => {
          void handleClipClick(aiTurn.id, type, pid);
        },
        [handleClipClick, aiTurn.id],
      )}
      primaryView={primaryView}
      onSetPrimaryView={useCallback(
        (view: "synthesis" | "decision-map") => setPrimaryView(view),
        [setPrimaryView],
      )}
      mapStatus={mapStatus}
      graphTopology={graphTopology}
      aiTurnId={aiTurn.id}
    >
      <ProviderResponseBlockConnected aiTurnId={aiTurn.id}
        expectedProviders={aiTurn.meta?.expectedProviders} // ✅ Pass metadata
      />
    </AiTurnBlock>
  );
}
