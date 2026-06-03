// Friendship queries + helpers.
//
// Schema (migration 015):
//   friendships(id, requester_id, addressee_id, status, created_at, updated_at)
//   status ∈ 'pending' | 'accepted' | 'declined'
//
// A friendship row is directional in storage (requester → addressee) but
// represents a symmetric relationship once accepted. There is at most one
// row per unordered pair (enforced by a unique index in the migration).
//
// Security model:
//   - RLS already restricts every query to rows where the caller is either
//     requester or addressee. The functions here add no privilege; they just
//     shape the data. Mutations still re-check ownership in the page actions.

/**
 * Resolve the friendship status between the current user and another user,
 * from the current user's point of view.
 *
 * @returns one of:
 *   'none'             — no row, or a previously declined row
 *   'friends'          — accepted
 *   'pending_sent'     — current user sent a request, awaiting the other
 *   'pending_received' — the other user sent a request, awaiting current user
 */
export async function getFriendshipStatus(supabase, myId, otherId) {
  if (!myId || !otherId || myId === otherId) return 'none';

  const { data, error } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id, status')
    .or(
      `and(requester_id.eq.${myId},addressee_id.eq.${otherId}),` +
        `and(requester_id.eq.${otherId},addressee_id.eq.${myId})`
    )
    .maybeSingle();

  if (error || !data) return 'none';

  if (data.status === 'accepted') return 'friends';
  if (data.status === 'declined') return 'none';

  // pending — direction matters
  if (data.requester_id === myId) return 'pending_sent';
  return 'pending_received';
}

/**
 * List the current user's accepted friends.
 * Two-step fetch (friendship rows, then user records) so we don't depend on
 * the exact FK constraint name for an embedded join — that naming varies and
 * a wrong guess throws at runtime.
 * Returns an array of { friendshipId, user: {id, username, display_name, avatar_url} }.
 */
export async function listFriends(supabase, userId) {
  const { data: rows, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, updated_at')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order('updated_at', { ascending: false });

  if (error || !rows || rows.length === 0) return [];

  // The friend is whichever side isn't the current user.
  const friendIdByRow = rows.map((row) => ({
    friendshipId: row.id,
    friendId: row.requester_id === userId ? row.addressee_id : row.requester_id
  }));

  const friendIds = [...new Set(friendIdByRow.map((r) => r.friendId))];
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url')
    .in('id', friendIds);

  if (usersErr || !users) return [];
  const userById = new Map(users.map((u) => [u.id, u]));

  return friendIdByRow
    .map(({ friendshipId, friendId }) => ({
      friendshipId,
      user: userById.get(friendId)
    }))
    .filter((f) => f.user);
}

/**
 * Incoming pending requests — others who want to friend the current user.
 * Two-step fetch (no FK-name dependency). Returns [{ friendshipId, user }].
 */
export async function listIncomingRequests(supabase, userId) {
  const { data: rows, error } = await supabase
    .from('friendships')
    .select('id, requester_id, created_at')
    .eq('status', 'pending')
    .eq('addressee_id', userId)
    .order('created_at', { ascending: false });

  if (error || !rows || rows.length === 0) return [];
  return hydrateRequests(supabase, rows, 'requester_id');
}

/**
 * Outgoing pending requests — people the current user has asked.
 * Two-step fetch (no FK-name dependency). Returns [{ friendshipId, user }].
 */
export async function listOutgoingRequests(supabase, userId) {
  const { data: rows, error } = await supabase
    .from('friendships')
    .select('id, addressee_id, created_at')
    .eq('status', 'pending')
    .eq('requester_id', userId)
    .order('created_at', { ascending: false });

  if (error || !rows || rows.length === 0) return [];
  return hydrateRequests(supabase, rows, 'addressee_id');
}

// Shared helper: given friendship rows and the column that holds the "other"
// user's id, fetch those users and pair them back up.
async function hydrateRequests(supabase, rows, otherIdColumn) {
  const ids = [...new Set(rows.map((r) => r[otherIdColumn]))];
  const { data: users, error } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url')
    .in('id', ids);

  if (error || !users) return [];
  const byId = new Map(users.map((u) => [u.id, u]));

  return rows
    .map((row) => ({ friendshipId: row.id, user: byId.get(row[otherIdColumn]) }))
    .filter((r) => r.user);
}

/**
 * Count incoming pending requests — for the sidebar badge.
 * Uses a head count query so no rows are transferred.
 */
export async function countPendingIncoming(supabase, userId) {
  if (!userId) return 0;
  const { count, error } = await supabase
    .from('friendships')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .eq('addressee_id', userId);

  if (error || count == null) return 0;
  return count;
}

/**
 * Check whether a block exists in EITHER direction between two users.
 * Used before allowing a friend request to be sent.
 */
export async function blockExistsBetween(supabase, aId, bId) {
  const { data, error } = await supabase
    .from('blocks')
    .select('blocker_id', { head: false })
    .or(
      `and(blocker_id.eq.${aId},blocked_id.eq.${bId}),` +
        `and(blocker_id.eq.${bId},blocked_id.eq.${aId})`
    )
    .limit(1);

  if (error) return false; // fail-open on read; the insert is still RLS-guarded
  return Array.isArray(data) && data.length > 0;
}
