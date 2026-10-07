// Shared by content.js, popup.js and options.js. Loaded as a plain script
// before them, so everything here is a global of that page or content script.
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
const CLICK_DELAY_MAX_MS = 10000;
const AUTO_REFRESH_MAX_HOURS = 720;
const AUTO_CONTINUE_MAX_LIMIT = 100;

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (value === "" || value === null || !Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function normalizeClickDelayMs(value) {
  return Math.trunc(
    clampNumber(value, 0, CLICK_DELAY_MAX_MS, DEFAULT_SETTINGS.clickDelayMs)
  );
}

function normalizeAutoRefreshHours(value) {
  return clampNumber(value, 0, AUTO_REFRESH_MAX_HOURS, DEFAULT_SETTINGS.autoRefreshHours);
}

function normalizeAutoContinueMaxTurns(value) {
  return Math.trunc(
    clampNumber(value, 1, AUTO_CONTINUE_MAX_LIMIT, DEFAULT_SETTINGS.autoContinueMaxTurns)
  );
}

// Every consumer funnels stored or typed values through here, so an invalid
// value (negative, NaN, wrong type) can never reach the automation logic.
function normalizeSettings(raw = {}) {
  // A removed storage key arrives as `undefined`; it must fall back to the
  // default rather than overwrite it (Boolean(undefined) would disable the tool).
  const present = Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== undefined)
  );
  const merged = { ...DEFAULT_SETTINGS, ...present };
  return {
    enabled: Boolean(merged.enabled),
    clickDelayMs: normalizeClickDelayMs(merged.clickDelayMs),
    allowedTools: String(merged.allowedTools ?? ""),
    deniedKeywords: String(merged.deniedKeywords ?? ""),
    autoRefreshHours: normalizeAutoRefreshHours(merged.autoRefreshHours),
    autoContinueEnabled: Boolean(merged.autoContinueEnabled),
    autoContinuePrompt:
      String(merged.autoContinuePrompt ?? "").trim() || DEFAULT_SETTINGS.autoContinuePrompt,
    autoContinueMaxTurns: normalizeAutoContinueMaxTurns(merged.autoContinueMaxTurns)
  };
}

function getAutoContinueDefaultMigration(stored) {
  if (stored[AUTO_CONTINUE_DEFAULT_MIGRATION_KEY]) {
    return null;
  }

  const migration = {
    [AUTO_CONTINUE_DEFAULT_MIGRATION_KEY]: true
  };
  if (stored.autoContinueEnabled !== DEFAULT_SETTINGS.autoContinueEnabled) {
    migration.autoContinueEnabled = DEFAULT_SETTINGS.autoContinueEnabled;
  }
  return migration;
}

// Reads the stored settings, applying the one-time migrations. The migration
// is idempotent, so concurrent callers (content script, popup, options) that
// both run it write the same values.
async function loadStoredSettings() {
  const stored = await chrome.storage.sync.get({
    ...DEFAULT_SETTINGS,
    [AUTO_CONTINUE_DEFAULT_MIGRATION_KEY]: false
  });

  const migration = getAutoContinueDefaultMigration(stored);
  if (migration) {
    await chrome.storage.sync.set(migration);
    Object.assign(stored, migration);
  }
  return stored;
}
