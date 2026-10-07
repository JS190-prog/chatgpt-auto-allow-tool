const enabled = document.querySelector("#enabled");
const autoContinueEnabled = document.querySelector("#autoContinueEnabled");
const autoContinueScope = document.querySelector("#autoContinueScope");
const autoContinueStatus = document.querySelector("#autoContinueStatus");
const stateText = document.querySelector("#stateText");
const delayText = document.querySelector("#delayText");
const allowText = document.querySelector("#allowText");
const optionsButton = document.querySelector("#options");
const refreshPluginsButton = document.querySelector("#refreshPlugins");
const inspectAllPlugins = document.querySelector("#inspectAllPlugins");
const refreshStatus = document.querySelector("#refreshStatus");
let refreshStateTimer = null;

function render(settings) {
  enabled.checked = Boolean(settings.enabled);
  stateText.textContent = settings.enabled ? "자동 허용 켜짐" : "자동 허용 꺼짐";
  delayText.textContent = `${settings.clickDelayMs}ms`;
  allowText.textContent = settings.allowedTools || "모든 도구";
}

async function loadSettings() {
  render(normalizeSettings(await loadStoredSettings()));
}

enabled.addEventListener("change", async () => {
  await chrome.storage.sync.set({ enabled: enabled.checked });
  render(normalizeSettings(await chrome.storage.sync.get(DEFAULT_SETTINGS)));
});

autoContinueEnabled.addEventListener("change", async () => {
  autoContinueEnabled.disabled = true;
  try {
    const state = await sendToActiveTab("set-tab-auto-continue-enabled", {
      enabled: autoContinueEnabled.checked
    });
    if (state?.error) {
      throw new Error(state.error);
    }
    renderAutoContinueTabState(state);
  } catch {
    autoContinueScope.textContent = "ChatGPT 탭을 새로고침한 뒤 다시 시도하세요.";
  }
});

optionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function renderRefreshState(state) {
  const processed = Number(state.clicked || 0) + Number(state.skipped || 0);
  refreshPluginsButton.disabled = state.status === "running";
  inspectAllPlugins.disabled = state.status === "running";

  if (state.status === "running") {
    const elapsed = state.currentStartedAt ? ` · ${Math.floor((Date.now() - state.currentStartedAt) / 1000)}초` : "";
    refreshStatus.textContent = `${processed}/${state.total || "?"} 처리 중 · ${state.current || "목록 확인"}${elapsed}`;
    return;
  }
  if (state.status === "done") {
    refreshStatus.textContent = `클릭 ${state.clicked}/${state.total} · 건너뜀 ${state.skipped}`;
    return;
  }
  if (state.status === "error") {
    const logStatus = state.logError ? "진단 로그 저장 실패" : "설정에서 진단 로그 확인";
    refreshStatus.textContent = `중단 ${processed}/${state.total || "?"} · ${state.error} · ${logStatus}`;
    return;
  }
  refreshStatus.textContent = "대기 중";
}

function renderAutoContinueTabState(state) {
  autoContinueEnabled.checked = Boolean(state.effectiveEnabled);
  autoContinueEnabled.disabled = false;
  const labels = {
    off: "자동 이어서 진행 꺼짐",
    idle: "대화 화면 대기",
    watching: "새 답변 완료 대기",
    "waiting-response": "답변 완료 대기",
    scheduled: "자동 입력 준비 중",
    "waiting-composer": "입력창 준비 대기",
    sending: "자동 문구 전송 중",
    done: "설정한 횟수 완료",
    skipped: state.reason,
    error: `${state.error} · ${state.logError ? "진단 로그 저장 실패" : "옵션에서 진단 로그 확인"}`
  };
  autoContinueStatus.textContent = state.status
    ? `${labels[state.status] || "대기 중"} · ${state.sentCount || 0}/${state.maxTurns || 1}회`
    : "";
  if (typeof state.tabOverride === "boolean") {
    autoContinueScope.textContent = state.tabOverride
      ? "현재 탭만 별도로 켜짐"
      : "현재 탭만 별도로 꺼짐";
    return;
  }
  autoContinueScope.textContent = `기본값 사용 중 · ${state.globalEnabled ? "켜짐" : "꺼짐"}`;
}

async function sendToActiveTab(type, payload = {}) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("활성 탭을 찾지 못했습니다.");
  }
  if (type === "refresh-connected-plugins") {
    const result = await chrome.runtime.sendMessage({
      type: "open-plugin-settings-for-refresh", tabId: tab.id, options: payload
    });
    if (!result?.ok) {
      const logStatus = result?.logError ? " · 진단 로그 저장 실패" : "";
      throw new Error(`${result?.error || "플러그인 설정 화면으로 이동하지 못했습니다."}${logStatus}`);
    }
    return result.state;
  }
  if (type === "get-plugin-refresh-state") {
    const result = await chrome.runtime.sendMessage({
      type: "get-plugin-refresh-navigation", tabId: tab.id
    });
    if (!result?.ok) {
      const logStatus = result?.logError ? " · 진단 로그 저장 실패" : "";
      throw new Error(`${result?.error || "새로고침 상태를 확인하지 못했습니다."}${logStatus}`);
    }
    if (result.state) return result.state;
  }
  return chrome.tabs.sendMessage(tab.id, { type, ...payload });
}

async function updateAutoContinueTabState() {
  try {
    const state = await sendToActiveTab("get-tab-auto-continue-state");
    renderAutoContinueTabState(state);
  } catch {
    autoContinueEnabled.disabled = true;
    autoContinueScope.textContent = "현재 페이지는 ChatGPT 탭이 아닙니다.";
  }
}

function stopRefreshStateUpdates() {
  if (refreshStateTimer) {
    window.clearInterval(refreshStateTimer);
    refreshStateTimer = null;
  }
}

async function updateRefreshState() {
  try {
    const state = await sendToActiveTab("get-plugin-refresh-state");
    renderRefreshState(state);
    if (state.status !== "running") {
      stopRefreshStateUpdates();
    }
  } catch (error) {
    stopRefreshStateUpdates();
    refreshPluginsButton.disabled = false;
    refreshStatus.textContent = "ChatGPT 탭을 새로고침한 뒤 다시 실행하세요.";
  }
}

function startRefreshStateUpdates() {
  stopRefreshStateUpdates();
  refreshStateTimer = window.setInterval(updateRefreshState, 750);
}

refreshPluginsButton.addEventListener("click", async () => {
  refreshPluginsButton.disabled = true;
  refreshStatus.textContent = "플러그인 목록 여는 중";
  try {
    const state = await sendToActiveTab("refresh-connected-plugins", {
      inspectAll: inspectAllPlugins.checked
    });
    renderRefreshState(state);
    startRefreshStateUpdates();
  } catch (error) {
    refreshPluginsButton.disabled = false;
    refreshStatus.textContent = error instanceof Error ? error.message : String(error);
  }
});

loadSettings().then(
  () => updateAutoContinueTabState(),
  () => updateAutoContinueTabState()
);
updateRefreshState();
window.setInterval(updateAutoContinueTabState, 1000);
