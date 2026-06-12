const DEFAULT_SETTINGS = {
  enabled: true,
  clickDelayMs: 300,
  allowedTools: "",
  deniedKeywords: ""
};

const fields = {
  enabled: document.querySelector("#enabled"),
  clickDelayMs: document.querySelector("#clickDelayMs"),
  allowedTools: document.querySelector("#allowedTools"),
  deniedKeywords: document.querySelector("#deniedKeywords")
};

const status = document.querySelector("#status");
const saveButton = document.querySelector("#save");

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  fields.enabled.checked = Boolean(settings.enabled);
  fields.clickDelayMs.value = settings.clickDelayMs;
  fields.allowedTools.value = settings.allowedTools;
  fields.deniedKeywords.value = settings.deniedKeywords;
}

async function saveSettings() {
  await chrome.storage.sync.set({
    enabled: fields.enabled.checked,
    clickDelayMs: Math.max(0, Number(fields.clickDelayMs.value) || 0),
    allowedTools: fields.allowedTools.value,
    deniedKeywords: fields.deniedKeywords.value
  });
  status.textContent = "저장되었습니다.";
  window.setTimeout(() => {
    status.textContent = "";
  }, 1500);
}

saveButton.addEventListener("click", saveSettings);
loadSettings();
