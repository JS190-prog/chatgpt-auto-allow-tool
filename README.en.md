# ChatGPT Auto Allow Tool

[한국어](README.md)

[![Validate](https://github.com/JS190-prog/chatgpt-auto-allow-tool/actions/workflows/validate.yml/badge.svg)](https://github.com/JS190-prog/chatgpt-auto-allow-tool/actions/workflows/validate.yml)

A Chrome extension that automatically allows ChatGPT tools and can optionally continue after a response completes.

This is an unofficial tool and is not affiliated with OpenAI.

It was built for permission cards like:

- `허용하기`
- `한 번만 허용`
- `Allow`
- `Approve`
- `승인`
- `사용 허용`

## Important Safety Notice

This extension can approve tool usage without another manual click. Use it only when you understand which tools ChatGPT may call.

For safer use, open the extension options and set `Allowed tool names` so only specific tools are auto-approved.

## Install From Source

1. Download or clone this repository.
2. Open Chrome extensions: `chrome://extensions`
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select the repository folder.
6. Refresh any open ChatGPT tab.

## Options

Click the toolbar icon to quickly toggle automatic approval. For full settings, open the extension details page, then click `Extension options`.

- `자동 허용 사용`: turn automatic clicking on or off
- `클릭 지연 시간(ms)`: wait time before clicking the allow button
- `허용할 도구 이름`: comma-separated allow list; leave blank to allow every matching permission card; names must match a whole tool name, not a substring (`read` does not match `read_status`)
- `자동 클릭 제외 키워드`: comma-separated deny list; leave blank to disable keyword blocking
- `플러그인 자동 새로고침 주기(시간)`: how often the full plugin refresh runs by itself, in hours. Defaults to `0`, which means it only runs when you start it from the popup
- `자동 이어서 진행 기본값`: default for ChatGPT tabs without a per-tab override; sends the configured prompt after a newly generated response completes. Off by default
- `자동 입력 문구`: continuation prompt; defaults to `이어서 진행`
- `자동 이어서 진행 횟수`: maximum automatic sends (1–100) in one chain started by a manual user message

## Automatic Continuation

This opt-in feature reacts after a newly started response completes, using both generation state and manual form-submission signals. It does not submit for old responses present when the page opens or for rerenders of an already handled response, and it never overwrites text already in the composer.

The current response heading and completion controls are also recognized when author-role attributes are absent. After a new response finishes, the extension inserts its prompt and activates the composer's `보내기` button once. The popup shows progress, counts and errors; continuation failures persist in automation diagnostics from 0.5.12 onward without recording prompts or response content.

An unconfirmed send stops further automatic submissions. Submit a new message manually or toggle the feature off and on to resume watching.

Automatically generated follow-up responses stay in the same count. The chain stops at the configured maximum and resets when you manually send a new message. A top-right notice shows the current count after each confirmed automatic send and changes to a completion notice after the last follow-up response finishes.

The option-page checkbox is the default for tabs without an override. The popup's `이 탭 자동 이어서 진행` switch changes only the active ChatGPT tab. Its override survives page reloads in the same tab and is removed when the tab closes. Selecting the same value as the global default clears the override so the tab follows the default again.

## Automatic Plugin Refresh

ChatGPT only picks up a connector's new tool list after `새로 고침` is clicked on that plugin. This extension runs that whole sweep for you on an interval.

Manual and automatic runs skip opening entries with no visible tool-permission status by default. For a manual run, select `권한 표시 없는 앱도 확인 (느림)` in the popup to inspect every installed app. Each refresh button is clicked once, then the sweep immediately returns to the list and opens the next app. It checks screen transitions but does not wait for server completion. Results count clicks, not successful server refreshes. A disabled control, failed click or navigation error stops the sweep and is recorded in diagnostics.

An automatic run starts **only while the ChatGPT tab is in the background**, and stops the moment you switch back to it; the remaining plugins are picked up at the next idle window. The settings dialog never opens in front of you. Multiple ChatGPT tabs share the last-run timestamp, so the sweep runs once.

Successful automatic runs stay silent. Only failures raise a notice. The manual run from the popup still shows its completion notice.

From 0.5.11 onward, the latest 100 refresh and settings-navigation errors persist in Chrome local storage; 0.5.12 also records continuation errors. Open `자동화 진단 로그` in the extension's options to view or copy time, version, feature, phase, elapsed time and click count. Plugin records include plugin name and button state; continuation records include sent count and turn limit. Conversation content and MCP addresses are excluded. Storage failures are reported separately.

## How It Works

The content script runs only on:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

It scans visible buttons and looks for a nearby ChatGPT permission card. When a matching allow button is found, it dispatches pointer and mouse events before calling `button.click()`.

Version `0.2.0` changed the default deny keywords to blank. Earlier behavior could accidentally block real permission cards containing text such as `This will cancel...`.

## Limitations

This extension can click only buttons inside the webpage DOM. It cannot click:

- Chrome native permission prompts
- operating system dialogs
- extension install confirmations
- pages outside the declared ChatGPT host permissions

ChatGPT UI changes may require updates to the matching logic.

## Development

Run the local checks:

```bash
npm run check
```

Create a release ZIP:

```bash
npm run package
```

The ZIP is written to `dist/`.

## Repository Contents

- `manifest.json`: Chrome extension manifest
- `settings.js`: shared defaults, migration and value validation (content script, popup, options)
- `content.js`: ChatGPT permission-card detection and auto-click logic
- `options.html`, `options.css`, `options.js`: extension options page
- `popup.html`, `popup.css`, `popup.js`: toolbar popup and quick toggle
- `icons/`: extension icons
- `scripts/validate-manifest.js`: lightweight manifest validation
- `scripts/package-extension.js`: release ZIP packaging
- `.github/workflows/validate.yml`: GitHub Actions check

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Privacy

The extension does not collect or transmit user data. See [PRIVACY.md](PRIVACY.md).

## Security

See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
