# Privacy Policy

Auto Allow Tool runs locally in the browser as a Chrome extension. It is an unofficial helper for ChatGPT (chatgpt.com) and is not affiliated with, endorsed by, or produced by OpenAI.

## Data Collection

This extension does not collect, sell, transmit, or share user data. Nothing is sent to the developer or any third party.

## Limited Use

The use of information handled by this extension adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements. Page content is used only for the extension's single purpose of automating tool approval and tool management on ChatGPT, and is never used for advertising, sold, or transferred.

## Page Content

The content script reads ChatGPT pages only to find tool-permission cards, allow buttons, the plugin settings screen and the response composer. Permission-card text and plugin names are processed on the device to decide what to click. Prompts and responses are not stored.

## Stored Data

### Settings (`chrome.storage.sync`)

- whether automatic clicking is enabled
- click delay
- optional allow-list tool names
- optional deny-list keywords
- automatic plugin refresh interval (hours)
- whether automatic continuation is enabled
- continuation prompt and maximum continuation count

If Chrome Sync is turned on, Chrome syncs these settings to the user's other Chrome browsers signed in to the same Google account. The extension itself does not send them anywhere.

### Local state (`chrome.storage.local`)

- the time of the last automatic plugin refresh
- the automation diagnostic log (see below)

### Session state (`chrome.storage.session`)

- temporary per-tab automatic-continuation overrides, removed when each tab closes
- a pending plugin-refresh request that lets a refresh resume after navigating to the plugin settings page, removed when it is used, when it is older than two minutes, or when the tab closes

## Diagnostic Log

When a plugin refresh or an automatic continuation fails, the extension stores one diagnostic entry on the device. It keeps at most 100 entries. Each entry contains:

- time, extension version and feature
- plugin name (up to 160 characters)
- step, error code and error message (up to 600 characters, with URLs and token-like strings masked)
- elapsed time, refresh-button state, page type and click/skip/send counts

The log never contains prompts or response content. The user can view and copy it from the options page.

## Network Access and Navigation

The extension does not make its own network requests. When a plugin refresh starts, it navigates the current ChatGPT tab to `https://chatgpt.com/settings/plugins-settings`. An automatic refresh runs only when the user has set an interval and the ChatGPT tab is in the background.

## Permission Scope

The extension uses the `storage` permission and is limited to:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

It cannot click Chrome native permission prompts, operating system dialogs, or pages outside its declared host permissions.
