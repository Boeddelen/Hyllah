// Shared record-form parsing and validation.
//
// These helpers translate the RecordModal's submitted form into a validated
// record row (and its related tracklist / collection-membership selections).
// They live here — rather than inside a single route — because the same modal
// saves from multiple pages (a collection view and the all-records view), and
// each of those pages exposes an `update`/`create` form action that needs the
// identical parsing. One source of truth avoids the two copies drifting apart.
//
// Server-only module: it does no I/O itself; callers pass the parsed result to
// Supabase. Validation here is defensive — a malformed value means a tampered
// or buggy client, not normal use, and the DB constraints are the backstop.

const VALID_FORMATS = ['vinyl', 'cd', 'cassette', 'reel_to_reel', 'eight_track', 'minidisc', 'digital'];
const VALID_CONDITIONS = ['M', 'NM', 'VG_PLUS', 'VG', 'G_PLUS', 'G', 'F', 'P'];

/** Trimmed string, or null when empty. */
function str(v) {
  const s = (v ?? '').toString().trim();
  return s ? s : null;
}

/** Parse a number, tolerating comma decimals; null when empty/invalid. */
function num(v) {
  const s = (v ?? '').toString().trim().replace(',', '.');
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Split a comma/newline tag string into a clean, capped list. */
function parseTags(v) {
  const s = (v ?? '').toString();
  return s
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 30);
}

/**
 * Build a validated record row from the modal's form.
 *
 * @param {FormData} form
 * @param {string} userId
 * @param {string|null} collectionId  The page's "current" collection, or null
 *   when saving from a context without one (e.g. the all-records view). It is
 *   stored on the legacy `collection_id` column; collection *membership* is
 *   managed separately via `parseCollections` + `setRecordCollections`.
 * @returns {{ record: Record<string, unknown> } | { error: string }}
 */
export function buildRecordFromForm(form, userId, collectionId) {
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

  // MusicBrainz release id. Validate the UUID shape server-side; a malformed
  // value means a tampered/buggy client, not normal use. The DB CHECK on
  // records.mbid is the backstop behind this.
  const mbid = str(form.get('mbid'));
  if (mbid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mbid)) {
    return { error: 'Invalid MusicBrainz ID' };
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
  if (mbid !== null) record.mbid = mbid;
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
export function parseTracklist(form) {
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
 * Parse the modal's collections multi-select.
 *
 * The form sends a 'collections' field as a comma-separated list of collection
 * IDs the user has selected. We validate the UUID shape; the caller then
 * verifies ownership (via setRecordCollections) against the user's actual
 * collections.
 *
 * Returns an array of collection IDs, or null if the field is absent.
 * When a primary collection is supplied (the page's current collection), it is
 * always unioned in so a record can't be dropped from it via this path. When
 * no primary applies (e.g. the all-records view), pass null and the selection
 * stands on its own.
 *
 * @param {FormData} form
 * @param {string|null} primaryCollectionId
 */
export function parseCollections(form, primaryCollectionId = null) {
  const raw = (form.get('collections') ?? '').toString();
  if (!raw.trim()) return null;
  const ids = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  // De-duplicate, and include the primary collection when there is one.
  // filter(Boolean) drops a null/empty primary (the no-current-collection case).
  return Array.from(new Set([primaryCollectionId, ...ids].filter(Boolean)));
}
