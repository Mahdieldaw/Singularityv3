import React, { useState, useRef, useEffect, useMemo } from "react";
import { useAtomValue } from "jotai";
import clsx from "clsx";
import { providerAuthStatusAtom } from "../../state/atoms";
import { LLM_PROVIDERS_CONFIG } from "../../constants";
import { AiTurn, LLMProvider } from "../../types";
import { useClipActions } from "../../hooks/useClipActions";
import "./antagonist.css";

interface AntagonistSelectorProps {
    aiTurn: AiTurn;
    activeProviderId?: string;
    onSelect: (pid: string) => void;
}

export const AntagonistSelector: React.FC<AntagonistSelectorProps> = ({
    aiTurn,
    activeProviderId,
    onSelect,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const { handleClipClick } = useClipActions();
    const authStatus = useAtomValue(providerAuthStatusAtom);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const activeProvider = activeProviderId ? LLM_PROVIDERS_CONFIG.find(p => String(p.id) === activeProviderId) : null;
    const providers = useMemo(() => LLM_PROVIDERS_CONFIG.filter((p: LLMProvider) => p.id !== "system"), []);

    // Get existing antagonist responses for this turn
    const existingProviderIds = useMemo(() => {
        return Object.keys(aiTurn.antagonistResponses || {});
    }, [aiTurn.antagonistResponses]);

    return (
        <div className="antagonist-selector" ref={menuRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="antagonist-selector-trigger"
            >
                <span>{activeProvider?.name || "Select Model"}</span>
                <svg className={clsx("chevron-icon", isOpen && "open")} width="8" height="8" viewBox="0 0 12 12">
                    <path d="M2 4L6 8L10 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            {isOpen && (
                <div className="antagonist-selector-menu">
                    {providers.map((p: LLMProvider) => {
                        const pid = String(p.id);
                        const isActive = pid === activeProviderId;
                        const isUnauthorized = authStatus && authStatus[pid] === false;
                        const hasExisting = existingProviderIds.includes(pid);

                        return (
                            <button
                                key={pid}
                                onClick={() => {
                                    if (!isUnauthorized) {
                                        onSelect(pid);
                                        handleClipClick(aiTurn.id, "antagonist", pid);
                                        setIsOpen(false);
                                    }
                                }}
                                disabled={isUnauthorized}
                                className={clsx(
                                    "antagonist-selector-option",
                                    isActive && "active",
                                    isUnauthorized && "disabled"
                                )}
                            >
                                <span>{p.name}</span>
                                {hasExisting && <span style={{ opacity: 0.5, fontSize: "11px" }}>✓</span>}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
