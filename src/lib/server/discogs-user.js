// Look up the current user's stored Discogs OAuth tokens.
// Throws if the user hasn't connected Discogs yet.

import { error } from '@sveltejs/kit';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 */
export async function getUserDiscogsTokens(supabase, userId) {
  const { data, error: dbError } = await supabase
    .from('users')
    .select('discogs_oauth_token, discogs_oauth_token_secret, discogs_username')
    .eq('id', userId)
    .maybeSingle();

  if (dbError) throw error(500, 'Could not load Discogs connection status');
  if (!data?.discogs_oauth_token || !data?.discogs_oauth_token_secret) {
    throw error(403, 'NOT_CONNECTED');
  }

  return {
    accessToken: data.discogs_oauth_token,
    accessTokenSecret: data.discogs_oauth_token_secret,
    username: data.discogs_username
  };
}
