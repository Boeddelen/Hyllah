// GET /api/username-available?u=somename
//
// Checks whether a username is available for the current user to claim.
// "Available" means:
//   - Passes the format constraint (3-30 chars, lowercase a-z 0-9 _ -)
//   - Is not in the reserved-words list (admin, api, settings, etc.)
//   - Is either unused, OR already belongs to the current user
//
// Used by the Settings → Profile form for the debounced live check.

import { error, json } from '@sveltejs/kit';

// Anything that could collide with current or future routes / common
// "admin-y" handles. The list is deliberately conservative — better to
// reject too many than to give away "admin" or "api".
//
// Lowercase only (since usernames are lowercase per the format constraint).
const RESERVED_USERNAMES = new Set([
  // Routes (current + reserved for future)
  'admin', 'administrator', 'api', 'app', 'auth', 'login', 'logout', 'signup',
  'signout', 'register', 'settings', 'account', 'profile', 'u', 'user', 'users',
  'help', 'support', 'contact', 'about', 'pricing', 'home', 'feed', 'dashboard',
  'stats', 'collection', 'collections', 'records', 'record', 'discogs',
  'callback', 'connect', 'disconnect', 'all', 'archive', 'archived', 'tags',
  // Legal / operational
  'terms', 'privacy', 'gdpr', 'legal', 'cookies', 'security', 'abuse',
  'dmca', 'tos', 'eula', 'imprint',
  // Generic
  'www', 'mail', 'email', 'webmail', 'ftp', 'ssh', 'root', 'system',
  'public', 'private', 'official', 'staff', 'team', 'mod', 'moderator',
  'bot', 'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  // Brand
  'retrovault', 'retro-vault', 'retro_vault', 'vault', 'anthropic',
  // Inflammatory / impersonation magnets — keep these blocked
  'null', 'undefined', 'anonymous', 'me', 'you'
]);

const USERNAME_RE = /^[a-z0-9_-]{3,30}$/;

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ url, locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  const raw = (url.searchParams.get('u') ?? '').trim().toLowerCase();
  if (!raw) {
    return json({ available: false, reason: 'empty' });
  }
  if (!USERNAME_RE.test(raw)) {
    return json({ available: false, reason: 'format' });
  }
  if (RESERVED_USERNAMES.has(raw)) {
    return json({ available: false, reason: 'reserved' });
  }

  // Look up via case-insensitive comparison. We index on lower(username),
  // so this is cheap.
  const { data, error: dbErr } = await supabase
    .from('users')
    .select('id')
    .ilike('username', raw)
    .maybeSingle();
  if (dbErr) throw error(500, dbErr.message);

  // Available if either nobody has it, or it's the current user's own
  // username (returning available=true here keeps the "Save" button live
  // when the user hasn't changed their handle).
  const available = !data || data.id === user.id;
  return json({ available, reason: available ? null : 'taken' });
};
