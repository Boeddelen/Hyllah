<script>
  import { FORMATS } from '$lib/formats.js';
  import { formatCurrency } from '$lib/currency.js';

  let { data } = $props();
  const user       = $derived(data.user);
  const collection = $derived(data.collection);
  const records    = $derived(data.records ?? []);

  let search = $state('');

  const visible = $derived(
    search.trim()
      ? records.filter(
          (r) =>
            r.artist.toLowerCase().includes(search.toLowerCase()) ||
            r.title.toLowerCase().includes(search.toLowerCase())
        )
      : records
  );

  function fmtPrice(val, currency) {
    const n = Number(val);
    if (!Number.isFinite(n) || n === 0) return null;
    return formatCurrency(n, currency, { compact: false });
  }
</script>

<svelte:head>
  <title>{collection.name} · {user.display_name || user.username} · Retro Vault</title>
  <meta name="description" content="{collection.name} — {records.length} records" />
</svelte:head>

<div class="public-collection">

  <!-- ── Breadcrumb ────────────────────────────────────── -->
  <nav class="breadcrumb">
    <a href="/u/{user.username}" class="crumb">
      {#if user.avatar_url}
        <img src={user.avatar_url} alt="" class="crumb-avatar" />
      {/if}
      {user.display_name || user.username}
    </a>
    <span class="sep">·</span>
    <span class="crumb current">{collection.name}</span>
  </nav>

  <!-- ── Collection header ─────────────────────────────── -->
  <header class="header">
    <div class="header-icon">{collection.icon}</div>
    <h1>{collection.name}</h1>
    <p class="record-count">{records.length} {records.length === 1 ? 'record' : 'records'}</p>
  </header>

  <!-- ── Search ────────────────────────────────────────── -->
  {#if records.length > 6}
    <div class="search-bar">
      <div class="search-wrap">
        <svg class="search-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="9" cy="9" r="5.5" />
          <line x1="14" y1="14" x2="18" y2="18" />
        </svg>
        <input
          type="search"
          placeholder="Search artist or title…"
          bind:value={search}
          class="search-input"
        />
      </div>
    </div>
  {/if}

  <!-- ── Records grid ──────────────────────────────────── -->
  {#if visible.length > 0}
    <div class="records-grid">
      {#each visible as record (record.id)}
        <a href="/u/{user.username}/r/{record.id}" class="record-card">
          <div class="cover-wrap">
            {#if record.image_url}
              <img src={record.image_url} alt="{record.artist} – {record.title}" class="cover" />
            {:else}
              <div class="cover-empty">
                <span>{FORMATS[record.format]?.icon ?? '—'}</span>
              </div>
            {/if}
            <div class="format-badge">{record.format?.toUpperCase() ?? '—'}</div>
          </div>
          <div class="record-info">
            <div class="record-artist">{record.artist}</div>
            <div class="record-title">{record.title}</div>
            {#if record.year || record.label}
              <div class="record-meta">
                {[record.label, record.year].filter(Boolean).join(' · ')}
              </div>
            {/if}
            {#if record.condition}
              <div class="record-condition">{record.condition.replace('_', '+')}</div>
            {/if}
            {#if user.show_values_publicly && record.value_override}
              <div class="record-value">{fmtPrice(record.value_override, user.display_currency)}</div>
            {/if}
          </div>
        </a>
      {/each}
    </div>
  {:else if search}
    <div class="empty">
      <p>No records match "{search}"</p>
    </div>
  {:else}
    <div class="empty">
      <p>No public records in this collection.</p>
    </div>
  {/if}

</div>

<style>
  .public-collection {
    min-height: 100vh;
    background: var(--bg);
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 40px 80px;
  }

  /* ── Breadcrumb ────────────────────────────────────── */
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 48px;
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    color: var(--ink-3);
  }
  .crumb {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ink-3);
    text-decoration: none;
    transition: color var(--t);
  }
  .crumb:hover { color: var(--accent); }
  .crumb.current { color: var(--ink); }
  .crumb-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--groove);
  }
  .sep { color: var(--groove); }

  /* ── Header ────────────────────────────────────────── */
  .header {
    margin-bottom: 40px;
    border-bottom: 1px solid var(--groove);
    padding-bottom: 32px;
  }
  .header-icon {
    font-size: 32px;
    margin-bottom: 12px;
  }
  h1 {
    font-family: var(--ff-display);
    font-size: clamp(32px, 5vw, 56px);
    font-weight: 400;
    line-height: 0.95;
    margin: 0 0 12px;
    color: var(--ink);
  }
  .record-count {
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin: 0;
  }

  /* ── Search ────────────────────────────────────────── */
  .search-bar {
    margin-bottom: 32px;
  }
  .search-wrap {
    position: relative;
    max-width: 400px;
  }
  .search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    color: var(--ink-3);
    pointer-events: none;
  }
  .search-input {
    width: 100%;
    padding: 10px 14px 10px 36px;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    font-family: var(--ff-display);
    font-size: 14px;
    color: var(--ink);
    outline: none;
    transition: border-color var(--t);
  }
  .search-input:focus { border-color: var(--accent); }
  .search-input::placeholder { color: var(--ink-3); }

  /* ── Records grid ──────────────────────────────────── */
  .records-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 24px;
  }
  .record-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    text-decoration: none;
    transition: opacity var(--t);
  }
  .record-card:hover { opacity: 0.8; }

  .cover-wrap {
    position: relative;
    aspect-ratio: 1;
    border-radius: 4px;
    overflow: hidden;
    background: var(--bg-3);
  }
  .cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .cover-empty {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48px;
  }
  .format-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    background: rgba(0,0,0,0.7);
    color: #fff;
    font-family: var(--ff-mono);
    font-size: 8px;
    letter-spacing: 0.1em;
    padding: 3px 5px;
    border-radius: 3px;
    backdrop-filter: blur(4px);
  }

  .record-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .record-artist {
    font-family: var(--ff-display);
    font-size: 11px;
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
  .record-meta {
    font-family: var(--ff-mono);
    font-size: 10px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .record-condition {
    font-family: var(--ff-mono);
    font-size: 10px;
    color: var(--ink-3);
  }
  .record-value {
    font-family: var(--ff-mono);
    font-size: 11px;
    color: var(--accent);
    font-weight: 500;
    margin-top: 2px;
  }

  /* ── Empty state ───────────────────────────────────── */
  .empty {
    padding: 80px 0;
    text-align: center;
  }
  .empty p {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 16px;
    color: var(--ink-3);
    margin: 0;
  }

  @media (max-width: 640px) {
    .public-collection { padding: 24px 20px 60px; }
    .records-grid {
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 16px;
    }
  }
</style>
