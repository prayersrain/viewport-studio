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
- **`frame.js` must stay inert outside the studio.** It runs on every http(s) frame and must exit immediately unless its direct parent is the studio.
- **All UI text goes through i18n.** Add each new key to `_locales/en` and `_locales/id`; the tests fail if a key is missing. Use `data-i18n` in HTML and `t('key')` in scripts.
- **Match the existing style:** plain ES modules, small functions and short comments that explain why.

## Manual checklist

Unit tests use mocked Chrome APIs, so please also check these in a real browser:

1. Click the icon on a website. The same tab becomes the studio and no debugging banner appears.
2. On a fresh install, **Allow website access** shows Chrome's permission dialog and the site loads after you approve it.
3. A site that sends `X-Frame-Options` (for example github.com) loads inside the phone.
4. Click, scroll, type, paste and navigate inside the phone. The address bar follows the page.
5. Presets, custom size and rotation update the page without a reload.
6. Clicking the icon again returns the tab to the last page. That site still refuses to be framed in a normal tab.

## Issues and pull requests

- Bug reports: include the URL (or a minimal page), Chrome version, steps and a screenshot.
- Keep each pull request to one change, describe how you tested it, and update the README when behavior or permissions change.
