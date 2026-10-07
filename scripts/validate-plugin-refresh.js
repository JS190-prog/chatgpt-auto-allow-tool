const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const settingsSource = fs.readFileSync("settings.js", "utf8");
const source = fs.readFileSync("content.js", "utf8");
const listeners = [];
class FakeElement {}
class FakeMutationObserver {
  observe() {}
  disconnect() {}
}

const context = {
  chrome: {
    runtime: {
      onMessage: { addListener: (listener) => listeners.push(listener) },
      sendMessage: async () => ({ ok: true, options: null })
    },
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
  document: { documentElement: {}, hidden: true, querySelector: () => null, querySelectorAll: () => [] },
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
    location: { hash: "", hostname: "chatgpt.com", pathname: "/" },
    setInterval: () => 0,
    setTimeout
  }
};

vm.createContext(context);
vm.runInContext(settingsSource, context);
vm.runInContext(source, context);

assert.deepStrictEqual(
  [...context.buildPluginEntryKeys(["Same", "Same", "Different"])],
  ["same#1", "same#2", "different#1"]
);
assert.strictEqual(
  context.getPluginEntryName({ innerText: "Plugin Twelve\n모두 허용" }),
  "Plugin Twelve",
  "mutable secondary row text must not become part of plugin identity"
);
assert.strictEqual(
  context.getPluginEntryName({ textContent: "  Plugin Twelve  \n연결됨" }),
  "Plugin Twelve",
  "textContent fallback must preserve the same stable first-line identity"
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
assert.strictEqual(context.classifyPluginPage("/settings/plugins-settings"), "list");
assert.strictEqual(context.classifyPluginPage("/settings/plugins-settings/"), "list");
assert.strictEqual(
  context.classifyPluginPage("/settings/plugins-settings/plugin_asdk_app_123"),
  "detail"
);
assert.strictEqual(
  context.classifyPluginPage("/settings/plugins-settings/plugins_123"),
  "detail",
  "installed apps can use a different detail-route prefix"
);
assert.strictEqual(
  context.classifyPluginPage("/settings/plugins-settings/new-provider-id/"),
  "detail",
  "detail navigation must not depend on a provider-specific slug"
);
assert.strictEqual(
  context.classifyPluginPage("/settings/plugins-settings/new-provider-id/other"),
  "other",
  "nested settings paths are not app details"
);
assert.strictEqual(context.classifyPluginPage("/settings/general-settings"), "other");
assert.strictEqual(vm.runInContext('REFRESH_BUTTON_TEXTS.has("도구 새로 고침")', context), true);
assert.strictEqual(vm.runInContext('REFRESH_BUTTON_TEXTS.has("refresh tools")', context), true);
class FakePluginNode extends FakeElement {
  constructor(tagName, { id = "", ownText = "", innerText = "", hasPopup = false } = {}) {
    super();
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.innerText = innerText;
    this.hasPopup = hasPopup;
    this.childNodes = ownText ? [{ nodeType: 3, textContent: ownText }] : [];
    this.children = [];
    this.parentElement = null;
  }

  append(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelectorAll(selector) {
    const descendants = this.children.flatMap((child) => [child, ...child.querySelectorAll("*")]);
    return selector === "*"
      ? descendants
      : descendants.filter((child) => child.tagName.toLowerCase() === selector);
  }

  getBoundingClientRect() {
    return { width: 100, height: 40 };
  }

  hasAttribute(name) {
    return name === "aria-haspopup" && this.hasPopup;
  }

  compareDocumentPosition(other) {
    return this.order < other.order ? 4 : 0;
  }

  contains(other) {
    return other === this || this.children.some((child) => child.contains(other));
  }
}
const pluginPage = new FakePluginNode("main");
const installedContainer = pluginPage.append(new FakePluginNode("div"));
installedContainer.append(new FakePluginNode("p", {
  ownText: "플러그인, 연결된 계정 및 권한을 관리합니다"
}));
const searchWrap = installedContainer.append(new FakePluginNode("div"));
searchWrap.append(new FakePluginNode("input", { id: "installed-plugins-search" }));
const permissionsSection = installedContainer.append(new FakePluginNode("section"));
permissionsSection.append(new FakePluginNode("button", {
  innerText: "위험도가 낮은 도구 허용",
  hasPopup: true
}));
const firstInstalledSection = installedContainer.append(new FakePluginNode("section"));
firstInstalledSection.append(new FakePluginNode("button", { innerText: "Installed One" }));
const secondInstalledSection = installedContainer.append(new FakePluginNode("section"));
secondInstalledSection.append(new FakePluginNode("button", { innerText: "Installed Two" }));
const unrelatedSection = pluginPage.append(new FakePluginNode("section"));
unrelatedSection.append(new FakePluginNode("button", { innerText: "Unrelated Action" }));
pluginPage.querySelectorAll("*").forEach((node, index) => { node.order = index; });
const originalDocument = context.document;
context.window.location.pathname = "/settings/plugins-settings";
context.document = {
  querySelector: (selector) =>
    pluginPage.querySelectorAll("*").find((node) => `#${node.id}` === selector) || null,
  querySelectorAll: (selector) => pluginPage.querySelectorAll(selector)
};
assert.deepStrictEqual(
  [...context.getModernPluginListSections()],
  [firstInstalledSection, secondInstalledSection],
  "installed sections must exclude the Pro account's default-permissions menu"
);
assert.deepStrictEqual(
  [...context.getInstalledPluginEntries()].map((entry) => entry.name),
  ["Installed One", "Installed Two"],
  "all installed sections are swept without including a later unrelated section"
);
const rowWithStatus = (value) => ({
  lastElementChild: { tagName: "DIV", querySelectorAll: () => [{ textContent: value }] }
});
assert.strictEqual(context.classifyModernPluginRow(rowWithStatus("모든 도구 허용")), "tool-permission");
assert.strictEqual(context.classifyModernPluginRow(rowWithStatus("")), "no-tool-permission");
assert.strictEqual(context.classifyModernPluginRow({ lastElementChild: null }), "unknown");
assert.strictEqual(context.shouldFastSkipPluginRow("no-tool-permission", false, true), true);
assert.strictEqual(context.shouldFastSkipPluginRow("no-tool-permission", true, true), false);
assert.strictEqual(context.shouldFastSkipPluginRow("no-tool-permission", false, false), false);
assert.strictEqual(context.shouldFastSkipPluginRow("unknown", false, true), false);
context.document = originalDocument;
context.window.location.pathname = "/";
assert.strictEqual(
  context.isPluginDetailReady({
    modernDetail: true,
    hasNavigation: true,
    hasInfo: false,
    hasConnectedAccounts: false,
    hasAppManagement: false,
    isDeveloperModeApp: true
  }),
  false,
  "a breadcrumb-only detail shell is not ready"
);
assert.strictEqual(
  context.isPluginDetailReady({
    modernDetail: true,
    hasNavigation: true,
    hasInfo: true,
    hasConnectedAccounts: true,
    hasAppManagement: false,
    isDeveloperModeApp: true
  }),
  false,
  "a developer app must render its management section before classification"
);
assert.strictEqual(
  context.isPluginDetailReady({
    modernDetail: true,
    hasNavigation: true,
    hasInfo: true,
    hasConnectedAccounts: true,
    hasAppManagement: true,
    isDeveloperModeApp: true
  }),
  true
);
assert.strictEqual(
  context.isPluginDetailReady({
    modernDetail: true,
    hasNavigation: true,
    hasInfo: true,
    hasConnectedAccounts: true,
    hasAppManagement: false,
    isDeveloperModeApp: false
  }),
  true,
  "a connected non-developer plugin can be classified without app management"
);
assert.strictEqual(
  context.isPluginDetailReady({
    modernDetail: true,
    hasNavigation: true,
    hasInfo: true,
    hasSkills: true,
    hasConnectedAccounts: false,
    hasAppManagement: false,
    isDeveloperModeApp: false
  }),
  true,
  "a loaded skills-only plugin such as Default templates can be skipped"
);
assert.strictEqual(
  context.isPluginDetailReady({
    modernDetail: true,
    hasNavigation: true,
    hasInfo: true,
    hasSkills: true,
    hasConnectedAccounts: false,
    hasAppManagement: false,
    isDeveloperModeApp: true
  }),
  false,
  "a developer app still requires its management section"
);
assert.strictEqual(listeners.length, 1);

assert.strictEqual(source.includes("async function closePluginSettings()"), true);
assert.strictEqual(source.includes("const names = buttons.map((button) => getPluginEntryName(button));"), true);
assert.strictEqual(source.includes('document.querySelector("#installed-plugins-search")'), true);
assert.strictEqual(source.includes('const PLUGIN_SETTINGS_PATH = "/settings/plugins-settings";'), true);
assert.strictEqual(source.includes("const entry = await waitForPluginEntry(target);"), true);
assert.strictEqual(source.includes("timeoutMs = 12000"), true);
assert.strictEqual(source.includes("목록에서 다시 찾지 못했습니다."), false);
assert.strictEqual(source.includes("function showPluginRefreshNotice(message, isError = false)"), true);
assert.strictEqual(
  fs.readFileSync("popup.html", "utf8").includes('id="inspectAllPlugins"'),
  true
);
assert.strictEqual(
  fs.readFileSync("popup.js", "utf8").includes("inspectAll: inspectAllPlugins.checked"),
  true
);
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

let timeoutCallback;
const originalSetTimeout = context.window.setTimeout;
context.window.setTimeout = (callback) => {
  timeoutCallback = callback;
  return 1;
};
let completionVisible = false;
const completion = context.waitForCondition(
  () => completionVisible,
  100,
  "completion was missed"
);
completionVisible = true;
timeoutCallback();
context.window.setTimeout = originalSetTimeout;
completion.then(
  () => console.log("Plugin refresh checks OK"),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
