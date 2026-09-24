# Roadmap

This is the planned work, not a promise. Pick an item, open an issue to discuss it, then send a pull request.

## Next

- **Accurate mode (opt-in).** Optional `chrome.debugger` emulation for touch, device pixel ratio and user agent. The debugging banner would appear only while the user has this mode on.
- **Mobile user agent.** Add a server-side user agent through a studio-scoped request header rule, and possibly patch it in the page.
- **Pointer replay.** Replay pointer and mouse-down events, not only clicks, so more menus and sliders follow in click sync.

## Later

- **Screen recording.** Capture the tab with `tabCapture` and `MediaRecorder`. The recorder produces WebM, so MP4 needs conversion.
- **Agent connection.** Let local coding agents (Claude Code, Codex) inspect or drive the preview through MCP.
- **Firefox support.**
- **Rotation animation.**
- **End-to-end tests in CI.** Use Playwright with Chromium or Chrome for Testing. Branded Chrome ignores `--load-extension`.

## Done

- 0.6.0: keyboard shortcuts and a global toggle, dark theme, experimental click and typing sync, animated README demo.
- 0.5.0: full-page screenshots, inner scroll sync, per-device unlink, demo site and README images.
- 0.4.0: side-by-side devices with synced navigation and scroll, screenshots, ten presets and saved custom sizes, fit and true-size zoom.
- 0.3.0: direct iframe mode without the debugger banner, single-tab toggle, English/Indonesian UI, header rules scoped to the studio tab.
