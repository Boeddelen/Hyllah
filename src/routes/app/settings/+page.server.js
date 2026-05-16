/** @type {import('./$types').PageServerLoad} */
export const load = async ({ url }) => {
  // Pass any URL params back so we can show success/error messages from the redirect
  return {
    discogsStatus: url.searchParams.get('discogs'),
    discogsDetail: url.searchParams.get('detail')
  };
};
