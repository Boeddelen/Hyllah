<script>
  import { enhance } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { FORMATS, CONDITIONS, shortCondition } from '$lib/formats';
  import RecordModal from '$lib/components/RecordModal.svelte';

  let { data } = $props();
  let { collection, records } = $derived(data);

  // Modal state
  let modalOpen = $state(false);
  let editingRecord = $state(null);

  // Which card is currently flipped
  let flippedId = $state(null);

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
    // Don't flip if clicking a button inside the card
    if (e?.target?.closest('button, a, form')) return;
    flippedId = flippedId === id ? null : id;
  }

  function handleCardKey(id, e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      flippedId = flippedId === id ? null : id;
    }
  }

  // Stats
  let totalCount = $derived(records.length);
  let totalValue = $derived(
    records.reduce((sum, r) => {
      const val = r.value_override ?? 0;
      return sum + (Number(val) || 0);
    }, 0)
  );
  let totalPaid = $derived(
    records.reduce((sum, r) => sum + (r.purchase_price ? Number(r.purchase_price) : 0), 0)
  );

  function fmtPrice(n) {
    if (!Number.isFinite(n) || n === 0) return '—';
    return `€${n.toFixed(0)}`;
  }

  function fmtNet(value, paid) {
    if (value === 0 && paid === 0) return '—';
    const net = value - paid;
    const sign = net > 0 ? '+' : '';
    return `${sign}€${net.toFixed(0)}`;
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

<!-- Close flipped card when clicking the page background -->
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
          <!-- ── FRONT ── -->
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
                  <span class="card-value">€{Number(record.value_override).toFixed(0)}</span>
                {/if}
              </div>
            </div>
            <div class="flip-hint">tap to flip ↺</div>
          </div>

          <!-- ── BACK ── -->
          <div class="card-face card-back">
            <div class="card-back-header">
              <div>
                <div class="card-back-artist">{record.artist}</div>
                <div class="card-back-title">{record.title}</div>
              </div>
            </div>

            <div class="card-back-body">
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
                  <span class="detail-value">€{Number(record.purchase_price).toFixed(2)}</span>
                </div>
              {/if}
              {#if record.value_override}
                <div class="detail-row">
                  <span class="detail-label">Value</span>
                  <span class="detail-value accent">€{Number(record.value_override).toFixed(2)}</span>
                </div>
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

            <div class="card-back-actions">
              <button
                class="back-btn edit-btn"
                onclick={(e) => openEdit(record, e)}
              >
                ✎ Edit
              </button>
              <form
                method="POST"
                action="?/delete"
                use:enhance={({ cancel }) => {
                  if (!confirm(`Delete "${record.artist} – ${record.title}"?`)) {
                    cancel();
                    return;
                  }
                  return async ({ result }) => {
                    if (result.type === 'success') {
                      flippedId = null;
                      await invalidateAll();
                    }
                  };
                }}
              >
                <input type="hidden" name="id" value={record.id} />
                <button type="submit" class="back-btn delete-btn">✕ Delete</button>
              </form>
            </div>
          </div>
        </div>
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

  h1 {
    font-family: var(--ff-display);
    font-size: clamp(36px, 5vw, 60px);
    font-weight: 400;
    line-height: 0.95;
  }

  h1 em { font-style: italic; color: var(--accent); font-weight: 500; }

  .collection-desc {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 16px;
    color: var(--ink-2);
    margin-top: 12px;
  }

  .stats-row { display: flex; gap: 32px; }
  .stat { text-align: right; }
  .stat-label {
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-bottom: 4px;
  }
  .stat-value {
    font-family: var(--ff-display);
    font-size: 24px;
    font-weight: 500;
    color: var(--ink);
  }
  .stat-value.accent { color: var(--accent); }
  .stat-value.positive { color: var(--success); }
  .stat-value.negative { color: var(--danger); }

  /* ── Actions ─────────────────────────────────────── */
  .page-actions { margin-bottom: 36px; }

  .btn {
    padding: 11px 22px;
    border-radius: var(--radius);
    font-family: var(--ff-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    border: 1px solid transparent;
    transition: background var(--t), transform var(--t);
  }

  .btn.primary { background: var(--accent); color: var(--bg); }
  .btn.primary:hover { background: var(--ink); }

  /* ── Empty state ─────────────────────────────────── */
  .empty-state {
    text-align: center;
    padding: 80px 32px;
    max-width: 500px;
    margin: 0 auto;
  }
  .empty-icon { font-size: 50px; margin-bottom: 24px; opacity: 0.7; }
  .empty-state h2 {
    font-family: var(--ff-display);
    font-size: 30px;
    font-weight: 400;
    margin-bottom: 14px;
  }
  .empty-state p {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 16px;
    color: var(--ink-2);
    line-height: 1.6;
  }
  .empty-state strong { color: var(--accent); font-weight: 500; font-style: normal; }

  /* ── Grid ────────────────────────────────────────── */
  .record-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 24px;
  }

  /* ── Flip Card ───────────────────────────────────── */
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
    position: absolute;
    inset: 0;
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

  /* ── Card Front ──────────────────────────────────── */
  .cover {
    position: relative;
    aspect-ratio: 1;
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
  }

  .cover-format-icon {
    font-size: 64px;
    opacity: 0.4;
  }

  .cover-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(0,0,0,0.72);
    backdrop-filter: blur(4px);
    color: var(--ink);
    font-family: var(--ff-mono);
    font-size: 8px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 99px;
  }

  .card-front-body {
    padding: 14px 16px 10px;
  }

  .card-artist {
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-title {
    font-family: var(--ff-display);
    font-size: 18px;
    line-height: 1.1;
    color: var(--ink);
    margin-bottom: 6px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-meta {
    font-family: var(--ff-mono);
    font-size: 9px;
    color: var(--ink-3);
    margin-bottom: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-footer-front {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 8px;
    border-top: 1px solid var(--groove);
  }

  .condition-pill {
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--accent);
    background: rgba(212, 163, 86, 0.1);
    padding: 2px 8px;
    border-radius: 99px;
  }

  .card-value {
    font-family: var(--ff-display);
    font-size: 14px;
    color: var(--ink);
    font-weight: 500;
  }

  .flip-hint {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    text-align: center;
    font-family: var(--ff-mono);
    font-size: 8px;
    letter-spacing: 0.1em;
    color: var(--ink-3);
    padding: 6px;
    opacity: 0;
    transition: opacity var(--t);
  }

  .record-card:hover .flip-hint {
    opacity: 1;
  }

  /* ── Card Back ───────────────────────────────────── */
  .card-back {
    display: flex;
    flex-direction: column;
    padding: 0;
  }

  .card-back-header {
    padding: 16px 18px 14px;
    border-bottom: 1px solid var(--groove);
    background: var(--bg-3);
  }

  .card-back-artist {
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 4px;
  }

  .card-back-title {
    font-family: var(--ff-display);
    font-size: 18px;
    font-weight: 400;
    color: var(--ink);
    line-height: 1.1;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-back-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    font-size: 13px;
  }

  .detail-label {
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-3);
    flex-shrink: 0;
  }

  .detail-value {
    font-family: var(--ff-display);
    color: var(--ink);
    text-align: right;
  }

  .detail-value.accent { color: var(--accent); }

  .tags-row { align-items: flex-start; }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
  }

  .tag {
    font-family: var(--ff-mono);
    font-size: 8px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: var(--bg-3);
    color: var(--ink-2);
    padding: 2px 6px;
    border-radius: 99px;
    border: 1px solid var(--groove);
  }

  .notes {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 12px;
    color: var(--ink-2);
    line-height: 1.5;
    padding-top: 8px;
    border-top: 1px solid var(--groove);
    margin-top: 4px;
  }

  /* ── Card Back Actions ───────────────────────────── */
  .card-back-actions {
    display: flex;
    border-top: 1px solid var(--groove);
  }

  .back-btn {
    flex: 1;
    padding: 12px;
    background: none;
    border: none;
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    transition: background var(--t), color var(--t);
    color: var(--ink-2);
  }

  .back-btn:hover { background: var(--bg-3); }

  .edit-btn:hover { color: var(--accent); }

  .delete-btn { color: var(--ink-3); }
  .delete-btn:hover { color: var(--danger); background: rgba(198, 74, 74, 0.08); }

  .card-back-actions form { flex: 1; display: flex; }
  .card-back-actions form .back-btn { width: 100%; }

  .card-back-actions .edit-btn {
    border-right: 1px solid var(--groove);
  }

  /* ── Responsive ──────────────────────────────────── */
  @media (max-width: 840px) {
    .page { padding: 24px 18px 60px; }
    .page-header { flex-direction: column; align-items: flex-start; }
    .stats-row { gap: 20px; }
    .record-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
    .record-card { height: 340px; }
    .flip-hint { opacity: 1; } /* always visible on mobile */
  }
</style>
