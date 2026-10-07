const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const settingsSource = fs.readFileSync("settings.js", "utf8");
const source = fs.readFileSync("content.js", "utf8");
const backgroundSource = fs.readFileSync("background.js", "utf8");
const optionsSource = fs.readFileSync("options.js", "utf8");
const optionsMarkup = fs.readFileSync("options.html", "utf8");
const popupSource = fs.readFileSync("popup.js", "utf8");
const popupMarkup = fs.readFileSync("popup.html", "utf8");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
class FakeElement {}
class FakeTextAreaElement extends FakeElement {}
class FakeMutationObserver {
  observe() {}
  disconnect() {}
}

const context = {
  chrome: {
    runtime: {
      onMessage: { addListener() {} },
      sendMessage: async () => ({ ok: true, override: null })
    },
    storage: {
      onChanged: { addListener() {} },
      local: { get: async (defaults) => defaults, set: async () => {} },
      sync: { get: async (defaults) => defaults, set: async () => {} }
    }
  },
  Date,
  document: { documentElement: {}, hidden: false, querySelector: () => null, querySelectorAll: () => [] },
  Element: FakeElement,
  HTMLTextAreaElement: FakeTextAreaElement,
  InputEvent: class {},
  Map,
  MutationObserver: FakeMutationObserver,
  Node: { TEXT_NODE: 3, DOCUMENT_POSITION_FOLLOWING: 4 },
  PointerEvent: class {},
  MouseEvent: class {},
  Set,
  WeakSet,
  window: {
    clearTimeout,
    getComputedStyle: () => ({}),
    location: { hash: "", hostname: "chatgpt.com" },
    setInterval: () => 0,
    setTimeout
  }
};

vm.createContext(context);
vm.runInContext(settingsSource, context);
vm.runInContext(source, context);

assert.strictEqual(context.normalizeAutoContinueMaxTurns(undefined), 1);
assert.strictEqual(context.normalizeAutoContinueMaxTurns(0), 1);
assert.strictEqual(context.normalizeAutoContinueMaxTurns(7.9), 7);
assert.strictEqual(context.normalizeAutoContinueMaxTurns(101), 100);
assert.strictEqual(context.resolveAutoContinueEnabled(false, null), false);
assert.strictEqual(context.resolveAutoContinueEnabled(false, true), true);
assert.strictEqual(context.resolveAutoContinueEnabled(true, false), false);
assert.strictEqual(context.resolveAutoContinueOverride(false, true), true);
assert.strictEqual(context.resolveAutoContinueOverride(true, false), false);
assert.strictEqual(context.resolveAutoContinueOverride(true, true), null);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.getAutoContinueDefaultMigration({
    autoContinueDefaultOffApplied: false,
    autoContinueEnabled: true
  }))),
  { autoContinueDefaultOffApplied: true, autoContinueEnabled: false },
  "a legacy enabled default is migrated to disabled"
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.getAutoContinueDefaultMigration({
    autoContinueDefaultOffApplied: false,
    autoContinueEnabled: false
  }))),
  { autoContinueDefaultOffApplied: true },
  "an already disabled default only records the migration"
);
assert.strictEqual(
  context.getAutoContinueDefaultMigration({ autoContinueDefaultOffApplied: true }),
  null,
  "the default migration runs only once"
);
assert.ok(settingsSource.includes('const AUTO_CONTINUE_DEFAULT_MIGRATION_KEY = "autoContinueDefaultOffApplied"'));
assert.ok(settingsSource.includes("autoContinueEnabled: false"));
assert.ok(settingsSource.includes("migration.autoContinueEnabled = DEFAULT_SETTINGS.autoContinueEnabled"));
for (const [name, text] of [["content.js", source], ["options.js", optionsSource], ["popup.js", popupSource]]) {
  assert.ok(!text.includes("const DEFAULT_SETTINGS"), `${name} must use the shared settings.js defaults`);
  assert.ok(!text.includes("function getAutoContinueDefaultMigration"), `${name} must not duplicate the migration`);
}
assert.deepStrictEqual(manifest.content_scripts[0].js, ["settings.js", "content.js"]);
assert.ok(optionsMarkup.indexOf("settings.js") < optionsMarkup.indexOf("options.js"));
assert.ok(popupMarkup.indexOf("settings.js") < popupMarkup.indexOf("popup.js"));
assert.ok(fs.readFileSync("scripts/package-extension.js", "utf8").includes('"settings.js"'));

const plainSettings = (value) => JSON.parse(JSON.stringify(value));
assert.strictEqual(context.normalizeSettings({ clickDelayMs: 0 }).clickDelayMs, 0, "0ms is a valid delay");
assert.strictEqual(context.normalizeSettings({ clickDelayMs: -5 }).clickDelayMs, 0);
assert.strictEqual(context.normalizeSettings({ clickDelayMs: "abc" }).clickDelayMs, 300);
assert.strictEqual(context.normalizeSettings({ clickDelayMs: 999999 }).clickDelayMs, 10000);
assert.strictEqual(context.normalizeSettings({ autoRefreshHours: -1 }).autoRefreshHours, 0);
assert.strictEqual(context.normalizeSettings({ autoRefreshHours: 99999 }).autoRefreshHours, 720);
assert.strictEqual(context.normalizeSettings({ autoContinuePrompt: "  " }).autoContinuePrompt, "이어서 진행");
assert.strictEqual(context.normalizeSettings({ enabled: undefined }).enabled, true, "a removed key falls back to its default");
assert.deepStrictEqual(plainSettings(context.normalizeSettings()), plainSettings(vm.runInContext("DEFAULT_SETTINGS", context)));

const schedulable = {
  enabled: true,
  autoContinueEnabled: true,
  observedGeneration: true,
  pending: false,
  sending: false,
  sentCount: 0,
  maxTurns: 2,
  hasMessage: true,
  handled: false
};
assert.strictEqual(context.shouldScheduleAutoContinue(schedulable), true);
assert.strictEqual(
  context.shouldScheduleAutoContinue({ ...schedulable, observedGeneration: false }),
  false,
  "an old completed response must not trigger after opening the page"
);
assert.strictEqual(
  context.shouldScheduleAutoContinue({ ...schedulable, handled: true }),
  false,
  "a rerendered scan must not submit the same response twice"
);
assert.strictEqual(
  context.shouldScheduleAutoContinue({ ...schedulable, sentCount: 2 }),
  false,
  "the configured continuation count is a hard stop"
);
assert.strictEqual(
  context.shouldScheduleAutoContinue({ ...schedulable, autoContinueEnabled: false }),
  false,
  "the feature is opt-in"
);

assert.ok(source.includes("markExistingAssistantMessagesHandled({ keepLatest: generating })"));
assert.ok(source.includes("if (!autoContinueState.observedGeneration && !autoContinueState.awaitingAutoResponse)"));
assert.ok(source.includes("getComposerText(composer)"));
assert.ok(source.includes("autoContinueState.sentCount += 1"));
assert.ok(source.includes("isResponseGenerating() || !getComposerText(composer)"));
assert.ok(source.includes('function showAutoContinueNotice(message, isError = false)'));
assert.ok(source.includes('"chatgpt-auto-allow-continue-notice"'));
assert.ok(source.includes("자동 이어서 진행 완료"));
const confirmedSend = source
  .split('"자동 이어서 진행 전송을 확인하지 못했습니다."', 2)[1]
  .split("} catch (error)", 1)[0];
assert.ok(
  confirmedSend.indexOf("autoContinueState.sentCount += 1") <
    confirmedSend.indexOf("showAutoContinueNotice(")
);
assert.ok(optionsMarkup.includes('id="autoContinueMaxTurns"'));
assert.ok(optionsMarkup.includes('min="1" max="100"'));
assert.ok(optionsSource.includes("normalizeSettings({"));
assert.ok(popupMarkup.includes('id="autoContinueEnabled"'));
assert.ok(popupMarkup.includes("이 탭 자동 이어서 진행"));
assert.ok(popupSource.includes('sendToActiveTab("set-tab-auto-continue-enabled"'));
assert.ok(!popupSource.includes("chrome.storage.sync.set({ autoContinueEnabled"));
assert.strictEqual(manifest.background.service_worker, "background.js");
assert.ok(
  fs.readFileSync("scripts/package-extension.js", "utf8").includes('"background.js"')
);

const backgroundMessageListeners = [];
const tabRemovedListeners = [];
const sessionState = {};
const backgroundContext = {
  chrome: {
    runtime: {
      onMessage: {
        addListener(listener) {
          backgroundMessageListeners.push(listener);
        }
      }
    },
    storage: {
      session: {
        async get(key) {
          return key in sessionState ? { [key]: sessionState[key] } : {};
        },
        async set(values) {
          Object.assign(sessionState, values);
        },
        async remove(key) {
          delete sessionState[key];
        }
      }
    },
    tabs: {
      onRemoved: {
        addListener(listener) {
          tabRemovedListeners.push(listener);
        }
      }
    }
  },
  Number
};
vm.createContext(backgroundContext);
vm.runInContext(backgroundSource, backgroundContext);
assert.strictEqual(backgroundMessageListeners.length, 1);
assert.strictEqual(tabRemovedListeners.length, 1);

function sendBackgroundMessage(message, tabId = 42) {
  return new Promise((resolve) => {
    const pending = backgroundMessageListeners[0](message, { tab: { id: tabId } }, resolve);
    assert.strictEqual(pending, true);
  });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

(async () => {
  assert.deepStrictEqual(
    plain(await sendBackgroundMessage({ type: "get-tab-auto-continue-override" })),
    { ok: true, override: null }
  );
  assert.deepStrictEqual(
    plain(await sendBackgroundMessage({ type: "set-tab-auto-continue-override", override: true })),
    { ok: true }
  );
  assert.deepStrictEqual(
    plain(await sendBackgroundMessage({ type: "get-tab-auto-continue-override" })),
    { ok: true, override: true }
  );
  assert.deepStrictEqual(
    plain(await sendBackgroundMessage({ type: "get-tab-auto-continue-override" }, 43)),
    { ok: true, override: null },
    "one tab's override must not leak into another tab"
  );
  tabRemovedListeners[0](42);
  await Promise.resolve();
  assert.deepStrictEqual(
    plain(await sendBackgroundMessage({ type: "get-tab-auto-continue-override" })),
    { ok: true, override: null }
  );
  console.log("Auto continue checks OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
