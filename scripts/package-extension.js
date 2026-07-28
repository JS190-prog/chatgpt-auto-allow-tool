const childProcess = require("child_process");
const fs = require("fs");
const path = require("path");
const { validateCurrentVersion } = require("./validate-version");

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
validateCurrentVersion();
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
const archivePaths = [...files.filter((file) => !file.startsWith("icons/")), "icons"];

for (const file of files) {
  if (!fs.existsSync(file)) {
    throw new Error(`Cannot package missing file: ${file}`);
  }
}

fs.mkdirSync(outDir, { recursive: true });

if (fs.existsSync(outFile)) {
  throw new Error(`Output already exists; move it before packaging: ${outFile}`);
}

const powershellPaths = archivePaths
  .map((file) => `'${path.resolve(file).replaceAll("'", "''")}'`)
  .join(",");
const powershellOutput = path.resolve(outFile).replaceAll("'", "''");
const command = `Compress-Archive -LiteralPath @(${powershellPaths}) -DestinationPath '${powershellOutput}' -CompressionLevel Optimal`;

childProcess.execFileSync("powershell", ["-NoProfile", "-Command", command], {
  stdio: "inherit"
});

console.log(`Packaged ${outFile}`);
