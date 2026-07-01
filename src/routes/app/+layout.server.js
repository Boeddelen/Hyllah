import { redirect } from '@sveltejs/kit';
import { loadCollections, loadCollectionCounts, loadUserProfile } from '$lib/server/db';
import { getCachedRates } from '$lib/server/rates.js';
import { countPendingIncoming } from '$lib/server/friendships.js';
import { CURRENT_TOS_VERSION } from '$lib/server/legal.js';

/** @type {import('./$types').LayoutServerLoad} */
export const load = async ({ url, locals: { safeGetSession, supabase } }) => {
  const { session, user } = await safeGetSession();
  if (!session || !user) throw redirect(303, '/login');

  // Sign-out endpoint must always be reachable without gating —
  // a user who refuses ToS still needs to be able to leave.
  const isSignout = url.pathname === '/app/signout';

  // Profile, collections, counts, and pending friend requests in parallel.
  // Collections are fetched here (rather than after the gate) so the step-3
  // onboarding check below can reuse this result instead of querying twice.
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

  // Onboarding gate. Every step re-checks on every load (not just once right
  // after the previous step saves), so an interrupted flow — browser closed,
  // cookies cleared, network hiccup — always resumes at the correct step
  // instead of silently skipping ahead.
  if (!isSignout) {
    // Step 1 — must accept current ToS first.
    const tosOk =
      profile?.tos_accepted_at &&
      profile?.tos_version === CURRENT_TOS_VERSION;
    if (!tosOk && url.pathname !== '/welcome/terms') {
      throw redirect(303, '/welcome/terms');
    }

    // Step 2 — must have a display name.
    if (tosOk && !profile?.display_name && url.pathname !== '/welcome/profile') {
      throw redirect(303, '/welcome/profile');
    }

    // Step 3 — must have at least one collection. Reuses the `collections`
    // array already fetched above — no extra query.
    if (
      tosOk &&
      profile?.display_name &&
      collections.length === 0 &&
      url.pathname !== '/app/setup'
    ) {
      throw redirect(303, '/app/setup');
    }
  }

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
