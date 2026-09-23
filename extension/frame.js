// Registered for every http(s) frame, but acts only as the page directly inside
// Viewport Studio. Normal tabs, nested iframes and other extensions exit here.
(() => {
  const ancestors = location.ancestorOrigins;
  if (ancestors?.length !== 1 || ancestors[0] !== chrome.runtime.getURL('').slice(0, -1)) return;
  // Phones overlay their scrollbars; a desktop gutter would steal ~15px of layout width.
  const style = document.createElement('style');
  style.textContent = '*{scrollbar-width:none!important}';
  (document.head || document.documentElement)?.append(style);
  // Studio cannot read a cross-origin frame's URL, so the page reports it.
  let reported = '';
  const report = () => {
    if (location.href === reported) return;
    reported = location.href;
    chrome.runtime.sendMessage({ type: 'frame-url', url: reported }).catch(() => {});
  };
  report();
  // Single-page apps change URL without reloading; a string compare covers every router.
  setInterval(report, 500);
})();
