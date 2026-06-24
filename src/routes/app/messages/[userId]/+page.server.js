import { fail, redirect } from '@sveltejs/kit';
import { getConversation, markConversationRead } from '$lib/server/messages.js';
import { getFriendshipStatus, blockExistsBetween } from '$lib/server/friendships.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CHARS = 2000;

/** @type {import('./$types').PageServerLoad} */
export const load = async ({ params, locals: { safeGetSession, supabase } }) => {
  const { user } = await safeGetSession();
  if (!user) throw redirect(303, '/login');

  const partnerId = params.userId;
  if (!UUID_RE.test(partnerId)) throw redirect(303, '/app/messages');
  if (partnerId === user.id) throw redirect(303, '/app/messages');

  // Load the partner's public profile (username, display name, avatar).
  const { data: partner, error: partnerErr } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, is_public')
    .eq('id', partnerId)
    .maybeSingle();

  if (partnerErr || !partner) throw redirect(303, '/app/messages');

  // Check friendship and block status (can view history; can only send to friends).
  const [friendshipStatus, isBlocked] = await Promise.all([
    getFriendshipStatus(supabase, user.id, partnerId),
    blockExistsBetween(supabase, user.id, partnerId)
  ]);
  const isFriend = friendshipStatus === 'friends' && !isBlocked;

  // Load the conversation and mark incoming messages as read in parallel.
  const [messages] = await Promise.all([
    getConversation(supabase, user.id, partnerId),
    // Side-effect: mark all their messages to me as read.
    markConversationRead(supabase, user.id, partnerId)
  ]);

  return { partner, messages, isFriend, currentUserId: user.id };
};

/** @type {import('./$types').Actions} */
export const actions = {
  send: async ({ params, request, locals: { safeGetSession, supabase } }) => {
    const { user } = await safeGetSession();
    if (!user) throw redirect(303, '/login');

    const partnerId = params.userId;
    if (!UUID_RE.test(partnerId) || partnerId === user.id) {
      return fail(400, { action: 'send', error: 'Invalid recipient.' });
    }

    // Friends-only: re-check on every send (friendship may have changed since page load).
    const [status, blocked] = await Promise.all([
      getFriendshipStatus(supabase, user.id, partnerId),
      blockExistsBetween(supabase, user.id, partnerId)
    ]);
    if (status !== 'friends' || blocked) {
      return fail(403, { action: 'send', error: 'You can only message friends.' });
    }

    const form = await request.formData();
    const body = (form.get('content') ?? '').toString().trim();
    if (!body) return fail(400, { action: 'send', error: 'Message cannot be empty.' });
    if (body.length > MAX_CHARS) {
      return fail(400, { action: 'send', error: `Message too long (max ${MAX_CHARS} characters).` });
    }

    const { error } = await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: partnerId,
      body,
      deleted_by_sender: false,
      deleted_by_receiver: false
    });

    if (error) {
      console.error('[messages] send failed:', error.message);
      return fail(500, { action: 'send', error: 'Could not send message. Please try again.' });
    }

    return { action: 'send', success: true };
  }
};
