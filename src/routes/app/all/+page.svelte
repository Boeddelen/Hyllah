<script>
  import { page } from '$app/stores';
  import { goto, invalidateAll } from '$app/navigation';
  import { FORMATS } from '$lib/formats.js';
  import { formatCurrency } from '$lib/currency.js';
  import { currentValueOf, valueSourceLabel } from '$lib/valuation.js';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import RecordModal from '$lib/components/RecordModal.svelte';

  let { data } = $props();

  const records = $derived(data.records ?? []);
  const allCollections = $derived(data.allCollections ?? []);
  const recordCollectionNames = $derived(data.recordCollectionNames ?? {});
  const filter = $derived(data.filter);

  const profile = $derived(data.profile);
  const rates = $derived(data.rates);
  const displayCurrency = $derived(data.displayCurrency);
  const valuationOpts = $derived({
    useDiscogsPrice: profile?.use_discogs_prices ?? true,
    rates,
    displayCurrency
  });

  // Convert value for display
  function displayValue(record) {
    const val = currentValueOf(record, valuationOpts);
    if (!val) return null;
    return formatCurrency(val, displayCurrency, { compact: false });
  }

  // ── Modal ────────────────────────────────────────────
  let modalRecord = $state(null);
  let modalMode = $state('view');

  function openView(record, e) {
    e?.stopPropagation();
    modalRecord = record;
    modalMode = 'view';
  }

  // ── Total stats ──────────────────────────────────────
  const totalRecords = $derived(records.length);

  // ── Filter URL sync ──────────────────────────────────
  function onFilterChange(detail) {
    const sp = new URLSearchParams();
    if (detail.query) sp.set('q', detail.query);
    if (detail.formats?.length) sp.set('format', detail.formats.join(','));
    if (detail.conditions?.length) sp.set('condition', detail.conditions.join(','));
    if (detail.tags?.length) sp.set('tag', detail.tags.join(','));
    if (detail.sort && detail.sort !== 'recent') sp.set('sort', detail.sort);
    const qs = sp.toString();
    goto(`/app/all${qs ? '?' + qs : ''}`, { replaceState: true, noScroll: true });
  }
</script>

<svelte:head>
  <title>All records · Retro Vault</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div class="eyebrow">Your vault</div>
    <h1>{totalRecords} {totalRecords === 1 ? 'record' : 'records'}.</h1>
  </header>

  <FilterBar
    query={filter.query}
    formats={filter.formats}
    conditions={filter.conditions}
    tags={filter.tags}
    sort={filter.sort}
    onchange={onFilterChange}
  />

  {#if records.length === 0 && !filter.query && !filter.formats.length}
    <div class="empty-state">
      <svg class="empty-svg" viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="10" y1="44" x2="46" y2="44" />
        <line x1="10" y1="36" x2="46" y2="36" />
        <line x1="10" y1="28" x2="46" y2="28" />
      </svg>
      <p>Your vault is empty. Add records to a collection to see them here.</p>
    </div>
  {:else if records.length === 0}
    <div class="empty-state">
      <svg class="empty-svg" viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="24" cy="24" r="10" />
        <line x1="31" y1="31" x2="42" y2="42" />
      </svg>
      <p>No matches for your filters.</p>
    </div>
  {:else}
    <div class="records-grid">
      {#each records as record (record.id)}
        <button
          class="record-card"
          onclick={(e) => openView(record, e)}
          type="button"
        >
          <div class="cover-wrap">
            {#if record.image_url}
              <img src={record.image_url} alt="{record.artist} – {record.title}" class="cover" loading="lazy" />
            {:else}
              <div class="cover-empty">
                <span>{FORMATS[record.format]?.icon ?? '—'}</span>
              </div>
            {/if}
            <div class="format-badge">{FORMATS[record.format]?.label ?? record.format}</div>
          </div>

          <div class="record-info">
            <div class="record-artist">{record.artist}</div>
            <div class="record-title">{record.title}</div>
            {#if record.label || record.year}
              <div class="record-meta">{[record.label, record.year].filter(Boolean).join(' · ')}</div>
            {/if}
            {#if displayValue(record)}
              <div class="record-value">{displayValue(record)}</div>
            {/if}

            <!-- Collection tags -->
            {#if recordCollectionNames[record.id]?.length}
              <div class="collection-tags">
                {#each recordCollectionNames[record.id] as coll}
                  <a
                    href="/app/c/{coll.id}"
                    class="collection-tag"
                    onclick={(e) => e.stopPropagation()}
                  >
                    <span class="tag-icon">{coll.icon ?? '💿'}</span>
                    {coll.name}
                  </a>
                {/each}
              </div>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

{#if modalRecord}
  <RecordModal
    record={modalRecord}
    mode={modalMode}
    {allCollections}
    supabase={data.supabase}
    userId={data.user.id}
    onclose={() => { modalRecord = null; }}
    onsaved={() => { modalRecord = null; invalidateAll(); }}
  />
{/if}

<style>
  .page {
    padding: 40px 40px 80px;
  }

  .page-header {
    margin-bottom: 32px;
  }

  .eyebrow {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 8px;
  }

  h1 {
    font-family: var(--ff-display);
    font-size: clamp(36px, 6vw, 64px);
    font-weight: 400;
    font-style: italic;
    line-height: 0.95;
    color: var(--ink);
    margin: 0;
  }

  /* ── Grid ──────────────────────────────────────────── */
  .records-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 24px;
    margin-top: 24px;
  }

  .record-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    color: inherit;
    font: inherit;
    transition: opacity var(--t);
  }
  .record-card:hover { opacity: 0.85; }

  .cover-wrap {
    position: relative;
    aspect-ratio: 1;
    border-radius: var(--radius);
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
    top: 8px;
    right: 8px;
    background: rgba(0,0,0,0.7);
    color: #fff;
    font-family: var(--ff-mono);
    font-size: 8px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 3px 6px;
    border-radius: 3px;
    backdrop-filter: blur(4px);
  }

  .record-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .record-artist {
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .record-title {
    font-family: var(--ff-display);
    font-size: 14px;
    font-weight: 500;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .record-meta {
    font-family: var(--ff-display);
    font-size: 12px;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .record-value {
    font-family: var(--ff-mono);
    font-size: 11px;
    color: var(--ink-2);
    margin-top: 2px;
  }

  /* ── Collection tags ───────────────────────────────── */
  .collection-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
  .collection-tag {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.06em;
    color: var(--ink-3);
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: 3px;
    padding: 2px 6px;
    text-decoration: none;
    transition: border-color var(--t), color var(--t);
  }
  .collection-tag:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  .tag-icon {
    font-size: 10px;
  }

  /* ── Empty state ───────────────────────────────────── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 100px 24px;
    text-align: center;
  }
  .empty-svg {
    width: 56px;
    height: 56px;
    color: var(--ink-3);
    opacity: 0.5;
    margin-bottom: 16px;
  }
  .empty-state p {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 15px;
    color: var(--ink-3);
    margin: 0;
  }

  @media (max-width: 640px) {
    .page { padding: 24px 20px 60px; }
    .records-grid {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 16px;
    }
  }
</style>
