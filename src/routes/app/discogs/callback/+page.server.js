import { redirect } from '@sveltejs/kit';
import { getAccessToken, getIdentity } from '$lib/server/discogs.js';

/**
 * Discogs redirects the user here after they authorize on discogs.com.
 * URL contains: ?oauth_token=...&oauth_verifier=...
 *
 * We must:
 *  1. Match oauth_token against our stashed request token from the cookie
 *  2. Exchange request token + verifier for an access token
 *  3. Fetch the user's identity (so we can show their username)
 *  4. Store the access token, secret, and username on the user's profile
 *  5. Clear the cookie
 *  6. Redirect to settings with a success indicator
 */

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ url, cookies, locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  const oauth_token = url.searchParams.get('oauth_token');
  const oauth_verifier = url.searchParams.get('oauth_verifier');
  const denied = url.searchParams.get('denied');

  // User cancelled on Discogs' side
  if (denied) {
    cookies.delete('rv_dg_req', { path: '/' });
    throw redirect(303, '/app/settings?discogs=cancelled');
  }

  if (!oauth_token || !oauth_verifier) {
    throw redirect(303, '/app/settings?discogs=error&detail=missing-params');
  }

  // Read the stashed request token from the cookie
  const stashRaw = cookies.get('rv_dg_req');
  if (!stashRaw) {
    throw redirect(303, '/app/settings?discogs=error&detail=session-expired');
  }

  let stash;
  try {
    stash = JSON.parse(stashRaw);
  } catch {
    throw redirect(303, '/app/settings?discogs=error&detail=bad-session');
  }

  // Confirm the request token matches what we stashed
  if (stash.t !== oauth_token) {
    throw redirect(303, '/app/settings?discogs=error&detail=token-mismatch');
  }

  try {
    // Step 3: exchange for access token
    const { accessToken, accessTokenSecret } = await getAccessToken(
      stash.t,
      stash.s,
      oauth_verifier
    );

    // Fetch identity to know who we're connected as
    const identity = await getIdentity(accessToken, accessTokenSecret);
    const discogsUsername = identity?.username ?? null;

    // Store on user profile
    const { error: updateError } = await supabase
      .from('users')
      .update({
        discogs_username: discogsUsername,
        discogs_oauth_token: accessToken,
        discogs_oauth_token_secret: accessTokenSecret,
        discogs_connected_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to store Discogs tokens:', updateError);
      throw new Error(updateError.message);
    }

    // Clean up the request-token cookie
    cookies.delete('rv_dg_req', { path: '/' });

    throw redirect(303, '/app/settings?discogs=connected');
  } catch (err) {
    if (err?.status && err?.location) throw err; // re-throw redirects
    console.error('Discogs callback failed:', err);
    cookies.delete('rv_dg_req', { path: '/' });
    throw redirect(
      303,
      `/app/settings?discogs=error&detail=${encodeURIComponent(err.message ?? 'unknown')}`
    );
  }
};
