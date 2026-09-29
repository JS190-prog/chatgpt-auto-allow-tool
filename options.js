const DEFAULT_SETTINGS = {
  enabled: true,
  clickDelayMs: 300,
  allowedTools: "",
  deniedKeywords: "",
  autoRefreshHours: 0,
  autoContinueEnabled: false,
  autoContinuePrompt: "이어서 진행",
  autoContinueMaxTurns: 1
};
const AUTO_CONTINUE_DEFAULT_MIGRATION_KEY = "autoContinueDefaultOffApplied";

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

function getAutoContinueDefaultMigration(settings) {
  if (settings[AUTO_CONTINUE_DEFAULT_MIGRATION_KEY]) {
    return null;
  }

  const migration = {
    [AUTO_CONTINUE_DEFAULT_MIGRATION_KEY]: true
  };
  if (settings.autoContinueEnabled !== DEFAULT_SETTINGS.autoContinueEnabled) {
    migration.autoContinueEnabled = DEFAULT_SETTINGS.autoContinueEnabled;
  }
  return migration;
}

async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    ...DEFAULT_SETTINGS,
    [AUTO_CONTINUE_DEFAULT_MIGRATION_KEY]: false
  });
  const migration = getAutoContinueDefaultMigration(settings);
  if (migration) {
    await chrome.storage.sync.set(migration);
    Object.assign(settings, migration);
  }

  fields.enabled.checked = Boolean(settings.enabled);
  fields.clickDelayMs.value = settings.clickDelayMs;
  fields.allowedTools.value = settings.allowedTools;
  fields.deniedKeywords.value = settings.deniedKeywords;
  fields.autoRefreshHours.value = settings.autoRefreshHours;
  fields.autoContinueEnabled.checked = Boolean(settings.autoContinueEnabled);
  fields.autoContinuePrompt.value = settings.autoContinuePrompt;
  fields.autoContinueMaxTurns.value = settings.autoContinueMaxTurns;
}

async function saveSettings() {
  await chrome.storage.sync.set({
    enabled: fields.enabled.checked,
    clickDelayMs: Math.max(0, Number(fields.clickDelayMs.value) || 0),
    allowedTools: fields.allowedTools.value,
    deniedKeywords: fields.deniedKeywords.value,
    autoRefreshHours: Math.max(0, Number(fields.autoRefreshHours.value) || 0),
    autoContinueEnabled: fields.autoContinueEnabled.checked,
    autoContinuePrompt: fields.autoContinuePrompt.value.trim() || DEFAULT_SETTINGS.autoContinuePrompt,
    autoContinueMaxTurns: Math.min(
      100,
      Math.max(1, Math.trunc(Number(fields.autoContinueMaxTurns.value) || 1))
    )
  });
  status.textContent = "저장되었습니다.";
  window.setTimeout(() => {
    status.textContent = "";
  }, 1500);
}

saveButton.addEventListener("click", saveSettings);
loadSettings();
