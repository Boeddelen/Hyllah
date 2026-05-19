// ─────────────────────────────────────────────────────────────────────────
// Currency formatting helpers — used in components for display.
//
// We store all amounts internally in EUR (matching what Discogs returns and
// how purchase_price was historically entered). The user's display_currency
// preference triggers conversion at render time via convertCurrency() in
// $lib/server/rates.js. By the time amounts reach a component they've
// already been converted; this module just renders the final number.
// ─────────────────────────────────────────────────────────────────────────

// Whitelist of supported currencies. MUST match the CHECK constraint on
// users.display_currency in migration 007 and the list in $lib/server/rates.js.
export const SUPPORTED_CURRENCIES = [
  'EUR', 'USD', 'GBP', 'NOK', 'SEK', 'DKK', 'CHF', 'JPY', 'CAD', 'AUD'
];

/** Pretty labels for the dropdown. */
export const CURRENCY_LABELS = {
  EUR: 'Euro (€)',
  USD: 'US Dollar ($)',
  GBP: 'British Pound (£)',
  NOK: 'Norwegian Krone (kr)',
  SEK: 'Swedish Krona (kr)',
  DKK: 'Danish Krone (kr)',
  CHF: 'Swiss Franc (Fr)',
  JPY: 'Japanese Yen (¥)',
  CAD: 'Canadian Dollar (C$)',
  AUD: 'Australian Dollar (A$)'
};

const SYMBOLS = {
  EUR: '€', USD: '$', GBP: '£', NOK: 'kr', SEK: 'kr', DKK: 'kr',
  CHF: 'Fr', JPY: '¥', CAD: 'C$', AUD: 'A$'
};

/** Currencies whose symbols sit AFTER the number ("123 kr"). */
const SUFFIXED = new Set(['NOK', 'SEK', 'DKK']);

/** Currencies that conventionally show no decimal places. */
const ZERO_DECIMAL = new Set(['JPY']);

/**
 * Format a number for display in the user's currency.
 *
 *   formatCurrency(12.5, 'EUR')   → "€12.50"
 *   formatCurrency(120, 'NOK')    → "120,00 kr"
 *   formatCurrency(0, 'EUR')      → "€0"
 *   formatCurrency(null, 'EUR')   → ""
 *
 * @param {number|null|undefined} amount
 * @param {string} currency  ISO 4217 code
 * @param {object} [opts]
 * @param {boolean} [opts.compact]  Drop trailing ".00" for round numbers
 */
export function formatCurrency(amount, currency = 'EUR', opts = {}) {
  if (amount == null || !Number.isFinite(Number(amount))) return '';
  const n = Number(amount);
  const code = currency || 'EUR';
  const symbol = SYMBOLS[code] ?? code;
  const decimals = ZERO_DECIMAL.has(code) ? 0 : 2;

  // Compact rendering: skip the decimals when they'd be ".00"
  const showDecimals = !(opts.compact && Math.abs(n - Math.round(n)) < 0.005);
  const formatted = showDecimals && !ZERO_DECIMAL.has(code)
    ? n.toFixed(decimals)
    : Math.round(n).toLocaleString();

  if (SUFFIXED.has(code)) {
    return `${formatted} ${symbol}`;
  }
  return `${symbol}${formatted}`;
}

/** Symbol-only version, for inline use ("paid in €"). */
export function currencySymbol(currency = 'EUR') {
  return SYMBOLS[currency] ?? currency;
}

/** Whether the symbol comes after the number for this currency. */
export function isSuffixedCurrency(currency = 'EUR') {
  return SUFFIXED.has(currency);
}
