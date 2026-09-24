import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { userAgent } from '../extension/core.js';
const source = await readFile(new URL('../extension/agent.js', import.meta.url), 'utf8');
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

// A page world with a real Navigator prototype, as agent.js patches getters on it.
function page({ name, ancestors = ['chrome-extension://viewport'] }) {
  const context = vm.createContext({ location: { ancestorOrigins: ancestors } });
  vm.runInContext(`
    class Navigator {}
    Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => ${JSON.stringify(DESKTOP)}, configurable: true });
    Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'Win32', configurable: true });
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => ({ brands: [{ brand: 'Chromium', version: '153' }], mobile: false, platform: 'Windows',
      getHighEntropyValues: async () => ({ mobile: false, platform: 'Windows', architecture: 'x86', bitness: '64' }) }), configurable: true });
    var navigator = new Navigator(), window = { name: ${JSON.stringify(name)} };`, context);
  vm.runInContext(source, context);
  return vm.runInContext('navigator', context);
}

test('only devices inside Studio that asked for a phone agent are changed', () => {
  for (const [name, ancestors] of [['viewport-a-0', undefined], ['viewport-a-0|desktop', undefined], ['viewport-a-0|iphone', []],
    ['viewport-a-0|iphone', ['https://evil.example']], ['viewport-a-0|iphone', ['https://site.example', 'chrome-extension://viewport']], ['my-frame|iphone', undefined]]) {
    assert.equal(page({ name, ancestors }).userAgent, DESKTOP, `${name} / ${JSON.stringify(ancestors)}`);
  }
});

test('page scripts see the same iPhone agent the server receives, and no client hints', () => {
  const navigator = page({ name: 'viewport-a-0|iphone' });
  assert.equal(navigator.userAgent, userAgent('iphone', '153'), 'agent.js and core.js must stay in step');
  assert.equal(navigator.platform, 'iPhone');
  assert.equal(navigator.vendor, 'Apple Computer, Inc.');
  assert.equal(navigator.appVersion, navigator.userAgent.slice(8));
  assert.equal(navigator.userAgentData, undefined, 'Safari has no userAgentData');
});

test('Android keeps the Chrome version and reports a mobile Android device', async () => {
  const navigator = page({ name: 'viewport-b-1|android' });
  assert.equal(navigator.userAgent, userAgent('android', '153'));
  assert.match(navigator.userAgent, /Chrome\/153\.0\.0\.0 Mobile/);
  assert.equal(navigator.userAgentData.mobile, true);
  assert.equal(navigator.userAgentData.platform, 'Android');
  const high = await navigator.userAgentData.getHighEntropyValues(['platform', 'model']);
  assert.equal(high.platform, 'Android'); assert.equal(high.mobile, true); assert.equal(high.architecture, '');
});
