import { error, json } from '@sveltejs/kit';
import { searchReleases } from '$lib/server/discogs.js';
import { getUserDiscogsTokens } from '$lib/server/discogs-user.js';

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ url, locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return json({ results: [] });
  }

  const { accessToken, accessTokenSecret } = await getUserDiscogsTokens(supabase, user.id);

  try {
    const data = await searchReleases(q, accessToken, accessTokenSecret, { perPage: 20 });
    return json(data);
  } catch (err) {
    console.error('Discogs search failed:', err);
    throw error(502, `Discogs search failed: ${err.message}`);
  }
};
