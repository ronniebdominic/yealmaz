// Ye-Almaz — dark / light theme.
//
// The theme is a `data-theme` attribute on <html>; index.css redefines the
// design tokens under :root[data-theme="light"], so every component that uses
// var(--surface) etc. follows automatically. The choice is remembered per
// browser. Dark is the default (it is what the app has always looked like), so
// nobody's screen changes until they press the toggle.
//
// index.html applies the stored value before first paint (no flash of the wrong
// theme); this module keeps it in sync afterwards and lets any number of
// toggles share one state.
const KEY = 'ya_theme';
const EVENT = 'ya-theme-change';
const CHROME = { dark: '#0F2044', light: '#EEF2F8' };   // <meta name="theme-color">

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'light' || t === 'dark') return t;
  } catch { /* storage blocked - fall through to the default */ }
  return 'dark';
}

export function applyTheme(theme) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[t]);
  return t;
}

export function setTheme(theme) {
  const t = applyTheme(theme);
  try { localStorage.setItem(KEY, t); } catch { /* not persisted; still applied for this session */ }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeTheme(cb) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);   // another tab changed it
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb); };
}

export function initTheme() { applyTheme(getTheme()); }
