import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').Actions} */
export const actions = {
  default: async ({ locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const { error } = await supabase
      .from('users')
      .update({
        discogs_username: null,
        discogs_oauth_token: null,
        discogs_oauth_token_secret: null,
        discogs_connected_at: null
      })
      .eq('id', user.id);

    if (error) {
      console.error('Discogs disconnect failed:', error);
    }

    throw redirect(303, '/app/settings?discogs=disconnected');
  }
};

/** @type {import('./$types').PageServerLoad} */
export const load = async () => {
  throw redirect(303, '/app/settings');
};
