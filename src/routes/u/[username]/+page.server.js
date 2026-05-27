// GET /u/[username] — public profile page
//
// Security model:
//   - RLS policies (Migration 011) allow anon to read public data
//   - Application layer enforces the same filters (defense in depth)
//   - Financial data stripped unless show_values_publicly is enabled
//   - Discogs IDs stripped unless show_discogs_links_publicly is enabled
//
// Caching: in-memory Map, 5-minute TTL, keyed by lowercase username.

import { error } from '@sveltejs/kit';

const profileCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedProfile(username) {
  const key = username.toLowerCase();
  const cached = profileCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;
  profileCache.delete(key);
  return null;
}

function setCachedProfile(username, data) {
  profileCache.set(username.toLowerCase(), { data, timestamp: Date.now() });
}

// ── Shared payload builder ────────────────────────────────────────────────
// Extracted so both the normal and fallback code paths can reuse it.
async function buildPayload(username, user, supabase) {
  // Load collections
  const { data: collections, error: collectionsErr } = await supabase
    .from('collections')
    .select('id, name, icon')
    .eq('user_id', user.id)
    .order('name', { ascending: true });

  if (collectionsErr) {
    console.error('[public-profile] collections query failed:', collectionsErr.message);
    throw error(500, 'Could not load collections');
  }

  // Load public records
  const { data: records, error: recordsErr } = await supabase
    .from('records')
    .select('id, artist, title, image_url, format, year, condition, value_override, purchase_price, discogs_id, collection_id, created_at')
    .eq('user_id', user.id)
    .eq('is_public_record', true)
    .eq('is_pending_delete', false)
    .order('created_at', { ascending: false });

  if (recordsErr) {
    console.error('[public-profile] records query failed:', recordsErr.message);
    throw error(500, 'Could not load records');
  }

  // Build collection summaries with cover thumbnails
  const collectionSummaries = (collections ?? []).map((coll) => {
    const collRecords = (records ?? []).filter((r) => r.collection_id === coll.id);
    const covers = collRecords.filter((r) => r.image_url).slice(0, 4).map((r) => r.image_url);
    return { id: coll.id, name: coll.name, icon: coll.icon, count: collRecords.length, covers };
  });

  // Sanitize — respect user's privacy preferences
  const recordsForDisplay = (records ?? []).map((r) => ({
    id: r.id,
    artist: r.artist,
    title: r.title,
    image_url: r.image_url,
    format: r.format,
    year: r.year,
    condition: r.condition,
    discogs_id: user.show_discogs_links_publicly ? r.discogs_id : null,
    value_override: user.show_values_publicly ? r.value_override : null,
    purchase_price: user.show_values_publicly ? r.purchase_price : null
  }));

  const payload = {
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      bio: user.bio,
      avatar_url: user.avatar_url,
      display_currency: user.display_currency,
      show_values_publicly: user.show_values_publicly,
      show_discogs_links_publicly: user.show_discogs_links_publicly,
      public_theme: user.public_theme ?? 'listening-room',
      public_mode:  user.public_mode  ?? 'dark'
    },
    collections: collectionSummaries,
    records: recordsForDisplay,
    stats: {
      total_records: recordsForDisplay.length,
      total_collections: collectionSummaries.length,
      total_value: user.show_values_publicly
        ? recordsForDisplay.reduce((sum, r) => {
            const v = Number(r.value_override);
            return sum + (Number.isFinite(v) ? v : 0);
          }, 0)
        : null
    }
  };

  setCachedProfile(username, payload);
  return payload;
}

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, locals: { supabase } }) => {
  const { username } = params;

  if (!username || typeof username !== 'string') throw error(404, 'Profile not found');

  const cached = getCachedProfile(username);
  if (cached) return cached;

  // ── Load user — with graceful fallback if migration 014 is pending ───────
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, username, display_name, bio, avatar_url, display_currency, show_values_publicly, show_discogs_links_publicly, public_theme, public_mode')
    .ilike('username', username)
    .eq('is_public', true)
    .maybeSingle();

  if (userErr) {
    // If the columns added in migration 014 don't exist yet, fall back
    // to a query without them rather than returning 500.
    const isMissingColumn =
      userErr.message?.includes('public_theme') ||
      userErr.message?.includes('public_mode') ||
      userErr.code === '42703'; // PostgreSQL: undefined_column

    if (isMissingColumn) {
      console.warn('[public-profile] migration 014 not yet applied — using fallback query');
      const { data: fallback, error: fallbackErr } = await supabase
        .from('users')
        .select('id, username, display_name, bio, avatar_url, display_currency, show_values_publicly, show_discogs_links_publicly')
        .ilike('username', username)
        .eq('is_public', true)
        .maybeSingle();

      if (fallbackErr) {
        console.error('[public-profile] fallback query failed:', fallbackErr.message);
        throw error(500, 'Could not load profile');
      }
      if (!fallback) throw error(404, 'Profile not found');

      fallback.public_theme = 'listening-room';
      fallback.public_mode  = 'dark';
      return buildPayload(username, fallback, supabase);
    }

    console.error('[public-profile] user query failed:', userErr.message);
    throw error(500, 'Could not load profile');
  }

  if (!user) throw error(404, 'Profile not found');
  return buildPayload(username, user, supabase);
};
