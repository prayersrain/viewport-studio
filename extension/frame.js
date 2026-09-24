// Registered for every http(s) frame, but acts only as the page directly inside
// Viewport Studio. Normal tabs, nested iframes and other extensions exit here.
(() => {
  const ancestors = location.ancestorOrigins;
  if (ancestors?.length !== 1 || ancestors[0] !== chrome.runtime.getURL('').slice(0, -1)) return;
  // Phones overlay their scrollbars; a desktop gutter would steal ~15px of layout width.
  const style = document.createElement('style');
  style.textContent = '*{scrollbar-width:none!important}';
  (document.head || document.documentElement)?.append(style);

  // A port goes only to extension pages, so the site cannot forge these messages.
  // Studio names each iframe; the name is read before page scripts can change it.
  const port = chrome.runtime.connect({ name: 'viewport-frame' }), slot = window.name;
  let open = true, reported = '', shareScroll = false, shareInput = false, quietUntil = 0, shooting = null;
  const post = message => { if (open) try { port.postMessage({ slot, ...message }); } catch { open = false; } };
  // Studio cannot read a cross-origin frame's URL, so the page reports it.
  const report = () => { if (location.href !== reported) post({ type: 'url', url: reported = location.href }); };
  report();
  // Single-page apps change URL without reloading; a string compare covers every router.
  const timer = setInterval(report, 500);
  port.onDisconnect.addListener(() => { open = false; clearInterval(timer); });

  // ---- Scroll sync ----
  // Positions travel as fractions: devices lay the same page out at different lengths.
  // Inner scroll containers are matched across devices by their structural path.
  const fraction = (position, max) => max > 0 ? position / max : 0;
  const pageMax = () => Math.max(0, (document.scrollingElement?.scrollHeight ?? 0) - innerHeight);
  function pathOf(element) {
    const parts = [];
    for (let node = element; node && node !== document.documentElement && parts.length < 16; node = node.parentElement) {
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); return parts.join('>'); }
      const twins = node.parentElement ? [...node.parentElement.children].filter(child => child.tagName === node.tagName) : [];
      parts.unshift(node.tagName.toLowerCase() + (twins.length > 1 ? `:nth-of-type(${twins.indexOf(node) + 1})` : ''));
    }
    return parts.join('>');
  }
  const queued = new Set();
  document.addEventListener('scroll', event => {
    if (!shareScroll || shooting || performance.now() < quietUntil) return;
    const target = event.target === document ? document : event.target;
    if (queued.has(target)) return;
    if (!queued.size) requestAnimationFrame(() => {
      for (const node of queued) {
        if (node === document) post({ type: 'scroll', path: '', y: fraction(scrollY, pageMax()) });
        else if (node.isConnected) post({ type: 'scroll', path: pathOf(node), x: fraction(node.scrollLeft, node.scrollWidth - node.clientWidth), y: fraction(node.scrollTop, node.scrollHeight - node.clientHeight) });
      }
      queued.clear();
    });
    queued.add(target);
  }, { capture: true, passive: true });
  function applyScroll({ path, x, y }) {
    const clamp = value => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    // Ignore the scroll events this causes, or devices would echo each other.
    quietUntil = performance.now() + 250;
    if (!path) return scrollTo({ left: scrollX, top: clamp(y) * pageMax(), behavior: 'instant' });
    let node = null;
    try { node = document.querySelector(path); } catch { /* path from a different layout */ }
    node?.scrollTo({ left: clamp(x) * (node.scrollWidth - node.clientWidth), top: clamp(y) * (node.scrollHeight - node.clientHeight), behavior: 'instant' });
  }

  // ---- Click and typing sync (experimental, off by default) ----
  // Only real user actions are shared (isTrusted), so replayed ones never echo back.
  // Links are left to navigation sync. Passwords and files are never copied.
  const find = path => { try { return document.querySelector(path); } catch { return null; } };
  const typed = node => node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement ||
    (node instanceof HTMLInputElement && !['password', 'file', 'checkbox', 'radio', 'hidden', 'submit', 'button', 'reset', 'image'].includes(node.type));
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!shareInput || !event.isTrusted || event.button !== 0 || shooting || !target) return;
    // A label click also clicks its control; share only the control's click so toggles happen once.
    const control = target.closest('label')?.control;
    if (target.closest('a[href]') || (control && control !== target)) return;
    if (target instanceof HTMLInputElement && target.type === 'password') return;
    post({ type: 'click', path: pathOf(target) });
  }, true);
  document.addEventListener('input', event => {
    if (shareInput && event.isTrusted && !shooting && typed(event.target)) post({ type: 'input', path: pathOf(event.target), value: event.target.value });
  }, true);
  function applyClick({ path }) {
    const node = find(path);
    if (!(node instanceof HTMLElement) || node.closest('a[href]')) return;
    // Menus that open on pointer or mouse down never see a bare click(): replay the whole press.
    const box = node.getBoundingClientRect();
    const at = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
    const pointer = { ...at, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    node.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, buttons: 1 }));
    node.dispatchEvent(new MouseEvent('mousedown', { ...at, buttons: 1 }));
    node.dispatchEvent(new PointerEvent('pointerup', pointer));
    node.dispatchEvent(new MouseEvent('mouseup', at));
    node.click();
  }
  function applyInput({ path, value }) {
    const node = find(path);
    if (!typed(node) || typeof value !== 'string') return;
    // Set through the prototype and fire the events frameworks listen for.
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value')?.set?.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ---- Full-page screenshot ----
  // Studio captures one screen at a time while this page scrolls underneath.
  // Fixed bars and stuck headers are shown once, not in every strip.
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  function collectOverlays() {
    const found = [], walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.currentNode; node; node = walker.nextNode()) {
      const { position } = getComputedStyle(node);
      if (position !== 'fixed' && position !== 'sticky') continue;
      const box = node.getBoundingClientRect();
      // Top-anchored fixed elements belong to the first strip, bottom-anchored ones to the last.
      found.push({ node, position, bottom: box.top + box.height / 2 > innerHeight / 2, visibility: node.style.getPropertyValue('visibility'), priority: node.style.getPropertyPriority('visibility') });
    }
    return found;
  }
  function stuck(node) {
    const top = parseFloat(getComputedStyle(node).top);
    return Number.isFinite(top) && Math.abs(node.getBoundingClientRect().top - top) < 1;
  }
  function showOnly(first, last) {
    for (const item of shooting.overlays) {
      const hide = item.position === 'fixed' ? (item.bottom ? !last : !first) : !first && stuck(item.node);
      if (hide) item.node.style.setProperty('visibility', 'hidden', 'important');
      else item.node.style.setProperty('visibility', item.visibility, item.priority);
    }
  }
  async function shoot({ y, first, last }) {
    shooting ||= { x: scrollX, y: scrollY, overlays: [] };
    if (first) { scrollTo({ left: 0, top: 0, behavior: 'instant' }); await nextFrame(); shooting.overlays = collectOverlays(); }
    scrollTo({ left: 0, top: y, behavior: 'instant' });
    showOnly(first, last);
    await nextFrame();
    return { y: scrollY };
  }
  function restore() {
    if (!shooting) return;
    for (const item of shooting.overlays) item.node.style.setProperty('visibility', item.visibility, item.priority);
    scrollTo({ left: shooting.x, top: shooting.y, behavior: 'instant' });
    shooting = null;
  }

  port.onMessage.addListener(async message => {
    if (message.type === 'sync') { shareScroll = message.scroll === true; shareInput = message.input === true; }
    if (message.type === 'scroll') applyScroll(message);
    if (message.type === 'click') applyClick(message);
    if (message.type === 'input') applyInput(message);
    // Requests carry an id; Studio waits for the matching reply.
    const reply = data => post({ type: 'reply', id: message.id, ...data });
    if (message.type === 'measure') reply({ height: innerHeight, scrollHeight: document.scrollingElement?.scrollHeight ?? innerHeight });
    if (message.type === 'shoot') reply(await shoot(message));
    if (message.type === 'restore') { restore(); reply({}); }
  });
})();
