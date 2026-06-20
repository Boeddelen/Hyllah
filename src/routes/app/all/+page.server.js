import { fail, redirect } from '@sveltejs/kit';
import {
  loadRecords,
  loadCollections,
  loadAllRecordCollections,
  loadVaultFacets,
  setRecordCollections
} from '$lib/server/db';
import { buildRecordFromForm, parseTracklist, parseCollections } from '$lib/server/recordForm.js';

function arrParam(url, key) {
  const raw = url.searchParams.get(key);
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

const VALID_SORTS = [
  'recent', 'oldest', 'artist', 'title',
  'year-desc', 'year-asc', 'value-desc', 'value-asc'
];

function str(v) {
  const s = (v ?? '').toString().trim();
  return s ? s : null;
}

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ parent, url, locals: { supabase } }) => {
  const { user, profile } = await parent();

  const query = url.searchParams.get('q') ?? '';
  const formats = arrParam(url, 'format');
  const conditions = arrParam(url, 'condition');
  const tags = arrParam(url, 'tag');
  const sortRaw = url.searchParams.get('sort') ?? 'recent';
  const sort = VALID_SORTS.includes(sortRaw) ? sortRaw : 'recent';

  const cardBackView = profile?.card_back_view ?? 'details';
  const withTracks = cardBackView === 'tracklist' || cardBackView === 'both';

  const [records, allCollections, recordCollections, facets] = await Promise.all([
    loadRecords(supabase, user.id, null, {
      withTracks, query, formats, conditions, tags, sort
    }),
    loadCollections(supabase, user.id),
    loadAllRecordCollections(supabase, user.id),
    loadVaultFacets(supabase, user.id)
  ]);

  // Build map: recordId → [collection info]
  const collectionMap = {};
  for (const coll of allCollections) {
    collectionMap[coll.id] = coll;
  }
  const recordCollectionNames = {};
  for (const rc of recordCollections ?? []) {
    if (!recordCollectionNames[rc.record_id]) {
      recordCollectionNames[rc.record_id] = [];
    }
    const coll = collectionMap[rc.collection_id];
    if (coll) {
      recordCollectionNames[rc.record_id].push({
        id: coll.id,
        name: coll.name,
        icon: coll.icon
      });
    }
  }

  return {
    records,
    allCollections,
    recordCollectionNames,
    facets,
    filter: { query, formats, conditions, tags, sort }
  };
};

/** @type {import('./$types').Actions} */
export const actions = {
  // Edit an existing record from the all-records view. Mirrors the collection
  // view's `update`, but with no "current collection" to force-include — the
  // modal's collection selection stands on its own (setRecordCollections still
  // enforces that a record keeps at least one collection).
  update: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'update', error: 'Missing record id' });

    const built = buildRecordFromForm(form, user.id, null);
    if (built.error) return fail(400, { action: 'update', error: built.error });

    const { user_id, collection_id, ...updateFields } = built.record;

    const { error: dbError } = await supabase
      .from('records')
      .update(updateFields)
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (dbError) return fail(500, { action: 'update', error: dbError.message });

    // Sync collection membership if the modal sent a selection.
    const collectionSet = parseCollections(form, null);
    if (collectionSet !== null) {
      const res = await setRecordCollections(supabase, user.id, recordId, collectionSet);
      if (!res.ok) {
        console.error('setRecordCollections failed (non-fatal):', res.error);
      }
    }

    // Replace tracklist if sent (empty field means "leave existing alone").
    const tracklist = parseTracklist(form);
    if (tracklist !== null) {
      const { data: ownerCheck } = await supabase
        .from('records')
        .select('id')
        .eq('id', recordId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (ownerCheck) {
        await supabase.from('tracks').delete().eq('record_id', recordId);
        if (tracklist.length > 0) {
          const tracks = tracklist.map((t) => ({ ...t, record_id: recordId }));
          const { error: tracksError } = await supabase.from('tracks').insert(tracks);
          if (tracksError) console.error('Track update failed:', tracksError);
        }
      }
    }

    return { action: 'update', success: true };
  },

  softDelete: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');
    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'softDelete', error: 'Missing record id' });

    const { error: dbError } = await supabase
      .from('records')
      .update({ is_pending_delete: true, pending_delete_at: new Date().toISOString() })
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (dbError) return fail(500, { action: 'softDelete', error: dbError.message });
    return { action: 'softDelete', success: true, recordId };
  },

  undoDelete: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');
    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'undoDelete', error: 'Missing record id' });

    const { error: dbError } = await supabase
      .from('records')
      .update({ is_pending_delete: false, pending_delete_at: null })
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (dbError) return fail(500, { action: 'undoDelete', error: dbError.message });
    return { action: 'undoDelete', success: true };
  },

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

  archive: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');
    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'archive', error: 'Missing record id' });

    const { error: dbError } = await supabase
      .from('records')
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (dbError) return fail(500, { action: 'archive', error: dbError.message });
    return { action: 'archive', success: true };
  },

  toggleRecordPrivacy: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');
    const form = await request.formData();
    const recordId = str(form.get('id'));
    const isPublicStr = form.get('isPublic');
    if (!recordId || isPublicStr === null) {
      return fail(400, { action: 'toggleRecordPrivacy', error: 'Missing fields' });
    }
    const isPublic = isPublicStr === 'true';

    const { data: record, error: getErr } = await supabase
      .from('records')
      .select('id')
      .eq('id', recordId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (getErr) return fail(500, { action: 'toggleRecordPrivacy', error: getErr.message });
    if (!record) return fail(404, { action: 'toggleRecordPrivacy', error: 'Record not found' });

    const { error: updateErr } = await supabase
      .from('records')
      .update({ is_public_record: isPublic })
      .eq('id', recordId);

    if (updateErr) return fail(500, { action: 'toggleRecordPrivacy', error: updateErr.message });
    return { action: 'toggleRecordPrivacy', success: true, recordId, isPublic };
  }
};
