import { redirect } from '@sveltejs/kit';
import { loadCollections, loadCollectionCounts, loadUserProfile } from '$lib/server/db';

/** @type {import('./$types').LayoutServerLoad} */
export const load = async ({ locals: { safeGetSession, supabase } }) => {
  const { session, user } = await safeGetSession();
  if (!session || !user) throw redirect(303, '/login');

  const [profile, collections, counts] = await Promise.all([
    loadUserProfile(supabase, user.id),
    loadCollections(supabase, user.id),
    loadCollectionCounts(supabase, user.id)
  ]);

  return {
    user,
    profile,
    collections,
    counts
  };
};
