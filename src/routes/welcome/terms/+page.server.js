import { fail, redirect } from '@sveltejs/kit';
import { CURRENT_TOS_VERSION } from '$lib/server/legal.js';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  // If they've already accepted the current version, skip ahead.
  const { data: profile, error: loadError } = await supabase
    .from('users')
    .select('display_name, tos_accepted_at, tos_version')
    .eq('id', user.id)
    .maybeSingle();

  if (loadError) {
    console.error('[welcome/terms] load query failed for user', user.id, ':', loadError.message);
  }

  if (profile?.tos_accepted_at && profile?.tos_version === CURRENT_TOS_VERSION) {
    throw redirect(303, profile.display_name ? '/app/all' : '/welcome/profile');
  }

  // Is this an existing user being re-gated (vs. a brand-new signup)?
  // We use this to choose friendly copy on the page itself.
  const isReturningUser = Boolean(profile?.display_name);

  return { isReturningUser, currentVersion: CURRENT_TOS_VERSION };
};

/** @type {import('./$types').Actions} */
export const actions = {
  accept: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    if (form.get('agreed') !== 'on') {
      return fail(400, { error: 'You must agree to the Terms and Privacy Policy to continue.' });
    }

    // A new signup's public.users row is created by a DB trigger on
    // auth.users insert (see schema.sql: on_auth_user_created). That trigger
    // is transactional and should have already run by the time a session
    // exists — but as a safety net against any timing edge case, retry once
    // after a short pause before treating a zero-row match as a real failure.
    // (There's no INSERT policy for regular users on this table — only the
    // trigger can create the row — so a client-side upsert isn't an option;
    // a brief retry is the safe fallback.)
    async function tryAccept() {
      return supabase
        .from('users')
        .update({
          tos_accepted_at: new Date().toISOString(),
          tos_version: CURRENT_TOS_VERSION
        })
        .eq('id', user.id)
        .select('id, display_name')
        .maybeSingle();
    }

    let { data: updated, error } = await tryAccept();

    if (!error && !updated) {
      console.warn('[welcome/terms] first update matched no row for user', user.id, '— retrying once');
      await new Promise((resolve) => setTimeout(resolve, 500));
      ({ data: updated, error } = await tryAccept());
    }

    if (error) {
      console.error('[welcome/terms] update failed:', error.message);
      return fail(500, { error: 'Something went wrong. Please try again.' });
    }
    if (!updated) {
      console.error('[welcome/terms] update matched no row for user (after retry):', user.id);
      return fail(500, { error: 'Could not save your acceptance — please try again.' });
    }

    throw redirect(303, updated.display_name ? '/app/all' : '/welcome/profile');
  }
};
