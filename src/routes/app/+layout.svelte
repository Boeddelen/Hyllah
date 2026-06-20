<script>
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';

  let { data, children } = $props();

  let sidebarOpen = $state(false);

  // Find active collection from URL
  let activeCollectionId = $derived($page.params.collectionId ?? null);
  let activeCollection = $derived(
    activeCollectionId ? data.collections.find((c) => c.id === activeCollectionId) : null
  );

  // For active-state highlighting
  let currentPath = $derived($page.url.pathname);
  function isActive(path) {
    return currentPath === path || currentPath.startsWith(path + '/');
  }
</script>

<div class="app-shell" class:sidebar-open={sidebarOpen}>
  <!-- Mobile hamburger -->
  <button class="hamburger" onclick={() => (sidebarOpen = !sidebarOpen)} aria-label="Toggle menu">
    {#if sidebarOpen}✕{:else}☰{/if}
  </button>

  <!-- Sidebar -->
  <aside class="sidebar" class:open={sidebarOpen}>
    <a href="/" class="brand-link" onclick={() => (sidebarOpen = false)}>
      <div class="brand-mark">Hyl<em>lah</em></div>
    </a>

    <nav class="primary-nav">
      <div class="nav-section">
        <div class="nav-label">Collections</div>

        <!-- All records entry -->
        <a
          href="/app/all"
          class="nav-item"
          class:active={isActive('/app/all')}
          onclick={() => (sidebarOpen = false)}
        >
          <span class="nav-icon">◇</span>
          <span class="nav-text">All records</span>
        </a>

        {#each data.collections as collection (collection.id)}
          {@const count = data.counts[collection.id]?.active ?? 0}
          <a
            href="/app/c/{collection.id}"
            class="nav-item"
            class:active={activeCollectionId === collection.id}
            onclick={() => (sidebarOpen = false)}
          >
            <span class="nav-icon">{collection.icon ?? '💿'}</span>
            <span class="nav-text">{collection.name}</span>
            <span class="nav-count">{count}</span>
          </a>
        {/each}

        <a
          href="/app/collections"
          class="nav-item subtle"
          class:active={isActive('/app/collections')}
          onclick={() => (sidebarOpen = false)}
        >
          <span class="nav-icon">+</span>
          <span class="nav-text">Manage collections</span>
        </a>
      </div>

      <div class="nav-section">
        <div class="nav-label">Library</div>
        <a
          href="/app/stats"
          class="nav-item"
          class:active={isActive('/app/stats')}
          onclick={() => (sidebarOpen = false)}
        >
          <span class="nav-text">Stats</span>
        </a>
        <a
          href="/app/friends"
          class="nav-item"
          class:active={isActive('/app/friends')}
          onclick={() => (sidebarOpen = false)}
        >
          <span class="nav-text">Friends</span>
          {#if (data.pendingRequestCount ?? 0) > 0}
            <span class="nav-badge">{data.pendingRequestCount}</span>
          {/if}
        </a>
        <a
          href="/app/archived"
          class="nav-item"
          class:active={isActive('/app/archived')}
          onclick={() => (sidebarOpen = false)}
        >
          <span class="nav-text">Archive</span>
          {#if (data.archivedCount ?? 0) > 0}
            <span class="nav-count">{data.archivedCount}</span>
          {/if}
        </a>
      </div>

      <div class="nav-section">
        <div class="nav-label">Account</div>
        <a
          href="/app/settings"
          class="nav-item"
          class:active={isActive('/app/settings')}
          onclick={() => (sidebarOpen = false)}
        >
          <span class="nav-text">Settings</span>
        </a>
      </div>
    </nav>

    <div class="sidebar-footer">
      <div class="user-info">
        {#if data.profile?.avatar_url}
          <img src={data.profile.avatar_url} alt="" class="user-avatar" />
        {:else}
          <div class="user-avatar-placeholder">
            <svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="24" cy="16" r="7" />
              <path d="M 12 32 Q 12 24 24 24 Q 36 24 36 32 L 36 40 Q 36 44 32 44 L 16 44 Q 12 44 12 40 Z" />
            </svg>
          </div>
        {/if}
        <div class="user-name">
          {data.profile?.display_name || data.profile?.username || data.user.email}
        </div>
        <div class="user-email">{data.user.email}</div>
      </div>
      <form method="POST" action="/app/signout" use:enhance>
        <button type="submit" class="sign-out-btn">Sign out</button>
      </form>
    </div>
  </aside>

  <!-- Backdrop for mobile -->
  {#if sidebarOpen}
    <button
      class="backdrop"
      onclick={() => (sidebarOpen = false)}
      aria-label="Close menu"
    ></button>
  {/if}

  <!-- Main content area -->
  <main class="main">
    {@render children()}
  </main>
</div>

<style>
  .app-shell {
    display: grid;
    grid-template-columns: 260px 1fr;
    min-height: 100vh;
    background: var(--bg);
  }

  /* ── Sidebar ─────────────────────────────────────────── */
  .sidebar {
    background: var(--bg-2);
    border-right: 1px solid var(--groove);
    display: flex;
    flex-direction: column;
    height: 100vh;
    position: sticky;
    top: 0;
    overflow-y: auto;
  }

  .brand-link {
    display: block;
    padding: 28px 24px 20px;
    border-bottom: 1px solid var(--groove);
  }

  .brand-mark {
    font-family: var(--ff-display);
    font-size: 26px;
    font-weight: 500;
    line-height: 1;
    color: var(--ink);
  }

  .brand-mark em {
    font-style: italic;
    color: var(--accent);
  }

  .primary-nav {
    flex: 1;
    padding: 20px 14px;
    overflow-y: auto;
  }

  .nav-section {
    margin-bottom: 28px;
  }

  .nav-label {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--ink-3);
    padding: 0 10px;
    margin-bottom: 10px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 10px;
    border-radius: var(--radius);
    color: var(--ink-2);
    text-decoration: none;
    font-size: 14px;
    transition:
      background var(--t),
      color var(--t);
    margin-bottom: 2px;
  }

  .nav-item:hover {
    background: var(--bg-3);
    color: var(--ink);
  }

  .nav-item.active {
    background: var(--accent-glow);
    color: var(--accent);
  }

  .nav-item.subtle {
    color: var(--ink-3);
    font-style: italic;
    font-family: var(--ff-display);
    font-size: 13px;
  }

  .nav-item.subtle:hover {
    color: var(--ink-2);
  }

  .nav-icon {
    width: 20px;
    text-align: center;
    flex-shrink: 0;
    font-size: 14px;
  }

  .nav-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav-count {
    font-family: var(--ff-mono);
    font-size: 11px;
    color: var(--ink-3);
    flex-shrink: 0;
  }

  .nav-item.active .nav-count {
    color: var(--accent);
    opacity: 0.7;
  }

  .nav-badge {
    flex-shrink: 0;
    min-width: 18px;
    height: 18px;
    padding: 0 6px;
    border-radius: 99px;
    background: var(--accent);
    color: var(--bg);
    font-family: var(--ff-mono);
    font-size: 10px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
  }

  .sidebar-footer {
    padding: 16px 14px;
    border-top: 1px solid var(--groove);
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    padding: 0 4px;
    overflow: hidden;
  }

  .user-avatar,
  .user-avatar-placeholder {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--bg-3);
    border: 1px solid var(--groove);
  }
  .user-avatar {
    object-fit: cover;
  }
  .user-avatar-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .user-avatar-placeholder svg {
    width: 18px;
    height: 18px;
    color: var(--ink-3);
  }

  .user-name {
    font-family: var(--ff-display);
    font-size: 14px;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-email {
    font-family: var(--ff-mono);
    font-size: 10px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 2px;
  }

  .sign-out-btn {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-3);
    padding: 6px 10px;
    border-radius: var(--radius);
    width: 100%;
    text-align: left;
    transition: color var(--t);
  }

  .sign-out-btn:hover {
    color: var(--accent);
  }

  /* ── Main content ─────────────────────────────────────── */
  .main {
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* ── Mobile ───────────────────────────────────────────── */
  .hamburger {
    display: none;
    position: fixed;
    top: 16px;
    left: 16px;
    z-index: 30;
    width: 40px;
    height: 40px;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    color: var(--ink);
    font-size: 18px;
    align-items: center;
    justify-content: center;
  }

  .backdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: var(--overlay);
    z-index: 15;
    border: none;
    padding: 0;
  }

  @media (max-width: 840px) {
    .app-shell {
      grid-template-columns: 1fr;
    }

    .hamburger {
      display: flex;
    }

    .sidebar {
      position: fixed;
      left: 0;
      top: 0;
      bottom: 0;
      width: 280px;
      z-index: 20;
      transform: translateX(-100%);
      transition: transform 0.25s ease;
      height: 100vh;
    }

    .sidebar.open {
      transform: translateX(0);
    }

    .app-shell.sidebar-open .backdrop {
      display: block;
    }

    .main {
      padding-top: 70px;
    }
  }
</style>
