// ─────────────────────────────────────────────────────────────────────────
// GET /api/musicbrainz/cover?mbid=UUID
//
// Returns { image_url } for a release's front cover (https, 500px), or
// { image_url: null } when the Cover Art Archive has none. The client calls
// this in the background AFTER autofill has filled the text fields, so the
// CAA's ~2s response time never blocks the user.
// ─────────────────────────────────────────────────────────────────────────

import { error, json } from '@sveltejs/kit';
import { findCoverArt, MBID_RE } from '$lib/server/musicbrainz.js';

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ url, locals: { safeGetSession } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  const mbid = url.searchParams.get('mbid');
  if (!mbid || !MBID_RE.test(mbid)) {
    throw error(400, 'Invalid mbid');
  }

  const t0 = Date.now();
  const imageUrl = await findCoverArt(mbid);
  console.log(`[mb-cover] mbid=${mbid} caa=${Date.now() - t0}ms found=${!!imageUrl}`);

  return json({ image_url: imageUrl }, { status: 200 });
};
