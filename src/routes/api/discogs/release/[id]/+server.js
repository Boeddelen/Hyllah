import { error, json } from '@sveltejs/kit';
import { getRelease } from '$lib/server/discogs.js';
import { getUserDiscogsTokens } from '$lib/server/discogs-user.js';

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ params, locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  const id = params.id;
  if (!id || !/^\d+$/.test(id)) throw error(400, 'Invalid release id');

  const { accessToken, accessTokenSecret } = await getUserDiscogsTokens(supabase, user.id);

  try {
    const release = await getRelease(id, accessToken, accessTokenSecret);
    return json(release);
  } catch (err) {
    console.error('Discogs release fetch failed:', err);
    throw error(502, `Could not fetch release: ${err.message}`);
  }
};
