import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Root, Text, Parent } from 'mdast';

/**
 * Lightweight math plugin for remark
 * Handles basic inline math ($...$) without heavy dependencies
 * Converts to styled HTML for simple expressions
 */
const remarkSimpleMath: Plugin<[], Root> = () => {
    return (tree) => {
        visit(tree, 'text', (node: Text, index, parent: Parent | undefined) => {
            if (!parent || index === undefined) return;

            const text = node.value;
            const parts: any[] = [];
            let lastIndex = 0;

            // Match inline math: $...$
            const mathRegex = /\$([^$]+)\$/g;
            let match;

            while ((match = mathRegex.exec(text)) !== null) {
                // Text before math
                if (match.index > lastIndex) {
                    parts.push({
                        type: 'text',
                        value: text.slice(lastIndex, match.index),
                    });
                }

                // Math content
                const mathContent = match[1];
                const rendered = renderSimpleMath(mathContent);

                parts.push({
                    type: 'html',
                    value: rendered,
                });

                lastIndex = match.index + match[0].length;
            }

            // Text after last math
            if (lastIndex < text.length) {
                parts.push({
                    type: 'text',
                    value: text.slice(lastIndex),
                });
            }

            // Replace node if we found math
            if (parts.length > 0) {
                parent.children.splice(index, 1, ...parts);
            }
        });
    };
};

/**
 * Render simple math expressions to HTML
 */
function renderSimpleMath(expr: string): string {
    let html = expr;

    // Handle \text{...} - extract text content
    html = html.replace(/\\text\{([^}]+)\}/g, '<span class="math-text">$1</span>');

    // Handle superscripts: x^2 or x^{123}
    html = html.replace(/([a-zA-Z0-9]+)\^(\{[^}]+\}|[0-9a-zA-Z])/g, (_, base, exp) => {
        const expContent = exp.startsWith('{') ? exp.slice(1, -1) : exp;
        return `${base}<sup class="math-sup">${expContent}</sup>`;
    });

    // Handle subscripts: x_2 or x_{123}
    html = html.replace(/([a-zA-Z0-9]+)_(\{[^}]+\}|[0-9a-zA-Z])/g, (_, base, sub) => {
        const subContent = sub.startsWith('{') ? sub.slice(1, -1) : sub;
        return `${base}<sub class="math-sub">${subContent}</sub>`;
    });

    // Common Greek letters
    const greekMap: Record<string, string> = {
        '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
        '\\epsilon': 'ε', '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ',
        '\\pi': 'π', '\\sigma': 'σ', '\\tau': 'τ', '\\phi': 'φ',
        '\\omega': 'ω', '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ',
        '\\Lambda': 'Λ', '\\Sigma': 'Σ', '\\Phi': 'Φ', '\\Omega': 'Ω',
    };

    Object.entries(greekMap).forEach(([latex, unicode]) => {
        html = html.replace(new RegExp(latex.replace('\\', '\\\\'), 'g'), unicode);
    });

    // Common operators
    html = html.replace(/\\times/g, '×');
    html = html.replace(/\\div/g, '÷');
    html = html.replace(/\\pm/g, '±');
    html = html.replace(/\\neq/g, '≠');
    html = html.replace(/\\leq/g, '≤');
    html = html.replace(/\\geq/g, '≥');
    html = html.replace(/\\approx/g, '≈');
    html = html.replace(/\\infty/g, '∞');

    // Wrap in styled span
    return `<span class="math-inline">${html}</span>`;
}

export default remarkSimpleMath;
