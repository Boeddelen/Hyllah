import { error, fail, redirect } from '@sveltejs/kit';
import {
  loadCollection,
  loadCollectionFacets,
  loadRecords,
  loadCollections,
  loadRecordCollections,
  setRecordCollections,
  ensureRecordInCollection,
  removeRecordFromCollection
} from '$lib/server/db';
import { buildRecordFromForm, parseTracklist, parseCollections, findDuplicates } from '$lib/server/recordForm.js';

/** Parse a comma-separated URL param into a clean string array. */
function arrParam(url, key) {
  const raw = url.searchParams.get(key);
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Whitelist a sort key against the known set. */
const VALID_SORTS = [
  'recent', 'oldest', 'artist', 'title',
  'year-desc', 'year-asc', 'value-desc', 'value-asc'
];

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, parent, url, locals: { supabase } }) => {
  const { user, profile } = await parent();
  const collection = await loadCollection(supabase, user.id, params.collectionId);
  if (!collection) throw error(404, 'Collection not found');

  // Read filter / search / sort state from URL — bookmarkable and shareable
  const query = url.searchParams.get('q') ?? '';
  const formats = arrParam(url, 'format');
  const conditions = arrParam(url, 'condition');
  const tags = arrParam(url, 'tag');
  const sortRaw = url.searchParams.get('sort') ?? 'recent';
  const sort = VALID_SORTS.includes(sortRaw) ? sortRaw : 'recent';

  // Only fetch tracks when the user's preference needs them (tracklist or both view).
  const cardBackView = profile?.card_back_view ?? 'details';
  const withTracks = cardBackView === 'tracklist' || cardBackView === 'both';

  // Records + facets + all-collections in parallel
  const [records, facets, allCollections] = await Promise.all([
    loadRecords(supabase, user.id, params.collectionId, {
      withTracks,
      query,
      formats,
      conditions,
      tags,
      sort
    }),
    loadCollectionFacets(supabase, user.id, params.collectionId),
    loadCollections(supabase, user.id)
  ]);

  return {
    collection,
    records,
    facets,
    allCollections,
    filter: { query, formats, conditions, tags, sort }
  };
};

// ─── Form parsing helpers ──────────────────────────────────────────────

function str(v) {
  const s = (v ?? '').toString().trim();
  return s ? s : null;
}

/**
 * Look for potential duplicates: same artist + title in this user's collections.
 * Returns at most 3 matches.
 */

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

    // Dual-write: the new record is in its primary collection. The legacy
    // records.collection_id is already set by the insert above; mirror it
    // into the junction table so the rest of the app sees it consistently.
    const ensureRes = await ensureRecordInCollection(
      supabase,
      user.id,
      data.id,
      params.collectionId
    );
    if (!ensureRes.ok) {
      console.error('Junction insert failed (non-fatal for record create):', ensureRes.error);
    }

    // If the user picked additional collections in the modal, add them too.
    const extraCollections = parseCollections(form, params.collectionId);
    if (extraCollections && extraCollections.length > 0) {
      const set = Array.from(new Set([params.collectionId, ...extraCollections]));
      const res = await setRecordCollections(supabase, user.id, data.id, set);
      if (!res.ok) console.error('setRecordCollections failed (non-fatal):', res.error);
    }

    // Persist tracklist if provided (separate table, linked by record_id)
    const tracklist = parseTracklist(form);
    if (tracklist && tracklist.length > 0) {
      const tracks = tracklist.map((t) => ({ ...t, record_id: data.id }));
      const { error: tracksError } = await supabase.from('tracks').insert(tracks);
      if (tracksError) {
        console.error('Track insert failed:', tracksError);
      }
    }

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

    // If the modal sent a collections selection, sync the junction table.
    // The primary (params.collectionId) is always included, so a record
    // can never end up with zero collections via this path.
    const collectionSet = parseCollections(form, params.collectionId);
    if (collectionSet !== null) {
      const res = await setRecordCollections(supabase, user.id, recordId, collectionSet);
      if (!res.ok) {
        console.error('setRecordCollections failed (non-fatal):', res.error);
      }
    }

    // If tracklist is sent on update, replace existing tracks atomically.
    // Empty tracklist field means "leave existing tracks alone".
    const tracklist = parseTracklist(form);
    if (tracklist !== null) {
      // Verify ownership first (RLS would also block, but explicit is safer)
      const { data: ownerCheck } = await supabase
        .from('records')
        .select('id')
        .eq('id', recordId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (ownerCheck) {
        // Delete existing tracks, insert new
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
  },

  /**
   * Unlink a record from Discogs. Clears discogs_id, image_url (only if it
   * points to Discogs CDN — preserves user-uploaded covers), prices, and
   * prices_refreshed_at. The record itself stays intact.
   */
  unlinkDiscogs: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'unlinkDiscogs', error: 'Missing record id' });

    // Fetch current image_url to decide whether to clear it
    const { data: current } = await supabase
      .from('records')
      .select('image_url')
      .eq('id', recordId)
      .eq('user_id', user.id)
      .maybeSingle();

    const updates = {
      discogs_id: null,
      prices: {},
      prices_refreshed_at: null
    };
    // Only clear image if it's a Discogs image — preserve user uploads.
    if (current?.image_url && /img\.discogs\.com|discogs\.com\/images/.test(current.image_url)) {
      updates.image_url = null;
    }

    const { error: dbError } = await supabase
      .from('records')
      .update(updates)
      .eq('id', recordId)
      .eq('user_id', user.id);

    if (dbError) return fail(500, { action: 'unlinkDiscogs', error: dbError.message });
    return { action: 'unlinkDiscogs', success: true };
  },

  /**
   * Remove a record from this collection ONLY. The record stays alive in the
   * user's inventory (it must still be in at least one other collection).
   * Used by the card-level "Remove from this collection" action.
   */
  removeFromCollection: async ({ request, params, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const recordId = str(form.get('id'));
    if (!recordId) return fail(400, { action: 'removeFromCollection', error: 'Missing record id' });

    const res = await removeRecordFromCollection(
      supabase,
      user.id,
      recordId,
      params.collectionId
    );
    if (!res.ok) {
      // Distinguish the "only collection" case so the UI can offer to archive instead
      const status = res.error?.includes('only collection') ? 409 : 500;
      return fail(status, { action: 'removeFromCollection', error: res.error });
    }
    return { action: 'removeFromCollection', success: true, recordId };
  },

  /**
   * Toggle a record's public/private visibility.
   * Used by the card-level privacy toggle button.
   */
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

    // Verify ownership before allowing the update
    const { data: record, error: getErr } = await supabase
      .from('records')
      .select('id')
      .eq('id', recordId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (getErr) return fail(500, { action: 'toggleRecordPrivacy', error: getErr.message });
    if (!record) return fail(404, { action: 'toggleRecordPrivacy', error: 'Record not found' });

    // Update
    const { error: updateErr } = await supabase
      .from('records')
      .update({ is_public_record: isPublic })
      .eq('id', recordId);

    if (updateErr) {
      return fail(500, { action: 'toggleRecordPrivacy', error: updateErr.message });
    }

    return { action: 'toggleRecordPrivacy', success: true, recordId, isPublic };
  }
};
