import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { turnsMapAtom, alertTextAtom, mappingProviderAtom, singularityProviderAtom } from "../state/atoms";
import { useRoundActions } from "./chat/useRoundActions";
import type { AiTurn } from "../types";
import { PRIMARY_STREAMING_PROVIDER_IDS } from "../constants";

export function useClipActions() {
  const turnsMap = useAtomValue(turnsMapAtom);
  const setMappingProvider = useSetAtom(mappingProviderAtom);
  const setSingularityProvider = useSetAtom(singularityProviderAtom);
  const setAlertText = useSetAtom(alertTextAtom);
  const setTurnsMap = useSetAtom(turnsMapAtom);
  const { runMappingForAiTurn, runSingularityForAiTurn } = useRoundActions();

  const handleClipClick = useCallback(
    async (
      aiTurnId: string,
      type: "mapping" | "singularity",
      providerId: string,
    ) => {
      try {
        const aiTurn = turnsMap.get(aiTurnId) as AiTurn | undefined;
        if (!aiTurn || aiTurn.type !== "ai") {
          setAlertText("Cannot find AI turn. Please try again.");
          return;
        }

        // Validate turn is finalized before allowing historical reruns
        const isOptimistic = aiTurn.meta?.isOptimistic === true;
        if (!aiTurn.userTurnId || isOptimistic) {
          setAlertText(
            "Turn data is still loading. Please wait a moment and try again.",
          );
          console.warn("[ClipActions] Attempted rerun on unfinalized turn:", {
            aiTurnId,
            hasUserTurnId: !!aiTurn.userTurnId,
            isOptimistic,
          });
          return;
        }

        const responsesMap =
          type === "mapping"
            ? aiTurn.mappingResponses || {}
            : type === "singularity"
              ? aiTurn.singularityResponses || {}
              : {};
        const responseEntry = responsesMap[providerId];

        // Check if we have a valid (non-error) existing response
        const lastResponse = Array.isArray(responseEntry) && responseEntry.length > 0
          ? responseEntry[responseEntry.length - 1]
          : undefined;
        const hasValidExisting = lastResponse && lastResponse.status !== "error";

        // Update global provider preference (Crown Move / Mapper Select)
        if (type === "mapping") {
          setMappingProvider(providerId);
        } else if (type === "singularity") {
          setSingularityProvider(providerId);
        }

        // If the selected provider is not present in the AI turn's batchResponses, add an optimistic
        // batch response so the batch count increases and the model shows up in the batch area.
        if (!aiTurn.batchResponses || !aiTurn.batchResponses[providerId]) {
          setTurnsMap((draft) => {
            const turn = draft.get(aiTurnId) as AiTurn | undefined;
            if (!turn || turn.type !== "ai") return;
            const batchResponses = ((turn.batchResponses ||= {}) as any);
            if (!batchResponses[providerId]) {
              const initialStatus: "streaming" | "pending" =
                PRIMARY_STREAMING_PROVIDER_IDS.includes(providerId)
                  ? "streaming"
                  : "pending";
              batchResponses[providerId] = [
                {
                  providerId,
                  text: "",
                  status: initialStatus,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              ] as any;
            }
          });
        }

        if (hasValidExisting) return;

        if (type === "mapping") {
          await runMappingForAiTurn(aiTurnId, providerId);
        } else if (type === "singularity") {
          await runSingularityForAiTurn(aiTurnId, providerId);
        }
      } catch (err) {
        console.error("[ClipActions] handleClipClick failed:", err);
        setAlertText("Failed to activate clip. Please try again.");
      }
    },
    [
      turnsMap,
      runMappingForAiTurn,
      setAlertText,
      setTurnsMap,
      setMappingProvider,
      setSingularityProvider,
      runSingularityForAiTurn,
    ],
  );

  return { handleClipClick };
}
