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
