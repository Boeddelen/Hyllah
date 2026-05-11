// Hooks: run on every request server-side.
// Creates a Supabase client tied to the request's cookies so auth state flows.

import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

/** @type {import('@sveltejs/kit').Handle} */
export const handle = async ({ event, resolve }) => {
  event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => event.cookies.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value, options }) => {
          event.cookies.set(name, value, { ...options, path: '/' });
        });
      }
    }
  });

  // safeGetSession — calls getUser() to validate the JWT, not just trust the cookie.
  // This is important: getSession() alone is forgeable, getUser() actually verifies.
  event.locals.safeGetSession = async () => {
    const {
      data: { session }
    } = await event.locals.supabase.auth.getSession();
    if (!session) return { session: null, user: null };

    const {
      data: { user },
      error
    } = await event.locals.supabase.auth.getUser();
    if (error) return { session: null, user: null };

    return { session, user };
  };

  return resolve(event, {
    filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version'
  });
};
