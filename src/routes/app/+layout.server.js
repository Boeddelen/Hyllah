import { redirect } from '@sveltejs/kit';
import { loadCollections, loadCollectionCounts, loadUserProfile } from '$lib/server/db';
import { getCachedRates } from '$lib/server/rates.js';
import { countPendingIncoming } from '$lib/server/friendships.js';

/** @type {import('./$types').LayoutServerLoad} */
export const load = async ({ locals: { safeGetSession, supabase } }) => {
  const { session, user } = await safeGetSession();
  if (!session || !user) throw redirect(303, '/login');

  // Profile, collections, counts, and pending friend requests in parallel.
  const [profile, collections, counts, pendingRequestCount, archivedRes] = await Promise.all([
    loadUserProfile(supabase, user.id),
    loadCollections(supabase, user.id),
    loadCollectionCounts(supabase, user.id),
    countPendingIncoming(supabase, user.id),
    // Distinct archived records (a per-collection sum would double-count
    // records that live in more than one collection).
    supabase
      .from('records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_archived', true)
      .eq('is_pending_delete', false)
  ]);
  const archivedCount = archivedRes?.count ?? 0;

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
    pendingRequestCount,
    archivedCount,
    // The user's account-saved theme (null parts mean "not chosen yet").
    serverTheme: {
      themeId: profile?.app_theme ?? null,
      mode: profile?.app_mode ?? null
    }
  };
};
