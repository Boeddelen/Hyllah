import { json, error } from '@sveltejs/kit';
import { VALID_THEMES } from '$lib/theme.js';

const VALID_MODES = new Set(['dark', 'light']);

/**
 * Persist the signed-in user's app theme and/or mode to their account, so it
 * follows them to any browser after login. Accepts only known theme IDs and
 * modes; anything unrecognized is rejected rather than stored.
 *
 * @type {import('./$types').RequestHandler}
 */
export const POST = async ({ request, locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw error(401, 'Not signed in');

  let body;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid request body');
  }

  const update = {};

  if (typeof body?.themeId === 'string') {
    if (!VALID_THEMES.has(body.themeId)) throw error(400, 'Unknown theme');
    update.app_theme = body.themeId;
  }
  if (typeof body?.mode === 'string') {
    if (!VALID_MODES.has(body.mode)) throw error(400, 'Unknown mode');
    update.app_mode = body.mode;
  }

  if (Object.keys(update).length === 0) {
    throw error(400, 'Nothing to update');
  }

  // Own row only; RLS enforces this as a backstop.
  const { error: dbError } = await supabase.from('users').update(update).eq('id', user.id);
  if (dbError) throw error(500, 'Could not save theme');

  return json({ ok: true });
};
