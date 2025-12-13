import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { turnsMapAtom } from "../state/atoms";
import { AiTurn, ProviderResponse } from "../types";
import { parseRefinerOutput, RefinerOutput } from "../../shared/parsing-utils";
import { SimpleIndexedDBAdapter } from "../../src/persistence/SimpleIndexedDBAdapter";

export function useRefinerOutput(aiTurnId: string | null, forcedProviderId?: string | null) {
    const turnsMap = useAtomValue(turnsMapAtom);
    const [state, setState] = useState<{ output: RefinerOutput | null; isLoading: boolean; providerId?: string | null; rawText?: string } | null>(null);

    const memoResult = useMemo(() => {
        if (!aiTurnId) return { output: null as RefinerOutput | null, isLoading: false };

        const turn = turnsMap.get(aiTurnId);
        if (!turn || turn.type !== "ai") return { output: null as RefinerOutput | null, isLoading: false };

        const aiTurn = turn as AiTurn;
        const refinerResponses = aiTurn.refinerResponses;

        if (!refinerResponses || Object.keys(refinerResponses).length === 0) {
            return { output: null as RefinerOutput | null, isLoading: false };
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
        if (!responses || responses.length === 0) return { output: null as RefinerOutput | null, isLoading: false };

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
        } as { output: RefinerOutput | null; isLoading: boolean; providerId?: string | null; rawText?: string };
    }, [aiTurnId, turnsMap, forcedProviderId]);

    useEffect(() => {
        setState(memoResult);
    }, [memoResult]);

    useEffect(() => {
        const run = async () => {
            if (!aiTurnId) return;

            const current = state || memoResult;
            const hasCore = !!current?.output;
            const hasRicher = !!current?.output?.synthesisAccuracy || (current?.output?.gaps && current.output.gaps.length > 0) || (current?.output?.verificationTriggers && current.output.verificationTriggers.length > 0) || !!current?.output?.reframingSuggestion;

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
                        const richer = !!parsed.synthesisAccuracy || (parsed.gaps && parsed.gaps.length > 0) || (parsed.verificationTriggers && parsed.verificationTriggers.length > 0) || !!parsed.reframingSuggestion;
                        if (!hasCore || richer) {
                            setState({
                                output: parsed,
                                isLoading: false,
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
