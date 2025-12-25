import React, { useState } from "react";
import { AiTurn } from "../../../types";
import { ChevronDownIcon, ChevronUpIcon } from "../../Icons";

interface RawResponseCardProps {
    turn: AiTurn | null;
}

export const RawResponseCard: React.FC<RawResponseCardProps> = ({ turn }) => {
    const [isOpen, setIsOpen] = useState(false);

    if (!turn || !turn.batchResponses) return null;

    const providers = Object.entries(turn.batchResponses);

    return (
        <div className="mt-4 border-t border-border-subtle pt-2">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors py-2 px-1 w-full"
            >
                {isOpen ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />}
                <span>Raw Model Responses ({providers.length})</span>
            </button>

            {isOpen && (
                <div className="space-y-2 mt-2 animate-in slide-in-from-top-1">
                    {providers.map(([providerId, responses]) => {
                        const latest = Array.isArray(responses) ? responses[responses.length - 1] : responses;
                        if (!latest) return null;

                        return (
                            <div key={providerId} className="bg-surface-base border border-border-subtle rounded-md overflow-hidden">
                                <div className="bg-surface-highlight px-3 py-1.5 text-xs font-medium text-text-primary capitalize flex justify-between">
                                    <span>{providerId}</span>
                                    <span className="text-[10px] text-text-muted opacity-70">{latest.status}</span>
                                </div>
                                <div className="p-3 text-xs text-text-secondary font-mono bg-surface-base whitespace-pre-wrap max-h-32 overflow-y-auto">
                                    {latest.text ? latest.text.slice(0, 300) + (latest.text.length > 300 ? "..." : "") : <span className="italic text-text-muted">Empty response</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
