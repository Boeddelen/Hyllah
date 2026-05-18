import { error, fail, redirect, json } from '@sveltejs/kit';
import { loadCollection, loadRecords } from '$lib/server/db';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, parent, locals: { supabase } }) => {
  const { user, profile } = await parent();
  const collection = await loadCollection(supabase, user.id, params.collectionId);
  if (!collection) throw error(404, 'Collection not found');

  // Only fetch tracks when the user's preference needs them (tracklist or both view).
  // Avoids the extra join when the user has the default 'details' view.
  const cardBackView = profile?.card_back_view ?? 'details';
  const withTracks = cardBackView === 'tracklist' || cardBackView === 'both';
  const records = await loadRecords(supabase, user.id, params.collectionId, { withTracks });

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

  // ── Discogs autofill fields ─────────────────────────
  const discogs_id = str(form.get('discogs_id'));
  if (discogs_id && (!/^\d+$/.test(discogs_id) || discogs_id.length > 50)) {
    return { error: 'Invalid Discogs ID' };
  }

  const image_url = str(form.get('image_url'));
  if (image_url) {
    // Only accept https URLs from known image hosts (Discogs CDN, or our own Supabase storage)
    // This blocks malicious URLs that could be planted via injected form fields.
    if (!/^https:\/\//.test(image_url) || image_url.length > 2000) {
      return { error: 'Invalid image URL' };
    }
  }

  // prices is a JSON string passed from the modal — parse safely
  let prices = null;
  let prices_refreshed_at = null;
  const pricesRaw = str(form.get('prices'));
  if (pricesRaw) {
    try {
      const parsed = JSON.parse(pricesRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        prices = parsed;
        prices_refreshed_at = new Date().toISOString();
      }
    } catch {
      // Silently ignore malformed prices — keep existing data
    }
  }

  /** @type {Record<string, unknown>} */
  const record = {
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
  };

  // Only set Discogs fields when explicitly provided; otherwise existing
  // values on edit are preserved (we don't want to clobber a linked record
  // just because the form didn't send the field).
  if (discogs_id !== null) record.discogs_id = discogs_id;
  if (image_url !== null) record.image_url = image_url;
  if (prices !== null) {
    record.prices = prices;
    record.prices_refreshed_at = prices_refreshed_at;
  }

  return { record };
}

/**
 * Parse tracklist from form.
 * Form sends a single 'tracklist' field as JSON string (matches how the modal
 * stores it internally). Returns array of validated track rows, or null if absent.
 */
function parseTracklist(form) {
  const raw = (form.get('tracklist') ?? '').toString();
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((t) => t && typeof t === 'object' && typeof t.title === 'string' && t.title.trim())
      .map((t, idx) => ({
        position: t.position ? String(t.position).slice(0, 12) : null,
        title: String(t.title).trim().slice(0, 300),
        duration: t.duration ? String(t.duration).slice(0, 12) : null,
        sort_order: idx
      }))
      .slice(0, 100); // sanity cap
  } catch {
    return null;
  }
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

    // Persist tracklist if provided (separate table, linked by record_id)
    const tracklist = parseTracklist(form);
    if (tracklist && tracklist.length > 0) {
      const tracks = tracklist.map((t) => ({ ...t, record_id: data.id }));
      const { error: tracksError } = await supabase.from('tracks').insert(tracks);
      if (tracksError) {
        // Non-fatal: record was created, tracks failed to save.
        // Surface a warning but don't roll back the record.
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
  }
};
