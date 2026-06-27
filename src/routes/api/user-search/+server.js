import { json, error } from '@sveltejs/kit';
import { listBlockedIds } from '$lib/server/blocks.js';
import { getFriendshipStatus } from '$lib/server/friendships.js';

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 20;

/**
 * Search for public profiles by handle (username) or display name.
 * Case-insensitive partial match. Bio is intentionally NOT searched —
 * it can contain sensitive info users wouldn't expect to be discoverable.
 *
 * Privacy guarantees:
 *   - Only profiles with is_public=true are returned
 *   - Users blocked in EITHER direction are excluded
 *   - The searching user is excluded from their own results
 *   - Friendship status is included so the UI can show "Add friend" vs.
 *     "Friends ✓" without needing a second round-trip
 *
 * @type {import('./$types').RequestHandler}
 */
export const GET = async ({ url, locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  const q = (url.searchParams.get('q') ?? '').trim();
  if (q.length < MIN_QUERY_LENGTH) {
    return json({ results: [] });
  }

  // Escape postgres ILIKE wildcards so users can't break out of the pattern.
  // (Without this, a query of "%" would match every user.)
  const safeQuery = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  const pattern = `%${safeQuery}%`;

  // Match against handle (username) OR display name. Both ILIKE.
  // PostgREST .or() requires the operands to be comma-separated values.
  const { data: matches, error: dbError } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url')
    .eq('is_public', true)
    .neq('id', user.id) // never include the searcher
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
    .limit(MAX_RESULTS * 2); // fetch extra so we can filter blocks without re-querying

  if (dbError) {
    console.error('[user-search] query failed:', dbError.message);
    throw error(500, 'Search failed');
  }

  // Remove anyone blocked in either direction.
  const blockedIds = await listBlockedIds(supabase, user.id);
  const filtered = (matches ?? []).filter((u) => !blockedIds.has(u.id)).slice(0, MAX_RESULTS);

  // Add friendship status for each remaining result, in parallel.
  // This is cheap (one indexed query per result, capped at 20) and avoids
  // an N+1 navigation when the user clicks through.
  const withStatus = await Promise.all(
    filtered.map(async (u) => ({
      ...u,
      friendshipStatus: await getFriendshipStatus(supabase, user.id, u.id)
    }))
  );

  return json({ results: withStatus });
};
