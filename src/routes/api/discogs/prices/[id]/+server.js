import { error, json } from '@sveltejs/kit';
import { getPriceSuggestions } from '$lib/server/discogs.js';
import { getUserDiscogsTokens } from '$lib/server/discogs-user.js';

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ params, locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  const id = params.id;
  if (!id || !/^\d+$/.test(id)) throw error(400, 'Invalid release id');

  const { accessToken, accessTokenSecret } = await getUserDiscogsTokens(supabase, user.id);

  try {
    const prices = await getPriceSuggestions(id, accessToken, accessTokenSecret);
    return json(prices);
  } catch (err) {
    // Special-case the seller-settings error so the UI can show a friendly message
    if (err.message?.startsWith('SELLER_SETTINGS_REQUIRED:')) {
      throw error(412, err.message); // 412 Precondition Failed
    }
    console.error('Discogs price fetch failed:', err);
    throw error(502, `Could not fetch prices: ${err.message}`);
  }
};
