// Runs on every page to provide auth state.

import { createBrowserClient, createServerClient, isBrowser } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/** @type {import('./$types').LayoutLoad} */
export const load = async ({ data, depends, fetch }) => {
  depends('supabase:auth');

  const supabase = isBrowser()
    ? createBrowserClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
        global: { fetch }
      })
    : createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
        global: { fetch },
        cookies: { getAll: () => data.cookies }
      });

  const {
    data: { session }
  } = await supabase.auth.getSession();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return { session, user, supabase };
};
