# Viewport — Mobile Preview Studio

A free, open-source Chrome extension for previewing websites at phone sizes inside a device frame. It works right in your browser tab, without a separate app, account, server or paid plan.

[Bahasa Indonesia](README.id.md)

- **No debugger banner.** The site loads in a real iframe, so Chrome does not show "started debugging this browser".
- **One tab.** The toolbar icon turns the current tab into the studio and back again. It does not open extra tabs or popup windows.
- **Real interaction.** Click, scroll, type, paste, use IME, file pickers and the Back button directly on the phone screen.
- **Instant resize.** Switch presets, set custom sizes and rotate without reloading the page.
- **Private by design.** No network calls, analytics, remote code or build step.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension` folder.

Requires Chrome 128 or newer. Chromium-based browsers such as Edge should also work.

## Use

1. Open the website or `localhost` page you want to test, then click the Viewport icon.
2. The first time, click **Allow website access** and approve Chrome's dialog. You only need to do this once.
3. Type other addresses in the studio's address bar, or navigate inside the phone.
4. Click the icon again, or **Exit Viewport**, to return the tab to the last page you visited.

## How it works

Most websites refuse to be shown inside an iframe (`X-Frame-Options`, CSP `frame-ancestors`). Viewport uses [`declarativeNetRequest`](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest) session rules to remove those headers **only for sub-frames inside the studio tab**. Other tabs keep every site's framing protection. Viewport removes the rules when you leave the studio, navigate the tab elsewhere or close it. It removes CSP only when the policy contains `frame-ancestors`.

A small content script (`frame.js`) runs only when its direct parent is the studio (checked through `location.ancestorOrigins`). It hides desktop scrollbars, which would otherwise take about 15px of layout width, and reports the page URL to the studio. It exits immediately on every other page.

| Permission | Why |
|---|---|
| `activeTab` | Read the URL of the tab where you clicked the icon. |
| `storage` | Keep the studio state (URL, size) for the browser session. |
| `scripting` | Register `frame.js`. |
| `declarativeNetRequestWithHostAccess` | Apply the studio-only framing rules. |
| `http://*/*`, `https://*/*` (optional) | Requested once from the studio. It covers framing, login cookies inside the frame and `frame.js`. |

## Limitations

- Only the CSS viewport size matches the device. Device pixel ratio, touch events, `navigator.userAgent` and the `hover`/`pointer` media features stay desktop values. iPhone presets still use Chrome's engine, not Safari.
- Pages without a viewport meta tag render at device width instead of the zoomed-out 980px layout that mobile browsers use.
- Inside the preview, Viewport ignores a site's CSP when that CSP contains `frame-ancestors`. Test CSP-related issues in a normal tab.
- Chrome blocks plain `http://` addresses other than localhost (such as `http://192.168.x.x`) as mixed content. Use `localhost`, `127.0.0.1` or https.
- A framebusting script that runs after a user click can take over the tab.

See [ROADMAP.md](ROADMAP.md) for planned features.

## Development

There is no build step and there are no dependencies. You need Node.js 22 or newer to run the checks.

```bash
npm test
```

```bash
npm run check
```

The tests cover URL and size validation, session ownership, rule scoping and cleanup, the `frame.js` gate, and translation coverage, all against mocked Chrome APIs. They cannot prove that the extension works in a real browser. After changes, reload the extension and run the manual checklist in [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. To report a security issue, follow [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
