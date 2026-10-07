const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
class Clock {
  now = 1000;
  nextId = 1;
  timers = new Map();
  schedule(callback, delay, repeat = false) {
    const id = this.nextId++;
    this.timers.set(id, { callback, at: this.now + delay, repeat: repeat ? delay : 0 });
    return id;
  }
  async advance(ms) {
    const end = this.now + ms;
    for (;;) {
      const next = [...this.timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      this.now = timer.at;
      if (timer.repeat) timer.at += timer.repeat;
      else this.timers.delete(id);
      timer.callback();
      await flush();
    }
    this.now = end;
    await flush();
  }
}

// A small DOM fixture, with selector matching independent of the extension's logic.
function parts(selector) {
  let depth = 0;
  let part = "";
  const result = [];
  for (const char of selector.trim()) {
    if (char === "[") depth++;
    if (char === "]") depth--;
    if (/\s/.test(char) && depth === 0) {
      if (part) result.push(part);
      part = "";
    } else part += char;
  }
  if (part) result.push(part);
  return result;
}
class FixtureElement {
  constructor(tag, attributes = {}, text = "") {
    this.tagName = tag.toUpperCase(); this.attributes = attributes; this._text = text;
    this.children = []; this.parentElement = null; this.disabled = false; this.handlers = new Map();
  }
  append(...children) { for (const child of children) { child.remove(); child.parentElement = this; this.children.push(child); } return this; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this._text = value; this.children = []; }
  get innerText() { return this.textContent; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return name === "disabled" ? this.disabled : name in this.attributes; }
  matchesPart(selector) {
    const tag = /^[\w-]+/.exec(selector)?.[0];
    if (tag && this.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    for (const [, name, operator, value] of selector.matchAll(/\[([\w-]+)(\*=|=)?(?:["']([^"']*)["'])?\]/g)) {
      const actual = this.getAttribute(name);
      if (operator === "=" ? actual !== value : operator === "*=" ? !actual?.includes(value) : actual === null) return false;
    }
    const plain = selector.replace(/\[[^\]]*\]/g, "");
    for (const [, name] of plain.matchAll(/\.([\w-]+)/g)) if (!(this.getAttribute("class") || "").split(/\s+/).includes(name)) return false;
    const id = /#([\w-]+)/.exec(plain)?.[1];
    return !id || this.getAttribute("id") === id;
  }
  matches(selector) {
    return selector.split(",").some(choice => {
      const chain = parts(choice);
      if (!this.matchesPart(chain.pop())) return false;
      let parent = this.parentElement;
      while (chain.length) {
        const expected = chain.pop();
        while (parent && !parent.matchesPart(expected)) parent = parent.parentElement;
        if (!parent) return false;
        parent = parent.parentElement;
      }
      return true;
    });
  }
  querySelectorAll(selector) {
    const found = [];
    const visit = node => { for (const child of node.children) { if (child.matches(selector)) found.push(child); visit(child); } };
    visit(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 40 }; }
  focus() {} scrollIntoView() {}
  addEventListener(type, handler) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push(handler); }
  dispatchEvent(event) {
    event.target ||= this;
    for (const handler of this.handlers.get(event.type) || []) handler(event);
    if (event.bubbles && this.parentElement) this.parentElement.dispatchEvent(event);
    return true;
  }
  click() { this.dispatchEvent({ type: "click", bubbles: true }); }
}

function harness({ maxTurns = 2, sendAvailable = true, logFailure = false, ackSend = true } = {}) {
  const clock = new Clock();
  const body = new FixtureElement("html");
  const conversation = new FixtureElement("main");
  const form = new FixtureElement("form");
  const editor = new FixtureElement("div", { role: "textbox", contenteditable: "true", "aria-label": "ChatGPT에게 물어보세요", class: "ProseMirror" });
  const send = new FixtureElement("button", { "aria-label": "보내기", type: "submit" });
  body.append(conversation, form);
  form.append(editor);
  if (sendAvailable) form.append(send);
  const document = body;
  document.documentElement = body;
  document.hidden = false;
  const notices = []; const logs = []; const clicks = []; const errors = [];
  class Event { constructor(type, options = {}) { this.type = type; Object.assign(this, options); } }
  const context = {
    console: { error: (...args) => errors.push(args) },
    Date: class extends Date { static now() { return clock.now; } },
    document, Element: FixtureElement, HTMLTextAreaElement: class extends FixtureElement {},
    InputEvent: Event, MouseEvent: Event, PointerEvent: Event,
    Node: { TEXT_NODE: 3, DOCUMENT_POSITION_FOLLOWING: 4 },
    MutationObserver: class { observe() {} disconnect() {} },
    chrome: {
      runtime: {
        onMessage: { addListener() {} },
        async sendMessage(message) {
          if (message.type === "record-auto-continue-error") {
            logs.push(message.entry);
            return logFailure ? { ok: false, error: "storage unavailable" } : { ok: true };
          }
          return { ok: true };
        }
      },
      storage: { sync: { get: () => new Promise(() => {}) }, onChanged: { addListener() {} } }
    },
    window: {
      location: { hostname: "chatgpt.com", pathname: "/c/fixture", hash: "" },
      getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" }),
      setTimeout: (callback, delay) => clock.schedule(callback, delay), clearTimeout: id => clock.timers.delete(id),
      setInterval: (callback, delay) => clock.schedule(callback, delay, true), clearInterval: id => clock.timers.delete(id)
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("settings.js", "utf8"), context);
  vm.runInContext(fs.readFileSync("content.js", "utf8"), context);
  vm.runInContext(`settings.autoContinueEnabled = true; settings.autoContinueMaxTurns = ${maxTurns};`, context);
  context.showAutoContinueNotice = message => notices.push(message);
  send.addEventListener("click", () => { clicks.push(editor.textContent); if (ackSend) editor.textContent = ""; });
  function addReply({ complete = false, legacy = false } = {}) {
    const group = new FixtureElement("div", { class: "group flex flex-col" });
    if (legacy) group.append(new FixtureElement("div", { "data-message-author-role": "assistant", "data-message-id": `legacy-${conversation.children.length}` }, "Sample answer"));
    else {
      const user = new FixtureElement("div"); user.append(new FixtureElement("h4", { class: "sr-only" }, "내가 한 말:"));
      const answer = new FixtureElement("div"); answer.append(new FixtureElement("h4", { class: "sr-only" }, "ChatGPT 답변:"), new FixtureElement("p", {}, "Sample answer"));
      group.append(user, answer);
    }
    conversation.append(group);
    if (complete) finishReply(group);
    return group;
  }
  function finishReply(group) { group.append(new FixtureElement("button", { "aria-label": "응답 다시 생성" })); }
  return { context, clock, document, conversation, form, editor, send, notices, logs, clicks, errors, addReply, finishReply,
    initialize() { context.initializeAutoContinue(); }, scan() { context.scanAutoContinue(); },
    state() { return context.snapshotAutoContinueTabState(); } };
}

async function main() {
  const h = harness();
  h.addReply({ complete: true });
  assert.equal(h.context.getAssistantMessages().length, 1, "the observed sr-only ChatGPT heading must identify a current assistant response");
  assert.equal(h.context.findSendButton(h.editor), h.send, "the observed 보내기 submit button must be recognized inside the composer form");
  h.initialize(); h.scan(); await h.clock.advance(1100);
  assert.equal(h.clicks.length, 0, "opening an old completed response must stay idle");
  const fresh = h.addReply();
  h.scan();
  assert.equal(h.context.isResponseGenerating(), true, "a current response without its completion controls is still generating");
  h.finishReply(fresh); h.scan(); await h.clock.advance(1100);
  assert.deepEqual(h.clicks, ["이어서 진행"], "a new completed response must reach input and one actual button activation");
  assert.equal(h.state().sentCount, 1);
  const second = h.addReply(); h.scan(); h.finishReply(second); h.scan(); await h.clock.advance(1100);
  assert.equal(h.clicks.length, 2);
  const last = h.addReply(); h.scan(); h.finishReply(last); h.scan(); await h.clock.advance(1100);
  assert.equal(h.clicks.length, 2, "the continuation limit must survive the auto-response chain");

  const reused = harness(); reused.addReply({ complete: true }); reused.initialize();
  const sharedReply = reused.addReply(); reused.scan(); reused.finishReply(sharedReply); reused.scan();
  await reused.clock.advance(1100);
  assert.equal(reused.clicks.length, 1);
  for (const button of sharedReply.querySelectorAll("button")) button.remove();
  reused.scan();
  reused.finishReply(sharedReply); reused.scan(); await reused.clock.advance(1100);
  assert.equal(reused.clicks.length, 2, "a new response in a reused DOM node must remain eligible for continuation");

  const draft = harness(); draft.addReply({ complete: true }); draft.initialize();
  const draftReply = draft.addReply(); draft.scan(); draft.finishReply(draftReply);
  draft.editor.textContent = "User draft"; draft.scan(); await draft.clock.advance(1100);
  assert.equal(draft.editor.textContent, "User draft"); assert.equal(draft.clicks.length, 0);

  const replaced = harness(); replaced.addReply({ complete: true }); replaced.initialize();
  const replacedReply = replaced.addReply(); replaced.scan(); replaced.finishReply(replacedReply); replaced.scan(); await replaced.clock.advance(1100);
  replacedReply.remove(); replaced.addReply({ complete: true }); replaced.scan(); await replaced.clock.advance(1100);
  assert.equal(replaced.clicks.length, 1, "replacing a handled response DOM node must not resubmit it");

  const missing = harness(); missing.addReply({ complete: true }); missing.initialize();
  const missingReply = missing.addReply(); missing.scan(); missing.finishReply(missingReply); missing.editor.remove(); missing.scan();
  await missing.clock.advance(1500);
  missing.form.append(missing.editor); await missing.clock.advance(500);
  assert.equal(missing.clicks.length, 1, "temporarily absent composer must not consume the response before the composer returns");

  const failed = harness({ sendAvailable: false }); failed.addReply({ complete: true }); failed.initialize();
  const failedReply = failed.addReply(); failed.scan(); failed.finishReply(failedReply); failed.scan(); await failed.clock.advance(6200);
  assert.equal(failed.state().status, "error"); assert.equal(failed.logs.length, 1);
  assert.equal(failed.logs[0].phase, "wait-send-button"); assert.equal(failed.clicks.length, 0);
  assert.match(failed.notices.at(-1), /진단 로그/);
  assert.equal(failed.editor.textContent, "", "unsent extension-owned text is removed without touching a user draft");
  assert.equal(failed.clock.timers.size, 0);

  const cancelled = harness({ sendAvailable: false }); cancelled.addReply({ complete: true }); cancelled.initialize();
  const cancelReply = cancelled.addReply(); cancelled.scan(); cancelled.finishReply(cancelReply); cancelled.scan(); await cancelled.clock.advance(1200);
  vm.runInContext("settings.autoContinueEnabled = false", cancelled.context);
  await cancelled.clock.advance(200);
  assert.equal(cancelled.clicks.length, 0); assert.equal(cancelled.editor.textContent, "");
  assert.equal(cancelled.logs.length, 0, "turning the feature off is cancellation, not an error");
  assert.equal(cancelled.clock.timers.size, 0);

  const edited = harness({ sendAvailable: false }); edited.addReply({ complete: true }); edited.initialize();
  const editedReply = edited.addReply(); edited.scan(); edited.finishReply(editedReply); edited.scan(); await edited.clock.advance(1200);
  edited.editor.textContent = "User changed the pending text"; edited.form.append(edited.send); await edited.clock.advance(200);
  assert.equal(edited.clicks.length, 0); assert.equal(edited.editor.textContent, "User changed the pending text");

  const moved = harness({ sendAvailable: false }); moved.addReply({ complete: true }); moved.initialize();
  const movedReply = moved.addReply(); moved.scan(); moved.finishReply(movedReply); moved.scan(); await moved.clock.advance(1200);
  moved.context.window.location.pathname = "/c/another-fixture"; moved.form.append(moved.send); await moved.clock.advance(200);
  assert.equal(moved.clicks.length, 0); assert.equal(moved.logs[0].code, "auto-continue-context-changed");

  const unconfirmed = harness({ ackSend: false }); unconfirmed.addReply({ complete: true }); unconfirmed.initialize();
  const unknownReply = unconfirmed.addReply(); unconfirmed.scan(); unconfirmed.finishReply(unknownReply); unconfirmed.scan(); await unconfirmed.clock.advance(6200);
  assert.equal(unconfirmed.clicks.length, 1); assert.equal(unconfirmed.state().status, "error");
  unconfirmed.addReply({ complete: true }); unconfirmed.scan(); await unconfirmed.clock.advance(1100);
  assert.equal(unconfirmed.clicks.length, 1, "an unconfirmed send must stop the chain rather than submit again");
  const enableDuringReply = harness(); enableDuringReply.addReply({ complete: true }); enableDuringReply.initialize();
  vm.runInContext("settings.autoContinueEnabled = false", enableDuringReply.context);
  const activeReply = enableDuringReply.addReply(); enableDuringReply.scan();
  await enableDuringReply.context.setAutoContinueForThisTab(true);
  enableDuringReply.scan(); enableDuringReply.finishReply(activeReply); enableDuringReply.scan();
  await enableDuringReply.clock.advance(1100);
  assert.equal(enableDuringReply.clicks.length, 1, "enabling during a reply must preserve that reply's eligibility");
  const fast = harness(); fast.addReply({ complete: true }); fast.initialize();
  fast.editor.textContent = "New manual request";
  fast.form.dispatchEvent({ type: "submit", bubbles: true });
  fast.editor.textContent = "";
  fast.addReply({ complete: true }); fast.scan(); await fast.clock.advance(1100);
  assert.equal(fast.clicks.length, 1, "a submitted request whose reply completes between scans must still continue once");
  console.log("Auto continuation runtime checks OK: current DOM, completion, chain limit, draft protection, rerender, transient composer, errors and cancellation");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
