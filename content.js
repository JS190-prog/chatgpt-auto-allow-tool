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
  clicked: 0,
  skipped: 0,
  current: "",
  currentStartedAt: 0,
  runStartedAt: 0,
  auto: false,
  phase: "idle",
  clickCount: 0,
  error: "",
  logError: ""
};
let pluginRefreshPromise = null;
const AUTO_REFRESH_LAST_RUN_KEY = "autoPluginRefreshAt";
const HOUR_MS = 3600000;
let autoRefreshLastRunAt = 0;
const AUTO_CONTINUE_DELAY_MS = 1000;
const handledAssistantMessages = new WeakSet();
const handledAssistantMessageKeys = new Set();
const modernAssistantMessages = new WeakSet();
const ASSISTANT_HEADING_TEXTS = new Set(["chatgpt 답변:", "chatgpt said:"]);
const RESPONSE_COMPLETE_LABELS = new Set(["응답 다시 생성", "응답 평가", "regenerate response", "rate response"]);
const autoContinueState = {
  ready: false,
  observedGeneration: false,
  awaitingAutoResponse: false,
  sentCount: 0,
  timer: null,
  sending: false,
  route: "",
  epoch: 0,
  status: "idle",
  phase: "idle",
  reason: "",
  error: "",
  logError: "",
  startedAt: 0,
  clickCount: 0
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
    effectiveEnabled: isAutoContinueEnabled(),
    status: settings.enabled && isAutoContinueEnabled() ? autoContinueState.status : "off",
    phase: autoContinueState.phase,
    reason: autoContinueState.reason,
    sentCount: autoContinueState.sentCount,
    maxTurns: normalizeAutoContinueMaxTurns(settings.autoContinueMaxTurns),
    error: autoContinueState.error,
    logError: autoContinueState.logError
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
  } else if (!previousEffective && nextEffective) {
    initializeAutoContinue();
  }
  scan();
  return snapshotAutoContinueTabState();
}

function getAssistantMessages() {
  const messages = [];
  const seen = new Set();
  for (const node of document.querySelectorAll('[data-message-author-role="assistant"], h4.sr-only')) {
    let message = node;
    if (node.getAttribute("data-message-author-role") !== "assistant") {
      if (!ASSISTANT_HEADING_TEXTS.has(normalize(node.textContent))) continue;
      if (node.closest('[data-message-author-role="assistant"]')) continue;
      message = node.closest(".group") || node.parentElement;
      if (!message) continue;
      modernAssistantMessages.add(message);
    }
    if (!seen.has(message)) { seen.add(message); messages.push(message); }
  }
  return messages;
}

function getLatestAssistantMessage() {
  return getAssistantMessages().at(-1) || null;
}

function getAssistantMessageKey(message) {
  if (!message) return null;
  const id = message.getAttribute("data-message-id");
  const index = getAssistantMessages().indexOf(message);
  if (index < 0) return null;
  return `${window.location.pathname || "/"}:assistant:${id || index}`;
}

function isAssistantMessageHandled(message, key = getAssistantMessageKey(message)) {
  return handledAssistantMessages.has(message) || Boolean(key && handledAssistantMessageKeys.has(key));
}

function markAssistantMessageHandled(message, key = getAssistantMessageKey(message)) {
  if (message) handledAssistantMessages.add(message);
  if (key) handledAssistantMessageKeys.add(key);
}

function unmarkAssistantMessageHandled(message, key = getAssistantMessageKey(message)) {
  if (message) handledAssistantMessages.delete(message);
  if (key) handledAssistantMessageKeys.delete(key);
}

function isResponseGenerating() {
  const stopButtons = document.querySelectorAll(
    'button[data-testid="stop-button"], button[aria-label*="응답 중지"], button[aria-label*="Stop response"]'
  );
  if ([...stopButtons].some(isVisible)) return true;
  const latestMessage = getLatestAssistantMessage();
  if (!latestMessage || !modernAssistantMessages.has(latestMessage)) return false;
  // The current UI has no author-role attribute. Its response actions appear
  // on the containing turn only after the assistant finishes.
  return ![...latestMessage.querySelectorAll("button")].some(button =>
    RESPONSE_COMPLETE_LABELS.has(normalize(button.getAttribute("aria-label"))) && isVisible(button)
  );
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
    'button[data-testid="send-button"], button[aria-label*="프롬프트 보내기"], button[aria-label*="Send prompt"], button[aria-label="보내기"], button[aria-label="Send"]'
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
      markAssistantMessageHandled(message);
    }
  });
}

function resetAutoContinueTracking() {
  cancelPendingAutoContinue();
  markExistingAssistantMessagesHandled();
  Object.assign(autoContinueState, {
    epoch: autoContinueState.epoch + 1,
    observedGeneration: false,
    awaitingAutoResponse: false,
    sentCount: 0,
    sending: false,
    status: "off",
    reason: "",
    error: "",
    logError: ""
  });
}

function initializeAutoContinue() {
  if (!findPromptComposer()) {
    autoContinueState.ready = false;
    return;
  }
  const generating = isResponseGenerating();
  if (generating) {
    const latest = getLatestAssistantMessage();
    if (latest) {
      handledAssistantMessages.delete(latest);
      handledAssistantMessageKeys.delete(getAssistantMessageKey(latest));
    }
  }
  markExistingAssistantMessagesHandled({ keepLatest: generating });
  autoContinueState.observedGeneration = generating;
  autoContinueState.ready = true;
  autoContinueState.route = window.location.pathname || "/";
  autoContinueState.status = generating ? "waiting-response" : "watching";
}

function observeManualPromptSubmission(event) {
  if (!settings.enabled || !isAutoContinueEnabled() || pluginRefreshPromise || autoContinueState.sending) return;
  const composer = findPromptComposer();
  if (!composer || event.target !== composer.closest("form") || !getComposerText(composer)) return;
  resetAutoContinueTracking();
  autoContinueState.ready = true;
  autoContinueState.route = window.location.pathname || "/";
  autoContinueState.observedGeneration = true;
  autoContinueState.status = "waiting-response";
}

function assertAutoContinueContext(trigger) {
  if (!settings.enabled || !isAutoContinueEnabled() || pluginRefreshPromise || trigger.epoch !== autoContinueState.epoch) {
    const error = new Error("자동 이어서 진행을 중지했습니다.");
    error.code = "auto-continue-cancelled";
    throw error;
  }
  if ((window.location.pathname || "/") !== trigger.route ||
      getAssistantMessageKey(getLatestAssistantMessage()) !== trigger.messageKey) {
    const error = new Error("자동 이어서 진행 대기 중 대화 또는 최신 응답이 변경됐습니다.");
    error.code = "auto-continue-context-changed";
    throw error;
  }
  if (isResponseGenerating()) {
    const error = new Error("새 응답이 생성 중이어서 자동 입력을 중지했습니다.");
    error.code = "auto-continue-cancelled";
    throw error;
  }
}

async function reportAutoContinueError(error) {
  autoContinueState.status = "error";
  autoContinueState.error = error instanceof Error ? error.message : String(error);
  try {
    const result = await chrome.runtime.sendMessage({
      type: "record-auto-continue-error",
      entry: {
        phase: autoContinueState.phase,
        code: error?.code || "auto-continue-error",
        message: autoContinueState.error,
        elapsedMs: autoContinueState.startedAt ? Math.max(0, Date.now() - autoContinueState.startedAt) : 0,
        clickCount: autoContinueState.clickCount,
        sentCount: autoContinueState.sentCount,
        maxTurns: normalizeAutoContinueMaxTurns(settings.autoContinueMaxTurns),
        route: "conversation"
      }
    });
    if (!result?.ok) throw new Error(result?.error || "로그 저장 응답을 받지 못했습니다.");
  } catch (logError) {
    autoContinueState.logError = logError instanceof Error ? logError.message : String(logError);
    console.error("Auto continuation diagnostic log could not be saved", logError);
  }
  const logStatus = autoContinueState.logError ? "진단 로그 저장 실패" : "옵션에서 진단 로그 확인";
  showAutoContinueNotice(`자동 이어서 진행 중단 · ${autoContinueState.error} · ${logStatus}`, true);
}

async function submitAutoContinuePrompt(message, trigger) {
  autoContinueState.timer = null;

  if (
    !settings.enabled ||
    !isAutoContinueEnabled() ||
    isResponseGenerating() ||
    isAssistantMessageHandled(message, trigger.messageKey)
  ) {
    return;
  }

  const prompt = String(settings.autoContinuePrompt || DEFAULT_SETTINGS.autoContinuePrompt).trim();
  let composer;
  let confirmed = false;
  autoContinueState.sending = true;
  autoContinueState.startedAt = Date.now();
  autoContinueState.clickCount = 0;
  autoContinueState.error = "";
  autoContinueState.logError = "";
  try {
    autoContinueState.phase = "wait-composer";
    autoContinueState.status = "waiting-composer";
    composer = await waitForCondition(() => {
      assertAutoContinueContext(trigger);
      const current = findPromptComposer();
      return current && isVisible(current) && current;
    }, 5000, "자동 이어서 진행 입력창을 찾지 못했습니다.", 100);
    markAssistantMessageHandled(message, trigger.messageKey);
    if (getComposerText(composer)) {
      autoContinueState.status = "skipped";
      autoContinueState.reason = "입력 중인 문구가 있어 자동 입력을 건너뛰었습니다.";
      return;
    }
    autoContinueState.phase = "write-prompt";
    autoContinueState.status = "sending";
    setComposerText(composer, prompt);
    autoContinueState.phase = "wait-send-button";
    const sendButton = await waitForCondition(
      () => { assertAutoContinueContext(trigger); return findSendButton(composer); },
      5000,
      "자동 이어서 진행 전송 버튼을 찾지 못했습니다.",
      100
    );

    assertAutoContinueContext(trigger);
    if (findPromptComposer() !== composer || getComposerText(composer) !== prompt) {
      autoContinueState.status = "skipped";
      autoContinueState.reason = "입력창이 변경되어 자동 전송을 건너뛰었습니다.";
      return;
    }

    autoContinueState.awaitingAutoResponse = true;
    autoContinueState.observedGeneration = true;
    autoContinueState.phase = "confirm-send";
    try {
      autoContinueState.clickCount = 1;
      clickOnceLikeUser(sendButton);
      await waitForCondition(
        () => isResponseGenerating() || !getComposerText(composer),
        5000,
        "자동 이어서 진행 전송을 확인하지 못했습니다.",
        100
      );
      confirmed = true;
      autoContinueState.sentCount += 1;
      autoContinueState.status = "waiting-response";
      showAutoContinueNotice(
        `자동 이어서 진행 · ${autoContinueState.sentCount}/${normalizeAutoContinueMaxTurns(settings.autoContinueMaxTurns)}회 전송`
      );
    } catch (error) {
      autoContinueState.awaitingAutoResponse = false;
      throw error;
    }
  } catch (error) {
    markAssistantMessageHandled(message, trigger.messageKey);
    if (error?.code === "auto-continue-cancelled") {
      autoContinueState.status = "off";
      autoContinueState.reason = error.message;
    } else {
      await reportAutoContinueError(error);
    }
  } finally {
    if (!confirmed && composer && findPromptComposer() === composer &&
        (window.location.pathname || "/") === trigger.route && getComposerText(composer) === prompt) {
      setComposerText(composer, "");
    }
    autoContinueState.sending = false;
  }
}

function scanAutoContinue() {
  if (!autoContinueState.ready) {
    initializeAutoContinue();
    if (!autoContinueState.ready) return;
  }
  if (autoContinueState.route !== (window.location.pathname || "/")) {
    resetAutoContinueTracking();
    initializeAutoContinue();
    return;
  }
  if (autoContinueState.status === "error") {
    cancelPendingAutoContinue();
    return;
  }

  if (!settings.enabled || !isAutoContinueEnabled() || pluginRefreshPromise) {
    cancelPendingAutoContinue();
    markExistingAssistantMessagesHandled({ keepLatest: isResponseGenerating() });
    return;
  }

  if (isResponseGenerating()) {
    cancelPendingAutoContinue();
    const latestMessage = getLatestAssistantMessage();
    if (latestMessage && (autoContinueState.observedGeneration || autoContinueState.awaitingAutoResponse)) {
      // ChatGPT may reuse the previous assistant node for this response.
      unmarkAssistantMessageHandled(latestMessage);
    }
    if (!autoContinueState.observedGeneration && !autoContinueState.awaitingAutoResponse) {
      autoContinueState.sentCount = 0;
    }
    autoContinueState.observedGeneration = true;
    autoContinueState.status = "waiting-response";
    return;
  }

  const latestMessage = getLatestAssistantMessage();
  if (autoContinueState.observedGeneration && (!latestMessage || isAssistantMessageHandled(latestMessage))) return;
  if (autoContinueState.timer || autoContinueState.sending) return;
  const shouldSchedule = shouldScheduleAutoContinue({
    enabled: settings.enabled,
    autoContinueEnabled: isAutoContinueEnabled(),
    observedGeneration: autoContinueState.observedGeneration,
    pending: Boolean(autoContinueState.timer),
    sending: autoContinueState.sending,
    sentCount: autoContinueState.sentCount,
    maxTurns: settings.autoContinueMaxTurns,
    hasMessage: Boolean(latestMessage),
    handled: latestMessage ? isAssistantMessageHandled(latestMessage) : false
  });

  if (!autoContinueState.observedGeneration) {
    return;
  }

  autoContinueState.observedGeneration = false;
  autoContinueState.awaitingAutoResponse = false;

  if (!shouldSchedule) {
    if (latestMessage) {
      markAssistantMessageHandled(latestMessage);
    }
    const maxTurns = normalizeAutoContinueMaxTurns(settings.autoContinueMaxTurns);
    if (autoContinueState.sentCount >= maxTurns) {
      autoContinueState.status = "done";
      showAutoContinueNotice(
        `자동 이어서 진행 완료 · ${autoContinueState.sentCount}/${maxTurns}회`
      );
    }
    return;
  }

  const trigger = {
    messageKey: getAssistantMessageKey(latestMessage),
    route: window.location.pathname || "/",
    epoch: autoContinueState.epoch
  };
  autoContinueState.status = "scheduled";
  autoContinueState.phase = "scheduled";
  autoContinueState.timer = window.setTimeout(() => {
    submitAutoContinuePrompt(latestMessage, trigger).catch(reportAutoContinueError);
  }, AUTO_CONTINUE_DELAY_MS);
}

function isAllowButton(button) {
  if (button.isConnected === false || button.disabled || clickedButtons.has(button)) {
    return false;
  }

  // Test the text before visibility: getComputedStyle/getBoundingClientRect are
  // far more expensive, and most buttons on the page fail the text test.
  const text = getText(button);
  return (
    !BROAD_OR_NEGATED_ALLOW_PATTERN.test(text) &&
    ALLOW_TEXT_PATTERNS.some((pattern) => pattern.test(text)) &&
    isVisible(button)
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
  if (classifyPluginPage(window.location.pathname) !== "list" &&
      window.location.hash !== "#settings/Plugins") {
    return [];
  }
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

function waitForCondition(predicate, timeoutMs, timeoutMessage, pollIntervalMs = 0) {
  return new Promise((resolve, reject) => {
    let observer;
    let pollTimer;
    let settled = false;
    const finish = (error, value) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
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
        finish(new Error(typeof timeoutMessage === "function" ? timeoutMessage() : timeoutMessage));
      }
    }, timeoutMs);

    observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true
    });
    if (pollIntervalMs > 0) pollTimer = window.setInterval(check, pollIntervalMs);
    check();
  });
}

async function openPluginSettings(options = {}) {
  if (!/^(chatgpt\.com|chat\.openai\.com)$/i.test(window.location.hostname)) {
    throw new Error("ChatGPT 탭에서 실행하세요.");
  }

  if (classifyPluginPage(window.location.pathname) === "list" ||
      window.location.hash === "#settings/Plugins") {
    await waitForCondition(
      () => getInstalledPluginEntries().length > 0,
      15000,
      "설치된 플러그인 목록을 열지 못했습니다."
    );
    return true;
  }

  const response = await chrome.runtime.sendMessage({
    type: "open-plugin-settings-for-refresh", options
  });
  if (!response?.ok) {
    throw new Error(response?.error || "플러그인 설정 화면으로 이동하지 못했습니다.");
  }
  return false;
}

async function resumePendingPluginRefresh() {
  if (classifyPluginPage(window.location.pathname) !== "list" || pluginRefreshPromise) return;
  pluginRefreshState.status = "running";
  pluginRefreshState.phase = "resume-navigation";
  pluginRefreshState.runStartedAt = Date.now();
  const response = await chrome.runtime.sendMessage({ type: "take-pending-plugin-refresh" });
  if (!response?.ok) throw new Error(response?.error || "플러그인 새로고침 요청을 복구하지 못했습니다.");
  if (!response.options) {
    pluginRefreshState.status = "idle";
    return;
  }
  if (response.options.auto && !document.hidden) {
    await releaseAutoRefreshSlot(response.options.previousRunAt);
    pluginRefreshState.status = "aborted";
    return;
  }
  pluginRefreshPromise = refreshConnectedPlugins(response.options);
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

function getRefreshButtonState() {
  const detailRoot = getPluginDetailRoot();
  const button = detailRoot && findExactButton(detailRoot, REFRESH_BUTTON_TEXTS);
  return !button ? "missing" : isControlDisabled(button) ? "disabled" : "enabled";
}

async function recordPluginRefreshError(error) {
  const startedAt = pluginRefreshState.currentStartedAt || pluginRefreshState.runStartedAt;
  try {
    let buttonState = error?.buttonState || "unknown";
    if (buttonState === "unknown") {
      try { buttonState = getRefreshButtonState(); } catch { /* An ambiguous/missing UI is diagnostic data. */ }
    }
    const result = await chrome.runtime.sendMessage({
      type: "record-plugin-refresh-error",
      entry: {
        plugin: pluginRefreshState.current,
        phase: pluginRefreshState.phase,
        code: error?.code || "plugin-refresh-error",
        message: error instanceof Error ? error.message : String(error),
        elapsedMs: startedAt ? Math.max(0, Date.now() - startedAt) : 0,
        buttonState,
        route: window.location.hash === "#settings/Plugins" ? "legacy" : classifyPluginPage(window.location.pathname),
        clickCount: pluginRefreshState.clickCount,
        total: pluginRefreshState.total,
        clicked: pluginRefreshState.clicked,
        skipped: pluginRefreshState.skipped
      }
    });
    if (!result?.ok) throw new Error(result?.error || "로그 저장 응답을 받지 못했습니다.");
  } catch (logError) {
    pluginRefreshState.logError = logError instanceof Error ? logError.message : String(logError);
    console.error("Plugin refresh diagnostic log could not be saved", logError);
  }
}

async function reportPluginRefreshError(error) {
  pluginRefreshState.status = "error";
  pluginRefreshState.error = error instanceof Error ? error.message : String(error);
  await recordPluginRefreshError(error);
  const logStatus = pluginRefreshState.logError ? " · 진단 로그 저장 실패" : " · 설정에서 진단 로그 확인";
  showPluginRefreshNotice(`플러그인 새로고침 중단 · ${pluginRefreshState.error}${logStatus}`, true);
}

async function refreshCurrentPlugin(target) {
  pluginRefreshState.phase = "inspect-detail";
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

  pluginRefreshState.phase = "click-refresh";
  clickOnceLikeUser(refreshButton);
  pluginRefreshState.clickCount = 1;
  pluginRefreshState.clicked += 1;
}

function snapshotPluginRefreshState() {
  return { ...pluginRefreshState };
}

async function refreshConnectedPlugins({ auto = false, previousRunAt = 0, inspectAll = false } = {}) {
  Object.assign(pluginRefreshState, {
    status: "running",
    total: 0,
    clicked: 0,
    skipped: 0,
    current: "",
    currentStartedAt: 0,
    runStartedAt: Date.now(),
    auto,
    phase: "open-settings",
    clickCount: 0,
    error: "",
    logError: ""
  });

  try {
    if (!await openPluginSettings({ auto, previousRunAt, inspectAll })) return;
    pluginRefreshState.phase = "collect-list";
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
      pluginRefreshState.clickCount = 0;
      if (shouldFastSkipPluginRow(target.rowKind, inspectAll, hasPermissionedEntries)) {
        pluginRefreshState.skipped += 1;
        continue;
      }
      pluginRefreshState.phase = "open-detail";
      await openPluginDetail(target);
      await refreshCurrentPlugin(target);
      pluginRefreshState.phase = "return-list";
      await returnToPluginList(target);
    }

    pluginRefreshState.phase = "close-settings";
    await closePluginSettings();
    pluginRefreshState.current = "";
    pluginRefreshState.currentStartedAt = 0;
    pluginRefreshState.status = "done";
    pluginRefreshState.phase = "done";
    if (!auto) {
      showPluginRefreshNotice(
        `플러그인 새로고침 클릭 완료 · 클릭 ${pluginRefreshState.clicked}/${pluginRefreshState.total} · 건너뜀 ${pluginRefreshState.skipped}`
      );
    }
  } catch (error) {
    await reportPluginRefreshError(error);
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

// ChatGPT streams a response as a burst of DOM mutations. Coalesce them so the
// full-page scan runs at most once per window instead of once per mutation.
const SCAN_DEBOUNCE_MS = 150;
let scanScheduled = false;

function scheduleScan() {
  if (scanScheduled) {
    return;
  }
  scanScheduled = true;
  window.setTimeout(() => {
    scanScheduled = false;
    scan();
  }, SCAN_DEBOUNCE_MS);
}

const observer = new MutationObserver(scheduleScan);
document.addEventListener?.("submit", observeManualPromptSubmission, true);

loadSettings().then(async () => {
  settings.autoContinueMaxTurns = normalizeAutoContinueMaxTurns(
    settings.autoContinueMaxTurns
  );
  initializeAutoContinue();
  scan();
  try {
    await resumePendingPluginRefresh();
  } catch (error) {
    await reportPluginRefreshError(error);
  }
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
