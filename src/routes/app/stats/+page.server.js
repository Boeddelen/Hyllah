import { redirect } from '@sveltejs/kit';

const CONDITION_TO_DISCOGS_KEY = {
  M: 'Mint (M)',
  NM: 'Near Mint (NM or M-)',
  VG_PLUS: 'Very Good Plus (VG+)',
  VG: 'Very Good (VG)',
  G_PLUS: 'Good Plus (G+)',
  G: 'Good (G)',
  F: 'Fair (F)',
  P: 'Poor (P)'
};

/** Best-known current value for a record: value_override > matching Discogs price > 0 */
function currentValueOf(record) {
  if (record.value_override != null) return Number(record.value_override) || 0;
  if (record.prices && record.condition) {
    const key = CONDITION_TO_DISCOGS_KEY[record.condition];
    const p = key ? record.prices[key] : null;
    if (p != null) {
      const v = typeof p === 'object' ? p.value : p;
      return Number(v) || 0;
    }
  }
  return 0;
}

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  // Pull all active (non-archived, non-pending-delete) records across all collections.
  // For larger collections we may eventually want stored aggregates, but for the
  // typical user this scales fine.
  const { data: records, error } = await supabase
    .from('records')
    .select(
      'id, collection_id, artist, title, format, condition, year, ' +
      'purchase_price, value_override, prices, tags, created_at'
    )
    .eq('user_id', user.id)
    .eq('is_archived', false)
    .eq('is_pending_delete', false);

  if (error) throw error;
  const list = records ?? [];

  // ── Aggregations ──────────────────────────────────────────
  const totalCount = list.length;
  let totalPaid = 0;
  let totalValue = 0;

  /** @type {Record<string, number>} */
  const byFormat = {};
  /** @type {Record<string, number>} */
  const byCondition = {};
  /** @type {Record<string, number>} */
  const byDecade = {};
  /** @type {Record<string, number>} */
  const tagCounts = {};

  // Top 5 most valuable records
  /** @type {{id:string, artist:string, title:string, value:number}[]} */
  const topValuable = [];
  // Records added per month for the recent-activity sparkline (last 12 months)
  /** @type {Record<string, number>} */
  const monthly = {};

  for (const r of list) {
    const paid = r.purchase_price ? Number(r.purchase_price) : 0;
    const value = currentValueOf(r);
    totalPaid += paid;
    totalValue += value;

    if (r.format) byFormat[r.format] = (byFormat[r.format] ?? 0) + 1;
    if (r.condition) byCondition[r.condition] = (byCondition[r.condition] ?? 0) + 1;

    if (r.year) {
      // Decade bucket: "1991" → "1990s"
      const yearNum = parseInt(r.year, 10);
      if (Number.isFinite(yearNum) && yearNum > 1900 && yearNum < 2100) {
        const decade = `${Math.floor(yearNum / 10) * 10}s`;
        byDecade[decade] = (byDecade[decade] ?? 0) + 1;
      }
    }

    if (Array.isArray(r.tags)) {
      for (const t of r.tags) {
        if (typeof t !== 'string') continue;
        const tag = t.trim();
        if (tag) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }
    }

    topValuable.push({
      id: r.id,
      collection_id: r.collection_id,
      artist: r.artist,
      title: r.title,
      value
    });

    // Monthly activity
    if (r.created_at) {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthly[key] = (monthly[key] ?? 0) + 1;
    }
  }

  // Sort topValuable, take top 10
  topValuable.sort((a, b) => b.value - a.value);
  const top10 = topValuable.filter((r) => r.value > 0).slice(0, 10);

  // Top 10 tags
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  // Build last-12-months activity series
  const now = new Date();
  /** @type {{label: string, count: number}[]} */
  const activity = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    activity.push({
      label: d.toLocaleString(undefined, { month: 'short' }),
      count: monthly[key] ?? 0
    });
  }

  return {
    stats: {
      totalCount,
      totalPaid,
      totalValue,
      byFormat,
      byCondition,
      byDecade,
      topTags,
      top10,
      activity
    }
  };
};
