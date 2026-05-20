// ─────────────────────────────────────────────────────────────────────────
// GET /api/account/export
//
// Streams a JSON file containing everything the user owns:
//   - profile (sanitized: no oauth tokens or sensitive third-party secrets)
//   - all collections (active + archived implicit from records)
//   - all records (including pending-delete? — no: those are about to vanish,
//     not part of the user's stable inventory)
//   - all junction rows record_collections (so a future re-import can rebuild
//     the many-to-many structure if needed)
//   - all tracks linked to the user's records
//
// Format is documented in DEPLOY_NOTES and stable enough to import elsewhere.
//
// Includes IDs and timestamps so the export is an audit trail, not just a
// snapshot. The user explicitly asked for this in Phase 2.2 design.
//
// Security:
//   - Hard authentication check via safeGetSession
//   - All queries are scoped to user.id — RLS would also enforce, but explicit
//     filtering is defense-in-depth
//   - Sensitive fields stripped: oauth tokens, raw email duplicate
// ─────────────────────────────────────────────────────────────────────────

import { error } from '@sveltejs/kit';

/** Strip fields that should never leave the server even in a user's own export. */
function sanitizeProfile(profile) {
  if (!profile) return null;
  // Be allow-list rather than deny-list: anything we don't explicitly list
  // doesn't make it out, so future columns can't accidentally leak.
  return {
    id: profile.id,
    email: profile.email,
    username: profile.username,
    display_name: profile.display_name,
    bio: profile.bio,
    avatar_url: profile.avatar_url,
    display_currency: profile.display_currency,
    card_back_view: profile.card_back_view,
    use_discogs_prices: profile.use_discogs_prices,
    show_value_source: profile.show_value_source,
    is_public: profile.is_public,
    show_values_publicly: profile.show_values_publicly,
    discogs_username: profile.discogs_username,  // public handle; the secret is the token
    discogs_connected_at: profile.discogs_connected_at,
    created_at: profile.created_at,
    updated_at: profile.updated_at
  };
}

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  // Fetch everything in parallel. Explicit user_id filters on each query.
  const [profileRes, collectionsRes, recordsRes, junctionRes] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('collections').select('*').eq('user_id', user.id),
    supabase
      .from('records')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_pending_delete', false),
    supabase
      .from('record_collections')
      .select('record_id, collection_id, added_at, records!inner(user_id)')
      .eq('records.user_id', user.id)
  ]);

  if (profileRes.error)     throw error(500, profileRes.error.message);
  if (collectionsRes.error) throw error(500, collectionsRes.error.message);
  if (recordsRes.error)     throw error(500, recordsRes.error.message);
  if (junctionRes.error)    throw error(500, junctionRes.error.message);

  // Fetch tracks for all the user's records in a single query
  const recordIds = (recordsRes.data ?? []).map((r) => r.id);
  let tracks = [];
  if (recordIds.length > 0) {
    const { data: tracksData, error: tracksErr } = await supabase
      .from('tracks')
      .select('*')
      .in('record_id', recordIds)
      .order('record_id', { ascending: true })
      .order('sort_order', { ascending: true });
    if (tracksErr) throw error(500, tracksErr.message);
    tracks = tracksData ?? [];
  }

  // Strip the noise from junction rows — the nested records.user_id join was
  // only for filtering and shouldn't be in the output.
  const junctionRows = (junctionRes.data ?? []).map(({ record_id, collection_id, added_at }) => ({
    record_id, collection_id, added_at
  }));

  const exportedAt = new Date().toISOString();

  const payload = {
    _meta: {
      app: 'Retro Vault',
      app_url: 'https://retrovault.no',
      schema_version: '1',
      exported_at: exportedAt,
      exported_by: user.id,
      record_count: recordIds.length,
      collection_count: collectionsRes.data?.length ?? 0,
      track_count: tracks.length
    },
    profile: sanitizeProfile(profileRes.data),
    collections: collectionsRes.data ?? [],
    records: recordsRes.data ?? [],
    record_collections: junctionRows,
    tracks
  };

  // Build a sensible filename: retrovault-export-2025-05-20.json
  const dateStr = exportedAt.slice(0, 10);
  const filename = `retrovault-export-${dateStr}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // No caching — this is fresh data, possibly sensitive
      'Cache-Control': 'no-store, max-age=0'
    }
  });
};
