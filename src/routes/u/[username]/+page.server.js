// GET /u/[username] — public profile page
//
// Security model:
//   - RLS policies (Migration 011) allow anon to read public data
//   - Application layer enforces the same filters (defense in depth)
//   - Financial data stripped unless show_values_publicly is enabled
//   - Discogs IDs stripped unless show_discogs_links_publicly is enabled

import { error } from '@sveltejs/kit';

const profileCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

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

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, locals: { supabase } }) => {
  try {
    const { username } = params;
    if (!username || typeof username !== 'string') throw error(404, 'Profile not found');

    const cached = getCachedProfile(username);
    if (cached) return cached;

    // ── 1. User ─────────────────────────────────────────────────────────────
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, username, display_name, bio, avatar_url, is_public, display_currency, show_values_publicly, show_discogs_links_publicly, public_theme, public_mode')
      .ilike('username', username)
      .maybeSingle();

    if (userErr) throw error(500, `User query failed: ${userErr.message}`);
    if (!user)          throw error(404, 'Profile not found');
    if (!user.is_public) throw error(404, 'Profile not found');

    // ── 2. Collections ───────────────────────────────────────────────────────
    const { data: collections, error: collErr } = await supabase
      .from('collections')
      .select('id, name, icon')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (collErr) throw error(500, `Collections query failed: ${collErr.message}`);

    // ── 3. Records ───────────────────────────────────────────────────────────
    const { data: records, error: recErr } = await supabase
      .from('records')
      .select('id, artist, title, image_url, format, year, condition, value_override, purchase_price, discogs_id, collection_id, created_at')
      .eq('user_id', user.id)
      .eq('is_public_record', true)
      .eq('is_pending_delete', false)
      .order('created_at', { ascending: false });

    if (recErr) throw error(500, `Records query failed: ${recErr.message}`);

    // ── 4. Build collection summaries ────────────────────────────────────────
    const collectionSummaries = (collections ?? []).map((coll) => {
      const collRecords = (records ?? []).filter((r) => r.collection_id === coll.id);
      const covers = collRecords.filter((r) => r.image_url).slice(0, 4).map((r) => r.image_url);
      return { id: coll.id, name: coll.name, icon: coll.icon, count: collRecords.length, covers };
    });

    // ── 5. Sanitize ──────────────────────────────────────────────────────────
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

  } catch (e) {
    // Re-throw SvelteKit errors (404, 500 etc.) as-is
    if (e?.status) throw e;
    // Surface raw JS exceptions with their message so we can diagnose
    console.error('[public-profile] unhandled exception:', e);
    throw error(500, `Unexpected error: ${e?.message ?? String(e)}`);
  }
};
