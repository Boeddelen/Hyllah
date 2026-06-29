import { fail, redirect } from '@sveltejs/kit';

const USERNAME_RE = /^[a-z0-9_-]{3,30}$/;

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  // Must have accepted ToS to be here.
  const { data: profile } = await supabase
    .from('users')
    .select('display_name, username, tos_accepted_at')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.tos_accepted_at) throw redirect(303, '/welcome/terms');
  // If they already have a display name, skip ahead.
  if (profile.display_name) throw redirect(303, '/app/all');

  return { username: profile?.username ?? '' };
};

/** @type {import('./$types').Actions} */
export const actions = {
  save: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const displayName = String(form.get('display_name') ?? '').trim();
    const usernameInput = String(form.get('username') ?? '').trim().toLowerCase();

    if (!displayName) {
      return fail(400, {
        error: 'Please enter a display name.',
        displayName,
        usernameInput
      });
    }
    if (displayName.length > 60) {
      return fail(400, {
        error: 'Display name must be 60 characters or fewer.',
        displayName,
        usernameInput
      });
    }

    // Username is optional during onboarding (only required to enable public
    // profile later). Validate it only if provided.
    let usernameToSave = null;
    if (usernameInput) {
      if (!USERNAME_RE.test(usernameInput)) {
        return fail(400, {
          error: 'Handle must be 3–30 characters: lowercase letters, numbers, dashes or underscores.',
          displayName,
          usernameInput
        });
      }
      // Check uniqueness — case-insensitive (constraint enforces lowercase).
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('username', usernameInput)
        .neq('id', user.id)
        .maybeSingle();
      if (existing) {
        return fail(409, {
          error: 'That handle is already taken — try another.',
          displayName,
          usernameInput
        });
      }
      usernameToSave = usernameInput;
    }

    const update = { display_name: displayName };
    if (usernameToSave) update.username = usernameToSave;

    const { error } = await supabase.from('users').update(update).eq('id', user.id);
    if (error) {
      console.error('[welcome/profile] save failed:', error.message);
      return fail(500, {
        error: 'Something went wrong saving your profile. Please try again.',
        displayName,
        usernameInput
      });
    }

    // After onboarding: check whether they need to create a first collection,
    // otherwise straight to their vault.
    const { data: collections } = await supabase
      .from('collections')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (!collections || collections.length === 0) {
      throw redirect(303, '/app/setup');
    }
    throw redirect(303, '/app/all');
  }
};
