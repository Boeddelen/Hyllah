import { json } from '@sveltejs/kit';
import { searchReleases } from '$lib/server/musicbrainz.js';

// Search MusicBrainz releases for the typeahead in the record modal.
//
// Same structured-200 pattern as /api/discogs/search: ALWAYS returns 200
// with a body the client can read (mobile browsers hide non-2xx bodies).
// Shape:
//   { results: [...] }                         — success
//   { results: [], reason: 'not_signed_in' }
//   { results: [], reason: 'too_short' }
//   { results: [], reason: 'mb_error', error } — MusicBrainz rejected the call
//
// Login is required even though MusicBrainz itself needs no auth — otherwise
// this endpoint would be an open proxy anyone on the internet could abuse,
// burning our shared rate budget.
//
// Logging is tagged [mb-search] in Cloudflare Functions logs.

/** Join MusicBrainz artist-credit array into one display string. */
function joinArtistCredit(credit) {
  if (!Array.isArray(credit) || credit.length === 0) return '';
  return credit
    .map((c) => `${c.name ?? ''}${c.joinphrase ?? ''}`)
    .join('')
    .trim();
}

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ url, locals: { safeGetSession } }) => {
  const { user } = await safeGetSession();
  if (!user) {
    console.warn('[mb-search] no session');
    return json({ results: [], reason: 'not_signed_in' }, { status: 200 });
  }

  const q = url.searchParams.get('q')?.trim().slice(0, 200);
  if (!q || q.length < 2) {
    return json({ results: [], reason: 'too_short' }, { status: 200 });
  }

  try {
    const data = await searchReleases(q, 20);
    const releases = Array.isArray(data?.releases) ? data.releases : [];

    const results = releases.map((rel) => ({
      id: rel.id,
      title: rel.title ?? '',
      artist: joinArtistCredit(rel['artist-credit']),
      year: typeof rel.date === 'string' ? rel.date.slice(0, 4) : '',
      country: rel.country ?? '',
      format: rel.media?.map((m) => m.format).find(Boolean) ?? '',
      label: rel['label-info']?.[0]?.label?.name ?? '',
      trackCount: rel['track-count'] ?? null
    }));

    console.log(`[mb-search] q="${q}" -> ${results.length} results`);
    return json({ results }, { status: 200 });
  } catch (err) {
    const msg = err?.message ?? String(err);
    console.error(`[mb-search] q="${q}" FAILED:`, msg);
    return json({ results: [], reason: 'mb_error', error: msg }, { status: 200 });
  }
};
