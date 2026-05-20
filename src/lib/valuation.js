// ─────────────────────────────────────────────────────────────────────────
// Valuation — the single place that decides what a record is "worth".
//
// Used by:
//   - Stats page (totals, top 10, breakdowns)
//   - Collection page (header totals, card display)
//   - Anywhere else we need a record's current value
//
// All amounts here are in EUR (the canonical storage currency). Display-
// currency conversion happens in the caller using $lib/currency.js.
// ─────────────────────────────────────────────────────────────────────────

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

/**
 * Where a record's value comes from.
 *   'override' — user set value_override explicitly
 *   'discogs'  — fell back to Discogs's condition-matched price
 *   'none'     — no value available (returns 0)
 *
 * @typedef {'override'|'discogs'|'none'} ValueSource
 */

/**
 * Compute a record's current value in EUR + tell us where the number came from.
 *
 * Decision rules (in priority order):
 *   1. If `value_override` is set, use it. Source: 'override'.
 *   2. Else if `useDiscogsPrices` is enabled AND the record has a Discogs
 *      price matching its condition, use that. Source: 'discogs'.
 *   3. Else 0. Source: 'none'.
 *
 * `value_override` always wins, regardless of the toggle — that's the user's
 * explicit input and we should respect it.
 *
 * @param {{
 *   value_override?: number|string|null,
 *   prices?: object|null,
 *   condition?: string|null
 * }} record
 * @param {{ useDiscogsPrices?: boolean }} [opts]
 * @returns {{ value: number, source: ValueSource }}
 */
export function currentValueOf(record, opts = {}) {
  const useDiscogs = opts.useDiscogsPrices !== false; // default true if undefined

  // 1. Explicit user override always wins
  if (record?.value_override != null && record.value_override !== '') {
    const v = Number(record.value_override);
    if (Number.isFinite(v)) return { value: v, source: 'override' };
  }

  // 2. Discogs fallback (only if the user has it enabled)
  if (useDiscogs && record?.prices && record?.condition) {
    const key = CONDITION_TO_DISCOGS_KEY[record.condition];
    if (key) {
      const p = record.prices[key];
      if (p != null) {
        const v = Number(typeof p === 'object' ? p.value : p);
        if (Number.isFinite(v)) return { value: v, source: 'discogs' };
      }
    }
  }

  // 3. No value
  return { value: 0, source: 'none' };
}

/** Just the value, when you don't care about the source. */
export function valueOf(record, opts) {
  return currentValueOf(record, opts).value;
}

/** Sum of values across a list of records. */
export function sumValues(records, opts) {
  if (!Array.isArray(records)) return 0;
  return records.reduce((sum, r) => sum + valueOf(r, opts), 0);
}

/** Sum of purchase prices. Independent of valuation toggles. */
export function sumPaid(records) {
  if (!Array.isArray(records)) return 0;
  return records.reduce((sum, r) => {
    const p = r?.purchase_price;
    if (p == null || p === '') return sum;
    const n = Number(p);
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);
}

/** Human-readable label for the value source. Used on the card back. */
export function valueSourceLabel(source) {
  switch (source) {
    case 'override': return 'your value';
    case 'discogs':  return 'from Discogs';
    default:         return '';
  }
}
