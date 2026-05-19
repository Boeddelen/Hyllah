// ─────────────────────────────────────────────────────────────────────────
// Currency exchange rates — fetches daily rates from the ECB and caches
// them in public.exchange_rates. All rates are EUR-relative; conversion
// between any two currencies is done by going through EUR.
//
// Why ECB?
//   - Free, no API key required
//   - Updated once per day on banking days, well-known canonical source
//   - Includes the major currencies we whitelist
//
// Why cache in Postgres rather than per-request?
//   - Rates only move ~once per day, so per-request fetching is wasteful
//   - Cached server-side, every user benefits from one fetch
//   - Resilient to ECB downtime (we keep yesterday's rates as fallback)
// ─────────────────────────────────────────────────────────────────────────

// Re-export the client-safe constants for server code convenience.
// The canonical source of truth is $lib/currency.js so both client and
// server stay in sync.
export { SUPPORTED_CURRENCIES, CURRENCY_LABELS } from '$lib/currency.js';

const ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

/**
 * Fetch today's rates from the ECB. Returns an object keyed by currency
 * code with the EUR-relative rate. EUR itself is always 1.
 *
 * Throws on network error or malformed response.
 * @returns {Promise<Record<string, number>>}
 */
async function fetchEcbRates() {
  const res = await fetch(ECB_URL, {
    headers: { 'User-Agent': 'RetroVault/1.0 (retrovault.no)' }
  });
  if (!res.ok) throw new Error(`ECB returned ${res.status}`);
  const xml = await res.text();

  // The ECB XML is tiny and predictable — we parse with regex rather than
  // pulling in a full XML library. Sample line:
  //   <Cube currency='USD' rate='1.0721'/>
  /** @type {Record<string, number>} */
  const rates = { EUR: 1 };
  const re = /<Cube currency=['"]([A-Z]{3})['"] rate=['"]([\d.]+)['"]/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const code = m[1];
    const rate = parseFloat(m[2]);
    if (Number.isFinite(rate) && rate > 0) rates[code] = rate;
  }

  if (Object.keys(rates).length < 5) {
    throw new Error('ECB response parsed too few rates — refusing to cache');
  }
  return rates;
}

/**
 * Load the freshest cached rates from the DB, fetching from the ECB if today's
 * snapshot isn't there yet. Returns the rates object plus the date they're from.
 *
 * Strategy:
 *   1. Look for a row with fetched_on = today (UTC) — use it if found
 *   2. Otherwise, try to fetch from the ECB and store
 *   3. If the fetch fails AND we have any older rates, fall back to the
 *      most recent ones (stale-but-usable). Only the very first ever fetch
 *      can hard-fail.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ rates: Record<string, number>, fetched_on: string }>}
 */
export async function getCachedRates(supabase) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD in UTC

  // Try today's row first
  const { data: todays } = await supabase
    .from('exchange_rates')
    .select('fetched_on, rates')
    .eq('fetched_on', today)
    .maybeSingle();
  if (todays) return { rates: todays.rates, fetched_on: todays.fetched_on };

  // Fall through to fetch + cache
  try {
    const rates = await fetchEcbRates();
    // upsert in case two requests race
    const { error } = await supabase
      .from('exchange_rates')
      .upsert(
        { fetched_on: today, base: 'EUR', rates },
        { onConflict: 'fetched_on' }
      );
    if (error) {
      // Cache write failed — still return the live rates so the user sees something
      console.error('exchange_rates upsert failed:', error);
    }
    return { rates, fetched_on: today };
  } catch (err) {
    console.warn('ECB fetch failed, falling back to most recent cached rates:', err);
    const { data: latest } = await supabase
      .from('exchange_rates')
      .select('fetched_on, rates')
      .order('fetched_on', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) return { rates: latest.rates, fetched_on: latest.fetched_on };
    // Truly nothing — return identity rates (everything as EUR) so the
    // UI doesn't crash. Currency conversion silently becomes no-op.
    return { rates: { EUR: 1 }, fetched_on: today };
  }
}

/**
 * Convert an amount from one currency to another using EUR-relative rates.
 * Returns the amount unchanged if either currency is unknown (defensive
 * fallback — never crashes the UI over a missing rate).
 *
 * @param {number} amount
 * @param {string} from   ISO code, defaults to 'EUR' if falsy
 * @param {string} to     ISO code, defaults to 'EUR' if falsy
 * @param {Record<string, number>} rates  EUR-relative
 */
export function convertCurrency(amount, from, to, rates) {
  if (!Number.isFinite(amount)) return amount;
  const f = from || 'EUR';
  const t = to || 'EUR';
  if (f === t) return amount;
  const fr = rates?.[f];
  const tr = rates?.[t];
  if (!fr || !tr) return amount;
  // Step through EUR: amount in EUR = amount / fr; then in target = * tr
  return (amount / fr) * tr;
}
