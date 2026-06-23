import { redirect } from '@sveltejs/kit';
import { getInbox } from '$lib/server/messages.js';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  const conversations = await getInbox(supabase, user.id);
  return { conversations };
};
