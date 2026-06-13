<script>
  import { enhance } from '$app/forms';

  let { data } = $props();

  const friends  = $derived(data.friends ?? []);
  const incoming = $derived(data.incoming ?? []);
  const outgoing = $derived(data.outgoing ?? []);

  // Track which row is mid-action so we can disable its buttons.
  let busyId = $state(null);

  function submitFriendship() {
    return async ({ update }) => {
      await update();
      busyId = null;
    };
  }

  function displayName(u) {
    return u?.display_name || u?.username || 'Unknown';
  }
</script>

<svelte:head>
  <title>Friends · Hyllah</title>
</svelte:head>

<div class="friends-page">
  <header class="page-header">
    <div class="eyebrow">Your network</div>
    <h1>Friends</h1>
  </header>

  <!-- ── Incoming requests ──────────────────────────────── -->
  {#if incoming.length > 0}
    <section class="section">
      <h2 class="section-title">
        Requests
        <span class="section-count">{incoming.length}</span>
      </h2>
      <div class="people-list">
        {#each incoming as item (item.friendshipId)}
          <div class="person-row">
            <a href="/u/{item.user.username}" class="person-link">
              {#if item.user.avatar_url}
                <img src={item.user.avatar_url} alt="" class="avatar" />
              {:else}
                <div class="avatar-placeholder">{displayName(item.user).charAt(0).toUpperCase()}</div>
              {/if}
              <div class="person-meta">
                <div class="person-name">{displayName(item.user)}</div>
                <div class="person-username">@{item.user.username}</div>
              </div>
            </a>
            <div class="row-actions">
              <form
                method="POST"
                action="?/accept"
                use:enhance={() => { busyId = item.friendshipId; return submitFriendship(); }}
              >
                <input type="hidden" name="friendshipId" value={item.friendshipId} />
                <button type="submit" class="btn primary sm" disabled={busyId === item.friendshipId}>
                  Accept
                </button>
              </form>
              <form
                method="POST"
                action="?/decline"
                use:enhance={() => { busyId = item.friendshipId; return submitFriendship(); }}
              >
                <input type="hidden" name="friendshipId" value={item.friendshipId} />
                <button type="submit" class="btn ghost sm" disabled={busyId === item.friendshipId}>
                  Decline
                </button>
              </form>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- ── Outgoing pending ───────────────────────────────── -->
  {#if outgoing.length > 0}
    <section class="section">
      <h2 class="section-title">
        Pending
        <span class="section-count">{outgoing.length}</span>
      </h2>
      <div class="people-list">
        {#each outgoing as item (item.friendshipId)}
          <div class="person-row">
            <a href="/u/{item.user.username}" class="person-link">
              {#if item.user.avatar_url}
                <img src={item.user.avatar_url} alt="" class="avatar" />
              {:else}
                <div class="avatar-placeholder">{displayName(item.user).charAt(0).toUpperCase()}</div>
              {/if}
              <div class="person-meta">
                <div class="person-name">{displayName(item.user)}</div>
                <div class="person-username">@{item.user.username}</div>
              </div>
            </a>
            <div class="row-actions">
              <span class="pending-label">Requested</span>
              <form
                method="POST"
                action="?/cancel"
                use:enhance={() => { busyId = item.friendshipId; return submitFriendship(); }}
              >
                <input type="hidden" name="friendshipId" value={item.friendshipId} />
                <button type="submit" class="btn ghost sm" disabled={busyId === item.friendshipId}>
                  Cancel
                </button>
              </form>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- ── Friends ────────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">
      All friends
      <span class="section-count">{friends.length}</span>
    </h2>

    {#if friends.length === 0}
      <div class="empty">
        <p>No friends yet.</p>
        <p class="empty-hint">
          Find someone's public profile and send them a request to get started.
        </p>
      </div>
    {:else}
      <div class="people-list">
        {#each friends as item (item.friendshipId)}
          <div class="person-row">
            <a href="/u/{item.user.username}" class="person-link">
              {#if item.user.avatar_url}
                <img src={item.user.avatar_url} alt="" class="avatar" />
              {:else}
                <div class="avatar-placeholder">{displayName(item.user).charAt(0).toUpperCase()}</div>
              {/if}
              <div class="person-meta">
                <div class="person-name">{displayName(item.user)}</div>
                <div class="person-username">@{item.user.username}</div>
              </div>
            </a>
            <div class="row-actions">
              <form
                method="POST"
                action="?/unfriend"
                use:enhance={() => { busyId = item.friendshipId; return submitFriendship(); }}
              >
                <input type="hidden" name="friendshipId" value={item.friendshipId} />
                <button type="submit" class="btn ghost sm" disabled={busyId === item.friendshipId}>
                  Remove
                </button>
              </form>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .friends-page {
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 40px 80px;
  }

  .page-header { margin-bottom: 36px; }
  .eyebrow {
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 8px;
  }
  .page-header h1 {
    font-family: var(--ff-display);
    font-size: 40px;
    font-weight: 400;
    line-height: 1;
    color: var(--ink);
    margin: 0;
  }

  .section { margin-bottom: 40px; }
  .section-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--ff-display);
    font-size: 20px;
    font-weight: 500;
    color: var(--ink);
    margin: 0 0 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--groove);
  }
  .section-count {
    font-family: var(--ff-mono);
    font-size: 12px;
    font-weight: 500;
    color: var(--accent);
    background: var(--accent-glow);
    padding: 2px 8px;
    border-radius: 99px;
  }

  .people-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .person-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border-radius: var(--radius);
    transition: background var(--t);
  }
  .person-row:hover { background: var(--bg-2); }

  .person-link {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    flex: 1;
    min-width: 0;
  }

  .avatar,
  .avatar-placeholder {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--bg-3);
    border: 1px solid var(--groove);
  }
  .avatar { object-fit: cover; }
  .avatar-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--ff-display);
    font-size: 18px;
    color: var(--ink-2);
  }

  .person-meta { min-width: 0; }
  .person-name {
    font-family: var(--ff-display);
    font-size: 16px;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .person-username {
    font-family: var(--ff-mono);
    font-size: 12px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .pending-label {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .btn {
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 7px 14px;
    border-radius: var(--radius);
    cursor: pointer;
    transition: background var(--t), color var(--t), border-color var(--t), opacity var(--t);
    border: 1px solid transparent;
    white-space: nowrap;
  }
  .btn:disabled { opacity: 0.5; cursor: default; }
  .btn.sm { padding: 6px 12px; }

  .btn.primary {
    background: var(--accent);
    color: var(--bg);
  }
  .btn.primary:hover:not(:disabled) { opacity: 0.88; }

  .btn.ghost {
    background: transparent;
    color: var(--ink-2);
    border-color: var(--groove);
  }
  .btn.ghost:hover:not(:disabled) {
    color: var(--ink);
    border-color: var(--ink-3);
  }

  .empty {
    text-align: center;
    padding: 48px 20px;
  }
  .empty p {
    font-family: var(--ff-display);
    font-size: 16px;
    color: var(--ink-2);
    margin: 0 0 6px;
  }
  .empty-hint {
    font-size: 14px !important;
    color: var(--ink-3) !important;
    font-style: italic;
  }

  @media (max-width: 640px) {
    .friends-page { padding: 32px 20px 60px; }
    .page-header h1 { font-size: 32px; }
  }
</style>
