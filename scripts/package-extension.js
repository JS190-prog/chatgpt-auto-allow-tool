const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const outDir = "dist";
const outFile = path.join(outDir, `chatgpt-auto-allow-tool-${manifest.version}.zip`);

const files = [
  "manifest.json",
  "content.js",
  "options.html",
  "options.css",
  "options.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png"
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    throw new Error(`Cannot package missing file: ${file}`);
  }
}

fs.mkdirSync(outDir, { recursive: true });

if (fs.existsSync(outFile)) {
  fs.rmSync(outFile);
}

childProcess.execFileSync("git", ["archive", "--format=zip", `--output=${outFile}`, "HEAD", ...files], {
  stdio: "inherit"
});

console.log(`Packaged ${outFile}`);
