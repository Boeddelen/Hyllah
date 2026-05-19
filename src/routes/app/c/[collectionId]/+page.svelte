<script>
  import { invalidateAll } from '$app/navigation';
  import { onMount } from 'svelte';
  import { FORMATS, CONDITIONS, shortCondition } from '$lib/formats';
  import { formatCurrency } from '$lib/currency.js';
  import RecordModal from '$lib/components/RecordModal.svelte';
  import UndoToast from '$lib/components/UndoToast.svelte';
  import FilterBar from '$lib/components/FilterBar.svelte';

  let { data } = $props();
  let { collection, records } = $derived(data);

  // The user's currency preferences arrive via the app layout server load
  let displayCurrency = $derived(data.displayCurrency ?? 'EUR');
  let rates = $derived(data.rates ?? { EUR: 1 });

  /** Convert a stored-EUR amount to the user's display currency. */
  function toDisplay(amount) {
    if (!Number.isFinite(Number(amount))) return amount;
    const n = Number(amount);
    if (displayCurrency === 'EUR') return n;
    const target = rates[displayCurrency];
    if (!target) return n;
    return n * target;  // stored in EUR (rate 1), so multiply by target rate directly
  }

  // ── Filter state from URL (passed via load) ─────
  let hasActiveFilters = $derived(
    Boolean(data.filter?.query) ||
    (data.filter?.formats?.length ?? 0) > 0 ||
    (data.filter?.conditions?.length ?? 0) > 0 ||
    (data.filter?.tags?.length ?? 0) > 0 ||
    (data.filter?.sort && data.filter.sort !== 'recent')
  );

  // ── User preference: how to display the back of cards ─
  let cardBackView = $derived(data.profile?.card_back_view ?? 'details');

  // ── Modal state ─────────────────────────────────
  let modalOpen = $state(false);
  let editingRecord = $state(null);

  // ── Flip-card state ─────────────────────────────
  let flippedId = $state(null);

  // ── Pending delete state (for the undo toast) ────
  let pendingDelete = $state(null);
  // shape: { id, label, optimisticallyRemoved: boolean }

  // ── Card showing all-conditions prices? ─────────
  let pricesExpandedId = $state(null);

  /**
   * Auto-refresh prices weekly per record.
   * On page mount, find records linked to Discogs whose prices are older than 7 days,
   * and refresh up to 3 of them in the background. Caps the per-load load on Discogs.
   * Non-blocking — runs silently. Errors are swallowed (next page load will retry).
   */
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_REFRESH_PER_LOAD = 3;

  function isStale(record) {
    if (!record.discogs_id) return false;
    if (!record.prices_refreshed_at) return true; // never refreshed
    return Date.now() - new Date(record.prices_refreshed_at).getTime() > WEEK_MS;
  }

  onMount(async () => {
    const stale = records.filter(isStale).slice(0, MAX_REFRESH_PER_LOAD);
    if (stale.length === 0) return;
    // Stagger the requests so we don't fire 3 at once
    for (const record of stale) {
      try {
        await fetch(`/api/records/${record.id}/refresh-prices`, { method: 'POST' });
      } catch {
        // Silent. Next page load will try again.
      }
      // Small delay between requests so we don't trip Discogs' rate limit
      await new Promise((r) => setTimeout(r, 1200));
    }
    // After refreshing, reload so the new prices appear in the UI
    if (stale.length > 0) await invalidateAll();
  });

  // Map condition codes (DB) to Discogs price keys (in the prices JSONB)
  const CONDITION_TO_DISCOGS_KEY = {
    M: 'Mint (M)',
    NM: 'Near Mint (NM or M-)',
    VG_PLUS: 'Very Good Plus (VG+)',
    VG: 'Very Good (VG)',
    G_PLUS: 'Good Plus (G+)',
    G: 'Good (G)',
    F: 'Fair (F)',
    P: 'Poor (P)'
  };

  // Quality-sorted Discogs keys, worst → best (Poor at top, Mint at bottom).
  // Used when displaying the "All Discogs prices" panel on the card back.
  const DISCOGS_KEY_ORDER = [
    'Poor (P)',
    'Fair (F)',
    'Good (G)',
    'Good Plus (G+)',
    'Very Good (VG)',
    'Very Good Plus (VG+)',
    'Near Mint (NM or M-)',
    'Mint (M)'
  ];

  /** Sort a prices object by quality order (Poor → Mint). Unknown keys fall through to the end. */
  function sortedPrices(prices) {
    if (!prices || typeof prices !== 'object') return [];
    const entries = Object.entries(prices);
    return entries.sort(([a], [b]) => {
      const ia = DISCOGS_KEY_ORDER.indexOf(a);
      const ib = DISCOGS_KEY_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }

  /** Return the Discogs price for the record's current condition, or null. */
  function matchingPriceFor(record) {
    if (!record?.prices || !record.condition) return null;
    const key = CONDITION_TO_DISCOGS_KEY[record.condition];
    if (!key) return null;
    const p = record.prices[key];
    if (!p) return null;
    return typeof p === 'object' ? p.value : p;
  }

  /** Has Discogs price data at all? */
  function hasPrices(record) {
    return record?.prices && typeof record.prices === 'object' && Object.keys(record.prices).length > 0;
  }

  function togglePricesExpanded(record, e) {
    e?.stopPropagation();
    pricesExpandedId = pricesExpandedId === record.id ? null : record.id;
  }

  // Records to show in the grid: filter out anything pending-delete optimistically
  let visibleRecords = $derived(
    pendingDelete?.optimisticallyRemoved
      ? records.filter((r) => r.id !== pendingDelete.id)
      : records
  );

  function openAdd() {
    editingRecord = null;
    modalOpen = true;
  }

  function openEdit(record, e) {
    e?.stopPropagation();
    editingRecord = record;
    modalOpen = true;
  }

  function onModalClose() {
    modalOpen = false;
    editingRecord = null;
  }

  function toggleFlip(id, e) {
    if (e?.target?.closest('button, a, form')) return;
    flippedId = flippedId === id ? null : id;
  }

  function handleCardKey(id, e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flippedId = flippedId === id ? null : id;
    }
  }

  /**
   * Soft delete with undo:
   *  1. Optimistically remove from grid + show toast
   *  2. POST softDelete → marks pending_delete in DB
   *  3. On undo: POST undoDelete → cleared
   *  4. On expire: POST commitDelete → hard delete
   */
  async function softDelete(record) {
    pendingDelete = {
      id: record.id,
      label: `${record.artist} – ${record.title}`,
      optimisticallyRemoved: true
    };
    flippedId = null;

    const fd = new FormData();
    fd.append('id', record.id);
    try {
      await fetch('?/softDelete', { method: 'POST', body: fd });
    } catch (err) {
      // If the soft-delete fetch fails, restore and tell the user
      console.error('softDelete failed', err);
      pendingDelete = null;
      alert('Could not delete — please try again.');
    }
  }

  async function undoDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    pendingDelete = null;

    const fd = new FormData();
    fd.append('id', id);
    try {
      await fetch('?/undoDelete', { method: 'POST', body: fd });
      await invalidateAll();
    } catch (err) {
      console.error('undoDelete failed', err);
    }
  }

  async function commitDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    pendingDelete = null;

    const fd = new FormData();
    fd.append('id', id);
    try {
      await fetch('?/commitDelete', { method: 'POST', body: fd });
      await invalidateAll();
    } catch (err) {
      console.error('commitDelete failed', err);
    }
  }

  async function archive(record) {
    flippedId = null;
    const fd = new FormData();
    fd.append('id', record.id);
    try {
      await fetch('?/archive', { method: 'POST', body: fd });
      await invalidateAll();
    } catch (err) {
      console.error('archive failed', err);
      alert('Could not archive — please try again.');
    }
  }

  /**
   * Remove a record from THIS collection only — the record stays in
   * inventory and in any other collections it belongs to.
   * The server enforces "can't leave last collection"; we additionally
   * guard the UI by only showing the button when collection_count > 1.
   */
  async function removeFromCollection(record) {
    flippedId = null;
    const fd = new FormData();
    fd.append('id', record.id);
    try {
      const res = await fetch('?/removeFromCollection', { method: 'POST', body: fd });
      // SvelteKit form actions return a JSON wrapper — peek for error feedback
      if (!res.ok) {
        // 409: this was the record's only collection. Suggest archive instead.
        if (res.status === 409) {
          alert(
            `"${record.artist} – ${record.title}" is only in this collection.\n\n` +
            `Archive or delete it instead, or add it to another collection first.`
          );
          return;
        }
        alert('Could not remove from collection — please try again.');
        return;
      }
      await invalidateAll();
    } catch (err) {
      console.error('removeFromCollection failed', err);
      alert('Could not remove from collection — please try again.');
    }
  }

  // ── Stats ────────────────────────────────────────
  let totalCount = $derived(visibleRecords.length);
  let totalValue = $derived(
    visibleRecords.reduce((sum, r) => {
      const val = r.value_override ?? 0;
      return sum + (Number(val) || 0);
    }, 0)
  );
  let totalPaid = $derived(
    visibleRecords.reduce(
      (sum, r) => sum + (r.purchase_price ? Number(r.purchase_price) : 0),
      0
    )
  );

  function fmtPrice(n) {
    if (!Number.isFinite(n) || n === 0) return '—';
    return formatCurrency(toDisplay(n), displayCurrency, { compact: true });
  }
  function fmtNet(value, paid) {
    if (value === 0 && paid === 0) return '—';
    const net = value - paid;
    const sign = net > 0 ? '+' : '';
    return `${sign}${formatCurrency(toDisplay(net), displayCurrency, { compact: true })}`;
  }
  function netClass(value, paid) {
    const net = value - paid;
    if (net > 0) return 'positive';
    if (net < 0) return 'negative';
    return '';
  }
</script>

<svelte:head>
  <title>{collection.name} — Retro Vault</title>
</svelte:head>

<svelte:document onclick={(e) => {
  if (!e.target?.closest('.record-card')) flippedId = null;
}} />

<div class="page">
  <header class="page-header">
    <div class="header-main">
      <div class="collection-eyebrow">
        <span>{collection.icon}</span>
        <span>{collection.name}</span>
      </div>
      <h1>
        {#if totalCount === 0 && !hasActiveFilters}
          An empty <em>shelf</em>.
        {:else if totalCount === 0 && hasActiveFilters}
          No <em>matches</em>.
        {:else if hasActiveFilters}
          {totalCount} {totalCount === 1 ? 'match' : 'matches'}<em>.</em>
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
          <div class="stat-value">{fmtPrice(totalPaid)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Value</div>
          <div class="stat-value accent">{fmtPrice(totalValue)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Net</div>
          <div class="stat-value {netClass(totalValue, totalPaid)}">{fmtNet(totalValue, totalPaid)}</div>
        </div>
      </div>
    {/if}
  </header>

  <div class="page-actions">
    <button class="btn primary" onclick={openAdd}>＋ Add record</button>
    <a class="btn ghost" href="/app/c/{collection.id}/archived">⛔ Archive</a>
  </div>

  <FilterBar
    query={data.filter.query}
    formats={data.filter.formats}
    conditions={data.filter.conditions}
    tags={data.filter.tags}
    sort={data.filter.sort}
    facets={data.facets}
  />

  {#if visibleRecords.length === 0}
    {#if hasActiveFilters}
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h2>Nothing matches.</h2>
        <p>Try clearing some filters, or search for something else.</p>
        <a class="btn ghost" href="/app/c/{collection.id}">Clear all filters</a>
      </div>
    {:else}
      <div class="empty-state">
        <div class="empty-icon">🎵</div>
        <h2>Nothing on the shelf yet.</h2>
        <p>Click <strong>Add record</strong> to put the first one in.</p>
      </div>
    {/if}
  {:else}
    <div class="record-grid">
      {#each visibleRecords as record (record.id)}
        {@const isFlipped = flippedId === record.id}
        <div
          class="record-card"
          class:flipped={isFlipped}
          onclick={(e) => toggleFlip(record.id, e)}
          onkeydown={(e) => handleCardKey(record.id, e)}
          role="button"
          tabindex="0"
          aria-label="{record.artist} – {record.title}. Press Enter to flip."
          aria-pressed={isFlipped}
        >
          <div class="card-face card-front">
            <div class="cover">
              {#if record.image_url}
                <img src={record.image_url} alt="{record.artist} – {record.title}" loading="lazy" />
              {:else}
                <div class="cover-placeholder">
                  <span class="cover-format-icon">{FORMATS[record.format]?.icon ?? '🎵'}</span>
                </div>
              {/if}
              <div class="cover-badge">{FORMATS[record.format]?.label ?? record.format}</div>
            </div>
            <div class="card-front-body">
              <div class="card-artist">{record.artist}</div>
              <div class="card-title">{record.title}</div>
              <div class="card-meta">
                {[record.label, record.year].filter(Boolean).join(' · ') || ''}
              </div>
              <div class="card-footer-front">
                <span class="condition-pill">{shortCondition(record.condition)}</span>
                {#if record.value_override}
                  <span class="card-value">{formatCurrency(toDisplay(Number(record.value_override)), displayCurrency, { compact: true })}</span>
                {/if}
              </div>
            </div>
            <div class="flip-hint">tap to flip ↺</div>
          </div>

          <div class="card-face card-back">
            <div class="card-back-header">
              <div>
                <div class="card-back-artist">{record.artist}</div>
                <div class="card-back-title">{record.title}</div>
              </div>
            </div>

            <div class="card-back-body">
              {#if cardBackView === 'details' || cardBackView === 'both'}
                <div class="back-details">
                  <div class="detail-row">
                    <span class="detail-label">Format</span>
                    <span class="detail-value">{FORMATS[record.format]?.label ?? record.format}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Condition</span>
                    <span class="detail-value">{CONDITIONS[record.condition] ?? record.condition}</span>
                  </div>
                  {#if record.label}
                    <div class="detail-row">
                      <span class="detail-label">Label</span>
                      <span class="detail-value">{record.label}</span>
                    </div>
                  {/if}
                  {#if record.year}
                    <div class="detail-row">
                      <span class="detail-label">Year</span>
                      <span class="detail-value">{record.year}</span>
                    </div>
                  {/if}
                  {#if record.genre}
                    <div class="detail-row">
                      <span class="detail-label">Genre</span>
                      <span class="detail-value">{record.genre}</span>
                    </div>
                  {/if}
                  {#if record.purchase_price}
                    <div class="detail-row">
                      <span class="detail-label">Paid</span>
                      <span class="detail-value">{formatCurrency(toDisplay(Number(record.purchase_price)), displayCurrency)}</span>
                    </div>
                  {/if}
                  {#if record.value_override}
                    <div class="detail-row">
                      <span class="detail-label">Value</span>
                      <span class="detail-value accent">{formatCurrency(toDisplay(Number(record.value_override)), displayCurrency)}</span>
                    </div>
                  {/if}
                  {#if hasPrices(record)}
                    {@const myPrice = matchingPriceFor(record)}
                    {#if myPrice}
                      <div class="detail-row">
                        <span class="detail-label">Discogs ({shortCondition(record.condition)})</span>
                        <span class="detail-value">{formatCurrency(toDisplay(Number(myPrice)), displayCurrency)}</span>
                      </div>
                    {/if}
                    <div class="detail-row price-toggle-row">
                      <button
                        type="button"
                        class="price-toggle-btn"
                        onclick={(e) => togglePricesExpanded(record, e)}
                      >
                        {pricesExpandedId === record.id ? '× Hide all prices' : '+ All Discogs prices'}
                      </button>
                    </div>
                    {#if pricesExpandedId === record.id}
                      <div class="all-prices">
                        {#each sortedPrices(record.prices) as [cond, p]}
                          <div class="all-prices-row">
                            <span class="all-prices-cond">{cond}</span>
                            <span class="all-prices-val">{formatCurrency(toDisplay(Number(typeof p === 'object' ? p.value : p)), displayCurrency)}</span>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  {/if}
                  {#if record.tags?.length}
                    <div class="detail-row tags-row">
                      <span class="detail-label">Tags</span>
                      <div class="tag-list">
                        {#each record.tags as tag}
                          <span class="tag">{tag}</span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if record.notes}
                    <div class="notes">{record.notes}</div>
                  {/if}
                </div>
              {/if}

              {#if cardBackView === 'tracklist' || cardBackView === 'both'}
                <div class="back-tracklist" class:has-details-above={cardBackView === 'both'}>
                  {#if record.tracks?.length}
                    <ol class="track-list-back">
                      {#each record.tracks as t}
                        <li class="back-track">
                          {#if t.position}
                            <span class="back-track-pos">{t.position}</span>
                          {/if}
                          <span class="back-track-title">{t.title}</span>
                          {#if t.duration}
                            <span class="back-track-dur">{t.duration}</span>
                          {/if}
                        </li>
                      {/each}
                    </ol>
                  {:else}
                    <div class="no-tracks">No tracklist yet.</div>
                  {/if}
                </div>
              {/if}
            </div>

            <div class="card-back-actions">
              <button class="back-btn edit-btn" onclick={(e) => openEdit(record, e)}>
                ✎ Edit
              </button>
              {#if (record.collection_count ?? 1) > 1}
                <button
                  class="back-btn unlink-btn"
                  title="Remove this record from this collection. It will stay in your other collections."
                  onclick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Remove "${record.artist} – ${record.title}" from "${collection.name}"?\n\nThe record stays in your other collections.`)) {
                      removeFromCollection(record);
                    }
                  }}
                >
                  ⊖ Remove here
                </button>
              {/if}
              <button
                class="back-btn archive-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Archive "${record.artist} – ${record.title}"?\n\nYou can bring it back any time from the Archive.`)) {
                    archive(record);
                  }
                }}
              >
                📦 Archive
              </button>
              <button
                class="back-btn delete-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  softDelete(record);
                }}
              >
                ✕ Delete
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<RecordModal
  bind:open={modalOpen}
  record={editingRecord}
  onclose={onModalClose}
  allCollections={data.allCollections ?? []}
  currentCollectionId={collection.id}
/>

{#if pendingDelete}
  <UndoToast
    message="Deleted {pendingDelete.label}"
    duration={8}
    onUndo={undoDelete}
    onExpire={commitDelete}
  />
{/if}

<style>
  .page { padding: 40px 40px 80px; max-width: 1400px; margin: 0 auto; }

  /* ── Header ──────────────────────────────────────── */
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
    display: flex; align-items: center; gap: 8px;
    font-family: var(--ff-mono); font-size: 10px;
    letter-spacing: 0.22em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 14px;
  }
  h1 {
    font-family: var(--ff-display);
    font-size: clamp(36px, 5vw, 60px);
    font-weight: 400; line-height: 0.95;
  }
  h1 em { font-style: italic; color: var(--accent); font-weight: 500; }
  .collection-desc {
    font-family: var(--ff-display); font-style: italic;
    font-size: 16px; color: var(--ink-2); margin-top: 12px;
  }
  .stats-row { display: flex; gap: 32px; }
  .stat { text-align: right; }
  .stat-label {
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.2em; text-transform: uppercase;
    color: var(--ink-3); margin-bottom: 4px;
  }
  .stat-value {
    font-family: var(--ff-display); font-size: 24px;
    font-weight: 500; color: var(--ink);
  }
  .stat-value.accent { color: var(--accent); }
  .stat-value.positive { color: var(--success); }
  .stat-value.negative { color: var(--danger); }

  /* ── Actions ─────────────────────────────────────── */
  .page-actions {
    display: flex;
    gap: 10px;
    margin-bottom: 36px;
    flex-wrap: wrap;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    padding: 11px 22px;
    border-radius: var(--radius);
    font-family: var(--ff-mono); font-size: 11px;
    font-weight: 500; letter-spacing: 0.12em;
    text-transform: uppercase;
    border: 1px solid transparent;
    transition: background var(--t), color var(--t), border-color var(--t);
    cursor: pointer;
    text-decoration: none;
  }
  .btn.primary { background: var(--accent); color: var(--bg); }
  .btn.primary:hover { background: var(--ink); }
  .btn.ghost { background: var(--bg-3); color: var(--ink-2); border-color: var(--groove); }
  .btn.ghost:hover { color: var(--ink); border-color: var(--ink-3); }

  /* ── Empty state ─────────────────────────────────── */
  .empty-state {
    text-align: center;
    padding: 80px 32px;
    max-width: 500px;
    margin: 0 auto;
  }
  .empty-icon { font-size: 50px; margin-bottom: 24px; opacity: 0.7; }
  .empty-state h2 {
    font-family: var(--ff-display); font-size: 30px;
    font-weight: 400; margin-bottom: 14px;
  }
  .empty-state p {
    font-family: var(--ff-display); font-style: italic;
    font-size: 16px; color: var(--ink-2); line-height: 1.6;
  }
  .empty-state strong { color: var(--accent); font-weight: 500; font-style: normal; }

  /* ── Grid ────────────────────────────────────────── */
  .record-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 24px;
  }

  /* ── Flip card ───────────────────────────────────── */
  .record-card {
    position: relative;
    height: 380px;
    cursor: pointer;
    perspective: 1000px;
    outline: none;
  }
  .record-card:focus-visible {
    border-radius: var(--radius-lg);
    box-shadow: 0 0 0 2px var(--accent);
  }
  .card-face {
    position: absolute; inset: 0;
    border-radius: var(--radius-lg);
    border: 1px solid var(--groove);
    background: var(--bg-2);
    backface-visibility: hidden;
    -webkit-backface-visibility: hidden;
    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
  }
  .card-front { transform: rotateY(0deg); }
  .card-back { transform: rotateY(180deg); }
  .record-card.flipped .card-front { transform: rotateY(-180deg); }
  .record-card.flipped .card-back  { transform: rotateY(0deg); }
  .record-card:not(.flipped):hover .card-face {
    border-color: var(--accent);
    box-shadow: 0 8px 30px var(--shadow);
  }

  /* ── Front ───────────────────────────────────────── */
  .cover { position: relative; aspect-ratio: 1; background: var(--bg-3); overflow: hidden; }
  .cover img { width: 100%; height: 100%; object-fit: cover; }
  .cover-placeholder {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
  }
  .cover-format-icon { font-size: 64px; opacity: 0.4; }
  .cover-badge {
    position: absolute; top: 8px; right: 8px;
    background: var(--overlay); backdrop-filter: blur(4px);
    color: #f5e6d3;  /* always cream text — the overlay background is always dark */
    font-family: var(--ff-mono); font-size: 8px;
    letter-spacing: 0.12em; text-transform: uppercase;
    padding: 3px 8px; border-radius: 99px;
  }
  .card-front-body { padding: 14px 16px 10px; }
  .card-artist {
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 5px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .card-title {
    font-family: var(--ff-display); font-size: 18px;
    line-height: 1.1; color: var(--ink); margin-bottom: 6px;
    display: -webkit-box; -webkit-line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden;
  }
  .card-meta {
    font-family: var(--ff-mono); font-size: 9px;
    color: var(--ink-3); margin-bottom: 10px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .card-footer-front {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: 8px; border-top: 1px solid var(--groove);
  }
  .condition-pill {
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--accent); background: rgba(212, 163, 86, 0.1);
    padding: 2px 8px; border-radius: 99px;
  }
  .card-value {
    font-family: var(--ff-display); font-size: 14px;
    color: var(--ink); font-weight: 500;
  }
  .flip-hint {
    position: absolute; bottom: 0; left: 0; right: 0;
    text-align: center;
    font-family: var(--ff-mono); font-size: 8px;
    letter-spacing: 0.1em; color: var(--ink-3);
    padding: 6px; opacity: 0;
    transition: opacity var(--t);
  }
  .record-card:hover .flip-hint { opacity: 1; }

  /* ── Back ────────────────────────────────────────── */
  .card-back { display: flex; flex-direction: column; padding: 0; }
  .card-back-header {
    padding: 14px 18px 12px;
    border-bottom: 1px solid var(--groove);
    background: var(--bg-3);
  }
  .card-back-artist {
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 4px;
  }
  .card-back-title {
    font-family: var(--ff-display); font-size: 18px;
    font-weight: 400; color: var(--ink); line-height: 1.1;
    display: -webkit-box; -webkit-line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden;
  }
  .card-back-body {
    flex: 1; overflow-y: auto;
    padding: 10px 18px;
    display: flex; flex-direction: column; gap: 6px;
  }
  .detail-row {
    display: flex; justify-content: space-between;
    align-items: baseline; gap: 8px; font-size: 12px;
  }
  .detail-label {
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--ink-3); flex-shrink: 0;
  }
  .detail-value {
    font-family: var(--ff-display); color: var(--ink); text-align: right;
  }
  .detail-value.accent { color: var(--accent); }
  .tags-row { align-items: flex-start; }
  .tag-list {
    display: flex; flex-wrap: wrap; gap: 4px;
    justify-content: flex-end;
  }
  .tag {
    font-family: var(--ff-mono); font-size: 8px;
    letter-spacing: 0.1em; text-transform: uppercase;
    background: var(--bg-3); color: var(--ink-2);
    padding: 2px 6px; border-radius: 99px;
    border: 1px solid var(--groove);
  }
  .notes {
    font-family: var(--ff-display); font-style: italic;
    font-size: 12px; color: var(--ink-2); line-height: 1.5;
    padding-top: 8px; border-top: 1px solid var(--groove);
    margin-top: 4px;
  }

  /* ── Tracklist on card back ───────────────────────── */
  .back-tracklist {
    padding-top: 4px;
  }
  .back-tracklist.has-details-above {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--groove);
  }
  .track-list-back {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .back-track {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 11px;
    line-height: 1.4;
    padding: 2px 0;
  }
  .back-track-pos {
    font-family: var(--ff-mono);
    font-size: 9px;
    color: var(--ink-3);
    flex-shrink: 0;
    min-width: 22px;
  }
  .back-track-title {
    font-family: var(--ff-display);
    color: var(--ink);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .back-track-dur {
    font-family: var(--ff-mono);
    font-size: 9px;
    color: var(--ink-3);
    flex-shrink: 0;
  }
  .no-tracks {
    text-align: center;
    color: var(--ink-3);
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 12px;
    padding: 14px 0;
  }

  /* ── Price toggle / all-prices ───────────────────── */  .price-toggle-row { padding: 0; }
  .price-toggle-btn {
    width: 100%;
    background: transparent;
    border: none;
    padding: 4px 0;
    font-family: var(--ff-mono);
    font-size: 8px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-3);
    cursor: pointer;
    transition: color var(--t);
    text-align: center;
  }
  .price-toggle-btn:hover { color: var(--accent); }
  .all-prices {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 6px 8px;
    background: var(--bg-3);
    border-radius: var(--radius);
  }
  .all-prices-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 11px;
  }
  .all-prices-cond {
    font-family: var(--ff-mono);
    font-size: 8px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .all-prices-val {
    font-family: var(--ff-display);
    color: var(--ink);
  }
  /* ── Back actions ────────────────────────────────── */
  .card-back-actions {
    display: flex;
    border-top: 1px solid var(--groove);
  }
  .back-btn {
    flex: 1; padding: 11px 4px;
    background: none; border: none;
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.1em; text-transform: uppercase;
    cursor: pointer;
    transition: background var(--t), color var(--t);
    color: var(--ink-2);
  }
  .back-btn:hover { background: var(--bg-3); }
  .edit-btn:hover { color: var(--accent); }
  .archive-btn:hover { color: var(--ink); }
  .delete-btn { color: var(--ink-3); }
  .delete-btn:hover { color: var(--danger); background: rgba(198, 74, 74, 0.08); }
  .unlink-btn { color: var(--ink-3); }
  .unlink-btn:hover { color: var(--ink); }
  .edit-btn { border-right: 1px solid var(--groove); }
  .archive-btn { border-right: 1px solid var(--groove); }
  .unlink-btn { border-right: 1px solid var(--groove); }

  @media (max-width: 840px) {
    .page { padding: 24px 18px 60px; }
    .page-header { flex-direction: column; align-items: flex-start; }
    .stats-row { gap: 20px; }
    .record-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
    .record-card { height: 340px; }
    .flip-hint { opacity: 1; }
  }
</style>
