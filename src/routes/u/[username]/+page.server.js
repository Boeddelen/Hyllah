import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, locals: { supabase } }) => {
  const { username } = params;

  if (!username || typeof username !== 'string') throw error(404, 'Profile not found');

  // Step 1: bare minimum user query — no cache, no fancy columns
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, username, display_name, bio, avatar_url, is_public, display_currency, show_values_publicly, show_discogs_links_publicly')
    .ilike('username', username)
    .maybeSingle();

  if (userErr) {
    throw error(500, `User query failed [${userErr.code}]: ${userErr.message}`);
  }
  if (!user) throw error(404, 'Profile not found — user not in DB');
  if (!user.is_public) throw error(404, 'Profile not found — not public');

  // Step 2: collections
  const { data: collections, error: collErr } = await supabase
    .from('collections')
    .select('id, name, icon')
    .eq('user_id', user.id)
    .order('name', { ascending: true });

  if (collErr) {
    throw error(500, `Collections query failed [${collErr.code}]: ${collErr.message}`);
  }

  // Step 3: records — minimal columns only
  const { data: records, error: recErr } = await supabase
    .from('records')
    .select('id, artist, title, image_url, format, year, condition, value_override, purchase_price, discogs_id, created_at')
    .eq('user_id', user.id)
    .eq('is_public_record', true)
    .eq('is_pending_delete', false)
    .order('created_at', { ascending: false });

  if (recErr) {
    throw error(500, `Records query failed [${recErr.code}]: ${recErr.message}`);
  }

  // Step 4: build payload
  const collectionSummaries = (collections ?? []).map((coll) => ({
    id: coll.id,
    name: coll.name,
    icon: coll.icon,
    count: 0,
    covers: []
  }));

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

  return {
    user: {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      bio: user.bio,
      avatar_url: user.avatar_url,
      display_currency: user.display_currency,
      show_values_publicly: user.show_values_publicly,
      show_discogs_links_publicly: user.show_discogs_links_publicly,
      public_theme: 'listening-room',
      public_mode: 'dark'
    },
    collections: collectionSummaries,
    records: recordsForDisplay,
    stats: {
      total_records: recordsForDisplay.length,
      total_collections: collectionSummaries.length,
      total_value: null
    }
  };
};
