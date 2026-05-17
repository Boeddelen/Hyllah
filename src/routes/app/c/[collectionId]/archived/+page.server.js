import { error, fail, redirect } from '@sveltejs/kit';
import { loadCollection, loadRecords } from '$lib/server/db';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, parent, locals: { supabase } }) => {
  const { user } = await parent();
  const collection = await loadCollection(supabase, user.id, params.collectionId);
  if (!collection) throw error(404, 'Collection not found');

  const records = await loadRecords(supabase, user.id, params.collectionId, { archived: true });

  return { collection, records };
};

function str(v) {
  const s = (v ?? '').toString().trim();
  return s ? s : null;
}

/** Actions for the archive view. */
/** @type {import('./$types').Actions} */
export const actions = {
  /** Unarchive — return to active collection */
  unarchive: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'unarchive', error: 'Missing record id' });

    const { error: dbError } = await supabase
      .from('records')
      .update({ is_archived: false, archived_at: null })
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (dbError) return fail(500, { action: 'unarchive', error: dbError.message });
    return { action: 'unarchive', success: true };
  },

  /** Permanently delete from archive (no undo) */
  permanentDelete: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'permanentDelete', error: 'Missing record id' });

    const { error: dbError } = await supabase
      .from('records')
      .delete()
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (dbError) return fail(500, { action: 'permanentDelete', error: dbError.message });
    return { action: 'permanentDelete', success: true };
  }
};
