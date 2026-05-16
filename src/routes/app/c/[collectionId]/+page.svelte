<script>
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { FORMATS, shortCondition } from '$lib/formats';
  import RecordModal from '$lib/components/RecordModal.svelte';

  let { data, form } = $props();

  let { collection, records } = $derived(data);

  // Modal state
  let modalOpen = $state(false);
  let editingRecord = $state(null);

  function openAdd() {
    editingRecord = null;
    modalOpen = true;
  }

  function openEdit(record) {
    editingRecord = record;
    modalOpen = true;
  }

  function onModalClose() {
    modalOpen = false;
    editingRecord = null;
  }

  // Stats
  let totalCount = $derived(records.length);
  let totalValue = $derived(
    records.reduce((sum, r) => {
      const val =
        r.value_override ??
        (r.prices?.[r.condition] ? parseFloat(r.prices[r.condition]) : 0);
      return sum + (Number(val) || 0);
    }, 0)
  );
  let totalPaid = $derived(
    records.reduce(
      (sum, r) => sum + (r.purchase_price ? parseFloat(r.purchase_price) : 0),
      0
    )
  );

  function formatPrice(n) {
    if (!Number.isFinite(n) || n === 0) return '—';
    return `€${n.toFixed(0)}`;
  }

  function formatNet(value, paid) {
    const net = value - paid;
    const sign = net > 0 ? '+' : net < 0 ? '−' : '';
    return `${sign}€${Math.abs(net).toFixed(0)}`;
  }
</script>

<svelte:head>
  <title>{collection.name} — Retro Vault</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div class="header-main">
      <div class="collection-eyebrow">
        <span class="collection-icon">{collection.icon}</span>
        <span class="collection-name">{collection.name}</span>
      </div>
      <h1>
        {#if totalCount === 0}
          An empty <em>shelf</em>.
        {:else}
          {totalCount} {totalCount === 1 ? 'record' : 'records'}<em>.</em>
        {/if}
      </h1>
      {#if collection.description}
        <p class="collection-desc">{collection.description}</p>
      {/if}
    </div>

    {#if totalCount > 0}
      <div class="stats-row">
        <div class="stat">
          <div class="stat-label">Paid</div>
          <div class="stat-value">{formatPrice(totalPaid)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Value now</div>
          <div class="stat-value accent">{formatPrice(totalValue)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Net</div>
          <div
            class="stat-value"
            class:positive={totalValue > totalPaid}
            class:negative={totalValue < totalPaid}
          >
            {formatNet(totalValue, totalPaid)}
          </div>
        </div>
      </div>
    {/if}
  </header>

  <div class="page-actions">
    <button class="btn primary" onclick={openAdd}>＋ Add record</button>
    <button class="btn ghost" disabled title="Coming in next phase">
      Search Discogs
    </button>
  </div>

  {#if records.length === 0}
    <div class="empty-state">
      <div class="empty-icon">🎵</div>
      <h2>Nothing on the shelf yet.</h2>
      <p>Click <strong>Add record</strong> to put the first one in.</p>
    </div>
  {:else}
    <div class="record-grid">
      {#each records as record (record.id)}
        <article class="record-card">
          <button
            class="card-clickable"
            onclick={() => openEdit(record)}
            aria-label="Edit {record.artist} – {record.title}"
          >
            <div class="cover">
              {#if record.image_url}
                <img src={record.image_url} alt={`${record.artist} – ${record.title}`} />
              {:else}
                <div class="cover-placeholder">{FORMATS[record.format]?.icon ?? '🎵'}</div>
              {/if}
              <div class="cover-badge">{FORMATS[record.format]?.label}</div>
            </div>
            <div class="card-body">
              <div class="card-artist">{record.artist}</div>
              <div class="card-title">{record.title}</div>
              <div class="card-meta">
                {[record.label, record.year, record.genre].filter(Boolean).join(' · ') || '—'}
              </div>
              <div class="card-footer">
                <span class="card-condition">{shortCondition(record.condition)}</span>
                {#if record.value_override}
                  <span class="card-value">€{Number(record.value_override).toFixed(0)}</span>
                {/if}
              </div>
            </div>
          </button>

          <form
            method="POST"
            action="?/delete"
            class="delete-form"
            use:enhance={({ cancel }) => {
              if (!confirm(`Delete "${record.artist} – ${record.title}"?\n\nThis cannot be undone yet (undo coming soon).`)) {
                cancel();
                return;
              }
              return async ({ result }) => {
                if (result.type === 'success') {
                  await invalidateAll();
                }
              };
            }}
          >
            <input type="hidden" name="id" value={record.id} />
            <button type="submit" class="delete-btn" aria-label="Delete record" title="Delete">
              ✕
            </button>
          </form>
        </article>
      {/each}
    </div>
  {/if}
</div>

<RecordModal bind:open={modalOpen} record={editingRecord} onclose={onModalClose} />

<style>
  .page {
    padding: 40px 40px 80px;
    max-width: 1400px;
    margin: 0 auto;
  }

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 32px;
    padding-bottom: 32px;
    margin-bottom: 32px;
    border-bottom: 1px solid var(--groove);
    flex-wrap: wrap;
  }

  .header-main { flex: 1; min-width: 0; }

  .collection-eyebrow {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 14px;
  }

  .collection-icon { font-size: 14px; }

  h1 {
    font-family: var(--ff-display);
    font-size: clamp(40px, 5.5vw, 64px);
    font-weight: 400;
    line-height: 0.95;
    letter-spacing: -0.01em;
  }

  h1 em {
    font-style: italic;
    color: var(--accent);
    font-weight: 500;
  }

  .collection-desc {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 17px;
    color: var(--ink-2);
    margin-top: 12px;
  }

  .stats-row {
    display: flex;
    gap: 36px;
    align-items: baseline;
  }

  .stat { text-align: right; }

  .stat-label {
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.2em;
    color: var(--ink-3);
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .stat-value {
    font-family: var(--ff-display);
    font-size: 26px;
    font-weight: 500;
    color: var(--ink);
  }

  .stat-value.accent { color: var(--accent); }
  .stat-value.positive { color: var(--success); }
  .stat-value.negative { color: var(--danger); }

  .page-actions {
    display: flex;
    gap: 10px;
    margin-bottom: 36px;
    flex-wrap: wrap;
  }

  .btn {
    padding: 11px 22px;
    border-radius: var(--radius);
    font-family: var(--ff-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    transition: background var(--t), transform var(--t);
    border: 1px solid transparent;
  }

  .btn.primary {
    background: var(--accent);
    color: var(--bg);
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--ink);
  }

  .btn.ghost {
    background: var(--bg-3);
    color: var(--ink-2);
    border-color: var(--groove);
  }

  .btn.ghost:hover:not(:disabled) {
    color: var(--ink);
    border-color: var(--ink-3);
  }

  .btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* ── Empty state ──────────────────────────────────── */
  .empty-state {
    text-align: center;
    padding: 80px 32px;
    max-width: 500px;
    margin: 0 auto;
  }

  .empty-icon {
    font-size: 50px;
    margin-bottom: 24px;
    opacity: 0.7;
  }

  .empty-state h2 {
    font-family: var(--ff-display);
    font-size: 32px;
    font-weight: 400;
    color: var(--ink);
    margin-bottom: 16px;
  }

  .empty-state p {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 16px;
    color: var(--ink-2);
    line-height: 1.6;
  }

  .empty-state strong {
    color: var(--accent);
    font-weight: 500;
    font-style: normal;
  }

  /* ── Record grid ──────────────────────────────────── */
  .record-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 24px;
  }

  .record-card {
    position: relative;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition:
      transform var(--t),
      border-color var(--t);
  }

  .record-card:hover {
    transform: translateY(-2px);
    border-color: var(--accent);
  }

  .card-clickable {
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    color: inherit;
    text-align: left;
    cursor: pointer;
    display: block;
  }

  .cover {
    aspect-ratio: 1;
    position: relative;
    background: var(--bg-3);
    overflow: hidden;
  }

  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 60px;
    color: var(--ink-3);
  }

  .cover-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    color: var(--ink);
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 99px;
  }

  .card-body {
    padding: 16px;
  }

  .card-artist {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-title {
    font-family: var(--ff-display);
    font-size: 20px;
    line-height: 1.1;
    color: var(--ink);
    margin-bottom: 8px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-meta {
    font-family: var(--ff-mono);
    font-size: 10px;
    color: var(--ink-3);
    letter-spacing: 0.05em;
    margin-bottom: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 10px;
    border-top: 1px solid var(--groove);
  }

  .card-condition {
    font-family: var(--ff-mono);
    font-size: 10px;
    color: var(--accent);
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .card-value {
    font-family: var(--ff-display);
    font-size: 15px;
    color: var(--ink);
    font-weight: 500;
  }

  .delete-form {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 1;
    opacity: 0;
    transition: opacity var(--t);
  }

  .record-card:hover .delete-form {
    opacity: 1;
  }

  .delete-btn {
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    border: 1px solid var(--groove);
    color: var(--ink-2);
    width: 28px;
    height: 28px;
    border-radius: 50%;
    font-size: 12px;
    cursor: pointer;
    transition: background var(--t), color var(--t), border-color var(--t);
  }

  .delete-btn:hover {
    background: var(--danger);
    color: white;
    border-color: var(--danger);
  }

  @media (max-width: 840px) {
    .page { padding: 24px 22px 60px; }
    .page-header { flex-direction: column; align-items: flex-start; }
    .stats-row { gap: 24px; }
    .stat-value { font-size: 20px; }
    .delete-form { opacity: 1; }  /* mobile: always visible since no hover */
  }
</style>
