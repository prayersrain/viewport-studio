# Changelog

## 0.3.0

- Websites now load in an iframe inside the phone frame, so Chrome no longer shows the debugging banner.
- The `debugger` and `tabCapture` permissions are gone. Header rules apply only to sub-frames in the studio tab.
- The toolbar icon toggles the current tab between the website and the studio. No extra tab or popup window opens.
- Clicking, scrolling, typing, pasting and navigating now work directly, and resizing no longer reloads the page.
- Added an English and Indonesian UI (English is the fallback), icons and an open-source license.

## 0.1.0 – 0.2.2

- First versions used `chrome.debugger` emulation (device metrics, touch, DPR) and streamed the tab as video through `tabCapture`. That design always showed Chrome's debugging banner and moved the source tab into a separate popup window.
