const assert = require("assert");
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
assert.strictEqual(validateCurrentVersion(), "0.2.4");

console.log("Version downgrade checks OK.");
