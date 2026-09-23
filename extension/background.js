import { PRESETS, ACCESS, webUrl, viewport, framingRules } from './core.js';
import { t } from './i18n.js';

// Direct mode: the website renders in an iframe inside Studio, in the same tab.
// No chrome.debugger, so Chrome shows no "started debugging this browser" banner.
// Session storage survives worker suspension, not a browser restart.
const STUDIO = chrome.runtime.getURL('studio.html');
let tail = Promise.resolve();
const serial = job => { const result = tail.then(job); tail = result.catch(() => {}); return result; };
const get = async () => (await chrome.storage.session.get('sessions')).sessions || {};
const save = sessions => chrome.storage.session.set({ sessions });
const isStudioUrl = url => typeof url === 'string' && url.split(/[?#]/)[0] === STUDIO;
// Tab ids can exceed 1e9, so rule ids are allocated, not derived from them. Always runs inside serial().
async function frame(tabId, install) {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const mine = rules.filter(rule => rule.condition.tabIds?.includes(tabId)).map(rule => rule.id);
  const used = new Set(rules.map(rule => rule.id).filter(id => !mine.includes(id))), ids = [];
  for (let id = 1; install && ids.length < 2; id++) if (!used.has(id)) ids.push(id);
  if (mine.length || install) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: mine, addRules: install ? framingRules(tabId, ids) : [] });
}
const unframe = tabId => frame(tabId, false);
async function isStudio(tabId) {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['TAB'], tabIds: [tabId] });
  return contexts.some(context => isStudioUrl(context.documentUrl));
}
async function frameScript() {
  const [existing] = await chrome.scripting.getRegisteredContentScripts({ ids: ['viewport-frame'] });
  if (!existing) await chrome.scripting.registerContentScripts([{ id: 'viewport-frame', js: ['frame.js'], matches: ACCESS.origins, allFrames: true, runAt: 'document_start' }]);
}
async function forget(tabId) {
  const sessions = await get();
  if (!sessions[tabId]) return;
  delete sessions[tabId];
  await save(sessions);
  await unframe(tabId);
}
// Leave Studio in place: the tab returns to the website it was showing.
async function leave(tabId, url) {
  await forget(tabId);
  let target;
  try { target = webUrl(url); } catch { target = 'chrome://newtab/'; }
  await chrome.tabs.update(tabId, { url: target });
}

// The icon toggles the current tab between the website and Studio. No new tab, no popup window.
chrome.action.onClicked.addListener(tab => serial(async () => {
  const sessions = await get();
  if (sessions[tab.id] && await isStudio(tab.id)) return leave(tab.id, sessions[tab.id].url);
  let url;
  try { url = webUrl(tab.url); } catch (error) {
    return chrome.tabs.update(tab.id, { url: STUDIO + '?error=' + encodeURIComponent(error.message) });
  }
  sessions[tab.id] = { url, size: sessions[tab.id]?.size || viewport(PRESETS.iphone) };
  await save(sessions);
  await chrome.tabs.update(tab.id, { url: STUDIO + '?url=' + encodeURIComponent(url) });
}));

async function handle(message, sender) {
  // No content scripts or external pages may drive the session.
  if (sender.id !== chrome.runtime.id || !isStudioUrl(sender.url) || !sender.tab || sender.frameId) throw Error(t('errorSender'));
  const id = sender.tab.id, sessions = await get();
  if (message.type === 'open') {
    if (!await chrome.permissions.contains(ACCESS)) throw Error(t('errorPermission'));
    await frameScript();
    await frame(id, true);
    // Prefer the tracked URL: a reloaded Studio resumes where the frame was.
    const session = sessions[id] ||= { size: viewport(PRESETS.iphone) };
    if (!session.url && message.url) session.url = webUrl(message.url);
    await save(sessions);
    return session;
  }
  const session = sessions[id];
  if (!session) throw Error(t('errorNoSession'));
  if (message.type === 'size') { session.size = viewport(message.size); await save(sessions); return session.size; }
  if (message.type === 'exit') { await leave(id, message.url || session.url); return {}; }
  throw Error(t('errorCommand'));
}
// frame.js reports the URL of the page inside Studio so the icon can return to it.
async function track(tabId, url) {
  const sessions = await get();
  if (!sessions[tabId]) return;
  try { sessions[tabId].url = webUrl(url); } catch { return; }
  await save(sessions);
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'frame-url') {
    if (sender.id === chrome.runtime.id && sender.frameId > 0 && sender.tab) serial(() => track(sender.tab.id, message.url));
    return;
  }
  serial(() => handle(message, sender)).then(value => respond({ ok: true, value }), error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => serial(() => forget(tabId)));
// Leaving Studio any other way (address bar, back button) must restore normal framing protection.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url ? isStudioUrl(info.url) : info.status !== 'complete') return;
  serial(async () => { if (!info.url && await isStudio(tabId)) return; await forget(tabId); });
});
