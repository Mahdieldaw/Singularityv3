import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { turnsMapAtom } from "../state/atoms";
import { AiTurn } from "../types";
import { parseRefinerOutput, RefinerOutput } from "../../shared/parsing-utils";
import { SimpleIndexedDBAdapter } from "../../src/persistence/SimpleIndexedDBAdapter";

export interface RefinerOutputState {
    output: RefinerOutput | null;
    isLoading: boolean;
    isError: boolean;
    providerId?: string | null;
    rawText?: string;
}

export function useRefinerOutput(aiTurnId: string | null, forcedProviderId?: string | null): RefinerOutputState {
    const turnsMap = useAtomValue(turnsMapAtom);
    const [state, setState] = useState<RefinerOutputState | null>(null);

    const memoResult = useMemo(() => {
        if (!aiTurnId) return { output: null, isLoading: false, isError: false };

        const turn = turnsMap.get(aiTurnId);
        if (!turn || turn.type !== "ai") return { output: null, isLoading: false, isError: false };

        const aiTurn = turn as AiTurn;
        const refinerResponses = aiTurn.refinerResponses;

        if (!refinerResponses || Object.keys(refinerResponses).length === 0) {
            return { output: null, isLoading: false, isError: false };
        }

        // Use forced provider if valid, otherwise fallback to first available
        let providerId = forcedProviderId;
        if (!providerId || !refinerResponses[providerId]) {
            const keys = Object.keys(refinerResponses);
            providerId = keys[keys.length - 1];
        }

        const responses = refinerResponses[providerId];
        if (!responses || responses.length === 0) return { output: null, isLoading: false, isError: false };

        const latestResponse = responses[responses.length - 1];

        // Check if streaming/pending or error
        const isLoading = latestResponse.status === "streaming" || latestResponse.status === "pending";
        const isError = latestResponse.status === "error";

        // Parse output
        let parsed: RefinerOutput | null = null;
        try {
            parsed = parseRefinerOutput(latestResponse.text);
        } catch (e) {
            console.warn("Failed to parse refiner output", e);
        }

        return {
            output: parsed,
            isLoading,
            isError,
            providerId,
            rawText: latestResponse.text
        };
    }, [aiTurnId, turnsMap, forcedProviderId]);

    useEffect(() => {
        setState(memoResult);
    }, [memoResult]);

    useEffect(() => {
        const run = async () => {
            if (!aiTurnId) return;

            const current = state || memoResult;
            const hasCore = !!current?.output;
            // Check for richer data using new structure
            const hasRicher = !!current?.output?.trustInsights ||
                !!current?.output?.gem ||
                !!current?.output?.leap?.action;

            if (current?.isLoading || hasRicher) return;

            try {
                const adapter = new SimpleIndexedDBAdapter();
                await adapter.init();
                const responses = await adapter.getResponsesByTurnId(aiTurnId);
                const refinerRecords = (responses || []).filter(r => r && r.responseType === "refiner");

                if (refinerRecords.length > 0) {
                    const chosen = (() => {
                        const pid = current?.providerId || state?.providerId || null;
                        if (pid) {
                            const byProvider = refinerRecords.filter(r => r.providerId === pid);
                            return byProvider[byProvider.length - 1] || refinerRecords[refinerRecords.length - 1];
                        }
                        return refinerRecords[refinerRecords.length - 1];
                    })();

                    const text = String(chosen.text || "");
                    let parsed: RefinerOutput | null = null;
                    try {
                        parsed = parseRefinerOutput(text);
                    } catch (_) {
                        parsed = null;
                    }

                    if (parsed) {
                        // Check for richer data using new structure
                        const richer = !!parsed.trustInsights ||
                            !!parsed.gem ||
                            !!parsed.leap?.action;
                        if (!hasCore || richer) {
                            setState({
                                output: parsed,
                                isLoading: false,
                                isError: false,
                                providerId: chosen.providerId || current?.providerId || null,
                                rawText: text,
                            });
                        }
                    }
                }

                await adapter.close();
            } catch (_) { }
        };
        run();
    }, [aiTurnId, memoResult, state]);

    return state || memoResult;
}
