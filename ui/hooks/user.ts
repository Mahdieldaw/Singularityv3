import { useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { turnsMapAtom, alertTextAtom, synthesisProviderAtom, mappingProviderAtom, refinerProviderAtom } from "../state/atoms";
import { useRoundActions } from "./useRoundActions";
import type { AiTurn } from "../types";
import { PRIMARY_STREAMING_PROVIDER_IDS } from "../constants";

export function useClipActions() {
    const turnsMap = useAtomValue(turnsMapAtom);
    const setSynthesisProvider = useSetAtom(synthesisProviderAtom);
    const setMappingProvider = useSetAtom(mappingProviderAtom);
    const setRefinerProvider = useSetAtom(refinerProviderAtom);
    const setAlertText = useSetAtom(alertTextAtom);
    const setTurnsMap = useSetAtom(turnsMapAtom);
    const { runSynthesisForAiTurn, runMappingForAiTurn, runRefinerForAiTurn } = useRoundActions();

    const handleClipClick = useCallback(
        async (
            aiTurnId: string,
            type: "synthesis" | "mapping" | "refiner",
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
                    return;
                }

                const responsesMap =
                    type === "synthesis"
                        ? aiTurn.synthesisResponses || {}
                        : type === "mapping"
                            ? aiTurn.mappingResponses || {}
                            : type === "refiner"
                                ? aiTurn.refinerResponses || {}
                                : {};
                const responseEntry = responsesMap[providerId];

                // Check if we have a valid (non-error) existing response
                const lastResponse = Array.isArray(responseEntry) && responseEntry.length > 0
                    ? responseEntry[responseEntry.length - 1]
                    : undefined;
                const hasValidExisting = lastResponse && lastResponse.status !== "error";

                // Update global provider preference (Crown Move / Mapper Select)
                if (type === "synthesis") {
                    setSynthesisProvider(providerId);
                } else if (type === "mapping") {
                    setMappingProvider(providerId);
                } else {
                    // Refiner
                    setRefinerProvider(providerId);
                }

                // If the selected provider is not present in the AI turn's batchResponses, add an optimistic
                // batch response so the batch count increases and the model shows up in the batch area.
                if (!aiTurn.batchResponses || !aiTurn.batchResponses[providerId]) {
                    setTurnsMap((draft) => {
                        const turn = draft.get(aiTurnId) as AiTurn | undefined;
                        if (!turn || turn.type !== "ai") return;
                        turn.batchResponses = (turn.batchResponses || {}) as any;
                        if (!turn.batchResponses[providerId]) {
                            const initialStatus: "streaming" | "pending" =
                                PRIMARY_STREAMING_PROVIDER_IDS.includes(providerId)
                                    ? "streaming"
                                    : "pending";
                            (turn.batchResponses as any)[providerId] = [
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

                if (type === "synthesis") {
                    await runSynthesisForAiTurn(aiTurnId, providerId);
                } else if (type === "mapping") {
                    await runMappingForAiTurn(aiTurnId, providerId);
                } else {
                    // Refiner Recompute
                    await runRefinerForAiTurn(aiTurnId, providerId);
                }
            } catch (err) {
                console.error("[ClipActions] handleClipClick failed:", err);
                setAlertText("Failed to activate clip. Please try again.");
            }
        },
        [
            turnsMap,
            runSynthesisForAiTurn,
            runMappingForAiTurn,
            runRefinerForAiTurn,
            setAlertText,
            setTurnsMap,
            setSynthesisProvider,
            setMappingProvider,
            setRefinerProvider
        ],
    );

    return { handleClipClick };
}