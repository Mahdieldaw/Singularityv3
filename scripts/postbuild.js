const fs = require("fs");
const p = require("path");

// ════════════════════════════════════════════════════════════════════════
// Recursive copy function (used for fonts and models)
// ════════════════════════════════════════════════════════════════════════
function copyRecursive(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(child => {
      copyRecursive(p.join(src, child), p.join(dest, child));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// ensure dirs
fs.mkdirSync("dist/ui", { recursive: true });
fs.mkdirSync("dist/icons", { recursive: true });

// NOTE: main-world-injector.js is now built by esbuild into dist/main-world-injector.js

// copy manifest
fs.copyFileSync("manifest.json", "dist/manifest.json");

// copy & tweak UI html
if (fs.existsSync("ui/index.html")) {
  let html = fs.readFileSync("ui/index.html", "utf8");
  html = html.replace("index.tsx", "index.js");
  fs.writeFileSync("dist/ui/index.html", html);
}

// optional assets
if (fs.existsSync("ui/styles/index.css")) {
  fs.mkdirSync("dist/ui/styles", { recursive: true });
  fs.copyFileSync("ui/styles/index.css", "dist/ui/styles/index.css");
}
if (fs.existsSync("src/offscreen.html"))
  fs.copyFileSync("src/offscreen.html", "dist/offscreen.html");
if (fs.existsSync("src/offscreen.css"))
  fs.copyFileSync("src/offscreen.css", "dist/offscreen.css");
if (fs.existsSync("src/oi.html"))
  fs.copyFileSync("src/oi.html", "dist/oi.html");

// ════════════════════════════════════════════════════════════════════════
// Copy embedding model artifacts
// ════════════════════════════════════════════════════════════════════════
const modelsSource = p.join(__dirname, "../models");
const modelsDest = p.join(__dirname, "../dist/models");

if (fs.existsSync(modelsSource)) {
  if (fs.existsSync(modelsDest)) {
    fs.rmSync(modelsDest, { recursive: true, force: true });
  }
  fs.mkdirSync(modelsDest, { recursive: true });
  copyRecursive(modelsSource, modelsDest);
  console.log("[postbuild] Copied models/ to dist/models/");
} else {
  console.warn("[postbuild] Warning: models/ directory not found - embeddings will not work");
}

// ════════════════════════════════════════════════════════════════════════
// Copy ONNX Runtime WASM files (for MV3 local loading)
// ════════════════════════════════════════════════════════════════════════
const onnxSource = p.join(__dirname, "../onnx");
const onnxDest = p.join(__dirname, "../dist/onnx");

if (fs.existsSync(onnxSource)) {
  fs.mkdirSync(onnxDest, { recursive: true });
  copyRecursive(onnxSource, onnxDest);
  console.log("[postbuild] Copied onnx/ to dist/onnx/");
} else {
  console.warn("[postbuild] Warning: onnx/ directory not found - WASM loading may fail");
}

// copy fonts
if (fs.existsSync("ui/fonts")) {
  fs.mkdirSync("dist/ui/fonts", { recursive: true });

  const fonts = fs.readdirSync("ui/fonts");
  for (const font of fonts) {
    copyRecursive(p.join("ui/fonts", font), p.join("dist/ui/fonts", font));
  }
}

/// icons - copy all PNG icons for the extension  
const iconNames = ["icon-16.png", "icon-32.png", "icon-48.png", "icon-128.png", "icon-192.png"];
for (const iconName of iconNames) {
  const candidates = [
    p.join("icons", iconName),
    iconName,
    iconName.replace("icon-", "Icon-"),
    p.join("icons", iconName.replace("icon-", "Icon-")),
  ];

  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  if (!existing) continue;

  fs.copyFileSync(existing, p.join("dist/icons", iconName));
  console.log(`[postbuild] Copied ${existing} → dist/icons/${iconName}`);
}
