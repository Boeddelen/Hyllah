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
    swatches: { dark: ['#161e18', '#cda84e', '#ede8dc'], light: ['#eef0e8', '#7d6420', '#1a221b'] }
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

// ── Accessibility ─────────────────────────────────────────────────────

const A11Y_KEYS = {
  reducedMotion:  'rv-a11y-reduced-motion',
  highContrast:   'rv-a11y-high-contrast',
  largeText:      'rv-a11y-large-text',
  colorBlind:     'rv-a11y-colorblind'
};

const A11Y_ATTRS = {
  reducedMotion:  'data-reduced-motion',
  highContrast:   'data-high-contrast',
  largeText:      'data-large-text',
  colorBlind:     'data-colorblind'
};

/**
 * Get current accessibility settings.
 * @returns {{ reducedMotion: boolean, highContrast: boolean, largeText: boolean, colorBlind: boolean }}
 */
export function getA11ySettings() {
  if (typeof document === 'undefined') {
    return { reducedMotion: false, highContrast: false, largeText: false, colorBlind: false };
  }
  const el = document.documentElement;
  return {
    reducedMotion: el.hasAttribute(A11Y_ATTRS.reducedMotion),
    highContrast:  el.hasAttribute(A11Y_ATTRS.highContrast),
    largeText:     el.hasAttribute(A11Y_ATTRS.largeText),
    colorBlind:    el.hasAttribute(A11Y_ATTRS.colorBlind)
  };
}

/**
 * Set a single accessibility option.
 * @param {'reducedMotion'|'highContrast'|'largeText'|'colorBlind'} key
 * @param {boolean} enabled
 */
export function setA11y(key, enabled) {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  const attr = A11Y_ATTRS[key];
  const storageKey = A11Y_KEYS[key];
  if (!attr) return;

  if (enabled) {
    el.setAttribute(attr, '');
    try { localStorage.setItem(storageKey, '1'); } catch { /* noop */ }
  } else {
    el.removeAttribute(attr);
    try { localStorage.removeItem(storageKey); } catch { /* noop */ }
  }
}

/** Initialize accessibility settings from localStorage. Called on app mount. */
export function initA11y() {
  if (typeof document === 'undefined') return;
  const el = document.documentElement;
  for (const [key, storageKey] of Object.entries(A11Y_KEYS)) {
    try {
      if (localStorage.getItem(storageKey) === '1') {
        el.setAttribute(A11Y_ATTRS[key], '');
      }
    } catch { /* noop */ }
  }
}
