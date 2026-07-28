const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("content.js", "utf8");
const listeners = [];
class FakeElement {}
class FakeMutationObserver {
  observe() {}
  disconnect() {}
}

const context = {
  chrome: {
    runtime: { onMessage: { addListener: (listener) => listeners.push(listener) } },
    storage: {
      onChanged: { addListener() {} },
      sync: {
        get: async (defaults) => defaults,
        set: async () => {}
      }
    }
  },
  console,
  document: { documentElement: {}, querySelectorAll: () => [] },
  Element: FakeElement,
  Map,
  MutationObserver: FakeMutationObserver,
  Node: { TEXT_NODE: 3, DOCUMENT_POSITION_FOLLOWING: 4 },
  PointerEvent: class {},
  MouseEvent: class {},
  Set,
  window: {
    clearTimeout,
    getComputedStyle: () => ({}),
    location: { hash: "", hostname: "chatgpt.com" },
    setInterval: () => 0,
    setTimeout
  }
};

vm.createContext(context);
vm.runInContext(source, context);

assert.deepStrictEqual(
  [...context.buildPluginEntryKeys(["Same", "Same", "Different"])],
  ["same#1", "same#2", "different#1"]
);
assert.strictEqual(context.isControlDisabled({ disabled: true }), true);
assert.strictEqual(
  context.isControlDisabled({
    disabled: false,
    hasAttribute: () => false,
    getAttribute: () => null
  }),
  false
);
assert.strictEqual(context.classifyPluginDetail({}, null), "refresh");
assert.strictEqual(context.classifyPluginDetail(null, {}), "skip");
assert.strictEqual(context.classifyPluginDetail(null, null), "loading");
assert.strictEqual(listeners.length, 1);

for (const fixedName of ["1. office", "2. hwp", "3. blender", "4. cad", "5. photoshop", "6. Local Code", "7. OpenCrab Ingest"]) {
  assert.strictEqual(source.includes(fixedName), false, `Fixed plugin name found: ${fixedName}`);
}

console.log("Plugin refresh checks OK");
