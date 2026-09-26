import { ACCESS, AGENTS, FRAME_MATCHES, webUrl, framingRules, ruleCount } from './core.js';
import { t } from './i18n.js';

// Direct mode: the website renders in an iframe inside Studio, in the same tab.
// No chrome.debugger, so Chrome shows no "started debugging this browser" banner.
// Session storage survives worker suspension, not a browser restart.
const STUDIO = chrome.runtime.getURL('studio.html');
const CHROME_MAJOR = /Chrome\/(\d+)/.exec(globalThis.navigator?.userAgent ?? '')?.[1] ?? '140';
let tail = Promise.resolve();
const serial = job => { const result = tail.then(job); tail = result.catch(() => {}); return result; };
const get = async () => (await chrome.storage.session.get('sessions')).sessions || {};
const save = sessions => chrome.storage.session.set({ sessions });
const isStudioUrl = url => typeof url === 'string' && url.split(/[?#]/)[0] === STUDIO;
// Tab ids can exceed 1e9, so rule ids are allocated, not derived from them. Always runs inside serial().
async function frame(tabId, install, agent = 'desktop') {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const mine = rules.filter(rule => rule.condition.tabIds?.includes(tabId)).map(rule => rule.id);
  const used = new Set(rules.map(rule => rule.id).filter(id => !mine.includes(id))), ids = [];
  for (let id = 1; install && ids.length < ruleCount(agent); id++) if (!used.has(id)) ids.push(id);
  if (mine.length || install) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: mine, addRules: install ? framingRules(tabId, ids, agent, CHROME_MAJOR) : [] });
  // ponytail: under load the first request after an update can still leave with the old user agent
  // (request headers are matched as the request starts; framing rules act later, on the response).
  // A short settle covers it; confirm with testMatchOutcome if it ever shows up again.
  if (install && ruleCount(agent) === 3) await new Promise(resolve => setTimeout(resolve, 200));
}
const unframe = tabId => frame(tabId, false);
async function isStudio(tabId) {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['TAB'], tabIds: [tabId] });
  return contexts.some(context => isStudioUrl(context.documentUrl));
}
// frame.js runs isolated; agent.js must run in the page's world to change what page scripts read.
const SCRIPTS = [
  { id: 'viewport-frame', js: ['frame.js'], matches: FRAME_MATCHES, allFrames: true, runAt: 'document_start' },
  { id: 'viewport-agent', js: ['agent.js'], matches: FRAME_MATCHES, allFrames: true, runAt: 'document_start', world: 'MAIN' },
];
async function frameScript() {
  const existing = new Set((await chrome.scripting.getRegisteredContentScripts({ ids: SCRIPTS.map(script => script.id) })).map(script => script.id));
  const missing = SCRIPTS.filter(script => !existing.has(script.id));
  if (missing.length) await chrome.scripting.registerContentScripts(missing);
}
const agentOf = value => AGENTS.includes(value) ? value : 'desktop';
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
  sessions[tab.id] = { url };
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
    await frame(id, true, agentOf(message.agent));
    // Prefer the tracked URL: a reloaded Studio resumes where the frame was.
    const session = sessions[id] ||= {};
    if (!session.url && message.url) session.url = webUrl(message.url);
    await save(sessions);
    return session;
  }
  const session = sessions[id];
  if (!session) throw Error(t('errorNoSession'));
  // Studio reports the focused device's page so the icon can return to it.
  if (message.type === 'track') { session.url = webUrl(message.url); await save(sessions); return {}; }
  // The user agent applies to the whole Studio tab: every device's requests.
  if (message.type === 'agent') { if (!AGENTS.includes(message.agent)) throw Error(t('errorCommand')); await frame(id, true, message.agent); return {}; }
  if (message.type === 'exit') { await leave(id, message.url || session.url); return {}; }
  throw Error(t('errorCommand'));
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  serial(() => handle(message, sender)).then(value => respond({ ok: true, value }), error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => serial(() => forget(tabId)));
// Leaving Studio any other way (address bar, back button) must restore normal framing protection.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url ? isStudioUrl(info.url) : info.status !== 'complete') return;
  serial(async () => { if (!info.url && await isStudio(tabId)) return; await forget(tabId); });
});
