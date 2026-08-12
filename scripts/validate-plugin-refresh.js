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
      local: {
        get: async (defaults) => defaults,
        set: async () => {}
      },
      sync: {
        get: async (defaults) => defaults,
        set: async () => {}
      }
    }
  },
  console,
  Date,
  document: { documentElement: {}, hidden: true, querySelectorAll: () => [] },
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

assert.strictEqual(source.includes("async function closePluginSettings()"), true);
assert.strictEqual(source.includes("function showPluginRefreshNotice(message, isError = false)"), true);
assert.strictEqual(source.split("async function closePluginSettings()", 2)[1].split("function showPluginRefreshNotice", 1)[0].includes('window.location.hash = "";'), true);
const refreshWorkflow = source
  .split("async function refreshConnectedPlugins({", 2)[1]
  .split("function shouldAutoRefresh", 1)[0];
assert.ok(refreshWorkflow.indexOf("await closePluginSettings();") < refreshWorkflow.indexOf('pluginRefreshState.status = "done";'));
assert.ok(refreshWorkflow.indexOf('pluginRefreshState.status = "done";') < refreshWorkflow.indexOf("showPluginRefreshNotice("));

const HOUR = 3600000;
const baseAutoRefresh = {
  enabled: true,
  autoRefreshHours: 6,
  running: false,
  hidden: true,
  lastRunAt: 0,
  now: 6 * HOUR
};
assert.strictEqual(context.shouldAutoRefresh(baseAutoRefresh), true);
assert.strictEqual(
  context.shouldAutoRefresh({ ...baseAutoRefresh, now: 6 * HOUR - 1 }),
  false,
  "period not elapsed"
);
assert.strictEqual(
  context.shouldAutoRefresh({ ...baseAutoRefresh, hidden: false }),
  false,
  "never runs while the user is looking at the tab"
);
assert.strictEqual(
  context.shouldAutoRefresh({ ...baseAutoRefresh, running: true }),
  false,
  "no second run on top of a running one"
);
assert.strictEqual(
  context.shouldAutoRefresh({ ...baseAutoRefresh, autoRefreshHours: 0, now: Number.MAX_SAFE_INTEGER }),
  false,
  "0 hours disables automatic refresh"
);
assert.strictEqual(
  context.shouldAutoRefresh({ ...baseAutoRefresh, enabled: false }),
  false,
  "master switch also gates automatic refresh"
);
// A tab that has never run keeps the stored claim of another tab.
assert.strictEqual(
  context.shouldAutoRefresh({ ...baseAutoRefresh, lastRunAt: 5 * HOUR, now: 6 * HOUR }),
  false,
  "another tab's fresh claim blocks this one"
);

for (const fixedName of ["1. office", "2. hwp", "3. blender", "4. cad", "5. photoshop", "6. Local Code", "7. OpenCrab Ingest"]) {
  assert.strictEqual(source.includes(fixedName), false, `Fixed plugin name found: ${fixedName}`);
}

console.log("Plugin refresh checks OK");
