import { error, fail, redirect, json } from '@sveltejs/kit';
import { loadCollection, loadRecords } from '$lib/server/db';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, parent, locals: { supabase } }) => {
  const { user } = await parent();
  const collection = await loadCollection(supabase, user.id, params.collectionId);
  if (!collection) throw error(404, 'Collection not found');

  const records = await loadRecords(supabase, user.id, params.collectionId);

  return { collection, records };
};

// ─── Form parsing helpers ──────────────────────────────────────────────

function str(v) {
  const s = (v ?? '').toString().trim();
  return s ? s : null;
}

function num(v) {
  const s = (v ?? '').toString().trim().replace(',', '.');
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function parseTags(v) {
  const s = (v ?? '').toString();
  return s
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 30);
}

const VALID_FORMATS = ['vinyl', 'cd', 'cassette', 'reel_to_reel', 'eight_track', 'minidisc', 'digital'];
const VALID_CONDITIONS = ['M', 'NM', 'VG_PLUS', 'VG', 'G_PLUS', 'G', 'F', 'P'];

function buildRecordFromForm(form, userId, collectionId) {
  const artist = str(form.get('artist'));
  const title = str(form.get('title'));

  if (!artist) return { error: 'Artist is required' };
  if (!title) return { error: 'Title is required' };
  if (artist.length > 200) return { error: 'Artist name is too long' };
  if (title.length > 300) return { error: 'Title is too long' };

  const format = str(form.get('format')) ?? 'vinyl';
  if (!VALID_FORMATS.includes(format)) return { error: 'Invalid format' };

  const condition = str(form.get('condition'));
  if (condition && !VALID_CONDITIONS.includes(condition)) {
    return { error: 'Invalid condition' };
  }

  return {
    record: {
      user_id: userId,
      collection_id: collectionId,
      artist,
      title,
      label: str(form.get('label')),
      year: str(form.get('year')),
      format,
      genre: str(form.get('genre')),
      condition: condition || 'VG_PLUS',
      notes: str(form.get('notes')),
      tags: parseTags(form.get('tags')),
      purchase_price: num(form.get('purchase_price')),
      value_override: num(form.get('value_override'))
    }
  };
}

/**
 * Look for potential duplicates: same artist + title in this user's collections.
 * Returns at most 3 matches.
 */
async function findDuplicates(supabase, userId, artist, title) {
  const { data } = await supabase
    .from('records')
    .select('id, artist, title, format, year, collection_id, is_archived')
    .eq('user_id', userId)
    .eq('is_pending_delete', false)
    .ilike('artist', artist)
    .ilike('title', title)
    .limit(3);
  return data ?? [];
}

// ─── Form actions ──────────────────────────────────────────────────────

/** @type {import('./$types').Actions} */
export const actions = {
  /**
   * Create a new record. Returns possible duplicates if `forceCreate` not set.
   */
  create: async ({ request, params, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const built = buildRecordFromForm(form, user.id, params.collectionId);
    if (built.error) return fail(400, { action: 'create', error: built.error });

    // Check for duplicates unless user explicitly chose to add anyway
    const forceCreate = form.get('force') === 'true';
    if (!forceCreate) {
      const dupes = await findDuplicates(supabase, user.id, built.record.artist, built.record.title);
      if (dupes.length > 0) {
        return fail(409, {
          action: 'create',
          duplicates: dupes,
          // Echo the form data so the modal can re-populate after the warning
          formData: built.record
        });
      }
    }

    const { data, error: dbError } = await supabase
      .from('records')
      .insert(built.record)
      .select()
      .single();

    if (dbError) return fail(500, { action: 'create', error: dbError.message });
    return { action: 'create', success: true, record: data };
  },

  /** Update an existing record */
  update: async ({ request, params, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'update', error: 'Missing record id' });

    const built = buildRecordFromForm(form, user.id, params.collectionId);
    if (built.error) return fail(400, { action: 'update', error: built.error });

    const { user_id, collection_id, ...updateFields } = built.record;

    const { error: dbError } = await supabase
      .from('records')
      .update(updateFields)
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (dbError) return fail(500, { action: 'update', error: dbError.message });
    return { action: 'update', success: true };
  },

  /**
   * Soft delete — marks record as pending_delete. The UI shows an undo toast
   * for 8 seconds. If the user clicks Undo within that window we call `undelete`.
   * Otherwise a separate `commitDelete` action runs after the timer expires.
   */
  softDelete: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'softDelete', error: 'Missing record id' });

    const { error: dbError } = await supabase
      .from('records')
      .update({
        is_pending_delete: true,
        pending_delete_at: new Date().toISOString()
      })
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (dbError) return fail(500, { action: 'softDelete', error: dbError.message });
    return { action: 'softDelete', success: true, recordId };
  },

  /** Undo a soft delete — only works if still within the pending window */
  undoDelete: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'undoDelete', error: 'Missing record id' });

    const { error: dbError } = await supabase
      .from('records')
      .update({
        is_pending_delete: false,
        pending_delete_at: null
      })
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (dbError) return fail(500, { action: 'undoDelete', error: dbError.message });
    return { action: 'undoDelete', success: true };
  },

  /**
   * Hard delete — actually remove from DB.
   * Called after the 8-second undo window expires.
   * Also called from the archive view as the permanent delete option.
   */
  commitDelete: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'commitDelete', error: 'Missing record id' });

    const { error: dbError } = await supabase
      .from('records')
      .delete()
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (dbError) return fail(500, { action: 'commitDelete', error: dbError.message });
    return { action: 'commitDelete', success: true };
  },

  /** Archive a record — "I no longer own this." */
  archive: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'archive', error: 'Missing record id' });

    const { error: dbError } = await supabase
      .from('records')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString()
      })
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (dbError) return fail(500, { action: 'archive', error: dbError.message });
    return { action: 'archive', success: true };
  },

  /** Unarchive a record — back to active collection */
  unarchive: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'unarchive', error: 'Missing record id' });

    const { error: dbError } = await supabase
      .from('records')
      .update({
        is_archived: false,
        archived_at: null
      })
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (dbError) return fail(500, { action: 'unarchive', error: dbError.message });
    return { action: 'unarchive', success: true };
  }
};
