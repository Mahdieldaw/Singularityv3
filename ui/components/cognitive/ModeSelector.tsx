
import React from "react";
import { useAtom } from "jotai";
import { selectedModeAtom, useCognitivePipelineAtom } from "../../state/atoms";
import { CognitiveMode } from "../../../shared/contract";
import { useAtomValue } from "jotai";

const MODES: { id: CognitiveMode; label: string; icon: string; description: string }[] = [
    { id: "auto", label: "Auto", icon: "✨", description: "System decides based on query" },
    { id: "understand", label: "Understand", icon: "🧠", description: "Help me make sense of this" },
    { id: "decide", label: "Decide", icon: "⚡", description: "Just tell me what to do" },
];

const ModeSelector: React.FC = () => {
    const [selectedMode, setSelectedMode] = useAtom(selectedModeAtom);
    const useCognitivePipeline = useAtomValue(useCognitivePipelineAtom);

    if (!useCognitivePipeline) return null;

    const safeSelectedMode: CognitiveMode =
        MODES.some((m) => m.id === selectedMode) ? selectedMode : "auto";

    React.useEffect(() => {
        if (safeSelectedMode !== selectedMode) {
            setSelectedMode(safeSelectedMode);
        }
    }, [safeSelectedMode, selectedMode, setSelectedMode]);

    return (
        <div className="flex justify-center w-full mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex bg-surface-base/80 backdrop-blur-md border border-border-subtle rounded-full p-1 shadow-sm">
                {MODES.map((mode) => {
                    const isActive = safeSelectedMode === mode.id;
                    return (
                        <button
                            key={mode.id}
                            onClick={() => setSelectedMode(mode.id)}
                            title={mode.description}
                            className={`
                                relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200
                                ${isActive
                                    ? "bg-surface-highlight text-text-primary shadow-sm"
                                    : "text-text-secondary hover:text-text-primary hover:bg-surface-highlight/50"
                                }
                            `}
                        >
                            <span className="text-sm">{mode.icon}</span>
                            <span>{mode.label}</span>
                            {isActive && (
                                <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-border-subtle opacity-50" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default ModeSelector;
