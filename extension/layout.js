// Observe only available width. Geometry writes height, which must not trigger
// another layout calculation inside ResizeObserver's delivery phase.
export function observePreviewWidth(element, update, {
  Observer = ResizeObserver,
  schedule = requestAnimationFrame,
  cancel = cancelAnimationFrame,
} = {}) {
  let previousWidth = null;
  let pending = null;
  const observer = new Observer(entries => {
    const entry = entries.find(item => item.target === element);
    if (!entry) return;
    const width = Math.round(entry.contentRect.width * 100) / 100;
    if (width === previousWidth) return;
    previousWidth = width;
    if (pending !== null) return;
    pending = schedule(() => {
      pending = null;
      update();
    });
  });
  observer.observe(element);
  return () => {
    observer.disconnect();
    if (pending !== null) cancel(pending);
    pending = null;
  };
}
