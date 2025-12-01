const fs = require("fs");
const p = require("path");

// ensure dirs
fs.mkdirSync("dist/ui", { recursive: true });
fs.mkdirSync("dist/icons", { recursive: true });

// NOTE: main-world-injector.js is now built by esbuild into dist/main-world-injector.js

// copy manifest
fs.copyFileSync("manifest.json", "dist/manifest.json");

// copy & tweak UI html
if (fs.existsSync("ui/index.html")) {
  let html = fs.readFileSync("ui/index.html", "utf8");
  html = html
    .replace("index.tsx", "index.js")
    .replace("/icons/icon-16.png", "/icons/icon16.png");
  fs.writeFileSync("dist/ui/index.html", html);
}

// optional assets
if (fs.existsSync("ui/index.css"))
  fs.copyFileSync("ui/index.css", "dist/ui/index.css");
if (fs.existsSync("src/offscreen.html"))
  fs.copyFileSync("src/offscreen.html", "dist/offscreen.html");
if (fs.existsSync("src/offscreen.css"))
  fs.copyFileSync("src/offscreen.css", "dist/offscreen.css");
if (fs.existsSync("src/oi.html"))
  fs.copyFileSync("src/oi.html", "dist/oi.html");

// copy fonts
if (fs.existsSync("ui/fonts")) {
  fs.mkdirSync("dist/ui/fonts", { recursive: true });
  const fonts = fs.readdirSync("ui/fonts");
  for (const font of fonts) {
    fs.copyFileSync(p.join("ui/fonts", font), p.join("dist/ui/fonts", font));
  }
}

/// icons - copy all PNG icons for the extension  
const map = [
  ["icon-16.png", "icon16.png"],
  ["icon-32.png", "icon32.png"],
  ["icon-48.png", "icon48.png"],
  ["Icon-48.png", "icon48.png"],  // fallback for capitalized version
  ["icon-128.png", "icon128.png"],
  ["icon-192.png", "icon192.png"],
];
for (const [src, dst] of map) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, p.join("dist/icons", dst));
    console.log(`[postbuild] Copied ${src} → dist/icons/${dst}`);
  }
}
