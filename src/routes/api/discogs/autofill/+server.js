// ─────────────────────────────────────────────────────────────────────────
// GET /api/discogs/autofill?releaseId=NNN
//
// Single endpoint that returns everything needed to autofill the record form:
//  - Release metadata (artist, title, label, year, genre, format, country)
//  - Cover image URL
//  - Tracklist
//  - Price suggestions per condition (or null if seller settings not set)
//
// Runs both the release fetch and the price fetch in parallel for speed.
// Price failures are NON-fatal — autofill still works without prices.
// ─────────────────────────────────────────────────────────────────────────

import { error, json } from '@sveltejs/kit';
import { getRelease, getPriceSuggestions } from '$lib/server/discogs.js';
import { getUserDiscogsTokens } from '$lib/server/discogs-user.js';

/** Pick the best image URL from a Discogs release. Prefer primary, then any. */
function pickImage(release) {
  const imgs = release?.images;
  if (!Array.isArray(imgs) || imgs.length === 0) return null;
  const primary = imgs.find((i) => i.type === 'primary');
  return (primary?.uri ?? imgs[0].uri) || null;
}

/** Join multiple artist names (Discogs returns an array). */
function joinArtists(artists) {
  if (!Array.isArray(artists) || artists.length === 0) return null;
  return artists
    .map((a) => {
      // Discogs sometimes includes a duplicate suffix like "Nirvana (2)"
      // for disambiguation. Strip it.
      const name = (a.name ?? '').replace(/\s*\(\d+\)$/, '').trim();
      const join = a.join ? ` ${a.join.trim()} ` : '';
      return name + join;
    })
    .join('')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Pick the first label name from Discogs' labels array. */
function pickLabel(labels) {
  if (!Array.isArray(labels) || labels.length === 0) return null;
  return labels[0]?.name ?? null;
}

/** Join multiple genres/styles into one comma-separated string. */
function joinGenres(release) {
  const list = [...(release.genres ?? []), ...(release.styles ?? [])];
  // de-dupe case-insensitively, preserve original casing
  const seen = new Set();
  const unique = [];
  for (const g of list) {
    const key = g.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(g);
    }
  }
  return unique.length > 0 ? unique.join(', ') : null;
}

/** Map Discogs format names to our format enum. Falls back to 'vinyl'. */
function pickFormat(release) {
  const fmts = release?.formats;
  if (!Array.isArray(fmts) || fmts.length === 0) return null;
  const name = (fmts[0]?.name ?? '').toLowerCase();
  if (name.includes('vinyl')) return 'vinyl';
  if (name.includes('cd')) return 'cd';
  if (name.includes('cassette')) return 'cassette';
  if (name.includes('reel')) return 'reel_to_reel';
  if (name.includes('8') && name.includes('track')) return 'eight_track';
  if (name.includes('minidisc')) return 'minidisc';
  if (name.includes('file') || name.includes('digital')) return 'digital';
  return null;
}

/** Build a tracklist payload from Discogs' tracklist array. */
function buildTracklist(tracklist) {
  if (!Array.isArray(tracklist)) return [];
  return tracklist
    .filter((t) => t.type_ === 'track' || !t.type_) // skip headings, indexes
    .map((t, idx) => ({
      position: t.position?.toString().slice(0, 12) ?? null,
      title: (t.title ?? '').slice(0, 300),
      duration: t.duration?.toString().slice(0, 12) ?? null,
      sort_order: idx
    }))
    .filter((t) => t.title.length > 0);
}

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ url, locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  const releaseId = url.searchParams.get('releaseId');
  if (!releaseId || !/^\d+$/.test(releaseId)) {
    throw error(400, 'Invalid releaseId');
  }

  const { accessToken, accessTokenSecret } = await getUserDiscogsTokens(supabase, user.id);

  // Run release + prices in parallel. Price failures are non-fatal.
  const [releaseResult, pricesResult] = await Promise.allSettled([
    getRelease(releaseId, accessToken, accessTokenSecret),
    getPriceSuggestions(releaseId, accessToken, accessTokenSecret)
  ]);

  if (releaseResult.status === 'rejected') {
    console.error('Discogs release fetch failed:', releaseResult.reason);
    throw error(502, `Could not load release: ${releaseResult.reason?.message ?? 'unknown'}`);
  }

  const release = releaseResult.value;
  let prices = null;
  let priceError = null;
  if (pricesResult.status === 'fulfilled') {
    prices = pricesResult.value;
  } else {
    const msg = pricesResult.reason?.message ?? '';
    if (msg.startsWith('SELLER_SETTINGS_REQUIRED:')) {
      priceError = 'seller_settings';
    } else {
      priceError = 'unavailable';
      console.warn('Price fetch failed (non-fatal):', msg);
    }
  }

  return json({
    discogs_id: String(release.id),
    artist: joinArtists(release.artists),
    title: release.title ?? null,
    label: pickLabel(release.labels),
    year: release.year ? String(release.year) : null,
    genre: joinGenres(release),
    format: pickFormat(release),
    image_url: pickImage(release),
    tracklist: buildTracklist(release.tracklist),
    prices,
    price_error: priceError
  });
};
