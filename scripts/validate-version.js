const fs = require("fs");

const VERSION_PATTERN = /^\d+(?:\.\d+){0,3}$/;

function parseVersion(value, label) {
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
    throw new Error(`${label} must be a Chrome-compatible numeric version: ${value}`);
  }
  return value.split(".").map(Number).concat([0, 0, 0, 0]).slice(0, 4);
}

function compareVersions(left, right) {
  const a = parseVersion(left, "candidate version");
  const b = parseVersion(right, "published version floor");
  for (let index = 0; index < 4; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

function validateVersionContract(manifestVersion, packageVersion, publishedFloor) {
  parseVersion(manifestVersion, "manifest version");
  if (manifestVersion !== packageVersion) {
    throw new Error(`Version mismatch: manifest=${manifestVersion}, package=${packageVersion}`);
  }
  if (compareVersions(manifestVersion, publishedFloor) < 0) {
    throw new Error(
      `VERSION_DOWNGRADE_BLOCKED: candidate ${manifestVersion} is older than published floor ${publishedFloor}`
    );
  }
  return manifestVersion;
}

function validateCurrentVersion() {
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  const packageMetadata = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const release = JSON.parse(fs.readFileSync("release-version.json", "utf8"));

  return validateVersionContract(
    manifest.version,
    packageMetadata.version,
    release.minimumPublishedVersion
  );
}

if (require.main === module) {
  console.log(`Version contract OK: ${validateCurrentVersion()}`);
}

module.exports = { compareVersions, validateCurrentVersion, validateVersionContract };
