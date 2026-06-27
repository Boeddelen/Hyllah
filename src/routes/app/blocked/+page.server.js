import { fail, redirect } from '@sveltejs/kit';
import { listBlockedUsers, unblockUser } from '$lib/server/blocks.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  const blocked = await listBlockedUsers(supabase, user.id);
  return { blocked };
};

/** @type {import('./$types').Actions} */
export const actions = {
  unblock: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const targetId = (form.get('userId') ?? '').toString();
    if (!UUID_RE.test(targetId)) {
      return fail(400, { action: 'unblock', error: 'Invalid user id.' });
    }

    const result = await unblockUser(supabase, user.id, targetId);
    if (!result.ok) return fail(500, { action: 'unblock', error: 'Could not unblock.' });
    return { action: 'unblock', success: true };
  }
};
