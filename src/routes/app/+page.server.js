import { redirect } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ parent }) => {
  const { collections } = await parent();

  // New user with no collections — onboard them
  if (collections.length === 0) {
    throw redirect(303, '/app/setup');
  }

  // Otherwise jump to the first collection
  throw redirect(303, `/app/c/${collections[0].id}`);
};
