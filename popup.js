const DEFAULT_SETTINGS = {
  enabled: true,
  clickDelayMs: 300,
  allowedTools: "",
  deniedKeywords: ""
};

const enabled = document.querySelector("#enabled");
const stateText = document.querySelector("#stateText");
const delayText = document.querySelector("#delayText");
const allowText = document.querySelector("#allowText");
const optionsButton = document.querySelector("#options");
const refreshPluginsButton = document.querySelector("#refreshPlugins");
const refreshStatus = document.querySelector("#refreshStatus");
let refreshStateTimer = null;

function render(settings) {
  enabled.checked = Boolean(settings.enabled);
  stateText.textContent = settings.enabled ? "자동 허용 켜짐" : "자동 허용 꺼짐";
  delayText.textContent = `${settings.clickDelayMs}ms`;
  allowText.textContent = settings.allowedTools || "모든 도구";
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  render(settings);
}

enabled.addEventListener("change", async () => {
  await chrome.storage.sync.set({ enabled: enabled.checked });
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  render(settings);
});

optionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function renderRefreshState(state) {
  const processed = Number(state.completed || 0) + Number(state.skipped || 0);
  refreshPluginsButton.disabled = state.status === "running";

  if (state.status === "running") {
    refreshStatus.textContent = `${processed}/${state.total || "?"} 처리 중 · ${state.current || "목록 확인"}`;
    return;
  }
  if (state.status === "done") {
    refreshStatus.textContent = `완료 ${state.completed}/${state.total} · 건너뜀 ${state.skipped}`;
    return;
  }
  if (state.status === "error") {
    refreshStatus.textContent = `중단 ${processed}/${state.total || "?"} · ${state.error}`;
    return;
  }
  refreshStatus.textContent = "대기 중";
}

async function sendToActiveTab(type) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error("활성 탭을 찾지 못했습니다.");
  }
  return chrome.tabs.sendMessage(tab.id, { type });
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
    const state = await sendToActiveTab("refresh-connected-plugins");
    renderRefreshState(state);
    startRefreshStateUpdates();
  } catch (error) {
    refreshPluginsButton.disabled = false;
    refreshStatus.textContent = "ChatGPT 탭을 새로고침한 뒤 다시 실행하세요.";
  }
});

loadSettings();
updateRefreshState();
