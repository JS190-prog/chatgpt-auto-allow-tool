const fs = require("fs");

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const requiredFields = ["manifest_version", "name", "description", "version"];
const missing = requiredFields.filter((field) => !manifest[field]);

if (manifest.manifest_version !== 3) {
  throw new Error("manifest_version must be 3");
}

if (missing.length > 0) {
  throw new Error(`Missing manifest fields: ${missing.join(", ")}`);
}

for (const script of manifest.content_scripts || []) {
  for (const file of script.js || []) {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing content script file: ${file}`);
    }
  }
}

if (manifest.options_page && !fs.existsSync(manifest.options_page)) {
  throw new Error(`Missing options page: ${manifest.options_page}`);
}

if (manifest.action?.default_popup && !fs.existsSync(manifest.action.default_popup)) {
  throw new Error(`Missing action popup: ${manifest.action.default_popup}`);
}

for (const [size, file] of Object.entries(manifest.icons || {})) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing extension icon ${size}: ${file}`);
  }
}

for (const [size, file] of Object.entries(manifest.action?.default_icon || {})) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing action icon ${size}: ${file}`);
  }
}

console.log(`Manifest OK: ${manifest.name} ${manifest.version}`);
