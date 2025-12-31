import React, { useState, useMemo, useCallback } from "react";
import { AiTurn } from "../../types";
import { useAntagonistOutput } from "../../hooks/useAntagonistOutput";
import { parseBrackets, buildFinalPrompt, ParsedBracket } from "../../../shared/parsing-utils";
import { AntagonistSelector } from "./AntagonistSelector";
import { DimensionDropdown } from "./DimensionDropdown";
import { PipelineErrorBanner } from "../PipelineErrorBanner";
import { CopyButton } from "../CopyButton";
import { formatAntagonistOutputForMd } from "../../utils/copy-format-utils";
import { getProviderName } from "../../utils/provider-helpers";
import { motion, AnimatePresence } from "framer-motion";
import "./antagonist.css";

interface AntagonistCardProps {
    aiTurn: AiTurn;
    activeProviderId?: string;
    onProviderSelect?: (pid: string) => void;
    onUsePrompt?: (promptText: string) => void;
}

export const AntagonistCard: React.FC<AntagonistCardProps> = ({
    aiTurn,
    activeProviderId,
    onProviderSelect,
    onUsePrompt,
}) => {
    const { output, isLoading, isError, providerId } = useAntagonistOutput(aiTurn.id, activeProviderId);
    const [selections, setSelections] = useState<Record<string, string>>({});
    const [copied, setCopied] = useState(false);
    const [dimensionsOpen, setDimensionsOpen] = useState(false);
    const [auditOpen, setAuditOpen] = useState(false);

    // Parse brackets from prompt text
    const brackets = useMemo(() => {
        if (!output?.the_prompt?.text) return [];
        return parseBrackets(output.the_prompt.text);
    }, [output?.the_prompt?.text]);

    // Build final prompt with selections
    const finalPrompt = useMemo(() => {
        if (!output?.the_prompt?.text) return "";
        return buildFinalPrompt(output.the_prompt.text, selections);
    }, [output?.the_prompt?.text, selections]);

    // Handle dimension selection
    const handleDimensionSelect = useCallback((variable: string, value: string) => {
        setSelections(prev => ({ ...prev, [variable]: value }));
    }, []);

    // Copy to clipboard
    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(finalPrompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            console.error("Failed to copy", e);
        }
    }, [finalPrompt]);

    // Handle provider change
    const handleProviderChange = useCallback((pid: string) => {
        if (onProviderSelect) {
            onProviderSelect(pid);
        }
    }, [onProviderSelect]);

    // Handle "Use" - sends prompt to input field
    const handleUse = useCallback(() => {
        if (finalPrompt && onUsePrompt) {
            onUsePrompt(finalPrompt);
        }
    }, [finalPrompt, onUsePrompt]);

    // Loading state
    if (isLoading) {
        return (
            <div className="antagonist-card">
                <div className="antagonist-card-header">
                    <h4><span className="antagonist-icon">💭</span> Refining your question...</h4>
                </div>
                <div style={{ opacity: 0.6, fontSize: 14 }}>Analyzing context...</div>
            </div>
        );
    }

    // Error state
    if (isError) {
        return (
            <div className="antagonist-card p-0 overflow-hidden">
                <PipelineErrorBanner
                    type="antagonist"
                    failedProviderId={providerId || ""}
                    onRetry={(pid) => handleProviderChange(pid)}
                    compact
                />
            </div>
        );
    }

    // No output yet
    if (!output) {
        return null; // Don't render card if no antagonist output
    }

    // Null state (decision is already obvious)
    if (output.the_prompt.text === null) {
        const hasMissed = output.the_audit.missed.length > 0;

        return (
            <div className="antagonist-card">
                <div className="antagonist-card-header">
                    <h4><span className="antagonist-icon">💭</span> Context Check</h4>
                    <div className="flex items-center gap-3">
                        <CopyButton
                            text={formatAntagonistOutputForMd(output, providerId ? getProviderName(providerId) : undefined)}
                            label="Copy Antagonist Output"
                            variant="icon"
                        />
                        {hasMissed && (
                            <button
                                onClick={() => setAuditOpen(!auditOpen)}
                                className="antagonist-audit-indicator"
                                title={`Mapper missed ${output.the_audit.missed.length} dimension(s)`}
                            >
                                <span className="pulsing-dot" />
                                <span>+{output.the_audit.missed.length} found</span>
                            </button>
                        )}
                        <AntagonistSelector
                            aiTurn={aiTurn}
                            activeProviderId={providerId || undefined}
                            onSelect={handleProviderChange}
                        />
                    </div>
                </div>

                <div className="antagonist-decision-clear">
                    <div className="decision-clear-icon">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <div>
                        <div className="decision-clear-title">Decision is clear</div>
                        <div className="decision-clear-subtext">
                            No further context needed — the analysis provides sufficient clarity for action.
                        </div>
                    </div>
                </div>

                {/* Audit results - if expanded */}
                <AnimatePresence>
                    {auditOpen && hasMissed && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="antagonist-audit-section mt-4 bg-brand-500/5 border border-brand-500/10 rounded-lg p-3">
                                <div className="text-xs font-semibold text-brand-400 mb-2">
                                    Mapper Gaps Identified
                                </div>
                                <div className="space-y-2">
                                    {output.the_audit.missed.map((m, i) => (
                                        <div key={i} className="flex items-start gap-2 text-sm">
                                            <span className="text-text-primary">• {m.approach}</span>
                                            <span className="text-text-muted text-xs">
                                                ({m.source})
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    return (
        <div className="antagonist-card">
            <div className="antagonist-card-header">
                <h4><span className="antagonist-icon">💭</span> Get Targeted Advice</h4>
                <div className="flex items-center gap-3">
                    <CopyButton
                        text={formatAntagonistOutputForMd(output, providerId ? getProviderName(providerId) : undefined)}
                        label="Copy Antagonist Output"
                        variant="icon"
                    />
                    {output.the_audit.missed.length > 0 && (
                        <button
                            onClick={() => setAuditOpen(!auditOpen)}
                            className="antagonist-audit-indicator"
                            title={`Mapper missed ${output.the_audit.missed.length} dimension(s)`}
                        >
                            <span className="pulsing-dot" />
                            <span>+{output.the_audit.missed.length} found</span>
                        </button>
                    )}
                    <AntagonistSelector
                        aiTurn={aiTurn}
                        activeProviderId={providerId || undefined}
                        onSelect={handleProviderChange}
                    />
                </div>
            </div>

            {/* Grounding Card */}
            {output.the_prompt.grounding && (
                <div className="antagonist-grounding-card">
                    <div className="antagonist-card-label">
                        <span className="text-[16px]">🧩</span> Grounding Context
                    </div>
                    <div className="antagonist-card-content">
                        {output.the_prompt.grounding}
                    </div>
                </div>
            )}

            {/* Main Prompt Section */}
            <div className="antagonist-prompt-section">
                <div className="antagonist-prompt-text">
                    {/* Display prompt with interactive dropdowns */}
                    {brackets.length > 0 ? (
                        renderInteractivePrompt(output.the_prompt.text, brackets, selections, handleDimensionSelect, output.the_prompt.dimensions)
                    ) : (
                        output.the_prompt.text
                    )}
                </div>
            </div>

            {/* Actions */}
            <div className="antagonist-actions">
                <button
                    className="antagonist-copy-btn"
                    onClick={handleCopy}
                >
                    {copied ? "✓ Copied" : "📋 Copy Prompt"}
                </button>
                {onUsePrompt && (
                    <button
                        className="antagonist-use-btn"
                        onClick={handleUse}
                    >
                        🚀 Use in Chat
                    </button>
                )}
            </div>

            {/* Dimensions Educational Section */}
            {output.the_prompt.dimensions.length > 0 && (
                <div className="mt-4 border-t border-border-subtle/30 pt-2">
                    <button
                        onClick={() => setDimensionsOpen(!dimensionsOpen)}
                        className="antagonist-dimensions-toggle"
                    >
                        <svg
                            className={`w-3 h-3 transition-transform ${dimensionsOpen ? 'rotate-90' : ''}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span>What these variables mean ({output.the_prompt.dimensions.length})</span>
                    </button>

                    <AnimatePresence>
                        {dimensionsOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="antagonist-dimensions-list">
                                    {output.the_prompt.dimensions.map((dim, i) => (
                                        <div key={i} className="antagonist-dimension-item">
                                            <div className="antagonist-dimension-label">
                                                <span className="antagonist-dimension-name">{dim.variable}</span>
                                                <span className="antagonist-dimension-options">{dim.options}</span>
                                            </div>
                                            <div className="antagonist-dimension-why">{dim.why}</div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

            {/* Audit results - if expanded */}
            <AnimatePresence>
                {auditOpen && output.the_audit.missed.length > 0 && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="antagonist-audit-section mt-4 bg-brand-500/5 border border-brand-500/10 rounded-lg p-3">
                            <div className="text-xs font-semibold text-brand-400 mb-2">
                                Mapper Gaps Identified
                            </div>
                            <div className="space-y-2">
                                {output.the_audit.missed.map((m, i) => (
                                    <div key={i} className="flex items-start gap-2 text-sm">
                                        <span className="text-text-primary">• {m.approach}</span>
                                        <span className="text-text-muted text-xs">
                                            ({m.source})
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Payoff Card */}
            {output.the_prompt.payoff && (
                <div className="antagonist-payoff-card">
                    <div className="antagonist-card-label antagonist-payoff-label">
                        <span className="text-[16px]">🚀</span> The Strategic Payoff
                    </div>
                    <div className="antagonist-payoff-text">
                        {output.the_prompt.payoff}
                    </div>
                </div>
            )}

        </div>
    );
};

/**
 * Render prompt text with interactive dropdowns for bracket variables
 */
function renderInteractivePrompt(
    text: string,
    brackets: ParsedBracket[],
    selections: Record<string, string>,
    onSelect: (variable: string, value: string) => void,
    dimensions: any[] = []
): React.ReactNode[] {
    const result: React.ReactNode[] = [];
    let lastIndex = 0;

    brackets.forEach((bracket, idx) => {
        // Text before this bracket
        if (bracket.startIndex > lastIndex) {
            result.push(text.substring(lastIndex, bracket.startIndex));
        }

        // Find dimension info for tooltip
        const dimension = dimensions.find(d =>
            d.variable.toLowerCase() === bracket.variable.trim().toLowerCase()
        );

        // The interactive dropdown
        result.push(
            <span key={`dropdown-${idx}`} style={{ display: "inline-flex", verticalAlign: "middle" }}>
                <DimensionDropdown
                    variable={bracket.variable}
                    options={bracket.options}
                    selectedValue={selections[bracket.variable] || null}
                    onSelect={(value) => onSelect(bracket.variable, value)}
                    title={dimension?.why || `Specify: ${bracket.variable}`}
                />
            </span>
        );

        lastIndex = bracket.endIndex;
    });

    // Text after last bracket
    if (lastIndex < text.length) {
        result.push(text.substring(lastIndex));
    }

    return result;
}

export default AntagonistCard;
