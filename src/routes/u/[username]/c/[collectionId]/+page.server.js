// GET /u/[username]/c/[collectionId] — public collection view
//
// Security model identical to the profile page:
//   - User must be public (is_public = true)
//   - Collection must belong to that user
//   - Only records where is_public_record = true
//   - Financial/Discogs data stripped per user preferences

import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, locals: { supabase } }) => {
  const { username, collectionId } = params;

  // ── 1. Verify the user is public ─────────────────────────────
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, display_currency, show_values_publicly, show_discogs_links_publicly')
    .ilike('username', username)
    .eq('is_public', true)
    .maybeSingle();

  if (userErr) {
    console.error('[public-collection] user query failed:', userErr.message);
    throw error(500, 'Could not load profile');
  }
  if (!user) throw error(404, 'Profile not found');

  // ── 2. Verify the collection belongs to this user ─────────────
  const { data: collection, error: collErr } = await supabase
    .from('collections')
    .select('id, name, icon')
    .eq('id', collectionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (collErr) {
    console.error('[public-collection] collection query failed:', collErr.message);
    throw error(500, 'Could not load collection');
  }
  if (!collection) throw error(404, 'Collection not found');

  // ── 3. Load public records for this collection ────────────────
  const { data: records, error: recordsErr } = await supabase
    .from('records')
    .select(`
      id,
      artist,
      title,
      image_url,
      format,
      year,
      condition,
      label,
      notes,
      discogs_id,
      value_override,
      purchase_price,
      collection_id,
      created_at
    `)
    .eq('user_id', user.id)
    .eq('collection_id', collectionId)
    .eq('is_public_record', true)
    .eq('is_pending_delete', false)
    .order('artist', { ascending: true });

  if (recordsErr) {
    console.error('[public-collection] records query failed:', recordsErr.message);
    throw error(500, 'Could not load records');
  }

  // ── 4. Sanitize per user preferences ─────────────────────────
  const recordsForDisplay = (records ?? []).map((r) => ({
    id: r.id,
    artist: r.artist,
    title: r.title,
    image_url: r.image_url,
    format: r.format,
    year: r.year,
    condition: r.condition,
    label: r.label,
    notes: r.notes,
    discogs_id: user.show_discogs_links_publicly ? r.discogs_id : null,
    value_override: user.show_values_publicly ? r.value_override : null,
    purchase_price: user.show_values_publicly ? r.purchase_price : null
  }));

  return {
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      display_currency: user.display_currency,
      show_values_publicly: user.show_values_publicly,
      show_discogs_links_publicly: user.show_discogs_links_publicly
    },
    collection,
    records: recordsForDisplay
  };
};
