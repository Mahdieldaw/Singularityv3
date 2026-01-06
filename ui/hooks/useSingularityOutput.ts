import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { turnsMapAtom } from "../state/atoms";
import { AiTurn } from "../types";
import { SingularityOutput } from "../../shared/contract";

export interface SingularityOutputState {
    output: SingularityOutput | null;
    isLoading: boolean;
    isError: boolean;
    providerId?: string | null;
    rawText?: string;
    error?: any;
}

export function useSingularityOutput(aiTurnId: string | null, forcedProviderId?: string | null): SingularityOutputState {
    const turnsMap = useAtomValue(turnsMapAtom);
    const [state, setState] = useState<SingularityOutputState | null>(null);

    const memoResult = useMemo(() => {
        if (!aiTurnId) return { output: null, isLoading: false, isError: false };

        const turn = turnsMap.get(aiTurnId);
        if (!turn || turn.type !== "ai") return { output: null, isLoading: false, isError: false };

        const aiTurn = turn as AiTurn;
        const singularityResponses = aiTurn.singularityResponses;

        if (!singularityResponses || Object.keys(singularityResponses).length === 0) {
            return { output: null, isLoading: false, isError: false };
        }

        // Use forced provider if valid, otherwise fallback to first available
        let providerId = forcedProviderId;
        if (!providerId || !singularityResponses[providerId]) {
            const keys = Object.keys(singularityResponses);
            providerId = keys[keys.length - 1];
        }

        const responses = singularityResponses[providerId];
        if (!responses || responses.length === 0) return { output: null, isLoading: false, isError: false };

        const latestResponse = responses[responses.length - 1];

        // Check if streaming/pending or error
        const isLoading = latestResponse.status === "streaming" || latestResponse.status === "pending";
        const isError = latestResponse.status === "error";

        const output: SingularityOutput = {
            text: latestResponse.text,
            providerId,
            timestamp: latestResponse.createdAt || Date.now(),
            leakageDetected: (latestResponse.meta as any)?.leakageDetected,
            leakageViolations: (latestResponse.meta as any)?.leakageViolations
        };

        return {
            output,
            isLoading,
            isError,
            providerId,
            rawText: latestResponse.text,
            error: (latestResponse.meta as any)?.error
        };
    }, [aiTurnId, turnsMap, forcedProviderId]);

    useEffect(() => {
        setState(memoResult);
    }, [memoResult]);

    return state || memoResult;
}
