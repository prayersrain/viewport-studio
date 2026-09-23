# Roadmap

This is the planned work, not a promise. Pick an item, open an issue to discuss it, then send a pull request.

## Next

- **Side-by-side devices.** Show several phones at once, with optional synced scrolling and navigation.
- **Screenshots.** Capture the screen area with or without the frame via `chrome.tabs.captureVisibleTab`. Full-page capture needs a separate approach.
- **Device library.** Add iPad, Galaxy, Pixel and small-laptop presets. Save custom devices in `storage.local`; custom sizes currently last only for the browser session.
- **Zoom to 100%.** Preview scale currently peaks at about 68%. Add a true-size mode and fit-to-window.
- **README media.** Add screenshots and a short GIF of the studio.

## Later

- **Accurate mode (opt-in).** Optional `chrome.debugger` emulation for touch, device pixel ratio and user agent. The debugging banner would appear only while the user has this mode on.
- **Mobile user agent.** Add a server-side user agent through a studio-scoped request header rule, and possibly patch it in the page.
- **Screen recording.** Capture the tab with `tabCapture` and `MediaRecorder`. The recorder produces WebM, so MP4 needs conversion.
- **Agent connection.** Let local coding agents (Claude Code, Codex) inspect or drive the preview through MCP.
- **Firefox support.**
- **Studio polish.** Add a dark theme, keyboard shortcuts and a rotation animation.
- **End-to-end tests in CI.** Use Playwright with Chromium or Chrome for Testing. Branded Chrome ignores `--load-extension`.

## Done

- 0.3.0: direct iframe mode without the debugger banner, single-tab toggle, English/Indonesian UI, header rules scoped to the studio tab.
