import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').RequestHandler} */
export const GET = async ({ url, locals: { supabase } }) => {
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/app';

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      throw redirect(303, `/${next.slice(1)}`);
    }
  }

  // Auth failed — back to login with an error indicator
  throw redirect(303, '/login?error=callback');
};
