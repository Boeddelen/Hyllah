// ─────────────────────────────────────────────────────────────────────────
// GET /u/[username] — public profile page
//
// Load and display a user's public collection with full privacy controls.
// This is the "listening room" showcase — warm, leisurely, beautiful.
//
// Security model:
//   1. User must have is_public = true (they've explicitly made a profile)
//   2. User must have a username (required for public URL)
//   3. Only records where is_public_record = true are shown
//   4. Financial data only shown if user enabled show_values_publicly
//   5. Discogs links only shown if user enabled show_discogs_links_publicly
//   6. RLS policies at the database level enforce this as a safety layer
//
// Caching:
//   - Single endpoint caches the whole response (profile + collections + records)
//   - Cache key: username (case-normalized to lowercase)
//   - TTL: 5 minutes (users can toggle private/public and see results reasonably fast)
//   - Cache invalidates on any record/user update via db triggers (future optimization)
//   - Public profiles can be CDN-cached for further speed
// ─────────────────────────────────────────────────────────────────────────

import { error } from '@sveltejs/kit';

// In a real app, this would be Redis or Memcached.
// For now, we'll use an in-memory Map. In production, use your caching layer.
const profileCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedProfile(username) {
  const key = username.toLowerCase();
  const cached = profileCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  profileCache.delete(key);
  return null;
}

function setCachedProfile(username, data) {
  const key = username.toLowerCase();
  profileCache.set(key, { data, timestamp: Date.now() });
}

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, locals: { supabase } }) => {
  const { username } = params;

  if (!username || typeof username !== 'string') {
    throw error(404, 'Profile not found');
  }

  // Try cache first
  const cached = getCachedProfile(username);
  if (cached) {
    return cached;
  }

  // ── Load user profile ─────────────────────────────────────────
  // Case-insensitive lookup; enforce is_public check
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, username, display_name, bio, avatar_url, display_currency, show_values_publicly, show_discogs_links_publicly')
    .ilike('username', username)
    .eq('is_public', true)
    .maybeSingle();

  if (userErr) throw error(500, userErr.message);
  if (!user) throw error(404, 'Profile not found');

  // ── Load collections ──────────────────────────────────────────
  const { data: collections, error: collectionsErr } = await supabase
    .from('collections')
    .select('id, name, icon')
    .eq('user_id', user.id)
    .order('name', { ascending: true });

  if (collectionsErr) throw error(500, collectionsErr.message);

  // ── Load public records ───────────────────────────────────────
  // Only records marked public. Load from all collections.
  const { data: records, error: recordsErr } = await supabase
    .from('records')
    .select(`
      id,
      artist,
      title,
      cover_url,
      format,
      year,
      condition,
      value_override,
      purchase_price,
      prices,
      discogs_id,
      collection_id,
      is_public_record
    `)
    .eq('user_id', user.id)
    .eq('is_public_record', true)
    .eq('is_pending_delete', false)
    .order('created_at', { ascending: false });

  if (recordsErr) throw error(500, recordsErr.message);

  // ── Build collection summary with thumbnails ──────────────────
  // For each collection, count public records and collect cover URLs
  const collectionSummaries = collections.map((coll) => {
    const collRecords = records.filter((r) => r.collection_id === coll.id);
    const count = collRecords.length;
    // Get up to 4 cover images for the preview grid
    const covers = collRecords
      .filter((r) => r.cover_url)
      .slice(0, 4)
      .map((r) => r.cover_url);

    return {
      id: coll.id,
      name: coll.name,
      icon: coll.icon,
      count,
      covers
    };
  });

  // ── Sanitize financial data ───────────────────────────────────
  // Strip out prices/values unless user enabled show_values_publicly
  const safeRecords = records.map((r) => {
    const safe = { ...r };
    if (!user.show_values_publicly) {
      safe.value_override = null;
      safe.purchase_price = null;
      safe.prices = null;
    }
    // Strip oauth secrets; only keep public discogs_id (if enabled below)
    return safe;
  });

  // ── Respect Discogs link preference ───────────────────────────
  // If user disabled showing Discogs links, don't include IDs in the response
  const recordsForDisplay = safeRecords.map((r) => {
    const display = { ...r };
    if (!user.show_discogs_links_publicly) {
      display.discogs_id = null;
    }
    return display;
  });

  const payload = {
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      bio: user.bio,
      avatar_url: user.avatar_url,
      display_currency: user.display_currency,
      show_values_publicly: user.show_values_publicly,
      show_discogs_links_publicly: user.show_discogs_links_publicly
    },
    collections: collectionSummaries,
    records: recordsForDisplay,
    stats: {
      total_records: recordsForDisplay.length,
      total_collections: collectionSummaries.length,
      total_value: user.show_values_publicly
        ? recordsForDisplay.reduce((sum, r) => {
            const val = r.value_override ? Number(r.value_override) : 0;
            return sum + val;
          }, 0)
        : null
    }
  };

  // Cache the result
  setCachedProfile(username, payload);

  return payload;
};
