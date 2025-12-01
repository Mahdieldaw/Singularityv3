const { buildAll } = require("./build-common");
const fs = require("fs");

function formatBytes(bytes) {
    return (bytes / 1024).toFixed(2) + " KB";
}

async function buildProd() {
    try {
        const results = await buildAll(true, false); // Production mode, no metafiles

        console.log("\n✅ Production build complete!");
        console.log("🚀 Optimized and minified for deployment");
        console.log("\nBundle sizes:");

        // Show bundle sizes
        const files = [
            { path: "dist/bg.js", name: "Service Worker" },
            { path: "dist/cs-openai.js", name: "Content Script" },
            { path: "dist/offscreen.js", name: "Offscreen" },
            { path: "dist/oi.js", name: "OI Bundle" },
            { path: "dist/ui/index.js", name: "UI Bundle" },
        ];

        files.forEach(({ path, name }) => {
            if (fs.existsSync(path)) {
                const size = fs.statSync(path).size;
                console.log(`  ${name.padEnd(20)} ${formatBytes(size)}`);
            }
        });
    } catch (err) {
        console.error("Build failed:", err);
        process.exit(1);
    }
}

buildProd();
