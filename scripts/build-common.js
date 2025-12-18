const esbuild = require("esbuild");

/**
 * Shared build function for all bundles
 * @param {boolean} isProduction - Whether to build for production
 * @param {boolean} generateMeta - Whether to generate metafiles for analysis
 */
async function buildAll(isProduction = false, generateMeta = false) {
    const mode = isProduction ? "production" : "development";
    console.log(`\n🔨 Building in ${mode.toUpperCase()} mode${generateMeta ? " with analysis" : ""}...\n`);

    const commonOptions = {
        bundle: true,
        platform: "browser",
        target: "chrome110",
        logLevel: "info",
        legalComments: "none",
        metafile: generateMeta,
        ...(isProduction && {
            define: {
                "process.env.NODE_ENV": '"production"',
            },
            minify: true,
            drop: ["console", "debugger"],
        }),
    };

    const results = [];

    // Build service worker
    console.log("Building bg.js...");
    const swResult = await esbuild.build({
        ...commonOptions,
        entryPoints: ["src/sw-entry.js"],
        format: "iife",
        outfile: "dist/bg.js",
    });
    results.push({ name: "bg", result: swResult });

    // Build content script
    console.log("Building cs-openai.js...");
    const csResult = await esbuild.build({
        ...commonOptions,
        entryPoints: ["src/cs-openai.js"],
        format: "iife",
        outfile: "dist/cs-openai.js",
    });
    results.push({ name: "cs-openai", result: csResult });

    // Build offscreen
    console.log("Building offscreen.js...");
    const offscreenResult = await esbuild.build({
        ...commonOptions,
        entryPoints: ["src/offscreen-entry.js"],
        format: "esm",
        outfile: "dist/offscreen.js",
    });
    results.push({ name: "offscreen", result: offscreenResult });

    // Build oi
    console.log("Building oi.js...");
    const oiResult = await esbuild.build({
        ...commonOptions,
        entryPoints: ["src/oi.js"],
        format: "iife",
        outfile: "dist/oi.js",
    });
    results.push({ name: "oi", result: oiResult });

    // Build UI
    console.log("Building ui/index.js...");
    const uiResult = await esbuild.build({
        ...commonOptions,
        entryPoints: ["ui/index.tsx"],
        format: "esm",
        splitting: true,
        outdir: "dist/ui",
        loader: { ".ts": "ts", ".tsx": "tsx", ".svg": "file", ".png": "file", ".jpg": "file", ".jpeg": "file" },
        assetNames: "[name]",  // Remove hashes from asset filenames for stable Chrome extension paths
        publicPath: "/ui/",    // Ensure CSS references assets relative to extension root
        jsx: "automatic",
    });
    results.push({ name: "ui", result: uiResult });

    return results;
}

module.exports = { buildAll };
