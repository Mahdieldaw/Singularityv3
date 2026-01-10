import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';

// Cache the processor to avoid recreating it
let processor: any = null;

/**
 * Lazy-loads KaTeX and related plugins.
 * This function is only called when math is detected in the content.
 */
export async function loadMathPlugins() {
    // Parallel load all necessary modules
    const [
        { default: remarkMath },
        { default: rehypeKatex },
        _katex // Loaded for side effects
    ] = await Promise.all([
        import('remark-math'),
        import('rehype-katex'),
        import('katex')
    ]);

    return {
        remarkMath,
        rehypeKatex
    };
}

/**
 * Lazy-loads KaTeX and renders math in markdown content.
 * This function is only called when math is detected in the content.
 */
export async function renderMathInMarkdown(content: string): Promise<string> {
    // 1. Initialize processor if needed
    if (!processor) {
        const { remarkMath, rehypeKatex } = await loadMathPlugins();

        processor = unified()
            .use(remarkParse)
            .use(remarkMath)
            .use(remarkRehype)
            .use(rehypeKatex)
            .use(rehypeStringify);
    }

    // 2. Process the content
    try {
        const result = await processor.process(content);
        return String(result);
    } catch (error) {
        console.error('Failed to render math:', error);
        return content; // Fallback to original content
    }
}

/**
 * Checks if the content contains math syntax ($...$ or $$...$$)
 */
export function containsMath(content: string): boolean {
    // Simple heuristic: check for $ delimiters
    // This is a fast check to decide if we should load the heavy math machinery
    return /\$\$[\s\S]+?\$\$/.test(content) || /\$[\s\S]+?\$/.test(content);
}
