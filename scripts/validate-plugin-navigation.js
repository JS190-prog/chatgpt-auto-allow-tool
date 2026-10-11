const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const SETTINGS_URL = "https://chatgpt.com/settings/plugins-settings";
const pendingKey = "pendingPluginRefresh:42";
const stored = {};
const diagnosticStored = {};
const updates = [];
const removedListeners = [];
let updateError = null;
let logWriteError = null;
const backgroundErrors = [];
let tabURL = "https://chatgpt.com/c/test";
let backgroundListener;

function bootBackground() {
  const context = {
    URL,
    console: { error: (...args) => backgroundErrors.push(args) },
    chrome: {
      runtime: {
        getManifest: () => ({ version: "0.5.11" }),
        onMessage: { addListener(listener) { backgroundListener = listener; } }
      },
      storage: {
        local: {
          async get(defaults) { return { ...defaults, ...diagnosticStored }; },
          async set(values) {
            if (logWriteError) throw logWriteError;
            Object.assign(diagnosticStored, values);
          }
        },
        session: {
          async get(key) { return { [key]: stored[key] }; },
          async set(values) { Object.assign(stored, values); },
          async remove(key) { delete stored[key]; }
        }
      },
      tabs: {
        async get(id) { return { id, url: tabURL }; },
        async update(id, values) {
          assert.ok(stored[pendingKey], "the request must survive before navigation starts");
          if (updateError) throw updateError;
          updates.push({ id, ...values });
          tabURL = values.url;
        },
        onRemoved: { addListener(listener) { removedListeners.push(listener); } }
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("background.js", "utf8"), context);
}

function sendBackground(message, url, tabId = 42) {
  return new Promise((resolve) => {
    const sender = url ? { url, tab: { id: tabId, url } } : {};
    assert.strictEqual(backgroundListener(message, sender, resolve), true);
  });
}

class FakeElement {
  constructor(text = "") { this.innerText = text; }
  getBoundingClientRect() { return { width: 100, height: 40 }; }
  hasAttribute() { return false; }
}
class FakeMutationObserver {
  observe() {}
  disconnect() {}
}

function bootContent(pathname) {
  const listeners = [];
  const context = {
    chrome: {
      runtime: {
        onMessage: { addListener(listener) { listeners.push(listener); } },
        sendMessage: async () => ({ ok: true, override: null, options: null })
      },
      storage: {
        onChanged: { addListener() {} },
        local: { get: async (defaults) => defaults, set: async () => {} },
        sync: { get: () => new Promise(() => {}), set: async () => {} }
      }
    },
    console,
    document: {
      documentElement: {}, hidden: true,
      querySelector: () => null, querySelectorAll: () => []
    },
    Element: FakeElement,
    MutationObserver: FakeMutationObserver,
    Node: { TEXT_NODE: 3, DOCUMENT_POSITION_FOLLOWING: 4 },
    window: {
      location: { hostname: "chatgpt.com", pathname, hash: "" },
      getComputedStyle: () => ({ opacity: "1" }),
      setInterval: () => 0, setTimeout, clearTimeout
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("settings.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("content.js", "utf8"), context);
  return context;
}

function plain(value) { return JSON.parse(JSON.stringify(value)); }

function bootPopup() {
  const elements = new Map();
  const context = {
    chrome: {
      runtime: { sendMessage: (message) => sendBackground(message) },
      storage: { sync: { get: () => new Promise(() => {}), set: async () => {} } },
      tabs: {
        query: async () => [{ id: 42 }],
        sendMessage: async () => ({ status: "idle" })
      }
    },
    document: {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, {
          checked: false,
          addEventListener(type, callback) { this[type] = callback; }
        });
        return elements.get(selector);
      }
    },
    window: { setInterval: () => 0, clearInterval() {} }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("settings.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("popup.js", "utf8"), context);
  return { context, elements };
}

async function main() {
  const content = bootContent("/plugins");
  content.document.querySelector = () => ({});
  content.getModernPluginListSections = () => [{}];
  content.getModernPluginRowButtons = () => [new FakeElement("Unrelated plugin")];
  assert.strictEqual(content.getInstalledPluginEntries().length, 0,
    "the plugin directory must never be collected as the installed settings list");
  content.window.location.pathname = "/settings/plugins-settings";
  assert.strictEqual(content.getInstalledPluginEntries().length, 1);

  bootBackground();
  tabURL = "https://chatgpt.com/settings/general-settings";
  content.window.location.pathname = "/settings/general-settings";
  let navigationRequests = 0;
  content.chrome.runtime.sendMessage = async (message) => {
    if (message.type !== "open-plugin-settings-for-refresh") return { ok: true };
    navigationRequests += 1;
    return sendBackground(message, "https://chatgpt.com/settings/general-settings");
  };
  content.clickOnceLikeUser = () => assert.fail("same-named sidebar buttons must not be clicked");
  assert.strictEqual(await content.openPluginSettings({ inspectAll: true }), false);
  assert.strictEqual(navigationRequests, 1);
  assert.deepStrictEqual(updates, [{ id: 42, url: SETTINGS_URL }]);

  // A new document and a restarted service worker must still receive one request.
  bootBackground();
  assert.strictEqual((await sendBackground({ type: "take-pending-plugin-refresh" },
    "https://chatgpt.com/plugins")).options, null);
  assert.ok(stored[pendingKey], "the wrong route must not consume the request");
  assert.strictEqual((await sendBackground({ type: "get-plugin-refresh-navigation", tabId: 42 })).state.status, "running");
  assert.strictEqual((await sendBackground({ type: "take-pending-plugin-refresh" }, SETTINGS_URL, 43)).options, null,
    "a request belongs only to the initiating tab");

  const resumed = bootContent("/settings/plugins-settings");
  resumed.chrome.runtime.sendMessage = (message) => sendBackground(message, SETTINGS_URL);
  const resumedOptions = [];
  resumed.refreshConnectedPlugins = async (options) => resumedOptions.push(plain(options));
  await resumed.resumePendingPluginRefresh();
  await resumed.resumePendingPluginRefresh();
  assert.strictEqual(resumedOptions.length, 1, "navigation must resume the sweep exactly once");
  assert.strictEqual(resumedOptions[0].inspectAll, true);
  assert.strictEqual(stored[pendingKey], undefined);

  const popup = bootPopup();
  popup.context.renderRefreshState({ status: "done", clicked: 2, total: 3, skipped: 1 });
  assert.strictEqual(popup.elements.get("#refreshStatus").textContent, "클릭 2/3 · 건너뜀 1");
  popup.context.renderRefreshState({ status: "running", clicked: 1, total: 3, skipped: 1 });
  assert.match(popup.elements.get("#refreshStatus").textContent, /^2\/3 처리 중/);
  popup.elements.get("#inspectAllPlugins").checked = true;
  tabURL = "https://chatgpt.com/c/test";
  await popup.elements.get("#refreshPlugins").click();
  assert.strictEqual(updates.at(-1).url, SETTINGS_URL,
    "the actual popup refresh button must open settings directly");
  assert.strictEqual(stored[pendingKey].options.inspectAll, true);
  assert.strictEqual((await popup.context.sendToActiveTab("get-plugin-refresh-state")).status, "running",
    "the popup must retain progress while the old content script is replaced");
  const claims = await Promise.all([
    sendBackground({ type: "take-pending-plugin-refresh" }, SETTINGS_URL),
    sendBackground({ type: "take-pending-plugin-refresh" }, SETTINGS_URL)
  ]);
  assert.strictEqual(claims.filter(result => result.options).length, 1,
    "simultaneous resume requests must not duplicate a sweep");
  assert.strictEqual((await popup.context.sendToActiveTab("get-plugin-refresh-state")).status, "idle");

  content.window.location.pathname = "/settings/plugins-settings";
  content.waitForCondition = async (predicate) => {
    assert.ok(predicate(), "list readiness must also require the settings route");
    return true;
  };
  assert.strictEqual(await content.openPluginSettings(), true);
  assert.strictEqual(navigationRequests, 1, "an already open settings list must not reload");

  tabURL = `${SETTINGS_URL}/plugin_asdk_app_test`;
  assert.strictEqual((await sendBackground({ type: "open-plugin-settings-for-refresh", tabId: 42 })).ok, true);
  assert.strictEqual(updates.at(-1).url, SETTINGS_URL,
    "starting from a detail must go to the full installed list");
  removedListeners.at(-1)(42);
  assert.strictEqual(stored[pendingKey], undefined, "closing the tab must remove its request");

  tabURL = "https://example.com/";
  const countBeforeInvalid = updates.length;
  assert.strictEqual((await sendBackground({ type: "open-plugin-settings-for-refresh", tabId: 42 })).ok, false);
  assert.strictEqual(updates.length, countBeforeInvalid, "unrelated tabs must never navigate");

  tabURL = "https://chatgpt.com/c/test";
  updateError = new Error("navigation rejected");
  assert.strictEqual((await sendBackground({ type: "open-plugin-settings-for-refresh", tabId: 42 })).ok, false);
  assert.strictEqual(stored[pendingKey], undefined, "a rejected navigation must not leave a replayable request");
  logWriteError = new Error("log storage rejected");
  await popup.elements.get("#refreshPlugins").click();
  assert.match(popup.elements.get("#refreshStatus").textContent, /navigation rejected/);
  assert.match(popup.elements.get("#refreshStatus").textContent, /진단 로그 저장 실패/);
  assert.strictEqual(backgroundErrors.length, 1);
  logWriteError = null;
  updateError = null;

  await sendBackground({ type: "open-plugin-settings-for-refresh", tabId: 42,
    options: { auto: true, previousRunAt: 123 } });
  const auto = await sendBackground({ type: "take-pending-plugin-refresh" }, SETTINGS_URL);
  assert.strictEqual(auto.options.auto, true);
  assert.strictEqual(auto.options.previousRunAt, 123);

  await sendBackground({ type: "open-plugin-settings-for-refresh", tabId: 42 });
  stored[pendingKey].createdAt = 0;
  assert.strictEqual((await sendBackground({ type: "take-pending-plugin-refresh" }, SETTINGS_URL)).options, null,
    "an old navigation request must not trigger a later refresh");
  assert.strictEqual(stored[pendingKey], undefined);
  console.log("Plugin settings navigation checks OK");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
