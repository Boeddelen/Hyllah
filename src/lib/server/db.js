// Server-side database query helpers.
// These run only on the server (inside +page.server.js, +server.js, etc).
// RLS policies enforce per-user isolation — these queries trust auth.uid().

/**
 * Load the current user's profile from public.users.
 * Auto-creates if missing (shouldn't happen, but defensive).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function loadUserProfile(supabase, userId) {
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Load all collections for the current user, ordered.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function loadCollections(supabase, userId) {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Load record counts per collection so we can show "💿 My Collection (42)".
 * Returns a map: { [collectionId]: { active: number, archived: number } }
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function loadCollectionCounts(supabase, userId) {
  // Two count queries — one active, one archived
  const [active, archived] = await Promise.all([
    supabase
      .from('records')
      .select('collection_id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_archived', false)
      .eq('is_pending_delete', false),
    supabase
      .from('records')
      .select('collection_id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_archived', true)
      .eq('is_pending_delete', false)
  ]);

  /** @type {Record<string, { active: number, archived: number }>} */
  const counts = {};
  // Aggregate per collection_id
  for (const row of active.data ?? []) {
    if (!counts[row.collection_id]) counts[row.collection_id] = { active: 0, archived: 0 };
    counts[row.collection_id].active++;
  }
  for (const row of archived.data ?? []) {
    if (!counts[row.collection_id]) counts[row.collection_id] = { active: 0, archived: 0 };
    counts[row.collection_id].archived++;
  }
  return counts;
}

/**
 * Load records for a specific collection.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} collectionId
 * @param {{ archived?: boolean, withTracks?: boolean }} [opts]
 */
export async function loadRecords(supabase, userId, collectionId, opts = {}) {
  const archived = opts.archived ?? false;
  // When tracks are needed for the card-back tracklist view, fetch them inline
  // via a nested select. Cheaper than N separate queries.
  const select = opts.withTracks
    ? '*, tracks(position, title, duration, sort_order)'
    : '*';
  const { data, error } = await supabase
    .from('records')
    .select(select)
    .eq('user_id', userId)
    .eq('collection_id', collectionId)
    .eq('is_archived', archived)
    .eq('is_pending_delete', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  // Sort tracks per record (Postgres doesn't guarantee order on the nested join)
  if (opts.withTracks && data) {
    for (const r of data) {
      if (Array.isArray(r.tracks)) {
        r.tracks.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      }
    }
  }
  return data ?? [];
}

/**
 * Verify a collection belongs to the user — returns the collection or null.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} collectionId
 */
export async function loadCollection(supabase, userId, collectionId) {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .eq('user_id', userId)
    .eq('id', collectionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
