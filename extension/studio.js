import { PRESETS, MAX_DEVICES, MAX_CANVAS, ACCESS, viewport, webUrl, presetFor, deviceBox, fitScale, stepZoom, cropRect, strips, cleanPrefs, cleanSaved } from './core.js';
import { t, localize } from './i18n.js';
import { observePreviewWidth } from './layout.js';
const $ = selector => document.querySelector(selector);
const GAP = 28; // screen px between devices; must match .phone-space gap
const GROUPS = { phone: 'groupPhone', tablet: 'groupTablet', desktop: 'groupDesktop', saved: 'groupSaved' };
const params = new URLSearchParams(location.search);
// Device layout lives in storage.local (survives restarts); the page URL lives in the background session.
const state = { focus: 0, frame: true, sync: true, syncInput: false, zoom: 'fit', shot: 'screen' };
let slots = [], saved = [], ready = false, tabId, scale = 1, siteUrl = '', capturing = false, cutShort = false, slotCount = 0;

localize();
if (globalThis.chrome?.i18n) document.documentElement.lang = t('lang');
$('#version-note').textContent = t('versionNote', globalThis.chrome?.runtime?.getManifest?.().version || 'dev');
async function send(type, data = {}) {
  if (!globalThis.chrome?.runtime?.sendMessage) throw Error(t('errorNotExtension'));
  const result = await chrome.runtime.sendMessage({ type, ...data });
  if (!result?.ok) throw Error(result?.error || t('errorNoResponse'));
  return result.value;
}
function status(message, error = false) { $('#status').textContent = message; $('#status').classList.toggle('status-error', error); }
function error(e) { status(e.message, true); }
const focused = () => slots[state.focus];
const describe = key => PRESETS[key] || saved.find(device => device.id === key) || { name: t('customViewport') };
const frameOf = slot => describe(slot.key).frame || 'generic';
// A saved device keeps its name when its size is typed in again.
const keyFor = size => presetFor(size) !== 'custom' ? presetFor(size) : saved.find(d => (d.width === size.width && d.height === size.height) || (d.width === size.height && d.height === size.width))?.id || 'custom';
function storePrefs() {
  const prefs = { devices: slots.map(({ key, size, linked }) => ({ key, ...size, linked })), focus: state.focus, frame: state.frame, sync: state.sync, syncInput: state.syncInput, zoom: state.zoom, shot: state.shot };
  globalThis.chrome?.storage?.local.set({ prefs }).catch(() => {});
}

// ---- Devices on the stage ----
function createSlot({ key, width, height, linked = true }) {
  const element = $('#slot-template').content.firstElementChild.cloneNode(true);
  localize(element);
  const slot = { id: `viewport-${Date.now().toString(36)}-${slotCount++}`, key, size: viewport({ width, height }), element,
    body: element.querySelector('.slot-body'), phone: element.querySelector('.phone'), iframe: element.querySelector('iframe'),
    overlay: element.querySelector('.connection-overlay'), host: element.querySelector('.site-host'), url: '', following: false, frameId: null, port: null, linked };
  // frame.js reads this name to tell Studio which device it belongs to.
  slot.iframe.name = slot.id;
  slot.iframe.addEventListener('load', () => { if (slot.url) loaded(slot); });
  // Clicking into a device (its frame gets focus) makes it the one the inspector edits.
  slot.iframe.addEventListener('focus', () => focusSlot(slot));
  element.addEventListener('pointerdown', () => focusSlot(slot));
  element.querySelector('.slot-close').onclick = event => { event.stopPropagation(); removeSlot(slot); };
  // An unlinked device keeps its own page and scroll position.
  element.querySelector('.slot-link').onclick = () => { slot.linked = !slot.linked; geometry(); storePrefs(); syncFrames(); };
  return slot;
}
function focusSlot(slot) {
  const index = slots.indexOf(slot);
  if (index < 0 || index === state.focus) return;
  state.focus = index; geometry(); storePrefs();
  if (slot.url) { urlLabel(slot.url); send('track', { url: slot.url }).catch(() => {}); }
}
function addSlot(device) {
  if (slots.length >= MAX_DEVICES) return status(t('maxDevices'), true);
  const url = focused()?.url || siteUrl, slot = createSlot(device);
  slots.push(slot); $('#stage').append(slot.element);
  state.focus = slots.length - 1; geometry(); storePrefs(); syncFrames();
  if (ready && url) loadSlot(slot, url);
  else overlay(slot, $('#grant').hidden ? t('overlayEmpty') : t('overlayGrant'));
}
function removeSlot(slot) {
  if (slots.length < 2) return;
  const keep = focused() === slot ? null : focused();
  try { slot.port?.disconnect(); } catch { /* already gone */ }
  slot.element.remove(); slots.splice(slots.indexOf(slot), 1);
  state.focus = keep ? slots.indexOf(keep) : Math.min(state.focus, slots.length - 1);
  geometry(); storePrefs(); syncFrames();
  if (focused().url) urlLabel(focused().url);
}
function setDevice(key, device) {
  const slot = focused(); slot.key = key; slot.size = viewport(device); geometry(); storePrefs();
}
function resizeFocused(next, key) {
  try { next = viewport(next); } catch (e) { geometry(); return error(e); }
  const slot = focused(); slot.size = next; slot.key = key ?? keyFor(next); geometry(); storePrefs();
}

// ---- Layout ----
// Devices scale together; "fit" picks the largest scale that shows them all.
function geometry(bounds) {
  const stage = $('#stage'), multi = slots.length > 1;
  stage.classList.toggle('multi', multi);
  const framed = state.frame && !bounds?.plain;
  const boxes = slots.map(slot => deviceBox(slot.size, frameOf(slot), framed));
  if (bounds) scale = fitScale(bounds.only ? [boxes[slots.indexOf(bounds.only)]] : boxes, bounds.width, bounds.height, GAP);
  else if (state.zoom === 'fit') {
    const top = stage.getBoundingClientRect().top + scrollY;
    scale = fitScale(boxes, stage.clientWidth - 32, Math.max(320, innerHeight - top - (multi ? 150 : 120)), GAP);
  } else scale = state.zoom;
  slots.forEach((slot, index) => {
    const box = boxes[index], kind = frameOf(slot);
    // The slot is exactly as wide as the scaled device; its caption truncates instead of widening it.
    slot.element.style.width = box.width * scale + 'px';
    Object.assign(slot.body.style, { width: box.width * scale + 'px', height: box.height * scale + 'px' });
    Object.assign(slot.phone.style, { width: box.width + 'px', height: box.height + 'px', transform: `scale(${scale})` });
    slot.phone.classList.toggle('landscape', slot.size.width > slot.size.height);
    slot.phone.classList.toggle('plain', !framed);
    slot.phone.classList.toggle('android', kind === 'android');
    slot.phone.classList.toggle('custom-device', kind === 'generic');
    slot.phone.classList.toggle('screen-frame', kind === 'screen');
    slot.element.classList.toggle('focused', index === state.focus);
    slot.element.classList.toggle('unlinked', !slot.linked);
    const link = slot.element.querySelector('.slot-link');
    link.setAttribute('aria-pressed', String(slot.linked)); link.title = t(slot.linked ? 'linkOn' : 'linkOff'); link.setAttribute('aria-label', link.title);
    const name = slot.element.querySelector('.slot-name');
    name.textContent = name.title = `${describe(slot.key).name} · ${slot.size.width}×${slot.size.height}`;
  });
  const slot = focused(), landscape = slot.size.width > slot.size.height;
  $('#device-title').textContent = describe(slot.key).name;
  $('#device-subtitle').textContent = `${slot.size.width} × ${slot.size.height} CSS px · ${t(landscape?'landscape':'portrait')}`;
  if (document.activeElement !== $('#width')) $('#width').value = slot.size.width;
  if (document.activeElement !== $('#height')) $('#height').value = slot.size.height;
  $('#zoom').textContent = (state.zoom === 'fit' ? t('zoomFit') + ' · ' : '') + Math.round(scale * 100) + '%';
  $('#canvas-caption').textContent = t(state.frame?'frameOn':'contentOnly');
  $('#save-device').hidden = slot.key !== 'custom';
  $('#sync').disabled = !multi;
  $('#sync-input').disabled = !multi || !state.sync;
  markDevices();
}
function markDevices() {
  const keys = new Set(slots.map(slot => slot.key)), full = slots.length >= MAX_DEVICES;
  for (const button of document.querySelectorAll('.device')) {
    const chosen = button.dataset.key === focused()?.key;
    button.classList.toggle('selected', chosen); button.classList.toggle('in-use', !chosen && keys.has(button.dataset.key));
    button.setAttribute('aria-pressed', String(chosen));
  }
  for (const button of document.querySelectorAll('.device-add:not(.device-delete)')) button.disabled = full;
}
function renderDevices() {
  const list = $('#devices'), groups = {};
  for (const [key, device] of Object.entries(PRESETS)) (groups[device.group] ||= []).push([key, device]);
  groups.saved = saved.map(device => [device.id, device]);
  list.replaceChildren();
  for (const [group, entries] of Object.entries(groups)) {
    if (!entries.length) continue;
    const label = document.createElement('div');
    label.className = 'eyebrow group-label'; label.textContent = t(GROUPS[group]);
    list.append(label, ...entries.map(([key, device]) => deviceRow(key, device, group)));
  }
  markDevices();
}
function deviceRow(key, device, group) {
  const row = document.createElement('div'), pick = document.createElement('button'), add = document.createElement('button');
  row.className = 'device-row';
  pick.className = 'device'; pick.dataset.key = key;
  pick.innerHTML = '<span class="device-icon"></span><span><b></b><small></small></span>';
  pick.querySelector('.device-icon').dataset.group = group;
  pick.querySelector('b').textContent = device.name;
  pick.querySelector('small').textContent = `${device.width} × ${device.height}`;
  pick.onclick = () => setDevice(key, device);
  add.className = 'device-add'; add.textContent = '＋'; add.title = t('addDevice'); add.setAttribute('aria-label', `${t('addDevice')}: ${device.name}`);
  add.onclick = () => addSlot({ key, width: device.width, height: device.height });
  row.append(pick, add);
  if (group === 'saved') {
    const remove = document.createElement('button');
    remove.className = 'device-add device-delete'; remove.textContent = '×'; remove.title = t('deleteSaved'); remove.setAttribute('aria-label', `${t('deleteSaved')}: ${device.name}`);
    remove.onclick = () => deleteSaved(key);
    row.append(remove);
  }
  return row;
}
function saveDevice() {
  const slot = focused(), name = $('#device-name').value.trim().slice(0, 40) || `${slot.size.width}×${slot.size.height}`;
  const device = { id: 'saved-' + Date.now().toString(36), name, ...slot.size };
  saved = cleanSaved([...saved, device]);
  chrome.storage.local.set({ savedDevices: saved }).catch(error);
  slot.key = device.id; $('#device-name').value = '';
  renderDevices(); geometry(); storePrefs();
}
function deleteSaved(id) {
  saved = saved.filter(device => device.id !== id);
  chrome.storage.local.set({ savedDevices: saved }).catch(error);
  for (const slot of slots) if (slot.key === id) slot.key = 'custom';
  renderDevices(); geometry(); storePrefs();
}

// ---- Pages inside the devices ----
function overlay(slot, message) { slot.overlay.hidden = !message; slot.overlay.textContent = message || ''; }
function urlLabel(url) {
  if (document.activeElement !== $('.address input')) $('.address input').value = url;
}
function loaded(slot) {
  overlay(slot, '');
  if (ready && slot === focused()) status(t('statusReady'));
}
// following: the next report from this device is the result of this load, not a user action to mirror.
function loadSlot(slot, url, following = true) {
  slot.url = url; slot.following = following;
  try { slot.host.textContent = new URL(url).host; } catch { /* keep previous host */ }
  if (slot === focused()) urlLabel(url);
  overlay(slot, t('loading')); slot.iframe.src = url;
}
// The address bar drives the selected device and every device synced with it.
function loadAll(url, everyone = false) {
  siteUrl = url;
  const origin = focused();
  for (const slot of slots) if (everyone || slot === origin || (state.sync && origin.linked && slot.linked)) loadSlot(slot, url);
  send('track', { url }).catch(() => {});
}
// A site that redirects differently per width could make devices chase each other forever.
const recentSync = new Map();
function recentlySynced(url) {
  const now = Date.now();
  for (const [seen, at] of recentSync) if (now - at > 3000) recentSync.delete(seen);
  if (recentSync.has(url)) return true;
  recentSync.set(url, now); return false;
}
function reported(slot, value) {
  let url;
  try { url = webUrl(value); } catch { return; }
  const followed = slot.following;
  slot.following = false; slot.url = url;
  slot.host.textContent = new URL(url).host;
  loaded(slot);
  if (slot === focused()) { urlLabel(url); send('track', { url }).catch(() => {}); }
  if (!shares(slot) || followed || recentlySynced(url)) return;
  for (const other of slots) if (other !== slot && other.linked && other.url !== url) loadSlot(other, url);
}
const post = (slot, message) => { try { slot.port?.postMessage(message); } catch { slot.port = null; } };
const shares = slot => state.sync && slot.linked && slots.filter(other => other.linked).length > 1;
const syncMessage = slot => ({ type: 'sync', scroll: shares(slot), input: shares(slot) && state.syncInput });
function syncFrames() { for (const slot of slots) post(slot, syncMessage(slot)); }
// Request/reply over a device's port (measure and scroll the page for full-page screenshots).
const pending = new Map();
let asked = 0;
function ask(slot, message, timeout = 4000) {
  return new Promise((resolve, reject) => {
    if (!slot.port) return reject(Error(t('errorFullPage')));
    const id = ++asked, timer = setTimeout(() => { pending.delete(id); reject(Error(t('errorFullPage'))); }, timeout);
    pending.set(id, reply => { clearTimeout(timer); resolve(reply); });
    post(slot, { ...message, id });
  });
}
globalThis.chrome?.runtime?.onConnect?.addListener(port => {
  const sender = port.sender;
  if (port.name !== 'viewport-frame' || sender?.tab?.id !== tabId || !sender.frameId) return port.disconnect();
  let slot = null;
  port.onMessage.addListener(message => {
    // First report maps the frame to its device by iframe name; later documents by frameId.
    slot ||= slots.find(s => s.frameId === sender.frameId) || slots.find(s => s.frameId === null && s.id === message.slot);
    if (!slot || !slots.includes(slot)) return;
    if (slot.port !== port) { slot.frameId = sender.frameId; slot.port = port; post(slot, syncMessage(slot)); }
    if (message.type === 'url') reported(slot, message.url);
    if (message.type === 'reply' && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    if (message.type === 'scroll' && shares(slot) && typeof message.path === 'string' && message.path.length < 2000) {
      const scroll = { type: 'scroll', path: message.path, x: Number(message.x) || 0, y: Number(message.y) || 0 };
      for (const other of slots) if (other !== slot && other.linked) post(other, scroll);
    }
    // Clicks and typing replay by element path; the page never receives another device's password or files.
    if ((message.type === 'click' || message.type === 'input') && shares(slot) && state.syncInput && typeof message.path === 'string' && message.path.length < 2000) {
      const action = message.type === 'click' ? { type: 'click', path: message.path } : { type: 'input', path: message.path, value: String(message.value ?? '').slice(0, 10000) };
      for (const other of slots) if (other !== slot && other.linked) post(other, action);
    }
  });
  port.onDisconnect.addListener(() => { if (slot?.port === port) slot.port = null; });
});

// ---- Screenshots ----
// captureVisibleTab only sees the screen, so devices are briefly shown alone at the largest fitting size.
const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const toBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error(t('errorCapture'))), 'image/png'));
let lastGrab = 0;
async function grab() {
  // Chrome allows about two captureVisibleTab calls per second.
  await pause(Math.max(0, lastGrab + 550 - Date.now()));
  lastGrab = Date.now();
  // captureVisibleTab takes whatever tab is in front; switching tabs mid-capture must not leak another page.
  const self = await chrome.tabs.get(tabId);
  if (!self.active) throw Error(t('errorCaptureHidden'));
  const image = new Image();
  image.src = await chrome.tabs.captureVisibleTab(self.windowId, { format: 'png' });
  await image.decode();
  return image;
}
async function captureScreen() {
  geometry({ width: innerWidth - 48, height: innerHeight - 48 });
  await frames(); await pause(80);
  const image = await grab();
  // Include the bezel's outer ring and side buttons.
  const pad = state.frame ? 8 * scale : 0;
  const rects = slots.map(slot => { const r = slot.phone.getBoundingClientRect(); return { left: r.left - pad, top: r.top - pad, right: r.right + pad, bottom: r.bottom + pad }; });
  const crop = cropRect(rects, image.width / innerWidth, image.width, image.height);
  const canvas = document.createElement('canvas');
  canvas.width = crop.width; canvas.height = crop.height;
  canvas.getContext('2d').drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
  return toBlob(canvas);
}
// Full page: the selected device, without its frame, one screen at a time while the page scrolls underneath.
async function captureFull(slot) {
  if (!slot.port) throw Error(t('errorFullPage'));
  for (const other of slots) other.element.classList.toggle('capture-hidden', other !== slot);
  geometry({ width: innerWidth - 48, height: innerHeight - 48, only: slot, plain: true });
  await frames();
  try {
    const { height, scrollHeight } = await ask(slot, { type: 'measure' });
    const total = Math.min(scrollHeight, Math.floor(MAX_CANVAS / (scale * devicePixelRatio)));
    cutShort = scrollHeight > total;
    let canvas, context, ratio;
    for (const strip of strips(total, height)) {
      const { y } = await ask(slot, { type: 'shoot', ...strip });
      // Give lazy images and scroll-in effects a moment.
      await pause(120);
      const image = await grab();
      const crop = cropRect([slot.iframe.getBoundingClientRect()], image.width / innerWidth, image.width, image.height);
      if (!canvas) {
        ratio = crop.height / height;
        canvas = document.createElement('canvas');
        canvas.width = crop.width; canvas.height = Math.min(MAX_CANVAS, Math.round(total * ratio));
        context = canvas.getContext('2d');
      }
      context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, Math.round(y * ratio), crop.width, crop.height);
    }
    return await toBlob(canvas);
  } finally {
    await ask(slot, { type: 'restore' }).catch(() => {});
  }
}
async function capture() {
  if (!ready) throw Error(t('errorGrantFirst'));
  if (capturing) throw Error(t('errorCapture'));
  // Background tabs pause animation frames; fail now instead of waiting to be brought back.
  if (!(await chrome.tabs.get(tabId)).active) throw Error(t('errorCaptureHidden'));
  capturing = true; cutShort = false;
  document.body.classList.add('capturing');
  try { return state.shot === 'full' ? await captureFull(focused()) : await captureScreen(); }
  finally {
    document.body.classList.remove('capturing');
    for (const slot of slots) slot.element.classList.remove('capture-hidden');
    capturing = false; geometry();
  }
}
function shotName() {
  const d = new Date(), p = n => String(n).padStart(2, '0'), slot = focused(), full = state.shot === 'full';
  const what = slots.length > 1 && !full ? `${slots.length}-devices` : `${describe(slot.key).name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${slot.size.width}x${slot.size.height}${full ? '-full' : ''}`;
  return `viewport-${what}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
}
const shotDone = message => status(cutShort ? `${message} ${t('fullPageCut')}` : message);
async function saveShot() {
  try {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(await capture()); link.download = shotName(); link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    shotDone(t('screenshotSaved', link.download));
  } catch (e) { error(e); }
}
$('#shot-save').onclick = saveShot;
// The clipboard write starts inside the click; ClipboardItem waits for the capture promise.
const copyShot = () => navigator.clipboard.write([new ClipboardItem({ 'image/png': capture() })]).then(() => shotDone(t('screenshotCopied')), error);
$('#shot-copy').onclick = copyShot;
function showShot() {
  $('#shot-mode').querySelectorAll('button').forEach(b => { const on = b.dataset.mode === state.shot; b.classList.toggle('chosen', on); b.setAttribute('aria-pressed', String(on)); });
  const full = state.shot === 'full';
  $('#shot-note').textContent = t(full ? 'fullPageNote' : 'screenshotNote');
}
function setShot(mode) { state.shot = mode; showShot(); storePrefs(); }
$('#shot-mode').onclick = e => { const b = e.target.closest('button'); if (b) setShot(b.dataset.mode); };

// ---- Controls ----
function rotate() { const { width, height } = focused().size; resizeFocused({ width: height, height: width }, focused().key); }
$('#rotate-btn').onclick = rotate;
for (const id of ['width', 'height']) $('#' + id).onchange = () => resizeFocused({ width: Number($('#width').value), height: Number($('#height').value) });
$('#custom').onclick = () => { $('#width').focus(); $('#width').select(); };
$('#save-device-btn').onclick = saveDevice;
$('#device-name').onkeydown = e => { if (e.key === 'Enter') saveDevice(); };
function setZoom(zoom) { state.zoom = zoom; geometry(); storePrefs(); }
$('#zoom-in').onclick = () => setZoom(stepZoom(scale, 1));
$('#zoom-out').onclick = () => setZoom(stepZoom(scale, -1));
$('#zoom').onclick = () => setZoom(state.zoom === 'fit' ? 1 : 'fit');
function showFrame() { $('#frame-segment').querySelectorAll('button').forEach(b => { const on = (b.dataset.frame === 'on') === state.frame; b.classList.toggle('chosen', on); b.setAttribute('aria-pressed', String(on)); }); }
function setFrame(on) { state.frame = on; showFrame(); geometry(); storePrefs(); }
$('#frame-segment').onclick = e => { const b = e.target.closest('button'); if (b) setFrame(b.dataset.frame === 'on'); };
$('#sync').onchange = () => { state.sync = $('#sync').checked; syncFrames(); geometry(); storePrefs(); };
$('#sync-input').onchange = () => { state.syncInput = $('#sync-input').checked; syncFrames(); storePrefs(); };
function navigate() {
  try { if (!ready) throw Error(t('errorGrantFirst')); loadAll(webUrl($('.address input').value)); status(t('loading')); } catch (e) { error(e); }
}
$('#navigate').onclick = navigate; $('.address input').onkeydown = e => { if (e.key === 'Enter') navigate(); };
$('#reload').onclick = () => { for (const slot of slots) if (slot.url) loadSlot(slot, slot.url); };
$('#focus-target').onclick = () => { const url = focused().url || siteUrl; if (url) chrome.tabs.create({ url, openerTabId: tabId }).catch(error); };
$('#end-session').onclick = () => send('exit', { url: focused().url || siteUrl }).catch(error);
$('#grant').onclick = async () => {
  try { if (!await chrome.permissions.request(ACCESS)) return status(t('errorDenied'), true); await start(); } catch (e) { error(e); }
};
observePreviewWidth($('.canvas'), () => geometry());
let resizeQueued = false;
addEventListener('resize', () => { if (resizeQueued) return; resizeQueued = true; requestAnimationFrame(() => { resizeQueued = false; if (!capturing) geometry(); }); });

// ---- Theme ----
// Kept in localStorage so theme.js can apply it before the first paint.
const THEMES = ['auto', 'light', 'dark'];
function readTheme() { try { return localStorage.getItem('viewport-theme') || 'auto'; } catch { return 'auto'; } }
function showTheme() {
  const theme = readTheme(), label = t({ auto: 'themeAuto', light: 'themeLight', dark: 'themeDark' }[theme] || 'themeAuto');
  if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
  $('#theme').title = label; $('#theme').setAttribute('aria-label', label);
}
function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(readTheme()) + 1) % THEMES.length];
  try { localStorage.setItem('viewport-theme', next); } catch { /* cannot persist; still apply */ }
  showTheme();
}
$('#theme').onclick = cycleTheme;

// ---- Keyboard shortcuts ----
// Keys typed inside a device go to the website, so these work only while Studio has focus.
const help = () => { if (!$('#shortcuts').open) $('#shortcuts').showModal(); };
$('#help-btn').onclick = help;
function toggleLink() { const slot = focused(); if (slots.length < 2) return; slot.linked = !slot.linked; geometry(); storePrefs(); syncFrames(); }
const shortcuts = {
  '?': help, '/': () => { $('.address input').focus(); $('.address input').select(); },
  r: rotate, '+': () => setZoom(stepZoom(scale, 1)), '=': () => setZoom(stepZoom(scale, 1)), '-': () => setZoom(stepZoom(scale, -1)),
  0: () => setZoom(state.zoom === 'fit' ? 1 : 'fit'), f: () => setFrame(!state.frame), l: toggleLink,
  s: saveShot, c: copyShot, p: () => setShot(state.shot === 'full' ? 'screen' : 'full'), t: cycleTheme,
};
addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.repeat) return;
  // A just-closed dialog can keep focus for a frame; only an open one owns the keyboard.
  if (event.target.closest?.('dialog[open]')) return;
  if (event.target.closest?.('input, textarea, select, [contenteditable]')) {
    if (event.key === 'Escape') event.target.blur();
    return;
  }
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const action = /^[1-4]$/.test(key) ? () => slots[key - 1] && focusSlot(slots[key - 1]) : shortcuts[key];
  if (!action) return;
  event.preventDefault(); action();
});

// ---- Start ----
async function start() {
  if (!globalThis.chrome?.tabs) throw Error(t('errorNotExtension'));
  tabId = (await chrome.tabs.getCurrent()).id;
  if (!await chrome.permissions.contains(ACCESS)) {
    $('#grant').hidden = false; for (const slot of slots) overlay(slot, t('overlayGrant'));
    return status(t('statusGrant'));
  }
  $('#grant').hidden = true;
  const session = await send('open', { url: params.get('url') });
  ready = true;
  if (session.url) { loadAll(session.url, true); status(t('statusReady')); }
  else {
    for (const slot of slots) overlay(slot, t('overlayEmpty'));
    params.get('error') ? status(params.get('error'), true) : status(t('statusEmpty'));
  }
}
async function init() {
  const stored = (await globalThis.chrome?.storage?.local.get(['prefs', 'savedDevices']).catch(() => null)) || {};
  saved = cleanSaved(stored.savedDevices);
  const prefs = cleanPrefs(stored.prefs, saved);
  Object.assign(state, { focus: prefs.focus, frame: prefs.frame, sync: prefs.sync, syncInput: prefs.syncInput, zoom: prefs.zoom, shot: prefs.shot });
  slots = prefs.devices.map(createSlot);
  $('#stage').append(...slots.map(slot => slot.element));
  $('#sync').checked = state.sync; $('#sync-input').checked = state.syncInput; showFrame(); showShot(); showTheme(); renderDevices(); geometry();
  await start();
}
init().catch(e => { for (const slot of slots) overlay(slot, e.message); error(e); });
