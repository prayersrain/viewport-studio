// Browser tests: the real extension in Chromium (or Edge with VIEWPORT_E2E_CHANNEL=msedge).
// Run with `npm run e2e` after `npm install` and `npx playwright install chromium`.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path'), os = require('node:os'), fs = require('node:fs');
const { wait, until, startSite, openStudio, device, deviceWith, tap, dragIn, deviceBox, analysePng } = require('./helpers.cjs');
const SLOW = { timeout: 120000 };

async function session(t, options = {}) {
  const site = await startSite();
  const studio = await openStudio(site.origin + (options.path ?? '/'), options);
  t.after(async () => { await studio.context.close(); site.close(); });
  return { site, ...studio };
}
const lastRequest = (site, pathname) => [...site.requests].reverse().find(r => r.path === pathname);

test('direct mode frames a locked site inside Studio only, in the same tab', SLOW, async t => {
  const { site, page, worker, context } = await session(t);
  const phone = await deviceWith(page, 0, '#rail');
  assert.ok(phone, 'a page with X-Frame-Options: DENY and frame-ancestors none renders in the device');
  const metrics = await phone.evaluate(() => ({ width: innerWidth, height: innerHeight, gutter: innerWidth - document.documentElement.clientWidth }));
  assert.deepEqual(metrics, { width: 393, height: 852, gutter: 0 }, 'exact viewport, no desktop scrollbar');

  await page.fill('.address input', site.origin + '/csp-only'); await page.press('.address input', 'Enter');
  const kept = await deviceWith(page, 0, '#t', site.origin);
  assert.equal(await until(() => kept.textContent('#t')), 'csp-kept', 'a CSP without frame-ancestors still applies');

  const rules = await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules());
  assert.ok(rules.length >= 2 && rules.every(r => r.condition.tabIds?.length === 1), 'rules are scoped to the Studio tab');

  const normal = await context.newPage();
  await normal.goto(site.origin + '/embed'); await wait(800);
  const inner = normal.frames().find(f => f !== normal.mainFrame());
  assert.equal(await inner.$('#rail').catch(() => null), null, 'the same site still refuses framing in a normal tab');
  await normal.close();

  const tabs = context.pages().length;
  await page.click('#end-session');
  await page.waitForURL(url => url.protocol === 'http:');
  assert.equal(page.url(), site.origin + '/csp-only', 'Exit returns the same tab to the last page');
  assert.equal(context.pages().length, tabs, 'no extra tab or window');
  assert.equal((await until(async () => (await worker.evaluate(() => chrome.declarativeNetRequest.getSessionRules())).length === 0 || null)), true, 'rules are removed');
});

test('devices side by side: add, sync navigation and scroll, focus, rotate, save, persist', SLOW, async t => {
  const { page, site } = await session(t);
  await deviceWith(page, 0, '#rail');
  await page.click('.device[data-key="android"] + .device-add');
  const android = await deviceWith(page, 1, '#rail');
  assert.equal(await android.evaluate(() => innerWidth), 412);

  await tap(page, 0, '#next');
  assert.ok(await until(async () => (await device(page, 1))?.url().endsWith('?page=2')), 'navigation follows');
  await wait(600);
  const phone = await device(page, 0);
  await phone.evaluate(() => scrollTo(0, (document.scrollingElement.scrollHeight - innerHeight) / 2));
  const ratio = () => device(page, 1).then(f => f.evaluate(() => scrollY / (document.scrollingElement.scrollHeight - innerHeight)));
  assert.ok(await until(async () => Math.abs(await ratio() - 0.5) < 0.03), 'scroll follows as a fraction of page height');

  await page.click('.slot:nth-child(1) .slot-name');
  assert.equal(await page.textContent('#device-title'), 'iPhone · Standard');
  await page.click('#rotate-btn'); await wait(400);
  assert.equal(await (await device(page, 0)).evaluate(() => innerWidth), 852, 'rotate applies to the selected device');
  await page.click('#rotate-btn');

  await page.fill('#width', '344'); await page.fill('#height', '882'); await page.press('#height', 'Enter'); await page.locator('#height').blur();
  await page.fill('#device-name', 'Fold'); await page.click('#save-device-btn');
  await page.reload();
  await deviceWith(page, 1, '#rail');
  assert.deepEqual(await page.evaluate(() => [document.querySelectorAll('.slot').length, document.querySelector('#device-title').textContent]), [2, 'Fold'], 'devices and saved sizes persist');
  assert.ok(site.requests.length > 0);
});

test('screenshots: both devices on screen, and a full page with fixed bars once', SLOW, async t => {
  const { page, context } = await session(t);
  const phone = await deviceWith(page, 0, '#rail');
  await page.click('#shot-mode [data-mode="full"]');
  const height = await phone.evaluate(() => document.scrollingElement.scrollHeight);
  await phone.evaluate(() => scrollTo(0, 700)); await wait(300);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#shot-save')]);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'viewport-shot-')), download.suggestedFilename());
  await download.saveAs(file);
  assert.match(download.suggestedFilename(), /^viewport-iphone-standard-393x852-full-\d{8}-\d{6}\.png$/);
  const image = await analysePng(context, file, { header: [43, 29, 20], order: [201, 115, 59] });
  assert.ok(Math.abs(image.height / (image.width / 393) - height) < 4, `covers the whole page (${image.height}px for ${height} CSS px)`);
  assert.deepEqual([image.header.count, image.header.first < 3], [1, true], 'sticky header once, at the top');
  assert.deepEqual([image.order.count, image.order.first > image.height * 0.9], [1, true], 'fixed order bar once, at the bottom');
  assert.ok(Math.abs(await phone.evaluate(() => scrollY) - 700) < 2, 'reading position restored');

  await page.click('#shot-mode [data-mode="screen"]');
  await page.click('.device[data-key="android"] + .device-add');
  await deviceWith(page, 1, '#rail');
  const [both] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#shot-save')]);
  assert.match(both.suggestedFilename(), /^viewport-2-devices-/);
});

test('sync details: unlinked devices, inner scrollers, clicks, typing and full presses', SLOW, async t => {
  const { page, site } = await session(t);
  await deviceWith(page, 0, '#rail');
  await page.click('.device[data-key="android"] + .device-add');
  await deviceWith(page, 1, '#rail'); await wait(600);

  const phone = await device(page, 0), android = await device(page, 1);
  for (const frame of [phone, android]) await frame.evaluate(() => { document.querySelector('#rail').style.scrollSnapType = 'none'; });
  await phone.evaluate(() => { const rail = document.querySelector('#rail'); rail.scrollLeft = (rail.scrollWidth - rail.clientWidth) / 2; });
  assert.ok(await until(async () => Math.abs(await android.evaluate(() => { const r = document.querySelector('#rail'); return r.scrollLeft / (r.scrollWidth - r.clientWidth); }) - 0.5) < 0.03), 'a horizontal scroller follows');

  await page.click('#sync-input'); await wait(300);
  await tap(page, 0, '#order-name'); await page.keyboard.type('Ana', { delay: 40 });
  assert.equal(await until(() => android.evaluate(() => document.querySelector('#order-name').value === 'Ana' || null)), true, 'typing follows');
  await tap(page, 0, '#order-more');
  assert.equal(await until(() => android.evaluate(() => !document.querySelector('#pickup').hidden || null)), true, 'a button click follows');
  await tap(page, 0, '#size-guide');
  assert.equal(await until(() => android.evaluate(() => !document.querySelector('#guide').hidden || null)), true, 'a control that opens on pointer down follows');

  await page.click('.slot:nth-child(2) .slot-link');
  await page.click('.slot:nth-child(1) .slot-name');
  await tap(page, 0, '#next'); await wait(1500);
  assert.equal((await device(page, 1)).url(), site.origin + '/', 'an unlinked device keeps its page');
});

test('theme and keyboard shortcuts', SLOW, async t => {
  const { page } = await session(t);
  await deviceWith(page, 0, '#rail');
  const dark = () => page.evaluate(() => { const [r, g, b] = getComputedStyle(document.querySelector('.sidebar')).backgroundColor.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b < 60; });
  await page.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await dark(), true, 'auto follows a dark system');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.click('#theme'); await page.click('#theme');
  await page.reload(); await deviceWith(page, 0, '#rail');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'a forced theme survives reload');

  await page.locator('body').click({ position: { x: 700, y: 140 } });
  await page.keyboard.press('Shift+?');
  assert.equal(await page.evaluate(() => document.querySelector('#shortcuts').open), true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), undefined, 'T cycles back to auto');
  await page.keyboard.press('0');
  assert.equal(await page.textContent('#zoom'), '100%');
  await page.keyboard.press('/'); await page.keyboard.type('r');
  assert.equal(await page.evaluate(() => document.activeElement.matches('.address input')), true, 'letters type normally in fields');
});

test('user agent: server and page scripts agree, normal tabs untouched', SLOW, async t => {
  const { page, site, context } = await session(t, { path: '/ua' });
  const reloadWith = async (action, want) => {
    site.requests.length = 0; await action();
    return until(async () => { const frame = await deviceWith(page, 0, '#t', site.origin); return lastRequest(site, '/api') && (await frame.evaluate(() => navigator.userAgent)).includes(want) && frame; });
  };
  let frame = await reloadWith(() => page.click('#agent-segment [data-agent="iphone"]'), 'iPhone');
  assert.ok(frame, 'devices reload with the iPhone agent');
  assert.equal(lastRequest(site, '/ua').agent, await frame.evaluate(() => navigator.userAgent), 'the server sees what page scripts see');
  assert.equal(lastRequest(site, '/api').agent, lastRequest(site, '/ua').agent, 'subresource requests too');
  assert.equal(await frame.evaluate(() => navigator.userAgentData), undefined, 'no userAgentData, like Safari');
  assert.equal(lastRequest(site, '/ua').mobile, undefined, 'no client hints, like Safari');

  const normal = await context.newPage(); site.requests.length = 0;
  await normal.goto(site.origin + '/ua'); await until(() => lastRequest(site, '/api'));
  assert.doesNotMatch(lastRequest(site, '/ua').agent, /iPhone/, 'normal tabs keep the real agent');
  assert.doesNotMatch(await normal.evaluate(() => navigator.userAgent), /iPhone/);
  await normal.close();

  frame = await reloadWith(() => page.click('#agent-segment [data-agent="android"]'), 'Android');
  assert.ok(frame && await frame.evaluate(() => navigator.userAgentData.mobile === true));
  assert.deepEqual([lastRequest(site, '/ua').mobile, lastRequest(site, '/ua').platform], ['?1', '"Android"'], 'mobile client hints');
  frame = await reloadWith(() => page.click('#agent-segment [data-agent="desktop"]'), 'Mozilla');
  assert.doesNotMatch(lastRequest(site, '/ua').agent, /Android|iPhone/, 'desktop restores the real agent');
});

test('drag to scroll works like a finger and never clicks', SLOW, async t => {
  const { page, site } = await session(t);
  const phone = await deviceWith(page, 0, '#rail');
  const box = await deviceBox(page, 0);
  const scrollAt = selector => phone.evaluate(sel => { document.querySelector(sel).scrollIntoView({ block: 'center' }); return new Promise(r => setTimeout(() => r(scrollY), 300)); }, selector);

  // Drags stay on the device's screen, like a finger on glass.
  let from = await scrollAt('.art');
  const { scale } = await dragIn(page, 0, '.art', 0, -box.height * 0.4);
  await wait(900);
  const moved = await phone.evaluate(() => scrollY) - from, dragged = box.height * 0.4 / scale;
  assert.ok(moved >= dragged * 0.9, `page follows the drag and glides on (${Math.round(moved)}px for ${Math.round(dragged)}px dragged)`);

  await scrollAt('#rail');
  await dragIn(page, 0, '#rail .drink:nth-child(1)', -90, 3); await wait(900);
  assert.ok(await phone.evaluate(() => document.querySelector('#rail').scrollLeft) > 0, 'a sideways drag moves the carousel');

  await dragIn(page, 0, '#next', 0, -120); await wait(900);
  assert.equal((await device(page, 0)).url(), site.origin + '/', 'a drag that starts on a link does not open it');

  // Released outside the device: the page never sees pointerup, and must not stay in drag mode.
  await dragIn(page, 0, '.art', 0, -30, { releaseAt: { x: box.left + box.width / 2, y: box.top - 60 } });
  // Chrome may still route the release to the device (implicit capture); let any glide finish.
  await page.mouse.move(box.left + box.width / 2, box.top + box.height / 2, { steps: 5 }); await wait(1800);
  const settled = await phone.evaluate(() => scrollY);
  await page.mouse.move(box.left + box.width / 2, box.top + box.height / 2 - 100, { steps: 5 }); await wait(300);
  assert.equal(await phone.evaluate(() => scrollY), settled, 'moving without a pressed button does not scroll');
  assert.equal(await phone.evaluate(() => document.documentElement.dataset.viewportDrag), undefined, 'selection and cursor are unlocked');

  await tap(page, 0, '#next');
  assert.ok(await until(async () => (await device(page, 0)).url().endsWith('?page=2')), 'a plain click still opens links');

  await page.click('#drag');
  const again = await deviceWith(page, 0, '.art');
  from = await again.evaluate(() => { document.querySelector('.art').scrollIntoView({ block: 'center' }); return new Promise(r => setTimeout(() => r(scrollY), 300)); });
  await dragIn(page, 0, '.art', 0, -box.height * 0.3); await wait(600);
  assert.equal(await again.evaluate(() => scrollY), from, 'turning it off restores normal mouse behaviour');
});

test('record a device to video, cropped to the device', SLOW, async t => {
  const { page, context } = await session(t);
  const phone = await deviceWith(page, 0, '#rail');
  const box = await page.evaluate(() => { const r = document.querySelector('.slot-body').getBoundingClientRect(); return { width: r.width, height: r.height }; });
  await page.click('#record');
  assert.equal(await until(() => page.evaluate(() => document.querySelector('#record').classList.contains('recording') || null)), true, 'recording starts after the sharing prompt');
  // Chrome re-renders a captured tab at a higher scale when asked for more pixels than it crops,
  // and framed sites then lay out wider than their device. The site must keep its real width.
  await wait(1200);
  assert.equal(await phone.evaluate(() => innerWidth), 393, 'the site keeps the device width while recording');
  const recordingBox = await page.evaluate(() => { const r = document.querySelector('.slot-body').getBoundingClientRect(); return { width: r.width, height: r.height }; });
  assert.ok(recordingBox.height > box.height, 'devices grow to fill the window while recording, for a sharper video');
  // Frames are only encoded when something on screen changes.
  for (let i = 0; i < 20; i++) { await phone.evaluate(y => scrollTo(0, y), i * 60); await wait(200); }
  assert.match(await page.textContent('#record-label'), /\d\d:0[3-9]/, 'a running clock');
  assert.equal(await page.isVisible('#rec-bar'), true, 'a floating bar shows the clock and Stop');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#rec-stop')]);
  assert.match(download.suggestedFilename(), /^viewport-iphone-standard-393x852-\d{8}-\d{6}\.(mp4|webm)$/);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'viewport-video-')), download.suggestedFilename());
  await download.saveAs(file);
  const viewer = await context.newPage();
  const video = await viewer.evaluate(async ([data, type]) => {
    const element = document.createElement('video'); element.muted = true; element.src = `data:${type};base64,${data}`;
    await new Promise((resolve, reject) => { element.onloadedmetadata = resolve; element.onerror = () => reject(Error('cannot decode')); });
    return { width: element.videoWidth, height: element.videoHeight };
  }, [fs.readFileSync(file).toString('base64'), file.endsWith('.mp4') ? 'video/mp4' : 'video/webm']);
  await viewer.close();
  const ratio = video.width / video.height, expected = recordingBox.width / recordingBox.height;
  assert.ok(Math.abs(ratio - expected) / expected < 0.06, `cropped to the device (${video.width}x${video.height} for a ${Math.round(recordingBox.width)}x${Math.round(recordingBox.height)} device)`);
  assert.ok(video.height >= recordingBox.height * 0.95, 'recorded at the enlarged size');
  assert.equal(await phone.evaluate(() => innerWidth), 393);
  assert.equal(await page.evaluate(() => document.querySelector('#record').classList.contains('recording')), false);
});
