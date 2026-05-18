// Tiny client-side theme module. Persists to localStorage and toggles
// the data-theme attribute on <html>. SSR-safe: all access guarded.

const STORAGE_KEY = 'rv-theme';

/** @returns {'dark' | 'light'} */
export function getTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/** @param {'dark' | 'light'} theme */
export function setTheme(theme) {
  if (typeof document === 'undefined') return;
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode or quota — accept silent failure */
  }
}

export function toggleTheme() {
  setTheme(getTheme() === 'light' ? 'dark' : 'light');
}
