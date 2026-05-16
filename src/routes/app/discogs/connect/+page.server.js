import { redirect, fail } from '@sveltejs/kit';
import { getRequestToken } from '$lib/server/discogs.js';
import { PUBLIC_APP_URL } from '$env/static/public';

/** @type {import('./$types').Actions} */
export const actions = {
  default: async ({ locals: { safeGetSession }, cookies }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const callbackUrl = `${PUBLIC_APP_URL}/app/discogs/callback`;

    try {
      const { token, tokenSecret, authorizeUrl } = await getRequestToken(callbackUrl);

      // Stash the request token + secret in a short-lived HTTP-only cookie.
      // We'll need it to complete the exchange when Discogs redirects back.
      cookies.set(
        'rv_dg_req',
        JSON.stringify({ t: token, s: tokenSecret }),
        {
          path: '/app/discogs',
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 60 * 15 // 15 minutes
        }
      );

      throw redirect(303, authorizeUrl);
    } catch (err) {
      // SvelteKit's redirect() throws a special object — let it through
      if (err?.status && err?.location) throw err;
      console.error('Discogs request token failed:', err);
      return fail(500, {
        error: `Could not start Discogs connection: ${err.message}`
      });
    }
  }
};

/** @type {import('./$types').PageServerLoad} */
export const load = async () => {
  // This route only accepts POST. GET visits redirect to settings.
  throw redirect(303, '/app/settings');
};
