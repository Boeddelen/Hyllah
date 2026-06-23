import { redirect } from '@sveltejs/kit';

// /app is not a real destination. The layout already guards auth; this just
// ensures anyone who lands here (old bookmark, post-login redirect, etc.)
// goes straight to their vault.
/** @type {import('./$types').PageServerLoad} */
export const load = async () => {
  throw redirect(303, '/app/all');
};
