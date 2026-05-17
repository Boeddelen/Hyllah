// GET /api/records/[recordId]/tracks — fetch tracks for a single record.
// Used by the edit modal to lazy-load tracks only when needed.

import { error, json } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ params, locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  const recordId = params.recordId;
  // UUIDs only — reject any other shape early
  if (!recordId || !/^[0-9a-f-]{36}$/i.test(recordId)) {
    throw error(400, 'Invalid record id');
  }

  // Verify ownership via the records table before loading tracks.
  // RLS would also block, but checking explicitly returns a clean 404 vs empty.
  const { data: record } = await supabase
    .from('records')
    .select('id')
    .eq('id', recordId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!record) throw error(404, 'Record not found');

  const { data, error: dbError } = await supabase
    .from('tracks')
    .select('position, title, duration, sort_order')
    .eq('record_id', recordId)
    .order('sort_order', { ascending: true });

  if (dbError) throw error(500, dbError.message);
  return json({ tracks: data ?? [] });
};
