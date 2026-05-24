import { error } from '@sveltejs/kit';

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
  profileCache.set(username.toLowerCase(), { data, timestamp: Date.now() });
}

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, locals: { supabase } }) => {
  const { username } = params;

  console.log(`[public-profile] load starting for username: ${username}`);

  if (!username || typeof username !== 'string') {
    console.log(`[public-profile] invalid username: ${username}`);
    throw error(404, 'Profile not found');
  }

  const cached = getCachedProfile(username);
  if (cached) {
    console.log(`[public-profile] cache hit for ${username}`);
    return cached;
  }

  try {
    // ── 1. Load public user profile ───────────────────────────────
    console.log(`[public-profile] querying users table for username: ${username}`);
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select(`
        id,
        username,
        display_name,
        bio,
        avatar_url,
        display_currency,
        show_values_publicly,
        show_discogs_links_publicly
      `)
      .ilike('username', username)
      .eq('is_public', true)
      .maybeSingle();

    if (userErr) {
      console.error(`[public-profile] ERROR: user query failed`, userErr);
      throw error(500, `User query failed: ${userErr.message}`);
    }

    if (!user) {
      console.log(`[public-profile] user not found or not public: ${username}`);
      throw error(404, 'Profile not found');
    }

    console.log(`[public-profile] user found: ${user.id} (${user.username})`);

    // ── 2. Load collections ───────────────────────────────────────
    console.log(`[public-profile] querying collections for user: ${user.id}`);
    const { data: collections, error: collectionsErr } = await supabase
      .from('collections')
      .select('id, name, icon')
      .eq('user_id', user.id)
      .order('name', { ascending: true });

    if (collectionsErr) {
      console.error(`[public-profile] ERROR: collections query failed`, collectionsErr);
      throw error(500, `Collections query failed: ${collectionsErr.message}`);
    }

    console.log(`[public-profile] collections loaded: ${(collections ?? []).length}`);

    // ── 3. Load public records (simplified — no nested join)
    console.log(`[public-profile] querying records for user: ${user.id}`);
    const { data: records, error: recordsErr } = await supabase
      .from('records')
      .select(`
        id,
        artist,
        title,
        image_url,
        format,
        year,
        condition,
        value_override,
        purchase_price,
        discogs_id,
        collection_id,
        created_at
      `)
      .eq('user_id', user.id)
      .eq('is_public_record', true)
      .eq('is_pending_delete', false)
      .order('created_at', { ascending: false });

    if (recordsErr) {
      console.error(`[public-profile] ERROR: records query failed`, recordsErr);
      throw error(500, `Records query failed: ${recordsErr.message}`);
    }

    console.log(`[public-profile] records loaded: ${(records ?? []).length}`);

    // ── 4. Build collection summaries ───────────────────────────────
    console.log(`[public-profile] building collection summaries`);
    const collectionSummaries = (collections ?? []).map((coll) => {
      const collRecords = (records ?? []).filter((r) => r.collection_id === coll.id);
      const covers = collRecords
        .filter((r) => r.image_url)
        .slice(0, 4)
        .map((r) => r.image_url);

      return {
        id: coll.id,
        name: coll.name,
        icon: coll.icon,
        count: collRecords.length,
        covers
      };
    });
    console.log(`[public-profile] collection summaries built: ${collectionSummaries.length}`);

    // ── 5. Sanitize — respect user's privacy preferences
    console.log(`[public-profile] sanitizing records (privacy filtering)`);
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
    console.log(`[public-profile] records sanitized: ${recordsForDisplay.length}`);

    console.log(`[public-profile] building payload`);
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
              const v = Number(r.value_override);
              return sum + (Number.isFinite(v) ? v : 0);
            }, 0)
          : null
      }
    };

    console.log(`[public-profile] caching profile for ${username}`);
    setCachedProfile(username, payload);
    console.log(`[public-profile] load complete for ${username}`);
    return payload;
  } catch (err) {
    console.error(`[public-profile] EXCEPTION CAUGHT:`, err);
    if (err?.status) throw err;
    throw error(500, `Server error: ${err?.message || JSON.stringify(err)}`);
  }
};
