import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { turnsMapAtom } from "../state/atoms";
import { AiTurn, ProviderResponse } from "../types";
import { parseRefinerOutput, RefinerOutput } from "../../shared/parsing-utils";

export function useRefinerOutput(aiTurnId: string | null, forcedProviderId?: string | null) {
    const turnsMap = useAtomValue(turnsMapAtom);

    return useMemo(() => {
        if (!aiTurnId) return { output: null, isLoading: false };

        const turn = turnsMap.get(aiTurnId);
        if (!turn || turn.type !== "ai") return { output: null, isLoading: false };

        const aiTurn = turn as AiTurn;
        const refinerResponses = aiTurn.refinerResponses;

        if (!refinerResponses || Object.keys(refinerResponses).length === 0) {
            return { output: null, isLoading: false };
        }

        // Use forced provider if valid, otherwise fallback to first available
        // Better logic: prioritize the one that was most recently updated? 
        // For simple recompute, Object.keys logic + forcing is enough.

        let providerId = forcedProviderId;
        if (!providerId || !refinerResponses[providerId]) {
            // Fallback: pick the last key (likely most recent?) or first? 
            // Object.keys order is not strictly guaranteed but usually fine.
            // Let's try to find one that is "streaming" or "completed".
            const keys = Object.keys(refinerResponses);
            providerId = keys[keys.length - 1];
        }

        const responses = refinerResponses[providerId];
        if (!responses || responses.length === 0) return { output: null, isLoading: false };

        const latestResponse = responses[responses.length - 1];

        // Check if streaming/pending
        const isLoading = latestResponse.status === "streaming" || latestResponse.status === "pending";

        // Parse output
        // The raw text contains the markdown structure
        let parsed: RefinerOutput | null = null;
        try {
            parsed = parseRefinerOutput(latestResponse.text);
        } catch (e) {
            console.warn("Failed to parse refiner output", e);
        }

        return {
            output: parsed,
            isLoading,
            providerId,
            rawText: latestResponse.text
        };
    }, [aiTurnId, turnsMap, forcedProviderId]);
}
