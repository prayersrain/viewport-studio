import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../extension/frame.js', import.meta.url), 'utf8');

function run(ancestorOrigins, href = 'https://site.example/') {
  const appended = [], sent = [], timers = [];
  const location = { href, ancestorOrigins };
  vm.runInNewContext(source, {
    location,
    document: { head: null, documentElement: { append: node => appended.push(node) }, createElement: () => ({}) },
    chrome: { runtime: { getURL: path => 'chrome-extension://viewport/' + path, sendMessage: message => { sent.push(message); return Promise.resolve(); } } },
    setInterval: fn => timers.push(fn),
  });
  // Objects built inside the vm realm have foreign prototypes; compare plain copies.
  return { appended, sent: () => JSON.parse(JSON.stringify(sent)), timers, location };
}

test('normal tabs, nested frames and other extensions are left untouched', () => {
  for (const ancestors of [[], ['https://parent.example'], ['https://site.example', 'chrome-extension://viewport'], ['chrome-extension://someone-else']]) {
    const result = run(ancestors);
    assert.deepEqual([result.appended.length, result.sent().length, result.timers.length], [0, 0, 0], JSON.stringify(ancestors));
  }
});

test('page inside Studio hides desktop scrollbars and reports URL changes once', () => {
  const { appended, sent, timers, location } = run(['chrome-extension://viewport']);
  assert.equal(appended.length, 1);
  assert.match(appended[0].textContent, /scrollbar-width:none/);
  assert.deepEqual(sent(), [{ type: 'frame-url', url: 'https://site.example/' }]);
  timers[0]();
  assert.equal(sent().length, 1, 'unchanged URL is not re-sent');
  location.href = 'https://site.example/#/orders';
  timers[0]();
  assert.deepEqual(sent().at(-1), { type: 'frame-url', url: 'https://site.example/#/orders' });
});
