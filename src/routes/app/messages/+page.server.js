import { redirect } from '@sveltejs/kit';
import { getInbox } from '$lib/server/messages.js';
import { listBlockedIds } from '$lib/server/blocks.js';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  const [conversations, blockedIds] = await Promise.all([
    getInbox(supabase, user.id),
    listBlockedIds(supabase, user.id)
  ]);

  // Hide conversations with anyone blocked in either direction.
  const visible = conversations.filter((c) => !blockedIds.has(c.partner.id));
  return { conversations: visible };
};
