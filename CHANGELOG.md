# Changelog

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
