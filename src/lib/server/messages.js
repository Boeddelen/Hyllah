/**
 * Message query helpers.
 *
 * Live schema (migration 016):
 *   messages(id, sender_id, receiver_id, body, read_at,
 *            deleted_by_sender, deleted_by_receiver, created_at)
 *
 * RLS scopes every query to rows where auth.uid() is sender or receiver.
 * These helpers add no privilege — they just shape the data.
 *
 * Security model for sending:
 *   - Only authenticated users can insert (RLS: sender_id = auth.uid())
 *   - Friendship + block checks are enforced in the page action before insert
 */

/**
 * Load the inbox for a user: one entry per conversation partner,
 * sorted by most recent message. Returns an array of:
 *   { partner: {id, username, display_name, avatar_url},
 *     latestMessage: {id, sender_id, body, created_at},
 *     unreadCount: number }
 */
export async function getInbox(supabase, userId) {
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, sender_id, receiver_id, body, created_at, read_at')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(500); // ample cap for early usage; paginate later if needed

  if (error || !messages) return [];

  // Group by conversation partner. Messages are newest-first, so the first
  // one we see for each partner is already the latest.
  const partnerMap = new Map(); // partnerId → { latestMessage, unreadCount }
  for (const msg of messages) {
    const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
    if (!partnerMap.has(partnerId)) {
      partnerMap.set(partnerId, { latestMessage: msg, unreadCount: 0 });
    }
    if (msg.receiver_id === userId && !msg.read_at) {
      partnerMap.get(partnerId).unreadCount++;
    }
  }

  if (!partnerMap.size) return [];

  const { data: partners, error: usersErr } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url')
    .in('id', [...partnerMap.keys()]);

  if (usersErr || !partners) return [];
  const partnerById = new Map(partners.map((p) => [p.id, p]));

  return [...partnerMap.entries()]
    .map(([partnerId, { latestMessage, unreadCount }]) => ({
      partner: partnerById.get(partnerId) ?? null,
      latestMessage,
      unreadCount
    }))
    .filter((c) => c.partner);
  // Already sorted newest-first because we iterated in that order.
}

/**
 * Load all messages in a conversation between two users, oldest first (chat order).
 */
export async function getConversation(supabase, userId, partnerId) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, receiver_id, body, created_at, read_at')
    .or(
      `and(sender_id.eq.${userId},receiver_id.eq.${partnerId}),` +
        `and(sender_id.eq.${partnerId},receiver_id.eq.${userId})`
    )
    .order('created_at', { ascending: true });

  if (error) return [];
  return data ?? [];
}

/**
 * Mark all messages FROM partnerId TO userId as read.
 * Called when opening a conversation thread.
 */
export async function markConversationRead(supabase, userId, partnerId) {
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('receiver_id', userId)
    .eq('sender_id', partnerId)
    .is('read_at', null);

  if (error) console.error('[messages] markConversationRead failed:', error.message);
}

/**
 * Count total unread messages for the sidebar badge.
 * Uses a head-count query so no rows are transferred.
 */
export async function countUnreadMessages(supabase, userId) {
  if (!userId) return 0;
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .is('read_at', null);

  if (error || count == null) return 0;
  return count;
}
