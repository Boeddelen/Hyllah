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
  // Read junction memberships with the record's status, so we can split
  // active vs archived per collection. A record in multiple collections
  // is counted in each of them.
  const { data, error } = await supabase
    .from('record_collections')
    .select('collection_id, records!inner(user_id, is_archived, is_pending_delete)')
    .eq('records.user_id', userId)
    .eq('records.is_pending_delete', false);
  if (error) throw error;

  /** @type {Record<string, { active: number, archived: number }>} */
  const counts = {};
  for (const row of data ?? []) {
    const rec = row.records;
    if (!rec) continue;
    if (!counts[row.collection_id]) counts[row.collection_id] = { active: 0, archived: 0 };
    if (rec.is_archived) counts[row.collection_id].archived++;
    else counts[row.collection_id].active++;
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

  // When filtering to a specific collection, look up the records via the
  // junction table so we catch records whose primary collection is elsewhere
  // but that have been added to this one too.
  // When collectionId is null/undefined we're loading the user's full inventory.
  let recordIds = null;
  if (collectionId) {
    const { data: junctionRows, error: jErr } = await supabase
      .from('record_collections')
      .select('record_id')
      .eq('collection_id', collectionId);
    if (jErr) throw jErr;
    recordIds = (junctionRows ?? []).map((r) => r.record_id);
    if (recordIds.length === 0) return []; // empty collection, short-circuit
  }

  // When tracks are needed for the card-back tracklist view, fetch them inline
  // via a nested select. Cheaper than N separate queries.
  const select = opts.withTracks
    ? '*, tracks(position, title, duration, sort_order)'
    : '*';

  let q = supabase
    .from('records')
    .select(select)
    .eq('user_id', userId)
    .eq('is_archived', archived)
    .eq('is_pending_delete', false);

  if (recordIds !== null) {
    q = q.in('id', recordIds);
  }

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

  // Decorate each record with `collection_count` — how many collections this
  // record sits in. Lets the UI decide whether to offer "Remove from this
  // collection" vs. just Archive/Delete (a record can't leave its last
  // collection without being archived).
  if (data && data.length > 0) {
    const ids = data.map((r) => r.id);
    const { data: junctionAll } = await supabase
      .from('record_collections')
      .select('record_id')
      .in('record_id', ids);
    /** @type {Record<string, number>} */
    const counts = {};
    for (const row of junctionAll ?? []) {
      counts[row.record_id] = (counts[row.record_id] ?? 0) + 1;
    }
    for (const r of data) {
      r.collection_count = counts[r.id] ?? 1;
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
  // Resolve membership via the junction table (consistent with loadRecords)
  const { data: junctionRows, error: jErr } = await supabase
    .from('record_collections')
    .select('record_id')
    .eq('collection_id', collectionId);
  if (jErr) throw jErr;
  const recordIds = (junctionRows ?? []).map((r) => r.record_id);
  if (recordIds.length === 0) {
    return { formats: [], conditions: [], tags: [] };
  }

  const { data, error } = await supabase
    .from('records')
    .select('format, condition, tags')
    .eq('user_id', userId)
    .in('id', recordIds)
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

// ════════════════════════════════════════════════════════════════════════════
// Many-to-many records ↔ collections (Phase 1D.2a, dual-write phase)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Get the set of collection IDs a record currently belongs to.
 * Reads from the new junction table.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} recordId
 * @returns {Promise<string[]>}
 */
export async function loadRecordCollections(supabase, userId, recordId) {
  // RLS filters by ownership of the record via the junction policy, but
  // checking record ownership here is cheap and guards against malformed input.
  const { data: record } = await supabase
    .from('records')
    .select('id')
    .eq('id', recordId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!record) return [];

  const { data, error } = await supabase
    .from('record_collections')
    .select('collection_id')
    .eq('record_id', recordId);
  if (error) throw error;
  return (data ?? []).map((row) => row.collection_id);
}

/**
 * Load ALL record-collection junction rows for a user.
 * Returns an array of { record_id, collection_id } objects.
 * Used by the "All records" view to show which collections each record belongs to.
 */
export async function loadAllRecordCollections(supabase, userId) {
  const { data, error } = await supabase
    .from('record_collections')
    .select('record_id, collection_id, records!inner(user_id)')
    .eq('records.user_id', userId);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    record_id: row.record_id,
    collection_id: row.collection_id
  }));
}

/**
 * Replace a record's collection memberships with the given set.
 * The record's primary `records.collection_id` is also kept in sync — it
 * always points to one of the collections in the set (preferring the
 * existing primary if it's still in the set, otherwise the first one).
 *
 * This is the dual-write strategy for migration 006a: junction table is
 * the source of truth for "which collections is this record in?", but the
 * legacy column stays populated so the rest of the app keeps working
 * unchanged until migration 006b drops it.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} recordId
 * @param {string[]} desiredCollectionIds — must include at least one
 * @returns {Promise<{ ok: boolean, error?: string, primary?: string }>}
 */
export async function setRecordCollections(supabase, userId, recordId, desiredCollectionIds) {
  // Defensive validation
  if (!Array.isArray(desiredCollectionIds) || desiredCollectionIds.length === 0) {
    return { ok: false, error: 'A record must belong to at least one collection.' };
  }

  // De-dupe; validate UUID shape
  const desired = Array.from(new Set(desiredCollectionIds.filter(
    (id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)
  )));
  if (desired.length === 0) {
    return { ok: false, error: 'No valid collection IDs supplied.' };
  }

  // Verify the user owns the record and all requested collections
  const [{ data: record }, { data: ownedColls }] = await Promise.all([
    supabase
      .from('records')
      .select('id, collection_id')
      .eq('id', recordId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('collections')
      .select('id')
      .eq('user_id', userId)
      .in('id', desired)
  ]);

  if (!record) return { ok: false, error: 'Record not found.' };
  const ownedSet = new Set((ownedColls ?? []).map((c) => c.id));
  if (ownedSet.size !== desired.length) {
    return { ok: false, error: 'One or more collections do not belong to you.' };
  }

  // Pick the primary: prefer existing if still in the set, else the first.
  const primary = ownedSet.has(record.collection_id) ? record.collection_id : desired[0];

  // Replace the junction rows. Done as delete-then-insert; RLS scopes this
  // automatically to the user's rows.
  // (We could diff, but the set is tiny and clarity wins.)
  const { error: delErr } = await supabase
    .from('record_collections')
    .delete()
    .eq('record_id', recordId);
  if (delErr) return { ok: false, error: delErr.message };

  const rows = desired.map((cid) => ({ record_id: recordId, collection_id: cid }));
  const { error: insErr } = await supabase.from('record_collections').insert(rows);
  if (insErr) return { ok: false, error: insErr.message };

  // Keep the legacy column in sync — points at the primary collection.
  if (primary !== record.collection_id) {
    const { error: upErr } = await supabase
      .from('records')
      .update({ collection_id: primary })
      .eq('id', recordId)
      .eq('user_id', userId);
    if (upErr) return { ok: false, error: upErr.message };
  }

  return { ok: true, primary };
}

/**
 * Ensure a junction row exists for (record, collection). Idempotent.
 * Used when a record is created — we always make sure the new record is
 * "in" the collection it was created in.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} recordId
 * @param {string} collectionId
 */
export async function ensureRecordInCollection(supabase, userId, recordId, collectionId) {
  // RLS will enforce ownership of both sides — the policies are written to
  // require the user owns the record AND the collection. Belt-and-braces:
  // a quick ownership check up front gives clearer error surface.
  const [{ data: record }, { data: coll }] = await Promise.all([
    supabase.from('records').select('id').eq('id', recordId).eq('user_id', userId).maybeSingle(),
    supabase.from('collections').select('id').eq('id', collectionId).eq('user_id', userId).maybeSingle()
  ]);
  if (!record || !coll) return { ok: false, error: 'Record or collection not found.' };

  // ON CONFLICT DO NOTHING via upsert with the primary key
  const { error } = await supabase
    .from('record_collections')
    .upsert(
      { record_id: recordId, collection_id: collectionId },
      { onConflict: 'record_id,collection_id', ignoreDuplicates: true }
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Remove a record from one collection. The record stays alive in the
 * inventory; just the junction row goes. If this was the record's last
 * collection, the call is refused — records must always have a home.
 *
 * Also keeps the legacy records.collection_id in sync: if the removed
 * collection was the primary, reassigns to one of the remaining ones.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {string} recordId
 * @param {string} collectionId
 */
export async function removeRecordFromCollection(supabase, userId, recordId, collectionId) {
  // Load the record's current memberships
  const { data: record } = await supabase
    .from('records')
    .select('id, collection_id')
    .eq('id', recordId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!record) return { ok: false, error: 'Record not found.' };

  const { data: memberships } = await supabase
    .from('record_collections')
    .select('collection_id')
    .eq('record_id', recordId);
  const current = (memberships ?? []).map((m) => m.collection_id);

  if (current.length <= 1) {
    return {
      ok: false,
      error: 'This is the record\'s only collection — archive or delete the record instead.'
    };
  }
  if (!current.includes(collectionId)) {
    // Already not in that collection — treat as success (idempotent)
    return { ok: true, primary: record.collection_id };
  }

  // Delete the junction row
  const { error: delErr } = await supabase
    .from('record_collections')
    .delete()
    .eq('record_id', recordId)
    .eq('collection_id', collectionId);
  if (delErr) return { ok: false, error: delErr.message };

  // If we just removed the primary, reassign to another remaining one
  let primary = record.collection_id;
  if (record.collection_id === collectionId) {
    primary = current.find((c) => c !== collectionId);
    const { error: upErr } = await supabase
      .from('records')
      .update({ collection_id: primary })
      .eq('id', recordId)
      .eq('user_id', userId);
    if (upErr) return { ok: false, error: upErr.message };
  }

  return { ok: true, primary };
}
