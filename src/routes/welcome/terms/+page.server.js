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

    const { error } = await supabase
      .from('users')
      .update({
        tos_accepted_at: new Date().toISOString(),
        tos_version: CURRENT_TOS_VERSION
      })
      .eq('id', user.id);

    if (error) {
      console.error('[welcome/terms] update failed:', error.message);
      return fail(500, { error: 'Something went wrong. Please try again.' });
    }

    // Re-check profile to decide where to send them next.
    const { data: profile } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();

    throw redirect(303, profile?.display_name ? '/app/all' : '/welcome/profile');
  }
};
