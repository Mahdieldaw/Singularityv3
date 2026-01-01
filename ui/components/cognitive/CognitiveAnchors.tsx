// ui/components/cognitive/CognitiveAnchors.tsx
// Collapsed inline cards for The One & The Echo - expand in place like footnotes

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Icons
const ChevronRight = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m9 18 6-6-6-6" /></svg>
);
const ChevronDown = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6" /></svg>
);

const InfoIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
);

interface CognitiveAnchorsProps {
    one?: {
        insight: string;
        source?: string | null;
        why_this?: string;
    } | null;
    echo?: {
        position: string;
        source?: string;
        merit?: string;
    } | null;
}



export const CognitiveAnchors: React.FC<CognitiveAnchorsProps> = ({ one, echo }) => {
    const [oneOpen, setOneOpen] = useState(false);
    const [echoOpen, setEchoOpen] = useState(false);
    const [infoHovering, setInfoHovering] = useState(false);

    const toggleOne = useCallback(() => setOneOpen(prev => !prev), []);
    const toggleEcho = useCallback(() => setEchoOpen(prev => !prev), []);

    // Don't render if nothing to show
    if (!one && !echo) return null;

    return (
        <div className="flex flex-col gap-1.5 mt-3">
            {/* THE ONE - Collapsed card */}
            {one && (
                <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.03] overflow-hidden">
                    <button
                        onClick={toggleOne}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left 
                                   hover:bg-amber-500/5 transition-colors"
                    >
                        {oneOpen ? (
                            <ChevronDown className="text-amber-600/60 flex-shrink-0" />
                        ) : (
                            <ChevronRight className="text-amber-600/60 flex-shrink-0" />
                        )}
                        <span className="text-xs font-medium text-amber-700/70">
                            The One
                        </span>
                        <span className="text-[11px] text-text-muted/70 ml-1">
                            — Core Insight
                        </span>
                    </button>

                    <AnimatePresence>
                        {oneOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                            >
                                <div className="px-3 pb-3 pt-0">
                                    <p className="text-sm text-text-primary leading-relaxed">
                                        {one.insight}
                                    </p>
                                    {one.why_this && (
                                        <p className="text-xs text-text-secondary italic mt-2 pl-2 border-l-2 border-amber-500/20">
                                            {one.why_this}
                                        </p>
                                    )}
                                    {one.source && (
                                        <span className="inline-block mt-2 text-[10px] font-mono text-amber-600/50 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                            via {one.source}
                                        </span>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* THE ECHO - Collapsed card */}
            {echo && (
                <div className="rounded-lg border border-indigo-500/15 bg-indigo-500/[0.03] overflow-hidden">
                    <button
                        onClick={toggleEcho}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left 
                                   hover:bg-indigo-500/5 transition-colors"
                    >
                        {echoOpen ? (
                            <ChevronDown className="text-indigo-600/60 flex-shrink-0" />
                        ) : (
                            <ChevronRight className="text-indigo-600/60 flex-shrink-0" />
                        )}
                        <span className="text-xs font-medium text-indigo-700/70">
                            The Echo
                        </span>
                        <span className="text-[11px] text-text-muted/70 ml-1">
                            — Frame Boundary
                        </span>
                    </button>

                    <AnimatePresence>
                        {echoOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                            >
                                <div className="px-3 pb-3 pt-0">
                                    <p className="text-sm text-text-primary leading-relaxed">
                                        {echo.position}
                                    </p>
                                    {echo.merit && (
                                        <p className="text-xs text-text-secondary italic mt-2 pl-2 border-l-2 border-indigo-500/20">
                                            {echo.merit}
                                        </p>
                                    )}
                                    {echo.source && (
                                        <span className="inline-block mt-2 text-[10px] font-mono text-indigo-600/50 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                                            via {echo.source}
                                        </span>
                                    )}
                                    <div
                                        className="mt-3 flex items-center justify-center gap-1 opacity-60 hover:opacity-100 transition-opacity cursor-help relative"
                                        onMouseEnter={() => setInfoHovering(true)}
                                        onMouseLeave={() => setInfoHovering(false)}
                                    >
                                        <p className="text-[10px] text-text-muted text-center">
                                            This defines the conditions under which the frame would fail — not why it is wrong.
                                        </p>
                                        <InfoIcon className="w-3 h-3 text-text-muted/70" />

                                        {infoHovering && (
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-surface-raised border border-border-subtle rounded-lg shadow-elevated text-[10px] text-text-secondary leading-snug z-50 animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
                                                The Echo identifies frame boundaries — scenarios where the synthesis's assumptions break down, even if those scenarios are unlikely.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};

export default CognitiveAnchors;
