// GET /api/tags — returns the user's existing tags, sorted by frequency descending.
// Used by the tag autocomplete in the record modal.

import { error, json } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  // Postgres array unnest done client-side after fetching tag arrays.
  // For a typical user collection (hundreds to low thousands of records) this is
  // very fast. If collections grow much larger we'd want a server-side aggregation.
  const { data, error: dbError } = await supabase
    .from('records')
    .select('tags')
    .eq('user_id', user.id)
    .eq('is_pending_delete', false);

  if (dbError) throw error(500, dbError.message);

  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const row of data ?? []) {
    if (!Array.isArray(row.tags)) continue;
    for (const t of row.tags) {
      if (typeof t !== 'string') continue;
      const tag = t.trim();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));

  return json({ tags: sorted });
};
