// ─────────────────────────────────────────────────────────────────────────
// Discogs API client.
// Each function takes a user's OAuth tokens and calls Discogs on their behalf.
// All requests are signed via the helper in discogs-oauth.js.
// ─────────────────────────────────────────────────────────────────────────

import { discogsRequest } from './discogs-oauth.js';

const API_BASE = 'https://api.discogs.com';
const OAUTH_REQUEST_TOKEN = `${API_BASE}/oauth/request_token`;
const OAUTH_ACCESS_TOKEN = `${API_BASE}/oauth/access_token`;
const OAUTH_AUTHORIZE_PAGE = 'https://www.discogs.com/oauth/authorize';

/**
 * Step 1 of OAuth: get a request token from Discogs.
 * @param {string} callbackUrl - Where Discogs should send the user after auth
 */
export async function getRequestToken(callbackUrl) {
  const result = await discogsRequest({
    method: 'POST',
    url: OAUTH_REQUEST_TOKEN,
    callback: callbackUrl
  });
  if (!result.oauth_token || !result.oauth_token_secret) {
    throw new Error('Discogs did not return a request token');
  }
  return {
    token: result.oauth_token,
    tokenSecret: result.oauth_token_secret,
    authorizeUrl: `${OAUTH_AUTHORIZE_PAGE}?oauth_token=${result.oauth_token}`
  };
}

/**
 * Step 3 of OAuth: exchange request token + verifier for an access token.
 */
export async function getAccessToken(requestToken, requestTokenSecret, verifier) {
  const result = await discogsRequest({
    method: 'POST',
    url: OAUTH_ACCESS_TOKEN,
    token: requestToken,
    tokenSecret: requestTokenSecret,
    verifier
  });
  if (!result.oauth_token || !result.oauth_token_secret) {
    throw new Error('Discogs did not return an access token');
  }
  return {
    accessToken: result.oauth_token,
    accessTokenSecret: result.oauth_token_secret
  };
}

/**
 * Get the connected user's Discogs identity.
 * Used right after OAuth completes, to know who we're connected as.
 */
export async function getIdentity(accessToken, accessTokenSecret) {
  return discogsRequest({
    method: 'GET',
    url: `${API_BASE}/oauth/identity`,
    token: accessToken,
    tokenSecret: accessTokenSecret
  });
}

/**
 * Search Discogs releases.
 * @param {string} query - Free-text query (artist, title, label, etc.)
 * @param {string} accessToken
 * @param {string} accessTokenSecret
 * @param {object} [options]
 * @param {string} [options.type] - 'release' | 'master' | 'artist' | 'label'
 * @param {number} [options.perPage] - 1–100, default 25
 */
export async function searchReleases(query, accessToken, accessTokenSecret, options = {}) {
  return discogsRequest({
    method: 'GET',
    url: `${API_BASE}/database/search`,
    token: accessToken,
    tokenSecret: accessTokenSecret,
    queryParams: {
      q: query,
      type: options.type ?? 'release',
      per_page: String(options.perPage ?? 25)
    }
  });
}

/**
 * Get the full details of a release, including tracklist.
 */
export async function getRelease(releaseId, accessToken, accessTokenSecret) {
  return discogsRequest({
    method: 'GET',
    url: `${API_BASE}/releases/${releaseId}`,
    token: accessToken,
    tokenSecret: accessTokenSecret
  });
}

/**
 * Get price suggestions for a release.
 * Returns per-condition prices in the user's marketplace currency.
 *
 * Note: requires the user to have filled out their Discogs seller settings.
 * If they haven't, this returns a 401 with "You must fill out your seller
 * settings first." We surface that as a helpful error.
 */
export async function getPriceSuggestions(releaseId, accessToken, accessTokenSecret) {
  try {
    return await discogsRequest({
      method: 'GET',
      url: `${API_BASE}/marketplace/price_suggestions/${releaseId}`,
      token: accessToken,
      tokenSecret: accessTokenSecret
    });
  } catch (err) {
    if (err.message?.includes('seller settings')) {
      throw new Error(
        'SELLER_SETTINGS_REQUIRED:To fetch prices, fill out your Discogs seller settings at https://www.discogs.com/settings/seller (even if you do not sell).'
      );
    }
    throw err;
  }
}
