// ─────────────────────────────────────────────────────────────────────────
// Discogs API client.
// Loads consumer key/secret at CALL TIME using $env/dynamic/private so that
// Cloudflare Pages runtime secrets are available (static/private = build time only).
// ─────────────────────────────────────────────────────────────────────────

import { env } from '$env/dynamic/private';
import { discogsRequest } from './discogs-oauth.js';

const API_BASE = 'https://api.discogs.com';
const OAUTH_REQUEST_TOKEN = `${API_BASE}/oauth/request_token`;
const OAUTH_ACCESS_TOKEN = `${API_BASE}/oauth/access_token`;
const OAUTH_AUTHORIZE_PAGE = 'https://www.discogs.com/oauth/authorize';

/** Pull consumer credentials from runtime env — throws clearly if missing. */
function getConsumerCreds() {
  const key = env.DISCOGS_CONSUMER_KEY;
  const secret = env.DISCOGS_CONSUMER_SECRET;
  if (!key || !secret) {
    throw new Error(
      'DISCOGS_CONSUMER_KEY or DISCOGS_CONSUMER_SECRET is missing from environment. ' +
      'Add them as Runtime secrets in Cloudflare Pages → Settings → Environment variables.'
    );
  }
  return { key, secret };
}

/** Step 1 of OAuth: get a request token from Discogs. */
export async function getRequestToken(callbackUrl) {
  const { key, secret } = getConsumerCreds();
  const result = await discogsRequest(
    { method: 'POST', url: OAUTH_REQUEST_TOKEN, callback: callbackUrl, form: true },
    key,
    secret
  );
  if (!result.oauth_token || !result.oauth_token_secret) {
    throw new Error('Discogs did not return a request token');
  }
  return {
    token: result.oauth_token,
    tokenSecret: result.oauth_token_secret,
    authorizeUrl: `${OAUTH_AUTHORIZE_PAGE}?oauth_token=${result.oauth_token}`
  };
}

/** Step 3 of OAuth: exchange request token + verifier for an access token. */
export async function getAccessToken(requestToken, requestTokenSecret, verifier) {
  const { key, secret } = getConsumerCreds();
  const result = await discogsRequest(
    {
      method: 'POST',
      url: OAUTH_ACCESS_TOKEN,
      token: requestToken,
      tokenSecret: requestTokenSecret,
      verifier,
      form: true
    },
    key,
    secret
  );
  if (!result.oauth_token || !result.oauth_token_secret) {
    throw new Error('Discogs did not return an access token');
  }
  return {
    accessToken: result.oauth_token,
    accessTokenSecret: result.oauth_token_secret
  };
}

/** Fetch the connected user's Discogs identity. */
export async function getIdentity(accessToken, accessTokenSecret) {
  const { key, secret } = getConsumerCreds();
  return discogsRequest(
    { method: 'GET', url: `${API_BASE}/oauth/identity`, token: accessToken, tokenSecret: accessTokenSecret },
    key,
    secret
  );
}

/** Search Discogs releases. */
export async function searchReleases(query, accessToken, accessTokenSecret, options = {}) {
  const { key, secret } = getConsumerCreds();
  return discogsRequest(
    {
      method: 'GET',
      url: `${API_BASE}/database/search`,
      token: accessToken,
      tokenSecret: accessTokenSecret,
      queryParams: {
        q: query,
        type: options.type ?? 'release',
        per_page: String(options.perPage ?? 25)
      }
    },
    key,
    secret
  );
}

/** Get full release details including tracklist. */
export async function getRelease(releaseId, accessToken, accessTokenSecret) {
  const { key, secret } = getConsumerCreds();
  return discogsRequest(
    {
      method: 'GET',
      url: `${API_BASE}/releases/${releaseId}`,
      token: accessToken,
      tokenSecret: accessTokenSecret
    },
    key,
    secret
  );
}

/**
 * Get price suggestions for a release (per condition, in user's marketplace currency).
 * Requires user to have Discogs seller settings filled out.
 */
export async function getPriceSuggestions(releaseId, accessToken, accessTokenSecret) {
  const { key, secret } = getConsumerCreds();
  try {
    return await discogsRequest(
      {
        method: 'GET',
        url: `${API_BASE}/marketplace/price_suggestions/${releaseId}`,
        token: accessToken,
        tokenSecret: accessTokenSecret
      },
      key,
      secret
    );
  } catch (err) {
    if (err.message?.includes('seller settings')) {
      throw new Error(
        'SELLER_SETTINGS_REQUIRED: To fetch prices, fill out your Discogs seller settings at ' +
        'https://www.discogs.com/settings/seller (even if you do not sell).'
      );
    }
    throw err;
  }
}
