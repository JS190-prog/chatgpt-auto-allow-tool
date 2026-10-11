const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

class Clock {
  now = 1000;
  nextId = 1;
  timers = new Map();
  schedule(callback, delay, interval = false) {
    const id = this.nextId++;
    this.timers.set(id, { callback, at: this.now + delay, interval: interval ? delay : 0 });
    return id;
  }
  async advance(duration) {
    const end = this.now + duration;
    for (;;) {
      const next = [...this.timers].filter(([, timer]) => timer.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      this.now = timer.at;
      if (timer.interval) timer.at += timer.interval;
      else this.timers.delete(id);
      timer.callback();
      await flush();
    }
    this.now = end;
    await flush();
  }
}
async function flush() { for (let i = 0; i < 12; i += 1) await Promise.resolve(); }

function makeCase({ delay = Infinity, initiallyDisabled = false, runWorkflow = false, logFailure = false, emitStart = true, clickFailure = false } = {}) {
  const clock = new Clock();
  const observers = new Set();
  const notices = [];
  const logRequests = [];
  const consoleErrors = [];
  const visits = [];
  let clicks = 0;
  class Element {
    innerText = "도구 새로 고침";
    disabled = false;
    getBoundingClientRect() { return { width: 100, height: 40 }; }
    hasAttribute(name) { return name === "disabled" && this.disabled; }
    getAttribute() { return null; }
  }
  const button = new Element();
  button.disabled = initiallyDisabled;
  class Observer {
    constructor(callback) { this.callback = callback; }
    observe(_target, options) { this.options = options; observers.add(this); }
    disconnect() { observers.delete(this); }
  }
  function emit(type = "attributes") {
    for (const observer of [...observers]) if (observer.options[type]) observer.callback();
  }
  const context = {
    console: { error: (...args) => consoleErrors.push(args) },
    Date: class extends Date { static now() { return clock.now; } },
    chrome: {
      runtime: { onMessage: { addListener() {} }, sendMessage: async (message) => {
        if (message.type === "record-plugin-refresh-error") {
          logRequests.push(message.entry);
          return logFailure ? { ok: false, error: "storage unavailable" } : { ok: true };
        }
        return { ok: true };
      } },
      storage: {
        onChanged: { addListener() {} },
        sync: { get: () => new Promise(() => {}) },
        local: { get: async (defaults) => defaults, set: async () => {} }
      }
    },
    Element,
    MutationObserver: Observer,
    Node: { TEXT_NODE: 3, DOCUMENT_POSITION_FOLLOWING: 4 },
    document: { documentElement: {}, hidden: false, querySelectorAll: () => [] },
    window: {
      location: { hostname: "chatgpt.com", pathname: "/settings/plugins-settings/test", hash: "" },
      getComputedStyle: () => ({ opacity: "1" }),
      setTimeout: (callback, delay) => clock.schedule(callback, delay),
      clearTimeout: (id) => clock.timers.delete(id),
      setInterval: (callback, delay) => clock.schedule(callback, delay, true),
      clearInterval: (id) => clock.timers.delete(id)
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("settings.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("content.js", "utf8"), context);
  const root = { querySelectorAll: (selector) => selector === "button" ? [button] : [] };
  context.getPluginDetailRoot = () => root;
  context.getPluginDetailDecision = () => ({ kind: "refresh", refreshButton: button });
  context.showPluginRefreshNotice = (message) => notices.push(message);
  context.clickOnceLikeUser = () => {
    if (clickFailure) throw new Error("click failed");
    clicks += 1;
    visits.push("click");
    if (emitStart) { button.disabled = true; emit(); }
    if (Number.isFinite(delay)) clock.schedule(() => {
      button.disabled = false;
      emit();
    }, delay);
  };
  if (runWorkflow) {
    context.document.querySelector = () => null;
    context.openPluginSettings = async () => true;
    context.getInstalledPluginEntries = () => [
      { key: "first", name: "Slow plugin", button },
      { key: "second", name: "Next plugin", button }
    ];
    context.openPluginDetail = async (target) => {
      visits.push(`open:${target.name}`);
      // Each detail has its own enabled button, even while the previous request is pending.
      button.disabled = initiallyDisabled;
    };
    context.returnToPluginList = async () => { visits.push("return"); };
    context.closePluginSettings = async () => { visits.push("close"); };
  }
  let outcome;
  const operation = (runWorkflow ? context.refreshConnectedPlugins({ inspectAll: true }) : context.refreshCurrentPlugin({ name: "Slow plugin" })).then(
    () => { outcome = { ok: true }; },
    (error) => { outcome = { ok: false, error }; }
  );
  return { clock, button, context, notices, logRequests, consoleErrors, visits, emit, observers, operation,
    get outcome() { return outcome; }, get clicks() { return clicks; } };
}

async function main() {
  const immediate = makeCase({ delay: Infinity, runWorkflow: true });
  await flush();
  await flush();
  assert.strictEqual(immediate.outcome?.ok, true,
    "the sweep must finish after clicking without waiting for server completion");
  assert.strictEqual(immediate.context.snapshotPluginRefreshState().status, "done");
  assert.strictEqual(immediate.context.snapshotPluginRefreshState().clicked, 2);
  assert.deepStrictEqual(immediate.visits, [
    "open:Slow plugin", "click", "return",
    "open:Next plugin", "click", "return", "close"
  ], "visit the next plugin while the previous refresh remains pending");
  assert.strictEqual(immediate.clicks, 2, "one click per plugin, no retry");
  assert.strictEqual(immediate.button.disabled, true,
    "a done sweep records clicks, not successful server completion");
  assert.strictEqual(immediate.logRequests.length, 0);
  assert.strictEqual(immediate.clock.now, 1000, "no server wait or fixed delay");
  assert.strictEqual(immediate.clock.timers.size, 0);
  assert.strictEqual(immediate.observers.size, 0);
  assert.match(immediate.notices.at(-1), /클릭 2\/2/);

  const noTransition = makeCase({ delay: Infinity, emitStart: false });
  await flush();
  assert.strictEqual(noTransition.outcome?.ok, true,
    "a click need not wait for a disabled-button transition");
  assert.strictEqual(noTransition.context.snapshotPluginRefreshState().clicked, 1);
  assert.strictEqual(noTransition.clicks, 1);
  assert.strictEqual(noTransition.clock.timers.size, 0);

  const busy = makeCase({ delay: Infinity, initiallyDisabled: true });
  await flush();
  assert.strictEqual(busy.outcome.ok, false);
  assert.strictEqual(busy.clicks, 0, "never click an already-disabled control");
  assert.strictEqual(busy.context.snapshotPluginRefreshState().clicked, 0);

  const logged = makeCase({ clickFailure: true, runWorkflow: true });
  await flush();
  assert.strictEqual(logged.context.snapshotPluginRefreshState().status, "error");
  assert.strictEqual(logged.logRequests.length, 1);
  assert.strictEqual(logged.logRequests[0].plugin, "Slow plugin");
  assert.strictEqual(logged.logRequests[0].phase, "click-refresh");
  assert.strictEqual(logged.logRequests[0].clicked, 0);
  assert.strictEqual(logged.logRequests[0].clickCount, 0);
  assert.strictEqual(logged.context.snapshotPluginRefreshState().clicked, 0);
  assert.deepStrictEqual(logged.visits, ["open:Slow plugin"],
    "a failed click must not be counted or continue the sweep");

  const failedLog = makeCase({ clickFailure: true, runWorkflow: true, logFailure: true });
  await flush();
  assert.match(failedLog.context.snapshotPluginRefreshState().error, /click failed/);
  assert.match(failedLog.context.snapshotPluginRefreshState().logError, /storage unavailable/);
  assert.match(failedLog.notices.at(-1), /진단 로그 저장 실패/);
  assert.strictEqual(failedLog.consoleErrors.length, 1);
  console.log("Plugin click checks OK: immediate progression, one click, absent start transition, disabled controls and error logging");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
