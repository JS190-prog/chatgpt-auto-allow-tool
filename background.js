const TAB_OVERRIDE_PREFIX = "autoContinueTabOverride:";

function getTabOverrideKey(tabId) {
  return `${TAB_OVERRIDE_PREFIX}${tabId}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
});
