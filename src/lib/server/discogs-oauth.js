// ─────────────────────────────────────────────────────────────────────────
// OAuth 1.0a signing for Discogs — edge-compatible via Web Crypto.
//
// IMPORTANT: We do NOT import env vars at the top level here.
// Cloudflare Pages injects encrypted secrets only at runtime, not build time.
// If you use $env/static/private, the keys are empty strings in production.
// Instead, callers pass the keys in explicitly, having loaded them with
// $env/dynamic/private inside their own server-side functions.
// ─────────────────────────────────────────────────────────────────────────

const USER_AGENT = 'RetroVault/0.1 +https://retrovault.no';

/** Percent-encode per RFC 3986 (stricter than encodeURIComponent). */
function pctEncode(str) {
  return encodeURIComponent(String(str))
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
}

function genNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function timestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

async function signRequest(method, baseUrl, params, consumerSecret, tokenSecret) {
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys
    .map((k) => `${pctEncode(k)}=${pctEncode(params[k])}`)
    .join('&');
  const signatureBaseString = [
    method.toUpperCase(),
    pctEncode(baseUrl),
    pctEncode(paramString)
  ].join('&');
  const signingKey = `${pctEncode(consumerSecret)}&${pctEncode(tokenSecret)}`;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(signingKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signatureBaseString));
  const sigBytes = new Uint8Array(sigBuf);
  let binary = '';
  for (let i = 0; i < sigBytes.byteLength; i++) binary += String.fromCharCode(sigBytes[i]);
  return btoa(binary);
}

/**
 * Build the Authorization header for an OAuth 1.0a request.
 * consumerKey and consumerSecret are passed explicitly — never imported top-level.
 */
export async function buildAuthHeader(opts, consumerKey, consumerSecret) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: genNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp(),
    oauth_version: '1.0'
  };
  if (opts.token) oauthParams.oauth_token = opts.token;
  if (opts.verifier) oauthParams.oauth_verifier = opts.verifier;
  if (opts.callback) oauthParams.oauth_callback = opts.callback;

  const allParams = { ...oauthParams, ...(opts.queryParams || {}) };

  const urlObj = new URL(opts.url);
  const baseUrl = `${urlObj.origin}${urlObj.pathname}`;

  const signature = await signRequest(
    opts.method,
    baseUrl,
    allParams,
    consumerSecret,
    opts.tokenSecret || ''
  );
  oauthParams.oauth_signature = signature;

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
 * consumerKey + consumerSecret loaded by caller from $env/dynamic/private.
 */
export async function discogsRequest(opts, consumerKey, consumerSecret) {
  const authHeader = await buildAuthHeader(opts, consumerKey, consumerSecret);
  const fetchUrl = opts.queryParams
    ? `${opts.url}?${new URLSearchParams(opts.queryParams).toString()}`
    : opts.url;

  const res = await fetch(fetchUrl, {
    method: opts.method,
    headers: {
      Authorization: authHeader,
      'User-Agent': USER_AGENT,
      Accept: opts.url.includes('/oauth/')
        ? 'application/x-www-form-urlencoded'
        : 'application/json'
    }
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try { detail = JSON.parse(text).message || text; } catch { /* not JSON */ }
    throw new Error(`Discogs API error ${res.status}: ${detail}`);
  }

  if (opts.url.includes('/oauth/')) {
    const params = new URLSearchParams(text);
    const result = {};
    params.forEach((v, k) => (result[k] = v));
    return result;
  }
  return JSON.parse(text);
}
