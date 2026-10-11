const fields = {
  enabled: document.querySelector("#enabled"),
  clickDelayMs: document.querySelector("#clickDelayMs"),
  allowedTools: document.querySelector("#allowedTools"),
  deniedKeywords: document.querySelector("#deniedKeywords"),
  autoRefreshHours: document.querySelector("#autoRefreshHours"),
  autoContinueEnabled: document.querySelector("#autoContinueEnabled"),
  autoContinuePrompt: document.querySelector("#autoContinuePrompt"),
  autoContinueMaxTurns: document.querySelector("#autoContinueMaxTurns")
};

const status = document.querySelector("#status");
const saveButton = document.querySelector("#save");
const diagnosticLog = document.querySelector("#diagnosticLog");
const diagnosticStatus = document.querySelector("#diagnosticStatus");
const refreshLogButton = document.querySelector("#refreshLog");
const copyLogButton = document.querySelector("#copyLog");
const PLUGIN_REFRESH_LOG_KEY = "pluginRefreshErrorLog";

function fillFields(settings) {
  fields.enabled.checked = settings.enabled;
  fields.clickDelayMs.value = settings.clickDelayMs;
  fields.allowedTools.value = settings.allowedTools;
  fields.deniedKeywords.value = settings.deniedKeywords;
  fields.autoRefreshHours.value = settings.autoRefreshHours;
  fields.autoContinueEnabled.checked = settings.autoContinueEnabled;
  fields.autoContinuePrompt.value = settings.autoContinuePrompt;
  fields.autoContinueMaxTurns.value = settings.autoContinueMaxTurns;
}

async function loadSettings() {
  fillFields(normalizeSettings(await loadStoredSettings()));
}

async function saveSettings() {
  const settings = normalizeSettings({
    enabled: fields.enabled.checked,
    clickDelayMs: fields.clickDelayMs.value,
    allowedTools: fields.allowedTools.value,
    deniedKeywords: fields.deniedKeywords.value,
    autoRefreshHours: fields.autoRefreshHours.value,
    autoContinueEnabled: fields.autoContinueEnabled.checked,
    autoContinuePrompt: fields.autoContinuePrompt.value,
    autoContinueMaxTurns: fields.autoContinueMaxTurns.value
  });
  try {
    await chrome.storage.sync.set(settings);
    // Show the values that were actually stored (clamped or defaulted).
    fillFields(settings);
    showStatus("저장되었습니다.");
  } catch (error) {
    showStatus(`저장하지 못했습니다: ${error instanceof Error ? error.message : error}`);
  }
}

function showStatus(message) {
  status.textContent = message;
  window.setTimeout(() => {
    status.textContent = "";
  }, 3000);
}

saveButton.addEventListener("click", saveSettings);

async function loadDiagnosticLog() {
  try {
    const stored = await chrome.storage.local.get({ [PLUGIN_REFRESH_LOG_KEY]: [] });
    const logs = Array.isArray(stored[PLUGIN_REFRESH_LOG_KEY]) ? stored[PLUGIN_REFRESH_LOG_KEY] : [];
    diagnosticLog.value = logs.length ? JSON.stringify(logs.slice().reverse(), null, 2) : "";
    copyLogButton.disabled = !logs.length;
    diagnosticStatus.textContent = logs.length ? `오류 로그 ${logs.length}건 · 최신 기록부터 표시합니다.` : "기록된 오류가 없습니다.";
    return true;
  } catch (error) {
    diagnosticLog.value = "";
    copyLogButton.disabled = true;
    diagnosticStatus.textContent = `로그 읽기 실패: ${error instanceof Error ? error.message : String(error)}`;
    return false;
  }
}

async function copyDiagnosticLog() {
  try {
    await navigator.clipboard.writeText(diagnosticLog.value);
    diagnosticStatus.textContent = "진단 로그를 복사했습니다.";
  } catch {
    diagnosticLog.focus();
    diagnosticLog.select();
    diagnosticStatus.textContent = "자동 복사에 실패했습니다. 선택된 로그를 Ctrl+C로 복사하세요.";
  }
}

refreshLogButton.addEventListener("click", loadDiagnosticLog);
copyLogButton.addEventListener("click", copyDiagnosticLog);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && PLUGIN_REFRESH_LOG_KEY in changes) loadDiagnosticLog();
});
loadSettings();
loadDiagnosticLog();
