import { redirect } from '@sveltejs/kit';

/**
 * Validate the post-login `next` target so it can only ever be an internal
 * path on our own origin. Without this, a crafted link like
 *   /auth/callback?code=...&next=//evil.com
 * would redirect the freshly-authenticated user off-site (open redirect →
 * phishing). We resolve `next` against a throwaway origin: anything that
 * escapes it (absolute URLs, protocol-relative `//`, backslash tricks the
 * URL parser normalises to `//`) lands on a different origin and is rejected
 * back to the default.
 *
 * @param {string | null} nextParam
 * @returns {string} a same-origin path beginning with '/'
 */
function safeNextPath(nextParam) {
  const fallback = '/app/all';
  if (typeof nextParam !== 'string' || nextParam.length === 0) return fallback;
  try {
    const dummyOrigin = 'https://x.invalid';
    const resolved = new URL(nextParam, dummyOrigin);
    if (resolved.origin !== dummyOrigin) return fallback;
    const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
    return path.startsWith('/') ? path : fallback;
  } catch {
    return fallback;
  }
}

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ url, locals: { supabase } }) => {
  const code = url.searchParams.get('code');
  const next = safeNextPath(url.searchParams.get('next'));

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      throw redirect(303, next);
    }
  }

  // Auth failed — back to login with an error indicator
  throw redirect(303, '/login?error=callback');
};
