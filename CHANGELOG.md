# Changelog

## 0.5.15

- Safety: buttons such as "Always allow", "Allow all", `항상 허용`, `모든 … 허용` and negated or reject/cancel labels are never auto-clicked. Permission-card text is capped so an oversized ancestor cannot be mistaken for a card.
- `허용할 도구 이름` now matches whole tool names (`read` no longer matches `thread_delete` or `read_status`).
- Shared `settings.js` replaces three copies of the defaults and migration; all stored and typed values are normalized (a 0 ms click delay is honored; out-of-range values are clamped).
- Page scans triggered by DOM mutations are coalesced (150 ms), and the text check runs before the costlier visibility check.
- A failed automatic "continue" now shows an error notice instead of failing silently.

## 0.5.14

- Re-arms automatic continuation when ChatGPT reuses the same assistant DOM node for a new response, so multi-turn continuation can continue to the configured limit.

## 0.5.13

- Advances to the next plugin immediately after one refresh-button click, without waiting for start or completion transitions. List and detail navigation checks remain in place.
- Reports click counts rather than server completion counts and removes the unused completion-timeout option. Click and navigation failures still persist in automation diagnostics.
- Adds deterministic checks for consecutive plugins with pending refreshes, absent start transitions, disabled controls and failed-click logging. Auto continuation behavior is unchanged.

## 0.5.12

- Recognizes the current ChatGPT response heading and containing turn when author-role attributes are absent, and observes response-completion controls in that turn.
- Finds the current `보내기` button inside the composer form. Waits for transiently missing composers and send controls, preserves user drafts, and stops stale work on conversation changes or when disabled.
- Deduplicates responses across DOM replacement, preserves the continuation count through subsequent responses, and exposes progress and errors in the popup.
- Observes manual form submission so replies completed between scans remain eligible. An unconfirmed send stops the chain until a new manual submission or toggle re-arms it.
- Persists continuation failures alongside plugin-refresh failures in the options' automation diagnostics, without recording prompts or response content.
- Adds a current-UI fixture regression covering actual input and button activation, count limits, draft protection, DOM replacement, transient composer absence, visible errors and cancellation.

## 0.5.11

- Makes each plugin's completion deadline configurable from 1–30 minutes (default 10). Shows delayed-response progress after three minutes while waiting for the original request.
- Checks completion periodically as well as on DOM mutations, aborts if the detail route changes, and counts completion only after the refresh button is enabled again.
- Persists the latest 100 refresh and settings-navigation errors locally with version, plugin, phase, timing, click count and button state. Options can display and copy logs; conversation content and MCP addresses are excluded.
- Adds deterministic regressions for slow completion, missed mutations, genuine timeouts, navigation changes, concurrent log writes, persistence and storage failure reporting.

## 0.5.10 (local line, superseded by upstream 0.5.10 — see 0.5.15)

- Opens `/settings/plugins-settings` directly before a refresh sweep, avoiding the unrelated sidebar button also labeled `플러그인`.
- Carries the request across navigation in per-tab session storage, consumes it once on the settings list, and keeps navigation progress visible in the popup.
- Rejects installed-list collection on other routes and adds regressions for navigation, resumption, tab isolation, and expired requests.

## 0.5.9

- Rechecks the current MCP approval button after the click delay, so a button replaced while ChatGPT renders can still receive one click. A disappeared approval is left alone.
- Added a regression for the observed `한 번만 허용` split-button card and for button replacement during the delay.

## 0.5.8

- Clarified that `한 번만 허용` refers to an MCP tool-call approval. Click behavior is unchanged from 0.5.7.

## 0.5.7

- Recognized any direct app-detail route below ChatGPT plugin settings, including new route prefixes used by skills-only apps. These loaded details are skipped without stopping the refresh sweep when no refresh action exists.
- Added recognition for the MCP tool-call approval button labeled `한 번만 허용`, including the Enter-key hint, while leaving its adjacent options menu untouched.

## 0.5.6

- Added a faster default refresh that skips installed rows without a visible tool-permission status; the popup can still inspect every app.
- Skipped loaded skills-only details immediately, showed each app's elapsed time in the popup, and allowed up to three minutes for a slow tool refresh to finish.
- Rechecked the button state at the completion deadline so a missed DOM mutation cannot cause a false timeout.

## 0.5.5

- Excluded the Pro account's default-permissions menu section from installed plugin rows; its popup button must never be treated as a plugin refresh target.

## 0.5.4

- Recognized loaded skills-only plugin details, including Default templates, Documents, and PDF, so entries without a refresh action are skipped and the sweep continues.

## 0.5.3

- Scoped installed-plugin discovery to the search field's list container and included multiple installed sections, fixing the Pro account's two-section refresh stop.

## 0.5.2

- Restored refresh entry from ChatGPT chat pages by finding the visible profile-menu button through its accessibility label, even when its displayed text is an account initial.

## 0.5.1

- Updated the connected-app refresh sweep for ChatGPT's current app-management dashboard and its `도구 새로 고침` action.

## 0.5.0

- Added per-tab automatic-continuation controls in the popup while keeping the option-page value as the default for tabs without an override.
- Persists each tab override in extension session storage across page reloads and removes it when the tab closes.
- Prevents the popup's current-tab toggle from changing every open ChatGPT tab.

## 0.4.0

- Added opt-in automatic continuation after a newly generated ChatGPT response completes.
- Added a configurable continuation prompt and a 1–100 maximum automatic continuation count per user-started response chain.
- Requires an observed generation-to-completion transition and tracks handled assistant messages to prevent old or rerendered responses from being submitted twice.
- Shows an accessible top-right progress notice after each confirmed automatic send and a completion notice after the final follow-up response.

## 0.3.1

- Stabilized installed-plugin identity across permission/status re-renders so queued refresh targets do not disappear between list and detail views.
- Waits for a target plugin row to reappear after returning from a detail page instead of failing immediately on a partially rendered React list.

## 0.3.0

- Added the optional `플러그인 자동 새로고침 주기(시간)` setting, which runs the full plugin refresh on an interval. Defaults to `0`, so the popup stays the only trigger unless it is turned on.
- Automatic runs only start while the ChatGPT tab is in the background, and stop as soon as the user looks at that tab again.

## 0.2.4

- Closes the ChatGPT plugin settings dialog after the full refresh run finishes.
- Shows a dismissible in-page completion or error notice with completed and skipped counts.

## 0.2.3

- Treats plugin details without a refresh action as normal skips instead of stopping the full run.
- Keeps processing later installed plugins when a detail page exposes neither refresh nor standard information metadata.

## 0.2.2

- Waits for the plugin detail information section to finish rendering before deciding whether a refresh action exists.
- Prevents connected plugins from being incorrectly skipped when the back button appears before the refresh control.

## 0.2.1

- Added one-click sequential refresh for every installed ChatGPT plugin that exposes a refresh action.
- Detects plugins dynamically instead of relying on fixed names or counts.
- Confirms each refresh through the button's disabled-to-enabled transition and reports progress in the popup.
- Packages the current working tree and refuses to overwrite an existing ZIP.

## 0.2.0

- Changed default deny keywords to blank to avoid blocking permission cards that contain explanatory text such as `This will cancel...`.
- Added pointer and mouse event dispatching before the final click.
- Added extension options for enable state, click delay, allow-list tool names, and deny-list keywords.
- Added repository metadata, validation, privacy, security, and license documents.
- Added extension icons.
- Added toolbar popup quick toggle.
- Added release ZIP packaging.
- Added troubleshooting and conduct docs.

## 0.1.0

- Initial unpacked Chrome extension prototype.
