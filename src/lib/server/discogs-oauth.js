// ─────────────────────────────────────────────────────────────────────────
// OAuth 1.0a signing for Discogs.
//
// Discogs uses HMAC-SHA1 signatures on every request. We can't use Node's
// `crypto` module because Cloudflare Workers runs on V8, not Node. Instead
// we use Web Crypto, which is available in both browsers and edge runtimes.
//
// Spec: https://oauth.net/core/1.0a/
// Discogs docs: https://www.discogs.com/developers/#page:authentication
// ─────────────────────────────────────────────────────────────────────────

import { DISCOGS_CONSUMER_KEY, DISCOGS_CONSUMER_SECRET } from '$env/static/private';

const USER_AGENT = 'RetroVault/0.1 +https://retrovault.no';

/**
 * Percent-encode per RFC 3986. JavaScript's encodeURIComponent is close but
 * doesn't encode !*'() — OAuth 1.0a requires those to be encoded.
 */
function pctEncode(str) {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

/** Generate a cryptographically random nonce (32 hex chars) */
function genNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Current Unix timestamp in seconds */
function timestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

/**
 * Generate the HMAC-SHA1 signature for a request.
 *
 * @param {string} method - HTTP method (GET, POST)
 * @param {string} baseUrl - URL with NO query string
 * @param {Record<string,string>} params - All OAuth + query params combined
 * @param {string} consumerSecret
 * @param {string} tokenSecret - Empty string if no token yet
 */
async function signRequest(method, baseUrl, params, consumerSecret, tokenSecret) {
  // 1. Sort parameter keys
  const sortedKeys = Object.keys(params).sort();
  // 2. Build the parameter string
  const paramString = sortedKeys
    .map((k) => `${pctEncode(k)}=${pctEncode(params[k])}`)
    .join('&');
  // 3. Build the signature base string
  const signatureBaseString = [
    method.toUpperCase(),
    pctEncode(baseUrl),
    pctEncode(paramString)
  ].join('&');
  // 4. Build the signing key
  const signingKey = `${pctEncode(consumerSecret)}&${pctEncode(tokenSecret)}`;
  // 5. HMAC-SHA1
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signatureBaseString));
  // 6. Base64 encode the result
  const sigBytes = new Uint8Array(sigBuf);
  let binary = '';
  for (let i = 0; i < sigBytes.byteLength; i++) binary += String.fromCharCode(sigBytes[i]);
  return btoa(binary);
}

/**
 * Build the Authorization header for an OAuth 1.0a request.
 *
 * @param {object} opts
 * @param {string} opts.method - HTTP method
 * @param {string} opts.url - Full URL (we strip query string for signature)
 * @param {Record<string,string>} [opts.queryParams] - Query params (also signed)
 * @param {string} [opts.token] - User's access (or request) token
 * @param {string} [opts.tokenSecret] - Matching secret
 * @param {string} [opts.verifier] - oauth_verifier (callback step only)
 * @param {string} [opts.callback] - oauth_callback URL (request token step only)
 */
export async function buildAuthHeader(opts) {
  const oauthParams = {
    oauth_consumer_key: DISCOGS_CONSUMER_KEY,
    oauth_nonce: genNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp(),
    oauth_version: '1.0'
  };
  if (opts.token) oauthParams.oauth_token = opts.token;
  if (opts.verifier) oauthParams.oauth_verifier = opts.verifier;
  if (opts.callback) oauthParams.oauth_callback = opts.callback;

  // For signing: combine OAuth params with query params
  const allParams = { ...oauthParams, ...(opts.queryParams || {}) };

  // Strip query string from URL for signing
  const urlObj = new URL(opts.url);
  const baseUrl = `${urlObj.origin}${urlObj.pathname}`;

  const signature = await signRequest(
    opts.method,
    baseUrl,
    allParams,
    DISCOGS_CONSUMER_SECRET,
    opts.tokenSecret || ''
  );
  oauthParams.oauth_signature = signature;

  // Build the OAuth header — only OAuth params go here, not query params
  const headerString =
    'OAuth ' +
    Object.keys(oauthParams)
      .sort()
      .map((k) => `${pctEncode(k)}="${pctEncode(oauthParams[k])}"`)
      .join(', ');
  return headerString;
}

/**
 * Make a signed Discogs API request.
 * Returns the parsed response (JSON for /api endpoints, form-encoded for OAuth steps).
 */
export async function discogsRequest(opts) {
  const authHeader = await buildAuthHeader(opts);
  const fetchUrl = opts.queryParams
    ? `${opts.url}?${new URLSearchParams(opts.queryParams).toString()}`
    : opts.url;

  const res = await fetch(fetchUrl, {
    method: opts.method,
    headers: {
      Authorization: authHeader,
      'User-Agent': USER_AGENT,
      Accept: opts.url.includes('/oauth/') ? 'application/x-www-form-urlencoded' : 'application/json'
    }
  });

  const text = await res.text();
  if (!res.ok) {
    // Try to surface a useful error
    let detail = text;
    try {
      detail = JSON.parse(text).message || text;
    } catch {
      /* not JSON, that's fine */
    }
    throw new Error(`Discogs API error ${res.status}: ${detail}`);
  }

  // OAuth endpoints return form-encoded responses; API endpoints return JSON
  if (opts.url.includes('/oauth/')) {
    const params = new URLSearchParams(text);
    /** @type {Record<string,string>} */
    const result = {};
    params.forEach((v, k) => (result[k] = v));
    return result;
  }
  return JSON.parse(text);
}
