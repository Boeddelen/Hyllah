import { fail, redirect } from '@sveltejs/kit';
import { CURRENT_TOS_VERSION } from '$lib/server/legal.js';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  // If they've already accepted the current version, skip ahead.
  const { data: profile } = await supabase
    .from('users')
    .select('display_name, tos_accepted_at, tos_version')
    .eq('id', user.id)
    .maybeSingle();

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

    // .select().maybeSingle() after the update lets us confirm a row was
    // actually changed. Supabase returns no error for an update that matches
    // zero rows (e.g. an RLS policy silently blocking it) — checking for the
    // returned row turns that into a visible error instead of a silent no-op
    // that would otherwise bounce the user in a confusing loop between
    // /welcome/terms and /welcome/profile.
    const { data: updated, error } = await supabase
      .from('users')
      .update({
        tos_accepted_at: new Date().toISOString(),
        tos_version: CURRENT_TOS_VERSION
      })
      .eq('id', user.id)
      .select('id, display_name')
      .maybeSingle();

    if (error) {
      console.error('[welcome/terms] update failed:', error.message);
      return fail(500, { error: 'Something went wrong. Please try again.' });
    }
    if (!updated) {
      console.error('[welcome/terms] update matched no row for user', user.id);
      return fail(500, { error: 'Could not save your acceptance — please try again.' });
    }

    throw redirect(303, updated.display_name ? '/app/all' : '/welcome/profile');
  }
};
