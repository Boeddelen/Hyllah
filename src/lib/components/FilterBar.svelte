<script>
  /**
   * FilterBar — search + filter + sort controls for a collection page.
   *
   * Driven entirely by the URL: changes navigate to the same page with new
   * query params. The page server-load picks them up and re-renders the grid.
   *
   * Props:
   *  - query: string       — current search query
   *  - formats: string[]   — selected formats
   *  - conditions: string[]— selected conditions
   *  - tags: string[]      — selected tags
   *  - sort: string        — current sort key
   *  - facets: { formats, conditions, tags }  — what the user actually has
   */
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { FORMATS, CONDITIONS } from '$lib/formats';

  let {
    query = '',
    formats = [],
    conditions = [],
    tags = [],
    sort = 'recent',
    facets = { formats: [], conditions: [], tags: [] }
  } = $props();

  // ── Local input mirror so we can debounce the URL update ────
  let searchInput = $state(query);
  let searchTimer;

  // Which dropdown panel is open (only one at a time)
  let openPanel = $state(null); // 'format' | 'condition' | 'tag' | 'sort' | null

  // ── Reactive: re-mirror inputs when the URL prop changes ────
  $effect(() => {
    searchInput = query;
  });

  /** Build a URL with new params, then navigate. */
  function navigate(updates) {
    const url = new URL(page.url);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        url.searchParams.delete(key);
      } else if (Array.isArray(value)) {
        url.searchParams.set(key, value.join(','));
      } else {
        url.searchParams.set(key, value);
      }
    }
    goto(url.pathname + url.search, { keepFocus: true, noScroll: true, replaceState: false });
  }

  // ── Search input handling (debounced 350ms) ────────────────
  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      navigate({ q: searchInput.trim() || null });
    }, 350);
  }

  function onSearchKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchTimer);
      navigate({ q: searchInput.trim() || null });
    } else if (e.key === 'Escape' && searchInput) {
      searchInput = '';
      clearTimeout(searchTimer);
      navigate({ q: null });
    }
  }

  function clearSearch() {
    searchInput = '';
    clearTimeout(searchTimer);
    navigate({ q: null });
  }

  // ── Multi-select toggle helpers ────────────────────────────
  function toggleIn(arr, value) {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  function toggleFormat(code) {
    navigate({ format: toggleIn(formats, code) });
  }
  function toggleCondition(code) {
    navigate({ condition: toggleIn(conditions, code) });
  }
  function toggleTag(tag) {
    navigate({ tag: toggleIn(tags, tag) });
  }

  function setSort(value) {
    navigate({ sort: value === 'recent' ? null : value });
    openPanel = null;
  }

  function clearAll() {
    navigate({ q: null, format: null, condition: null, tag: null, sort: null });
    searchInput = '';
  }

  // ── Derived UI state ───────────────────────────────────────
  let activeFilterCount = $derived(formats.length + conditions.length + tags.length);
  let hasActiveState = $derived(activeFilterCount > 0 || query || sort !== 'recent');

  const SORT_OPTIONS = [
    { value: 'recent',     label: 'Recently added' },
    { value: 'oldest',     label: 'Oldest first' },
    { value: 'artist',     label: 'Artist (A–Z)' },
    { value: 'title',      label: 'Title (A–Z)' },
    { value: 'year-desc',  label: 'Year (newest)' },
    { value: 'year-asc',   label: 'Year (oldest)' },
    { value: 'value-desc', label: 'Value (high)' },
    { value: 'value-asc',  label: 'Value (low)' }
  ];

  function currentSortLabel() {
    return SORT_OPTIONS.find((s) => s.value === sort)?.label ?? 'Recently added';
  }

  function togglePanel(name) {
    openPanel = openPanel === name ? null : name;
  }

  function closePanel() {
    openPanel = null;
  }
</script>

<!-- Close any open panel when clicking outside the filter bar -->
<svelte:document
  onclick={(e) => {
    if (!e.target?.closest('.filter-bar')) openPanel = null;
  }}
/>

<div class="filter-bar">
  <!-- Search input -->
  <div class="search-wrap">
    <span class="search-icon" aria-hidden="true">🔍</span>
    <input
      type="search"
      placeholder="Search by artist, title, label, genre, notes..."
      bind:value={searchInput}
      oninput={onSearchInput}
      onkeydown={onSearchKey}
      autocomplete="off"
      spellcheck="false"
    />
    {#if searchInput}
      <button class="search-clear" onclick={clearSearch} aria-label="Clear search">✕</button>
    {/if}
  </div>

  <!-- Filter pickers -->
  <div class="picker-row">
    <!-- Format -->
    <div class="picker">
      <button
        class="picker-trigger"
        class:has-selection={formats.length > 0}
        onclick={() => togglePanel('format')}
        aria-expanded={openPanel === 'format'}
      >
        Format {formats.length > 0 ? `(${formats.length})` : ''} <span class="caret">▾</span>
      </button>
      {#if openPanel === 'format'}
        <div class="picker-panel">
          {#each facets.formats as code}
            <label class="picker-option">
              <input
                type="checkbox"
                checked={formats.includes(code)}
                onchange={() => toggleFormat(code)}
              />
              <span class="picker-icon">{FORMATS[code]?.icon ?? '🎵'}</span>
              <span>{FORMATS[code]?.label ?? code}</span>
            </label>
          {:else}
            <div class="picker-empty">No formats in this collection yet.</div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Condition -->
    <div class="picker">
      <button
        class="picker-trigger"
        class:has-selection={conditions.length > 0}
        onclick={() => togglePanel('condition')}
        aria-expanded={openPanel === 'condition'}
      >
        Condition {conditions.length > 0 ? `(${conditions.length})` : ''} <span class="caret">▾</span>
      </button>
      {#if openPanel === 'condition'}
        <div class="picker-panel">
          {#each facets.conditions as code}
            <label class="picker-option">
              <input
                type="checkbox"
                checked={conditions.includes(code)}
                onchange={() => toggleCondition(code)}
              />
              <span>{CONDITIONS[code] ?? code}</span>
            </label>
          {:else}
            <div class="picker-empty">No conditions set yet.</div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Tags -->
    <div class="picker">
      <button
        class="picker-trigger"
        class:has-selection={tags.length > 0}
        onclick={() => togglePanel('tag')}
        aria-expanded={openPanel === 'tag'}
      >
        Tags {tags.length > 0 ? `(${tags.length})` : ''} <span class="caret">▾</span>
      </button>
      {#if openPanel === 'tag'}
        <div class="picker-panel picker-panel-wide">
          {#each facets.tags as { tag, count }}
            <label class="picker-option">
              <input
                type="checkbox"
                checked={tags.includes(tag)}
                onchange={() => toggleTag(tag)}
              />
              <span class="tag-row">
                <span class="tag-name">{tag}</span>
                <span class="tag-count">{count}</span>
              </span>
            </label>
          {:else}
            <div class="picker-empty">No tags in this collection yet.</div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Sort -->
    <div class="picker sort-picker">
      <button
        class="picker-trigger"
        onclick={() => togglePanel('sort')}
        aria-expanded={openPanel === 'sort'}
      >
        {currentSortLabel()} <span class="caret">▾</span>
      </button>
      {#if openPanel === 'sort'}
        <div class="picker-panel">
          {#each SORT_OPTIONS as opt}
            <button
              class="picker-option-btn"
              class:active={opt.value === sort}
              onclick={() => setSort(opt.value)}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    {#if hasActiveState}
      <button class="clear-all" onclick={clearAll}>Clear</button>
    {/if}
  </div>
</div>

<style>
  .filter-bar {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 28px;
  }

  /* ── Search input ───────────────────────────────── */
  .search-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  .search-icon {
    position: absolute;
    left: 16px;
    opacity: 0.55;
    font-size: 14px;
    pointer-events: none;
  }
  .search-wrap input {
    width: 100%;
    padding: 13px 40px 13px 44px;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    font-family: var(--ff-display);
    font-size: 15px;
    color: var(--ink);
    transition: border-color var(--t);
  }
  .search-wrap input::-webkit-search-cancel-button { display: none; }
  .search-wrap input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .search-clear {
    position: absolute;
    right: 12px;
    background: none;
    border: none;
    color: var(--ink-3);
    width: 24px;
    height: 24px;
    border-radius: 50%;
    cursor: pointer;
    transition: color var(--t), background var(--t);
  }
  .search-clear:hover {
    color: var(--ink);
    background: var(--bg-3);
  }

  /* ── Picker row ─────────────────────────────────── */
  .picker-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .picker {
    position: relative;
  }

  .picker-trigger {
    padding: 8px 14px;
    background: var(--bg-2);
    border: 1px solid var(--groove);
    border-radius: var(--radius);
    color: var(--ink-2);
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    transition: border-color var(--t), color var(--t);
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .picker-trigger:hover { color: var(--ink); border-color: var(--ink-3); }
  .picker-trigger.has-selection {
    color: var(--accent);
    border-color: var(--accent);
    background: rgba(212, 163, 86, 0.06);
  }
  .caret {
    font-size: 8px;
    opacity: 0.7;
  }

  .sort-picker { margin-left: auto; }

  .picker-panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 50;
    min-width: 200px;
    max-height: 320px;
    overflow-y: auto;
    padding: 6px;
    background: var(--bg-2);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: 0 8px 30px var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .picker-panel-wide { min-width: 240px; }

  .sort-picker .picker-panel {
    left: auto;
    right: 0;
  }

  .picker-option, .picker-option-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: var(--radius);
    cursor: pointer;
    transition: background var(--t);
    font-family: var(--ff-display);
    font-size: 14px;
    color: var(--ink);
    background: none;
    border: none;
    text-align: left;
    width: 100%;
  }
  .picker-option:hover, .picker-option-btn:hover {
    background: var(--bg-3);
  }
  .picker-option-btn.active {
    color: var(--accent);
    background: rgba(212, 163, 86, 0.06);
  }

  .picker-option input[type="checkbox"] {
    margin: 0;
    accent-color: var(--accent);
  }

  .picker-icon {
    font-size: 14px;
    width: 18px;
    text-align: center;
  }

  .tag-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex: 1;
    gap: 12px;
  }
  .tag-name { color: var(--ink); }
  .tag-count {
    font-family: var(--ff-mono);
    font-size: 9px;
    letter-spacing: 0.1em;
    color: var(--ink-3);
  }

  .picker-empty {
    padding: 12px;
    font-family: var(--ff-display);
    font-style: italic;
    font-size: 13px;
    color: var(--ink-3);
    text-align: center;
  }

  .clear-all {
    padding: 8px 14px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius);
    color: var(--ink-3);
    font-family: var(--ff-mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    transition: color var(--t), border-color var(--t);
  }
  .clear-all:hover {
    color: var(--danger);
    border-color: var(--danger);
  }

  @media (max-width: 640px) {
    .picker-trigger { font-size: 9px; padding: 7px 11px; }
    .sort-picker { margin-left: 0; width: 100%; }
    .sort-picker .picker-trigger { width: 100%; justify-content: space-between; }
    .sort-picker .picker-panel { left: 0; right: 0; }
  }
</style>
