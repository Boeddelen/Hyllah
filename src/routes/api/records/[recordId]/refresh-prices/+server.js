// POST /api/records/[recordId]/refresh-prices
// Fetches fresh price suggestions from Discogs for this record's release
// and updates the prices + prices_refreshed_at columns.

import { error, json } from '@sveltejs/kit';
import { getPriceSuggestions } from '$lib/server/discogs.js';
import { getUserDiscogsTokens } from '$lib/server/discogs-user.js';

/** @type {import('./$types').RequestHandler} */
export const POST = async ({ params, locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  const recordId = params.recordId;
  if (!recordId || !/^[0-9a-f-]{36}$/i.test(recordId)) {
    throw error(400, 'Invalid record id');
  }

  // Verify ownership and fetch discogs_id
  const { data: record } = await supabase
    .from('records')
    .select('id, discogs_id')
    .eq('id', recordId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!record) throw error(404, 'Record not found');
  if (!record.discogs_id) {
    throw error(400, 'This record is not linked to Discogs');
  }

  const { accessToken, accessTokenSecret } = await getUserDiscogsTokens(supabase, user.id);

  let prices;
  try {
    prices = await getPriceSuggestions(record.discogs_id, accessToken, accessTokenSecret);
  } catch (err) {
    if (err.message?.startsWith('SELLER_SETTINGS_REQUIRED:')) {
      throw error(412, 'Discogs seller settings required');
    }
    if (err.message?.includes('429') || err.message?.toLowerCase().includes('too quickly')) {
      throw error(429, 'Discogs is rate-limiting us. Try again in a minute.');
    }
    console.error('Price refresh failed:', err);
    throw error(502, `Could not refresh prices: ${err.message}`);
  }

  const { error: dbError } = await supabase
    .from('records')
    .update({
      prices,
      prices_refreshed_at: new Date().toISOString()
    })
    .eq('id', recordId)
    .eq('user_id', user.id);

  if (dbError) throw error(500, dbError.message);

  return json({ success: true, prices, prices_refreshed_at: new Date().toISOString() });
};
