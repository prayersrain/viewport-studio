import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../extension/frame.js', import.meta.url), 'utf8');
const event = () => { const listeners = []; return { addListener: fn => listeners.push(fn), fire: (...args) => listeners.forEach(fn => fn(...args)) }; };
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

// Minimal element: inline style, computed position/top and a bounding box.
function element(tagName, { id = '', position = 'static', top = 'auto', box = { top: 0, height: 10 }, parent = null } = {}) {
  const props = {};
  const node = {
    tagName, id, parentElement: parent, children: [], isConnected: true, computed: { position, top }, box,
    scrollLeft: 0, scrollTop: 0, scrollWidth: 1000, clientWidth: 400, scrollHeight: 400, clientHeight: 400,
    style: { setProperty: (name, value, priority = '') => { props[name] = [value, priority]; }, getPropertyValue: name => props[name]?.[0] ?? '', getPropertyPriority: name => props[name]?.[1] ?? '' },
    getBoundingClientRect: () => node.box,
    scrollTo(options) { node.scrolled = options; },
  };
  parent?.children.push(node);
  return node;
}

function run(ancestorOrigins, { href = 'https://site.example/', name = 'viewport-a', manualFrames = true, overlays = [] } = {}) {
  const sent = [], appended = [], timers = [], frames = [], connects = [], docEvents = {};
  const port = { onMessage: event(), onDisconnect: event(), postMessage: message => sent.push(message) };
  const html = element('HTML'), body = element('BODY', { parent: html });
  const clock = { now: 1000 };
  const context = {
    location: { href, ancestorOrigins }, name, innerHeight: 800, scrollX: 0, scrollY: 0, scrolledTo: null,
    document: {
      head: null, documentElement: html, body, scrollingElement: { scrollHeight: 2800 },
      append: node => appended.push(node), createElement: () => ({}),
      addEventListener: (type, fn, options) => { docEvents[type] = { fn, options }; },
      querySelector: selector => context.lookup?.[selector] ?? null,
      createTreeWalker: root => { const list = [root, ...overlays]; let index = 0; return { get currentNode() { return list[index]; }, nextNode: () => list[++index] ?? null }; },
    },
    CSS: { escape: value => value.replace(/[^\w-]/g, '\\$&') }, NodeFilter: { SHOW_ELEMENT: 1 },
    getComputedStyle: node => node.computed ?? { position: 'static', top: 'auto' },
    chrome: { runtime: { getURL: path => 'chrome-extension://viewport/' + path, connect: info => { connects.push(info); return port; } } },
    setInterval: fn => { timers.push(fn); return timers.length; }, clearInterval: () => {},
    requestAnimationFrame: fn => manualFrames ? frames.push(fn) : setTimeout(fn, 0),
    performance: { now: () => clock.now },
    scrollTo(options) { context.scrollY = Math.min(options.top, 2000); context.scrolledTo = options; },
  };
  context.document.documentElement.append = node => appended.push(node);
  context.window = context;
  vm.runInNewContext(source, context);
  const scroll = target => docEvents.scroll.fn({ target: target ?? context.document });
  // Objects built inside the vm realm have foreign prototypes; compare plain copies.
  const plain = value => JSON.parse(JSON.stringify(value));
  async function request(message) {
    const id = Math.random();
    port.onMessage.fire({ ...message, id });
    for (let i = 0; i < 50; i++) { const reply = sent.find(m => m.id === id); if (reply) return plain(reply); await tick(); }
    throw Error('no reply to ' + message.type);
  }
  return { appended, sent: () => plain(sent), timers, frames, context, port, clock, connects, docEvents, scroll, request, body };
}

test('normal tabs, nested frames and other extensions are left untouched', () => {
  for (const ancestors of [[], ['https://parent.example'], ['https://site.example', 'chrome-extension://viewport'], ['chrome-extension://someone-else']]) {
    const result = run(ancestors);
    assert.deepEqual([result.appended.length, result.connects.length, result.timers.length], [0, 0, 0], JSON.stringify(ancestors));
  }
});

test('page inside Studio hides desktop scrollbars and reports URL changes with its device name', () => {
  const { appended, sent, timers, context, connects } = run(['chrome-extension://viewport']);
  assert.equal(appended.length, 1);
  assert.match(appended[0].textContent, /scrollbar-width:none/);
  assert.equal(connects[0].name, 'viewport-frame');
  assert.deepEqual(sent(), [{ slot: 'viewport-a', type: 'url', url: 'https://site.example/' }]);
  timers[0]();
  assert.equal(sent().length, 1, 'unchanged URL is not re-sent');
  context.name = 'renamed-by-site';
  context.location.href = 'https://site.example/#/orders';
  timers[0]();
  assert.deepEqual(sent().at(-1), { slot: 'viewport-a', type: 'url', url: 'https://site.example/#/orders' }, 'name is captured before page scripts run');
});

test('page scroll is shared as a fraction only when Studio enables sync, without echoes', () => {
  const { sent, frames, context, port, clock, scroll, docEvents } = run(['chrome-extension://viewport']);
  assert.equal(docEvents.scroll.options.capture, true, 'captures inner scroll events too');
  context.scrollY = 1000; scroll();
  assert.equal(frames.length, 0, 'sync is off until Studio says otherwise');
  port.onMessage.fire({ type: 'sync', scroll: true });
  scroll(); scroll();
  assert.equal(frames.length, 1, 'bursts coalesce into one animation frame');
  frames[0]();
  assert.deepEqual(sent().at(-1), { slot: 'viewport-a', type: 'scroll', path: '', y: 0.5 });
  port.onMessage.fire({ type: 'scroll', path: '', y: 0.25 });
  assert.deepEqual(JSON.parse(JSON.stringify(context.scrolledTo)), { left: 0, top: 500, behavior: 'instant' }, 'instant even when the site uses smooth scrolling');
  scroll();
  assert.equal(frames.length, 1, 'scroll caused by Studio is not reported back');
  clock.now += 300; scroll();
  assert.equal(frames.length, 2);
  port.onMessage.fire({ type: 'scroll', path: '', y: 7 });
  assert.equal(context.scrolledTo.top, 2000, 'fractions are clamped');
});

test('inner scroll containers are matched by id or structural path', () => {
  const { sent, frames, port, clock, scroll, context, body } = run(['chrome-extension://viewport']);
  port.onMessage.fire({ type: 'sync', scroll: true });
  const rail = element('DIV', { id: 'rail', parent: body });
  rail.scrollLeft = 300;
  scroll(rail); frames.shift()();
  assert.deepEqual(sent().at(-1), { slot: 'viewport-a', type: 'scroll', path: '#rail', x: 0.5, y: 0 });
  element('DIV', { parent: body });
  const second = element('DIV', { parent: body }), list = element('UL', { parent: second });
  list.scrollTop = 0; list.scrollHeight = 900; list.clientHeight = 300; list.scrollTop = 300;
  scroll(list); frames.shift()();
  assert.equal(sent().at(-1).path, 'body>div:nth-of-type(3)>ul');
  assert.equal(sent().at(-1).y, 0.5);
  context.lookup = { '#rail': rail };
  clock.now += 300;
  port.onMessage.fire({ type: 'scroll', path: '#rail', x: 0.25, y: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(rail.scrolled)), { left: 150, top: 0, behavior: 'instant' });
  assert.doesNotThrow(() => port.onMessage.fire({ type: 'scroll', path: '#missing', x: 1, y: 1 }), 'a container missing in this layout is ignored');
});

test('full-page strips show fixed bars once and hide stuck headers, then restore everything', async () => {
  const header = element('HEADER', { position: 'fixed', box: { top: 0, height: 60 } });
  const bottomBar = element('NAV', { position: 'fixed', box: { top: 740, height: 60 } });
  const sticky = element('DIV', { position: 'sticky', top: '0px', box: { top: 300, height: 40 } });
  header.style.setProperty('visibility', 'visible', 'important');
  const { request, context, sent, frames, scroll, port } = run(['chrome-extension://viewport'], { manualFrames: false, overlays: [header, bottomBar, sticky] });
  port.onMessage.fire({ type: 'sync', scroll: true });
  context.scrollY = 1234;
  assert.deepEqual(await request({ type: 'measure' }), { slot: 'viewport-a', type: 'reply', id: sent().at(-1).id, height: 800, scrollHeight: 2800 });
  const shown = node => node.style.getPropertyValue('visibility') !== 'hidden';

  assert.equal((await request({ type: 'shoot', y: 0, first: true, last: false })).y, 0);
  assert.deepEqual([shown(header), shown(bottomBar), shown(sticky)], [true, false, true], 'first strip: top bar and sticky at their place, bottom bar waits');
  scroll(); assert.equal(frames.length, 0, 'strip scrolling is not shared with other devices');

  sticky.box = { top: 0, height: 40 };
  assert.equal((await request({ type: 'shoot', y: 800, first: false, last: false })).y, 800);
  assert.deepEqual([shown(header), shown(bottomBar), shown(sticky)], [false, false, false], 'middle strip: no repeats');

  assert.equal((await request({ type: 'shoot', y: 2400, first: false, last: true })).y, 2000, 'reply carries the real, clamped position');
  assert.deepEqual([shown(header), shown(bottomBar), shown(sticky)], [false, true, false], 'last strip: bottom bar appears once');

  await request({ type: 'restore' });
  assert.equal(context.scrollY, 1234, 'reader position restored');
  assert.deepEqual([header.style.getPropertyValue('visibility'), header.style.getPropertyPriority('visibility')], ['visible', 'important'], 'original inline style restored');
  assert.deepEqual([shown(bottomBar), shown(sticky)], [true, true]);
});
