const TAB_OVERRIDE_PREFIX = "autoContinueTabOverride:";
const PLUGIN_SETTINGS_URL = "https://chatgpt.com/settings/plugins-settings";
const PENDING_PLUGIN_REFRESH_PREFIX = "pendingPluginRefresh:";
const PLUGIN_NAVIGATION_MAX_AGE_MS = 120000;
const pendingPluginRefreshClaims = new Set();
const PLUGIN_REFRESH_LOG_KEY = "pluginRefreshErrorLog";
const PLUGIN_REFRESH_LOG_LIMIT = 100;
let pluginRefreshLogQueue = Promise.resolve();

function sanitizeDiagnosticText(value, maxLength) {
  return String(value ?? "")
    .replace(/https?:\/\/[^\s]+/gi, "[주소 생략]")
    .replace(/(?:bearer\s+|(?:token|api[_-]?key|secret|password)\s*[=:]\s*)[^\s,;]+/gi, "[인증 정보 생략]")
    .slice(0, maxLength);
}

function normalizePluginRefreshLog(entry, source) {
  const number = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
  const choice = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
  return {
    time: new Date().toISOString(),
    extensionVersion: chrome.runtime.getManifest().version,
    source,
    feature: entry.feature === "auto-continue" ? "auto-continue" : "plugin-refresh",
    plugin: sanitizeDiagnosticText(entry.plugin, 160),
    phase: choice(entry.phase, ["idle", "open-settings", "collect-list", "open-detail", "inspect-detail", "click-refresh", "wait-start", "wait-completion", "return-list", "close-settings", "resume-navigation", "navigate-settings", "scheduled", "wait-composer", "write-prompt", "wait-send-button", "confirm-send"], "unknown"),
    code: choice(entry.code, ["plugin-refresh-timeout", "plugin-refresh-route-changed", "plugin-navigation-failed", "auto-continue-context-changed"], entry.feature === "auto-continue" ? "auto-continue-error" : "plugin-refresh-error"),
    message: sanitizeDiagnosticText(entry.message, 600),
    elapsedMs: number(entry.elapsedMs),
    waitElapsedMs: number(entry.waitElapsedMs),
    timeoutMs: number(entry.timeoutMs),
    buttonState: choice(entry.buttonState, ["disabled", "enabled", "missing"], "unknown"),
    route: choice(entry.route, ["list", "detail", "legacy", "conversation"], "other"),
    clickCount: number(entry.clickCount),
    total: number(entry.total),
    completed: number(entry.completed),
    clicked: number(entry.clicked),
    skipped: number(entry.skipped),
    sentCount: number(entry.sentCount),
    maxTurns: number(entry.maxTurns)
  };
}

function writePluginRefreshErrorLog(entry = {}, source = "content") {
  const log = normalizePluginRefreshLog(entry && typeof entry === "object" ? entry : {}, source);
  // Only the worker writes this key. Serialize requests from different tabs.
  const operation = pluginRefreshLogQueue.then(async () => {
    const stored = await chrome.storage.local.get({ [PLUGIN_REFRESH_LOG_KEY]: [] });
    const logs = Array.isArray(stored[PLUGIN_REFRESH_LOG_KEY]) ? stored[PLUGIN_REFRESH_LOG_KEY] : [];
    await chrome.storage.local.set({
      [PLUGIN_REFRESH_LOG_KEY]: [...logs.slice(-(PLUGIN_REFRESH_LOG_LIMIT - 1)), log]
    });
  });
  pluginRefreshLogQueue = operation.catch(() => {});
  return operation;
}

function getPendingPluginRefreshKey(tabId) {
  return `${PENDING_PLUGIN_REFRESH_PREFIX}${tabId}`;
}

function getChatGPTURL(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["chatgpt.com", "chat.openai.com"].includes(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

async function readPendingPluginRefresh(tabId) {
  const key = getPendingPluginRefreshKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const request = stored[key];
  if (!request) return null;
  const age = Date.now() - Number(request.createdAt);
  if (!Number.isFinite(age) || age < 0 || age > PLUGIN_NAVIGATION_MAX_AGE_MS) {
    await chrome.storage.session.remove(key);
    return null;
  }
  return request;
}

function pluginNavigationState() {
  return {
    status: "running", total: 0, clicked: 0, skipped: 0,
    current: "플러그인 설정 여는 중", currentStartedAt: 0, error: ""
  };
}

async function handlePluginRefreshNavigation(message, sender) {
  const tabId = sender.tab?.id ?? message.tabId;
  if (!Number.isInteger(tabId)) throw new Error("탭 ID를 확인하지 못했습니다.");

  if (message.type === "take-pending-plugin-refresh") {
    const url = getChatGPTURL(sender.url);
    if (!url || url.pathname.replace(/\/+$/, "") !== "/settings/plugins-settings") {
      return { ok: true, options: null };
    }
    if (pendingPluginRefreshClaims.has(tabId)) return { ok: true, options: null };
    pendingPluginRefreshClaims.add(tabId);
    try {
      const request = await readPendingPluginRefresh(tabId);
      if (!request) return { ok: true, options: null };
      await chrome.storage.session.remove(getPendingPluginRefreshKey(tabId));
      return { ok: true, options: request.options };
    } finally {
      pendingPluginRefreshClaims.delete(tabId);
    }
  }

  if (message.type === "get-plugin-refresh-navigation") {
    const request = await readPendingPluginRefresh(tabId);
    return { ok: true, state: request ? pluginNavigationState() : null };
  }

  const tab = await chrome.tabs.get(tabId);
  if (!getChatGPTURL(tab.url)) throw new Error("ChatGPT 탭에서 실행하세요.");
  if (await readPendingPluginRefresh(tabId)) {
    return { ok: true, state: pluginNavigationState() };
  }
  const options = {
    inspectAll: message.options?.inspectAll === true,
    auto: message.options?.auto === true,
    previousRunAt: Number(message.options?.previousRunAt) || 0
  };
  const key = getPendingPluginRefreshKey(tabId);
  await chrome.storage.session.set({ [key]: { createdAt: Date.now(), options } });
  try {
    // A full navigation replaces the content script. Keep the one-shot request
    // in session storage so the new settings document can resume it.
    await chrome.tabs.update(tabId, { url: PLUGIN_SETTINGS_URL });
  } catch (error) {
    await chrome.storage.session.remove(key);
    throw error;
  }
  return { ok: true, state: pluginNavigationState() };
}

function getTabOverrideKey(tabId) {
  return `${TAB_OVERRIDE_PREFIX}${tabId}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "record-plugin-refresh-error" || message?.type === "record-auto-continue-error") {
    const entry = { ...message.entry, feature: message.type === "record-auto-continue-error" ? "auto-continue" : "plugin-refresh" };
    writePluginRefreshErrorLog(entry).then(
      () => sendResponse({ ok: true }),
      (error) => {
        console.error("Plugin refresh diagnostic log could not be saved", error);
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    );
    return true;
  }
  if ([
    "open-plugin-settings-for-refresh",
    "take-pending-plugin-refresh",
    "get-plugin-refresh-navigation"
  ].includes(message?.type)) {
    handlePluginRefreshNavigation(message, sender).then(
      sendResponse,
      async (error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        let logError = "";
        try {
          await writePluginRefreshErrorLog({
            phase: message.type === "open-plugin-settings-for-refresh" ? "navigate-settings" : "resume-navigation",
            code: "plugin-navigation-failed",
            message: errorMessage
          }, "background");
        } catch (failure) {
          logError = failure instanceof Error ? failure.message : String(failure);
          console.error("Plugin refresh diagnostic log could not be saved", failure);
        }
        sendResponse({ ok: false, error: errorMessage, logError });
      }
    );
    return true;
  }
  if (
    message?.type !== "get-tab-auto-continue-override" &&
    message?.type !== "set-tab-auto-continue-override"
  ) {
    return;
  }

  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId)) {
    sendResponse({ ok: false, error: "탭 ID를 확인하지 못했습니다." });
    return;
  }

  const key = getTabOverrideKey(tabId);
  if (message.type === "get-tab-auto-continue-override") {
    chrome.storage.session.get(key).then(
      (stored) => sendResponse({
        ok: true,
        override: typeof stored[key] === "boolean" ? stored[key] : null
      }),
      (error) => sendResponse({ ok: false, error: String(error) })
    );
    return true;
  }

  const operation = typeof message.override === "boolean"
    ? chrome.storage.session.set({ [key]: message.override })
    : chrome.storage.session.remove(key);
  operation.then(
    () => sendResponse({ ok: true }),
    (error) => sendResponse({ ok: false, error: String(error) })
  );
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(getTabOverrideKey(tabId));
  chrome.storage.session.remove(getPendingPluginRefreshKey(tabId));
});
