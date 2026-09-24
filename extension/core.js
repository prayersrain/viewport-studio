import { t } from './i18n.js';

// Generic names on purpose: CSS viewport sizes are shared by many real models.
// frame picks the bezel: iphone (island), android (punch hole), generic (plain bezel), screen (monitor, no bars).
export const PRESETS = {
  'iphone-se': { name: 'iPhone SE', width: 375, height: 667, group: 'phone', frame: 'iphone' },
  iphone: { name: 'iPhone · Standard', width: 393, height: 852, group: 'phone', frame: 'iphone' },
  large: { name: 'iPhone · Large', width: 430, height: 932, group: 'phone', frame: 'iphone' },
  'android-compact': { name: 'Android · Compact', width: 360, height: 800, group: 'phone', frame: 'android' },
  android: { name: 'Android · Standard', width: 412, height: 915, group: 'phone', frame: 'android' },
  'ipad-mini': { name: 'iPad mini', width: 744, height: 1133, group: 'tablet', frame: 'generic' },
  ipad: { name: 'iPad', width: 820, height: 1180, group: 'tablet', frame: 'generic' },
  'android-tablet': { name: 'Android · Tablet', width: 800, height: 1280, group: 'tablet', frame: 'generic' },
  laptop: { name: 'Laptop', width: 1366, height: 768, group: 'desktop', frame: 'screen' },
  desktop: { name: 'Desktop', width: 1920, height: 1080, group: 'desktop', frame: 'screen' },
};
export const MAX_DEVICES = 4;
// <all_urls> rather than http/https: chrome.tabs.captureVisibleTab (screenshots) requires it.
// Framing, login cookies inside the frame and the frame script depend on it too.
export const ACCESS = { origins: ['<all_urls>'] };
export const FRAME_MATCHES = ['http://*/*', 'https://*/*'];
export function webUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error(t('errorUrl'));
  if (['chromewebstore.google.com'].includes(url.hostname) || (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))) throw Error(t('errorWebStore'));
  return url.href;
}
export function viewport(value) {
  if (!value || !Number.isInteger(value.width) || !Number.isInteger(value.height) || value.width < 240 || value.height < 240 || value.width > 2000 || value.height > 2000) throw Error(t('errorSize'));
  return { width: value.width, height: value.height };
}
// Preset whose size matches in either orientation, else 'custom'.
export const presetFor = size => Object.keys(PRESETS).find(key => {
  const p = PRESETS[key];
  return (p.width === size.width && p.height === size.height) || (p.width === size.height && p.height === size.width);
}) || 'custom';

// storage.local is user-editable state: rebuild it from known-good parts.
export function cleanSaved(value) {
  return (Array.isArray(value) ? value : []).flatMap(device => {
    try {
      if (!/^saved-[a-z0-9]{1,20}$/.test(device.id) || typeof device.name !== 'string' || !device.name.trim() || device.name.length > 40) return [];
      return [{ id: device.id, name: device.name.trim(), ...viewport(device) }];
    } catch { return []; }
  }).slice(0, 50);
}
export function cleanPrefs(value, saved = []) {
  const known = key => key === 'custom' || Object.hasOwn(PRESETS, key) || saved.some(device => device.id === key);
  const devices = (Array.isArray(value?.devices) ? value.devices : []).slice(0, MAX_DEVICES).flatMap(device => {
    try { return [{ key: known(device.key) ? device.key : 'custom', ...viewport(device), linked: device.linked !== false }]; } catch { return []; }
  });
  if (!devices.length) devices.push({ key: 'iphone', ...viewport(PRESETS.iphone), linked: true });
  const focus = Number.isInteger(value?.focus) && value.focus >= 0 && value.focus < devices.length ? value.focus : 0;
  return { devices, focus, frame: value?.frame !== false, sync: value?.sync !== false, syncInput: value?.syncInput === true, zoom: ZOOM_STEPS.includes(value?.zoom) ? value.zoom : 'fit', shot: value?.shot === 'full' ? 'full' : 'screen' };
}

// Outer size of a device in CSS px: viewport plus bezel and the status/browser bars.
// Must match the .phone padding/border and bar sizes in studio.css.
export function deviceBox(size, frame, framed = true) {
  if (!framed) return { width: size.width, height: size.height };
  if (frame === 'screen') return { width: size.width + 22, height: size.height + 22 };
  const landscape = size.width > size.height;
  return { width: size.width + (landscape ? 98 : 22), height: size.height + (landscape ? 22 : 98) };
}
// Largest scale (never above true size) at which all devices fit side by side.
export function fitScale(boxes, width, height, gap) {
  // Gaps stay a fixed number of screen pixels; only the devices scale.
  const widths = boxes.reduce((sum, box) => sum + box.width, 0), gaps = gap * (boxes.length - 1);
  const tallest = Math.max(...boxes.map(box => box.height));
  return Math.max(0.1, Math.min(1, (width - gaps) / widths, height / tallest));
}
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5];
export function stepZoom(scale, direction) {
  const steps = direction > 0 ? ZOOM_STEPS.filter(step => step > scale + 0.001) : ZOOM_STEPS.filter(step => step < scale - 0.001).reverse();
  return steps[0] ?? (direction > 0 ? ZOOM_STEPS.at(-1) : ZOOM_STEPS[0]);
}
// Union of element rects (CSS px) as a whole-pixel crop of a capture taken at dpr.
export function cropRect(rects, dpr, imageWidth, imageHeight) {
  const left = Math.max(0, Math.floor(Math.min(...rects.map(r => r.left)) * dpr));
  const top = Math.max(0, Math.floor(Math.min(...rects.map(r => r.top)) * dpr));
  const right = Math.min(imageWidth, Math.ceil(Math.max(...rects.map(r => r.right)) * dpr));
  const bottom = Math.min(imageHeight, Math.ceil(Math.max(...rects.map(r => r.bottom)) * dpr));
  if (right <= left || bottom <= top) throw Error(t('errorCapture'));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

// Full-page screenshots: one strip per screen of the device. Chrome caps canvas height,
// so taller pages are cut at MAX_CANVAS image pixels.
export const MAX_CANVAS = 32000;
export function strips(total, height) {
  const count = Math.max(1, Math.ceil(total / height));
  return Array.from({ length: count }, (_, index) => ({ y: index * height, first: index === 0, last: index === count - 1 }));
}

// Only sub-frames inside one Studio tab lose their anti-framing headers.
// Normal browsing, including the same site in other tabs, keeps them.
export function framingRules(tabId, [xfo, csp]) {
  const condition = { tabIds: [tabId], resourceTypes: ['sub_frame'] };
  const remove = header => ({ type: 'modifyHeaders', responseHeaders: [{ header, operation: 'remove' }] });
  return [
    { id: xfo, priority: 1, action: remove('x-frame-options'), condition },
    // DNR cannot edit a single directive, so drop CSP only when it forbids framing.
    { id: csp, priority: 1, action: remove('content-security-policy'),
      condition: { ...condition, responseHeaders: [{ header: 'content-security-policy', values: ['*frame-ancestors*'] }] } },
  ];
}
