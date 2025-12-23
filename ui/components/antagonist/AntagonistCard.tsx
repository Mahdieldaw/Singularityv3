import React, { useState, useMemo, useCallback } from "react";
import { AiTurn } from "../../types";
import { useAntagonistOutput } from "../../hooks/useAntagonistOutput";
import { parseBrackets, buildFinalPrompt, ParsedBracket } from "../../../shared/parsing-utils";
import { AntagonistSelector } from "./AntagonistSelector";
import { DimensionDropdown } from "./DimensionDropdown";
import { PipelineErrorBanner } from "../PipelineErrorBanner";
import "./antagonist.css";

interface AntagonistCardProps {
    aiTurn: AiTurn;
    activeProviderId?: string;
    onProviderSelect?: (pid: string) => void;
}

export const AntagonistCard: React.FC<AntagonistCardProps> = ({
    aiTurn,
    activeProviderId,
    onProviderSelect,
}) => {
    const { output, isLoading, isError, providerId } = useAntagonistOutput(aiTurn.id, activeProviderId);
    const [selections, setSelections] = useState<Record<string, string>>({});
    const [copied, setCopied] = useState(false);

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
        if (!hasMissed) return null; // Nothing to show

        return (
            <div className="antagonist-card">
                <div className="antagonist-card-header">
                    <h4><span className="antagonist-icon">💭</span> Context Check</h4>
                    <AntagonistSelector
                        aiTurn={aiTurn}
                        activeProviderId={providerId || undefined}
                        onSelect={handleProviderChange}
                    />
                </div>
                <div className="antagonist-null-state">
                    Decision path is clear — no additional context needed.
                </div>
            </div>
        );
    }

    return (
        <div className="antagonist-card">
            <div className="antagonist-card-header">
                <h4><span className="antagonist-icon">💭</span> Get Targeted Advice</h4>
                <AntagonistSelector
                    aiTurn={aiTurn}
                    activeProviderId={providerId || undefined}
                    onSelect={handleProviderChange}
                />
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
                        renderInteractivePrompt(output.the_prompt.text, brackets, selections, handleDimensionSelect)
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
            </div>

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
    onSelect: (variable: string, value: string) => void
): React.ReactNode[] {
    const result: React.ReactNode[] = [];
    let lastIndex = 0;

    brackets.forEach((bracket, idx) => {
        // Text before this bracket
        if (bracket.startIndex > lastIndex) {
            result.push(text.substring(lastIndex, bracket.startIndex));
        }

        // The interactive dropdown
        result.push(
            <span key={`dropdown-${idx}`} style={{ display: "inline-flex", verticalAlign: "middle" }}>
                <DimensionDropdown
                    variable={bracket.variable}
                    options={bracket.options}
                    selectedValue={selections[bracket.variable] || null}
                    onSelect={(value) => onSelect(bracket.variable, value)}
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
