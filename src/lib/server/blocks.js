/**
 * Block & report helpers.
 *
 * Schema (migration 017):
 *   blocks(blocker_id, blocked_id, created_at)
 *     - Primary key (blocker_id, blocked_id) prevents duplicates
 *   abuse_reports(id, reporter_id, reported_id, reason, created_at)
 *     - Immutable log; reason is a free-form string we compose from category + detail
 *
 * Security model:
 *   - Blocking is mutual-invisibility: each direction is enforced at every
 *     touchpoint that exposes user data (profile, inbox, friends list).
 *   - Blocking auto-removes any existing friendship between the two users.
 *   - Reports never reveal to the reported user that they were reported.
 *   - Self-block / self-report are rejected.
 */

const MAX_REASON_LENGTH = 500;
const VALID_REASONS = new Set([
  'harassment',
  'spam',
  'impersonation',
  'inappropriate',
  'underage',
  'other'
]);

/**
 * Block another user. Auto-removes any existing friendship in either direction.
 * Idempotent: re-blocking the same user is a no-op.
 *
 * Returns { ok: true } on success or { ok: false, error } on failure.
 */
export async function blockUser(supabase, blockerId, blockedId) {
  if (!blockerId || !blockedId) return { ok: false, error: 'Missing user id' };
  if (blockerId === blockedId)  return { ok: false, error: "You can't block yourself" };

  // Atomic-ish: insert the block first; only delete the friendship if the
  // block actually landed. ON CONFLICT DO NOTHING handles re-blocking cleanly.
  const { error: blockErr } = await supabase
    .from('blocks')
    .upsert(
      { blocker_id: blockerId, blocked_id: blockedId },
      { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }
    );
  if (blockErr) return { ok: false, error: blockErr.message };

  // Best-effort friendship cleanup. If this fails, the block still stands —
  // the social UI filters by block before friendship anyway. We log but don't
  // bubble up the failure to the user.
  const { error: friendErr } = await supabase
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${blockerId},addressee_id.eq.${blockedId}),` +
        `and(requester_id.eq.${blockedId},addressee_id.eq.${blockerId})`
    );
  if (friendErr) console.error('[blocks] friendship cleanup failed:', friendErr.message);

  return { ok: true };
}

/** Unblock a user — removes the one-way block row. */
export async function unblockUser(supabase, blockerId, blockedId) {
  if (!blockerId || !blockedId) return { ok: false, error: 'Missing user id' };

  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * List all user IDs the current user has blocked, or that have blocked them.
 * Returned as a Set for O(1) "is this user blocked?" lookups during filtering.
 *
 * This is the building block for hiding blocked users from inbox, friends
 * list, etc. — much cheaper than calling blockExistsBetween per row.
 */
export async function listBlockedIds(supabase, userId) {
  if (!userId) return new Set();

  const { data, error } = await supabase
    .from('blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

  if (error || !data) return new Set();

  const blockedIds = new Set();
  for (const row of data) {
    blockedIds.add(row.blocker_id === userId ? row.blocked_id : row.blocker_id);
  }
  return blockedIds;
}

/**
 * List the users the current user has actively blocked (one direction only),
 * with their basic profile data. Used to populate the block-list management UI.
 */
export async function listBlockedUsers(supabase, userId) {
  if (!userId) return [];

  const { data: blocks, error: blocksErr } = await supabase
    .from('blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false });

  if (blocksErr || !blocks || blocks.length === 0) return [];

  const blockedIds = blocks.map((b) => b.blocked_id);
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url')
    .in('id', blockedIds);

  if (usersErr || !users) return [];
  const userById = new Map(users.map((u) => [u.id, u]));

  return blocks
    .map((b) => ({ user: userById.get(b.blocked_id), blockedAt: b.created_at }))
    .filter((b) => b.user);
}

/**
 * Submit an abuse report.
 *
 * `category` must be one of VALID_REASONS. `detail` is optional free-form
 * text; we concatenate it into the stored `reason` so the schema stays as-is.
 *
 * Rate limiting note: anyone can submit reports about anyone — this is fine
 * for a small app and we'll review them manually. If abuse-of-reporting
 * becomes a problem later, add a per-reporter-per-target uniqueness or
 * per-day cap. Not bothering yet.
 */
export async function reportUser(supabase, reporterId, reportedId, category, detail = '') {
  if (!reporterId || !reportedId) return { ok: false, error: 'Missing user id' };
  if (reporterId === reportedId)  return { ok: false, error: "You can't report yourself" };
  if (!VALID_REASONS.has(category)) return { ok: false, error: 'Invalid reason' };

  const cleanedDetail = (detail ?? '').toString().trim().slice(0, MAX_REASON_LENGTH);
  const reason = cleanedDetail ? `${category}: ${cleanedDetail}` : category;

  const { error } = await supabase.from('abuse_reports').insert({
    reporter_id: reporterId,
    reported_id: reportedId,
    reason
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export { VALID_REASONS };
