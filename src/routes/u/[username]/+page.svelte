<script>
  import { onMount, onDestroy } from 'svelte';
  import { formatCurrency } from '$lib/currency.js';
  import { FORMATS, shortCondition } from '$lib/formats.js';

  let { data } = $props();

  const user        = $derived(data.user);
  const collections = $derived(data.collections ?? []);
  const records     = $derived(data.records ?? []);
  const stats       = $derived(data.stats);

  // Apply the profile owner's chosen public theme when this page mounts.
  // Capture the visitor's own theme/mode first so we can restore it on leave.
  let prevTheme = null;
  let prevMode  = null;

  onMount(() => {
    const el = document.documentElement;
    prevTheme = el.getAttribute('data-theme');
    prevMode  = el.getAttribute('data-mode');
    el.setAttribute('data-theme', user.public_theme ?? 'listening-room');
    el.setAttribute('data-mode',  user.public_mode  ?? 'dark');
  });

  onDestroy(() => {
    const el = document.documentElement;
    if (prevTheme) el.setAttribute('data-theme', prevTheme);
    else el.removeAttribute('data-theme');
    if (prevMode) el.setAttribute('data-mode', prevMode);
    else el.removeAttribute('data-mode');
  });

  function toDisplay(eur, displayCurrency, rates) {
    if (!eur || !rates) return eur;
    const rate = rates[displayCurrency] ?? 1;
    return eur * rate;
  }

  function fmtPrice(n, currency) {
    if (!Number.isFinite(n) || n === 0) return '—';
    return formatCurrency(n, currency, { compact: true });
  }
</script>

<svelte:head>
  <title>{user.username} · Retro Vault</title>
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
        {#if user.show_values_publicly && stats.total_value !== null}
          <div class="stat">
            <span class="stat-label">Total value</span>
            <span class="stat-value accent">{fmtPrice(toDisplay(stats.total_value, user.display_currency, data.rates), user.display_currency)}</span>
          </div>
        {/if}
      </div>
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
                {#if user.show_values_publicly && record.value_override}
                  <div class="record-value">{fmtPrice(toDisplay(Number(record.value_override), user.display_currency, data.rates), user.display_currency)}</div>
                {/if}
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
  {#if records.length === 0}
    <section class="section">
      <div class="section-inner empty">
        <p>No public records yet.</p>
      </div>
    </section>
  {/if}

  <!-- ── Footer ────────────────────────────────────────── -->
  <footer class="footer">
    <p>Retro Vault — a quiet place for your music collection</p>
  </footer>
</div>

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

  .stat-value.accent {
    color: var(--accent);
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

  .section.empty {
    text-align: center;
    padding: 100px 40px;
  }

  .section.empty p {
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

  .record-value {
    font-family: var(--ff-mono);
    font-size: 11px;
    color: var(--accent);
    font-weight: 500;
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
