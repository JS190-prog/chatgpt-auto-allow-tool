const DEFAULT_SETTINGS = {
  enabled: true,
  clickDelayMs: 300,
  allowedTools: "",
  deniedKeywords: ""
};

const OLD_DENY_DEFAULT = "delete,remove,\uc0ad\uc81c,\uc81c\uac70,\ucde8\uc18c,cancel";
const ALLOW_TEXT_PATTERNS = [
  /\ud5c8\uc6a9\ud558\uae30/i,
  /\uc0ac\uc6a9\s*\ud5c8\uc6a9/i,
  /\uc2b9\uc778/i,
  /^allow$/i,
  /allow/i,
  /approve/i
];

const PERMISSION_TEXT_PATTERNS = [
  /chatgpt/i,
  /\uc0ac\uc6a9\ud558\ub3c4\ub85d\s*\ud5c8\uc6a9\ud560\uae4c\uc694/i,
  /\ud5c8\uc6a9\ud560\uae4c\uc694/i,
  /allow\s+chatgpt/i,
  /use\s+.*\?/i
];

let settings = { ...DEFAULT_SETTINGS };
let pendingClick = null;
const clickedButtons = new WeakSet();

function normalize(text) {
  return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => normalize(item))
    .filter(Boolean);
}

function getText(element) {
  return normalize(
    element?.innerText ||
      element?.textContent ||
      element?.getAttribute?.("aria-label") ||
      element?.getAttribute?.("title")
  );
}

function isVisible(element) {
  if (!element || !(element instanceof Element)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) !== 0 &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function isAllowButton(button) {
  if (button.disabled || clickedButtons.has(button) || !isVisible(button)) {
    return false;
  }

  const text = getText(button);
  return ALLOW_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

function looksLikePermissionCard(element) {
  const text = getText(element);
  if (!text) {
    return false;
  }

  const hasPermissionText = PERMISSION_TEXT_PATTERNS.some((pattern) => pattern.test(text));
  const hasRejectButton = /\uac70\uc808\ud558\uae30|reject|deny/i.test(text);
  const hasAllowButton = /\ud5c8\uc6a9\ud558\uae30|allow|approve/i.test(text);

  return hasPermissionText && hasAllowButton && (hasRejectButton || text.includes("chatgpt"));
}

function findPermissionCard(button) {
  let current = button;
  for (let depth = 0; current && depth < 12; depth += 1) {
    if (looksLikePermissionCard(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function passesToolAllowList(cardText) {
  const allowList = splitCsv(settings.allowedTools);
  if (allowList.length === 0) {
    return true;
  }
  return allowList.some((toolName) => cardText.includes(toolName));
}

function passesDenyList(cardText) {
  const denied = splitCsv(settings.deniedKeywords);
  if (denied.length === 0) {
    return true;
  }
  return !denied.some((keyword) => cardText.includes(keyword));
}

function shouldClick(button) {
  if (!settings.enabled || !isAllowButton(button)) {
    return false;
  }

  const card = findPermissionCard(button);
  if (!card) {
    return false;
  }

  const cardText = getText(card);
  return passesToolAllowList(cardText) && passesDenyList(cardText);
}

function fireMouseLikeEvent(element, type) {
  const rect = element.getBoundingClientRect();
  const options = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    button: 0,
    buttons: type === "mouseup" || type === "click" ? 0 : 1,
    view: window
  };

  const EventClass = type.startsWith("pointer") ? PointerEvent : MouseEvent;
  element.dispatchEvent(new EventClass(type, options));
}

function clickLikeUser(button) {
  button.scrollIntoView({ block: "center", inline: "center" });
  button.focus({ preventScroll: true });

  for (const type of ["pointerover", "pointerenter", "mouseover", "mouseenter", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    fireMouseLikeEvent(button, type);
  }

  button.click();
}

function clickButton(button) {
  if (pendingClick || !shouldClick(button)) {
    return;
  }

  pendingClick = window.setTimeout(() => {
    pendingClick = null;
    if (!shouldClick(button)) {
      return;
    }
    clickedButtons.add(button);
    clickLikeUser(button);
  }, Number(settings.clickDelayMs) || DEFAULT_SETTINGS.clickDelayMs);
}

function scan() {
  const buttons = document.querySelectorAll("button, [role='button']");
  for (const button of buttons) {
    if (shouldClick(button)) {
      clickButton(button);
      return;
    }
  }
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  settings = { ...DEFAULT_SETTINGS, ...stored };

  if (settings.deniedKeywords === OLD_DENY_DEFAULT) {
    settings.deniedKeywords = "";
    await chrome.storage.sync.set({ deniedKeywords: "" });
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") {
    return;
  }
  for (const [key, change] of Object.entries(changes)) {
    settings[key] = change.newValue;
  }
  scan();
});

const observer = new MutationObserver(() => scan());

loadSettings().then(() => {
  scan();
  window.setInterval(scan, 1000);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
});
