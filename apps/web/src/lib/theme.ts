export type Theme = 'light' | 'dark';
const KEY = 'pms-theme';
export function getTheme(): Theme {
  try { return (localStorage.getItem(KEY) as Theme) || 'light'; } catch { return 'light'; }
}
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}
