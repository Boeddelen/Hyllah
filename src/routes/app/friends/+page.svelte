<script>
  import { enhance } from '$app/forms';
  import { invalidate } from '$app/navigation';

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

  // ── User search ─────────────────────────────────────
  // Minimum 2 chars before hitting the server (avoids over-broad queries).
  // 250ms debounce so we don't fire on every keystroke.
  let searchQuery = $state('');
  let searchResults = $state([]);
  let searching = $state(false);
  let quickAddBusyId = $state(null);
  let searchDebounceTimer;
  let lastIssuedQuery = '';

  // IDs of users we've already quick-added in this session, so we can show
  // "Request sent" immediately without waiting for a server round-trip.
  let quickAdded = $state(new Set());

  function onSearchInput() {
    clearTimeout(searchDebounceTimer);
    const q = searchQuery.trim();
    if (q.length < 2) {
      searchResults = [];
      searching = false;
      return;
    }
    searching = true;
    searchDebounceTimer = setTimeout(() => runSearch(q), 250);
  }

  async function runSearch(q) {
    lastIssuedQuery = q;
    try {
      const res = await fetch(`/api/user-search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error('search failed');
      const { results } = await res.json();
      // Only apply if this is still the most recent query (avoid races).
      if (lastIssuedQuery === q) {
        searchResults = results ?? [];
        searching = false;
      }
    } catch (err) {
      if (lastIssuedQuery === q) {
        console.error('[friends] search failed', err);
        searchResults = [];
        searching = false;
      }
    }
  }

  function quickAddSubmit(userId) {
    return () => {
      quickAddBusyId = userId;
      return async ({ result, update }) => {
        if (result.type === 'success') {
          // Optimistically mark this user as "request sent" so the button
          // updates immediately without re-querying.
          quickAdded = new Set([...quickAdded, userId]);
        }
        await update();
        quickAddBusyId = null;
        // Reload outgoing requests so the "Pending requests" section reflects it.
        invalidate(() => true);
      };
    };
  }

  // Per your spec: search results show only the user (avatar, name, handle)
  // plus a quick-add button when relevant. No status badges in the list.
  // The button is shown only when adding is actually possible.
  function canQuickAdd(r) {
    if (quickAdded.has(r.id)) return false;
    return r.friendshipStatus === 'none' || r.friendshipStatus === 'declined';
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

  <!-- ── Find people ───────────────────────────────────── -->
  <section class="section search-section">
    <div class="search-wrap">
      <input
        type="search"
        class="search-input"
        placeholder="Find people by name or handle…"
        bind:value={searchQuery}
        oninput={onSearchInput}
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    {#if searchQuery.trim().length >= 2}
      {#if searching}
        <p class="search-status">Searching…</p>
      {:else if searchResults.length === 0}
        <p class="search-status">No public profiles matched.</p>
      {:else}
        <div class="people-list">
          {#each searchResults as r (r.id)}
            <div class="person-row">
              <a href="/u/{r.username}" class="person-link">
                {#if r.avatar_url}
                  <img src={r.avatar_url} alt="" class="avatar" />
                {:else}
                  <div class="avatar-placeholder">{displayName(r).charAt(0).toUpperCase()}</div>
                {/if}
                <div class="person-meta">
                  <div class="person-name">{displayName(r)}</div>
                  <div class="person-username">@{r.username}</div>
                </div>
              </a>
              <div class="row-actions">
                {#if canQuickAdd(r)}
                  <form
                    method="POST"
                    action="?/quickAdd"
                    use:enhance={quickAddSubmit(r.id)}
                  >
                    <input type="hidden" name="userId" value={r.id} />
                    <button type="submit" class="btn primary sm" disabled={quickAddBusyId === r.id}>
                      {quickAddBusyId === r.id ? 'Sending…' : 'Add friend'}
                    </button>
                  </form>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </section>

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
              <a href="/app/messages/{item.user.id}" class="btn ghost sm msg-btn">
                Message
              </a>
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

  /* Message link — same look as .btn.ghost.sm but an <a> tag */
  .msg-btn {
    text-decoration: none;
    display: inline-flex;
    align-items: center;
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

  /* ── Search ───────────────────────────────────────── */
  .search-section { margin-bottom: 32px; }
  .search-wrap { margin-bottom: 12px; }
  .search-input {
    width: 100%;
    padding: 12px 16px;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    color: var(--ink);
    font-family: var(--ff-display);
    font-size: 15px;
    outline: none;
    transition: border-color var(--t);
  }
  .search-input:focus { border-color: var(--accent); }
  .search-input::placeholder { color: var(--ink-3); }

  .search-status {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 14px;
    color: var(--ink-3);
    margin: 0;
    padding: 12px 4px;
  }
</style>
