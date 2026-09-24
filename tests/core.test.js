import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webUrl, viewport, PRESETS, framingRules } from '../extension/core.js';
test('only navigable web URLs without embedded credentials are accepted',()=>{
  assert.equal(webUrl('http://localhost:5173/booking'),'http://localhost:5173/booking');
  for(const url of ['javascript:alert(1)','file:///C:/secret','chrome://settings','https://a:b@example.com','https://chromewebstore.google.com/detail/x'])assert.throws(()=>webUrl(url));
});
test('portrait and landscape sizes keep the requested CSS dimensions',()=>{
  for(const preset of Object.values(PRESETS)){
    assert.deepEqual(viewport(preset),{width:preset.width,height:preset.height});
    assert.deepEqual(viewport({width:preset.height,height:preset.width}),{width:preset.height,height:preset.width});
  }
});
test('unbounded geometry is rejected',()=>{
  for(const width of [0,-1,239,2001,NaN,Infinity,393.5,'393'])assert.throws(()=>viewport({width,height:852}));
  assert.throws(()=>viewport(null));
});
test('framing rules only touch sub-frames inside one Studio tab',()=>{
  const rules=framingRules(7,[4,9]);
  assert.deepEqual(rules.map(r=>r.id),[4,9]);
  for(const rule of rules){
    assert.deepEqual(rule.condition.tabIds,[7]);
    assert.deepEqual(rule.condition.resourceTypes,['sub_frame'],'never main_frame or subresources');
    assert.equal(rule.action.type,'modifyHeaders');
    assert.equal(rule.action.requestHeaders,undefined);
  }
  assert.deepEqual(rules[0].action.responseHeaders,[{header:'x-frame-options',operation:'remove'}]);
  // CSP stays unless it would block framing.
  assert.deepEqual(rules[1].condition.responseHeaders,[{header:'content-security-policy',values:['*frame-ancestors*']}]);
});

import { userAgent, ruleCount, AGENTS, presetFor, deviceBox, fitScale, stepZoom, ZOOM_STEPS, cropRect, cleanPrefs, cleanSaved, MAX_DEVICES, ACCESS, FRAME_MATCHES, strips } from '../extension/core.js';
test('every preset is a valid device with a known group and bezel',()=>{
  for(const [key,preset] of Object.entries(PRESETS)){
    assert.doesNotThrow(()=>viewport(preset),key);
    assert.ok(['phone','tablet','desktop'].includes(preset.group),key);
    assert.ok(['iphone','android','generic','screen'].includes(preset.frame),key);
    assert.equal(presetFor(preset),key);assert.equal(presetFor({width:preset.height,height:preset.width}),key,'rotated preset keeps its name');
  }
  assert.equal(presetFor({width:500,height:500}),'custom');
});
test('screenshots need <all_urls>, but the frame script stays on http(s)',()=>{
  assert.deepEqual(ACCESS.origins,['<all_urls>']);
  assert.deepEqual(FRAME_MATCHES,['http://*/*','https://*/*']);
});
test('device box adds bezel and bars on the right sides',()=>{
  assert.deepEqual(deviceBox({width:393,height:852},'iphone'),{width:415,height:950});
  assert.deepEqual(deviceBox({width:852,height:393},'iphone'),{width:950,height:415},'landscape moves the bars to the sides');
  assert.deepEqual(deviceBox({width:1366,height:768},'screen'),{width:1388,height:790},'monitors have no bars');
  assert.deepEqual(deviceBox({width:393,height:852},'iphone',false),{width:393,height:852},'content only');
});
test('fit scale shows every device, never above true size',()=>{
  const phone={width:415,height:950};
  assert.equal(fitScale([phone],2000,2000,28),1);
  assert.equal(fitScale([phone],1000,475,28),0.5,'height-bound');
  const s=fitScale([phone,phone,phone],1000,5000,28);
  assert.ok(Math.abs(3*415*s+2*28-1000)<1e-9,'width-bound including fixed gaps');
  assert.equal(fitScale([phone],10,10,28),0.1,'floor keeps devices visible');
});
test('zoom steps move to the next stop from any fitted scale',()=>{
  assert.equal(stepZoom(0.62,1),0.67);assert.equal(stepZoom(0.62,-1),0.5);
  assert.equal(stepZoom(1,1),1.25);assert.equal(stepZoom(1,-1),0.9);
  assert.equal(stepZoom(1.5,1),1.5);assert.equal(stepZoom(0.25,-1),0.25);
  assert.equal(stepZoom(0.1,-1),ZOOM_STEPS[0]);
});
test('crop is the union of devices in capture pixels, clamped to the image',()=>{
  assert.deepEqual(cropRect([{left:10.4,top:20,right:110,bottom:220},{left:130,top:15.2,right:230.1,bottom:200}],2,1000,1000),{x:20,y:30,width:441,height:410});
  assert.deepEqual(cropRect([{left:-5,top:-5,right:50,bottom:50}],1,40,40),{x:0,y:0,width:40,height:40});
  assert.throws(()=>cropRect([{left:500,top:0,right:600,bottom:10}],1,100,100));
});
test('stored preferences are rebuilt from valid parts only',()=>{
  const saved=cleanSaved([{id:'saved-abc',name:' My fold ',width:344,height:882},{id:'saved-x',name:'',width:300,height:600},{id:'../evil',name:'x',width:300,height:600},{id:'saved-big',name:'x',width:9999,height:600},'junk']);
  assert.deepEqual(saved,[{id:'saved-abc',name:'My fold',width:344,height:882}]);
  const prefs=cleanPrefs({devices:[{key:'iphone',width:393,height:852},{key:'saved-abc',width:344,height:882,linked:false},{key:'toString',width:400,height:800},{key:'large',width:10,height:10},{key:'android',width:412,height:915},{key:'ipad',width:820,height:1180}],focus:9,frame:false,sync:false,zoom:3,shot:'full'},saved);
  assert.equal(prefs.devices.length,MAX_DEVICES-1,'at most MAX_DEVICES entries are read, invalid ones dropped');
  assert.deepEqual(prefs.devices.map(d=>d.key),['iphone','saved-abc','custom'],'unknown keys (even prototype names) become custom');
  assert.equal(prefs.focus,0);assert.equal(prefs.frame,false);assert.equal(prefs.sync,false);assert.equal(prefs.zoom,'fit');assert.equal(prefs.shot,'full');
  assert.deepEqual(prefs.devices.map(d=>d.linked),[true,false,true],'devices stay linked unless explicitly unlinked');
  assert.deepEqual(cleanPrefs(undefined),{devices:[{key:'iphone',width:393,height:852,linked:true}],focus:0,agent:'desktop',frame:true,sync:true,syncInput:false,zoom:'fit',shot:'screen'});
  assert.equal(cleanPrefs({agent:'android'}).agent,'android');assert.equal(cleanPrefs({agent:'ipad'}).agent,'desktop');
  assert.equal(cleanPrefs({syncInput:true}).syncInput,true);assert.equal(cleanPrefs({syncInput:'yes'}).syncInput,false,'click sync is opt-in: only an explicit true enables it');
  assert.equal(cleanPrefs({shot:'evil'}).shot,'screen');
  assert.equal(cleanPrefs({zoom:0.5}).zoom,0.5);
});

test('full-page strips cover the page once, one screen at a time',()=>{
  assert.deepEqual(strips(800,800),[{y:0,first:true,last:true}],'short page: one strip');
  assert.deepEqual(strips(2000,800).map(s=>s.y),[0,800,1600]);
  assert.deepEqual(strips(2000,800).map(s=>[s.first,s.last]),[[true,false],[false,false],[false,true]]);
  assert.deepEqual(strips(0,800),[{y:0,first:true,last:true}]);
});

test('phone user agents and their header rule',()=>{
  assert.deepEqual(AGENTS,['desktop','iphone','android']);
  assert.equal(userAgent('desktop','153'),null);
  assert.match(userAgent('iphone','153'),/^Mozilla\/5\.0 \(iPhone; CPU iPhone OS \d+_\d+ like Mac OS X\).* Mobile\/\w+ Safari\/604\.1$/);
  assert.match(userAgent('android','153'),/Android 10; K\).*Chrome\/153\.0\.0\.0 Mobile Safari\/537\.36$/);
  assert.deepEqual([ruleCount('desktop'),ruleCount('iphone'),ruleCount('android')],[2,3,3]);
  assert.equal(framingRules(7,[1,2]).length,2,'desktop adds no header rule');
  const [, , iphone]=framingRules(7,[1,2,3],'iphone','153');
  assert.equal(iphone.id,3);
  assert.deepEqual(iphone.action.requestHeaders.map(h=>[h.header,h.operation]),[['user-agent','set'],['sec-ch-ua','remove'],['sec-ch-ua-mobile','remove'],['sec-ch-ua-platform','remove']]);
  const [, , android]=framingRules(7,[1,2,3],'android','153');
  assert.deepEqual(android.action.requestHeaders.slice(1),[{header:'sec-ch-ua-mobile',operation:'set',value:'?1'},{header:'sec-ch-ua-platform',operation:'set',value:'"Android"'}]);
  assert.deepEqual(android.condition,{tabIds:[7],excludedResourceTypes:['main_frame']});
});
