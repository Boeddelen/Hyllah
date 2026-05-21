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
//
// Why we use the service-role client here:
//   The public profile is viewed by unauthenticated visitors. RLS policies on
//   records and collections are scoped to auth.uid() — an anonymous visitor has
//   no uid, so all queries return empty or error. We use the service-role client
//   ONLY for SELECT queries on public data that we've already validated
//   (is_public = true, is_public_record = true). We never expose private data.
//
// Caching:
//   - Single endpoint caches the whole response (profile + collections + records)
//   - Cache key: username (case-normalized to lowercase)
//   - TTL: 5 minutes — users see privacy changes reflected within 5 minutes
// ─────────────────────────────────────────────────────────────────────────

import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

// Service-role client: bypasses RLS for public profile reads.
// Created once at module load — safe because it's read-only and server-only.
let _adminClient = null;
function getAdminClient() {
  if (_adminClient) return _adminClient;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  _adminClient = createClient(PUBLIC_SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return _adminClient;
}

// In-memory cache. Fine for Cloudflare Workers (single isolate per region).
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
export const load = async ({ params }) => {
  const { username } = params;

  if (!username || typeof username !== 'string') {
    throw error(404, 'Profile not found');
  }

  // Try cache first
  const cached = getCachedProfile(username);
  if (cached) return cached;

  const admin = getAdminClient();

  // ── 1. Load user profile ──────────────────────────────────────
  // Case-insensitive lookup. Only show public profiles.
  const { data: user, error: userErr } = await admin
    .from('users')
    .select('id, username, display_name, bio, avatar_url, display_currency, show_values_publicly, show_discogs_links_publicly')
    .ilike('username', username)
    .eq('is_public', true)
    .maybeSingle();

  if (userErr) {
    console.error('Public profile user lookup failed:', userErr);
    throw error(500, 'Could not load profile');
  }
  if (!user) throw error(404, 'Profile not found');

  // ── 2. Load collections ───────────────────────────────────────
  const { data: collections, error: collectionsErr } = await admin
    .from('collections')
    .select('id, name, icon')
    .eq('user_id', user.id)
    .order('name', { ascending: true });

  if (collectionsErr) {
    console.error('Public profile collections failed:', collectionsErr);
    throw error(500, 'Could not load collections');
  }

  // ── 3. Load public records with their collection memberships ──
  // Join through record_collections junction table to properly handle
  // many-to-many. Filter: only public records, not pending delete.
  const { data: records, error: recordsErr } = await admin
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
      is_public_record,
      created_at,
      record_collections ( collection_id )
    `)
    .eq('user_id', user.id)
    .eq('is_public_record', true)
    .eq('is_pending_delete', false)
    .order('created_at', { ascending: false });

  if (recordsErr) {
    console.error('Public profile records failed:', recordsErr);
    throw error(500, 'Could not load records');
  }

  // ── 4. Build collection summaries with cover thumbnails ───────
  // For each collection, count public records and grab up to 4 cover URLs.
  // A record can be in multiple collections so we use the junction rows.
  const collectionSummaries = (collections ?? []).map((coll) => {
    const collRecords = (records ?? []).filter((r) =>
      r.record_collections?.some((rc) => rc.collection_id === coll.id)
    );
    const covers = collRecords
      .filter((r) => r.cover_url)
      .slice(0, 4)
      .map((r) => r.cover_url);

    return {
      id: coll.id,
      name: coll.name,
      icon: coll.icon,
      count: collRecords.length,
      covers
    };
  });

  // ── 5. Sanitize — strip financial data if not enabled ─────────
  const recordsForDisplay = (records ?? []).map((r) => {
    const display = {
      id: r.id,
      artist: r.artist,
      title: r.title,
      cover_url: r.cover_url,
      format: r.format,
      year: r.year,
      condition: r.condition,
      discogs_id: user.show_discogs_links_publicly ? r.discogs_id : null,
      value_override: user.show_values_publicly ? r.value_override : null,
      purchase_price: user.show_values_publicly ? r.purchase_price : null
      // prices and record_collections stripped — not needed in the response
    };
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
            const v = r.value_override ? Number(r.value_override) : 0;
            return sum + (Number.isFinite(v) ? v : 0);
          }, 0)
        : null
    }
  };

  setCachedProfile(username, payload);
  return payload;
};
