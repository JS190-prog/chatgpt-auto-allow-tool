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

loadSettings();
