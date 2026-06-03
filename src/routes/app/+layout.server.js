import { redirect } from '@sveltejs/kit';
import { loadCollections, loadCollectionCounts, loadUserProfile } from '$lib/server/db';
import { getCachedRates } from '$lib/server/rates.js';
import { countPendingIncoming } from '$lib/server/friendships.js';

/** @type {import('./$types').LayoutServerLoad} */
export const load = async ({ locals: { safeGetSession, supabase } }) => {
  const { session, user } = await safeGetSession();
  if (!session || !user) throw redirect(303, '/login');

  // Profile, collections, counts, and pending friend requests in parallel.
  const [profile, collections, counts, pendingRequestCount] = await Promise.all([
    loadUserProfile(supabase, user.id),
    loadCollections(supabase, user.id),
    loadCollectionCounts(supabase, user.id),
    countPendingIncoming(supabase, user.id)
  ]);

  // Rates: only fetch if the user's display currency is non-EUR. Saves a
  // DB round-trip + (occasionally) an ECB call for users who don't need
  // currency conversion. EUR users always get identity rates.
  const displayCurrency = profile?.display_currency ?? 'EUR';
  let rates = { EUR: 1 };
  if (displayCurrency !== 'EUR') {
    try {
      const cached = await getCachedRates(supabase);
      rates = cached.rates;
    } catch (err) {
      console.error('Could not load exchange rates (using EUR identity):', err);
    }
  }

  return {
    user,
    profile,
    collections,
    counts,
    rates,
    displayCurrency,
    pendingRequestCount
  };
};
