
import React, { useState } from 'react';
import { GauntletOutput } from '../../../shared/contract';
import { motion, AnimatePresence } from 'framer-motion';

// Icons
const ChevronDown = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6" /></svg>
);
const ChevronRight = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m9 18 6-6-6-6" /></svg>
);
const ShieldCheck = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></svg>
);
const Skull = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m12.5 17-.5-1-.5 1h1z" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><path d="M8 17h8" /><path d="M12 2a10 10 0 0 0-9.95 9h19.9A10 10 0 0 0 12 2z" /></svg>
);
const CopyIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
);
const CheckIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 6 9 17l-5-5" /></svg>
);

interface GauntletOutputViewProps {
    output: GauntletOutput;
}

const GauntletOutputView: React.FC<GauntletOutputViewProps> = ({ output }) => {
    const [survivorsOpen, setSurvivorsOpen] = useState(false);
    const [eliminatedOpen, setEliminatedOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleCopySouvenir = () => {
        if (output.souvenir) {
            navigator.clipboard.writeText(output.souvenir);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (!output.the_answer.statement && !output.souvenir) {
        return <div className="p-4 text-text-secondary italic">Gauntlet is empty.</div>;
    }

    return (
        <div className="flex flex-col gap-6 p-1 max-w-full overflow-hidden text-sm">
            {/* HER0 - THE ANSWER */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-base border border-border-subtle rounded-xl p-5 shadow-sm relative overflow-hidden"
            >
                {/* Decorative background glow */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-accent-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

                <div className="flex items-start justify-between gap-4 mb-4">
                    <h2 className="text-lg font-semibold text-text-primary tracking-tight">The Answer</h2>
                    <div className="flex items-center gap-2 text-xs font-mono text-text-tertiary bg-surface-highlight/50 px-2 py-1 rounded">
                        <span>Confidence</span>
                        <span className="text-accent-primary tracking-widest font-bold">{output.confidence.display}</span>
                    </div>
                </div>

                <div className="prose prose-sm max-w-none text-text-primary mb-4">
                    <p className="font-medium text-base leading-relaxed">{output.the_answer.statement}</p>
                    <p className="text-text-secondary leading-relaxed mt-2 opacity-90">{output.the_answer.reasoning}</p>
                </div>

                {output.the_answer.next_step && (
                    <div className="bg-surface-highlight/30 border-l-2 border-accent-primary pl-3 py-2 mt-4">
                        <span className="text-xs uppercase tracking-wider font-semibold text-accent-primary block mb-1">Next Step</span>
                        <p className="text-text-primary">{output.the_answer.next_step}</p>
                    </div>
                )}
            </motion.div>

            {/* SECTIONS GRID */}
            <div className="grid grid-cols-1 gap-4">

                {/* SURVIVORS */}
                <div className="border border-border-subtle rounded-lg bg-surface-base/50 overflow-hidden">
                    <button
                        onClick={() => setSurvivorsOpen(!survivorsOpen)}
                        className="w-full flex items-center justify-between p-3 hover:bg-surface-highlight/50 transition-colors text-left"
                    >
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="text-green-500" />
                            <span className="font-medium text-text-primary">Survivors</span>
                            <span className="text-xs text-text-tertiary bg-surface-highlight px-1.5 py-0.5 rounded-full">
                                {1 + output.survivors.supporting.length + output.survivors.conditional.length}
                            </span>
                        </div>
                        {survivorsOpen ? <ChevronDown className="text-text-tertiary" /> : <ChevronRight className="text-text-tertiary" />}
                    </button>

                    <AnimatePresence>
                        {survivorsOpen && (
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: 'auto' }}
                                exit={{ height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-3 pt-0 flex flex-col gap-3">
                                    <div className="bg-green-500/10 border border-green-500/20 rounded p-3">
                                        <div className="text-xs font-semibold text-green-600 mb-1">PRIMARY CLAIM</div>
                                        <div className="text-text-primary mb-1">{output.survivors.primary.claim}</div>
                                        <div className="text-xs text-text-secondary italic">Survived because: {output.survivors.primary.survived_because}</div>
                                    </div>

                                    {output.survivors.supporting.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-mono text-text-tertiary uppercase">Supporting</div>
                                            {output.survivors.supporting.map((s, i) => (
                                                <div key={i} className="pl-3 border-l border-border-subtle text-sm">
                                                    <span className="text-text-primary">{s.claim}</span>
                                                    <span className="text-text-tertiary ml-2 text-xs">({s.relationship})</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {output.survivors.conditional.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-mono text-text-tertiary uppercase">Conditional</div>
                                            {output.survivors.conditional.map((s, i) => (
                                                <div key={i} className="pl-3 border-l border-orange-500/30 text-sm">
                                                    <span className="text-text-primary">{s.claim}</span>
                                                    <span className="text-orange-500/80 ml-2 text-xs">IF {s.condition}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ELIMINATED */}
                <div className="border border-border-subtle rounded-lg bg-surface-base/50 overflow-hidden">
                    <button
                        onClick={() => setEliminatedOpen(!eliminatedOpen)}
                        className="w-full flex items-center justify-between p-3 hover:bg-surface-highlight/50 transition-colors text-left"
                    >
                        <div className="flex items-center gap-2">
                            <Skull className="text-red-500" />
                            <span className="font-medium text-text-primary">Eliminated</span>
                            <span className="text-xs text-text-tertiary bg-surface-highlight px-1.5 py-0.5 rounded-full">
                                {output.eliminated.from_consensus.length + output.eliminated.from_outliers.length}
                            </span>
                        </div>
                        {eliminatedOpen ? <ChevronDown className="text-text-tertiary" /> : <ChevronRight className="text-text-tertiary" />}
                    </button>

                    <AnimatePresence>
                        {eliminatedOpen && (
                            <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: 'auto' }}
                                exit={{ height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="p-3 pt-0 flex flex-col gap-3">
                                    {output.eliminated.from_consensus.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-mono text-text-tertiary uppercase">From Consensus</div>
                                            {output.eliminated.from_consensus.map((e, i) => (
                                                <div key={i} className="flex gap-2 items-start text-sm group">
                                                    <span className="text-text-tertiary line-through decoration-red-500/50 decoration-2">{e.claim}</span>
                                                    <span className="text-red-500 text-xs mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap">killed: {e.killed_because}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {output.eliminated.from_outliers.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-mono text-text-tertiary uppercase">From Outliers</div>
                                            {output.eliminated.from_outliers.map((e, i) => (
                                                <div key={i} className="flex gap-2 items-start text-sm group">
                                                    <span className="text-text-tertiary line-through decoration-red-500/50 decoration-2">{e.claim}</span>
                                                    <span className="text-red-500 text-xs mt-0.5 opacity-70 group-hover:opacity-100 transition-opacity whitespace-nowrap">killed: {e.killed_because}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {output.eliminated.ghost && (
                                        <div className="bg-purple-500/5 border border-purple-500/10 rounded p-2 text-xs">
                                            <span className="font-semibold text-purple-600 mr-2">GHOST IDENTIFIED:</span>
                                            <span className="text-text-secondary">{output.eliminated.ghost}</span>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

            </div>

            {/* SOUVENIR */}
            {output.souvenir && (
                <div className="flex items-center justify-between bg-surface-highlight/30 rounded-lg py-2 px-3 border border-border-subtle/50">
                    <div className="flex items-center gap-2 overflow-hidden">
                        <span className="text-lg">💎</span>
                        <span className="text-xs italic font-serif text-text-secondary truncate">"{output.souvenir}"</span>
                    </div>
                    <button
                        onClick={handleCopySouvenir}
                        className="text-text-tertiary hover:text-text-primary p-1 rounded transition-colors"
                        title="Copy souvenir"
                    >
                        {copied ? <CheckIcon className="text-green-500" /> : <CopyIcon />}
                    </button>
                </div>
            )}
        </div>
    );
};

export default GauntletOutputView;
