import { t } from './i18n.js';

export const PRESETS = {
  iphone: { name: 'iPhone · Standard', width: 393, height: 852 },
  large: { name: 'iPhone · Large', width: 430, height: 932 },
  android: { name: 'Android · Standard', width: 412, height: 915 },
};
// Same patterns as optional_host_permissions. Framing, login cookies and the frame script depend on them.
export const ACCESS = { origins: ['http://*/*', 'https://*/*'] };
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
