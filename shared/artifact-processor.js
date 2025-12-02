/**
 * ArtifactProcessor - Provider-agnostic artifact extraction
 * 
 * Extracts rich content (SVG, HTML, Markdown) from AI responses and
 * separates them from the main text for specialized rendering.
 */

/**
 * @typedef {Object} Artifact
 * @property {string} title
 * @property {string} identifier
 * @property {string} content
 * @property {string} type - MIME type: 'image/svg+xml', 'text/html', 'text/markdown'
 */

/**
 * @typedef {Object} ProcessedResponse
 * @property {string} cleanText
 * @property {Artifact[]} artifacts
 */

export class ArtifactProcessor {
    constructor() {
        this.artifactRegex = /<document\s+([^>]+)>([\s\S]*?)<\/document>/g;
        this.attrRegex = /(\w+)="([^"]*)"/g;
    }

    /**
     * Process AI response text and extract artifacts
     * @param {string} rawText - The full response text from the AI
     * @returns {ProcessedResponse} Processed response with clean text and extracted artifacts
     */
    process(rawText) {
        if (!rawText || typeof rawText !== 'string') {
            return { cleanText: '', artifacts: [] };
        }

        const artifacts = [];

        // Extract all <document> tags
        let cleanText = rawText;
        let match;

        // Reset regex state
        this.artifactRegex.lastIndex = 0;

        while ((match = this.artifactRegex.exec(rawText)) !== null) {
            const [fullMatch, attrString, content] = match;

            // Parse attributes
            const attributes = {};
            let attrMatch;

            // Reset regex for attribute parsing
            this.attrRegex.lastIndex = 0;
            while ((attrMatch = this.attrRegex.exec(attrString)) !== null) {
                attributes[attrMatch[1]] = attrMatch[2];
            }

            // Auto-detect type if missing (pass identifier for filename-based detection)
            const identifier = attributes.identifier || `artifact-${Date.now()}`;
            let type = attributes.type || this.detectType(content, identifier);

            artifacts.push({
                title: attributes.title || 'Untitled Artifact',
                identifier: identifier,
                content: content.trim(),
                type: type,
            });

            // Remove artifact from main text
            cleanText = cleanText.replace(fullMatch, '');
        }

        return {
            cleanText: cleanText.trim(),
            artifacts,
        };
    }

    /**
     * Auto-detect artifact type from content and identifier
     * Supports both Claude's type attribute and Gemini's filename-based identifiers
     * @param {string} content
     * @param {string} [identifier]
     * @returns {string} MIME type
     */
    detectType(content, identifier) {
        // 1. Check identifier extension (Gemini pattern)
        if (identifier) {
            const ext = identifier.toLowerCase();
            if (ext.endsWith('.md')) return 'text/markdown';
            if (ext.endsWith('.svg')) return 'image/svg+xml';
            if (ext.endsWith('.html') || ext.endsWith('.htm')) return 'text/html';
            if (ext.endsWith('.py')) return 'text/x-python';
            if (ext.endsWith('.js')) return 'application/javascript';
            if (ext.endsWith('.json')) return 'application/json';
            if (ext.endsWith('.xml')) return 'application/xml';
            if (ext.endsWith('.css')) return 'text/css';
        }

        // 2. Check content signature (Claude pattern)
        const trimmed = content.trim();

        if (trimmed.startsWith('<svg')) {
            return 'image/svg+xml';
        }
        if (trimmed.startsWith('<!DOCTYPE html') || trimmed.includes('<html')) {
            return 'text/html';
        }
        if (trimmed.startsWith('```')) {
            return 'text/markdown';
        }

        return 'text/plain';
    }

    /**
     * Format a single artifact into the <document> XML format
     * @param {{ title: string; identifier: string; content: string }} artifact
     * @returns {string}
     */
    formatArtifact(artifact) {
        return `\n\n<document title="${artifact.title}" identifier="${artifact.identifier}">\n${artifact.content}\n</document>`;
    }

    /**
     * Inject images into text by replacing placeholders or appending
     * @param {string} text - The text containing placeholders like [Image of Title]
     * @param {Array<{ url: string; title: string }>} images - Array of image objects
     * @returns {string}
     */
    injectImages(text, images) {
        if (!text || !images || images.length === 0) return text;

        let newText = text;
        images.forEach((img) => {
            // Pattern: [Image of Title]
            // We escape the title for regex safety
            const escapedTitle = img.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`\\[Image of ${escapedTitle}\\]`, 'g');

            const markdownImage = `![${img.title}](${img.url})`;

            // If the placeholder exists, replace it
            if (pattern.test(newText)) {
                newText = newText.replace(pattern, markdownImage);
            } else {
                // If placeholder not found, append to bottom
                newText += `\n\n${markdownImage}`;
            }
        });

        return newText;
    }
}
