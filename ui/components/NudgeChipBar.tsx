import React, { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { composerModelAtom, analystModelAtom } from "../state/atoms";
import { LLM_PROVIDERS_CONFIG } from "../constants";

interface NudgeChipBarProps {
    type: "sending" | "idle";
    onCompose: () => void;
    onAnalyst: () => void;
    progress?: number; // 0-100
    visible: boolean;
}

const NudgeChipBar: React.FC<NudgeChipBarProps> = ({
    type,
    onCompose,
    onAnalyst,
    progress = 0,
    visible,
}) => {
    const [show, setShow] = useState(visible);
    const composerModelId = useAtomValue(composerModelAtom);
    const analystModelId = useAtomValue(analystModelAtom);

    const composerModelName = LLM_PROVIDERS_CONFIG.find(p => p.id === composerModelId)?.name || composerModelId || "Gemini";
    const analystModelName = LLM_PROVIDERS_CONFIG.find(p => p.id === analystModelId)?.name || analystModelId || "Gemini";

    useEffect(() => {
        if (visible) {
            setShow(true);
        } else {
            const timer = setTimeout(() => setShow(false), 300); // Wait for fade out
            return () => clearTimeout(timer);
        }
    }, [visible]);

    if (!show) return null;

    const isSending = type === "sending";
    const composerText = isSending ? "Perfect this prompt" : "Let Composer perfect it";
    const analystText = isSending ? "Pressure-test it" : "Let Analyst sharpen it";

    return (
        <div
            className={`absolute bottom-full left-1/2 transform -translate-x-1/2 mb-4 h-[44px] bg-surface-base/90 backdrop-blur-xl border border-border-subtle rounded-full shadow-2xl flex items-center gap-1 px-1.5 z-50 transition-all duration-300 ease-out ${visible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-95"
                }`}
        >
            {/* Progress Ring (Only for Sending trigger) */}
            {isSending && (
                <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                    <svg className="w-full h-full rotate-[-90deg]" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <rect
                            x="0"
                            y="0"
                            width="100%"
                            height="100%"
                            fill="none"
                            stroke="var(--brand-500)"
                            strokeWidth="2"
                            strokeDasharray="400" // Approximate perimeter
                            strokeDashoffset={400 - (400 * progress) / 100}
                            className="transition-all duration-100 ease-linear opacity-20"
                        />
                    </svg>
                </div>
            )}

            <button
                onClick={onCompose}
                className="group relative flex items-center gap-2 px-4 py-1.5 rounded-full hover:bg-surface-highlight transition-all duration-200"
            >
                <span className="text-sm font-medium text-text-primary group-hover:text-brand-400 transition-colors">
                    {composerText}
                </span>
                <span className="text-[10px] text-text-muted font-mono opacity-60 group-hover:opacity-100 transition-opacity">
                    [{composerModelName}]
                </span>
                {/* Glow effect */}
                <div className="absolute inset-0 rounded-full bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <div className="w-px h-4 bg-border-subtle" />

            <button
                onClick={onAnalyst}
                className="group relative flex items-center gap-2 px-4 py-1.5 rounded-full hover:bg-surface-highlight transition-all duration-200"
            >
                <span className="text-sm font-medium text-text-primary group-hover:text-brand-400 transition-colors">
                    {analystText}
                </span>
                <span className="text-[10px] text-text-muted font-mono opacity-60 group-hover:opacity-100 transition-opacity">
                    [{analystModelName}]
                </span>
                {/* Glow effect */}
                <div className="absolute inset-0 rounded-full bg-brand-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
        </div>
    );
};

export default NudgeChipBar;
