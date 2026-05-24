// GET /u/[username]/r/[recordId] — public record detail
//
// Security: user must be public, record must be public and belong to this user.

import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, locals: { supabase } }) => {
  const { username, recordId } = params;

  // ── 1. Verify public user ─────────────────────────────────────
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, display_currency, show_values_publicly, show_discogs_links_publicly')
    .ilike('username', username)
    .eq('is_public', true)
    .maybeSingle();

  if (userErr) {
    console.error('[public-record] user query failed:', userErr.message);
    throw error(500, 'Could not load profile');
  }
  if (!user) throw error(404, 'Profile not found');

  // ── 2. Load the record — must be public and belong to this user ─
  const { data: record, error: recordErr } = await supabase
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
      tags,
      discogs_id,
      value_override,
      purchase_price,
      collection_id,
      created_at
    `)
    .eq('id', recordId)
    .eq('user_id', user.id)
    .eq('is_public_record', true)
    .eq('is_pending_delete', false)
    .maybeSingle();

  if (recordErr) {
    console.error('[public-record] record query failed:', recordErr.message);
    throw error(500, 'Could not load record');
  }
  if (!record) throw error(404, 'Record not found');

  // ── 3. Load the collection name for breadcrumb ────────────────
  const { data: collection } = await supabase
    .from('collections')
    .select('id, name, icon')
    .eq('id', record.collection_id)
    .eq('user_id', user.id)
    .maybeSingle();

  // ── 4. Sanitize per user preferences ─────────────────────────
  const safeRecord = {
    id: record.id,
    artist: record.artist,
    title: record.title,
    image_url: record.image_url,
    format: record.format,
    year: record.year,
    condition: record.condition,
    label: record.label,
    notes: record.notes,
    tags: record.tags ?? [],
    discogs_id: user.show_discogs_links_publicly ? record.discogs_id : null,
    value_override: user.show_values_publicly ? record.value_override : null,
    purchase_price: user.show_values_publicly ? record.purchase_price : null
  };

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
    collection: collection ?? null,
    record: safeRecord
  };
};
