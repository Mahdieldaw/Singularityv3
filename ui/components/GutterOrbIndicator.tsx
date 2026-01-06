import React, { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { selectAtom } from "jotai/utils";
import { activeSplitPanelAtom, selectedModelsAtom, turnsMapAtom, workflowProgressForTurnFamily } from "../state/atoms";
import type { AiTurn } from "../types";
import clsx from "clsx";
import { CouncilOrbs } from "./CouncilOrbs";
import { LLM_PROVIDERS_CONFIG } from "../constants";

export function GutterOrbIndicator({ turnId }: { turnId: string }) {
  const [isHovered, setIsHovered] = useState(false);
  const setActiveSplitPanel = useSetAtom(activeSplitPanelAtom);
  const selectedModels = useAtomValue(selectedModelsAtom);
  const turn = useAtomValue(
    useMemo(() => selectAtom(turnsMapAtom, (map) => map.get(turnId)), [turnId]),
  );
  const workflowProgress = useAtomValue(workflowProgressForTurnFamily(turnId));

  const { providerIds, providerMeta } = useMemo(() => {
    if (!turn || turn.type !== "ai") return { providerIds: [] as string[], providerMeta: null as any };

    const aiTurn = turn as AiTurn;
    const batchKeys = Object.keys(aiTurn.batchResponses || {});
    // const meta = (aiTurn as any)?.meta || null;

    const providerMeta = batchKeys.map((pid) => {
      const arr: any[] = Array.isArray((aiTurn.batchResponses as any)?.[pid])
        ? (aiTurn.batchResponses as any)[pid]
        : [];
      const latest = arr.length > 0 ? arr[arr.length - 1] : null;
      const status = (latest?.status as string | undefined) || "pending";
      return { pid: String(pid), status };
    });

    return { providerIds: providerMeta.map((p) => p.pid), providerMeta };
  }, [turn]);

  const effectiveProviderIds = useMemo(() => {
    const fromWorkflow = Object.keys(workflowProgress || {});
    if (fromWorkflow.length > 0) return fromWorkflow;
    if (providerIds.length > 0) return providerIds;
    return LLM_PROVIDERS_CONFIG.filter((p) => p.id !== "system" && !!selectedModels?.[p.id]).map((p) => p.id);
  }, [providerIds, selectedModels, workflowProgress]);

  const displayProviders = useMemo(() => {
    const allowed = new Set(effectiveProviderIds.map(String));
    return LLM_PROVIDERS_CONFIG.filter((p) => p.id !== "system" && allowed.has(String(p.id)));
  }, [effectiveProviderIds]);

  const voiceProviderId = useMemo(() => {
    const mapper = (turn as any)?.meta?.mapper;
    if (mapper && effectiveProviderIds.includes(String(mapper))) return String(mapper);
    return effectiveProviderIds[0] ? String(effectiveProviderIds[0]) : null;
  }, [effectiveProviderIds, turn]);

  const isWorkflowActive = useMemo(() => {
    const states = Object.values(workflowProgress || {});
    if (states.length === 0) return false;
    return states.some((s: any) => {
      const stage = String(s?.stage || "idle");
      return stage !== "idle" && stage !== "complete";
    });
  }, [workflowProgress]);

  const isAutoExpanded = useMemo(() => {
    if (!providerMeta || providerMeta.length === 0) return false;
    return providerMeta.some((p: any) => {
      const s = String(p.status || "");
      return s === "pending" || s === "streaming";
    });
  }, [providerMeta]);

  const isExpanded = isWorkflowActive || isAutoExpanded || isHovered;

  if (!turn || (turn as any).type !== "ai") return null;
  if (effectiveProviderIds.length === 0) return null;

  return (
    <div
      className="gutter-orb-indicator absolute right-2 top-1/2 -translate-y-1/2"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isWorkflowActive ? (
        <div className="pointer-events-auto origin-right scale-75">
          <CouncilOrbs
            turnId={turnId}
            providers={displayProviders as any}
            voiceProviderId={voiceProviderId}
            visibleProviderIds={effectiveProviderIds}
            variant="historical"
            workflowProgress={workflowProgress as any}
            onOrbClick={(providerId) => setActiveSplitPanel({ turnId, providerId })}
          />
        </div>
      ) : (
        <button
          type="button"
          className={clsx(
            "orb-collapsed w-2.5 h-2.5 rounded-full transition-all duration-200",
            isAutoExpanded ? "bg-intent-warning animate-pulse" : "bg-text-secondary/50 hover:bg-text-secondary/70",
          )}
          aria-label="Show model responses"
          onClick={(e) => {
            e.stopPropagation();
            const first = effectiveProviderIds[0];
            if (first) setActiveSplitPanel({ turnId, providerId: first });
          }}
        />
      )}

      {!isWorkflowActive && isExpanded && (
        <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 pointer-events-auto">
          <div className="bg-surface-raised/95 border border-border-subtle rounded-xl shadow-lg px-3 py-2 origin-right scale-90">
            <CouncilOrbs
              turnId={turnId}
              providers={displayProviders as any}
              voiceProviderId={voiceProviderId}
              visibleProviderIds={effectiveProviderIds}
              variant="historical"
              onOrbClick={(providerId) => setActiveSplitPanel({ turnId, providerId })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(GutterOrbIndicator);
