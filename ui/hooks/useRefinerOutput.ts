import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { turnsMapAtom } from "../state/atoms";
import { AiTurn, ProviderResponse } from "../types";
import { parseRefinerOutput, RefinerOutput } from "../../shared/parsing-utils";

export function useRefinerOutput(aiTurnId: string | null) {
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

        // Prefer the refiner output associated with the synthesizer if available,
        // otherwise take the first available refiner output.
        // NOTE: Currently we only have one refiner (usually same as synthesizer or a strong model).
        // The backend stores refiner output under "refinerProvider" ID.

        const providerId = Object.keys(refinerResponses)[0];
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
    }, [aiTurnId, turnsMap]); // Re-run when turnsMap changes (which happens on streaming updates)
}
