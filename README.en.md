# ChatGPT Auto Allow Tool

[한국어](README.md)

[![Validate](https://github.com/JS190-prog/chatgpt-auto-allow-tool/actions/workflows/validate.yml/badge.svg)](https://github.com/JS190-prog/chatgpt-auto-allow-tool/actions/workflows/validate.yml)

A small Chrome extension that automatically clicks Korean or English allow buttons on ChatGPT tool permission cards.

This is an unofficial tool and is not affiliated with OpenAI.

It was built for permission cards like:

- `허용하기`
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
- `허용할 도구 이름`: comma-separated allow list; leave blank to allow every matching permission card
- `자동 클릭 제외 키워드`: comma-separated deny list; leave blank to disable keyword blocking

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
