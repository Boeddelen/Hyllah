// Layout loader for the public profile section (/u/[username] and everything
// nested under it). It resolves only the profile owner's chosen *public* theme
// so that the theme is applied consistently across the profile, its collections,
// its records, and the all-records page — instead of each page having to
// remember to do it itself.
//
// Intentionally lightweight (two columns) and tolerant: if the user doesn't
// exist or isn't public, it returns the app defaults. The individual page
// loaders remain responsible for 404ing.

/** @type {import('./$types').LayoutServerLoad} */
export const load = async ({ params, locals: { supabase } }) => {
  const { username } = params;

  let publicTheme = 'listening-room';
  let publicMode = 'dark';

  if (username) {
    const { data: owner } = await supabase
      .from('users')
      .select('public_theme, public_mode')
      .ilike('username', username)
      .eq('is_public', true)
      .maybeSingle();

    if (owner) {
      publicTheme = owner.public_theme ?? 'listening-room';
      publicMode = owner.public_mode === 'light' ? 'light' : 'dark';
    }
  }

  return { publicTheme, publicMode };
};
