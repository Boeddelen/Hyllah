import { json } from '@sveltejs/kit';
import { countUnreadMessages } from '$lib/server/messages.js';

/**
 * Returns { count: number } for the logged-in user's unread message count.
 * Called client-side by the layout so it doesn't block SSR — keeps the
 * layout server load lean enough to stay within Cloudflare's free-tier
 * 10ms CPU budget.
 *
 * @type {import('./$types').RequestHandler}
 */
export const GET = async ({ locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) return json({ count: 0 });

  const count = await countUnreadMessages(supabase, user.id);
  return json({ count });
};
