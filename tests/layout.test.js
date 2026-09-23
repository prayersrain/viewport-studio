import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observePreviewWidth } from '../extension/layout.js';

test('height feedback does not reschedule layout; width bursts coalesce outside observer delivery', () => {
  const element = {};
  let notify, updates = 0, id = 0, disconnected = false;
  const frames = new Map();
  const stop = observePreviewWidth(element, () => {
    updates++;
    // Mirrors geometry changing the observed canvas height.
    notify([{ target: element, contentRect: { width: 600, height: 1000 } }]);
  }, {
    Observer: class {
      constructor(callback) { notify = callback; }
      observe(target) { assert.equal(target, element); }
      disconnect() { disconnected = true; }
    },
    schedule(callback) { frames.set(++id, callback); return id; },
    cancel(frame) { frames.delete(frame); },
  });
  for (const width of [400, 500, 600]) notify([{ target: element, contentRect: { width, height: 700 } }]);
  assert.equal(updates, 0, 'must not mutate geometry inside ResizeObserver');
  assert.equal(frames.size, 1, 'at most one pending animation frame');
  const callback = frames.values().next().value; frames.clear(); callback();
  assert.equal(updates, 1);
  assert.equal(frames.size, 0, 'height-only feedback must not schedule more work');
  notify([{ target: element, contentRect: { width: 800, height: 1000 } }]);
  assert.equal(frames.size, 1, 'actual width changes still update layout');
  stop(); assert.equal(disconnected, true); assert.equal(frames.size, 0);
});
