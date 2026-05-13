import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export const POST = async ({ locals: { supabase } }) => {
  await supabase.auth.signOut();
  throw redirect(303, '/');
};
