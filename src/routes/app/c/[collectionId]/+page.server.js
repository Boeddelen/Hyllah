import { error, redirect } from '@sveltejs/kit';
import { loadCollection, loadRecords } from '$lib/server/db';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, parent, locals: { supabase } }) => {
  const { user } = await parent();
  const collection = await loadCollection(supabase, user.id, params.collectionId);
  if (!collection) throw error(404, 'Collection not found');

  const records = await loadRecords(supabase, user.id, params.collectionId);

  return {
    collection,
    records
  };
};
