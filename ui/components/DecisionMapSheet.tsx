import React from "react";
import { useAtom } from "jotai";
import { isDecisionMapOpenAtom } from "../state/atoms";
import { motion, AnimatePresence } from "framer-motion";
import { DecisionMapGraph } from "./experimental/DecisionMapGraph"; // Assuming this path, will verify
import clsx from "clsx";

export const DecisionMapSheet = React.memo(() => {
    const [isOpen, setIsOpen] = useAtom(isDecisionMapOpenAtom);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="fixed inset-x-0 bottom-0 h-[70vh] bg-surface-raised border-t border-border-strong shadow-elevated z-[2000] rounded-t-2xl flex flex-col"
                >
                    {/* Handle / Header */}
                    <div
                        className="h-8 flex items-center justify-center cursor-grab active:cursor-grabbing border-b border-border-subtle hover:bg-surface-highlight transition-colors rounded-t-2xl"
                        onClick={() => setIsOpen(false)}
                    >
                        <div className="w-12 h-1.5 bg-border-subtle rounded-full" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-hidden relative">
                        {/* We pass a dummy turnId/providerId or update DecisionMapGraph to handle global state if needed. 
                 For now, assuming it pulls from context or we need to pass props. 
                 Wait, the spec says "Clicking the center area swaps right pane to Decision Map v2".
                 But the bottom sheet is for the "Decision Map tray".
                 Let's assume it needs to render the graph. 
                 We might need to know WHICH turn's map to show. 
                 Usually it's the latest or the one contextually active. 
                 For now, let's render a placeholder or the graph if it doesn't require props.
                 Checking DecisionMapGraph usage in AiTurnBlock... it takes turnId.
                 We might need to track "activeMapTurnId" or similar.
                 The spec says "The thin orb strip is always visible at the bottom of each synthesis bubble... Click anywhere on the strip -> bottom sheet slides UP".
                 So the map is contextual to the turn.
                 We need to store which turn triggered the map.
             */}
                        <div className="p-4 h-full flex items-center justify-center text-text-muted">
                            Decision Map Graph Placeholder (Need to wire up active turn ID)
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
});
