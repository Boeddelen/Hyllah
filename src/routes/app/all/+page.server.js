import { redirect } from '@sveltejs/kit';
import {
  loadRecords,
  loadCollections,
  loadAllRecordCollections
} from '$lib/server/db';

/** Parse a comma-separated URL param into a clean string array. */
function arrParam(url, key) {
  const raw = url.searchParams.get(key);
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const VALID_SORTS = [
  'recent', 'oldest', 'artist', 'title',
  'year-desc', 'year-asc', 'value-desc', 'value-asc'
];

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

  // Load ALL records (collectionId = null), collections, and junction table
  const [records, allCollections, recordCollections] = await Promise.all([
    loadRecords(supabase, user.id, null, {
      withTracks,
      query,
      formats,
      conditions,
      tags,
      sort
    }),
    loadCollections(supabase, user.id),
    loadAllRecordCollections(supabase, user.id)
  ]);

  // Build a map: recordId → [collection names] for display
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
    filter: { query, formats, conditions, tags, sort }
  };
};
