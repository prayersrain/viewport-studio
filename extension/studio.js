import { PRESETS, ACCESS, viewport, webUrl } from './core.js';
import { t, localize } from './i18n.js';
import { observePreviewWidth } from './layout.js';
const $ = selector => document.querySelector(selector);
let size = { ...PRESETS.iphone }, device = 'iphone', zoom = 100, frame = true, ready = false, current = '', tabId;
const site = $('#live-screen'), params = new URLSearchParams(location.search);
localize();
if (globalThis.chrome?.i18n) document.documentElement.lang = t('lang');
$('#version-note').textContent = t('versionNote', globalThis.chrome?.runtime?.getManifest?.().version || 'dev');
for (const [id, preset] of Object.entries(PRESETS)) {
  const button = document.createElement('button');
  button.className = 'device'; button.dataset.device = id;
  button.innerHTML = '<span class="device-icon"></span><span><b></b><small></small></span>';
  button.querySelector('b').textContent = preset.name;
  button.querySelector('small').textContent = `${preset.width} × ${preset.height} · ${t('portrait')}`;
  button.onclick = () => resize(preset, id);
  $('#devices').append(button);
}
async function send(type, data = {}) {
  if (!globalThis.chrome?.runtime?.sendMessage) throw Error(t('errorNotExtension'));
  const result = await chrome.runtime.sendMessage({ type, ...data });
  if (!result?.ok) throw Error(result?.error || t('errorNoResponse'));
  return result.value;
}
function status(message, error = false) { $('#status').textContent = message; $('#status').classList.toggle('status-error', error); }
function error(e) { status(e.message, true); }
function overlay(message) { $('#connection-overlay').hidden = !message; $('#connection-overlay').textContent = message || ''; }
function geometry() {
  const landscape = size.width > size.height, space = $('.phone-space'), phone = $('#phone');
  const w = size.width + (frame ? (landscape ? 98 : 22) : 0), h = size.height + (frame ? (landscape ? 22 : 98) : 0);
  const scale = Math.min(.62, Math.max(120,space.clientWidth-36) / Math.max(landscape?1030:452,w)) * zoom / 100;
  phone.style.width = w+'px'; phone.style.height = h+'px';
  phone.style.transform = `translateX(-50%) scale(${scale})`;
  space.style.height = Math.max(450,h*scale+48)+'px';
  phone.classList.toggle('landscape',landscape); phone.classList.toggle('plain',!frame);
  phone.classList.toggle('android',device==='android'); phone.classList.toggle('custom-device',device==='custom');
  $('#device-title').textContent = PRESETS[device]?.name || t('customViewport');
  $('#device-subtitle').textContent = `${size.width} × ${size.height} CSS px · ${t(landscape?'landscape':'portrait')}`;
  $('#width').value = size.width; $('#height').value = size.height;
  $('#zoom').textContent = zoom+'%';
  $('#canvas-caption').textContent = t(frame?'frameOn':'contentOnly');
}
function markDevice() {
  document.querySelectorAll('.device').forEach(b=>{const chosen=b.dataset.device===device;b.classList.toggle('selected',chosen);b.setAttribute('aria-pressed',String(chosen));b.querySelector('.dot')?.remove();if(chosen){const dot=document.createElement('span');dot.className='dot';b.append(dot)}});
}
const presetFor = s => Object.keys(PRESETS).find(key=>(PRESETS[key].width===s.width&&PRESETS[key].height===s.height)||(PRESETS[key].width===s.height&&PRESETS[key].height===s.width))||'custom';
function urlLabel(url) {
  if (document.activeElement !== $('.address input')) $('.address input').value=url;
  try { $('#site-host').textContent=new URL(url).host; } catch { /* initial empty url */ }
}
function load(url) { current=url; urlLabel(url); overlay(t('loading')); site.src=url; }
// Clear the loading state as soon as the page commits (frame.js reports) or finishes loading.
function loaded() { overlay(''); if(ready) status(t('statusReady')); }
site.addEventListener('load',()=>{ if(current) loaded(); });
globalThis.chrome?.runtime?.onMessage?.addListener((message,sender)=>{
  if(message?.type!=='frame-url'||sender.tab?.id!==tabId||!sender.frameId)return;
  current=message.url; urlLabel(current); loaded();
});
// The iframe is a real viewport: resizing and rotating are instant, no reload or stream restart.
function resize(next,nextDevice=device) {
  try { size=viewport(next); } catch(e) { geometry(); error(e); return; }
  device=nextDevice; geometry(); markDevice();
  if (ready) send('size',{size}).catch(error);
}
$('#rotate-btn').onclick=()=>resize({width:size.height,height:size.width});
for(const id of ['width','height']) $('#'+id).onchange=()=>{const next={width:Number($('#width').value),height:Number($('#height').value)};resize(next,presetFor(next))};
$('#custom').onclick=()=>{$('#width').focus();$('#width').select()};
for(const [id,delta] of [['zoom-in',10],['zoom-out',-10]]) $('#'+id).onclick=()=>{zoom=Math.max(70,Math.min(110,zoom+delta));geometry()};
$('#frame-segment').onclick=e=>{const b=e.target.closest('button');if(!b)return;frame=b.dataset.frame==='on';$('#frame-segment').querySelectorAll('button').forEach(x=>{x.classList.toggle('chosen',x===b);x.setAttribute('aria-pressed',String(x===b))});geometry()};
function navigate() {
  try { if(!ready)throw Error(t('errorGrantFirst')); load(webUrl($('.address input').value)); status(t('loading')); } catch(e){error(e)}
}
$('#navigate').onclick=navigate;$('.address input').onkeydown=e=>{if(e.key==='Enter')navigate()};
$('#reload').onclick=()=>{if(current)load(current)};
$('#focus-target').onclick=()=>{if(current)chrome.tabs.create({url:current,openerTabId:tabId}).catch(error)};
$('#end-session').onclick=()=>send('exit',{url:current}).catch(error);
async function start() {
  if(!globalThis.chrome?.tabs)throw Error(t('errorNotExtension'));
  tabId=(await chrome.tabs.getCurrent()).id;
  if(!await chrome.permissions.contains(ACCESS)) {
    $('#grant').hidden=false; overlay(t('overlayGrant'));
    status(t('statusGrant'));
    return;
  }
  $('#grant').hidden=true;
  const session=await send('open',{url:params.get('url')});
  size=session.size; device=presetFor(size); geometry(); markDevice(); ready=true;
  if(session.url) { load(session.url); status(t('statusReady')); }
  else { overlay(t('overlayEmpty')); params.get('error') ? status(params.get('error'),true) : status(t('statusEmpty')); }
}
$('#grant').onclick=async()=>{
  try { if(!await chrome.permissions.request(ACCESS)) return status(t('errorDenied'),true); await start(); } catch(e){error(e)}
};
observePreviewWidth($('.canvas'), geometry);
geometry(); markDevice();
start().catch(e=>{overlay(e.message);error(e)});
