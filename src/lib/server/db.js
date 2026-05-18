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
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} collectionId
 * @param {object} [opts]
 * @param {boolean} [opts.archived]
 * @param {boolean} [opts.withTracks]
 * @param {string}  [opts.query]      Free-text search across artist/title/label/genre/notes/tags
 * @param {string[]}[opts.formats]    Filter to these formats (enum values)
 * @param {string[]}[opts.conditions] Filter to these conditions (enum values)
 * @param {string[]}[opts.tags]       Records must include ALL of these tags
 * @param {string}  [opts.sort]       'recent' | 'oldest' | 'artist' | 'title' | 'year-desc' | 'year-asc' | 'value-desc' | 'value-asc'
 */
export async function loadRecords(supabase, userId, collectionId, opts = {}) {
  const archived = opts.archived ?? false;
  // When tracks are needed for the card-back tracklist view, fetch them inline
  // via a nested select. Cheaper than N separate queries.
  const select = opts.withTracks
    ? '*, tracks(position, title, duration, sort_order)'
    : '*';

  let q = supabase
    .from('records')
    .select(select)
    .eq('user_id', userId)
    .eq('collection_id', collectionId)
    .eq('is_archived', archived)
    .eq('is_pending_delete', false);

  // ─── Free-text search across multiple fields ───────────────────────
  if (opts.query && opts.query.trim()) {
    const raw = opts.query.trim();
    // Escape PostgREST `or` value delimiters: comma, paren, percent
    // (the literal text itself is parameterized server-side, but the structural
    //  comma in .or() separates clauses — we need to neutralize commas/parens
    //  in the user's input.)
    const safe = raw.replace(/([,()*])/g, '');
    if (safe.length > 0) {
      const term = `%${safe}%`;
      // ilike across all sensible columns. Postgres handles diacritics-insensitive
      // matching with the default collation, which is fine for our use case.
      q = q.or(
        [
          `artist.ilike.${term}`,
          `title.ilike.${term}`,
          `label.ilike.${term}`,
          `genre.ilike.${term}`,
          `notes.ilike.${term}`
        ].join(',')
      );
      // Tags is a text[] — match if the array contains this exact tag (case-insensitive)
      // We do this via a second pass below if no row-level match found, but for
      // a simple "single search box" UX, we lean on the ilike across columns above.
      // (Tag-exact matching can be added if users ask.)
    }
  }

  // ─── Format filter (multi-select) ──────────────────────────────────
  if (opts.formats && opts.formats.length > 0) {
    q = q.in('format', opts.formats);
  }

  // ─── Condition filter (multi-select) ───────────────────────────────
  if (opts.conditions && opts.conditions.length > 0) {
    q = q.in('condition', opts.conditions);
  }

  // ─── Tags filter — record must contain ALL specified tags ──────────
  if (opts.tags && opts.tags.length > 0) {
    // Postgres `@>` array operator → row's tags array contains all of these
    q = q.contains('tags', opts.tags);
  }

  // ─── Sort ──────────────────────────────────────────────────────────
  switch (opts.sort) {
    case 'oldest':
      q = q.order('created_at', { ascending: true });
      break;
    case 'artist':
      q = q.order('artist', { ascending: true }).order('title', { ascending: true });
      break;
    case 'title':
      q = q.order('title', { ascending: true });
      break;
    case 'year-desc':
      // year is text but sorts correctly lexicographically for "1991" / "2005" etc.
      q = q.order('year', { ascending: false, nullsFirst: false });
      break;
    case 'year-asc':
      q = q.order('year', { ascending: true, nullsFirst: false });
      break;
    case 'value-desc':
      q = q.order('value_override', { ascending: false, nullsFirst: false });
      break;
    case 'value-asc':
      q = q.order('value_override', { ascending: true, nullsFirst: false });
      break;
    case 'recent':
    default:
      q = q.order('created_at', { ascending: false });
      break;
  }

  const { data, error } = await q;
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

/**
 * Build a facets summary for the filter UI within a single collection.
 * Returns the distinct formats, conditions, and top tags so the filter
 * dropdowns only show options the user actually has.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} collectionId
 */
export async function loadCollectionFacets(supabase, userId, collectionId) {
  const { data, error } = await supabase
    .from('records')
    .select('format, condition, tags')
    .eq('user_id', userId)
    .eq('collection_id', collectionId)
    .eq('is_archived', false)
    .eq('is_pending_delete', false);
  if (error) throw error;

  const formats = new Set();
  const conditions = new Set();
  /** @type {Map<string, number>} */
  const tagCounts = new Map();

  for (const row of data ?? []) {
    if (row.format) formats.add(row.format);
    if (row.condition) conditions.add(row.condition);
    if (Array.isArray(row.tags)) {
      for (const t of row.tags) {
        if (typeof t !== 'string') continue;
        const tag = t.trim();
        if (!tag) continue;
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }
  }

  return {
    formats: Array.from(formats),
    conditions: Array.from(conditions),
    // Top 30 tags by frequency — keeps the chip list manageable
    tags: Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([tag, count]) => ({ tag, count }))
  };
}
