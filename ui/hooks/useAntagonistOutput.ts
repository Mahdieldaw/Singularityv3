import { useEffect, useMemo, useState } from "react";
import { useAtomValue } from "jotai";
import { turnsMapAtom } from "../state/atoms";
import { AiTurn } from "../types";
import { parseAntagonistOutput, AntagonistOutput } from "../../shared/parsing-utils";
import { SimpleIndexedDBAdapter } from "../../src/persistence/SimpleIndexedDBAdapter";

export function useAntagonistOutput(aiTurnId: string | null, forcedProviderId?: string | null) {
    const turnsMap = useAtomValue(turnsMapAtom);
    const [state, setState] = useState<{ output: AntagonistOutput | null; isLoading: boolean; providerId?: string | null; rawText?: string } | null>(null);

    const memoResult = useMemo(() => {
        if (!aiTurnId) return { output: null as AntagonistOutput | null, isLoading: false };

        const turn = turnsMap.get(aiTurnId);
        if (!turn || turn.type !== "ai") return { output: null as AntagonistOutput | null, isLoading: false };

        const aiTurn = turn as AiTurn;
        const antagonistResponses = aiTurn.antagonistResponses;

        if (!antagonistResponses || Object.keys(antagonistResponses).length === 0) {
            return { output: null as AntagonistOutput | null, isLoading: false };
        }

        // Use forced provider if valid, otherwise fallback to first available
        let providerId = forcedProviderId;
        if (!providerId || !antagonistResponses[providerId]) {
            const keys = Object.keys(antagonistResponses);
            providerId = keys[keys.length - 1];
        }

        const responses = antagonistResponses[providerId];
        if (!responses || responses.length === 0) return { output: null as AntagonistOutput | null, isLoading: false };

        const latestResponse = responses[responses.length - 1];

        // Check if streaming/pending
        const isLoading = latestResponse.status === "streaming" || latestResponse.status === "pending";

        // Parse output
        let parsed: AntagonistOutput | null = null;
        try {
            parsed = parseAntagonistOutput(latestResponse.text);
        } catch (e) {
            console.warn("Failed to parse antagonist output", e);
        }

        return {
            output: parsed,
            isLoading,
            providerId,
            rawText: latestResponse.text
        } as { output: AntagonistOutput | null; isLoading: boolean; providerId?: string | null; rawText?: string };
    }, [aiTurnId, turnsMap, forcedProviderId]);

    useEffect(() => {
        setState(memoResult);
    }, [memoResult]);

    useEffect(() => {
        const run = async () => {
            if (!aiTurnId) return;

            const current = state || memoResult;
            const hasCore = !!current?.output;
            // Check for richer data
            const hasRicher = !!current?.output?.the_prompt?.text ||
                (current?.output?.the_prompt?.dimensions?.length ?? 0) > 0;

            if (current?.isLoading || hasRicher) return;

            try {
                const adapter = new SimpleIndexedDBAdapter();
                await adapter.init();
                const responses = await adapter.getResponsesByTurnId(aiTurnId);
                const antagonistRecords = (responses || []).filter(r => r && r.responseType === "antagonist");

                if (antagonistRecords.length > 0) {
                    const chosen = (() => {
                        const pid = current?.providerId || state?.providerId || null;
                        if (pid) {
                            const byProvider = antagonistRecords.filter(r => r.providerId === pid);
                            return byProvider[byProvider.length - 1] || antagonistRecords[antagonistRecords.length - 1];
                        }
                        return antagonistRecords[antagonistRecords.length - 1];
                    })();

                    const text = String(chosen.text || "");
                    let parsed: AntagonistOutput | null = null;
                    try {
                        parsed = parseAntagonistOutput(text);
                    } catch (_) {
                        parsed = null;
                    }

                    if (parsed) {
                        // Check for richer data
                        const richer = !!parsed.the_prompt?.text ||
                            (parsed.the_prompt?.dimensions?.length ?? 0) > 0;
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
