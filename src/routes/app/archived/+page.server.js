import { fail, redirect } from '@sveltejs/kit';
import { loadRecords } from '$lib/server/db';

function str(v) {
  const s = (v ?? '').toString().trim();
  return s ? s : null;
}

/**
 * Parse a bulk selection of record IDs (comma-separated `ids`). Validates UUID
 * shape, de-duplicates, caps the batch. Ownership is enforced per query.
 */
function parseIds(form) {
  const raw = (form.get('ids') ?? '').toString();
  if (!raw.trim()) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    )
  ).slice(0, 200);
}

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ parent, locals: { supabase } }) => {
  const { user } = await parent();
  // All archived records across every collection (collectionId = null).
  const records = await loadRecords(supabase, user.id, null, { archived: true });
  return { records };
};

/** @type {import('./$types').Actions} */
export const actions = {
  // Single unarchive — safe and reversible, offered per card.
  unarchive: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');
    const recordId = str((await request.formData()).get('id'));
    if (!recordId) return fail(400, { action: 'unarchive', error: 'Missing record id' });

    const { error } = await supabase
      .from('records')
      .update({ is_archived: false, archived_at: null })
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (error) return fail(500, { action: 'unarchive', error: error.message });
    return { action: 'unarchive', success: true };
  },

  // Bulk unarchive a validated set of the user's own records.
  bulkUnarchive: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');
    const ids = parseIds(await request.formData());
    if (!ids.length) return fail(400, { action: 'bulkUnarchive', error: 'No records selected' });

    const { error } = await supabase
      .from('records')
      .update({ is_archived: false, archived_at: null })
      .in('id', ids)
      .eq('user_id', user.id);

    if (error) return fail(500, { action: 'bulkUnarchive', error: error.message });
    return { action: 'bulkUnarchive', success: true, count: ids.length };
  },

  // Permanent deletion from the archive — no undo. Gated behind select mode +
  // an explicit confirm on the client.
  bulkPermanentDelete: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');
    const ids = parseIds(await request.formData());
    if (!ids.length) return fail(400, { action: 'bulkPermanentDelete', error: 'No records selected' });

    const { error } = await supabase
      .from('records')
      .delete()
      .in('id', ids)
      .eq('user_id', user.id);

    if (error) return fail(500, { action: 'bulkPermanentDelete', error: error.message });
    return { action: 'bulkPermanentDelete', success: true };
  }
};
