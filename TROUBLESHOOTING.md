# Troubleshooting

## The button is not clicked

1. Open the Chrome extensions page and reload this extension.
2. Refresh the ChatGPT tab.
3. Click the extension toolbar icon and confirm `자동 허용` is enabled.
4. Open extension options and clear `자동 클릭 제외 키워드`.
5. If `허용할 도구 이름` is set, confirm the visible permission card contains one of those names.

## The extension does not run on a page

The extension only runs on:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

It cannot run on Chrome internal pages, native permission prompts, or operating system dialogs.

## It clicks too broadly

Set `허용할 도구 이름` in the options page. Use comma-separated tool names so only matching permission cards are approved.

## Reporting a bug

Open a GitHub issue and include:

- browser version
- extension version
- whether the toolbar popup says automatic approval is enabled
- the text shown on the permission card, with private content removed
