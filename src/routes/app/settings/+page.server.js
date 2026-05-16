import { redirect } from '@sveltejs/kit';
import { getRequestToken } from '$lib/server/discogs.js';
import { PUBLIC_APP_URL } from '$env/static/public';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ url }) => {
  return {
    discogsStatus: url.searchParams.get('discogs'),
    discogsDetail: url.searchParams.get('detail')
  };
};

/**
 * Actions live on the settings page itself — no cross-route posting.
 * This is the SvelteKit-idiomatic approach and eliminates all routing ambiguity.
 */

/** @type {import('./$types').Actions} */
export const actions = {
  /**
   * Initiate Discogs OAuth.
   * Gets a request token from Discogs, stashes it in a cookie, redirects to Discogs.
   * IMPORTANT: do NOT wrap the final redirect() in try/catch — it throws internally
   * and a catch block will swallow it.
   */
  connectDiscogs: async ({ locals: { safeGetSession }, cookies }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const callbackUrl = `${PUBLIC_APP_URL}/app/discogs/callback`;
    const { token, tokenSecret, authorizeUrl } = await getRequestToken(callbackUrl);

    cookies.set(
      'rv_dg_req',
      JSON.stringify({ t: token, s: tokenSecret }),
      {
        path: '/',          // broader path so callback route can read it
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 15
      }
    );

    throw redirect(303, authorizeUrl);
  },

  /** Disconnect Discogs — clears stored tokens from user profile. */
  disconnectDiscogs: async ({ locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    await supabase
      .from('users')
      .update({
        discogs_username: null,
        discogs_oauth_token: null,
        discogs_oauth_token_secret: null,
        discogs_connected_at: null
      })
      .eq('id', user.id);

    throw redirect(303, '/app/settings?discogs=disconnected');
  }
};
