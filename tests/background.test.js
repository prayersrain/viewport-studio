import { test } from 'node:test';
import assert from 'node:assert/strict';
const event=()=>({addListener(fn){this.listener=fn}});
let storage={},calls=[],granted=true,contexts=[],registered=[],rules=[];
const STUDIO='chrome-extension://test/studio.html';
globalThis.chrome={
  action:{onClicked:event()},
  runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:event(),async getContexts(filter){return contexts.filter(c=>filter.tabIds.includes(c.tabId))}},
  permissions:{async contains(){return granted}},
  scripting:{async getRegisteredContentScripts({ids}){return registered.filter(s=>ids.includes(s.id))},async registerContentScripts(scripts){registered.push(...scripts);calls.push(['register',scripts])}},
  declarativeNetRequest:{async getSessionRules(){return structuredClone(rules)},async updateSessionRules(update){calls.push(['rules',update]);rules=rules.filter(r=>!update.removeRuleIds?.includes(r.id)).concat(update.addRules||[]);assert.equal(new Set(rules.map(r=>r.id)).size,rules.length,'rule ids must stay unique')}},
  storage:{session:{async get(){return structuredClone(storage)},async set(value){Object.assign(storage,structuredClone(value))}}},
  tabs:{onRemoved:event(),onUpdated:event(),async update(id,value){calls.push(['update',id,value])}},
};
// Mock tabs.create/windows/debugger are absent on purpose: any use would throw.
await import('../extension/background.js');
const studio=id=>({id:'test',url:STUDIO+'?url=x',frameId:0,tab:{id}});
const send=(type,data={},sender=studio(1))=>new Promise(resolve=>{const keep=chrome.runtime.onMessage.listener({type,...data},sender,resolve);if(keep!==true)resolve(undefined)});
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));
const rulesFor=tabId=>rules.filter(r=>r.condition.tabIds.includes(tabId));

test('icon turns the same tab into Studio: no new tab, window or debugger',async()=>{
  await chrome.action.onClicked.listener({id:1,url:'http://localhost:5173/booking'});
  assert.deepEqual(calls.at(-1),['update',1,{url:STUDIO+'?url='+encodeURIComponent('http://localhost:5173/booking')}]);
  assert.deepEqual(storage.sessions[1],{url:'http://localhost:5173/booking'});
});

test('only the Studio page may open a session, and only after host access is granted',async()=>{
  for(const sender of [{id:'test',url:'http://localhost:5173/',frameId:0,tab:{id:1}},{id:'other',url:STUDIO,frameId:0,tab:{id:1}},{...studio(1),frameId:3}]){
    assert.equal((await send('open',{},sender)).ok,false);
  }
  granted=false;
  const denied=await send('open');
  assert.equal(denied.ok,false);assert.equal(denied.error,'errorPermission');
  assert.equal(calls.filter(c=>c[0]==='rules'||c[0]==='register').length,0);
  granted=true;
  const opened=await send('open',{url:'https://ignored.example/'});
  assert.equal(opened.ok,true);
  assert.equal(opened.value.url,'http://localhost:5173/booking','tracked URL wins over the query string');
  assert.equal(registered.length,1);
  assert.deepEqual(registered[0].matches,['http://*/*','https://*/*'],'frame script stays off file:// and other schemes');
  assert.equal(registered[0].allFrames,true);assert.equal(registered[0].runAt,'document_start');
  assert.equal(rulesFor(1).length,2);
  await send('open');
  assert.equal(rulesFor(1).length,2,'reopening replaces, never duplicates');
  assert.equal(registered.length,1,'frame script registers once');
});

test('Studio tracks the focused page; content scripts and bad URLs cannot',async()=>{
  assert.equal((await send('track',{url:'http://localhost:5173/booking/step-2'})).ok,true);
  assert.equal(storage.sessions[1].url,'http://localhost:5173/booking/step-2');
  // A page inside a device frame is not the Studio page, even in the same tab.
  const fromFrame=await send('track',{url:'https://evil.example/'},{id:'test',url:'https://evil.example/',frameId:5,tab:{id:1}});
  assert.equal(fromFrame.ok,false);
  assert.equal((await send('track',{url:'javascript:alert(1)'})).ok,false);
  assert.equal(storage.sessions[1].url,'http://localhost:5173/booking/step-2');
  assert.equal((await send('Runtime.evaluate',{expression:'1'})).ok,false);
});

test('icon on Studio returns the tab to the tracked page and drops framing rules',async()=>{
  contexts=[{tabId:1,documentUrl:STUDIO+'?url=x'}];
  await chrome.action.onClicked.listener({id:1,url:STUDIO});
  assert.deepEqual(calls.at(-1),['update',1,{url:'http://localhost:5173/booking/step-2'}]);
  assert.equal(rulesFor(1).length,0);
  assert.equal(storage.sessions[1],undefined);
  contexts=[];
});

test('exit button leaves in place; missing URL falls back to the new tab page',async()=>{
  await chrome.action.onClicked.listener({id:2,url:'https://example.com/'});
  await send('open',{},studio(2));
  assert.equal((await send('exit',{url:'https://example.com/pricing'},studio(2))).ok,true);
  assert.deepEqual(calls.at(-1),['update',2,{url:'https://example.com/pricing'}]);
  await chrome.action.onClicked.listener({id:4,url:'chrome://settings'});
  assert.match(calls.at(-1)[2].url,/studio\.html\?error=/);
  await send('open',{},studio(4));
  await send('exit',{url:''},studio(4));
  assert.deepEqual(calls.at(-1),['update',4,{url:'chrome://newtab/'}]);
});

test('leaving Studio by address bar or closing the tab removes the rules',async()=>{
  await chrome.action.onClicked.listener({id:3,url:'https://example.com/'});
  await send('open',{},studio(3));
  contexts=[{tabId:3,documentUrl:STUDIO}];
  chrome.tabs.onUpdated.listener(3,{status:'complete'});await settle();
  chrome.tabs.onUpdated.listener(3,{url:STUDIO+'?url=y'});await settle();
  assert.ok(storage.sessions[3],'Studio still open keeps its session');
  contexts=[];
  chrome.tabs.onUpdated.listener(3,{url:'https://news.example/'});await settle();
  assert.equal(storage.sessions[3],undefined);
  assert.equal(rulesFor(3).length,0);
  // Real Chrome tab ids exceed 1e9; rule ids must still be valid int32 values.
  const big=2147480000;
  await chrome.action.onClicked.listener({id:big,url:'https://example.com/'});
  await send('open',{},studio(big));
  assert.ok(rulesFor(big).every(r=>r.id>0&&r.id<2**31));
  await chrome.tabs.onRemoved.listener(big);
  assert.equal(storage.sessions[big],undefined);
  assert.equal(rules.length,0);
});
