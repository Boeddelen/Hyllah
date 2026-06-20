<script>
  import { invalidateAll } from '$app/navigation';
  import { FORMATS, shortCondition } from '$lib/formats.js';

  let { data } = $props();
  const records = $derived(data.records ?? []);

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

  // ── Select mode ────────────────────────────────────
  let selectMode = $state(false);
  let selectedIds = $state(new Set());
  const selectedCount = $derived(selectedIds.size);

  function toggleSelectMode() {
    if (selectMode) exitSelect();
    else selectMode = true;
  }
  function exitSelect() {
    selectMode = false;
    selectedIds = new Set();
  }
  function toggleSelect(id) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }
  function selectAllVisible() {
    selectedIds = new Set(visible.map((r) => r.id));
  }
  function onCardClick(record, e) {
    if (e?.target?.closest('button, a, form')) return;
    if (selectMode) toggleSelect(record.id);
  }
  function onCardKey(record, e) {
    if (selectMode && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggleSelect(record.id);
    }
  }

  // ── Actions ────────────────────────────────────────
  async function unarchive(record) {
    const fd = new FormData();
    fd.append('id', record.id);
    try {
      const res = await fetch('?/unarchive', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('bad status');
      await invalidateAll();
    } catch (err) {
      console.error('unarchive failed', err);
      alert('Could not unarchive — please try again.');
    }
  }

  async function postIds(action, ids) {
    const fd = new FormData();
    fd.append('ids', ids.join(','));
    return fetch(`?/${action}`, { method: 'POST', body: fd });
  }

  async function bulkUnarchive() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    exitSelect();
    try {
      const res = await postIds('bulkUnarchive', ids);
      if (!res.ok) throw new Error('bad status');
      await invalidateAll();
    } catch (err) {
      console.error('bulkUnarchive failed', err);
      alert('Could not unarchive those records — please try again.');
    }
  }

  async function bulkPermanentDelete() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const n = ids.length;
    if (!confirm(`Permanently delete ${n} record${n === 1 ? '' : 's'}? This cannot be undone.`)) return;
    exitSelect();
    try {
      const res = await postIds('bulkPermanentDelete', ids);
      if (!res.ok) throw new Error('bad status');
      await invalidateAll();
    } catch (err) {
      console.error('bulkPermanentDelete failed', err);
      alert('Could not delete those records — please try again.');
    }
  }
</script>

<svelte:head>
  <title>Archive · Hyllah</title>
</svelte:head>

<div class="page">
  <header class="page-header">
    <div>
      <div class="eyebrow">Library</div>
      <h1>Archive</h1>
      <p class="sub">
        {records.length} archived {records.length === 1 ? 'record' : 'records'}
      </p>
    </div>
    {#if records.length > 0}
      <button class="select-toggle" class:active={selectMode} onclick={toggleSelectMode}>
        {selectMode ? 'Cancel' : 'Select'}
      </button>
    {/if}
  </header>

  {#if records.length === 0}
    <div class="empty-state">
      <svg class="empty-svg" viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="10" y="16" width="36" height="30" rx="2" />
        <line x1="10" y1="24" x2="46" y2="24" />
        <line x1="24" y1="32" x2="32" y2="32" />
      </svg>
      <p>Nothing archived yet. Records you archive rest here — you can bring them back any time.</p>
    </div>
  {:else}
    {#if records.length > 6}
      <div class="search-bar">
        <input
          type="search"
          placeholder="Search artist or title…"
          bind:value={search}
          class="search-input"
        />
      </div>
    {/if}

    {#if visible.length === 0}
      <div class="empty-state">
        <p>No matches for "{search}".</p>
      </div>
    {:else}
      <div class="record-grid">
        {#each visible as record (record.id)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="arch-card"
            class:selecting={selectMode}
            class:selected={selectMode && selectedIds.has(record.id)}
            onclick={(e) => onCardClick(record, e)}
            onkeydown={(e) => onCardKey(record, e)}
            role={selectMode ? 'button' : undefined}
            tabindex={selectMode ? 0 : undefined}
          >
            <div class="cover">
              {#if record.image_url}
                <img src={record.image_url} alt="{record.artist} – {record.title}" loading="lazy" />
              {:else}
                <div class="cover-placeholder">
                  <span class="cover-format-icon">{FORMATS[record.format]?.icon ?? '—'}</span>
                </div>
              {/if}
              <div class="cover-badge">{FORMATS[record.format]?.label ?? record.format}</div>
              {#if selectMode}
                <div class="select-check" class:on={selectedIds.has(record.id)} aria-hidden="true">
                  {#if selectedIds.has(record.id)}✓{/if}
                </div>
              {/if}
            </div>
            <div class="card-body">
              <div class="card-artist">{record.artist}</div>
              <div class="card-title" title={record.title}>{record.title}</div>
              <div class="card-meta">
                {[FORMATS[record.format]?.label ?? record.format, record.year]
                  .filter(Boolean)
                  .join(' · ')}
                {#if record.condition}<span class="card-cond">· {shortCondition(record.condition)}</span>{/if}
              </div>
              {#if !selectMode}
                <button
                  class="unarchive-btn"
                  onclick={(e) => {
                    e.stopPropagation();
                    unarchive(record);
                  }}
                >Unarchive</button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

{#if selectMode && selectedCount > 0}
  <div class="bulk-bar" role="region" aria-label="Bulk archive actions">
    <div class="bulk-count">{selectedCount} selected</div>
    <div class="bulk-actions">
      <button class="bulk-btn" onclick={selectAllVisible}>Select all</button>
      <span class="bulk-sep" aria-hidden="true"></span>
      <button class="bulk-btn" onclick={bulkUnarchive}>Unarchive</button>
      <button class="bulk-btn danger" onclick={bulkPermanentDelete}>Delete permanently</button>
    </div>
  </div>
{/if}

<style>
  .page { padding: 40px 40px 80px; max-width: 1400px; margin: 0 auto; }

  .page-header {
    margin-bottom: 24px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .eyebrow {
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 8px;
  }
  h1 {
    font-family: var(--ff-display);
    font-size: clamp(28px, 4vw, 44px);
    font-weight: 400;
    line-height: 1;
    margin: 0 0 8px;
    color: var(--ink);
  }
  .sub {
    font-family: var(--ff-mono);
    font-size: 11px;
    letter-spacing: 0.05em;
    color: var(--ink-3);
    margin: 0;
  }

  .select-toggle {
    flex-shrink: 0;
    margin-top: 6px;
    background: none;
    border: 1px solid var(--groove);
    color: var(--ink-2);
    font-family: var(--ff-mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 8px 16px;
    border-radius: var(--radius);
    cursor: pointer;
    transition: color var(--t), border-color var(--t), background var(--t);
  }
  .select-toggle:hover { color: var(--ink); border-color: var(--ink-3); }
  .select-toggle.active { color: var(--accent); border-color: var(--accent); }

  .search-bar { margin-bottom: 24px; }
  .search-input {
    width: 100%;
    max-width: 400px;
    padding: 10px 14px;
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

  .record-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 20px;
  }

  .arch-card {
    background: var(--surface);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .arch-card.selecting { cursor: pointer; }
  .arch-card.selected {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .cover { position: relative; aspect-ratio: 1; background: var(--bg-3); overflow: hidden; }
  .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cover-placeholder {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
  }
  .cover-format-icon { font-size: 56px; opacity: 0.4; }
  .cover-badge {
    position: absolute; top: 8px; right: 8px;
    background: var(--overlay); backdrop-filter: blur(4px);
    color: rgba(255, 255, 255, 0.92);
    font-family: var(--ff-mono); font-size: 9px;
    letter-spacing: 0.12em; text-transform: uppercase;
    padding: 3px 8px; border-radius: 99px;
  }
  .select-check {
    position: absolute; top: 8px; left: 8px;
    width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.85);
    background: var(--overlay); backdrop-filter: blur(4px);
    color: #fff; font-size: 13px; font-weight: 700;
    z-index: 2;
  }
  .select-check.on { background: var(--accent); border-color: var(--accent); color: var(--bg); }

  .card-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 4px; }
  .card-artist {
    font-family: var(--ff-mono); font-size: 11px; font-weight: 500;
    letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .card-title {
    font-family: var(--ff-display); font-size: 15px; color: var(--ink);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .card-meta {
    font-family: var(--ff-mono); font-size: 10px; color: var(--ink-3);
    letter-spacing: 0.04em;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .card-cond { color: var(--ink-3); }
  .unarchive-btn {
    margin-top: 8px;
    background: none;
    border: 1px solid var(--groove);
    color: var(--ink-2);
    font-family: var(--ff-mono);
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 8px 12px;
    border-radius: var(--radius);
    cursor: pointer;
    transition: color var(--t), border-color var(--t), background var(--t);
  }
  .unarchive-btn:hover { color: var(--accent); border-color: var(--accent); background: var(--bg-3); }

  .empty-state {
    text-align: center;
    padding: 80px 20px;
    color: var(--ink-3);
  }
  .empty-svg { width: 56px; height: 56px; margin: 0 auto 20px; opacity: 0.5; display: block; }
  .empty-state p {
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 16px;
    max-width: 380px;
    margin: 0 auto;
  }

  /* Bulk action bar */
  .bulk-bar {
    position: fixed;
    left: 50%; bottom: 24px;
    transform: translateX(-50%);
    z-index: 50;
    display: flex; align-items: center; gap: 16px;
    flex-wrap: wrap; justify-content: center;
    max-width: calc(100vw - 32px);
    padding: 12px 16px;
    background: var(--surface);
    border: 1px solid var(--groove);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
  }
  .bulk-count {
    font-family: var(--ff-mono); font-size: 11px; font-weight: 600;
    letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--ink-2); white-space: nowrap;
  }
  .bulk-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .bulk-sep { width: 1px; height: 20px; background: var(--groove); }
  .bulk-btn {
    background: none;
    border: 1px solid var(--groove);
    color: var(--ink-2);
    font-family: var(--ff-mono);
    font-size: 10px; font-weight: 600;
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 7px 12px;
    border-radius: var(--radius);
    cursor: pointer;
    transition: color var(--t), border-color var(--t), background var(--t);
  }
  .bulk-btn:hover { color: var(--ink); border-color: var(--ink-3); background: var(--bg-3); }
  .bulk-btn.danger { color: var(--danger); }
  .bulk-btn.danger:hover { color: var(--danger); border-color: var(--danger); background: var(--bg-3); }

  @media (max-width: 640px) {
    .page { padding: 24px 20px 80px; }
    .record-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 14px; }
  }
</style>
