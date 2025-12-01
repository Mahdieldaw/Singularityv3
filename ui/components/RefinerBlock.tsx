import React, { useState } from "react";
import { useAtom } from "jotai";
import { refinerDataAtom, isRefinerOpenAtom, chatInputValueAtom } from "../state/atoms";
import { useChat } from "../hooks/useChat";

interface RefinerBlockProps {
    showAudit?: boolean;
    showVariants?: boolean;
    showExplanation?: boolean;
}

export default function RefinerBlock({ showAudit = false, showVariants = false, showExplanation = false }: RefinerBlockProps) {
    const [refinerData, setRefinerData] = useAtom(refinerDataAtom);
    const [isOpen, setIsOpen] = useAtom(isRefinerOpenAtom);
    const [, setChatInputValue] = useAtom(chatInputValueAtom);
    const { sendMessage } = useChat();

    if (!isOpen || !refinerData) {
        return null;
    }

    const handleVariantClick = (variant: string) => {
        // Use variant as the prompt
        sendMessage(variant, "new");
        setIsOpen(false);
        setRefinerData(null);
        setChatInputValue("");
    };

    return (
        <div className="w-full overflow-hidden flex flex-col animate-slide-up">
            {/* Collapsible Sections */}
            {(showAudit || showVariants || showExplanation) && (
                <div className="bg-surface-soft/60 p-4 px-5 text-sm">
                    {showExplanation && refinerData.explanation && (
                        <div className="mb-4 last:mb-0">
                            <div className="text-brand-500 font-semibold mb-1.5 flex items-center gap-1.5">
                                <span>🧠</span> Explanation
                            </div>
                            <div className="text-text-secondary leading-relaxed whitespace-pre-wrap">
                                {refinerData.explanation}
                            </div>
                        </div>
                    )}

                    {showAudit && refinerData.audit && (
                        <div className="mb-4 last:mb-0">
                            <div className="text-intent-warning font-semibold mb-1.5 flex items-center gap-1.5">
                                <span>🧐</span> Audit
                            </div>
                            <div className="text-text-secondary leading-relaxed">
                                {refinerData.audit}
                            </div>
                        </div>
                    )}

                    {showVariants && refinerData.variants && refinerData.variants.length > 0 && (
                        <div>
                            <div className="text-text-brand font-semibold mb-2 flex items-center gap-1.5">
                                <span>🔀</span> Variants
                            </div>
                            <div className="flex flex-col gap-2">
                                {refinerData.variants.map((variant, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleVariantClick(variant)}
                                        className="text-left px-3 py-2.5 bg-chip-soft border border-border-subtle rounded-lg
                                                   text-text-primary cursor-pointer text-sm leading-snug
                                                   transition-all duration-200
                                                   hover:bg-surface-highlight hover:border-brand-400"
                                    >
                                        {variant}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
