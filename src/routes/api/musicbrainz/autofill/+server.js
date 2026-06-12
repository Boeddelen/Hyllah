// ─────────────────────────────────────────────────────────────────────────
// GET /api/musicbrainz/autofill?mbid=UUID
//
// Returns everything needed to autofill the record form from MusicBrainz:
//  - Release metadata (artist, title, label, year, genre, format, country)
//  - Cover image URL (from the Cover Art Archive, when available)
//  - Tracklist
//
// Deliberately mirrors the response shape of /api/discogs/autofill so the
// record modal handles both sources the same way. MusicBrainz has no price
// data — pricing stays a Discogs concern, handled separately.
// ─────────────────────────────────────────────────────────────────────────

import { error, json } from '@sveltejs/kit';
import { getRelease, MBID_RE } from '$lib/server/musicbrainz.js';

/** Join MusicBrainz artist-credit array into one display string. */
function joinArtistCredit(credit) {
  if (!Array.isArray(credit) || credit.length === 0) return null;
  const s = credit
    .map((c) => `${c.name ?? ''}${c.joinphrase ?? ''}`)
    .join('')
    .trim();
  return s.length > 0 ? s : null;
}

/** First label name, if any. */
function pickLabel(labelInfo) {
  if (!Array.isArray(labelInfo) || labelInfo.length === 0) return null;
  return labelInfo[0]?.label?.name ?? null;
}

/**
 * Join release genres into a comma-separated string.
 * MusicBrainz genres are lowercase ("black metal") and carry vote counts;
 * take the most-voted few and title-case them to match how Discogs genres
 * already look in the app.
 */
function joinGenres(genres) {
  if (!Array.isArray(genres) || genres.length === 0) return null;
  const names = [...genres]
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, 4)
    .map((g) => (g.name ?? '').replace(/\b\w/g, (ch) => ch.toUpperCase()))
    .filter(Boolean);
  return names.length > 0 ? names.join(', ') : null;
}

/** Map a MusicBrainz media format string to our format enum. */
function pickFormat(media) {
  if (!Array.isArray(media) || media.length === 0) return null;
  const name = (media[0]?.format ?? '').toLowerCase();
  if (!name) return null;
  if (name.includes('vinyl')) return 'vinyl';
  if (name.includes('cd')) return 'cd';
  if (name.includes('cassette')) return 'cassette';
  if (name.includes('reel')) return 'reel_to_reel';
  if (name.includes('8-track')) return 'eight_track';
  if (name.includes('minidisc')) return 'minidisc';
  if (name.includes('digital')) return 'digital';
  return null;
}

/** Milliseconds → "m:ss" (MusicBrainz stores track length in ms). */
function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/** Flatten all media (discs/sides) into one tracklist payload. */
function buildTracklist(media) {
  if (!Array.isArray(media)) return [];
  const out = [];
  for (const m of media) {
    for (const t of m.tracks ?? []) {
      const title = (t.title ?? t.recording?.title ?? '').slice(0, 300);
      if (!title) continue;
      out.push({
        position: (t.number ?? t.position ?? '').toString().slice(0, 12) || null,
        title,
        duration: fmtDuration(t.length ?? t.recording?.length),
        sort_order: out.length
      });
    }
  }
  return out;
}

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ url, locals: { safeGetSession } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  const mbid = url.searchParams.get('mbid');
  if (!mbid || !MBID_RE.test(mbid)) {
    throw error(400, 'Invalid mbid');
  }

  // Metadata only — deliberately NO cover art here. The Cover Art Archive
  // takes ~2s to answer (measured), so waiting on it made every autofill
  // slow. The client fetches /api/musicbrainz/cover in the background after
  // the fields are already filled.
  const t0 = Date.now();
  let releaseResult;
  try {
    releaseResult = { ok: true, value: await getRelease(mbid) };
  } catch (reason) {
    releaseResult = { ok: false, reason };
  }
  console.log(`[mb-autofill] mbid=${mbid} mb=${Date.now() - t0}ms`);

  if (!releaseResult.ok) {
    console.error('[mb-autofill] release fetch failed:', releaseResult.reason?.message);
    throw error(502, `Could not load release: ${releaseResult.reason?.message ?? 'unknown'}`);
  }

  const release = releaseResult.value;

  return json({
    mbid: release.id,
    artist: joinArtistCredit(release['artist-credit']),
    title: release.title ?? null,
    label: pickLabel(release['label-info']),
    year: typeof release.date === 'string' && release.date.length >= 4 ? release.date.slice(0, 4) : null,
    genre: joinGenres(release.genres),
    format: pickFormat(release.media),
    tracklist: buildTracklist(release.media)
  });
};
