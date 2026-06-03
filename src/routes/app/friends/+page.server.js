import { redirect, fail } from '@sveltejs/kit';
import {
  listFriends,
  listIncomingRequests,
  listOutgoingRequests
} from '$lib/server/friendships.js';

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  const [friends, incoming, outgoing] = await Promise.all([
    listFriends(supabase, user.id),
    listIncomingRequests(supabase, user.id),
    listOutgoingRequests(supabase, user.id)
  ]);

  return { friends, incoming, outgoing };
};

// Helper: load a friendship row and verify the current user is part of it.
// Returns the row or null. Every mutation uses this so a user can never act
// on a friendship they aren't a participant in (defense in depth on top of RLS).
async function loadOwnedFriendship(supabase, friendshipId, userId) {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .eq('id', friendshipId)
    .maybeSingle();

  if (error || !data) return null;
  if (data.requester_id !== userId && data.addressee_id !== userId) return null;
  return data;
}

/** @type {import('./$types').Actions} */
export const actions = {
  // Accept an incoming request. Only the ADDRESSEE may accept.
  accept: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const id = form.get('friendshipId')?.toString();
    if (!id) return fail(400, { action: 'accept', error: 'Missing request id.' });

    const row = await loadOwnedFriendship(supabase, id, user.id);
    if (!row) return fail(404, { action: 'accept', error: 'Request not found.' });
    if (row.addressee_id !== user.id || row.status !== 'pending') {
      return fail(403, { action: 'accept', error: 'You can only accept requests sent to you.' });
    }

    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[friends] accept failed:', error.message);
      return fail(500, { action: 'accept', error: 'Could not accept request.' });
    }
    return { success: true, action: 'accept' };
  },

  // Decline an incoming request. Only the ADDRESSEE may decline.
  // We delete the row rather than keep a 'declined' tombstone, so the pair
  // can freely re-request later. (The unique index would otherwise block it.)
  decline: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const id = form.get('friendshipId')?.toString();
    if (!id) return fail(400, { action: 'decline', error: 'Missing request id.' });

    const row = await loadOwnedFriendship(supabase, id, user.id);
    if (!row) return fail(404, { action: 'decline', error: 'Request not found.' });
    if (row.addressee_id !== user.id || row.status !== 'pending') {
      return fail(403, { action: 'decline', error: 'You can only decline requests sent to you.' });
    }

    const { error } = await supabase.from('friendships').delete().eq('id', id);
    if (error) {
      console.error('[friends] decline failed:', error.message);
      return fail(500, { action: 'decline', error: 'Could not decline request.' });
    }
    return { success: true, action: 'decline' };
  },

  // Cancel an outgoing request. Only the REQUESTER may cancel.
  cancel: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const id = form.get('friendshipId')?.toString();
    if (!id) return fail(400, { action: 'cancel', error: 'Missing request id.' });

    const row = await loadOwnedFriendship(supabase, id, user.id);
    if (!row) return fail(404, { action: 'cancel', error: 'Request not found.' });
    if (row.requester_id !== user.id || row.status !== 'pending') {
      return fail(403, { action: 'cancel', error: 'You can only cancel requests you sent.' });
    }

    const { error } = await supabase.from('friendships').delete().eq('id', id);
    if (error) {
      console.error('[friends] cancel failed:', error.message);
      return fail(500, { action: 'cancel', error: 'Could not cancel request.' });
    }
    return { success: true, action: 'cancel' };
  },

  // Remove an existing friend. Either participant may unfriend.
  unfriend: async ({ request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const form = await request.formData();
    const id = form.get('friendshipId')?.toString();
    if (!id) return fail(400, { action: 'unfriend', error: 'Missing id.' });

    const row = await loadOwnedFriendship(supabase, id, user.id);
    if (!row) return fail(404, { action: 'unfriend', error: 'Friendship not found.' });
    if (row.status !== 'accepted') {
      return fail(403, { action: 'unfriend', error: 'Not an active friendship.' });
    }

    const { error } = await supabase.from('friendships').delete().eq('id', id);
    if (error) {
      console.error('[friends] unfriend failed:', error.message);
      return fail(500, { action: 'unfriend', error: 'Could not remove friend.' });
    }
    return { success: true, action: 'unfriend' };
  }
};
