const OLD_DENY_DEFAULT = "delete,remove,\uc0ad\uc81c,\uc81c\uac70,\ucde8\uc18c,cancel";
const ALLOW_ONCE_TEXT_PATTERN = /\ud55c\s*\ubc88\ub9cc\s*\ud5c8\uc6a9/i;
const ALLOW_TEXT_PATTERNS = [
  ALLOW_ONCE_TEXT_PATTERN,
  /\ud5c8\uc6a9\ud558\uae30/i,
  /\uc0ac\uc6a9\s*\ud5c8\uc6a9/i,
  /\uc2b9\uc778/i,
  /^allow$/i,
  /allow/i,
  /approve/i
];

// Buttons that grant more than this single request (or negate the grant) must
// never be clicked automatically, even though their text contains "allow".
const BROAD_OR_NEGATED_ALLOW_PATTERN =
  /always|\ud56d\uc0c1|\ubaa8\ub450|\ubaa8\ub4e0|all\b|don'?t|do\s+not|not\s+allow|never|\ub2e4\uc2dc\s*\ubb3b\uc9c0|\ud5c8\uc6a9\ud558\uc9c0|\uac70\uc808|reject|deny|\ucde8\uc18c|cancel/i;
const MAX_PERMISSION_CARD_TEXT_LENGTH = 1000;

const PERMISSION_TEXT_PATTERNS = [
  /chatgpt/i,
  /\uc0ac\uc6a9\ud558\ub3c4\ub85d\s*\ud5c8\uc6a9\ud560\uae4c\uc694/i,
  /\ud5c8\uc6a9\ud560\uae4c\uc694/i,
  /allow\s+chatgpt/i,
  /use\s+.*\?/i
];

let settings = normalizeSettings();
let autoContinueTabOverride = null;
let pendingClick = null;
const clickedButtons = new WeakSet();
const PLUGIN_SETTINGS_PATH = "/settings/plugins-settings";
const REFRESH_BUTTON_TEXTS = new Set([
  "새로 고침",
  "도구 새로 고침",
  "refresh",
  "refresh tools"
]);
const BACK_BUTTON_TEXTS = new Set(["이전", "back"]);
const PLUGIN_BREADCRUMB_TEXTS = new Set(["플러그인", "plugins"]);
const PROFILE_MENU_TEXTS = new Set(["프로필 메뉴 열기", "open profile menu"]);
const SETTINGS_MENU_ITEM_TEXTS = new Set(["설정", "settings"]);
const PLUGIN_SETTINGS_NAV_TEXTS = new Set(["플러그인", "plugins"]);
const APP_MANAGEMENT_TEXTS = new Set(["앱 관리", "app management"]);
const CONNECTED_ACCOUNT_TEXTS = new Set(["연결된 계정", "connected accounts"]);
const DEV_MODE_VERSION_TEXTS = new Set(["dev mode"]);
const INSTALLED_DESCRIPTION_TEXTS = new Set([
  "설치한 플러그인을 관리합니다",
  "manage your installed plugins",
  "플러그인, 연결된 계정 및 권한을 관리합니다",
  "manage plugins, connected accounts and permissions"
]);
const BROWSE_PLUGIN_TEXTS = new Set([
  "플러그인 둘러보기",
  "browse plugins",
  "디렉터리 둘러보기",
  "browse directory"
]);
const DETAIL_INFO_TEXTS = new Set(["정보", "information"]);
const DETAIL_SKILLS_TEXTS = new Set(["스킬", "skills"]);
const pluginRefreshState = {
  status: "idle",
  total: 0,
  completed: 0,
  skipped: 0,
  current: "",
  currentStartedAt: 0,
  error: ""
};
let pluginRefreshPromise = null;
const AUTO_REFRESH_LAST_RUN_KEY = "autoPluginRefreshAt";
const HOUR_MS = 3600000;
const REFRESH_COMPLETION_TIMEOUT_MS = 180000;
let autoRefreshLastRunAt = 0;
const AUTO_CONTINUE_DELAY_MS = 1000;
const handledAssistantMessages = new WeakSet();
const autoContinueState = {
  ready: false,
  observedGeneration: false,
  awaitingAutoResponse: false,
  sentCount: 0,
  timer: null,
  sending: false
};

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

function resolveAutoContinueEnabled(globalEnabled, tabOverride) {
  return typeof tabOverride === "boolean" ? tabOverride : Boolean(globalEnabled);
}

function resolveAutoContinueOverride(globalEnabled, requestedEnabled) {
  const requested = Boolean(requestedEnabled);
  return requested === Boolean(globalEnabled) ? null : requested;
}

function isAutoContinueEnabled() {
  return resolveAutoContinueEnabled(
    settings.autoContinueEnabled,
    autoContinueTabOverride
  );
}

function snapshotAutoContinueTabState() {
  return {
    globalEnabled: Boolean(settings.autoContinueEnabled),
    tabOverride: autoContinueTabOverride,
    effectiveEnabled: isAutoContinueEnabled()
  };
}

async function loadAutoContinueTabOverride() {
  if (!chrome.runtime?.sendMessage) {
    autoContinueTabOverride = null;
    return;
  }

  const state = await chrome.runtime.sendMessage({
    type: "get-tab-auto-continue-override"
  });
  autoContinueTabOverride = typeof state?.override === "boolean"
    ? state.override
    : null;
}

async function setAutoContinueForThisTab(requestedEnabled) {
  const previousEffective = isAutoContinueEnabled();
  const nextOverride = resolveAutoContinueOverride(
    settings.autoContinueEnabled,
    requestedEnabled
  );

  const result = await chrome.runtime.sendMessage({
    type: "set-tab-auto-continue-override",
    override: nextOverride
  });
  if (!result?.ok) {
    throw new Error(result?.error || "탭별 설정을 저장하지 못했습니다.");
  }

  autoContinueTabOverride = nextOverride;
  const nextEffective = isAutoContinueEnabled();
  if (previousEffective && !nextEffective) {
    resetAutoContinueTracking();
  }
  scan();
  return snapshotAutoContinueTabState();
}

function getAssistantMessages() {
  return [...document.querySelectorAll('[data-message-author-role="assistant"]')];
}

function getLatestAssistantMessage() {
  return getAssistantMessages().at(-1) || null;
}

function isResponseGenerating() {
  const stopButtons = document.querySelectorAll(
    'button[data-testid="stop-button"], button[aria-label*="응답 중지"], button[aria-label*="Stop response"]'
  );
  return [...stopButtons].some(isVisible);
}

function findPromptComposer() {
  return (
    document.querySelector("#prompt-textarea") ||
    document.querySelector('form [contenteditable="true"]') ||
    document.querySelector('form textarea[name="prompt-textarea"]')
  );
}

function getComposerText(composer) {
  if (!composer) {
    return "";
  }
  return String("value" in composer ? composer.value : composer.textContent || "").trim();
}

function setComposerText(composer, text) {
  composer.focus();

  if (composer instanceof HTMLTextAreaElement) {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    valueSetter?.call(composer, text);
  } else {
    composer.textContent = text;
  }

  composer.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      data: text,
      inputType: "insertText"
    })
  );
}

function findSendButton(composer) {
  const form = composer?.closest?.("form") || document;
  return [...form.querySelectorAll(
    'button[data-testid="send-button"], button[aria-label*="프롬프트 보내기"], button[aria-label*="Send prompt"]'
  )].find((button) => isVisible(button) && !isControlDisabled(button)) || null;
}

function shouldScheduleAutoContinue({
  enabled,
  autoContinueEnabled,
  observedGeneration,
  pending,
  sending,
  sentCount,
  maxTurns,
  hasMessage,
  handled
}) {
  return Boolean(
    enabled &&
      autoContinueEnabled &&
      observedGeneration &&
      !pending &&
      !sending &&
      sentCount < normalizeAutoContinueMaxTurns(maxTurns) &&
      hasMessage &&
      !handled
  );
}

function cancelPendingAutoContinue() {
  if (autoContinueState.timer) {
    window.clearTimeout(autoContinueState.timer);
  }
  autoContinueState.timer = null;
}

function markExistingAssistantMessagesHandled({ keepLatest = false } = {}) {
  const messages = getAssistantMessages();
  const lastIndex = messages.length - 1;
  messages.forEach((message, index) => {
    if (!keepLatest || index !== lastIndex) {
      handledAssistantMessages.add(message);
    }
  });
}

function resetAutoContinueTracking() {
  cancelPendingAutoContinue();
  markExistingAssistantMessagesHandled();
  Object.assign(autoContinueState, {
    observedGeneration: false,
    awaitingAutoResponse: false,
    sentCount: 0,
    sending: false
  });
}

function initializeAutoContinue() {
  const generating = isResponseGenerating();
  markExistingAssistantMessagesHandled({ keepLatest: generating });
  autoContinueState.observedGeneration = generating;
  autoContinueState.ready = true;
}

async function submitAutoContinuePrompt(message) {
  autoContinueState.timer = null;

  if (
    !settings.enabled ||
    !isAutoContinueEnabled() ||
    isResponseGenerating() ||
    handledAssistantMessages.has(message)
  ) {
    return;
  }

  handledAssistantMessages.add(message);
  const composer = findPromptComposer();
  const prompt = String(settings.autoContinuePrompt || "").trim();
  if (!composer || !prompt || getComposerText(composer)) {
    return;
  }

  autoContinueState.sending = true;
  try {
    setComposerText(composer, prompt);
    const sendButton = await waitForCondition(
      () => findSendButton(composer),
      5000,
      "자동 이어서 진행 전송 버튼을 찾지 못했습니다."
    );

    if (!settings.enabled || !isAutoContinueEnabled() || isResponseGenerating()) {
      return;
    }

    autoContinueState.awaitingAutoResponse = true;
    try {
      clickOnceLikeUser(sendButton);
      await waitForCondition(
        () => isResponseGenerating() || !getComposerText(composer),
        5000,
        "자동 이어서 진행 전송을 확인하지 못했습니다."
      );
      autoContinueState.sentCount += 1;
      showAutoContinueNotice(
        `자동 이어서 진행 · ${autoContinueState.sentCount}/${normalizeAutoContinueMaxTurns(settings.autoContinueMaxTurns)}회 전송`
      );
    } catch (error) {
      autoContinueState.awaitingAutoResponse = false;
      throw error;
    }
  } finally {
    autoContinueState.sending = false;
  }
}

function scanAutoContinue() {
  if (!autoContinueState.ready) {
    return;
  }

  if (!settings.enabled || !isAutoContinueEnabled() || pluginRefreshPromise) {
    cancelPendingAutoContinue();
    return;
  }

  if (isResponseGenerating()) {
    cancelPendingAutoContinue();
    if (!autoContinueState.observedGeneration && !autoContinueState.awaitingAutoResponse) {
      autoContinueState.sentCount = 0;
    }
    autoContinueState.observedGeneration = true;
    return;
  }

  const latestMessage = getLatestAssistantMessage();
  const shouldSchedule = shouldScheduleAutoContinue({
    enabled: settings.enabled,
    autoContinueEnabled: isAutoContinueEnabled(),
    observedGeneration: autoContinueState.observedGeneration,
    pending: Boolean(autoContinueState.timer),
    sending: autoContinueState.sending,
    sentCount: autoContinueState.sentCount,
    maxTurns: settings.autoContinueMaxTurns,
    hasMessage: Boolean(latestMessage),
    handled: latestMessage ? handledAssistantMessages.has(latestMessage) : false
  });

  if (!autoContinueState.observedGeneration) {
    return;
  }

  autoContinueState.observedGeneration = false;
  autoContinueState.awaitingAutoResponse = false;

  if (!shouldSchedule) {
    if (latestMessage) {
      handledAssistantMessages.add(latestMessage);
    }
    const maxTurns = normalizeAutoContinueMaxTurns(settings.autoContinueMaxTurns);
    if (autoContinueState.sentCount >= maxTurns) {
      showAutoContinueNotice(
        `자동 이어서 진행 완료 · ${autoContinueState.sentCount}/${maxTurns}회`
      );
    }
    return;
  }

  autoContinueState.timer = window.setTimeout(() => {
    submitAutoContinuePrompt(latestMessage).catch(() => {});
  }, AUTO_CONTINUE_DELAY_MS);
}

function isAllowButton(button) {
  if (button.isConnected === false || button.disabled || clickedButtons.has(button) || !isVisible(button)) {
    return false;
  }

  const text = getText(button);
  return (
    !BROAD_OR_NEGATED_ALLOW_PATTERN.test(text) &&
    ALLOW_TEXT_PATTERNS.some((pattern) => pattern.test(text))
  );
}

function looksLikePermissionCard(element) {
  const text = getText(element);
  // A permission card is small. A long text means an ancestor that swallowed
  // the conversation, where allow/deny policies would match unrelated text.
  if (!text || text.length > MAX_PERMISSION_CARD_TEXT_LENGTH) {
    return false;
  }

  const hasPermissionText = PERMISSION_TEXT_PATTERNS.some((pattern) => pattern.test(text));
  const hasRejectButton = /\uac70\uc808\ud558\uae30|reject|deny/i.test(text);
  const hasAllowButton = /\ud5c8\uc6a9\ud558\uae30|allow|approve/i.test(text) ||
    ALLOW_ONCE_TEXT_PATTERN.test(text);

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
  return allowList.some((toolName) => containsToolName(cardText, toolName));
}

// Match a tool name as a whole identifier so "read" does not also allow
// "thread_delete".
function containsToolName(cardText, toolName) {
  const isNameChar = (char) => Boolean(char) && /[\p{L}\p{N}_]/u.test(char);
  let index = cardText.indexOf(toolName);
  while (index !== -1) {
    const before = cardText[index - 1];
    const after = cardText[index + toolName.length];
    if (!isNameChar(before) && !isNameChar(after)) {
      return true;
    }
    index = cardText.indexOf(toolName, index + 1);
  }
  return false;
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

function getPluginEntryName(button) {
  const rawText = button?.innerText || button?.textContent || "";
  const firstLine = String(rawText)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .find(Boolean);
  return firstLine || String(rawText).replace(/\s+/g, " ").trim();
}

function getSettingsDialog() {
  return [...document.querySelectorAll("[role='dialog']")].find(isVisible) || null;
}

function classifyPluginPage(pathname) {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  if (path === PLUGIN_SETTINGS_PATH) {
    return "list";
  }
  const detailPath = `${PLUGIN_SETTINGS_PATH}/`;
  if (path.startsWith(detailPath) && !path.slice(detailPath.length).includes("/")) {
    return "detail";
  }
  return "other";
}

function findExactControl(root, acceptedTexts, selector = "button, [role='button'], [role='menuitem'], a") {
  const controls = [...root.querySelectorAll(selector)].filter(
    (control) => isVisible(control) && acceptedTexts.has(getText(control))
  );
  if (controls.length > 1) {
    throw new Error(`같은 작업 컨트롤이 ${controls.length}개 발견됐습니다.`);
  }
  return controls[0] || null;
}

function findExactLink(root, acceptedTexts) {
  return findExactControl(root, acceptedTexts, "a, [role='link']");
}

function findExactMenuItem(root, acceptedTexts) {
  return findExactControl(root, acceptedTexts, "[role='menuitem']");
}

function getModernPluginRowButtons(section) {
  return [...section.querySelectorAll("button")].filter(
    (button) => isVisible(button) && !button.hasAttribute("aria-haspopup")
  );
}

function classifyModernPluginRow(button) {
  const statusContainer = button.lastElementChild;
  if (statusContainer?.tagName !== "DIV") {
    return "unknown";
  }
  const statusLabels = [...statusContainer.querySelectorAll("span")];
  if (statusLabels.length === 0) {
    return "unknown";
  }
  return statusLabels.some((label) => normalize(label.textContent))
    ? "tool-permission"
    : "no-tool-permission";
}

function shouldFastSkipPluginRow(rowKind, inspectAll, hasPermissionedEntries) {
  return !inspectAll && hasPermissionedEntries && rowKind === "no-tool-permission";
}

function getModernPluginListSections() {
  const search = document.querySelector("#installed-plugins-search");
  const description = findOwnTextElement(document, INSTALLED_DESCRIPTION_TEXTS);
  if (!search || !description || !comesBefore(description, search)) {
    return [];
  }

  // The installed list can have multiple sections. Find the nearest container
  // shared with the search field so unrelated page sections are not swept in.
  let container = search.parentElement;
  let sections = [];
  while (container && sections.length === 0) {
    sections = [...container.querySelectorAll("section")].filter(
      (section) =>
        isVisible(section) &&
        getModernPluginRowButtons(section).length > 0 &&
        comesBefore(search, section)
    );
    container = container.parentElement;
  }
  return sections.filter(
    (section) => !sections.some((other) => other !== section && other.contains(section))
  );
}

function getInstalledPluginEntries() {
  const search = document.querySelector("#installed-plugins-search");
  let buttons;

  if (search) {
    buttons = getModernPluginListSections().flatMap((section) =>
      getModernPluginRowButtons(section)
    );
  } else {
    const dialog = getSettingsDialog();
    if (!dialog) {
      return [];
    }

    const description = findOwnTextElement(dialog, INSTALLED_DESCRIPTION_TEXTS);
    if (!description) {
      return [];
    }

    const browsePlugins = findOwnTextElement(dialog, BROWSE_PLUGIN_TEXTS);
    buttons = [...dialog.querySelectorAll("button")].filter((button) => {
      const text = getText(button);
      return (
        text &&
        isVisible(button) &&
        comesBefore(description, button) &&
        (!browsePlugins || (!button.contains(browsePlugins) && comesBefore(button, browsePlugins)))
      );
    });
  }

  // The row can contain mutable secondary text such as a permission mode
  // (for example, `모두 허용`).  Keep only the stable first line as the
  // plugin identity so a React re-render does not make a queued target vanish.
  const names = buttons.map((button) => getPluginEntryName(button));
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

function findProfileMenuButton(root = document) {
  const buttons = [...root.querySelectorAll("button[aria-label]")].filter(
    (button) =>
      isVisible(button) &&
      !isControlDisabled(button) &&
      PROFILE_MENU_TEXTS.has(normalize(button.getAttribute("aria-label")))
  );
  if (buttons.length > 1) {
    throw new Error(`프로필 메뉴 버튼이 ${buttons.length}개 보입니다.`);
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

function getPluginDetailDecision(root) {
  const modernDetail = classifyPluginPage(window.location.pathname) === "detail";
  const navigationControl = modernDetail
    ? findExactLink(root, PLUGIN_BREADCRUMB_TEXTS)
    : findExactButton(root, BACK_BUTTON_TEXTS);
  const infoHeading = findOwnTextElement(root, DETAIL_INFO_TEXTS);
  const skillsHeading = findOwnTextElement(root, DETAIL_SKILLS_TEXTS);
  const connectedAccounts = findOwnTextElement(root, CONNECTED_ACCOUNT_TEXTS);
  const appManagement = findOwnTextElement(root, APP_MANAGEMENT_TEXTS);
  const isDeveloperModeApp = findOwnTextElement(root, DEV_MODE_VERSION_TEXTS) !== undefined;
  const refreshButton = findExactButton(root, REFRESH_BUTTON_TEXTS);
  const detailReady = isPluginDetailReady({
    modernDetail,
    hasNavigation: Boolean(navigationControl),
    hasInfo: Boolean(infoHeading),
    hasSkills: Boolean(skillsHeading),
    hasConnectedAccounts: Boolean(connectedAccounts),
    hasAppManagement: Boolean(appManagement),
    isDeveloperModeApp
  });

  if (!detailReady) {
    return null;
  }

  const kind = classifyPluginDetail(refreshButton, infoHeading);
  return kind === "loading"
    ? null
    : { kind, refreshButton, hasSkills: Boolean(skillsHeading), hasAppManagement: Boolean(appManagement) };
}

function isPluginDetailReady({
  modernDetail,
  hasNavigation,
  hasInfo,
  hasSkills,
  hasConnectedAccounts,
  hasAppManagement,
  isDeveloperModeApp
}) {
  if (!hasNavigation || !hasInfo) {
    return false;
  }
  if (
    modernDetail &&
    ((!hasConnectedAccounts && !hasAppManagement && !hasSkills) ||
      (isDeveloperModeApp && !hasAppManagement))
  ) {
    return false;
  }
  return true;
}

function getPluginDetailRoot() {
  return classifyPluginPage(window.location.pathname) === "detail"
    ? document
    : getSettingsDialog();
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
    let settled = false;
    const finish = (error, value) => {
      if (settled) {
        return;
      }
      settled = true;
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
    const timer = window.setTimeout(() => {
      // Some controls update their DOM properties without a mutation record.
      // Check once more before reporting a completion timeout.
      check();
      if (!settled) {
        finish(new Error(timeoutMessage));
      }
    }, timeoutMs);

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

  const page = classifyPluginPage(window.location.pathname);
  if (page === "detail") {
    await returnToPluginList({ name: "현재 플러그인" });
  } else if (page === "list") {
    await waitForCondition(
      () => getInstalledPluginEntries().length > 0,
      15000,
      "설치된 플러그인 목록을 열지 못했습니다."
    );
    return;
  } else if (window.location.hash === "#settings/Plugins") {
    await waitForCondition(
      () => getInstalledPluginEntries().length > 0,
      15000,
      "설치된 플러그인 목록을 열지 못했습니다."
    );
    return;
  }

  if (!window.location.pathname.startsWith("/settings/")) {
    let settingsMenuItem = findExactMenuItem(document, SETTINGS_MENU_ITEM_TEXTS);
    if (!settingsMenuItem) {
      const profileMenuButton = await waitForCondition(
        () => findProfileMenuButton(),
        10000,
        "프로필 메뉴를 찾지 못했습니다."
      );
      clickOnceLikeUser(profileMenuButton);
      settingsMenuItem = await waitForCondition(
        () => findExactMenuItem(document, SETTINGS_MENU_ITEM_TEXTS),
        10000,
        "ChatGPT 설정 메뉴를 열지 못했습니다."
      );
    }

    clickOnceLikeUser(settingsMenuItem);
    await waitForCondition(
      () => window.location.pathname.startsWith("/settings/"),
      15000,
      "ChatGPT 설정 화면을 열지 못했습니다."
    );
  }

  if (classifyPluginPage(window.location.pathname) !== "list") {
    const pluginsButton = await waitForCondition(
      () => findExactButton(document, PLUGIN_SETTINGS_NAV_TEXTS),
      10000,
      "플러그인 설정 항목을 찾지 못했습니다."
    );
    clickOnceLikeUser(pluginsButton);
  }

  await waitForCondition(
    () => getInstalledPluginEntries().length > 0,
    15000,
    "설치된 플러그인 목록을 열지 못했습니다."
  );
}

function findPluginEntry(target) {
  return getInstalledPluginEntries().find(({ key }) => key === target.key) || null;
}

async function waitForPluginEntry(target, timeoutMs = 12000) {
  return waitForCondition(
    () => findPluginEntry(target),
    timeoutMs,
    `${target.name}: 플러그인 목록 복구 대기 시간이 초과됐습니다.`
  );
}

async function openPluginDetail(target) {
  // Returning from a refreshed detail view can briefly leave the React list in
  // a partially rendered state.  The old code failed immediately in that
  // window, which is why running the sweep a second time usually worked.
  const entry = await waitForPluginEntry(target);

  clickOnceLikeUser(entry.button);
  await waitForCondition(
    () => {
      if (classifyPluginPage(window.location.pathname) === "detail") {
        const heading = [...document.querySelectorAll("h1, h2, h3, h4, [role='heading']")].find(
          (candidate) => normalize(getText(candidate)) === normalize(target.name)
        );
        return heading && getPluginDetailDecision(document);
      }

      const dialog = getSettingsDialog();
      return (
        window.location.hash.startsWith("#settings/Plugins/") &&
        dialog &&
        getPluginDetailDecision(dialog)
      );
    },
    10000,
    `${target.name}: 상세 화면을 열지 못했습니다.`
  );
}

async function returnToPluginList(target) {
  if (classifyPluginPage(window.location.pathname) === "detail") {
    const breadcrumb = findExactLink(document, PLUGIN_BREADCRUMB_TEXTS);
    if (!breadcrumb) {
      throw new Error(`${target.name}: 플러그인 목록 이동 경로를 찾지 못했습니다.`);
    }

    clickOnceLikeUser(breadcrumb);
    await waitForCondition(
      () =>
        classifyPluginPage(window.location.pathname) === "list" &&
        getInstalledPluginEntries().length > 0,
      10000,
      `${target.name}: 플러그인 목록으로 돌아오지 못했습니다.`
    );
    return;
  }

  const dialog = getSettingsDialog();
  const backButton = dialog && findExactButton(dialog, BACK_BUTTON_TEXTS);
  if (!backButton) {
    throw new Error(`${target.name}: 이전 버튼을 찾지 못했습니다.`);
  }

  clickOnceLikeUser(backButton);
  await waitForCondition(
    () =>
      (window.location.hash === "#settings/Plugins" ||
        classifyPluginPage(window.location.pathname) === "list") &&
      getInstalledPluginEntries().length > 0,
    10000,
    `${target.name}: 플러그인 목록으로 돌아오지 못했습니다.`
  );
}

async function closePluginSettings() {
  if (!getSettingsDialog()) {
    return;
  }

  window.location.hash = "";

  await waitForCondition(
    () => !getSettingsDialog(),
    10000,
    "플러그인 설정 창을 닫지 못했습니다."
  );
}

function showAutomationNotice(id, message, isError, dismissLabel) {
  document.getElementById(id)?.remove();
  if (!document.body) {
    return;
  }

  const notice = document.createElement("div");
  notice.id = id;
  notice.setAttribute("role", isError ? "alert" : "status");
  notice.setAttribute("aria-live", isError ? "assertive" : "polite");
  notice.style.cssText = `position:fixed;top:16px;right:16px;z-index:2147483647;display:flex;align-items:center;gap:12px;max-width:420px;padding:12px 14px;border-radius:10px;background:${isError ? "#991b1b" : "#166534"};color:#fff;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3)`;

  const text = document.createElement("span");
  text.textContent = message;
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.setAttribute("aria-label", dismissLabel);
  dismiss.textContent = "×";
  dismiss.style.cssText = "border:0;background:transparent;color:inherit;font:700 20px/1 system-ui,sans-serif;cursor:pointer";
  dismiss.addEventListener("click", () => notice.remove());
  notice.append(text, dismiss);
  document.body.appendChild(notice);
}

function showPluginRefreshNotice(message, isError = false) {
  showAutomationNotice(
    "chatgpt-auto-allow-refresh-notice",
    message,
    isError,
    "새로고침 알림 닫기"
  );
}

function showAutoContinueNotice(message, isError = false) {
  showAutomationNotice(
    "chatgpt-auto-allow-continue-notice",
    message,
    isError,
    "자동 이어서 진행 알림 닫기"
  );
}

async function refreshCurrentPlugin(target) {
  let decision;
  try {
    decision = await waitForCondition(
      () => {
        const detailRoot = getPluginDetailRoot();
        return detailRoot && getPluginDetailDecision(detailRoot);
      },
      10000,
      `${target.name}: 새로 고침 기능을 확인하지 못했습니다.`
    );
  } catch {
    pluginRefreshState.skipped += 1;
    return;
  }

  if (decision.kind === "skip") {
    if (decision.hasSkills && !decision.hasAppManagement) {
      pluginRefreshState.skipped += 1;
      return;
    }
    try {
      const refreshButton = await waitForCondition(
        () => {
          const detailRoot = getPluginDetailRoot();
          return detailRoot && findExactButton(detailRoot, REFRESH_BUTTON_TEXTS);
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
      const detailRoot = getPluginDetailRoot();
      const currentButton = detailRoot && findExactButton(detailRoot, REFRESH_BUTTON_TEXTS);
      return currentButton && isControlDisabled(currentButton);
    },
    5000,
    `${target.name}: 새로 고침 시작을 확인하지 못했습니다.`
  );
  await waitForCondition(
    () => {
      const detailRoot = getPluginDetailRoot();
      const currentButton = detailRoot && findExactButton(detailRoot, REFRESH_BUTTON_TEXTS);
      return currentButton && !isControlDisabled(currentButton);
    },
    REFRESH_COMPLETION_TIMEOUT_MS,
    `${target.name}: 새로 고침 완료 대기 시간이 초과됐습니다.`
  );
  pluginRefreshState.completed += 1;
}

function snapshotPluginRefreshState() {
  return { ...pluginRefreshState };
}

async function refreshConnectedPlugins({ auto = false, previousRunAt = 0, inspectAll = false } = {}) {
  Object.assign(pluginRefreshState, {
    status: "running",
    total: 0,
    completed: 0,
    skipped: 0,
    current: "",
    currentStartedAt: 0,
    error: ""
  });

  try {
    await openPluginSettings();
    const modernList = Boolean(document.querySelector("#installed-plugins-search"));
    const targets = getInstalledPluginEntries().map(({ key, name, button }) => ({
      key,
      name,
      rowKind: modernList ? classifyModernPluginRow(button) : "unknown"
    }));
    const hasPermissionedEntries = targets.some((target) => target.rowKind === "tool-permission");
    pluginRefreshState.total = targets.length;

    for (const target of targets) {
      // An automatic run only ever happens in a background tab. The moment the
      // user looks at it, stop rather than flipping the settings dialog in
      // their face, and give the claimed slot back so the next idle window
      // picks the remaining plugins up.
      if (auto && !document.hidden) {
        await closePluginSettings();
        await releaseAutoRefreshSlot(previousRunAt);
        pluginRefreshState.current = "";
        pluginRefreshState.currentStartedAt = 0;
        pluginRefreshState.status = "aborted";
        return;
      }

      pluginRefreshState.current = target.name;
      pluginRefreshState.currentStartedAt = Date.now();
      if (shouldFastSkipPluginRow(target.rowKind, inspectAll, hasPermissionedEntries)) {
        pluginRefreshState.skipped += 1;
        continue;
      }
      await openPluginDetail(target);
      await refreshCurrentPlugin(target);
      await returnToPluginList(target);
    }

    await closePluginSettings();
    pluginRefreshState.current = "";
    pluginRefreshState.currentStartedAt = 0;
    pluginRefreshState.status = "done";
    if (!auto) {
      showPluginRefreshNotice(
        `플러그인 새로고침 완료 · 완료 ${pluginRefreshState.completed}/${pluginRefreshState.total} · 건너뜀 ${pluginRefreshState.skipped}`
      );
    }
  } catch (error) {
    pluginRefreshState.status = "error";
    pluginRefreshState.error = error instanceof Error ? error.message : String(error);
    showPluginRefreshNotice(`플러그인 새로고침 중단 · ${pluginRefreshState.error}`, true);
  } finally {
    pluginRefreshPromise = null;
  }
}

function shouldAutoRefresh({ enabled, autoRefreshHours, running, hidden, lastRunAt, now }) {
  const hours = Number(autoRefreshHours);
  if (!enabled || running || !hidden || !(hours > 0)) {
    return false;
  }
  return now - (Number(lastRunAt) || 0) >= hours * HOUR_MS;
}

function autoRefreshDecisionInput(lastRunAt) {
  return {
    enabled: settings.enabled,
    autoRefreshHours: settings.autoRefreshHours,
    running: Boolean(pluginRefreshPromise),
    hidden: document.hidden,
    lastRunAt,
    now: Date.now()
  };
}

async function releaseAutoRefreshSlot(previousRunAt) {
  autoRefreshLastRunAt = previousRunAt;
  await chrome.storage.local.set({ [AUTO_REFRESH_LAST_RUN_KEY]: previousRunAt });
}

async function maybeAutoRefreshPlugins() {
  if (!shouldAutoRefresh(autoRefreshDecisionInput(autoRefreshLastRunAt))) {
    return;
  }

  // Every ChatGPT tab runs this same interval, so the in-memory value is only a
  // cheap gate. The stored timestamp is the authoritative claim: re-read it,
  // decide again, then write ours before starting any UI work.
  const stored = await chrome.storage.local.get({ [AUTO_REFRESH_LAST_RUN_KEY]: 0 });
  const previousRunAt = Number(stored[AUTO_REFRESH_LAST_RUN_KEY]) || 0;
  autoRefreshLastRunAt = previousRunAt;
  if (!shouldAutoRefresh(autoRefreshDecisionInput(previousRunAt))) {
    return;
  }

  autoRefreshLastRunAt = Date.now();
  await chrome.storage.local.set({ [AUTO_REFRESH_LAST_RUN_KEY]: autoRefreshLastRunAt });
  pluginRefreshPromise = refreshConnectedPlugins({ auto: true, previousRunAt });
}

function clickButton(button) {
  if (pendingClick || !shouldClick(button)) {
    return;
  }

  pendingClick = window.setTimeout(() => {
    pendingClick = null;
    const currentButton = shouldClick(button) ? button : findEligibleAllowButton();
    if (!currentButton) {
      return;
    }
    clickedButtons.add(currentButton);
    clickOnceLikeUser(currentButton);
  }, normalizeClickDelayMs(settings.clickDelayMs));
}

function findEligibleAllowButton() {
  return [...document.querySelectorAll("button, [role='button']")].find(shouldClick) || null;
}

function scan() {
  const button = findEligibleAllowButton();
  if (button) {
    clickButton(button);
  }
  scanAutoContinue();
}

async function loadSettings() {
  const stored = await loadStoredSettings();
  settings = normalizeSettings(stored);

  if (settings.deniedKeywords === OLD_DENY_DEFAULT) {
    settings.deniedKeywords = "";
    await chrome.storage.sync.set({ deniedKeywords: "" });
  }

  const localState = await chrome.storage.local.get({ [AUTO_REFRESH_LAST_RUN_KEY]: 0 });
  autoRefreshLastRunAt = Number(localState[AUTO_REFRESH_LAST_RUN_KEY]) || 0;
  await loadAutoContinueTabOverride();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    // Another tab claimed or released the automatic run.
    if (AUTO_REFRESH_LAST_RUN_KEY in changes) {
      autoRefreshLastRunAt = Number(changes[AUTO_REFRESH_LAST_RUN_KEY].newValue) || 0;
    }
    return;
  }
  if (area !== "sync") {
    return;
  }
  const previousAutoContinueEnabled = isAutoContinueEnabled();
  const updated = { ...settings };
  for (const [key, change] of Object.entries(changes)) {
    updated[key] = change.newValue;
  }
  settings = normalizeSettings(updated);
  if (
    (changes.enabled && !changes.enabled.newValue) ||
    (previousAutoContinueEnabled && !isAutoContinueEnabled())
  ) {
    resetAutoContinueTracking();
  }
  scan();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "get-tab-auto-continue-state") {
    sendResponse(snapshotAutoContinueTabState());
    return;
  }

  if (message?.type === "set-tab-auto-continue-enabled") {
    setAutoContinueForThisTab(message.enabled).then(
      sendResponse,
      (error) => sendResponse({ error: error instanceof Error ? error.message : String(error) })
    );
    return true;
  }

  if (message?.type === "get-plugin-refresh-state") {
    sendResponse(snapshotPluginRefreshState());
    return;
  }

  if (message?.type === "refresh-connected-plugins") {
    if (!pluginRefreshPromise) {
      pluginRefreshPromise = refreshConnectedPlugins({ inspectAll: message.inspectAll === true });
    }
    sendResponse(snapshotPluginRefreshState());
  }
});

const observer = new MutationObserver(() => scan());

loadSettings().then(() => {
  initializeAutoContinue();
  scan();
  // ponytail: the automatic run rides the existing scan interval, so it needs an
  // open ChatGPT tab and can stall if Chrome freezes that tab mid-sweep. It
  // resumes on unfreeze and the abort path closes the dialog. Move to a service
  // worker + chrome.alarms only if that stall shows up in practice.
  window.setInterval(() => {
    scan();
    // Transient storage errors just mean the next tick retries.
    maybeAutoRefreshPlugins().catch(() => {});
  }, 1000);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });
});
