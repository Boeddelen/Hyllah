<script>
  import { goto, invalidateAll } from '$app/navigation';
  import { FORMATS, CONDITIONS, shortCondition } from '$lib/formats.js';
  import { formatCurrency } from '$lib/currency.js';
  import { currentValueOf, valueOf, valueSourceLabel } from '$lib/valuation.js';
  import FilterBar from '$lib/components/FilterBar.svelte';
  import RecordModal from '$lib/components/RecordModal.svelte';
  import UndoToast from '$lib/components/UndoToast.svelte';

  const CONDITION_TO_DISCOGS_KEY = {
    MINT: 'Mint (M)', NEAR_MINT: 'Near Mint (NM or M-)',
    VG_PLUS: 'Very Good Plus (VG+)', VG: 'Very Good (VG)',
    GOOD_PLUS: 'Good Plus (G+)', GOOD: 'Good (G)',
    FAIR: 'Fair (F)', POOR: 'Poor (P)'
  };

  let { data } = $props();

  const records = $derived(data.records ?? []);
  const allCollections = $derived(data.allCollections ?? []);
  const recordCollectionNames = $derived(data.recordCollectionNames ?? {});
  const facets = $derived(data.facets ?? { formats: [], conditions: [], tags: [] });
  const filter = $derived(data.filter);

  const profile = $derived(data.profile);
  const rates = $derived(data.rates);
  const displayCurrency = $derived(data.displayCurrency);
  const valuationOpts = $derived({
    useDiscogsPrice: profile?.use_discogs_prices ?? true,
    rates,
    displayCurrency
  });
  const cardBackView = $derived(profile?.card_back_view ?? 'details');
  const showValueSource = $derived(profile?.show_value_source ?? false);

  function toDisplay(eur) {
    if (!eur || !rates) return eur;
    const rate = rates[displayCurrency] ?? 1;
    return eur * rate;
  }

  function matchingPriceFor(record) {
    if (!record?.prices || !record.condition) return null;
    const key = CONDITION_TO_DISCOGS_KEY[record.condition];
    if (!key) return null;
    const p = record.prices[key];
    if (!p) return null;
    return typeof p === 'object' ? p.value : p;
  }

  function hasPrices(record) {
    return record?.prices && typeof record.prices === 'object' && Object.keys(record.prices).length > 0;
  }

  function sortedPrices(prices) {
    if (!prices) return [];
    return Object.entries(prices).sort((a, b) => {
      const va = typeof a[1] === 'object' ? a[1].value : a[1];
      const vb = typeof b[1] === 'object' ? b[1].value : b[1];
      return Number(vb) - Number(va);
    });
  }

  // ── Flip card state ────────────────────────────────
  let flippedId = $state(null);
  let pricesExpandedId = $state(null);
  let pendingDelete = $state(null);

  // ── Modal state ────────────────────────────────────
  let modalOpen = $state(false);
  let editingRecord = $state(null);

  let visibleRecords = $derived(
    pendingDelete?.optimisticallyRemoved
      ? records.filter((r) => r.id !== pendingDelete.id)
      : records
  );

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

  function togglePricesExpanded(record, e) {
    e?.stopPropagation();
    pricesExpandedId = pricesExpandedId === record.id ? null : record.id;
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

  // ── Actions (POST to server) ───────────────────────
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

  async function toggleRecordPrivacy(record) {
    const fd = new FormData();
    fd.append('id', record.id);
    fd.append('isPublic', (!record.is_public_record).toString());
    try {
      const res = await fetch('?/toggleRecordPrivacy', { method: 'POST', body: fd });
      if (!res.ok) {
        alert('Could not update privacy — please try again.');
        return;
      }
      record.is_public_record = !record.is_public_record;
      await invalidateAll();
    } catch (err) {
      console.error('toggleRecordPrivacy failed', err);
    }
  }

  // ── Filter URL sync ────────────────────────────────
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

  // Close flipped card when clicking outside
  function handlePageClick(e) {
    if (!e.target?.closest('.record-card')) flippedId = null;
  }
</script>

<svelte:head>
  <title>All records · Retro Vault</title>
</svelte:head>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="page" onclick={handlePageClick}>
  <header class="page-header">
    <div>
      <div class="eyebrow">Your vault</div>
      <h1>{visibleRecords.length} {visibleRecords.length === 1 ? 'record' : 'records'}.</h1>
    </div>
  </header>

  <FilterBar
    query={filter.query}
    formats={filter.formats}
    conditions={filter.conditions}
    tags={filter.tags}
    sort={filter.sort}
    {facets}
    onchange={onFilterChange}
  />

  {#if visibleRecords.length === 0 && !filter.query && !filter.formats.length}
    <div class="empty-state">
      <svg class="empty-svg" viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="10" y1="44" x2="46" y2="44" />
        <line x1="10" y1="36" x2="46" y2="36" />
        <line x1="10" y1="28" x2="46" y2="28" />
      </svg>
      <p>Your vault is empty. Add records to a collection to see them here.</p>
    </div>
  {:else if visibleRecords.length === 0}
    <div class="empty-state">
      <svg class="empty-svg" viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="24" cy="24" r="10" />
        <line x1="31" y1="31" x2="42" y2="42" />
      </svg>
      <p>No matches for your filters.</p>
    </div>
  {:else}
    <div class="record-grid">
      {#each visibleRecords as record (record.id)}
        {@const isFlipped = flippedId === record.id}
        {@const frontValue = valueOf(record, valuationOpts)}
        {@const cv = currentValueOf(record, valuationOpts)}
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
                  <span class="cover-format-icon">{FORMATS[record.format]?.icon ?? '—'}</span>
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
              <div class="card-footer-front">
                <span class="condition-pill">{shortCondition(record.condition)}</span>
                {#if frontValue > 0}
                  <span class="card-value">{formatCurrency(toDisplay(frontValue), displayCurrency, { compact: true })}</span>
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
                  {#if cv.source !== 'none'}
                    <div class="detail-row">
                      <span class="detail-label">
                        Value
                        {#if showValueSource}
                          <span class="value-source">({valueSourceLabel(cv.source)})</span>
                        {/if}
                      </span>
                      <span class="detail-value accent">{formatCurrency(toDisplay(cv.value), displayCurrency)}</span>
                    </div>
                  {/if}
                  {#if hasPrices(record)}
                    {@const myPrice = matchingPriceFor(record)}
                    {#if myPrice && cv.source !== 'discogs'}
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
                          {#if t.position}<span class="back-track-pos">{t.position}</span>{/if}
                          <span class="back-track-title">{t.title}</span>
                          {#if t.duration}<span class="back-track-dur">{t.duration}</span>{/if}
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
              <button class="back-btn edit-btn" onclick={(e) => openEdit(record, e)}>Edit</button>
              <button
                class="back-btn privacy-btn"
                class:private={!record.is_public_record}
                title={record.is_public_record ? 'Hide from public profile' : 'Show on public profile'}
                onclick={(e) => { e.stopPropagation(); toggleRecordPrivacy(record); }}
              >
                {#if record.is_public_record}
                  <span class="privacy-icon">👁</span> Public
                {:else}
                  <span class="privacy-icon">🔒</span> Private
                {/if}
              </button>
              <button
                class="back-btn archive-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Archive "${record.artist} – ${record.title}"?`)) archive(record);
                }}
              >Archive</button>
              <button
                class="back-btn delete-btn"
                onclick={(e) => { e.stopPropagation(); softDelete(record); }}
              >Delete</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if modalOpen && editingRecord}
  <RecordModal
    record={editingRecord}
    mode="edit"
    allCollections={allCollections}
    supabase={data.supabase}
    userId={data.user.id}
    onclose={onModalClose}
    onsaved={() => { onModalClose(); invalidateAll(); }}
  />
{/if}

{#if pendingDelete}
  <UndoToast
    label={pendingDelete.label}
    onundo={undoDelete}
    onexpire={commitDelete}
  />
{/if}

<style>
  .page { padding: 40px 40px 80px; }
  .page-header { margin-bottom: 24px; }
  .eyebrow {
    font-family: var(--ff-mono); font-size: 11px; font-weight: 500;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 6px;
  }
  h1 {
    font-family: var(--ff-display);
    font-size: clamp(36px, 6vw, 64px);
    font-weight: 400; font-style: italic;
    line-height: 0.95; color: var(--ink); margin: 0;
  }

  /* ── Empty state ───────────────────────────────── */
  .empty-state {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 100px 24px; text-align: center;
  }
  .empty-svg { width: 56px; height: 56px; color: var(--ink-3); opacity: 0.5; margin-bottom: 16px; }
  .empty-state p {
    font-family: var(--ff-display); font-style: italic;
    font-size: 15px; color: var(--ink-3); margin: 0;
  }

  /* ── Record grid ───────────────────────────────── */
  .record-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 20px; margin-top: 16px;
  }

  /* ── Flip card ─────────────────────────────────── */
  .record-card {
    position: relative; height: 420px;
    cursor: pointer; perspective: 1000px; outline: none;
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

  /* ── Front ─────────────────────────────────────── */
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
    color: #f5e6d3;
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.12em; text-transform: uppercase;
    padding: 3px 8px; border-radius: 99px;
  }
  .card-front-body { padding: 12px 14px 10px; }
  .card-artist {
    font-family: var(--ff-mono); font-size: 11px; font-weight: 500;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 4px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .card-title {
    font-family: var(--ff-display); font-size: 16px;
    line-height: 1.15; color: var(--ink); margin-bottom: 4px;
    display: -webkit-box; -webkit-line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden;
  }
  .card-meta {
    font-family: var(--ff-mono); font-size: 11px;
    color: var(--ink-3); margin-bottom: 6px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  /* Collection tags on front */
  .collection-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
  .collection-tag {
    display: inline-flex; align-items: center; gap: 3px;
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.04em; color: var(--ink-3);
    background: var(--bg-3); border: 1px solid var(--groove);
    border-radius: 3px; padding: 2px 6px; text-decoration: none;
    transition: border-color var(--t), color var(--t);
  }
  .collection-tag:hover { border-color: var(--accent); color: var(--accent); }
  .tag-icon { font-size: 10px; }

  .card-footer-front {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: 6px; border-top: 1px solid var(--groove);
  }
  .condition-pill {
    font-family: var(--ff-mono); font-size: 10px; font-weight: 500;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--accent); background: var(--accent-glow);
    padding: 2px 8px; border-radius: 99px;
  }
  .card-value {
    font-family: var(--ff-display); font-size: 14px;
    color: var(--ink); font-weight: 500;
  }
  .flip-hint {
    position: absolute; bottom: 0; left: 0; right: 0;
    text-align: center;
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.1em; color: var(--ink-3);
    padding: 6px; opacity: 0; transition: opacity var(--t);
  }
  .record-card:hover .flip-hint { opacity: 1; }

  /* ── Back ───────────────────────────────────────── */
  .card-back { display: flex; flex-direction: column; padding: 0; }
  .card-back-header {
    padding: 12px 16px 10px;
    border-bottom: 1px solid var(--groove); background: var(--bg-3);
  }
  .card-back-artist {
    font-family: var(--ff-mono); font-size: 11px; font-weight: 500;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 3px;
  }
  .card-back-title {
    font-family: var(--ff-display); font-size: 16px;
    font-weight: 400; color: var(--ink); line-height: 1.15;
    display: -webkit-box; -webkit-line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden;
  }
  .card-back-body {
    flex: 1; overflow-y: auto;
    padding: 10px 16px;
    display: flex; flex-direction: column; gap: 5px;
  }
  .detail-row {
    display: flex; justify-content: space-between;
    align-items: baseline; gap: 8px; font-size: 12px;
  }
  .detail-label {
    font-family: var(--ff-mono); font-size: 10px; font-weight: 500;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--ink-3); flex-shrink: 0;
  }
  .value-source {
    font-family: var(--ff-display); font-style: italic; font-size: 10px;
    letter-spacing: 0; text-transform: none; color: var(--ink-3);
    margin-left: 4px; font-weight: normal;
  }
  .detail-value { font-family: var(--ff-display); color: var(--ink); text-align: right; }
  .detail-value.accent { color: var(--accent); }
  .tags-row { align-items: flex-start; }
  .tag-list { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
  .tag {
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.08em; text-transform: uppercase;
    background: var(--bg-3); color: var(--ink-2);
    padding: 2px 6px; border-radius: 99px; border: 1px solid var(--groove);
  }
  .notes {
    font-family: var(--ff-display); font-style: italic;
    font-size: 12px; color: var(--ink-2); line-height: 1.5;
    padding-top: 6px; border-top: 1px solid var(--groove); margin-top: 4px;
  }

  /* Tracklist */
  .back-tracklist { padding-top: 4px; }
  .back-tracklist.has-details-above { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--groove); }
  .track-list-back { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }
  .back-track { display: flex; align-items: baseline; gap: 8px; font-size: 11px; line-height: 1.4; padding: 2px 0; }
  .back-track-pos { font-family: var(--ff-mono); font-size: 9px; color: var(--ink-3); flex-shrink: 0; min-width: 22px; }
  .back-track-title { font-family: var(--ff-display); color: var(--ink); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .back-track-dur { font-family: var(--ff-mono); font-size: 9px; color: var(--ink-3); flex-shrink: 0; }
  .no-tracks { text-align: center; color: var(--ink-3); font-family: var(--ff-display); font-style: italic; font-size: 12px; padding: 14px 0; }

  /* Prices */
  .price-toggle-row { padding: 0; }
  .price-toggle-btn {
    width: 100%; background: transparent; border: none; padding: 4px 0;
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--ink-3); cursor: pointer; transition: color var(--t); text-align: center;
  }
  .price-toggle-btn:hover { color: var(--accent); }
  .all-prices { display: flex; flex-direction: column; gap: 3px; padding: 6px 8px; background: var(--bg-3); border-radius: var(--radius); }
  .all-prices-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; }
  .all-prices-cond { font-family: var(--ff-mono); font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
  .all-prices-val { font-family: var(--ff-display); color: var(--ink); }

  /* ── Back actions ──────────────────────────────── */
  .card-back-actions { display: flex; border-top: 1px solid var(--groove); }
  .back-btn {
    flex: 1; padding: 10px 4px;
    background: none; border: none;
    font-family: var(--ff-mono); font-size: 10px; font-weight: 500;
    letter-spacing: 0.08em; text-transform: uppercase;
    cursor: pointer; transition: background var(--t), color var(--t);
    color: var(--ink-2);
  }
  .back-btn:hover { background: var(--bg-3); }
  .edit-btn:hover { color: var(--accent); }
  .edit-btn { border-right: 1px solid var(--groove); }
  .privacy-btn { display: flex; align-items: center; justify-content: center; gap: 4px; color: var(--ink-2); border-right: 1px solid var(--groove); }
  .privacy-btn:hover { color: var(--accent); }
  .privacy-btn.private { color: var(--danger); }
  .privacy-btn.private:hover { background: rgba(198, 74, 74, 0.08); }
  .privacy-icon { font-size: 11px; }
  .archive-btn { border-right: 1px solid var(--groove); }
  .archive-btn:hover { color: var(--ink); }
  .delete-btn { color: var(--ink-3); }
  .delete-btn:hover { color: var(--danger); background: rgba(198, 74, 74, 0.08); }

  @media (max-width: 840px) {
    .page { padding: 24px 18px 60px; }
    .record-grid { grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; }
    .record-card { height: 380px; }
    .flip-hint { opacity: 1; }
  }
</style>
