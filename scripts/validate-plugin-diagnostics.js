const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const version = JSON.parse(fs.readFileSync("manifest.json", "utf8")).version;
const LOG_KEY = "pluginRefreshErrorLog";
const plain = (value) => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function bootBackground(stored) {
  let listener;
  let failNextWrite = false;
  const errors = [];
  const context = {
    URL,
    console: { error: (...args) => errors.push(args) },
    chrome: {
      runtime: {
        getManifest: () => ({ version }),
        onMessage: { addListener(callback) { listener = callback; } }
      },
      storage: {
        local: {
          async get(defaults) { await Promise.resolve(); return { ...defaults, ...stored }; },
          async set(values) {
            if (failNextWrite) { failNextWrite = false; throw new Error("storage unavailable"); }
            Object.assign(stored, plain(values));
          }
        },
        session: { async get() { return {}; }, async set() {}, async remove() {} }
      },
      tabs: {
        async get() { return { url: "https://chatgpt.com/c/test" }; },
        async update() { throw new Error("navigation rejected"); },
        onRemoved: { addListener() {} }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("background.js", "utf8"), context);
  return {
    errors,
    failWrite() { failNextWrite = true; },
    send(message) {
      return new Promise((resolve) => {
        assert.strictEqual(listener(message, { tab: { id: 42 }, url: "https://chatgpt.com/settings/plugins-settings/test" }, resolve), true);
      });
    },
    record(entry) { return this.send({ type: "record-plugin-refresh-error", entry }); }
  };
}

function bootOptions(stored) {
  const elements = new Map();
  const copied = [];
  let storageListener;
  let denyCopy = false;
  let denyRead = false;
  const context = {
    document: {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, {
          value: "", checked: false, disabled: false, textContent: "", handlers: {},
          addEventListener(type, callback) { this.handlers[type] = callback; },
          focus() { this.focused = true; },
          select() { this.selected = true; }
        });
        return elements.get(selector);
      }
    },
    window: { setTimeout() {} },
    navigator: { clipboard: { async writeText(value) {
      if (denyCopy) throw new Error("clipboard denied");
      copied.push(value);
    } } },
    chrome: {
      storage: {
        local: { async get(defaults) {
          if (denyRead) throw new Error("storage read unavailable");
          return { ...defaults, ...stored };
        } },
        sync: { async get(defaults) { return { ...defaults, autoContinueDefaultOffApplied: true }; }, async set() {} },
        onChanged: { addListener(listener) { storageListener = listener; } }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("settings.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("options.js", "utf8"), context);
  return { context, elements, copied, storageListener,
    denyCopy() { denyCopy = true; }, denyRead() { denyRead = true; } };
}

async function main() {
  const stored = {};
  const worker = bootBackground(stored);
  const autoLogs = {};
  const autoWorker = bootBackground(autoLogs);
  assert.strictEqual((await autoWorker.send({ type: "record-auto-continue-error", entry: {
    phase: "wait-send-button", message: "Sample send control unavailable", sentCount: 1, maxTurns: 2, route: "conversation"
  } })).ok, true);
  assert.strictEqual(autoLogs[LOG_KEY][0].feature, "auto-continue");
  assert.strictEqual(autoLogs[LOG_KEY][0].phase, "wait-send-button");
  assert.strictEqual(autoLogs[LOG_KEY][0].code, "auto-continue-error");
  assert.strictEqual(autoLogs[LOG_KEY][0].sentCount, 1);
  assert.strictEqual(autoLogs[LOG_KEY][0].maxTurns, 2);
  assert.strictEqual((await worker.record({
    plugin: "Sample plugin", phase: "click-refresh", code: "plugin-refresh-error",
    message: "Still waiting https://example.invalid/private?token=test Bearer example-secret token=example-secret",
    elapsedMs: 61000, waitElapsedMs: 60000, timeoutMs: 60000,
    buttonState: "disabled", route: "detail", clickCount: 0, total: 2, clicked: 1, skipped: 0,
    rawPageContent: "MUST NOT BE STORED"
  })).ok, true);
  const entry = stored[LOG_KEY][0];
  assert.strictEqual(entry.extensionVersion, version);
  assert.strictEqual(entry.feature, "plugin-refresh");
  assert.match(entry.time, /^\d{4}-\d{2}-\d{2}T/);
  assert.strictEqual(entry.waitElapsedMs, 60000);
  assert.strictEqual(entry.buttonState, "disabled");
  assert.strictEqual(entry.phase, "click-refresh");
  assert.strictEqual(entry.clicked, 1);
  assert.strictEqual(entry.rawPageContent, undefined);
  assert.ok(!JSON.stringify(entry).includes("example-secret"));
  assert.ok(!JSON.stringify(entry).includes("example.invalid"));

  await Promise.all(Array.from({ length: 40 }, (_, i) => worker.record({ plugin: `Concurrent ${i}` })));
  assert.strictEqual(stored[LOG_KEY].length, 41, "concurrent tabs must not lose each other's records");
  assert.strictEqual(new Set(stored[LOG_KEY].map(log => log.plugin)).size, 41);
  await Promise.all(Array.from({ length: 70 }, (_, i) => worker.record({ plugin: `Bounded ${i}` })));
  assert.strictEqual(stored[LOG_KEY].length, 100);
  assert.strictEqual(stored[LOG_KEY].at(-1).plugin, "Bounded 69");
  assert.ok(!stored[LOG_KEY].some(log => log.plugin === "Sample plugin"));

  const restarted = bootBackground(stored);
  await restarted.record({ plugin: "After worker restart" });
  assert.strictEqual(stored[LOG_KEY].length, 100);
  assert.strictEqual(stored[LOG_KEY].at(-2).plugin, "Bounded 69");
  restarted.failWrite();
  const failed = await restarted.record({ plugin: "Failed storage" });
  assert.strictEqual(failed.ok, false);
  assert.match(failed.error, /storage unavailable/);
  assert.strictEqual(restarted.errors.length, 1);
  await restarted.record({ plugin: "After storage recovery" });
  assert.strictEqual(stored[LOG_KEY].at(-1).plugin, "After storage recovery");
  const navigation = await restarted.send({ type: "open-plugin-settings-for-refresh", tabId: 42 });
  assert.strictEqual(navigation.ok, false);
  assert.match(navigation.error, /navigation rejected/);
  assert.strictEqual(stored[LOG_KEY].at(-1).source, "background");
  assert.strictEqual(stored[LOG_KEY].at(-1).phase, "navigate-settings");

  const options = bootOptions(stored);
  await flush();
  const logField = options.elements.get("#diagnosticLog");
  assert.strictEqual(JSON.parse(logField.value)[0].phase, "navigate-settings");
  assert.strictEqual(options.elements.get("#copyLog").disabled, false);
  await options.elements.get("#copyLog").handlers.click();
  assert.strictEqual(options.copied[0], logField.value);
  options.denyCopy();
  await options.context.copyDiagnosticLog();
  assert.strictEqual(logField.selected, true);
  assert.match(options.elements.get("#diagnosticStatus").textContent, /Ctrl\+C/);
  const unreadableOptions = bootOptions(stored);
  await flush();
  unreadableOptions.denyRead();
  assert.strictEqual(await unreadableOptions.context.loadDiagnosticLog(), false);
  assert.strictEqual(unreadableOptions.elements.get("#diagnosticLog").value, "");
  assert.strictEqual(unreadableOptions.elements.get("#copyLog").disabled, true);
  const previousCount = JSON.parse(logField.value).length;
  stored[LOG_KEY] = [];
  options.storageListener({ [LOG_KEY]: { newValue: [] } }, "local");
  await flush();
  assert.strictEqual(logField.value, "");
  assert.strictEqual(options.elements.get("#copyLog").disabled, true);
  assert.strictEqual(previousCount, 100);
  options.denyRead();
  assert.strictEqual(await options.context.loadDiagnosticLog(), false);
  assert.match(options.elements.get("#diagnosticStatus").textContent, /로그 읽기 실패/);
  console.log("Plugin diagnostics checks OK: concurrent writes, bounded persistence, privacy, failures, options and clipboard");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
