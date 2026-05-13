// Shared label/icon mappings for record formats and conditions.
// Keeps display logic out of the components.

/** @type {Record<string, { label: string, icon: string }>} */
export const FORMATS = {
  vinyl: { label: 'Vinyl', icon: '⚫' },
  cd: { label: 'CD', icon: '💿' },
  cassette: { label: 'Cassette', icon: '📼' },
  reel_to_reel: { label: 'Reel-to-reel', icon: '🎞️' },
  eight_track: { label: '8-track', icon: '📻' },
  minidisc: { label: 'MiniDisc', icon: '💾' },
  digital: { label: 'Digital', icon: '🎵' }
};

/** @type {Record<string, string>} */
export const CONDITIONS = {
  M: 'Mint',
  NM: 'Near Mint',
  VG_PLUS: 'Very Good Plus',
  VG: 'Very Good',
  G_PLUS: 'Good Plus',
  G: 'Good',
  F: 'Fair',
  P: 'Poor'
};

/** Short display form (e.g. "VG+" not "VG_PLUS") */
export function shortCondition(code) {
  if (!code) return '';
  return code.replace('_PLUS', '+');
}

/** Available collection icons for the icon picker */
export const COLLECTION_ICONS = [
  '💿', '⚫', '📼', '🎵', '🎸', '🎹', '🎷', '🥁',
  '🎤', '🎧', '📻', '🎼', '⭐', '❤️', '🔥', '💎',
  '📚', '🗃️', '📦', '🏷️'
];
