// ─────────────────────────────────────────────────────────────────────────
// Theme system — manages theme (visual identity) + mode (dark/light).
//
// Theme = the color palette + typography (listening-room, neon-abyss, etc.)
// Mode  = dark or light variant of that theme
//
// Both are applied via data attributes on <html>:
//   data-theme="neon-abyss" data-mode="light"
//
// Storage: localStorage keys rv-theme-id and rv-mode.
// SSR-safe: all DOM access guarded by typeof document check.
// ─────────────────────────────────────────────────────────────────────────

const THEME_KEY = 'rv-theme-id';
const MODE_KEY = 'rv-mode';

/** All available themes. Add new ones here + a CSS block in app.css. */
export const THEMES = [
  {
    id: 'listening-room',
    name: 'Listening room',
    genre: 'Warm · analog · vinyl den',
    fonts: 'Cormorant Garamond + DM Mono',
    swatches: { dark: ['#1a1612', '#d4a356', '#f0ebe3'], light: ['#f5f0e8', '#9a7030', '#1a1714'] }
  },
  {
    id: 'neon-abyss',
    name: 'Neon abyss',
    genre: 'Cyberpunk · dark synth · electric',
    fonts: 'JetBrains Mono',
    swatches: { dark: ['#08090f', '#ff2a6d', '#dce4ff'], light: ['#eef0f8', '#d41a58', '#0a0c18'] }
  },
  {
    id: 'black-frost',
    name: 'Black frost',
    genre: 'Black metal · raw · monochrome',
    fonts: 'Playfair Display + IBM Plex Mono',
    swatches: { dark: ['#090909', '#888888', '#aaaaaa'], light: ['#f0efed', '#3a3a3a', '#1a1a1a'] }
  },
  {
    id: 'concrete',
    name: 'Concrete',
    genre: 'Hip hop · gritty · brutalist',
    fonts: 'Space Grotesk + JetBrains Mono',
    swatches: { dark: ['#121214', '#e85d3a', '#eaeaea'], light: ['#f2f2f4', '#c84a28', '#121214'] }
  }
];

/** Valid theme IDs for validation. */
const VALID_THEMES = new Set(THEMES.map((t) => t.id));

// ── Getters ──────────────────────────────────────────────────────────

/** @returns {string} Current theme ID. */
export function getThemeId() {
  if (typeof document === 'undefined') return 'listening-room';
  return document.documentElement.getAttribute('data-theme') || 'listening-room';
}

/** @returns {'dark' | 'light'} Current mode. */
export function getMode() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.getAttribute('data-mode') === 'light' ? 'light' : 'dark';
}

// Legacy compat — old code calls getTheme() expecting 'dark' | 'light'
export function getTheme() {
  return getMode();
}

// ── Setters ──────────────────────────────────────────────────────────

/** @param {string} themeId */
export function setThemeId(themeId) {
  if (typeof document === 'undefined') return;
  const id = VALID_THEMES.has(themeId) ? themeId : 'listening-room';
  document.documentElement.setAttribute('data-theme', id);
  try { localStorage.setItem(THEME_KEY, id); } catch { /* noop */ }
}

/** @param {'dark' | 'light'} mode */
export function setMode(mode) {
  if (typeof document === 'undefined') return;
  const m = mode === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-mode', m);
  try { localStorage.setItem(MODE_KEY, m); } catch { /* noop */ }
}

// Legacy compat — old code calls setTheme('dark' | 'light')
export function setTheme(modeOrTheme) {
  if (modeOrTheme === 'dark' || modeOrTheme === 'light') {
    setMode(modeOrTheme);
  }
}

/** Set both theme and mode at once. */
export function applyTheme(themeId, mode) {
  setThemeId(themeId);
  setMode(mode);
}

/** Initialize from localStorage. Called on app mount. */
export function initTheme() {
  if (typeof document === 'undefined') return;
  try {
    const storedTheme = localStorage.getItem(THEME_KEY);
    const storedMode = localStorage.getItem(MODE_KEY);

    if (storedTheme && VALID_THEMES.has(storedTheme)) {
      document.documentElement.setAttribute('data-theme', storedTheme);
    }

    if (storedMode === 'light' || storedMode === 'dark') {
      document.documentElement.setAttribute('data-mode', storedMode);
    }
  } catch { /* noop */ }
}
