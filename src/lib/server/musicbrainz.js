// ─────────────────────────────────────────────────────────────────────────
// MusicBrainz API client.
//
// No authentication or secrets required — MusicBrainz is an open API.
// They DO require a meaningful User-Agent identifying the app, and ask for
// ~1 request/second. When throttled they return 503 (not 429); we retry
// once after a short wait, then give up with a clear error.
// Docs: https://musicbrainz.org/doc/MusicBrainz_API
// ─────────────────────────────────────────────────────────────────────────

const MB_BASE = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'RetroVault/1.0 (https://retrovault.no)';

/** UUID shape used by all MusicBrainz IDs (mbids). */
export const MBID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function mbRequest(path, params) {
  const url = `${MB_BASE}${path}?${new URLSearchParams({ ...params, fmt: 'json' })}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
    });

    if (res.ok) return res.json();

    // 503 = MusicBrainz asking us to slow down. Wait just over their
    // 1-second window and retry once.
    if (res.status === 503 && attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      continue;
    }

    const text = await res.text();
    let detail = text;
    try { detail = JSON.parse(text).error || text; } catch { /* not JSON */ }
    throw new Error(`MusicBrainz error ${res.status}: ${detail}`);
  }
}

/**
 * Search releases (albums/EPs/singles as physically released).
 * dismax=true gives Google-style matching across artist + title + label,
 * which suits a single free-text search box.
 */
export async function searchReleases(query, limit = 20) {
  return mbRequest('/release', {
    query,
    dismax: 'true',
    limit: String(limit)
  });
}

/**
 * Fetch one release with everything needed to autofill the record form:
 * artist credits, label, tracklist (recordings) and genres.
 */
export async function getRelease(mbid) {
  return mbRequest(`/release/${mbid}`, {
    inc: 'artist-credits+labels+recordings+genres'
  });
}

/**
 * Check the Cover Art Archive for front cover art for a release.
 * Returns the image URL if it exists, otherwise null.
 *
 * Uses the CAA index endpoint, which answers directly and fast (200 with a
 * JSON listing, or 404 if no art). The actual image files live on the
 * Internet Archive, which is slow — so we must never WAIT on archive.org
 * here, only hand the browser a URL to load lazily.
 */
export async function findCoverArt(mbid) {
  try {
    const res = await fetch(`https://coverartarchive.org/release/${mbid}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
    });
    if (!res.ok) return null; // 404 = no artwork for this release
    const data = await res.json();
    const front = (data.images ?? []).find((img) => img.front);
    if (!front) return null;
    // Prefer the 500px thumbnail (fast enough, big enough); fall back to full image.
    return front.thumbnails?.['500'] ?? front.thumbnails?.large ?? front.image ?? null;
  } catch {
    // Cover art is a nice-to-have — never fail autofill over it.
    return null;
  }
}
