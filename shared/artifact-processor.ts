/**
 * ArtifactProcessor - Provider-agnostic artifact extraction
 * 
 * Extracts rich content (SVG, HTML, Markdown) from AI responses and
 * separates them from the main text for specialized rendering.
 */

export interface Artifact {
    title: string;
    identifier: string;
    content: string;
    type: string; // MIME type: 'image/svg+xml', 'text/html', 'text/markdown'
}

export interface ProcessedResponse {
    cleanText: string;
    artifacts: Artifact[];
}

export class ArtifactProcessor {
    private artifactRegex = /<document\s+([^>]+)>([\s\S]*?)<\/document>/g;
    private attrRegex = /(\w+)="([^"]*)"/g;

    /**
     * Process AI response text and extract artifacts
     * @param rawText - The full response text from the AI
     * @returns Processed response with clean text and extracted artifacts
     */
    process(rawText: string): ProcessedResponse {
        if (!rawText || typeof rawText !== 'string') {
            return { cleanText: '', artifacts: [] };
        }

        const artifacts: Artifact[] = [];

        // Extract all <document> tags
        let cleanText = rawText;
        let match: RegExpExecArray | null;

        while ((match = this.artifactRegex.exec(rawText)) !== null) {
            const [fullMatch, attrString, content] = match;

            // Parse attributes
            const attributes: Record<string, string> = {};
            let attrMatch: RegExpExecArray | null;

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
     */
    private detectType(content: string, identifier?: string): string {
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
}
