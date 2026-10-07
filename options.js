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
loadSettings();
