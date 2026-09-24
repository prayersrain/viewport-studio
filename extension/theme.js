// Loaded before the stylesheet so a forced theme never flashes the other one.
// Auto (no attribute) follows the system through prefers-color-scheme.
try {
  const theme = localStorage.getItem('viewport-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch { /* storage blocked: follow the system */ }
