import { error, fail, redirect } from '@sveltejs/kit';
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

// ─── Form actions ──────────────────────────────────────────────────────

/** @type {import('./$types').Actions} */
export const actions = {
  create: async ({ request, params, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const built = buildRecordFromForm(form, user.id, params.collectionId);
    if (built.error) return fail(400, { action: 'create', error: built.error });

    const { data, error: dbError } = await supabase
      .from('records')
      .insert(built.record)
      .select()
      .single();

    if (dbError) return fail(500, { action: 'create', error: dbError.message });
    return { action: 'create', success: true, record: data };
  },

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

  delete: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'delete', error: 'Missing record id' });

    const { error: dbError } = await supabase
      .from('records')
      .delete()
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (dbError) return fail(500, { action: 'delete', error: dbError.message });
    return { action: 'delete', success: true };
  }
};
