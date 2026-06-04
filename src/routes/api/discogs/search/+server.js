import { json } from '@sveltejs/kit';
import { searchReleases } from '$lib/server/discogs.js';
import { getUserDiscogsTokens } from '$lib/server/discogs-user.js';

// Search Discogs releases for the typeahead in the record modal.
//
// Returns 200 with a structured body in ALL cases (including failures) so the
// client always receives the reason — mobile browsers frequently don't expose
// the body of a non-2xx fetch to JS, which is why a 502 looked like "nothing
// happened" on the phone. Shape:
//   { results: [...] }                              — success
//   { results: [], reason: 'not_signed_in' }
//   { results: [], reason: 'too_short' }
//   { results: [], reason: 'not_connected' }        — no Discogs tokens stored
//   { results: [], reason: 'discogs_error', error } — Discogs rejected the call
//
// Logging goes to Cloudflare Functions logs, tagged [discogs-search].

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ url, locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) {
    console.warn('[discogs-search] no session');
    return json({ results: [], reason: 'not_signed_in' }, { status: 200 });
  }

  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return json({ results: [], reason: 'too_short' }, { status: 200 });
  }

  // getUserDiscogsTokens throws error(403, 'NOT_CONNECTED') when the user has
  // no stored tokens, and error(500, ...) on a DB failure. We catch both here
  // and translate to a structured 200 body. We deliberately do NOT change that
  // function's contract because other endpoints (autofill, prices) rely on the
  // throw behavior.
  let tokens;
  try {
    tokens = await getUserDiscogsTokens(supabase, user.id);
  } catch (err) {
    // SvelteKit's error() puts the status on err.status and text on err.body.message
    const status = err?.status;
    const body = err?.body?.message ?? err?.message ?? '';
    if (status === 403 || body.includes('NOT_CONNECTED')) {
      console.warn(`[discogs-search] user ${user.id} not connected to Discogs`);
      return json({ results: [], reason: 'not_connected' }, { status: 200 });
    }
    console.error('[discogs-search] token lookup failed:', body);
    return json(
      { results: [], reason: 'token_lookup_failed', error: body || 'Token lookup failed' },
      { status: 200 }
    );
  }

  // Defensive: if the contract ever changes to return falsy instead of throwing.
  if (!tokens || !tokens.accessToken || !tokens.accessTokenSecret) {
    console.warn(`[discogs-search] user ${user.id} has no usable tokens`);
    return json({ results: [], reason: 'not_connected' }, { status: 200 });
  }

  try {
    const data = await searchReleases(q, tokens.accessToken, tokens.accessTokenSecret, { perPage: 20 });
    const count = Array.isArray(data?.results) ? data.results.length : 0;
    console.log(`[discogs-search] q="${q}" -> ${count} results`);
    return json(data, { status: 200 });
  } catch (err) {
    // Surface the real Discogs failure both to the logs and the client.
    const msg = err?.body?.message ?? err?.message ?? String(err);
    console.error(`[discogs-search] q="${q}" FAILED:`, msg, err?.stack ?? '');
    return json({ results: [], reason: 'discogs_error', error: msg }, { status: 200 });
  }
};
