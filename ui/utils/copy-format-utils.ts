import { AiTurn, GraphTopology, ProviderResponse, UserTurn, TurnMessage, isUserTurn, isAiTurn, HistorySessionSummary, FullSessionPayload } from "../types";
import { LLM_PROVIDERS_CONFIG } from "../constants";

// ============================================================================
// MARKDOWN FORMATTING UTILITIES
// ============================================================================

export function formatSynthesisForMd(text: string, providerName: string): string {
    return `## Singularity Synthesis (via ${providerName})\n\n${text}\n\n`;
}

export function formatDecisionMapForMd(
    narrative: string,
    options: string | null,
    graphTopology: GraphTopology | null
): string {
    let md = "### The Decision Landscape\n\n";

    if (narrative) {
        // Convert narrative blockquotes or ensure they stand out
        const lines = narrative.split('\n');
        // If narrative already uses blockquotes, keep them. If not, maybe quote the whole thing?
        // For now, raw narrative is usually fine if it's structured.
        md += `${narrative}\n\n`;
    }

    if (options) {
        md += `#### Options\n\n${options}\n\n`;
    }

    if (graphTopology) {
        md += `#### Graph Topology\n\n${formatGraphForMd(graphTopology)}\n\n`;
    }

    return md;
}

export function formatGraphForMd(topology: GraphTopology): string {
    if (!topology.edges || topology.edges.length === 0) return "*No graph relationships defined.*";

    const lines = topology.edges.map(edge => {
        const source = topology.nodes.find(n => n.id === edge.source)?.label || edge.source;
        const target = topology.nodes.find(n => n.id === edge.target)?.label || edge.target;
        return `- **${source}** --[${edge.type}]--> **${target}**`;
    });

    return lines.join('\n');
}

export function formatProviderResponseForMd(response: ProviderResponse, providerName: string): string {
    const text = response.text || "*Empty response*";
    return `**${providerName}**:\n\n${text}\n\n`;
}

export function formatTurnForMd(
    turnid: string,
    userPrompt: string | null,
    synthesisText: string | null,
    synthesisProviderId: string | undefined,
    decisionMap: { narrative?: string; options?: string | null; topology?: GraphTopology | null } | null,
    batchResponses: Record<string, ProviderResponse>,
    includePrompt: boolean = true
): string {
    let md = "";

    // 1. User Prompt
    if (includePrompt && userPrompt) {
        md += `## User\n\n${userPrompt}\n\n`;
    }

    // 2. Synthesis
    if (synthesisText) {
        const provider = LLM_PROVIDERS_CONFIG.find(p => String(p.id) === synthesisProviderId);
        const providerName = provider ? provider.name : (synthesisProviderId || "Unknown");
        md += formatSynthesisForMd(synthesisText, providerName);
    }

    // 3. Decision Map
    if (decisionMap) {
        md += formatDecisionMapForMd(
            decisionMap.narrative || "",
            decisionMap.options || null,
            decisionMap.topology || null
        );
    }

    // 4. Raw Responses (Collapsible)
    const providers = LLM_PROVIDERS_CONFIG;
    const responsesWithContent = providers
        .map(p => ({
            name: p.name,
            id: String(p.id),
            response: (batchResponses[String(p.id)] as any)?.isArray ? (batchResponses[String(p.id)] as any)[0] : batchResponses[String(p.id)] // Handle simple vs array if needed, but usually we just grab latest logic before calling this
        }))
        .filter(item => {
            // We expect the caller to pass fully resolved/latest responses, but let's be safe
            // If batchResponses is directly from AiTurn, it might be an array.
            // We'll rely on the caller to normalize `batchResponses` to { [pid]: ProviderResponse } (single latest)
            // OR we handle it here. Let's assume input is Record<string, ProviderResponse>.
            return !!item.response;
        });

    // Actually, let's make the input signature strictly Record<string, ProviderResponse>
    // where ProviderResponse is the *latest* one.

    if (responsesWithContent.length > 0) {
        md += `<details>\n<summary>Raw Council Outputs (${responsesWithContent.length} Models)</summary>\n\n`;

        responsesWithContent.forEach(({ name, response }) => {
            // Check if it's the actual response object
            if (response && typeof response === 'object' && 'text' in response) {
                md += formatProviderResponseForMd(response as ProviderResponse, name);
            }
        });

        md += `</details>\n\n`;
    }

    return md;
}

// ============================================================================
// JSON EXPORT UTILITIES (SAF - Singularity Archive Format)
// ============================================================================

export interface SingularityExport {
    version: "1.0";
    exportedAt: number;
    session: {
        id: string;
        title: string;
        sessionId: string;
        turns: SanitizedTurn[];
    };
}

type SanitizedTurn = SanitizedUserTurn | SanitizedAiTurn;

interface SanitizedUserTurn {
    role: "user";
    timestamp: number;
    content: string;
}

interface SanitizedAiTurn {
    role: "council";
    timestamp: number;
    synthesis?: {
        providerId: string;
        text: string;
        modelName?: string;
    };
    decisionMap?: {
        providerId: string;
        narrative: string;
        options: string | null;
        graphTopology: GraphTopology | null;
    };
    councilMemberOutputs: {
        providerId: string;
        text: string;
        modelName?: string;
    }[];
}

/**
 * Sanitizes a full session payload for export.
 * STRICTLY WHITELISTS fields to prevent leaking of providerContexts, cursors, or tokens.
 */
export function sanitizeSessionForExport(fullSession: FullSessionPayload): SingularityExport {
    const sanitizedTurns: SanitizedTurn[] = fullSession.turns.map(turn => {
        if (isUserTurn(turn)) {
            return {
                role: "user",
                timestamp: turn.createdAt,
                content: turn.text
            } as SanitizedUserTurn;
        }

        if (isAiTurn(turn)) {
            // 1. Extract Synthesis
            let synthesis: SanitizedAiTurn['synthesis'] | undefined;
            // We need to determine WHICH synthesis was "active".
            // For export, we might just look at metadata or take the first completed.
            // Let's rely on metadata if present, else scan.
            const synthPid = (turn.meta as any)?.synthesizer;
            const synthResponses = turn.synthesisResponses || {};

            // Default to the one in meta, or the first one we find
            let targetSynthPid = synthPid;
            if (!targetSynthPid) {
                // Find first with text
                targetSynthPid = Object.keys(synthResponses).find(pid => {
                    const arr = synthResponses[pid];
                    return Array.isArray(arr) && arr.some(r => r.text);
                });
            }

            if (targetSynthPid && synthResponses[targetSynthPid]) {
                const resps = synthResponses[targetSynthPid];
                const latest = Array.isArray(resps) ? resps[resps.length - 1] : resps;
                if (latest && latest.text) {
                    synthesis = {
                        providerId: targetSynthPid,
                        text: latest.text,
                        // We don't have strict modelName stored in response usually, but maybe in providerContext (which we don't access here per turn)
                    };
                }
            }

            // 2. Extract Decision Map (Mapping)
            let decisionMap: SanitizedAiTurn['decisionMap'] | undefined;
            const mapPid = (turn.meta as any)?.mapper;
            const mapResponses = turn.mappingResponses || {};

            let targetMapPid = mapPid;
            if (!targetMapPid) {
                targetMapPid = Object.keys(mapResponses).find(pid => {
                    const arr = mapResponses[pid];
                    return Array.isArray(arr) && arr.some(r => r.text);
                });
            }

            if (targetMapPid && mapResponses[targetMapPid]) {
                const resps = mapResponses[targetMapPid];
                const latest = Array.isArray(resps) ? resps[resps.length - 1] : resps; // as ProviderResponse
                if (latest && latest.text) {
                    // We need to parse it to get clean narrative vs options vs topology?
                    // The JSON spec asks for narrative, optionsList, graphTopology.
                    // We can try to use the meta if available, or just raw text if not parsed yet.
                    // Ideally we re-use the parsing logic, but simpler is safer:
                    // If we have meta options/topology, use them.
                    const meta = (latest as any).meta || {};

                    decisionMap = {
                        providerId: targetMapPid,
                        narrative: latest.text, // Warning: this is full text. Ideally we strip options?
                        // For "System Restore", raw text + explicit fields is best.
                        // Current UI displays "narrative" as just the text. 
                        // Let's keep text as narrative for now to be safe and lossless.
                        options: meta.allAvailableOptions || null,
                        graphTopology: meta.graphTopology || null
                    };
                }
            }

            // 3. Batch Outputs
            const councilMemberOutputs: SanitizedAiTurn['councilMemberOutputs'] = [];
            const batchResponses = turn.batchResponses || {};
            Object.entries(batchResponses).forEach(([pid, val]) => {
                const arr = Array.isArray(val) ? val : [val];
                const latest = arr[arr.length - 1]; // ProviderResponse
                if (latest && latest.text) {
                    councilMemberOutputs.push({
                        providerId: pid,
                        text: latest.text
                    });
                }
            });

            return {
                role: "council",
                timestamp: (turn as any).createdAt || Date.now(), // AiTurn interface in contract doesn't force createdAt, check persistence
                synthesis,
                decisionMap,
                councilMemberOutputs
            } as SanitizedAiTurn;
        }

        // Fallback for unknown turn types
        return {
            role: "user",
            timestamp: Date.now(),
            content: "Unknown turn type"
        } as SanitizedUserTurn;
    });

    return {
        version: "1.0",
        exportedAt: Date.now(),
        session: {
            id: fullSession.id,
            title: fullSession.title,
            sessionId: fullSession.sessionId,
            turns: sanitizedTurns
        }
    };
}
