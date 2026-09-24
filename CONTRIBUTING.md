# Contributing

Thanks for helping keep Viewport free. Kontribusi dalam bahasa Indonesia juga diterima.

## Setup

1. Load the `extension` folder with **Load unpacked** on `chrome://extensions`, with Developer mode on.
2. After you change a file, click **Reload** on the extension card, then reopen the studio.
3. Run `npm test` and `npm run check` (Node.js 22 or newer, no install step).

## Ground rules

These keep the project small, safe and trustworthy. A pull request that breaks one of them needs a very good reason.

- **No build step and no runtime dependencies.** The `extension` folder is exactly what users load.
- **No network calls, analytics or remote code.**
- **Never use `chrome.debugger` in the default mode.** It brings back the debugging banner. A future opt-in "accurate mode" must stay opt-in.
- **Keep header changes scoped** to sub-frames in studio tabs (`tabIds` + `resourceTypes: ['sub_frame']`). Clean them up when the studio goes away.
- **`agent.js` runs in the page's own world.** It must stay inert unless its frame is a Studio device that asked for a phone agent, and its strings must match `userAgent()` in `core.js` (a test compares them).
- **`frame.js` must stay inert outside the studio.** It runs on every http(s) frame and must exit immediately unless its direct parent is the studio.
- **All UI colors go through the theme tokens** at the top of `studio.css`, so light and dark stay in step. Phone hardware and the website surface keep fixed colors.
- **Click and typing sync never copies password or file fields,** and only shares trusted user events.
- **All UI text goes through i18n.** Add each new key to `_locales/en` and `_locales/id`; the tests fail if a key is missing. Use `data-i18n` in HTML and `t('key')` in scripts.
- **Match the existing style:** plain ES modules, small functions and short comments that explain why.

## Manual checklist

Unit tests use mocked Chrome APIs, so please also check these in a real browser. [`docs/demo.html`](docs/demo.html) covers the tricky cases; serve the `docs` folder (for example `python -m http.server 8000`) and open `http://localhost:8000/demo.html`.

1. Click the icon on a website. The same tab becomes the studio and no debugging banner appears.
2. On a fresh install, **Allow website access** shows Chrome's permission dialog and the site loads after you approve it.
3. A site that sends `X-Frame-Options` (for example github.com) loads inside the phone.
4. Click, scroll, type, paste and navigate inside the phone. The address bar follows the page.
5. Presets, custom size and rotation update the page without a reload.
6. **＋** adds a device. Clicking a link or scrolling in one device follows in the others while sync is on.
7. **Save PNG** downloads the devices without the studio UI. **Copy** puts the same image on the clipboard. **Full page** on the demo shows the header once at the top and the orange order bar once at the bottom.
8. The link icon above a device takes it out of sync: it stays on its page while the others navigate.
9. With **Also sync clicks and typing** on, typing a name, changing the size and ticking **Oat milk** in the demo's order form updates the other devices. **Show pickup times** opens in all of them.
10. `?` lists the shortcuts; `R`, `0`, `F`, `T` and `1`–`4` work after clicking outside the phone. `Alt+Shift+V` toggles Viewport from a normal tab.
11. The header's theme button cycles auto, light and dark, and a forced theme survives a reload.
12. **User agent → iPhone** reloads the devices; a "what is my user agent" page shows iPhone Safari inside the Studio and your normal browser in a normal tab.
13. Reload the studio. Your devices, zoom and saved sizes are still there.
14. Clicking the icon again returns the tab to the last page. That site still refuses to be framed in a normal tab.

## Issues and pull requests

- Bug reports: include the URL (or a minimal page), Chrome version, steps and a screenshot.
- Keep each pull request to one change, describe how you tested it, and update the README when behavior or permissions change.
