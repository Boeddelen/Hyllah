import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ locals: { safeGetSession } }) => {
  const { session, user } = await safeGetSession();
  if (!session) throw redirect(303, '/login');
  return { user };
};
