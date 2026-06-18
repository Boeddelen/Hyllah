// GET /u/[username]/records — public "all records" view
//
// Security model identical to the profile and collection pages:
//   - User must be public (is_public = true)
//   - Only records where is_public_record = true
//   - No monetary or Discogs data is ever queried or sent

import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, locals: { supabase } }) => {
  const { username } = params;

  // ── 1. Verify the user is public ─────────────────────────────
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, display_currency')
    .ilike('username', username)
    .eq('is_public', true)
    .maybeSingle();

  if (userErr) {
    console.error('[public-records] user query failed:', userErr.message);
    throw error(500, 'Could not load profile');
  }
  if (!user) throw error(404, 'Profile not found');

  // ── 2. Load every public record for this user ────────────────
  const { data: records, error: recordsErr } = await supabase
    .from('records')
    .select('id, artist, title, image_url, format, year, condition, label, notes, created_at')
    .eq('user_id', user.id)
    .eq('is_public_record', true)
    .eq('is_pending_delete', false)
    .order('artist', { ascending: true });

  if (recordsErr) {
    console.error('[public-records] records query failed:', recordsErr.message);
    throw error(500, 'Could not load records');
  }

  // ── 3. Build display payload (no monetary or Discogs data ever) ──────────
  const recordsForDisplay = (records ?? []).map((r) => ({
    id: r.id,
    artist: r.artist,
    title: r.title,
    image_url: r.image_url,
    format: r.format,
    year: r.year,
    condition: r.condition,
    label: r.label,
    notes: r.notes
  }));

  return {
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      display_currency: user.display_currency
    },
    records: recordsForDisplay
  };
};
