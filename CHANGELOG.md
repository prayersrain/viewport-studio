# Changelog

## 0.5.0

- Full-page screenshots of the selected device. The page scrolls one screen at a time; fixed top bars and stuck headers appear once at the top, and fixed bottom bars once at the bottom. The reader's scroll position is restored afterwards.
- Scroll sync now covers inner scroll areas such as carousels and side panels, matched by id or position in the page.
- Each device has a link toggle. An unlinked device keeps its own page and scroll position, and the address bar only drives synced devices.
- Screenshots refuse to run when the Viewport tab is not in front, instead of capturing another tab.
- `docs/demo.html`, a fictional responsive site for testing, and README screenshots.

## 0.4.0

- Compare up to 4 devices side by side. Navigation and scrolling sync across devices (toggleable), and a redirect-loop guard stops devices from chasing each other.
- Screenshots: save a PNG or copy it to the clipboard, with or without the frame, covering every device on the canvas.
- Ten presets in Phones, Tablets and Desktop groups, plus named custom sizes saved in `storage.local`. Devices, layout, zoom and sync settings now survive browser restarts.
- Zoom: fit to window, or step through fixed sizes up to 150%, including true size (100%).
- The optional host permission is now `<all_urls>` because `captureVisibleTab` requires it. Click **Allow website access** once more after updating.
- `frame.js` talks to the studio over a private port instead of broadcast messages. The background worker only accepts messages from the studio.

## 0.3.0

- Websites now load in an iframe inside the phone frame, so Chrome no longer shows the debugging banner.
- The `debugger` and `tabCapture` permissions are gone. Header rules apply only to sub-frames in the studio tab.
- The toolbar icon toggles the current tab between the website and the studio. No extra tab or popup window opens.
- Clicking, scrolling, typing, pasting and navigating now work directly, and resizing no longer reloads the page.
- Added an English and Indonesian UI (English is the fallback), icons and an open-source license.

## 0.1.0 – 0.2.2

- First versions used `chrome.debugger` emulation (device metrics, touch, DPR) and streamed the tab as video through `tabCapture`. That design always showed Chrome's debugging banner and moved the source tab into a separate popup window.
