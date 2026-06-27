<script>
  import { enhance } from '$app/forms';
  import { FORMATS, shortCondition } from '$lib/formats.js';

  let { data } = $props();

  const user        = $derived(data.user);
  const collections = $derived(data.collections ?? []);
  const records     = $derived(data.records ?? []);
  const stats       = $derived(data.stats);

  // Viewer-specific social state (provided by the server load).
  const viewer  = $derived(data.viewer ?? { isLoggedIn: false, isOwnProfile: false });
  // Local mirror of friendship status so the button updates after an action
  // without needing a full reload. Seeded from server, then patched optimistically.
  let friendStatus = $state(data.friendshipStatus ?? 'none');
  let sending = $state(false);

  // ── Block / report state ────────────────────────────
  let menuOpen = $state(false);
  let showBlockConfirm = $state(false);
  let showReportForm = $state(false);
  let reportCategory = $state('harassment');
  let reportDetail = $state('');
  let submittingReport = $state(false);
  let reportSent = $state(false);

  function closeAllOverlays() {
    menuOpen = false;
    showBlockConfirm = false;
    showReportForm = false;
  }
  function startReport() {
    menuOpen = false;
    showBlockConfirm = false;
    reportCategory = 'harassment';
    reportDetail = '';
    reportSent = false;
    showReportForm = true;
  }
  function startBlock() {
    menuOpen = false;
    showReportForm = false;
    showBlockConfirm = true;
  }

  function handleReport() {
    submittingReport = true;
    return async ({ result, update }) => {
      submittingReport = false;
      if (result.type === 'success') {
        reportSent = true;
        // Auto-close after a moment so the user sees confirmation
        setTimeout(() => { showReportForm = false; }, 1800);
      } else {
        await update();
      }
    };
  }

  // Keep local status in sync if the server value changes (e.g. navigation).
  $effect(() => {
    friendStatus = data.friendshipStatus ?? 'none';
  });

  function handleSendRequest() {
    sending = true;
    return async ({ result, update }) => {
      sending = false;
      if (result.type === 'success') {
        friendStatus = 'pending_sent';
      }
      // Re-run the load so server truth wins, but don't reset our optimistic UI.
      await update({ reset: false });
    };
  }
</script>

<svelte:head>
  <title>{user.username} · Hyllah</title>
  <meta name="description" content="{user.bio || 'A music collection'}" />
</svelte:head>

<div class="public-profile">
  <!-- ── Hero section ────────────────────────────────────── -->
  <header class="hero">
    <div class="hero-content">
      {#if user.avatar_url}
        <img src={user.avatar_url} alt="" class="avatar" />
      {:else}
        <div class="avatar-placeholder">
          <svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="24" cy="16" r="7" />
            <path d="M 12 32 Q 12 24 24 24 Q 36 24 36 32 L 36 40 Q 36 44 32 44 L 16 44 Q 12 44 12 40 Z" />
          </svg>
        </div>
      {/if}

      <h1>{user.display_name || user.username}</h1>
      {#if user.bio}
        <p class="bio">{user.bio}</p>
      {/if}

      <div class="stats-row">
        <div class="stat">
          <span class="stat-label">Records</span>
          <span class="stat-value">{stats.total_records}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Collections</span>
          <span class="stat-value">{stats.total_collections}</span>
        </div>
      </div>

      <!-- ── Social actions ─────────────────────────────────── -->
      {#if !viewer.isOwnProfile}
        <div class="social-actions">
          {#if !viewer.isLoggedIn}
            <a href="/login" class="connect-btn">Sign in to connect</a>
          {:else if friendStatus === 'friends'}
            <span class="friend-state">✓ Friends</span>
            <a href="/app/messages/{user.id}" class="connect-btn secondary">Message</a>
          {:else if friendStatus === 'pending_sent'}
            <span class="friend-state muted">Request sent</span>
          {:else if friendStatus === 'pending_received'}
            <a href="/app/friends" class="connect-btn">Respond to request</a>
          {:else}
            <form method="POST" action="?/sendFriendRequest" use:enhance={handleSendRequest}>
              <button type="submit" class="connect-btn" disabled={sending}>
                {sending ? 'Sending…' : 'Add friend'}
              </button>
            </form>
          {/if}

          {#if viewer.isLoggedIn}
            <div class="menu-wrap">
              <button
                type="button"
                class="menu-btn"
                aria-label="More options"
                aria-expanded={menuOpen}
                onclick={() => (menuOpen = !menuOpen)}
              >⋯</button>
              {#if menuOpen}
                <div class="menu-dropdown" role="menu">
                  <button type="button" class="menu-item" onclick={startReport} role="menuitem">
                    Report user
                  </button>
                  <button type="button" class="menu-item danger" onclick={startBlock} role="menuitem">
                    Block user
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </header>

  <!-- ── Collections section ────────────────────────────────── -->
  {#if collections.length > 0}
    <section class="section">
      <div class="section-inner">
        <h2>Collections</h2>
        <div class="collections-grid">
          {#each collections as coll (coll.id)}
            <a href="/u/{user.username}/c/{coll.id}" class="collection-card">
              <div class="collection-covers">
                {#each coll.covers as cover}
                  <img src={cover} alt="" />
                {/each}
                {#each Array(Math.max(0, 4 - coll.covers.length)).fill(null) as _}
                  <div class="cover-placeholder">{FORMATS[records[0]?.format]?.icon ?? '—'}</div>
                {/each}
              </div>
              <div class="collection-info">
                <div class="collection-icon">{coll.icon}</div>
                <h3>{coll.name}</h3>
                <p class="count">{coll.count} {coll.count === 1 ? 'record' : 'records'}</p>
              </div>
            </a>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  <!-- ── Records gallery ────────────────────────────────────── -->
  {#if records.length > 0}
    <section class="section">
      <div class="section-inner">
        <h2>Recent additions</h2>
        <div class="records-gallery">
          {#each records.slice(0, 12) as record (record.id)}
            <a href="/u/{user.username}/r/{record.id}" class="record-card">
              {#if record.image_url}
                <img src={record.image_url} alt="{record.artist} – {record.title}" class="cover" />
              {:else}
                <div class="cover-empty">{FORMATS[record.format]?.icon ?? '—'}</div>
              {/if}
              <div class="record-info">
                <div class="record-artist">{record.artist}</div>
                <div class="record-title">{record.title}</div>
              </div>
            </a>
          {/each}
        </div>
        {#if records.length > 12}
          <div class="view-all">
            <a href="/u/{user.username}/records" class="link">View all {records.length} records →</a>
          </div>
        {/if}
      </div>
    </section>
  {/if}

  <!-- ── Empty state ────────────────────────────────────── -->
  {#if collections.length === 0 && records.length === 0}
    <section class="section">
      <div class="section-inner empty">
        {#if viewer.isOwnProfile}
          <p>Your profile is public, but you haven't shared anything yet. Flip a collection or a record to <strong>Public</strong> to show it here.</p>
        {:else}
          <p>This collector hasn't made anything public yet.</p>
        {/if}
      </div>
    </section>
  {/if}

  <!-- ── Footer ────────────────────────────────────────── -->
  <footer class="footer">
    <p>Hyllah — a quiet place for your music collection</p>
  </footer>
</div>

<!-- ── Block confirmation modal ───────────────────────── -->
{#if showBlockConfirm}
  <div class="overlay-backdrop">
    <div class="overlay-dialog" role="dialog" aria-modal="true" aria-labelledby="block-title">
      <h2 id="block-title">Block {user.display_name || user.username}?</h2>
      <p class="dialog-body">
        They won't be able to see your profile, send you friend requests, or message you.
        If you're friends, the friendship will be removed.
        You can unblock anyone later from your settings.
      </p>
      <div class="dialog-actions">
        <button type="button" class="btn ghost" onclick={() => (showBlockConfirm = false)}>Cancel</button>
        <form method="POST" action="?/block" use:enhance>
          <button type="submit" class="btn danger">Block</button>
        </form>
      </div>
    </div>
  </div>
{/if}

<!-- ── Report modal ──────────────────────────────────── -->
{#if showReportForm}
  <div class="overlay-backdrop">
    <div class="overlay-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
      {#if reportSent}
        <h2 id="report-title">Report submitted</h2>
        <p class="dialog-body">Thank you. We'll review this report. The user isn't notified.</p>
      {:else}
        <h2 id="report-title">Report {user.display_name || user.username}</h2>
        <p class="dialog-body">
          Reports are sent privately to the Hyllah team for review.
          The reported user is never notified.
        </p>
        <form method="POST" action="?/report" use:enhance={handleReport} class="report-form">
          <label class="field">
            <span class="field-label">Reason</span>
            <select name="category" bind:value={reportCategory} class="field-input" required>
              <option value="harassment">Harassment or threats</option>
              <option value="spam">Spam or scams</option>
              <option value="impersonation">Impersonation</option>
              <option value="inappropriate">Inappropriate content</option>
              <option value="underage">Underage user / child safety</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">Details (optional)</span>
            <textarea
              name="detail"
              bind:value={reportDetail}
              maxlength="500"
              rows="4"
              class="field-input"
              placeholder="Anything that helps us understand what happened."
            ></textarea>
          </label>
          <div class="dialog-actions">
            <button type="button" class="btn ghost" onclick={() => (showReportForm = false)} disabled={submittingReport}>Cancel</button>
            <button type="submit" class="btn primary" disabled={submittingReport}>
              {submittingReport ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </form>
      {/if}
    </div>
  </div>
{/if}

<style>
  .public-profile {
    min-height: 100vh;
    background: var(--bg);
    display: flex;
    flex-direction: column;
  }

  /* ── Hero section ──────────────────────────────────────── */
  .hero {
    background: var(--bg-2);
    border-bottom: 1px solid var(--groove);
    padding: 60px 40px;
  }

  .hero-content {
    max-width: 720px;
    margin: 0 auto;
    text-align: center;
  }

  .avatar,
  .avatar-placeholder {
    display: block;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    margin: 0 auto 24px;
    background: var(--bg-3);
    border: 1px solid var(--groove);
  }

  .avatar {
    object-fit: cover;
  }

  .avatar-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .avatar-placeholder svg {
    width: 64px;
    height: 64px;
    color: var(--ink-3);
  }

  h1 {
    font-family: var(--ff-display);
    font-size: clamp(32px, 5vw, 48px);
    font-weight: 400;
    line-height: 0.95;
    margin: 0 0 12px;
    color: var(--ink);
  }

  .bio {
    font-family: var(--ff-display);
    font-size: 16px;
    font-style: italic;
    color: var(--ink-2);
    margin: 0 0 24px;
    line-height: 1.6;
  }

  .stats-row {
    display: flex;
    justify-content: center;
    gap: 32px;
    flex-wrap: wrap;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .stat-label {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .stat-value {
    font-family: var(--ff-display);
    font-size: 24px;
    font-weight: 500;
    color: var(--ink);
  }

  /* ── Social actions ────────────────────────────────────── */
  .social-actions {
    margin-top: 28px;
    display: flex;
    justify-content: center;
  }

  .connect-btn {
    font-family: var(--ff-mono);
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--bg);
    background: var(--accent);
    border: 1px solid var(--accent);
    padding: 11px 26px;
    border-radius: var(--radius);
    text-decoration: none;
    cursor: pointer;
    transition: opacity var(--t);
    display: inline-block;
  }
  .connect-btn:hover:not(:disabled) { opacity: 0.88; }
  .connect-btn:disabled { opacity: 0.5; cursor: default; }
  .connect-btn.secondary {
    background: none;
    border: 1px solid var(--groove);
    color: var(--ink-2);
    opacity: 1;
  }
  .connect-btn.secondary:hover { border-color: var(--ink-3); color: var(--ink); }

  /* ── Kebab menu ────────────────────────────────────── */
  .menu-wrap { position: relative; }
  .menu-btn {
    width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    background: none; border: 1px solid var(--groove); border-radius: var(--radius);
    color: var(--ink-2); font-size: 18px; line-height: 1; cursor: pointer;
    transition: color var(--t), border-color var(--t), background var(--t);
  }
  .menu-btn:hover { color: var(--ink); border-color: var(--ink-3); background: var(--bg-2); }

  .menu-dropdown {
    position: absolute; top: calc(100% + 6px); right: 0;
    min-width: 180px; z-index: 30;
    background: var(--surface); border: 1px solid var(--groove);
    border-radius: var(--radius); box-shadow: var(--shadow);
    overflow: hidden;
  }
  .menu-item {
    display: block; width: 100%; text-align: left;
    padding: 10px 14px; background: none; border: none;
    font-family: var(--ff-display); font-size: 14px; color: var(--ink);
    cursor: pointer; transition: background var(--t);
  }
  .menu-item:hover { background: var(--bg-2); }
  .menu-item.danger { color: var(--danger); }

  /* ── Overlay dialogs (block confirm / report form) ──── */
  .overlay-backdrop {
    position: fixed; inset: 0; z-index: 100;
    background: var(--overlay); backdrop-filter: blur(2px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  }
  .overlay-dialog {
    width: 100%; max-width: 460px;
    background: var(--surface); border: 1px solid var(--groove);
    border-radius: var(--radius-lg); box-shadow: var(--shadow);
    padding: 24px;
  }
  .overlay-dialog h2 {
    font-family: var(--ff-display); font-size: 20px; font-weight: 500;
    margin: 0 0 12px; color: var(--ink);
  }
  .dialog-body {
    font-family: var(--ff-display); font-size: 14px; line-height: 1.55;
    color: var(--ink-2); margin: 0 0 20px;
  }
  .dialog-actions {
    display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap;
  }

  .report-form { display: flex; flex-direction: column; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field-label {
    font-family: var(--ff-mono); font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--ink-3);
  }
  .field-input {
    width: 100%; padding: 10px 12px;
    background: var(--bg-2); border: 1px solid var(--groove);
    border-radius: var(--radius); color: var(--ink);
    font-family: var(--ff-display); font-size: 14px;
    outline: none; transition: border-color var(--t);
  }
  .field-input:focus { border-color: var(--accent); }
  textarea.field-input { resize: vertical; min-height: 80px; }

  .btn {
    background: none; border: 1px solid var(--groove); color: var(--ink-2);
    font-family: var(--ff-mono); font-size: 11px; font-weight: 600;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 9px 16px; border-radius: var(--radius); cursor: pointer;
    transition: color var(--t), border-color var(--t), background var(--t);
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.ghost:hover:not(:disabled) {
    color: var(--ink); border-color: var(--ink-3); background: var(--bg-2);
  }
  .btn.primary {
    background: var(--accent); border-color: var(--accent); color: var(--bg);
  }
  .btn.primary:hover:not(:disabled) { filter: brightness(1.08); }
  .btn.danger {
    background: var(--danger); border-color: var(--danger); color: var(--bg);
  }
  .btn.danger:hover:not(:disabled) { filter: brightness(1.08); }

  .friend-state {
    font-family: var(--ff-mono);
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
    border: 1px solid var(--groove);
    background: var(--accent-glow);
    padding: 11px 26px;
    border-radius: var(--radius);
  }
  .friend-state.muted {
    color: var(--ink-3);
    background: transparent;
  }

  /* ── Sections ──────────────────────────────────────────── */
  .section {
    padding: 60px 40px;
    border-bottom: 1px solid var(--groove);
  }

  .section-inner {
    max-width: 1200px;
    margin: 0 auto;
  }

  .section h2 {
    font-family: var(--ff-display);
    font-size: 28px;
    font-weight: 400;
    margin: 0 0 32px;
    color: var(--ink);
  }

  .section-inner.empty {
    text-align: center;
    padding: 100px 40px;
  }

  .section-inner.empty p {
    font-family: var(--ff-display);
    font-size: 16px;
    color: var(--ink-2);
    margin: 0;
  }

  /* ── Collections grid ──────────────────────────────────── */
  .collections-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 40px;
  }

  .collection-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-decoration: none;
    transition: opacity 0.2s;
  }

  .collection-card:hover {
    opacity: 0.8;
  }

  .collection-covers {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
    aspect-ratio: 1;
  }

  .collection-covers img,
  .cover-placeholder {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
    background: var(--bg-3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
  }

  .collection-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .collection-icon {
    font-size: 20px;
  }

  .collection-card h3 {
    font-family: var(--ff-display);
    font-size: 15px;
    font-weight: 500;
    margin: 0;
    color: var(--ink);
  }

  .collection-card .count {
    font-family: var(--ff-display);
    font-size: 13px;
    color: var(--ink-3);
    margin: 0;
  }

  /* ── Records gallery ───────────────────────────────────── */
  .records-gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .record-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-decoration: none;
    transition: opacity 0.2s;
  }

  .record-card:hover {
    opacity: 0.8;
  }

  .record-card .cover,
  .cover-empty {
    aspect-ratio: 1;
    width: 100%;
    object-fit: cover;
    border-radius: 4px;
    background: var(--bg-3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48px;
  }

  .record-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .record-artist {
    font-family: var(--ff-display);
    font-size: 12px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .record-title {
    font-family: var(--ff-display);
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .view-all {
    text-align: center;
    margin-top: 24px;
  }

  .view-all .link {
    font-family: var(--ff-display);
    font-size: 14px;
    color: var(--accent);
    text-decoration: none;
    border-bottom: 1px solid var(--groove);
    transition: border-color 0.2s;
  }

  .view-all .link:hover {
    border-color: var(--accent);
  }

  /* ── Footer ────────────────────────────────────────── */
  .footer {
    margin-top: auto;
    padding: 40px;
    text-align: center;
    color: var(--ink-3);
    font-size: 13px;
    border-top: 1px solid var(--groove);
  }

  @media (max-width: 640px) {
    .hero {
      padding: 40px 24px;
    }

    .section {
      padding: 40px 24px;
    }

    h1 {
      font-size: 28px;
    }

    .collections-grid {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }

    .records-gallery {
      grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: 12px;
    }
  }
</style>
