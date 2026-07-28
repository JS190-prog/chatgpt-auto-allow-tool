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
const REFRESH_BUTTON_TEXTS = new Set(["새로 고침", "refresh"]);
const BACK_BUTTON_TEXTS = new Set(["이전", "back"]);
const INSTALLED_DESCRIPTION_TEXTS = new Set([
  "설치한 플러그인을 관리합니다",
  "manage your installed plugins"
]);
const BROWSE_PLUGIN_TEXTS = new Set(["플러그인 둘러보기", "browse plugins"]);
const DETAIL_INFO_TEXTS = new Set(["정보", "information"]);
const pluginRefreshState = {
  status: "idle",
  total: 0,
  completed: 0,
  skipped: 0,
  current: "",
  error: ""
};
let pluginRefreshPromise = null;

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

function clickOnceLikeUser(button) {
  button.scrollIntoView({ block: "center", inline: "center" });
  button.focus({ preventScroll: true });

  for (const type of ["pointerover", "pointerenter", "mouseover", "mouseenter", "pointerdown", "mousedown", "pointerup", "mouseup"]) {
    fireMouseLikeEvent(button, type);
  }

  button.click();
}

function findOwnTextElement(root, acceptedTexts) {
  return [...root.querySelectorAll("*")].find((element) => {
    const ownText = normalize(
      [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join(" ")
    );
    return acceptedTexts.has(ownText);
  });
}

function comesBefore(first, second) {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function buildPluginEntryKeys(names) {
  const counts = new Map();
  return names.map((name) => {
    const normalizedName = normalize(name);
    const occurrence = (counts.get(normalizedName) || 0) + 1;
    counts.set(normalizedName, occurrence);
    return `${normalizedName}#${occurrence}`;
  });
}

function getSettingsDialog() {
  return [...document.querySelectorAll("[role='dialog']")].find(isVisible) || null;
}

function getInstalledPluginEntries() {
  const dialog = getSettingsDialog();
  if (!dialog) {
    return [];
  }

  const description = findOwnTextElement(dialog, INSTALLED_DESCRIPTION_TEXTS);
  if (!description) {
    return [];
  }

  const browsePlugins = findOwnTextElement(dialog, BROWSE_PLUGIN_TEXTS);
  const buttons = [...dialog.querySelectorAll("button")].filter((button) => {
    const text = getText(button);
    return (
      text &&
      isVisible(button) &&
      comesBefore(description, button) &&
      (!browsePlugins || (!button.contains(browsePlugins) && comesBefore(button, browsePlugins)))
    );
  });
  const names = buttons.map((button) => button.innerText || button.textContent || "");
  const keys = buildPluginEntryKeys(names);

  return buttons.map((button, index) => ({
    button,
    key: keys[index],
    name: names[index].trim()
  }));
}

function findExactButton(root, acceptedTexts) {
  const buttons = [...root.querySelectorAll("button")].filter(
    (button) => isVisible(button) && acceptedTexts.has(getText(button))
  );
  if (buttons.length > 1) {
    throw new Error(`같은 작업 버튼이 ${buttons.length}개 발견됐습니다.`);
  }
  return buttons[0] || null;
}

function classifyPluginDetail(refreshButton, infoHeading) {
  if (refreshButton) {
    return "refresh";
  }
  if (infoHeading) {
    return "skip";
  }
  return "loading";
}

function getPluginDetailDecision(dialog) {
  const refreshButton = findExactButton(dialog, REFRESH_BUTTON_TEXTS);
  const infoHeading = [...dialog.querySelectorAll("h1, h2, h3, h4, [role='heading']")].find(
    (heading) => DETAIL_INFO_TEXTS.has(getText(heading))
  );
  const kind = classifyPluginDetail(refreshButton, infoHeading);
  return kind === "loading" ? null : { kind, refreshButton };
}

function isControlDisabled(control) {
  return Boolean(
    control?.disabled ||
      control?.hasAttribute("disabled") ||
      control?.getAttribute("aria-disabled") === "true"
  );
}

function waitForCondition(predicate, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    let observer;
    const finish = (error, value) => {
      window.clearTimeout(timer);
      observer?.disconnect();
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };
    const check = () => {
      try {
        const value = predicate();
        if (value) {
          finish(null, value);
        }
      } catch (error) {
        finish(error);
      }
    };
    const timer = window.setTimeout(
      () => finish(new Error(timeoutMessage)),
      timeoutMs
    );

    observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true
    });
    check();
  });
}

async function openPluginSettings() {
  if (!/^(chatgpt\.com|chat\.openai\.com)$/i.test(window.location.hostname)) {
    throw new Error("ChatGPT 탭에서 실행하세요.");
  }

  if (window.location.hash !== "#settings/Plugins") {
    window.location.hash = "settings/Plugins";
  }

  await waitForCondition(
    () => getInstalledPluginEntries().length > 0,
    15000,
    "설치된 플러그인 목록을 열지 못했습니다."
  );
}

async function openPluginDetail(target) {
  const entry = getInstalledPluginEntries().find(({ key }) => key === target.key);
  if (!entry) {
    throw new Error(`${target.name}: 목록에서 다시 찾지 못했습니다.`);
  }

  clickOnceLikeUser(entry.button);
  await waitForCondition(
    () => {
      const dialog = getSettingsDialog();
      return (
        window.location.hash.startsWith("#settings/Plugins/") &&
        dialog &&
        findExactButton(dialog, BACK_BUTTON_TEXTS)
      );
    },
    10000,
    `${target.name}: 상세 화면을 열지 못했습니다.`
  );
}

async function returnToPluginList(target) {
  const dialog = getSettingsDialog();
  const backButton = dialog && findExactButton(dialog, BACK_BUTTON_TEXTS);
  if (!backButton) {
    throw new Error(`${target.name}: 이전 버튼을 찾지 못했습니다.`);
  }

  clickOnceLikeUser(backButton);
  await waitForCondition(
    () => window.location.hash === "#settings/Plugins" && getInstalledPluginEntries().length > 0,
    10000,
    `${target.name}: 플러그인 목록으로 돌아오지 못했습니다.`
  );
}

async function refreshCurrentPlugin(target) {
  let decision;
  try {
    decision = await waitForCondition(
      () => {
        const dialog = getSettingsDialog();
        return dialog && getPluginDetailDecision(dialog);
      },
      10000,
      `${target.name}: 새로 고침 기능을 확인하지 못했습니다.`
    );
  } catch {
    pluginRefreshState.skipped += 1;
    return;
  }

  if (decision.kind === "skip") {
    try {
      const refreshButton = await waitForCondition(
        () => {
          const dialog = getSettingsDialog();
          return dialog && findExactButton(dialog, REFRESH_BUTTON_TEXTS);
        },
        750,
        `${target.name}: 새로 고침 버튼이 없습니다.`
      );
      decision = { kind: "refresh", refreshButton };
    } catch {
      pluginRefreshState.skipped += 1;
      return;
    }
  }

  const refreshButton = decision.refreshButton;
  if (isControlDisabled(refreshButton)) {
    throw new Error(`${target.name}: 새로 고침 버튼이 이미 비활성화되어 있습니다.`);
  }

  clickOnceLikeUser(refreshButton);
  await waitForCondition(
    () => {
      const currentDialog = getSettingsDialog();
      const currentButton = currentDialog && findExactButton(currentDialog, REFRESH_BUTTON_TEXTS);
      return currentButton && isControlDisabled(currentButton);
    },
    5000,
    `${target.name}: 새로 고침 시작을 확인하지 못했습니다.`
  );
  await waitForCondition(
    () => {
      const currentDialog = getSettingsDialog();
      const currentButton = currentDialog && findExactButton(currentDialog, REFRESH_BUTTON_TEXTS);
      return currentButton && !isControlDisabled(currentButton);
    },
    60000,
    `${target.name}: 새로 고침 완료 대기 시간이 초과됐습니다.`
  );
  pluginRefreshState.completed += 1;
}

function snapshotPluginRefreshState() {
  return { ...pluginRefreshState };
}

async function refreshConnectedPlugins() {
  Object.assign(pluginRefreshState, {
    status: "running",
    total: 0,
    completed: 0,
    skipped: 0,
    current: "",
    error: ""
  });

  try {
    await openPluginSettings();
    const targets = getInstalledPluginEntries().map(({ key, name }) => ({ key, name }));
    pluginRefreshState.total = targets.length;

    for (const target of targets) {
      pluginRefreshState.current = target.name;
      await openPluginDetail(target);
      await refreshCurrentPlugin(target);
      await returnToPluginList(target);
    }

    pluginRefreshState.current = "";
    pluginRefreshState.status = "done";
  } catch (error) {
    pluginRefreshState.status = "error";
    pluginRefreshState.error = error instanceof Error ? error.message : String(error);
  } finally {
    pluginRefreshPromise = null;
  }
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "get-plugin-refresh-state") {
    sendResponse(snapshotPluginRefreshState());
    return;
  }

  if (message?.type === "refresh-connected-plugins") {
    if (!pluginRefreshPromise) {
      pluginRefreshPromise = refreshConnectedPlugins();
    }
    sendResponse(snapshotPluginRefreshState());
  }
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
