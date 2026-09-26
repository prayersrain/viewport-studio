# Roadmap

This is the planned work, not a promise. Pick an item, open an issue to discuss it, then send a pull request.

## Next

- **Agent connection.** Let local coding agents (Claude Code, Codex) inspect or drive the preview through MCP.
- **Firefox support.**
- **Rotation animation.**

## On hold

- **Per-device user agent.** Chrome's request rules can target a tab but not a single frame, so today every device in the Studio shares one agent.
- **Accurate mode (touch, device pixel ratio via `chrome.debugger`).** Chrome does not allow `debugger` as an optional permission, so shipping it would put the debugger warning on every install, even for people who never use it. It could live in a separate build.

## Done

- 1.0.0: first stable release after a code, docs and accessibility review.
- 0.9.0: video recording cropped to the devices, without new permissions.
- 0.8.0: drag to scroll, browser tests in the repo and in CI.
- 0.7.0: mobile user agent (header, client hints and page scripts), full-press click replay.
- 0.6.0: keyboard shortcuts and a global toggle, dark theme, experimental click and typing sync, animated README demo.
- 0.5.0: full-page screenshots, inner scroll sync, per-device unlink, demo site and README images.
- 0.4.0: side-by-side devices with synced navigation and scroll, screenshots, ten presets and saved custom sizes, fit and true-size zoom.
- 0.3.0: direct iframe mode without the debugger banner, single-tab toggle, English/Indonesian UI, header rules scoped to the studio tab.
