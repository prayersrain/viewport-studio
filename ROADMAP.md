# Roadmap

This is the planned work, not a promise. Pick an item, open an issue to discuss it, then send a pull request.

## Next

- **Demo GIF.** A short clip of adding a device and scrolling in sync for the README.
- **Keyboard shortcuts.** Rotate, zoom, screenshot and switch devices without the mouse.
- **Dark theme** for the studio.
- **Sync clicks and form input** between devices, for testing flows once instead of per device.

## Later

- **Accurate mode (opt-in).** Optional `chrome.debugger` emulation for touch, device pixel ratio and user agent. The debugging banner would appear only while the user has this mode on.
- **Mobile user agent.** Add a server-side user agent through a studio-scoped request header rule, and possibly patch it in the page.
- **Screen recording.** Capture the tab with `tabCapture` and `MediaRecorder`. The recorder produces WebM, so MP4 needs conversion.
- **Agent connection.** Let local coding agents (Claude Code, Codex) inspect or drive the preview through MCP.
- **Firefox support.**
- **Rotation animation.**
- **End-to-end tests in CI.** Use Playwright with Chromium or Chrome for Testing. Branded Chrome ignores `--load-extension`.

## Done

- 0.5.0: full-page screenshots, inner scroll sync, per-device unlink, demo site and README images.
- 0.4.0: side-by-side devices with synced navigation and scroll, screenshots, ten presets and saved custom sizes, fit and true-size zoom.
- 0.3.0: direct iframe mode without the debugger banner, single-tab toggle, English/Indonesian UI, header rules scoped to the studio tab.
