# Changelog

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
