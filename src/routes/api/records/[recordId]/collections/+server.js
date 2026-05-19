// GET /api/records/[recordId]/collections — fetch the collection IDs this
// record currently belongs to. Used by the edit modal to pre-fill the
// "In collections" multi-select.

import { error, json } from '@sveltejs/kit';
import { loadRecordCollections } from '$lib/server/db.js';

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ params, locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  const recordId = params.recordId;
  if (!recordId || !/^[0-9a-f-]{36}$/i.test(recordId)) {
    throw error(400, 'Invalid record id');
  }

  const collectionIds = await loadRecordCollections(supabase, user.id, recordId);
  return json({ collectionIds });
};
