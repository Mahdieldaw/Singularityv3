import React, { useState } from 'react';
import { UnderstandOutput } from '../../../shared/contract';
import { motion, AnimatePresence } from 'framer-motion';

// Icons
const ChevronDown = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6" /></svg>
);
const ChevronRight = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m9 18 6-6-6-6" /></svg>
);
const Sparkles = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" /></svg>
);
const Wind = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M17.7 7.7A2.5 2.5 0 1 1 20 12h-3.3" /><path d="M9.6 4.6A2 2 0 1 1 11 8H2" /><path d="M12.6 19.4A2 2 0 1 0 14 16H2" /></svg>
);
const CopyIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
);
const CheckIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 6 9 17l-5-5" /></svg>
);

interface UnderstandOutputViewProps {
    output: UnderstandOutput;
}

const UnderstandOutputView: React.FC<UnderstandOutputViewProps> = ({ output }) => {
    const [longAnswerOpen, setLongAnswerOpen] = useState(true);
    const [copied, setCopied] = useState(false);

    const handleCopySouvenir = () => {
        if (output.souvenir) {
            navigator.clipboard.writeText(output.souvenir);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!output.short_answer && !output.souvenir) {
        return <div className="p-4 text-text-secondary italic">Understanding synthesis is empty.</div>;
    }

    return (
        <div className="flex flex-col gap-6 p-1 max-w-full overflow-hidden text-sm">
            {/* HER0 - THE SHORT ANSWER */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-base border border-border-subtle rounded-xl p-5 shadow-sm relative overflow-hidden"
            >
                {/* Decorative background glow */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

                <h2 className="text-lg font-semibold text-text-primary tracking-tight mb-4">The Synthesis</h2>

                <div className="prose prose-sm max-w-none text-text-primary">
                    <p className="font-medium text-base leading-relaxed">{output.short_answer}</p>
                </div>
            </motion.div>

            {/* THE ONE & THE ECHO */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* THE ONE */}
                {output.the_one && (
                    <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 relative"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="text-amber-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-amber-600">The One</span>
                            {output.the_one.source && (
                                <span className="ml-auto text-[10px] font-mono text-amber-600/60 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                    via {output.the_one.source}
                                </span>
                            )}
                        </div>
                        <p className="text-text-primary font-medium leading-normal mb-2">
                            {output.the_one.insight}
                        </p>
                        <div className="text-xs text-text-secondary italic opacity-80 pl-3 border-l border-amber-500/30">
                            {output.the_one.why_this}
                        </div>
                    </motion.div>
                )}

                {/* THE ECHO */}
                {output.the_echo && (
                    <motion.div
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 relative"
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Wind className="text-indigo-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">The Echo</span>
                            {output.the_echo.source && (
                                <span className="ml-auto text-[10px] font-mono text-indigo-600/60 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                                    via {output.the_echo.source}
                                </span>
                            )}
                        </div>
                        <p className="text-text-primary font-medium leading-normal mb-2">
                            {output.the_echo.position}
                        </p>
                        <div className="text-xs text-text-secondary italic opacity-80 pl-3 border-l border-indigo-500/30">
                            {output.the_echo.merit}
                        </div>
                    </motion.div>
                )}
            </div>

            {/* THE LONG ANSWER (Collapsible) */}
            {output.long_answer && (
                <div className="border border-border-subtle rounded-lg bg-surface-base/50 overflow-hidden">
                    <button
                        onClick={() => setLongAnswerOpen(!longAnswerOpen)}
                        className="w-full flex items-center justify-between p-3 hover:bg-surface-highlight/50 transition-colors text-left"
                    >
                        <span className="font-medium text-text-primary flex items-center gap-2">
                            Deep Context
                            <span className="text-[10px] text-text-tertiary font-mono bg-surface-highlight px-1.5 py-0.5 rounded uppercase">Full Synthesis</span>
                        </span>
                        {longAnswerOpen ? <ChevronDown className="text-text-tertiary" /> : <ChevronRight className="text-text-tertiary" />}
                    </button>

                    <AnimatePresence>
                        {longAnswerOpen && (
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: 'auto' }}
                                exit={{ height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-4 pt-0">
                                    <div className="prose prose-sm max-w-none text-text-primary leading-relaxed whitespace-pre-wrap opacity-90">
                                        {output.long_answer}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* SOUVENIR */}
            {output.souvenir && (
                <div className="flex items-center justify-between bg-surface-highlight/30 rounded-lg py-2.5 px-3 border border-border-subtle/50">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <span className="text-lg">💎</span>
                        <span className="text-xs italic font-serif text-text-secondary truncate">"{output.souvenir}"</span>
                    </div>
                    <button
                        onClick={handleCopySouvenir}
                        className="text-text-tertiary hover:text-text-primary p-1.5 rounded transition-colors"
                        title="Copy takeaway"
                    >
                        {copied ? <CheckIcon className="text-green-500" /> : <CopyIcon />}
                    </button>
                </div>
            )}
        </div>
    );
};

export default UnderstandOutputView;
