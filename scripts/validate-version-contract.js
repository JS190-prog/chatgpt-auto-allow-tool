const assert = require("assert");
const fs = require("fs");
const {
  compareVersions,
  validateCurrentVersion,
  validateVersionContract
} = require("./validate-version");

assert.strictEqual(compareVersions("0.2.2", "0.2.3"), -1);
assert.strictEqual(compareVersions("0.2.3", "0.2.3"), 0);
assert.strictEqual(compareVersions("0.2.4", "0.2.3"), 1);
assert.throws(
  () => validateVersionContract("0.2.2", "0.2.2", "0.2.3"),
  /VERSION_DOWNGRADE_BLOCKED/
);
assert.throws(
  () => validateVersionContract("0.2.3", "0.2.2", "0.2.3"),
  /Version mismatch/
);
assert.match(validateCurrentVersion(), /^\d+(?:\.\d+){0,3}$/);
const packageScript = fs.readFileSync("scripts/package-extension.js", "utf8");
assert.ok(packageScript.includes('process.env.CHATGPT_AUTO_ALLOW_PWSH || "pwsh"'));
assert.ok(!packageScript.includes('process.platform === "win32" ? "powershell" : "pwsh"'));

console.log("Version downgrade checks OK.");
