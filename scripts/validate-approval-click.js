const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const settingsSource = fs.readFileSync("settings.js", "utf8");
const source = fs.readFileSync("content.js", "utf8");

function harness({
  enabled = true,
  allowedTools = "",
  deniedKeywords = "",
  label = "Allow",
  cardText = "ChatGPT read_status 사용 허용하기 Allow Deny",
  splitButton = false
} = {}) {
  const timers = [];
  const requests = [];
  const events = [];
  class Element extends EventTarget {
    constructor(text) { super(); this.innerText = text; this.disabled = false; this.isConnected = true; }
    getBoundingClientRect() { return { left: 0, top: 0, width: this.isConnected ? 100 : 0, height: this.isConnected ? 30 : 0 }; }
    getAttribute() { return null; }
    scrollIntoView() {}
    focus() {}
    // The DOM activation contract: HTMLElement.click dispatches a click event.
    click() { this.dispatchEvent(new Event("click", { bubbles: true })); }
    dispatchEvent(event) { events.push(event.type); return super.dispatchEvent(event); }
  }
  const button = new Element(label);
  button.parentElement = new Element(cardText);
  let activeButton = button;
  const dropdown = splitButton ? new Element("더 보기") : null;
  if (dropdown) dropdown.parentElement = button.parentElement;
  const menuOpens = [];
  dropdown?.addEventListener("click", () => menuOpens.push("open"));
  const ctx = {
    Element, MouseEvent: Event, PointerEvent: Event, console,
    MutationObserver: class { observe() {} disconnect() {} },
    document: { documentElement: {}, querySelector: () => null, querySelectorAll: () => [activeButton, dropdown].filter(Boolean) },
    window: {
      setTimeout: (fn) => { timers.push(fn); return timers.length; },
      clearTimeout() {}, setInterval() {},
      getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
      location: { hostname: "chatgpt.com", hash: "" }
    },
    chrome: {
      storage: {
        sync: { get: () => new Promise(() => {}) },
        onChanged: { addListener() {} }
      },
      runtime: { onMessage: { addListener() {} } }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(settingsSource, ctx);
  vm.runInContext(source, ctx);
  vm.runInContext(`settings = ${JSON.stringify({ enabled, allowedTools, deniedKeywords, clickDelayMs: 300 })}`, ctx);
  function onApprovalClick() {
    // Model the owning boundary: each activation submits one approval request.
    requests.push("approval-post");
    ctx.scan(); // Rendering triggered synchronously by the click must not queue another.
  }
  button.addEventListener("click", onApprovalClick);
  return {
    ctx, button, requests, events, menuOpens,
    replaceButton: () => {
      activeButton.isConnected = false;
      activeButton = new Element(label);
      activeButton.parentElement = button.parentElement;
      activeButton.addEventListener("click", onApprovalClick);
      return activeButton;
    },
    removeButton: () => { activeButton.isConnected = false; activeButton = null; },
    flush: () => { while (timers.length) timers.shift()(); }
  };
}

let checks = 0;
for (const label of ["Allow", "허용하기", "Approve"]) {
  const h = harness({ label });
  h.ctx.scan(); h.ctx.scan(); h.flush(); h.ctx.scan(); h.flush();
  assert.equal(h.requests.length, 1, `${label}: one approval must submit exactly one request`);
  assert.equal(h.events.filter((event) => event === "click").length, 1);
  checks += 1;
}
for (const label of ["한 번만 허용", "한 번만 허용 ↵"]) {
  const h = harness({
    label,
    allowedTools: "read_status",
    cardText: `ChatGPT read_status ${label} 더 보기`,
    splitButton: true
  });
  h.ctx.scan(); h.ctx.scan(); h.flush(); h.ctx.scan(); h.flush();
  assert.equal(h.requests.length, 1, `${label}: split button must submit exactly one approval`);
  assert.equal(h.events.filter((event) => event === "click").length, 1);
  assert.equal(h.menuOpens.length, 0, "the dropdown must remain closed");
  checks += 1;
}
{
  const h = harness({
    label: "한 번만 허용 ⏎",
    allowedTools: "opencrab",
    cardText: "3. opencrab ChatGPT가 3. opencrab을(를) 사용하도록 허용할까요? 거부 한 번만 허용",
    splitButton: true
  });
  h.ctx.scan(); h.flush();
  assert.equal(h.requests.length, 1, "the observed MCP approval card must activate once");
  assert.equal(h.menuOpens.length, 0, "the observed split-button menu must remain closed");
  checks += 1;
}
{
  const h = harness({ label: "한 번만 허용 ⏎", splitButton: true });
  h.ctx.scan();
  h.replaceButton();
  h.flush(); h.ctx.scan(); h.flush();
  assert.equal(h.requests.length, 1, "a replaced approval button must still activate once");
  assert.equal(h.menuOpens.length, 0, "the replacement must not activate the options menu");
  checks += 1;
}
{
  const h = harness({ label: "한 번만 허용 ⏎" });
  h.ctx.scan();
  h.removeButton();
  h.flush();
  assert.equal(h.requests.length, 0, "a disappeared approval must not activate another control");
  checks += 1;
}
for (const options of [
  { allowedTools: "different_tool" },
  { deniedKeywords: "read_status" },
  { cardText: "read_status 한 번만 허용" }
]) {
  const h = harness({ label: "한 번만 허용", splitButton: true, cardText: "ChatGPT read_status 한 번만 허용", ...options });
  h.ctx.scan(); h.flush();
  assert.equal(h.requests.length, 0, `new button must still obey card and policy checks: ${JSON.stringify(options)}`);
  checks += 1;
}
for (const label of ["Always allow", "Allow all", "항상 허용", "모든 도구 허용", "Don't allow", "허용하지 않음", "거부하기"]) {
  const h = harness({ label });
  h.ctx.scan(); h.flush();
  assert.equal(h.requests.length, 0, `${label}: broad or negated buttons must never be clicked`);
  checks += 1;
}
{
  const h = harness({ cardText: `ChatGPT allow ${"긴 대화 본문 ".repeat(300)} Deny` });
  h.ctx.scan(); h.flush();
  assert.equal(h.requests.length, 0, "an oversized ancestor must not be treated as a permission card");
  checks += 1;
}
for (const [allowedTools, shouldClick] of [["read", false], ["read_status", true], ["status", false]]) {
  const h = harness({ allowedTools, cardText: "ChatGPT read_status 사용 허용하기 Allow Deny" });
  h.ctx.scan(); h.flush();
  assert.equal(h.requests.length, shouldClick ? 1 : 0, `allowedTools "${allowedTools}" must match whole names only`);
  checks += 1;
}
for (const options of [{ enabled: false }, { allowedTools: "different_tool" }, { deniedKeywords: "read_status" }]) {
  const h = harness(options);
  h.ctx.scan(); h.flush();
  assert.equal(h.requests.length, 0, `policy must remain enforced: ${JSON.stringify(options)}`);
  checks += 1;
}
for (const mutate of [(h) => { h.button.disabled = true; }, (h) => { h.button.innerText = "Cancel"; }]) {
  const h = harness();
  h.ctx.scan(); mutate(h); h.flush();
  assert.equal(h.requests.length, 0, "recheck the current button after the delay");
  checks += 1;
}
const refresh = harness();
refresh.ctx.clickOnceLikeUser(refresh.button);
assert.equal(refresh.requests.length, 1, "plugin refresh/navigation must use one activation as well");
checks += 1;
console.log(`Approval click checks OK: ${checks} scenarios`);
