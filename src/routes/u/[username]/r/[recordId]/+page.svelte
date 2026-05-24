<script>
  import { FORMATS } from '$lib/formats.js';
  import { formatCurrency } from '$lib/currency.js';

  let { data } = $props();
  let { user, collection, record } = $derived(data);

  function fmtPrice(val, currency) {
    const n = Number(val);
    if (!Number.isFinite(n) || n === 0) return null;
    return formatCurrency(n, currency, { compact: false });
  }

  const discogsUrl = $derived(
    record.discogs_id ? `https://www.discogs.com/release/${record.discogs_id}` : null
  );
</script>

<svelte:head>
  <title>{record.artist} – {record.title} · {user.display_name || user.username} · Retro Vault</title>
  <meta name="description" content="{record.artist} – {record.title} ({record.year ?? ''})" />
</svelte:head>

<div class="public-record">

  <!-- ── Breadcrumb ────────────────────────────────────── -->
  <nav class="breadcrumb">
    <a href="/u/{user.username}" class="crumb">
      {#if user.avatar_url}
        <img src={user.avatar_url} alt="" class="crumb-avatar" />
      {/if}
      {user.display_name || user.username}
    </a>
    {#if collection}
      <span class="sep">·</span>
      <a href="/u/{user.username}/c/{collection.id}" class="crumb">{collection.name}</a>
    {/if}
    <span class="sep">·</span>
    <span class="crumb current">{record.title}</span>
  </nav>

  <!-- ── Record layout ─────────────────────────────────── -->
  <div class="record-layout">

    <!-- Cover -->
    <div class="cover-col">
      {#if record.image_url}
        <img src={record.image_url} alt="{record.artist} – {record.title}" class="cover" />
      {:else}
        <div class="cover-empty">
          <span>{FORMATS[record.format]?.icon ?? '—'}</span>
        </div>
      {/if}
    </div>

    <!-- Details -->
    <div class="details-col">
      <div class="format-badge">{record.format?.toUpperCase() ?? '—'}</div>
      <h1>{record.artist}</h1>
      <h2>{record.title}</h2>

      <dl class="meta">
        {#if record.label}
          <div class="meta-row">
            <dt>Label</dt>
            <dd>{record.label}</dd>
          </div>
        {/if}
        {#if record.year}
          <div class="meta-row">
            <dt>Year</dt>
            <dd>{record.year}</dd>
          </div>
        {/if}
        {#if record.condition}
          <div class="meta-row">
            <dt>Condition</dt>
            <dd>{record.condition.replace('_', '+')}</dd>
          </div>
        {/if}
        {#if user.show_values_publicly && record.value_override}
          <div class="meta-row">
            <dt>Value</dt>
            <dd class="accent">{fmtPrice(record.value_override, user.display_currency)}</dd>
          </div>
        {/if}
        {#if user.show_values_publicly && record.purchase_price}
          <div class="meta-row">
            <dt>Paid</dt>
            <dd>{fmtPrice(record.purchase_price, user.display_currency)}</dd>
          </div>
        {/if}
      </dl>

      {#if record.notes}
        <div class="notes">
          <p>{record.notes}</p>
        </div>
      {/if}

      {#if record.tags?.length}
        <div class="tags">
          {#each record.tags as tag}
            <span class="tag">{tag}</span>
          {/each}
        </div>
      {/if}

      {#if discogsUrl}
        <a href={discogsUrl} target="_blank" rel="noopener noreferrer" class="discogs-link">
          View on Discogs →
        </a>
      {/if}
    </div>
  </div>

</div>

<style>
  .public-record {
    min-height: 100vh;
    background: var(--bg);
    max-width: 1000px;
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
    flex-wrap: wrap;
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
  .crumb.current {
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }
  .crumb-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--groove);
  }
  .sep { color: var(--groove); }

  /* ── Record layout ──────────────────────────────────── */
  .record-layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 60px;
    align-items: start;
  }

  /* ── Cover ──────────────────────────────────────────── */
  .cover-col {}
  .cover,
  .cover-empty {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 8px;
    display: block;
    background: var(--bg-3);
  }
  .cover { object-fit: cover; }
  .cover-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 80px;
  }

  /* ── Details ────────────────────────────────────────── */
  .details-col {}
  .format-badge {
    display: inline-block;
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.15em;
    color: var(--ink-3);
    border: 1px solid var(--groove);
    border-radius: 3px;
    padding: 3px 7px;
    margin-bottom: 16px;
  }
  h1 {
    font-family: var(--ff-display);
    font-size: 14px;
    font-weight: 400;
    color: var(--ink-2);
    margin: 0 0 8px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  h2 {
    font-family: var(--ff-display);
    font-size: clamp(28px, 4vw, 42px);
    font-weight: 400;
    line-height: 1.05;
    color: var(--ink);
    margin: 0 0 32px;
  }

  /* ── Meta table ─────────────────────────────────────── */
  .meta {
    display: flex;
    flex-direction: column;
    gap: 0;
    margin: 0 0 28px;
    border-top: 1px solid var(--groove);
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 10px 0;
    border-bottom: 1px solid var(--groove);
    gap: 16px;
  }
  .meta dt {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-3);
    flex-shrink: 0;
  }
  .meta dd {
    font-family: var(--ff-display);
    font-size: 14px;
    color: var(--ink);
    text-align: right;
    margin: 0;
  }
  .meta dd.accent {
    color: var(--accent);
    font-weight: 500;
  }

  /* ── Notes ──────────────────────────────────────────── */
  .notes {
    margin-bottom: 20px;
    padding: 16px;
    background: var(--bg-2);
    border-radius: var(--radius);
    border: 1px solid var(--groove);
  }
  .notes p {
    font-family: var(--ff-display);
    font-size: 14px;
    font-style: italic;
    color: var(--ink-2);
    margin: 0;
    line-height: 1.6;
  }

  /* ── Tags ───────────────────────────────────────────── */
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 24px;
  }
  .tag {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    color: var(--ink-3);
    border: 1px solid var(--groove);
    border-radius: 3px;
    padding: 3px 8px;
  }

  /* ── Discogs link ───────────────────────────────────── */
  .discogs-link {
    display: inline-block;
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    color: var(--accent);
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-color var(--t);
  }
  .discogs-link:hover { border-color: var(--accent); }

  @media (max-width: 720px) {
    .public-record { padding: 24px 20px 60px; }
    .record-layout {
      grid-template-columns: 1fr;
      gap: 32px;
    }
    .cover-col { max-width: 280px; }
  }
</style>
