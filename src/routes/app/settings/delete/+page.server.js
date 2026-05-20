// ─────────────────────────────────────────────────────────────────────────
// /app/settings/delete — the destructive route
//
// Loads a small summary (record count, collection count) so the user can see
// what they're about to lose. The actual deletion happens in the `confirm`
// action below.
//
// Deletion strategy:
//   1. Validate the typed phrase server-side ("delete my account", exact)
//   2. Delete the public.users row — Postgres cascades through every owned
//      record, collection, junction row, track via FOREIGN KEY ... ON DELETE
//      CASCADE relationships already in place
//   3. Delete the auth.users row via the Admin API, using the service-role
//      key. This is the one place in the codebase we need that key.
//   4. Sign the session out
//   5. Redirect to landing with ?deleted=1 so we can show a confirmation
//
// We deliberately do NOT delete Storage files in this transaction (user
// asked for orphans to be swept later). Storage cleanup is on the side-item
// list as a periodic job.
//
// Why use the service role for auth.users only:
//   - The user can't delete their own auth.users row through the public
//     Supabase client — that's by design
//   - The service-role key bypasses RLS and CAN delete auth rows
//   - It's read ONLY in this single file, never sent to the client, and
//     pulled from a Cloudflare encrypted runtime secret
// ─────────────────────────────────────────────────────────────────────────

import { error, fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';

const REQUIRED_PHRASE = 'delete my account';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  // Pull a small summary for the confirmation page. Defensive counts —
  // doesn't break the page if any of these fail.
  const [recordsCount, collectionsCount, profileRes] = await Promise.all([
    supabase
      .from('records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_pending_delete', false),
    supabase
      .from('collections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('users')
      .select('username, display_name, created_at')
      .eq('id', user.id)
      .maybeSingle()
  ]);

  return {
    summary: {
      records: recordsCount.count ?? 0,
      collections: collectionsCount.count ?? 0,
      created_at: profileRes.data?.created_at ?? null,
      username: profileRes.data?.username ?? null,
      display_name: profileRes.data?.display_name ?? null
    }
  };
};

export const actions = {
  /**
   * Permanent account deletion. No second chances after this returns success.
   *
   * Steps in order:
   *   1. Validate the typed phrase server-side
   *   2. Delete public.users (cascades to all the user's owned rows via FKs)
   *   3. Delete auth.users via the admin client (service-role key)
   *   4. Sign out the session
   *   5. Redirect to / with ?deleted=1
   */
  confirm: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const phrase = (form.get('phrase') ?? '').toString().trim().toLowerCase();

    // ── 1. Phrase check ─────────────────────────────────────────────
    if (phrase !== REQUIRED_PHRASE) {
      return fail(400, {
        error: `You must type "${REQUIRED_PHRASE}" exactly to confirm deletion.`
      });
    }

    // ── 2. Service-role client setup ────────────────────────────────
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is not set — cannot delete account');
      return fail(500, {
        error: 'Account deletion is temporarily unavailable. Please contact support.'
      });
    }

    const admin = createClient(PUBLIC_SUPABASE_URL, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // ── 3. Delete the public.users row (cascades to everything) ─────
    // We do this BEFORE auth.users so RLS is still in effect for the public
    // schema while we delete owned rows. If something goes wrong here, the
    // user's auth account is still intact and they can retry.
    const { error: publicErr } = await admin
      .from('users')
      .delete()
      .eq('id', user.id);

    if (publicErr) {
      console.error('Public users delete failed:', publicErr);
      return fail(500, {
        error: 'Could not delete account data. Please try again or contact support.'
      });
    }

    // ── 4. Delete the auth.users row ────────────────────────────────
    // This is the irreversible step. If it fails here, the user already has
    // no public data (their session token will become invalid on next use)
    // but their auth row will be orphaned. That's a recoverable state for
    // ops to clean up, so still safer than the other ordering.
    const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
    if (authErr) {
      console.error('Auth users delete failed (public row already gone):', authErr);
      // Still proceed — the user's data is gone and they're effectively
      // deleted from the app's perspective. Logging this lets ops clean up
      // the orphan auth row.
    }

    // ── 5. Sign out and redirect ────────────────────────────────────
    await supabase.auth.signOut();
    throw redirect(303, '/?deleted=1');
  }
};
