const { buildAll } = require("./build-common");
const fs = require("fs");

async function buildWithMeta() {
    console.log("Building with metafile generation for analysis...\n");

    // Ensure analysis directory exists
    fs.mkdirSync("dist/analysis", { recursive: true });

    // Build with production optimizations and metafiles
    const results = await buildAll(true, true);

    // Save metafiles
    results.forEach(({ name, result }) => {
        if (result.metafile) {
            const metaPath = `dist/analysis/meta-${name}.json`;
            fs.writeFileSync(metaPath, JSON.stringify(result.metafile));
            console.log(`✓ Saved metafile: ${metaPath}`);
        }
    });

    console.log("\n📊 Metafiles saved to dist/analysis/");
    console.log("Run 'npm run analyze:text' to visualize bundle composition");
}

buildWithMeta().catch((err) => {
    console.error(err);
    process.exit(1);
});
