// Shared plumbing for the browser tests: a local test site, a copy of the extension with
// host access pre-granted (automation cannot click Chrome's permission prompt), and
// helpers that click and drag inside a scaled device with real mouse events.
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DEMO = fs.readFileSync(path.join(ROOT, 'docs', 'demo.html'));
// Playwright's "chromium" channel is new headless, which loads extensions. Branded Chrome ignores --load-extension.
const CHANNEL = process.env.VIEWPORT_E2E_CHANNEL || 'chromium';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    try { const value = await check(); if (value) return value; } catch { /* not ready yet */ }
    if (Date.now() > end) return null;
    await wait(100);
  }
}

// Every page refuses framing, so each test proves the Studio rules are in effect.
function startSite() {
  const requests = [];
  const locked = { 'content-type': 'text/html', 'x-frame-options': 'DENY', 'content-security-policy': "frame-ancestors 'none'" };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://site');
    requests.push({ path: url.pathname, agent: req.headers['user-agent'], mobile: req.headers['sec-ch-ua-mobile'], platform: req.headers['sec-ch-ua-platform'], brands: req.headers['sec-ch-ua'] });
    if (url.pathname === '/api') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
    if (url.pathname === '/ua') { res.writeHead(200, locked); return res.end('<h1 id=t>ua</h1><script>fetch("/api")</script>'); }
    if (url.pathname === '/csp-only') {
      // No frame-ancestors: this CSP must survive, so the inline script stays blocked.
      res.writeHead(200, { 'content-type': 'text/html', 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "script-src 'none'" });
      return res.end('<h1 id=t>csp-kept</h1><script>document.getElementById("t").textContent = "csp-stripped"</script>');
    }
    if (url.pathname === '/embed') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(`<iframe src="/"></iframe>`); }
    res.writeHead(200, locked); res.end(DEMO);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ origin: `http://127.0.0.1:${server.address().port}`, requests, close: () => server.close() })));
}

let extensionCopy;
function extensionWithAccess() {
  if (extensionCopy) return extensionCopy;
  extensionCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'viewport-ext-'));
  fs.cpSync(path.join(ROOT, 'extension'), extensionCopy, { recursive: true });
  const file = path.join(extensionCopy, 'manifest.json'), manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.host_permissions = manifest.optional_host_permissions; delete manifest.optional_host_permissions;
  fs.writeFileSync(file, JSON.stringify(manifest));
  return extensionCopy;
}

// A fresh profile per test keeps stored devices and themes from leaking between tests.
async function openStudio(url, { viewport = { width: 1440, height: 900 }, prefs } = {}) {
  const extension = extensionWithAccess();
  const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'viewport-profile-')), {
    channel: CHANNEL, headless: true, viewport, acceptDownloads: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--auto-accept-this-tab-capture'],
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  if (prefs) await worker.evaluate(value => chrome.storage.local.set({ prefs: value }), prefs);
  const id = new URL(worker.url()).host, page = await context.newPage();
  await page.goto(`chrome-extension://${id}/studio.html?url=${encodeURIComponent(url)}`);
  return { context, worker, page, id };
}

// Device frames are found by name, which Studio gives each iframe.
async function device(page, index, origin) {
  const name = await page.evaluate(i => document.querySelectorAll('.live-screen')[i]?.name, index);
  for (const frame of page.frames()) {
    if (origin && !frame.url().startsWith(origin)) continue;
    if (name && await frame.evaluate(() => window.name).catch(() => null) === name) return frame;
  }
  return null;
}
const deviceWith = (page, index, selector, origin) => until(async () => { const frame = await device(page, index, origin); return frame && await frame.$(selector) && frame; });

// Screen position of a point inside a scaled device, for real (trusted) mouse input.
async function toScreen(page, index, frame, selector) {
  await frame.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center' }), selector);
  await wait(250);
  const box = await page.evaluate(i => { const el = document.querySelectorAll('.live-screen')[i], r = el.getBoundingClientRect(); return { x: r.left, y: r.top, scale: r.width / el.offsetWidth }; }, index);
  const at = await frame.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, selector);
  return { x: box.x + at.x * box.scale, y: box.y + at.y * box.scale, scale: box.scale };
}
async function tap(page, index, selector) {
  const frame = await deviceWith(page, index, selector);
  const point = await toScreen(page, index, frame, selector);
  await page.mouse.click(point.x, point.y);
}
async function dragIn(page, index, selector, dx, dy, { steps = 12, releaseAt } = {}) {
  const frame = await deviceWith(page, index, selector);
  const start = await toScreen(page, index, frame, selector);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps });
  if (releaseAt) await page.mouse.move(releaseAt.x, releaseAt.y, { steps: 4 });
  await page.mouse.up();
  return { ...start, frame };
}
// Where a device sits on screen, to keep a drag inside it or to leave it on purpose.
const deviceBox = (page, index) => page.evaluate(i => { const r = document.querySelectorAll('.live-screen')[i].getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }, index);

// PNG size and full-width colour bands, read in the browser so no image library is needed.
async function analysePng(context, file, colours) {
  const page = await context.newPage();
  try {
    return await page.evaluate(async ([data, colours]) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      const canvas = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      const bands = rgb => {
        let count = 0, last = -1000, first = -1;
        for (let y = 0; y < image.height; y++) {
          let hits = 0;
          for (let x = 0; x < image.width; x += 4) { const i = (y * image.width + x) * 4; if ([0, 1, 2].every(c => Math.abs(pixels[i + c] - rgb[c]) < 14)) hits++; }
          // Text inside a bar splits its rows; rows within 80px belong to the same band.
          if (hits > image.width / 4 * 0.8) { if (y - last > 80) { count++; if (first < 0) first = y; } last = y; }
        }
        return { count, first };
      };
      return { width: image.width, height: image.height, ...Object.fromEntries(Object.entries(colours).map(([name, rgb]) => [name, bands(rgb)])) };
    }, [fs.readFileSync(file).toString('base64'), colours]);
  } finally { await page.close(); }
}

module.exports = { wait, until, startSite, openStudio, device, deviceWith, tap, dragIn, deviceBox, analysePng };
