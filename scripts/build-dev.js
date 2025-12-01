const { buildAll } = require("./build-common");

async function buildDev() {
    try {
        await buildAll(false, false); // Development mode, no metafiles
        console.log("\n✅ Development build complete!");
        console.log("📝 Includes helpful error messages and debugging tools");
    } catch (err) {
        console.error("Build failed:", err);
        process.exit(1);
    }
}

buildDev();
