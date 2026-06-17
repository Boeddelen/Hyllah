// ─────────────────────────────────────────────────────────────────────────
// POST /api/musicbrainz/cache-cover   body: { recordId }
//
// Copies a record's MusicBrainz cover art from the Cover Art Archive into our
// own Supabase Storage, then repoints the record at the stored copy. After
// this runs once, the cover loads from our fast storage instead of hotlinking
// archive.org on every view — including on public profile pages.
//
// Called fire-and-forget by the record modal after a save. Idempotent: it
// no-ops if the record has no MusicBrainz id, already has a stored image, or
// has no cover art available.
//
// SECURITY:
//  - Auth + ownership: the record is loaded scoped to the signed-in user, so
//    one user can never trigger caching on another user's record.
//  - SSRF-safe: the cover URL is RE-DERIVED from the record's validated mbid
//    server-side via findCoverArt(). We never fetch a URL supplied by the
//    client (the stored image_url is treated as untrusted), and we additionally
//    confirm the host is the Cover Art Archive / Internet Archive before
//    fetching. This makes it impossible to trick the server into requesting an
//    arbitrary or internal address.
//  - Content + size validation: only image/jpeg|png|webp under 2 MB is stored.
//  - Least privilege: the upload uses the user's own authenticated client and
//    a path under their user id, which the bucket's RLS policy requires.
//
// Logs are tagged [mb-cache-cover].
// ─────────────────────────────────────────────────────────────────────────

import { error, json } from '@sveltejs/kit';
import { findCoverArt, MBID_RE } from '$lib/server/musicbrainz.js';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB — aligned with the covers bucket file_size_limit
const USER_AGENT = 'Hyllah/1.0 (https://hyllah.com)';

/** Only these hosts may be fetched for cover art. */
function hostAllowed(hostname) {
  return hostname === 'coverartarchive.org' || hostname.endsWith('.archive.org');
}

/** @type {import('./$types').RequestHandler} */
export const POST = async ({ request, locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  const body = await request.json().catch(() => null);
  const recordId = body?.recordId;
  if (!recordId || typeof recordId !== 'string') {
    throw error(400, 'Missing recordId');
  }

  // Load the record scoped to this user — ownership guaranteed.
  const { data: record, error: loadErr } = await supabase
    .from('records')
    .select('id, mbid, image_storage_path')
    .eq('id', recordId)
    .eq('user_id', user.id)
    .single();
  if (loadErr || !record) throw error(404, 'Record not found');

  // No-op cases — return 200 so the caller doesn't treat them as errors.
  if (!record.mbid || !MBID_RE.test(record.mbid)) {
    return json({ cached: false, reason: 'no_mbid' });
  }
  if (record.image_storage_path) {
    return json({ cached: false, reason: 'already_stored' });
  }

  // Re-derive the cover URL from the mbid server-side. The stored image_url is
  // NOT used as a fetch target (SSRF guard).
  const coverUrl = await findCoverArt(record.mbid);
  if (!coverUrl) return json({ cached: false, reason: 'no_art' });

  let hostname;
  try {
    hostname = new URL(coverUrl).hostname;
  } catch {
    return json({ cached: false, reason: 'bad_url' });
  }
  if (!hostAllowed(hostname)) {
    console.warn(`[mb-cache-cover] refused unexpected host: ${hostname}`);
    return json({ cached: false, reason: 'host_refused' });
  }

  // Fetch the image bytes.
  const imgRes = await fetch(coverUrl, { headers: { 'User-Agent': USER_AGENT } });
  if (!imgRes.ok) {
    console.warn(`[mb-cache-cover] fetch failed ${imgRes.status} for ${record.id}`);
    return json({ cached: false, reason: `fetch_${imgRes.status}` });
  }

  const contentType = (imgRes.headers.get('content-type') ?? '').split(';')[0].trim();
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) {
    return json({ cached: false, reason: 'not_image' });
  }

  const arrayBuf = await imgRes.arrayBuffer();
  if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > MAX_BYTES) {
    return json({ cached: false, reason: 'bad_size' });
  }

  // Upload to the user's folder in the public 'covers' bucket. The path must
  // start with the user id — the bucket RLS policy enforces exactly this.
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${user.id}/${record.id}-mb-${rand}.${ext}`;
  const blob = new Blob([arrayBuf], { type: contentType });

  const { error: upErr } = await supabase.storage
    .from('covers')
    .upload(path, blob, { contentType, upsert: false, cacheControl: '604800' });
  if (upErr) {
    console.error('[mb-cache-cover] upload failed:', upErr.message);
    throw error(502, 'Cover upload failed');
  }

  const { data: pub } = supabase.storage.from('covers').getPublicUrl(path);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) throw error(502, 'Could not resolve stored cover URL');

  // Point the record at the stored copy.
  const { error: updErr } = await supabase
    .from('records')
    .update({ image_url: publicUrl, image_storage_path: path })
    .eq('id', record.id)
    .eq('user_id', user.id);
  if (updErr) {
    console.error('[mb-cache-cover] record update failed:', updErr.message);
    throw error(500, 'Could not update record');
  }

  console.log(`[mb-cache-cover] cached ${record.id} from ${hostname} (${arrayBuf.byteLength}b)`);
  return json({ cached: true, image_url: publicUrl });
};
