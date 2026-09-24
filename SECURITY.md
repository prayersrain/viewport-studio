# Security

Viewport removes anti-framing headers and holds broad host access, so security reports matter.

## Reporting

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository. Do not open a public issue. Include the steps to reproduce and the Chrome version.

## In scope

- Framing rules that apply outside a studio tab, or that survive after leaving the studio.
- `frame.js` or `agent.js` behavior on pages that are not directly inside the studio.
- The user-agent rule applying to requests outside the Studio tab.
- Web pages or other extensions that can send commands to the studio or background worker.
- Any way to exfiltrate data from pages shown in the studio.
- Click and typing sync copying password or file fields, replaying synthetic (untrusted) events, or reaching pages outside the studio's own devices.

## Known trade-offs (not vulnerabilities)

- Inside the studio, a site's `X-Frame-Options` is removed, and so is its CSP when it contains `frame-ancestors`. This is how the preview works; see the README.
- The optional host permission is `<all_urls>`, so that navigation and login inside the phone keep working and screenshots can use `captureVisibleTab`. `frame.js` itself only runs on http(s) pages.
