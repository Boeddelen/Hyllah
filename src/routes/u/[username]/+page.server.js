import { error, fail, redirect } from '@sveltejs/kit';
import { getFriendshipStatus, blockExistsBetween } from '$lib/server/friendships.js';

// Note: the profile cache only stores the public, viewer-independent payload
// (user/collections/records/stats). The viewer-specific friendshipStatus is
// computed separately on every request and merged in, so it's never cached.
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
export const load = async ({ params, locals: { supabase, safeGetSession } }) => {
  const { username } = params;
  if (!username || typeof username !== 'string') throw error(404, 'Profile not found');

  // Resolve the public, cacheable part of the profile.
  let payload = getCachedProfile(username);

  if (!payload) {
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id, username, display_name, bio, avatar_url, is_public, display_currency, show_values_publicly, show_discogs_links_publicly, public_theme, public_mode')
      .ilike('username', username)
      .maybeSingle();

    if (userErr) throw error(500, `User query failed: ${userErr.message}`);
    if (!user)           throw error(404, 'Profile not found');
    if (!user.is_public) throw error(404, 'Profile not found');

    const { data: collections, error: collErr } = await supabase
      .from('collections')
      .select('id, name, icon')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (collErr) throw error(500, `Collections query failed: ${collErr.message}`);

    const { data: records, error: recErr } = await supabase
      .from('records')
      .select('id, artist, title, image_url, format, year, condition, value_override, purchase_price, discogs_id, collection_id, created_at')
      .eq('user_id', user.id)
      .eq('is_public_record', true)
      .eq('is_pending_delete', false)
      .order('created_at', { ascending: false });

    if (recErr) throw error(500, `Records query failed: ${recErr.message}`);

    const collectionSummaries = (collections ?? []).map((coll) => {
      const collRecords = (records ?? []).filter((r) => r.collection_id === coll.id);
      const covers = collRecords.filter((r) => r.image_url).slice(0, 4).map((r) => r.image_url);
      return { id: coll.id, name: coll.name, icon: coll.icon, count: collRecords.length, covers };
    });

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

    payload = {
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
  }

  // ── Viewer-specific state (never cached) ──────────────────────────────────
  // Determine the logged-in viewer and their friendship status with this profile.
  const { user: viewer } = await safeGetSession();

  let friendshipStatus = 'none';
  let isOwnProfile = false;
  const isLoggedIn = !!viewer;

  if (viewer) {
    if (viewer.id === payload.user.id) {
      isOwnProfile = true;
    } else {
      friendshipStatus = await getFriendshipStatus(supabase, viewer.id, payload.user.id);
    }
  }

  return {
    ...payload,
    viewer: { isLoggedIn, isOwnProfile },
    friendshipStatus
  };
};

/** @type {import('./$types').Actions} */
export const actions = {
  // Send a friend request from the logged-in viewer to this profile's owner.
  // Privacy rules (option A): any logged-in user may request any public profile.
  sendFriendRequest: async ({ params, locals: { supabase, safeGetSession } }) => {
    const { user: viewer } = await safeGetSession();
    if (!viewer) throw redirect(303, '/login');

    const { username } = params;

    // Resolve the target user fresh (don't trust cache for a mutation).
    const { data: target, error: targetErr } = await supabase
      .from('users')
      .select('id, is_public')
      .ilike('username', username)
      .maybeSingle();

    if (targetErr || !target) {
      return fail(404, { action: 'sendFriendRequest', error: 'User not found.' });
    }
    if (!target.is_public) {
      return fail(403, { action: 'sendFriendRequest', error: 'This profile is private.' });
    }
    if (target.id === viewer.id) {
      return fail(400, { action: 'sendFriendRequest', error: "You can't friend yourself." });
    }

    // Block check — neither direction may have a block in place.
    if (await blockExistsBetween(supabase, viewer.id, target.id)) {
      return fail(403, { action: 'sendFriendRequest', error: 'Unable to send request.' });
    }

    // Guard against duplicates — a row in either direction means we stop.
    const { data: existing } = await supabase
      .from('friendships')
      .select('id, status, requester_id')
      .or(
        `and(requester_id.eq.${viewer.id},addressee_id.eq.${target.id}),` +
          `and(requester_id.eq.${target.id},addressee_id.eq.${viewer.id})`
      )
      .maybeSingle();

    if (existing) {
      if (existing.status === 'accepted') {
        return fail(409, { action: 'sendFriendRequest', error: 'You are already friends.' });
      }
      if (existing.status === 'pending') {
        return fail(409, { action: 'sendFriendRequest', error: 'A request is already pending.' });
      }
      // A 'declined' row exists — remove it so a fresh request can be made.
      await supabase.from('friendships').delete().eq('id', existing.id);
    }

    const { error: insertErr } = await supabase
      .from('friendships')
      .insert({ requester_id: viewer.id, addressee_id: target.id, status: 'pending' });

    if (insertErr) {
      console.error('[profile] sendFriendRequest failed:', insertErr.message);
      return fail(500, { action: 'sendFriendRequest', error: 'Could not send request.' });
    }

    return { success: true, action: 'sendFriendRequest' };
  }
};
